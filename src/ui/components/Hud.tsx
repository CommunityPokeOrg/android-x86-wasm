import type { EmulatorStats } from "../../emulator/types";

export function Hud({
  stats,
  fps,
  backend,
  ramMiB,
}: {
  stats: EmulatorStats;
  fps: number;
  backend: string;
  ramMiB: number;
}) {
  const ramUsed =
    (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
      ?.usedJSHeapSize ?? 0;
  return (
    <div className="hud" aria-label="Performance HUD">
      <span className="hud-chip backend" data-backend={backend}>
        {backend === "demo" ? "DEMO FRAMEBUFFER" : "v86 GUEST"}
      </span>
      <span className="hud-chip">MIPS <b>{stats.mips.toFixed(1)}</b></span>
      <span className="hud-chip">SPEED <b>{stats.speedPercent.toFixed(0)}%</b></span>
      <span className="hud-chip">FPS <b>{fps.toFixed(0)}</b></span>
      <span className="hud-chip">RAM <b>{ramMiB} MiB</b></span>
      {ramUsed > 0 && (
        <span className="hud-chip dim">JS {(ramUsed / 1048576).toFixed(0)} MB</span>
      )}
    </div>
  );
}
