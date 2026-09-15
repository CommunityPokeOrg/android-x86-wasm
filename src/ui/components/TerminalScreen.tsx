import { useEffect, useRef } from "react";
import type { EmulatorAdapter } from "../../emulator/types";
import type { CellGeometry } from "../../raster/grid";
import { gridDimsFor } from "../../raster/grid";
import { rasterize, type CellGrid, type RasterMode } from "../../raster/rasterizer";
import { CanvasCellRenderer } from "../../raster/canvasRenderer";
import { PointerTranslator } from "../../input/pointer";

/**
 * Terminal canvas: taps the emulator framebuffer each animation frame,
 * rasterizes it to a Unicode cell grid and paints it. Pointer gestures are
 * translated back to guest coordinates through the adapter.
 */
export function TerminalScreen({
  adapter,
  mode,
  geo,
  onFps,
}: {
  adapter: EmulatorAdapter;
  mode: RasterMode;
  geo: CellGeometry;
  onFps: (fps: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ adapter, mode, geo });
  stateRef.current = { adapter, mode, geo };
  const dimsRef = useRef({ cols: 1, rows: 1 });
  const gridRef = useRef<CellGrid | null>(null);
  const rendererRef = useRef<CanvasCellRenderer | null>(null);

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current!;
    if (!rendererRef.current) rendererRef.current = new CanvasCellRenderer(canvas);
    const renderer = rendererRef.current;
    let raf = 0;
    let frames = 0;
    let lastFpsSample = performance.now();

    const loop = () => {
      const { adapter, mode, geo } = stateRef.current;
      const frame = adapter.captureFrame();
      if (frame) {
        const dims = gridDimsFor(frame.width, frame.height, geo);
        dimsRef.current = dims;
        const prev = gridRef.current;
        const cssWidth = wrapRef.current?.clientWidth ?? 640;
        if (!prev || prev.cols !== dims.cols || prev.rows !== dims.rows) {
          const probe: CellGrid = {
            cols: dims.cols,
            rows: dims.rows,
            cells: [],
          };
          renderer.resizeFor(probe, cssWidth);
        }
        const grid = rasterize(frame, mode, geo);
        gridRef.current = grid;
        renderer.render(grid);
      }
      frames++;
      const now = performance.now();
      if (now - lastFpsSample >= 1000) {
        onFps((frames * 1000) / (now - lastFpsSample));
        frames = 0;
        lastFpsSample = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onFps]);

  // Re-fit canvas when the wrapper resizes or the mode/geometry changes.
  useEffect(() => {
    const wrap = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const grid = gridRef.current;
      if (grid && rendererRef.current) {
        rendererRef.current.resizeFor(grid, wrap.clientWidth);
      }
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [mode, geo]);

  // Pointer translation.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const translator = new PointerTranslator(
      canvas,
      stateRef.current.adapter,
      () => dimsRef.current,
      () => stateRef.current.geo,
    );
    return () => translator.destroy();
  }, [adapter]);

  return (
    <div className="terminal-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="terminal-canvas" />
      <div className="scanlines" aria-hidden />
    </div>
  );
}
