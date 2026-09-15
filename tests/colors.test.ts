import { describe, expect, it } from "vitest";
import {
  ansiBg,
  ansiFg,
  ANSI_RESET,
  averageRegion,
  luminance,
  rgbToCss,
} from "../src/raster/colors";
import { makeFrame, solidFrame } from "./helpers";

describe("color conversion", () => {
  it("rgbToCss formats a triple", () => {
    expect(rgbToCss([1, 2, 3])).toBe("rgb(1,2,3)");
    expect(rgbToCss([255, 255, 255])).toBe("rgb(255,255,255)");
  });

  it("ansiFg emits a 24-bit foreground escape", () => {
    expect(ansiFg([255, 128, 0])).toBe("\u001b[38;2;255;128;0m");
  });

  it("ansiBg emits a 24-bit background escape", () => {
    expect(ansiBg([0, 32, 255])).toBe("\u001b[48;2;0;32;255m");
  });

  it("ANSI_RESET resets attributes", () => {
    expect(ANSI_RESET).toBe("\u001b[0m");
  });

  it("luminance weights green most (BT.601)", () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(255, 0);
    expect(luminance([0, 0, 0])).toBe(0);
    const green = luminance([0, 255, 0]);
    const red = luminance([255, 0, 0]);
    const blue = luminance([0, 0, 255]);
    expect(green).toBeGreaterThan(red);
    expect(red).toBeGreaterThan(blue);
  });
});

describe("averageRegion", () => {
  it("averages a solid frame to that color", () => {
    const f = solidFrame(8, 8, [40, 80, 120]);
    expect(averageRegion(f.data, 8, 0, 0, 8, 8)).toEqual([40, 80, 120]);
  });

  it("averages only the requested region", () => {
    // Left half red, right half blue.
    const f = makeFrame(4, 1, (x) => (x < 2 ? [255, 0, 0] : [0, 0, 255]));
    expect(averageRegion(f.data, 4, 0, 0, 2, 1)).toEqual([255, 0, 0]);
    expect(averageRegion(f.data, 4, 2, 0, 4, 1)).toEqual([0, 0, 255]);
  });

  it("produces mid-gray averaging black and white", () => {
    const f = makeFrame(2, 1, (x) => (x === 0 ? [0, 0, 0] : [255, 255, 255]));
    const [r, g, b] = averageRegion(f.data, 2, 0, 0, 2, 1);
    expect(r).toBe(128);
    expect(g).toBe(128);
    expect(b).toBe(128);
  });

  it("clamps out-of-bounds regions to the frame", () => {
    const f = solidFrame(4, 4, [9, 9, 9]);
    expect(averageRegion(f.data, 4, -10, -10, 99, 99)).toEqual([9, 9, 9]);
  });
});
