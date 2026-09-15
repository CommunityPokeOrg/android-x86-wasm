import type { GuestFrame } from "../emulator/types";
import { averageRegion, luminance, type Rgb } from "./colors";

/**
 * One terminal cell: a glyph plus 24-bit foreground/background colors.
 * In half-block mode `ch` is '▀' (upper half = fg, lower half = bg).
 */
export interface Cell {
  ch: string;
  fg: Rgb;
  bg: Rgb;
}

/** Row-major grid of terminal cells produced by rasterizing a frame. */
export interface CellGrid {
  cols: number;
  rows: number;
  cells: Cell[]; // length === cols * rows, row-major
}

export const UPPER_HALF = "▀";
export const LOWER_HALF = "▄";
export const FULL_BLOCK = "█";

/** Classic luminance ramp, dark -> dense. */
export const ASCII_RAMP = "@%#*+=-:. ";

export type RasterMode = "halfblock" | "ascii";

export interface RasterOptions {
  /**
   * Horizontal downscale factor: how many guest pixels one cell covers.
   * >= 1; higher values produce a lower-resolution (wider) grid.
   */
  sx: number;
  /**
   * Vertical downscale factor: how many guest pixels one HALF-cell covers.
   * A full cell covers 2*sy guest pixels vertically in half-block mode,
   * and cellH pixels in ascii mode.
   */
  sy: number;
}

/**
 * Half-block rasterizer: every terminal cell encodes two stacked guest-pixel
 * regions — the upper half is the glyph '▀' painted in the foreground color,
 * the lower half shows through as the background color. Yields a grid whose
 * vertical resolution is guest.height / (2*sy) and whose horizontal
 * resolution is guest.width / sx.
 */
export function rasterizeHalfBlock(
  frame: GuestFrame,
  { sx = 1, sy = 1 }: Partial<RasterOptions> = {},
): CellGrid {
  const { width, height, data } = frame;
  const cols = Math.max(1, Math.floor(width / sx));
  const rows = Math.max(1, Math.floor(height / (2 * sy)));
  const cells = new Array<Cell>(cols * rows);
  const stride = Math.max(1, Math.floor(Math.min(sx, sy)));

  for (let row = 0; row < rows; row++) {
    const topY0 = row * 2 * sy;
    const botY0 = topY0 + sy;
    for (let col = 0; col < cols; col++) {
      const x0 = col * sx;
      const x1 = x0 + sx;
      const top = averageRegion(data, width, x0, topY0, x1, topY0 + sy, stride);
      const bottom = averageRegion(
        data,
        width,
        x0,
        botY0,
        x1,
        Math.min(botY0 + sy, height),
        stride,
      );
      cells[row * cols + col] = { ch: UPPER_HALF, fg: top, bg: bottom };
    }
  }
  return { cols, rows, cells };
}

/**
 * ASCII luminance fallback: each cell covers sx * cellAspect guest pixels;
 * the glyph is chosen from `ramp` by average luminance and tinted with the
 * region's average color.
 */
export function rasterizeAscii(
  frame: GuestFrame,
  { sx = 2, sy = 2, ramp = ASCII_RAMP }: Partial<RasterOptions> & { ramp?: string } = {},
): CellGrid {
  const { width, height, data } = frame;
  const cols = Math.max(1, Math.floor(width / sx));
  const rows = Math.max(1, Math.floor(height / (2 * sy)));
  const cells = new Array<Cell>(cols * rows);
  const stride = Math.max(1, Math.floor(Math.min(sx, sy) / 2)) || 1;
  const black: Rgb = [0, 0, 0];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const avg = averageRegion(
        data,
        width,
        col * sx,
        row * 2 * sy,
        col * sx + sx,
        row * 2 * sy + 2 * sy,
        stride,
      );
      const lum = luminance(avg) / 255; // 0..1
      const idx = Math.min(
        ramp.length - 1,
        Math.max(0, Math.round((1 - lum) * (ramp.length - 1))),
      );
      cells[row * cols + col] = { ch: ramp[idx], fg: avg, bg: black };
    }
  }
  return { cols, rows, cells };
}

export function rasterize(
  frame: GuestFrame,
  mode: RasterMode,
  opts: Partial<RasterOptions> = {},
): CellGrid {
  return mode === "ascii" ? rasterizeAscii(frame, opts) : rasterizeHalfBlock(frame, opts);
}
