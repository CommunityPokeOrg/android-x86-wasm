import type { EmulatorAdapter, GuestPointerEvent } from "../emulator/types";
import type { CellGeometry, GridDims } from "../raster/grid";
import { domPointToGuest } from "../raster/grid";

/**
 * Translates pointer/touch gestures on the terminal canvas into guest
 * mouse events via the emulator adapter.
 *
 * Pointer Events unify mouse + touch; setPointerCapture keeps drags tracked
 * outside the element. `isPrimary` filters multi-touch to a single pointer —
 * the emulated hardware exposes one mouse/digitizer.
 */
export class PointerTranslator {
  private active = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private adapter: EmulatorAdapter,
    private getDims: () => GridDims,
    private getGeo: () => CellGeometry,
  ) {
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.style.touchAction = "none"; // we handle touch ourselves
  }

  destroy() {
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
  }

  private translate(e: PointerEvent, type: GuestPointerEvent["type"]) {
    const { width, height } = this.adapter.displaySize();
    const p = domPointToGuest(
      e.clientX,
      e.clientY,
      this.canvas.getBoundingClientRect(),
      this.getDims(),
      this.getGeo(),
      width,
      height,
    );
    this.adapter.sendPointer({
      x: p.x,
      y: p.y,
      type,
      buttons: e.buttons,
      button: e.button,
    });
  }

  private onDown = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    this.active = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.translate(e, "down");
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    // Hover-move only when supported; drags always report.
    this.translate(e, "move");
  };

  private onUp = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    this.translate(e, "up");
    this.active = false;
    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
  };

  get dragging(): boolean {
    return this.active;
  }
}
