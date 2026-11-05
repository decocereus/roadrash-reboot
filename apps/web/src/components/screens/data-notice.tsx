import { useSyncExternalStore } from "react";

import { diagnostics } from "../../diagnostics/hub.ts";
import { place, Stage, stagePx } from "./clubhouse-stage.tsx";

const NOTICE = { h: 92, w: 520, x: 26, y: 752 } as const;
const BODY_PX = 19;
const ACTION_PX = 16;
const LEAST_BODY_CSS_PX = 13;
const LEAST_ACTION_CSS_PX = 12;
const LEAST_TARGET_CSS_PX = 28;

const atLeast = (cssPx: number, px: number): string =>
  `max(${cssPx}px, ${stagePx(px)})`;

const ACTION = {
  alignItems: "center",
  display: "inline-flex",
  minHeight: `${LEAST_TARGET_CSS_PX}px`,
  padding: `0 ${stagePx(10)}`,
} as const;

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
            fontSize: atLeast(LEAST_BODY_CSS_PX, BODY_PX),
            height: "auto",
            lineHeight: 1.2,
            padding: `${stagePx(8)} ${stagePx(12)}`,
          }}
        >
          <p>
            We record your races and how the game runs, under a random ID kept
            on this device. Never your name. You can switch it off in Settings.
          </p>
          <div
            className="flex justify-end font-bold uppercase"
            style={{
              fontSize: atLeast(LEAST_ACTION_CSS_PX, ACTION_PX),
              gap: stagePx(8),
            }}
          >
            <a
              className="text-paper/70 underline underline-offset-4"
              href="/privacy"
              rel="noopener noreferrer"
              style={ACTION}
              target="_blank"
            >
              Privacy
            </a>
            <button
              className="text-yellow cursor-pointer uppercase"
              onClick={() => {
                hub.settings.change({ noticeSeen: true });
              }}
              style={ACTION}
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
