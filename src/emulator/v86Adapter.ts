import type { V86, V86Image, V86Options } from "v86";
import { makeBootSectorImage } from "../guest/bootsector";
import type { VmConfig } from "./config";
import {
  Emitter,
  type EmulatorAdapter,
  type EmulatorBackend,
  type EmulatorLogEvent,
  type EmulatorProgressEvent,
  type EmulatorStats,
  type EmulatorStatus,
  type GuestFrame,
  type GuestPointerEvent,
} from "./types";

/**
 * Adapter over copy/v86's V86 emulator (x86 PC JIT compiled to WebAssembly).
 *
 * Framebuffer tap: v86 is configured with `use_graphical_text` so BOTH text
 * and graphics modes render into a single canvas inside a hidden container.
 * captureFrame() read-backs that canvas with getImageData — one tap covers
 * SeaBIOS output, boot consoles and Android's framebuffer alike.
 *
 * Pointer: input events are re-dispatched as synthetic DOM mouse events on
 * v86's screen container at the corresponding position, so v86's own PS/2
 * relative / absolute-tablet translation applies unchanged.
 */
export class V86Adapter implements EmulatorAdapter {
  readonly backend: EmulatorBackend = "v86";

  private emu: V86 | null = null;
  private container: HTMLDivElement;
  private screenCanvas: HTMLCanvasElement | null = null;
  private screenCtx: CanvasRenderingContext2D | null = null;
  private statusValue: EmulatorStatus = "idle";
  private lastCounter = 0;
  private lastSample = 0;
  private cachedStats: EmulatorStats;
  private size = { width: 720, height: 400 };
  // V86's constructor returns before its wasm instance and internal CPU
  // object exist. emu.run()/restart()/destroy() dereference that object
  // unconditionally, so every entry point must wait for this promise,
  // resolved on emulator-ready / emulator-loaded.
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((err: Error) => void) | null = null;
  private readyFlag = false;

  private logEmitter = new Emitter<EmulatorLogEvent>();
  private progressEmitter = new Emitter<EmulatorProgressEvent>();
  private statusEmitter = new Emitter<EmulatorStatus>();
  private resizeEmitter = new Emitter<{ width: number; height: number }>();

  constructor(private config: VmConfig) {
    this.cachedStats = {
      mips: 0,
      speedPercent: 0,
      ramBytes: config.memoryMiB * 1024 * 1024,
      running: false,
    };
    // Hidden host container for v86's own screen DOM. Kept laid-out but
    // offscreen so its canvas always renders and its bounding rect stays
    // usable for synthetic pointer events.
    this.container = document.createElement("div");
    this.container.className = "v86-screen-host";
    document.body.appendChild(this.container);
  }

  private log(level: EmulatorLogEvent["level"], message: string) {
    this.logEmitter.emit({ level, message });
  }

  private setStatus(s: EmulatorStatus) {
    this.statusValue = s;
    this.statusEmitter.emit(s);
  }

  get status(): EmulatorStatus {
    return this.statusValue;
  }

