import type { GuestFrame } from "../src/emulator/types";
import type { Rgb } from "../src/raster/colors";

/** Build a GuestFrame filled pixel-wise by `fill`. */
export function makeFrame(
  width: number,
  height: number,
  fill: (x: number, y: number) => Rgb,
): GuestFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Solid-color frame. */
export function solidFrame(width: number, height: number, color: Rgb): GuestFrame {
  return makeFrame(width, height, () => color);
}
