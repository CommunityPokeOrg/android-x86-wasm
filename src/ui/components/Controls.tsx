import { useState } from "react";
import type { EmulatorStatus } from "../../emulator/types";
import type { RasterMode } from "../../raster/rasterizer";
import {
  SUGGESTED_IMAGES,
  type GuestImageKind,
  type VmConfig,
} from "../../emulator/config";
import { GEO_PRESETS, type GeoPreset } from "../geoPresets";

export function Controls({
  status,
  backend,
  mode,
  geo,
  config,
  onStart,
  onPause,
  onReset,
  onMode,
  onGeo,
  onApplyConfig,
}: {
  status: EmulatorStatus;
  backend: "v86" | "demo";
  mode: RasterMode;
  geo: GeoPreset;
  config: VmConfig;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onMode: (m: RasterMode) => void;
  onGeo: (g: GeoPreset) => void;
  onApplyConfig: (c: VmConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<VmConfig>(config);
  const running = status === "running";
  const busy = status === "loading";

  return (
    <div className="controls">
      <div className="control-row">
        {!running ? (
          <button className="btn primary" onClick={onStart} disabled={busy}>
            {status === "paused" ? "▶ RESUME" : "▶ START"}
          </button>
        ) : (
          <button className="btn" onClick={onPause}>
            ⏸ PAUSE
          </button>
        )}
        <button className="btn" onClick={onReset} disabled={status === "idle" || busy}>
          ⟲ RESET
        </button>
        <button
          className="btn ghost"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          ⚙ MACHINE
        </button>
      </div>

      <div className="control-row">
        <label className="field">
          <span>Rasterizer</span>
          <select
            value={mode}
            onChange={(e) => onMode(e.target.value as RasterMode)}
          >
            <option value="halfblock">Half-block ▀/▄ 24-bit</option>
            <option value="ascii">ASCII luminance</option>
          </select>
        </label>
        <label className="field">
          <span>Cell density</span>
          <select
            value={geo.label}
            onChange={(e) =>
              onGeo(GEO_PRESETS.find((g) => g.label === e.target.value) ?? GEO_PRESETS[1])
            }
          >
            {GEO_PRESETS.map((g) => (
              <option key={g.label} value={g.label}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {open && (
        <div className="machine-panel">
          <label className="field">
            <span>Guest image type</span>
            <select
              value={draft.guestImage.kind}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  guestImage: {
                    ...draft.guestImage,
                    kind: e.target.value as GuestImageKind,
                  },
                })
              }
            >
              <option value="none">None — demo framebuffer</option>
              <option value="bootsector">Built-in boot sector (offline)</option>
              <option value="cdrom">CD-ROM ISO (Android-x86 etc.)</option>
              <option value="hda">Hard-disk image</option>
              <option value="linux">Linux bzImage + initrd</option>
            </select>
          </label>

          {draft.guestImage.kind === "bootsector" && (
            <div className="control-note">
              Boots a built-in 512-byte guest on the emulated floppy — real v86
              emulation with zero downloads.
            </div>
          )}
          {draft.guestImage.kind !== "none" && draft.guestImage.kind !== "bootsector" && (
            <>
              <label className="field">
                <span>Image URL</span>
                <input
                  type="url"
                  placeholder="https://…/android-x86.iso"
                  value={draft.guestImage.url}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      guestImage: { ...draft.guestImage, url: e.target.value },
                    })
                  }
                />
              </label>
              {draft.guestImage.kind === "linux" && (
                <>
                  <label className="field">
                    <span>initrd URL (optional)</span>
                    <input
                      type="url"
                      value={draft.guestImage.initrdUrl ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          guestImage: {
                            ...draft.guestImage,
                            initrdUrl: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Kernel cmdline</span>
                    <input
                      type="text"
                      value={draft.guestImage.cmdline ?? "console=ttyS0 quiet"}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          guestImage: {
                            ...draft.guestImage,
                            cmdline: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </>
              )}
              <label className="field checkbox">
                <input
                  type="checkbox"
                  checked={draft.guestImage.streaming}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      guestImage: {
                        ...draft.guestImage,
                        streaming: e.target.checked,
                      },
                    })
                  }
                />
                <span>Stream via HTTP Range (large images, needs CORS+Range)</span>
              </label>
              <div className="suggestions">
                {SUGGESTED_IMAGES.map((s) => (
                  <button
                    key={s.url}
                    className="chip"
                    title={s.url}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        guestImage: { ...draft.guestImage, kind: s.kind, url: s.url },
                      })
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="field">
            <span>Guest RAM</span>
            <select
              value={draft.memoryMiB}
              onChange={(e) =>
                setDraft({ ...draft, memoryMiB: Number(e.target.value) })
              }
            >
              <option value={256}>256 MiB</option>
              <option value={384}>384 MiB</option>
              <option value={512}>512 MiB</option>
            </select>
          </label>
          <label className="field">
            <span>v86 wasm URL</span>
            <input
              type="url"
              value={draft.wasmUrl}
              onChange={(e) => setDraft({ ...draft, wasmUrl: e.target.value })}
            />
          </label>
          <label className="field">
            <span>SeaBIOS URL</span>
            <input
              type="url"
              value={draft.biosUrl}
              onChange={(e) => setDraft({ ...draft, biosUrl: e.target.value })}
            />
          </label>
          <label className="field">
            <span>VGA BIOS URL</span>
            <input
              type="url"
              value={draft.vgaBiosUrl}
              onChange={(e) => setDraft({ ...draft, vgaBiosUrl: e.target.value })}
            />
          </label>
          <button
            className="btn primary"
            onClick={() => {
              onApplyConfig(draft);
              setOpen(false);
            }}
          >
            APPLY &amp; POWER ON
          </button>
        </div>
      )}
      <div className="control-note">
        {backend === "demo"
          ? "Demo framebuffer — configure a guest image to boot real software."
          : "v86 backend — guest is real emulated x86 hardware."}
      </div>
    </div>
  );
}
