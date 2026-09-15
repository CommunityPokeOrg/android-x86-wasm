/**
 * A self-contained boot sector "guest OS" — 512 bytes of hand-assembled
 * 16-bit real-mode x86 that runs on the REAL v86 emulator with zero
 * downloads: SeaBIOS loads it from the emulated floppy drive, it switches
 * the VGA card to mode 13h (320x200, 256 colors), fills the framebuffer
 * with a color-cycling gradient, and prints a banner via BIOS teletype.
 *
 * This exercises the full pipeline — wasm emulator, BIOS POST, guest
 * execution, framebuffer tap, Unicode rasterizer — completely offline.
 *
 * Layout (org 0x7C00):
 *   0x000  set video mode 13h, fill VRAM with rolling color counter
 *   0x18   print banner string via int 10h AH=13h
 *   0x034  hlt / jmp loop
 *   0x100  banner string (16 bytes)
 *   0x1FE  boot signature 55 AA
 */

const MSG_OFFSET = 0x100;
const MSG = "ANDROID-X86-WASM"; // exactly 16 chars

const CODE: number[] = [
  // mov ax, 0x0013 ; int 0x10      — video mode 13h
  0xb8, 0x13, 0x00, 0xcd, 0x10,
  // mov ax, 0xa000 ; mov es, ax    — ES = VGA framebuffer segment
  0xb8, 0x00, 0xa0, 0x8e, 0xc0,
  // xor di, di ; xor bx, bx        — DI = pixel ptr, BL = rolling color
  0x31, 0xff, 0x31, 0xdb,
  // L1: mov al, bl ; stosb         — [es:di] = al; di++
  0x8a, 0xc3, 0xaa,
  // inc bx
  0x43,
  // cmp di, 0xfa00 ; jb L1         — fill all 64000 pixels
  0x81, 0xff, 0x00, 0xfa, 0x72, 0xf6,
  // mov ax, 0x07c0 ; mov es, ax    — ES = our load segment
  0xb8, 0xc0, 0x07, 0x8e, 0xc0,
  // mov ax, 0x1301                 — int10 write-string, advance cursor
  0xb8, 0x01, 0x13,
  // mov bx, 0x000f                 — page 0, attribute 0x0f (white)
  0xbb, 0x0f, 0x00,
  // mov bp, MSG_OFFSET             — ES:BP -> string
  0xbd, MSG_OFFSET & 0xff, MSG_OFFSET >> 8,
  // mov cx, len
  0xb9, MSG.length & 0xff, MSG.length >> 8,
  // mov dx, 0x0c0c                 — row 12, col 12 (centered)
  0xba, 0x0c, 0x0c,
  // int 0x10
  0xcd, 0x10,
  // hlt ; jmp $-3                  — idle loop (IRQ-friendly)
  0xf4, 0xeb, 0xfd,
];

/** Build the 512-byte bootable floppy image. */
export function makeBootSectorImage(): ArrayBuffer {
  const img = new Uint8Array(512);
  img.set(CODE, 0);
  for (let i = 0; i < MSG.length; i++) {
    img[MSG_OFFSET + i] = MSG.charCodeAt(i);
  }
  img[0x1fe] = 0x55;
  img[0x1ff] = 0xaa;
  return img.buffer;
}
