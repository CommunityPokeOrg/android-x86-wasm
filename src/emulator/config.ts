/**
 * VM configuration. Everything here is user-overridable from the UI; the
 * defaults keep the repo free of binary artifacts by loading v86's WASM and
 * the SeaBIOS/VGA BIOS from jsDelivr (CORS + HTTP Range enabled).
 */

export type GuestImageKind =
  | "none" // no guest image — demo framebuffer fallback
  | "bootsector" // built-in 512-byte boot sector on the emulated floppy
  | "cdrom" // boot an ISO from the emulated IDE CD-ROM (e.g. Android-x86)
  | "hda" // boot a raw hard-disk image from the emulated IDE disk
  | "linux"; // direct bzImage + initrd boot (lightweight fallback)

export interface GuestImageConfig {
  kind: GuestImageKind;
  /**
   * URL of the ISO / disk image / kernel. For `linux`, the bzImage URL.
   * Empty => treated as `none`.
   */
  url: string;
  /** Optional initrd URL for `linux` kind. */
  initrdUrl?: string;
  /** Optional kernel cmdline for `linux` kind. */
  cmdline?: string;
  /**
   * When true the image is fetched lazily with HTTP Range requests
   * (requires the server to expose Content-Length). When false the whole
   * image is downloaded up-front with progress reporting.
   */
  streaming: boolean;
}

export interface VmConfig {
  /** Guest RAM in MiB — 256..512 supported by the UI. */
  memoryMiB: number;
  /** URL of the v86 WebAssembly artifact. */
  wasmUrl: string;
  /** SeaBIOS image URL. */
  biosUrl: string;
  /** VGA BIOS image URL. */
  vgaBiosUrl: string;
  guestImage: GuestImageConfig;
}

const V86_VERSION = "0.5.461";

export const DEFAULT_WASM_URL = `https://cdn.jsdelivr.net/npm/v86@${V86_VERSION}/build/v86.wasm`;
export const DEFAULT_BIOS_URL = "https://cdn.jsdelivr.net/gh/copy/v86/bios/seabios.bin";
export const DEFAULT_VGA_BIOS_URL = "https://cdn.jsdelivr.net/gh/copy/v86/bios/vgabios.bin";

export const DEFAULT_CONFIG: VmConfig = {
  memoryMiB: 384,
  wasmUrl: DEFAULT_WASM_URL,
  biosUrl: DEFAULT_BIOS_URL,
  vgaBiosUrl: DEFAULT_VGA_BIOS_URL,
  guestImage: { kind: "none", url: "", streaming: false },
};

/**
 * Suggested public mirrors for small Android-x86 images. These are only
 * defaults the user may paste into the image URL field — nothing is
 * downloaded until configured, and hosting/redistribution terms remain with
 * the image providers (see README "Licensing & images").
 */
export const SUGGESTED_IMAGES: { label: string; kind: GuestImageKind; url: string }[] = [
  {
    label: "Android-x86 1.6-r2 (Donut) live ISO — ~43 MB · needs CORS",
    kind: "cdrom",
    url: "https://osdn.net/dl/android-x86/android-x86-1.6-r2.iso",
  },
  {
    label: "Android-x86 2.2-r2 (Froyo) live ISO — ~83 MB · needs CORS",
    kind: "cdrom",
    url: "https://osdn.net/dl/android-x86/android-x86-2.2-r2.iso",
  },
];
