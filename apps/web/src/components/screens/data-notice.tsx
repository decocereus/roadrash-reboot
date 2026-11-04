import { useSyncExternalStore } from "react";

import { diagnostics } from "../../diagnostics/hub.ts";
import { place, Stage, stagePx } from "./clubhouse-stage.tsx";

const NOTICE = { h: 104, w: 620, x: 26, y: 740 } as const;

export const DataNotice = () => {
  const hub = diagnostics();
  const { settings } = useSyncExternalStore(hub.subscribe, hub.view, hub.view);
  if (settings.noticeSeen) {
    return null;
  }
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex">
      <Stage>
        <aside
          aria-label="Race data notice"
          className="bg-ink/85 border-yellow text-paper font-display pointer-events-auto flex flex-col justify-between border-l-2"
          style={{
            ...place(NOTICE),
            fontSize: stagePx(22),
            lineHeight: 1.2,
            padding: `${stagePx(10)} ${stagePx(16)}`,
          }}
        >
          <p>
            We record your races and how the game runs, under a random ID kept
            on this device. Never your name. You can switch it off in Settings.
          </p>
          <div
            className="flex justify-end font-bold uppercase"
            style={{ fontSize: stagePx(18), gap: stagePx(22) }}
          >
            <a
              className="text-paper/70 underline underline-offset-4"
              href="/privacy"
              rel="noopener noreferrer"
              target="_blank"
            >
              Privacy
            </a>
            <button
              className="text-yellow cursor-pointer uppercase"
              onClick={() => {
                hub.settings.change({ noticeSeen: true });
              }}
              type="button"
            >
              Got it
            </button>
          </div>
        </aside>
      </Stage>
    </div>
  );
};
