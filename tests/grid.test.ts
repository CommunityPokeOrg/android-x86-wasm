import { describe, expect, it } from "vitest";
import {
  cellToGuest,
  domPointToCell,
  domPointToGuest,
  gridDimsFor,
  guestToCell,
} from "../src/raster/grid";

const GEO = { sx: 2, sy: 2 }; // cell = 2 guest px wide, 4 guest px tall

describe("gridDimsFor", () => {
  it("computes cols = floor(w/sx), rows = floor(h/(2*sy))", () => {
    expect(gridDimsFor(640, 480, GEO)).toEqual({ cols: 320, rows: 120 });
    expect(gridDimsFor(320, 200, { sx: 1, sy: 1 })).toEqual({ cols: 320, rows: 100 });
  });

  it("never returns zero-size grids", () => {
    expect(gridDimsFor(1, 1, { sx: 8, sy: 8 })).toEqual({ cols: 1, rows: 1 });
  });
});

describe("cell <-> guest translation", () => {
  it("cellToGuest maps cell centers with default fractions", () => {
    expect(cellToGuest(0, 0, GEO)).toEqual({ x: 1, y: 2 });
    expect(cellToGuest(3, 2, GEO)).toEqual({ x: 7, y: 10 });
  });

  it("cellToGuest respects fractional offsets", () => {
    expect(cellToGuest(1, 1, GEO, 0, 0)).toEqual({ x: 2, y: 4 });
    expect(cellToGuest(1, 1, GEO, 1, 1)).toEqual({ x: 4, y: 8 });
  });

  it("guestToCell inverts cellToGuest for cell centers", () => {
    for (const [col, row] of [[0, 0], [5, 9], [17, 33]]) {
      const p = cellToGuest(col, row, GEO);
      expect(guestToCell(p.x, p.y, GEO)).toEqual({ col, row });
    }
  });
});

describe("domPointToCell", () => {
  const rect = { left: 100, top: 50, width: 640, height: 480 };
  const dims = { cols: 64, rows: 48 };

  it("maps the top-left corner to cell (0,0)", () => {
    expect(domPointToCell(100, 50, rect, dims)).toEqual({ col: 0, row: 0 });
  });

  it("maps the bottom-right corner to the last cell", () => {
    const c = domPointToCell(739, 529, rect, dims);
    expect(c).toEqual({ col: 63, row: 47 });
  });

  it("maps interior points to the correct cell", () => {
    // cell width 10px, height 10px in this fixture.
    expect(domPointToCell(115, 55, rect, dims)).toEqual({ col: 1, row: 0 });
    expect(domPointToCell(335, 255, rect, dims)).toEqual({ col: 23, row: 20 });
  });

  it("clamps points outside the rect", () => {
    expect(domPointToCell(0, 0, rect, dims)).toEqual({ col: 0, row: 0 });
    expect(domPointToCell(5000, 5000, rect, dims)).toEqual({ col: 63, row: 47 });
  });
});

describe("domPointToGuest", () => {
  const rect = { left: 0, top: 0, width: 320, height: 200 };
  const dims = { cols: 160, rows: 50 }; // 2x4 css px per cell
  const geo = { sx: 2, sy: 2 }; // cell = 2x4 guest px -> guest is 320x200

  it("is identity-scale here: cell (c,r) center -> guest (2c+1, 4r+2)", () => {
    const p = domPointToGuest(11, 10, rect, dims, geo, 320, 200);
    // css 11,10 -> col 5, row 2 -> guest x in [10,12), y in [8,12)
    expect(p.col).toBe(5);
    expect(p.row).toBe(2);
    expect(p.x).toBeGreaterThanOrEqual(10);
    expect(p.x).toBeLessThan(12);
    expect(p.y).toBeGreaterThanOrEqual(8);
    expect(p.y).toBeLessThan(12);
  });

  it("round-trips guest pixels through cells", () => {
    const cell = guestToCell(123, 77, geo);
    const p = cellToGuest(cell.col, cell.row, geo);
    const c2 = guestToCell(p.x, p.y, geo);
    expect(c2).toEqual(cell);
  });
});
