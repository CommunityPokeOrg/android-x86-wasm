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

const DEMO_W = 320;
const DEMO_H = 200;

/**
 * Deterministic demo framebuffer. Generates an animated scene — scanline
 * color bars, a bouncing "ANDROID" badge, a plasma backdrop and a cursor
 * sprite — so the Unicode half-block rasterizer, pointer translation and HUD
 * are all visibly exercised without any guest image or emulator runtime.
 *
 * The UI always labels this mode clearly; it never claims a guest OS booted.
 */
export class DemoAdapter implements EmulatorAdapter {
  readonly backend: EmulatorBackend = "demo";

  private statusValue: EmulatorStatus = "idle";
  private frame: GuestFrame;
  private t = 0;
  private rafId = 0;
  private cursor = { x: DEMO_W / 2, y: DEMO_H / 2, down: false };
  private startedAt = 0;

  private logEmitter = new Emitter<EmulatorLogEvent>();
  private progressEmitter = new Emitter<EmulatorProgressEvent>();
  private statusEmitter = new Emitter<EmulatorStatus>();
  private resizeEmitter = new Emitter<{ width: number; height: number }>();

  constructor(private ramMiB = 384) {
    this.frame = {
      width: DEMO_W,
      height: DEMO_H,
      data: new Uint8ClampedArray(DEMO_W * DEMO_H * 4),
    };
  }

  get status(): EmulatorStatus {
    return this.statusValue;
  }

  private setStatus(s: EmulatorStatus) {
    this.statusValue = s;
    this.statusEmitter.emit(s);
  }

  private log(level: EmulatorLogEvent["level"], message: string) {
    this.logEmitter.emit({ level, message });
  }

  async start(): Promise<void> {
    this.setStatus("loading");
    this.log("info", "SeaPoke BIOS v1.6 — POST start");
    this.log("info", `Memory test: ${this.ramMiB} MiB OK`);
    this.log("warn", "No guest image configured — DEMO framebuffer engaged");
    this.log("info", "Demo: animated 320x200 RGBA scene, deterministic");
    // Simulate a short init delay so the boot log reads naturally.
    await new Promise((r) => setTimeout(r, 350));
    this.setStatus("ready");
    this.log("ok", "Demo framebuffer ready — press START");
  }

  async run(): Promise<void> {
    if (this.statusValue === "idle") await this.start();
    if (this.statusValue === "running") return;
    this.startedAt = performance.now();
    this.setStatus("running");
    this.log("ok", "Demo framebuffer running");
    const tick = () => {
      if (this.statusValue !== "running") return;
      this.t += 1;
      this.renderFrame();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  async pause(): Promise<void> {
    if (this.statusValue !== "running") return;
    cancelAnimationFrame(this.rafId);
    this.setStatus("paused");
    this.log("info", "Demo paused");
  }

  reset(): void {
    this.t = 0;
    this.log("info", "RESET — demo scene restarted");
  }

  async destroy(): Promise<void> {
    cancelAnimationFrame(this.rafId);
    this.setStatus("idle");
  }

  /** Deterministic per-pixel scene. t is the frame counter. */
  private renderFrame(): void {
    const { data } = this.frame;
    const t = this.t;
    const cx = DEMO_W / 2 + Math.sin(t * 0.05) * 100;
    const cy = DEMO_H / 2 + Math.cos(t * 0.037) * 60;

    for (let y = 0; y < DEMO_H; y++) {
      // Animated horizontal gradient bands.
      const band = Math.floor(y / 25);
      for (let x = 0; x < DEMO_W; x++) {
        const i = (y * DEMO_W + x) * 4;
        // Plasma-ish base: sines of x, y and time.
        const v =
          Math.sin(x * 0.045 + t * 0.07) +
          Math.sin(y * 0.06 - t * 0.05) +
          Math.sin((x + y) * 0.03 + t * 0.02);
        const n = (v + 3) / 6; // 0..1
        let r = Math.floor(20 + n * 60);
        let g = Math.floor(8 + n * 120 + band * 8);
        let b = Math.floor(30 + n * 90);

        // Bouncing badge rectangle.
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy < 900) {
          r = 200;
          g = 235;
          b = 80;
        }
        // Vertical scanline shimmer.
        if ((y + t) % 7 === 0) {
          r = Math.min(255, r + 40);
          g = Math.min(255, g + 40);
        }
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }

    // Cursor sprite: small bright crosshair.
    const { x: px, y: py, down } = this.cursor;
    const rad = down ? 5 : 3;
    for (let y = Math.max(0, py - rad); y <= Math.min(DEMO_H - 1, py + rad); y++) {
      for (let x = Math.max(0, px - rad); x <= Math.min(DEMO_W - 1, px + rad); x++) {
        const i = (y * DEMO_W + x) * 4;
        data[i] = 255;
        data[i + 1] = down ? 60 : 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
  }

  captureFrame(): GuestFrame | null {
    if (this.statusValue === "running" || this.statusValue === "paused") {
      return this.frame;
    }
    return null;
  }

  displaySize(): { width: number; height: number } {
    return { width: DEMO_W, height: DEMO_H };
  }

  sendPointer(ev: GuestPointerEvent): void {
    this.cursor.x = Math.max(0, Math.min(DEMO_W - 1, Math.round(ev.x)));
    this.cursor.y = Math.max(0, Math.min(DEMO_H - 1, Math.round(ev.y)));
    this.cursor.down = ev.type === "down" || (ev.type === "move" && ev.buttons !== 0);
    // One extra render so the cursor feels responsive even between rAFs.
    if (this.statusValue === "running") this.renderFrame();
  }

  stats(): EmulatorStats {
    const running = this.statusValue === "running";
    const elapsed = running ? (performance.now() - this.startedAt) / 1000 : 0;
    return {
      // Simulated figures that drift gently — clearly marked DEMO in the UI.
      mips: running ? 42 + Math.sin(elapsed * 0.8) * 9 : 0,
      speedPercent: running ? 38 + Math.sin(elapsed * 0.5) * 6 : 0,
      ramBytes: this.ramMiB * 1024 * 1024,
      running,
    };
  }

  onLog = (cb: (e: EmulatorLogEvent) => void) => this.logEmitter.subscribe(cb);
  onProgress = (cb: (e: EmulatorProgressEvent) => void) => this.progressEmitter.subscribe(cb);
  onStatus = (cb: (s: EmulatorStatus) => void) => this.statusEmitter.subscribe(cb);
  onResize = (cb: (s: { width: number; height: number }) => void) => this.resizeEmitter.subscribe(cb);
}
