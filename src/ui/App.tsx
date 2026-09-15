import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_CONFIG, type VmConfig } from "../emulator/config";
import { DemoAdapter } from "../emulator/demoAdapter";
import { V86Adapter } from "../emulator/v86Adapter";
import type {
  EmulatorAdapter,
  EmulatorStats,
  EmulatorStatus,
} from "../emulator/types";
import type { RasterMode } from "../raster/rasterizer";
import { BootLog, type LogLine } from "./components/BootLog";
import { Controls } from "./components/Controls";
import { GEO_PRESETS, type GeoPreset } from "./geoPresets";
import { Hud } from "./components/Hud";
import { TerminalScreen } from "./components/TerminalScreen";

let logId = 0;
function stamp(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

export function App() {
  const [config, setConfig] = useState<VmConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<EmulatorStatus>("idle");
  const [lines, setLines] = useState<LogLine[]>([]);
  const [stats, setStats] = useState<EmulatorStats>({
    mips: 0,
    speedPercent: 0,
    ramBytes: config.memoryMiB * 1024 * 1024,
    running: false,
  });
  const [fps, setFps] = useState(0);
  const [mode, setMode] = useState<RasterMode>("halfblock");
  const [geo, setGeo] = useState<GeoPreset>(GEO_PRESETS[1]);
  const [adapter, setAdapter] = useState<EmulatorAdapter>(() => new DemoAdapter());
  const [fatal, setFatal] = useState<string | null>(null);

  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const detachRef = useRef<(() => void)[]>([]);
  const progressMark = useRef(new Map<string, number>());

  const pushLog = useCallback((level: LogLine["level"], message: string) => {
    setLines((ls) => [...ls.slice(-499), { id: ++logId, level, message, time: stamp() }]);
  }, []);

  const attach = useCallback(
    (a: EmulatorAdapter) => {
      detachRef.current.forEach((fn) => fn());
      detachRef.current = [
        a.onLog((e) => pushLog(e.level, e.message)),
        a.onStatus((s) => {
          setStatus(s);
          if (s === "error") setFatal("Emulator reported an error — see boot log.");
        }),
        a.onProgress((p) => {
          const pct = p.total > 0 ? Math.floor((p.loaded / p.total) * 100) : 0;
          const key = p.fileName;
          const last = progressMark.current.get(key) ?? -1;
          if (pct >= last + 25 || (p.loaded >= p.total && last < 100)) {
            progressMark.current.set(key, pct);
            pushLog(
              "info",
              `Downloading ${key.split("/").pop()}: ${pct}% (${(p.loaded / 1e6).toFixed(1)} MB)`,
            );
          }
        }),
        a.onResize((s) => pushLog("info", `Display: ${s.width}×${s.height}`)),
      ];
    },
    [pushLog],
  );

  useEffect(() => {
    attach(adapter);
    const poll = setInterval(() => setStats(adapterRef.current.stats()), 500);
    return () => {
      clearInterval(poll);
      detachRef.current.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter]);

  useEffect(() => () => void adapterRef.current.destroy(), []);

  const powerOn = useCallback(
    async (a: EmulatorAdapter) => {
      setFatal(null);
      try {
        await a.start();
        await a.run();
      } catch (e) {
        setFatal(`Failed to start: ${(e as Error).message}`);
      }
    },
    [],
  );

  const applyConfig = useCallback(
    async (next: VmConfig) => {
      setConfig(next);
      setLines([]);
      setFatal(null);
      progressMark.current.clear();
      await adapterRef.current.destroy();
      const useV86 =
        next.guestImage.kind === "bootsector" ||
        (next.guestImage.kind !== "none" && next.guestImage.url !== "");
      const a: EmulatorAdapter = useV86 ? new V86Adapter(next) : new DemoAdapter(next.memoryMiB);
      setAdapter(a);
      attach(a);
      // Slight defer so listeners from attach() are active for early events.
      queueMicrotask(() => void powerOn(a));
    },
    [attach, powerOn],
  );

  const onStart = useCallback(() => void powerOn(adapterRef.current), [powerOn]);
  const onPause = useCallback(() => void adapterRef.current.pause(), []);
  const onReset = useCallback(() => adapterRef.current.reset(), []);
  const onFps = useCallback((n: number) => setFps(n), []);

  const switchToDemo = useCallback(() => {
    void applyConfig({ ...config, guestImage: { kind: "none", url: "", streaming: false } });
  }, [applyConfig, config]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="title-block">
          <h1>ANDROID·X86·WASM</h1>
          <span className="subtitle">experimental in-browser x86 virtual machine</span>
        </div>
        <div className={`status-pill s-${status}`}>{status.toUpperCase()}</div>
      </header>

      {fatal && (
        <div className="banner error">
          <span>{fatal}</span>
          {adapter.backend === "v86" && (
            <button className="btn small" onClick={switchToDemo}>
              Switch to demo framebuffer
            </button>
          )}
        </div>
      )}

      <main className="app-main">
        <section className="screen-panel">
          <TerminalScreen adapter={adapter} mode={mode} geo={geo} onFps={onFps} />
          <div className="screen-caption">
            {adapter.backend === "demo"
              ? "DEMO framebuffer — no guest OS running. Configure MACHINE to boot an image."
              : "Live guest framebuffer, rasterized to Unicode cells."}
          </div>
        </section>

        <aside className="side-panel">
          <Hud
            stats={stats}
            fps={fps}
            backend={adapter.backend}
            ramMiB={config.memoryMiB}
          />
          <Controls
            status={status}
            backend={adapter.backend}
            mode={mode}
            geo={geo}
            config={config}
            onStart={onStart}
            onPause={onPause}
            onReset={onReset}
            onMode={setMode}
            onGeo={setGeo}
            onApplyConfig={applyConfig}
          />
          <BootLog lines={lines} />
        </aside>
      </main>

      <footer className="app-footer">
        <span>
          v86 © its contributors (BSD-2) · UI MIT · guest images load only when
          configured — see README for licensing notes
        </span>
      </footer>
    </div>
  );
}
