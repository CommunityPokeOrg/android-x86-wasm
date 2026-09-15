import { describe, expect, it } from "vitest";
import { makeBootSectorImage } from "../src/guest/bootsector";

describe("makeBootSectorImage", () => {
  const img = new Uint8Array(makeBootSectorImage());

  it("is exactly one 512-byte sector", () => {
    expect(img.length).toBe(512);
  });

  it("carries the 0x55AA boot signature", () => {
    expect(img[0x1fe]).toBe(0x55);
    expect(img[0x1ff]).toBe(0xaa);
  });

  it("starts with `mov ax,0x13; int 0x10` (VGA mode 13h)", () => {
    expect(Array.from(img.slice(0, 5))).toEqual([0xb8, 0x13, 0x00, 0xcd, 0x10]);
  });

  it("contains the banner string at offset 0x100", () => {
    const text = String.fromCharCode(...img.slice(0x100, 0x110));
    expect(text).toBe("ANDROID-X86-WASM");
  });
});