  async start(): Promise<void> {
    if (this.emu) return;
    const { config } = this;
    this.setStatus("loading");
    this.log("info", "SeaPoke BIOS v1.6 — POST start");
    this.log("info", `Memory test: ${config.memoryMiB} MiB OK`);
    this.log("info", `Fetching v86 wasm: ${config.wasmUrl}`);

    // Lazy-load the ~500 KB emulator runtime only when a real guest is
    // configured — demo mode never pays for it.
    const { V86 } = await import("v86");

    const options: V86Options = {
      wasm_path: config.wasmUrl,
      memory_size: config.memoryMiB * 1024 * 1024,
      vga_memory_size: 8 * 1024 * 1024,
      screen: {
        container: this.container,
        use_graphical_text: true,
      },
      bios: { url: config.biosUrl },
      vga_bios: { url: config.vgaBiosUrl },
      autostart: false,
      // We route pointer input ourselves through synthetic mouse events.
      disable_keyboard: false,
      disable_mouse: false,
      disable_speaker: true,
      acpi: false,
      // boot_order is left unset: v86 derives it from the configured device
      // (fda → floppy first, hda → disk first, else CD-ROM first). SeaBIOS
      // reads the nibbles least-significant-first, so an explicit 0x123
      // would try the CD-ROM before the floppy.
    };

    const img = config.guestImage;
    if (img.kind === "bootsector") {
      options.fda = { buffer: makeBootSectorImage() };
      this.log("info", "Floppy: built-in 512-byte boot sector (offline demo)");
    } else if (img.kind !== "none" && img.url) {
      const image = await this.resolveImage(img.url, img.streaming);
      if (img.kind === "cdrom") {
        options.cdrom = image;
        this.log("info", `IDE1 secondary (CD-ROM): ${img.url}`);
      } else if (img.kind === "hda") {
        options.hda = image;
        this.log("info", `IDE0 master (disk): ${img.url}`);
      } else if (img.kind === "linux") {
        options.bzimage = image;
        if (img.initrdUrl) {
          options.initrd = await this.resolveImage(img.initrdUrl, false);
          this.log("info", `initrd: ${img.initrdUrl}`);
        }
        options.cmdline = img.cmdline ?? "console=ttyS0 quiet";
        this.log("info", `bzImage: ${img.url}`);
      }
    } else {
      this.log("warn", "No guest image configured — emulator will boot to SeaBIOS only");
    }

    this.readyFlag = false;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    try {
      this.emu = new V86(options);
    } catch (e) {
      this.setStatus("error");
      this.log("error", `Failed to construct V86: ${(e as Error).message}`);
      throw e;
    }

    this.wireEvents();
  }

  private markReady() {
    if (this.readyFlag) return;
    this.readyFlag = true;
    this.readyResolve?.();
  }

  private failReady(err: Error) {
    this.readyReject?.(err);
    this.readyResolve = null;
    this.readyReject = null;
  }

  /** Build a V86Image, resolving Content-Length for Range-request mode. */
  private async resolveImage(url: string, streaming: boolean): Promise<V86Image> {
    if (!streaming) return { url };
    try {
      const res = await fetch(url, { method: "HEAD" });
      const size = Number(res.headers.get("content-length") ?? 0);
      if (size > 0) {
        this.log("ok", `Range-streaming enabled (${(size / 1e6).toFixed(1)} MB)`);
        return { url, async: true, size };
      }
      this.log("warn", "HEAD returned no length — falling back to full download");
      return { url };
    } catch {
      this.log("warn", "HEAD request failed — falling back to full download");
      return { url };
    }
  }

  private wireEvents() {
    const emu = this.emu!;

    emu.add_listener("emulator-loaded", () => {
      this.markReady();
      this.setStatus("ready");
      this.log("ok", "v86 runtime loaded — machine ready");
    });
    emu.add_listener("emulator-ready", () => {
      this.markReady();
      this.setStatus("ready");
      this.log("ok", "Guest firmware initialized, awaiting start");
    });
    emu.add_listener("emulator-started", () => {
      this.setStatus("running");
      this.lastCounter = this.emu!.get_instruction_counter();
      this.lastSample = performance.now();
      this.log("ok", "CPU executing — guest is live");
    });
    emu.add_listener("emulator-stopped", () => {
      this.setStatus("stopped");
      this.log("info", "Emulation stopped");
    });
    emu.add_listener("download-progress", (p) => {
      this.progressEmitter.emit({
        fileName: p.file_name,
        fileIndex: p.file_index,
        fileCount: p.file_count,
        loaded: p.loaded,
        total: p.total,
      });
    });
    emu.add_listener("download-error", (e) => {
      const msg = `Download failed: ${e.file_name ?? "unknown file"}`;
      this.log("error", msg);
      this.failReady(new Error(msg));
      this.setStatus("error");
    });
    emu.add_listener("screen-set-size", ([w, h]) => {
      this.size = { width: w, height: h };
      this.screenCanvas = null; // canvas may be recreated
      this.resizeEmitter.emit(this.size);
      this.log("info", `Guest display mode: ${w}x${h}`);
    });
    emu.add_listener("mouse-enable", (on) => {
      this.log("info", on ? "Guest enabled PS/2 mouse" : "Guest released mouse");
    });
  }

