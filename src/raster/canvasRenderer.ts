import { rgbEquals, rgbToCss, ansiFg, ansiBg, ANSI_RESET } from "./colors";
import { FULL_BLOCK, LOWER_HALF, UPPER_HALF, type CellGrid } from "./rasterizer";

/**
 * Fast canvas renderer for CellGrids.
 *
 * Block glyphs (▀, ▄, █) are drawn as fillRect runs — visually identical to
 * their Unicode rendering (▀ == top-half fg over bg) but immune to font
 * metric drift and much faster. Other glyphs (ASCII mode) are drawn with
 * fillText, batched into runs sharing a foreground color, with the canvas
 * transform horizontally compressing the monospace advance onto cell width.
 */
export class CanvasCellRenderer {
  private ctx: CanvasRenderingContext2D;
  private cellW = 8;
  private cellH = 16;
  private dpr = 1;
  private glyphScaleX = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    this.ctx = ctx;
  }

  /**
   * Resize the canvas so `grid` fits `cssWidth` CSS pixels wide; cells render
   * at a 1:2 (w:h) ratio, matching both half-block geometry and terminal
   * aspect. Returns the CSS pixel size of one cell.
   */
  resizeFor(grid: CellGrid, cssWidth: number): { cellW: number; cellH: number } {
    const cellW = cssWidth / grid.cols;
    const cellH = cellW * 2;
    this.cellW = cellW;
    this.cellH = cellH;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cellH * grid.rows}px`;
    this.canvas.width = Math.max(1, Math.round(cssWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.round(cellH * grid.rows * this.dpr));

    // Fit a monospace glyph's advance onto cellW: measure an average wide
    // glyph and derive the horizontal compression factor.
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.font = `${cellH}px "JetBrains Mono", Menlo, Consolas, monospace`;
    const advance = this.ctx.measureText("M").width || cellW;
    this.glyphScaleX = cellW / advance;
    return { cellW, cellH };
  }

  render(grid: CellGrid): void {
    const { cols, rows, cells } = grid;
    const { ctx, cellW, cellH, dpr } = this;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cols * cellW, rows * cellH);

    // Pass 1: background runs (only painted when bg is non-black).
    for (let row = 0; row < rows; row++) {
      const base = row * cols;
      let runStart = 0;
      for (let col = 1; col <= cols; col++) {
        const done =
          col === cols || !rgbEquals(cells[base + col].bg, cells[base + runStart].bg);
        if (!done) continue;
        const bg = cells[base + runStart].bg;
        if (bg[0] || bg[1] || bg[2]) {
          ctx.fillStyle = rgbToCss(bg);
          ctx.fillRect(runStart * cellW, row * cellH, (col - runStart) * cellW, cellH);
        }
        runStart = col;
      }
    }

    // Pass 2: glyph runs — rects for block glyphs, text for the rest.
    ctx.font = `${cellH}px "JetBrains Mono", Menlo, Consolas, monospace`;
    ctx.textBaseline = "middle";
    for (let row = 0; row < rows; row++) {
      const base = row * cols;
      let col = 0;
      while (col < cols) {
        const cell = cells[base + col];
        const fg = cell.fg;
        // Collect the run of same-fg, same-shape-class cells.
        let end = col + 1;
        const isBlock =
          cell.ch === UPPER_HALF || cell.ch === LOWER_HALF || cell.ch === FULL_BLOCK;
        while (
          end < cols &&
          rgbEquals(cells[base + end].fg, fg) &&
          (cells[base + end].ch === UPPER_HALF ||
            cells[base + end].ch === LOWER_HALF ||
            cells[base + end].ch === FULL_BLOCK) === isBlock
        ) {
          end++;
        }

        ctx.fillStyle = rgbToCss(fg);
        const y0 = row * cellH;
        if (isBlock) {
          for (let c = col; c < end; c++) {
            const ch = cells[base + c].ch;
            const x = c * cellW;
            if (ch === UPPER_HALF) {
              ctx.fillRect(x, y0, cellW, cellH / 2);
            } else if (ch === LOWER_HALF) {
              ctx.fillRect(x, y0 + cellH / 2, cellW, cellH / 2);
            } else {
              ctx.fillRect(x, y0, cellW, cellH);
            }
          }
        } else {
          let text = "";
          for (let c = col; c < end; c++) text += cells[base + c].ch;
          // Compress horizontal advance onto cell width via the transform.
          ctx.setTransform(dpr * this.glyphScaleX, 0, 0, dpr, 0, 0);
          ctx.fillText(
            text,
            (col * cellW) / this.glyphScaleX,
            y0 + cellH / 2,
          );
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        col = end;
      }
    }
  }
}

/**
 * Serialize a grid to ANSI-truecolor text — the exact byte stream a real
 * terminal would use to display the same image with '▀'/'▄' cells and
 * 24-bit colors. Canonical definition of the ANSI output; used by tests
 * and available for debugging/copy-paste.
 */
export function gridToAnsi(grid: CellGrid): string {
  const lines: string[] = [];
  for (let row = 0; row < grid.rows; row++) {
    let line = "";
    let lastFg = "";
    let lastBg = "";
    const base = row * grid.cols;
    for (let col = 0; col < grid.cols; col++) {
      const c = grid.cells[base + col];
      const fg = ansiFg(c.fg);
      const bg = ansiBg(c.bg);
      if (fg !== lastFg) line += fg;
      if (bg !== lastBg) line += bg;
      line += c.ch;
      lastFg = fg;
      lastBg = bg;
    }
    lines.push(line + ANSI_RESET);
  }
  return lines.join("\n");
}
