/** RGB triple used through the raster pipeline. */
export type Rgb = [number, number, number];

const ESC = "\u001b";

export function rgbToCss([r, g, b]: Rgb): string {
  return `rgb(${r},${g},${b})`;
}

/** 24-bit "truecolor" ANSI escape producing a foreground color. */
export function ansiFg([r, g, b]: Rgb): string {
  return `${ESC}[38;2;${r};${g};${b}m`;
}

/** 24-bit "truecolor" ANSI escape producing a background color. */
export function ansiBg([r, g, b]: Rgb): string {
  return `${ESC}[48;2;${r};${g};${b}m`;
}

export const ANSI_RESET = `${ESC}[0m`;

/** ITU-R BT.601 luma, 0..255. */
export function luminance([r, g, b]: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function rgbEquals(a: Rgb, b: Rgb): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/**
 * Average a rectangular region of a packed RGBA frame into one Rgb.
 * Samples every `step` pixels for speed; step must be >= 1.
 */
export function averageRegion(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  step = 1,
): Rgb {
  const xs = Math.max(0, Math.floor(x0));
  const ys = Math.max(0, Math.floor(y0));
  const xe = Math.min(width, Math.ceil(x1));
  const ye = Math.min(data.length / 4 / width, Math.ceil(y1));
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let y = ys; y < ye; y += step) {
    let i = (y * width + xs) * 4;
    for (let x = xs; x < xe; x += step) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
      i += 4 * step;
    }
  }
  if (n === 0) return [0, 0, 0];
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}
