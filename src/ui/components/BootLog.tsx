import { useEffect, useRef } from "react";
import type { EmulatorLogEvent } from "../../emulator/types";

export interface LogLine extends EmulatorLogEvent {
  id: number;
  time: string;
}

export function BootLog({ lines }: { lines: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="bootlog" ref={ref} aria-label="Boot log">
      {lines.map((l) => (
        <div key={l.id} className={`bootlog-line level-${l.level}`}>
          <span className="bootlog-time">{l.time}</span>
          <span className="bootlog-msg">{l.message}</span>
        </div>
      ))}
      {lines.length === 0 && <div className="bootlog-line">…awaiting power-on…</div>}
    </div>
  );
}