  async run(): Promise<void> {
    if (!this.emu) await this.start();
    if (this.readyPromise && !this.readyFlag) {
      this.log("info", "Waiting for guest firmware…");
      await this.readyPromise;
    }
    await this.emu!.run();
  }

  async pause(): Promise<void> {
    if (!this.emu) return;
    await this.emu.stop();
    this.setStatus("paused");
  }

  reset(): void {
    if (!this.emu || !this.readyFlag) return;
    this.log("info", "RESET — machine power-cycled");
    this.emu.restart();
    this.setStatus("running");
  }

  async destroy(): Promise<void> {
    const emu = this.emu;
    this.emu = null;
    if (emu) {
      // destroy() dereferences the internal CPU object; it throws when the
      // emulator never finished initializing (e.g. destroyed mid-download).
      try {
        await emu.destroy();
      } catch {
        /* partially-initialized emulator */;
      }
    }
    this.readyPromise = null;
    this.readyFlag = false;
    this.container.remove();
    this.setStatus("idle");
  }

  private findScreenCanvas(): HTMLCanvasElement | null {
    if (this.screenCanvas?.isConnected) return this.screenCanvas;
    const c = this.container.querySelector("canvas");
    this.screenCanvas = c;
    this.screenCtx = c ? c.getContext("2d") : null;
    return c;
  }

  captureFrame(): GuestFrame | null {
    const canvas = this.findScreenCanvas();
    if (!canvas || !this.screenCtx) return null;
    const { width, height } = canvas;
    if (!width || !height) return null;
    const img = this.screenCtx.getImageData(0, 0, width, height);
    this.size = { width, height };
    return { width, height, data: img.data };
  }

  displaySize(): { width: number; height: number } {
    const canvas = this.findScreenCanvas();
    if (canvas) return { width: canvas.width, height: canvas.height };
    return this.size;
  }

  /**
   * Re-dispatch as synthetic DOM mouse events onto v86's screen container at
   * the matching position. v86's own mouse adapter performs the PS/2/absolute
   * translation, so this works for both relative and tablet guests.
   */
  sendPointer(ev: GuestPointerEvent): void {
    const target = this.findScreenCanvas() ?? this.container;
    const rect = target.getBoundingClientRect();
    const { width, height } = this.displaySize();
    const clientX = rect.left + (ev.x / Math.max(1, width)) * rect.width;
    const clientY = rect.top + (ev.y / Math.max(1, height)) * rect.height;

    const type =
      ev.type === "down" ? "mousedown" : ev.type === "up" ? "mouseup" : "mousemove";
    const dom = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      buttons: ev.buttons,
      button: ev.button ?? 0,
    });
    // bubbles:true propagates to document, where v86 tracks drags that leave
    // the screen canvas.
    target.dispatchEvent(dom);
  }

  stats(): EmulatorStats {
    const now = performance.now();
    if (this.emu && this.status === "running" && now - this.lastSample > 500) {
      const counter = this.emu.get_instruction_counter();
      const ips = ((counter - this.lastCounter) / (now - this.lastSample)) * 1000;
      this.cachedStats = {
        ...this.cachedStats,
        mips: ips / 1e6,
        // 100% ~= the speed of a modest real Pentium-era machine (~100 MIPS).
        speedPercent: Math.min(999, (ips / 1e8) * 100),
        running: true,
      };
      this.lastCounter = counter;
      this.lastSample = now;
    } else {
      this.cachedStats = { ...this.cachedStats, running: this.status === "running" };
    }
    return this.cachedStats;
  }

  onLog = (cb: (e: EmulatorLogEvent) => void) => this.logEmitter.subscribe(cb);
  onProgress = (cb: (e: EmulatorProgressEvent) => void) => this.progressEmitter.subscribe(cb);
  onStatus = (cb: (s: EmulatorStatus) => void) => this.statusEmitter.subscribe(cb);
  onResize = (cb: (s: { width: number; height: number }) => void) => this.resizeEmitter.subscribe(cb);
}
