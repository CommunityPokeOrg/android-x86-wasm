/**
 * Emulator-agnostic types. The app talks to an `EmulatorAdapter`, never to v86
 * directly, so the UI keeps working (demo framebuffer) when no guest image or
 * emulator runtime is available.
 */

/** One captured guest video frame: packed RGBA, row-major, top-left origin. */
export interface GuestFrame {
  width: number;
  height: number;
  /** Packed RGBA pixels, length === width * height * 4. */
  data: Uint8ClampedArray;
}

export type EmulatorBackend = "v86" | "demo";

export type EmulatorStatus =
  | "idle" // constructed, nothing loaded yet
  | "loading" // downloading wasm/bios/guest images
  | "ready" // loaded, not executing
  | "running" // executing guest code
  | "paused" // loaded, execution suspended
  | "stopped" // halted
  | "error"; // unrecoverable failure

/** Coarse lifecycle/progress event forwarded to the boot log. */
export interface EmulatorLogEvent {
  level: "info" | "ok" | "warn" | "error";
  message: string;
}

/** Progress of a single file download (wasm, bios, guest image). */
export interface EmulatorProgressEvent {
  fileName: string;
  fileIndex: number;
  fileCount: number;
  loaded: number;
  total: number;
}

/** Pointer event translated into guest screen coordinates. */
export interface GuestPointerEvent {
  /** Guest pixel coordinates (0..width-1 / 0..height-1). */
  x: number;
  y: number;
  type: "move" | "down" | "up";
  /** DOM-style button mask: bit0 left, bit1 right, bit2 middle. */
  buttons: number;
  button?: number;
}

/** Emulator performance counters sampled by the HUD. */
export interface EmulatorStats {
  /** Guest instructions executed per second (estimate). */
  mips: number;
  /** Emulation speed relative to a nominal target (percent). */
  speedPercent: number;
  /** Total guest RAM configured, bytes. */
  ramBytes: number;
  /** Whether guest execution is currently advancing. */
  running: boolean;
}

export interface EmulatorAdapter {
  readonly backend: EmulatorBackend;
  readonly status: EmulatorStatus;

  /** Begin construction + loading. Safe to call once. */
  start(): Promise<void>;
  /** Resume guest execution. */
  run(): Promise<void>;
  /** Suspend guest execution. */
  pause(): Promise<void>;
  /** Hard reset the machine back to power-on. */
  reset(): void;
  /** Tear down and release resources. */
  destroy(): Promise<void>;

  /**
   * Capture the current guest framebuffer. Returns null when no frame is
   * available yet. The returned buffer is a snapshot safe to rasterize.
   */
  captureFrame(): GuestFrame | null;

  /** Guest display size in pixels (may change when the guest sets a mode). */
  displaySize(): { width: number; height: number };

  /** Deliver a pointer event already translated to guest coordinates. */
  sendPointer(ev: GuestPointerEvent): void;

  /** Latest performance counters. */
  stats(): EmulatorStats;

  onLog(cb: (e: EmulatorLogEvent) => void): () => void;
  onProgress(cb: (e: EmulatorProgressEvent) => void): () => void;
  onStatus(cb: (status: EmulatorStatus) => void): () => void;
  /** Fired when the guest changes display resolution. */
  onResize(cb: (size: { width: number; height: number }) => void): () => void;
}

/** Minimal typed event emitter used by the adapters. */
export class Emitter<T> {
  private listeners = new Set<(e: T) => void>();

  subscribe(cb: (e: T) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(e: T): void {
    for (const cb of this.listeners) cb(e);
  }
}
