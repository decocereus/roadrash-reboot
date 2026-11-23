import { Dial } from "@racer/ui/components/dial";
import { Notice } from "@racer/ui/components/notice";
import { Screen } from "@racer/ui/components/screen";
import { useSyncExternalStore } from "react";

import { ordinal } from "../../career/format.ts";
import type { HudState } from "../../game/hud.ts";
import { idleHud } from "../../hud-feed.ts";
import type { HudFeed } from "../../hud-feed.ts";
import { hudEdge, noticeTop, towerRowsAt, warningPad } from "./hud-layout.ts";
import type { TowerRows } from "./hud-layout.ts";
import { RaceTower } from "./race-tower.tsx";

const COP_ON_YOU = 15;
const DIAL_TOP_KMH = 300;
const numeral =
  "font-display tracking-display numeric text-hud hud-ink font-extrabold";

const noticeText = (hud: HudState): string => {
  if (hud.notice === "armed") {
    return `Got the ${hud.noticeDetail}`;
  }
  if (hud.notice === "broken") {
    return `${hud.noticeDetail} broke`;
  }
  return {
    "": "",
    disarmed: "Disarmed",
    knockdown: "Down!",
    lastKm: "Last km",
    marked: "Marked",
    police: "Cop!",
    wipeout: "Wipeout",
  }[hud.notice];
};

const copWarningText = (gap: number): string => {
  const metres = Math.round(Math.abs(gap));
  if (metres < COP_ON_YOU) {
    return "Cop on you";
  }
  return gap > 0 ? `▲ Cop ${metres} m ahead ▲` : `▼ Cop ${metres} m behind ▼`;
};

const CopWarning = ({ gap }: { readonly gap: number }) => (
  <p
    className="font-display tracking-display cop-blink numeric text-name bg-ink/85 absolute left-1/2 -translate-x-1/2 font-extrabold whitespace-nowrap uppercase"
    role="alert"
    style={{ padding: warningPad, top: hudEdge }}
  >
    {copWarningText(gap)}
  </p>
);

const Speedometer = ({ hud }: { readonly hud: HudState }) => (
  <>
    <span className="sr-only" role="status">
      {hud.lagging ? "Weak connection" : null}
    </span>
    <Dial
      className={`absolute bottom-[1.5%] left-1/2 h-[25%] min-h-36 -translate-x-1/2 ${hud.offBike ? "opacity-60" : ""}`}
      field={hud.riderCount}
      gear={hud.offBike ? 0 : hud.gear}
      label="Speed"
      warning={hud.lagging ? "Lag" : null}
      max={DIAL_TOP_KMH}
      place={ordinal(hud.position)}
      progress={hud.progress}
      unit="km/h"
      value={hud.speedKmh}
    />
  </>
);

const onResize = (changed: () => void): (() => void) => {
  globalThis.addEventListener("resize", changed);
  return () => {
    globalThis.removeEventListener("resize", changed);
  };
};

const towerRows = (): TowerRows =>
  towerRowsAt({
    height: globalThis.innerHeight,
    width: globalThis.innerWidth,
  });

const wholeField = (): TowerRows => "all";

export const RaceHud = ({
  feed,
  settled,
}: {
  readonly feed: HudFeed;
  readonly settled: boolean;
}) => {
  const hud = useSyncExternalStore(feed.subscribe, feed.read, () => idleHud);
  const racing = hud.phase === "racing" || hud.phase === "countdown";
  const shown = useSyncExternalStore(onResize, towerRows, wholeField);
  return (
    <Screen className="pointer-events-none bg-transparent select-none">
      {settled ? (
        <p className={`${numeral} absolute top-[3%] left-[3%]`}>
          {ordinal(hud.position)}
          <span className="text-name"> / {hud.riderCount}</span>
        </p>
      ) : (
        <>
          {racing && hud.copGap !== null && <CopWarning gap={hud.copGap} />}
          {racing && hud.tower.length > 0 && (
            <RaceTower rows={hud.tower} shown={shown} />
          )}
          <Speedometer hud={hud} />
          {hud.countdown > 0 && (
            <p
              className={`${numeral} notice-in absolute left-1/2 -translate-x-1/2`}
              key={hud.countdown}
              style={{ top: noticeTop }}
            >
              {hud.countdown}
            </p>
          )}
          {hud.countdown === 0 && hud.notice !== "" && (
            <Notice
              className="hud-ink"
              key={hud.notice}
              style={{ top: noticeTop }}
            >
              {noticeText(hud)}
            </Notice>
          )}
          {racing && hud.remountPrompt && (
            <p className="font-display tracking-display text-name bg-ink/85 absolute bottom-[28%] left-1/2 -translate-x-1/2 px-4 py-1 font-extrabold whitespace-nowrap uppercase">
              E to get back on
            </p>
          )}
        </>
      )}
    </Screen>
  );
};
