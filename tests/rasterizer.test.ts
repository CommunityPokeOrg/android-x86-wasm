import { describe, expect, it } from "vitest";
import { makeFrame, solidFrame } from "./helpers";
import {
  ASCII_RAMP,
  rasterizeAscii,
  rasterizeHalfBlock,
  UPPER_HALF,
} from "../src/raster/rasterizer";
import { gridToAnsi } from "../src/raster/canvasRenderer";

describe("rasterizeHalfBlock", () => {
  it("produces cols = width/sx and rows = height/(2*sy)", () => {
    const frame = solidFrame(160, 100, [10, 20, 30]);
    expect(rasterizeHalfBlock(frame, { sx: 1, sy: 1 })).toMatchObject({ cols: 160, rows: 50 });
    expect(rasterizeHalfBlock(frame, { sx: 2, sy: 2 })).toMatchObject({ cols: 80, rows: 25 });
    expect(rasterizeHalfBlock(frame, { sx: 4, sy: 4 })).toMatchObject({ cols: 40, rows: 12 });
  });

  it("encodes top half as fg and bottom half as bg of '▀' cells", () => {
    // Top 2 rows red, bottom 2 rows blue — a 4x4 frame at sy=1.
    const frame = makeFrame(4, 4, (_x, y) => (y < 2 ? [255, 0, 0] : [0, 0, 255]));
    const grid = rasterizeHalfBlock(frame, { sx: 1, sy: 1 });
    expect(grid.cols).toBe(4);
    expect(grid.rows).toBe(2);
    for (const cell of grid.cells) {
      expect(cell.ch).toBe(UPPER_HALF);
    }
    // Row 0: fg=red(top px), bg=red(bottom px of cell covering y=0..2)
    expect(grid.cells[0].fg).toEqual([255, 0, 0]);
    expect(grid.cells[0].bg).toEqual([255, 0, 0]);
    // Row 1 covers y=2..4 -> fg=blue, bg=blue
    expect(grid.cells[4].fg).toEqual([0, 0, 255]);
    expect(grid.cells[4].bg).toEqual([0, 0, 255]);
  });

  it("gives mixed fg/bg when a cell straddles a horizontal edge", () => {
    // 1 column wide: y=0 white, y=1 black => cell fg=white, bg=black.
    const frame = makeFrame(1, 2, (_x, y) => (y === 0 ? [255, 255, 255] : [0, 0, 0]));
    const grid = rasterizeHalfBlock(frame, { sx: 1, sy: 1 });
    expect(grid.cells[0]).toEqual({
      ch: UPPER_HALF,
      fg: [255, 255, 255],
      bg: [0, 0, 0],
    });
  });

  it("handles odd heights by clamping the bottom sample region", () => {
    const frame = solidFrame(8, 5, [50, 60, 70]);
    const grid = rasterizeHalfBlock(frame, { sx: 1, sy: 1 });
    expect(grid.rows).toBe(2); // floor(5/2)
    for (const c of grid.cells) {
      expect(c.fg).toEqual([50, 60, 70]);
      expect(c.bg).toEqual([50, 60, 70]);
    }
  });

  it("downscales horizontally: averages sx neighbors", () => {
    // 4-wide row alternating black/white -> 2 cells of mid-gray.
    const frame = makeFrame(4, 2, (x) => (x % 2 === 0 ? [0, 0, 0] : [255, 255, 255]));
    const grid = rasterizeHalfBlock(frame, { sx: 2, sy: 1 });
    expect(grid.cols).toBe(2);
    for (const c of grid.cells) {
      expect(c.fg[0]).toBeGreaterThan(100);
      expect(c.fg[0]).toBeLessThan(160);
    }
  });
});

describe("rasterizeAscii", () => {
  it("maps white to the densest ramp glyph and black to the sparsest", () => {
    // Terminal-image convention: brighter pixels get more ink.
    const black = rasterizeAscii(solidFrame(4, 4, [0, 0, 0]), { sx: 1, sy: 1 });
    const white = rasterizeAscii(solidFrame(4, 4, [255, 255, 255]), { sx: 1, sy: 1 });
    expect(black.cells[0].ch).toBe(ASCII_RAMP[ASCII_RAMP.length - 1]); // ' '
    expect(white.cells[0].ch).toBe(ASCII_RAMP[0]); // '@'
  });

  it("tints glyphs with the average region color", () => {
    const grid = rasterizeAscii(solidFrame(4, 4, [10, 200, 30]), { sx: 1, sy: 1 });
    expect(grid.cells[0].fg).toEqual([10, 200, 30]);
    expect(grid.cells[0].bg).toEqual([0, 0, 0]);
  });

  it("uses intermediate ramp chars for mid luminance", () => {
    const grid = rasterizeAscii(solidFrame(2, 2, [128, 128, 128]), { sx: 1, sy: 1 });
    const idx = ASCII_RAMP.indexOf(grid.cells[0].ch);
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBeLessThan(ASCII_RAMP.length - 1);
  });
});

describe("gridToAnsi", () => {
  it("emits 24-bit fg/bg escapes around each glyph", () => {
    const frame = makeFrame(1, 2, (_x, y) => (y === 0 ? [255, 0, 0] : [0, 0, 255]));
    const ansi = gridToAnsi(rasterizeHalfBlock(frame, { sx: 1, sy: 1 }));
    expect(ansi).toContain("\u001b");
    expect(ansi).toContain("[38;2;255;0;0m"); // fg = top pixel
    expect(ansi).toContain("[48;2;0;0;255m"); // bg = bottom pixel
    expect(ansi).toContain(UPPER_HALF);
    expect(ansi).toContain("[0m");
  });
});
