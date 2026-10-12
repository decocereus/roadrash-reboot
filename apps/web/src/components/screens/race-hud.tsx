import { Bar, Pips } from "@racer/ui/components/bar";
import { Dial } from "@racer/ui/components/dial";
import { Heading } from "@racer/ui/components/heading";
import { Notice } from "@racer/ui/components/notice";
import { Panel } from "@racer/ui/components/panel";
import { Screen } from "@racer/ui/components/screen";
import { useSyncExternalStore } from "react";

import { distanceToGo, ordinal } from "../../career/format.ts";
import { idleHud } from "../../game/hud.ts";
import type { HudFeed, HudState } from "../../game/hud.ts";

const COP_ON_YOU = 15;
const DIAL_TOP_KMH = 240;
const COWL =
  "polygon(0 26%, 31% 26%, 37% 0, 63% 0, 69% 26%, 100% 26%, 100% 100%, 0 100%)";

const label = "font-body text-label text-text hud-ink font-semibold uppercase";
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
    air: "Air",
    close: "Close",
    disarmed: "Disarmed",
    go: "Go",
    hit: "Hit",
    knockdown: "Down!",
    lastKm: "Last km",
    police: "Cop!",
    wipeout: "Wipeout",
  }[hud.notice];
};

function CopWarning({ metres }: { readonly metres: number }) {
  return (
    <p
      className="font-display tracking-display cop-blink numeric text-name bg-ink/85 absolute top-[3%] left-1/2 -translate-x-1/2 px-4 py-1 font-extrabold whitespace-nowrap uppercase"
      role="alert"
    >
      {metres < COP_ON_YOU ? "Cop on you" : `▲ Cop ${Math.round(metres)} m ▲`}
    </p>
  );
}

function RivalTag({
  hud,
  tagRef,
}: {
  readonly hud: HudState;
  readonly tagRef: (element: HTMLDivElement | null) => void;
}) {
  return (
    <div
      className="invisible absolute top-0 left-0 will-change-transform"
      ref={tagRef}
    >
      {hud.rivalName !== "" && hud.speech !== "" && (
        <Panel
          className="w-72"
          edge={hud.rivalColour}
          padding="sm"
          tone="plate"
        >
          <Heading as="p" size="sm" tone="text">
            {hud.rivalName}
          </Heading>
          <p className="mt-1 text-sm font-semibold text-pretty">
            “{hud.speech}”
          </p>
        </Panel>
      )}
    </div>
  );
}

function Dashboard({ hud }: { readonly hud: HudState }) {
  return (
    <div
      className="bg-yellow absolute inset-x-0 bottom-0 h-[23%] min-h-32"
      style={{ clipPath: COWL }}
    >
      <div
        className="bg-ink absolute inset-x-0 top-0.75 bottom-0 grid grid-cols-[1fr_1.2fr_minmax(0,30%)_1.2fr_1fr] grid-rows-[minmax(0,1fr)] items-end gap-x-[2%] px-[3%] pb-[1.5%]"
        style={{ clipPath: COWL }}
      >
        <div className="min-w-0">
          <p className={numeral}>
            <span className="flash-hold" key={hud.position}>
              {ordinal(hud.position)}
            </span>
            <span className="text-name"> / {hud.riderCount}</span>
          </p>
          <div className="mt-1 flex items-center gap-3">
            <p className="font-display tracking-display text-name font-bold uppercase">
              {hud.weaponName === "" ? "Fists" : hud.weaponName}
            </p>
            {hud.weaponCapacity > 0 && (
              <Pips
                label={`${hud.weaponName} hits left`}
                max={hud.weaponCapacity}
                value={hud.weaponHits}
              />
            )}
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 pb-1">
          <span className={label}>You</span>
          <Bar label="Your stamina" max={1} value={hud.stamina} />
          <span className={label}>Bike</span>
          <Bar
            label={`${hud.bikeName} condition`}
            max={1}
            size="sm"
            tone="condition"
            value={hud.condition}
          />
        </div>
        <Dial
          className={`mx-auto aspect-[200/112] h-[86%] max-w-full self-end ${hud.offBike ? "opacity-50" : ""}`}
          label="Speed"
          max={DIAL_TOP_KMH}
          unit="km/h"
          value={hud.speedKmh}
        />
        <div className="min-w-0 pb-1">
          {hud.rivalName !== "" && (
            <>
              <p
                className="font-display tracking-display text-name truncate border-r-4 pr-2 text-right font-bold uppercase"
                style={{ borderColor: hud.rivalColour }}
              >
                {hud.rivalName}
              </p>
              <Bar
                align="right"
                className="mt-2"
                label={`${hud.rivalName} stamina`}
                max={1}
                value={hud.rivalStamina}
              />
            </>
          )}
        </div>
        <div className="min-w-0 text-right">
          <p className="font-display tracking-display numeric text-name font-bold uppercase">
            {distanceToGo(hud.distanceLeft)} to go
          </p>
          <p className={`${label} truncate`}>{hud.roadName}</p>
          <div className="bg-text ring-ink relative mt-3 mb-2 h-1 ring-2">
            <span
              className="bg-yellow ring-ink absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
              style={{ left: `${hud.progress * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function RaceHud({
  feed,
  tagRef,
  settled,
}: {
  readonly feed: HudFeed;
  readonly tagRef: (element: HTMLDivElement | null) => void;
  readonly settled: boolean;
}) {
  const hud = useSyncExternalStore(feed.subscribe, feed.read, () => idleHud);
  const racing = hud.phase === "racing" || hud.phase === "countdown";
  return (
    <Screen className="pointer-events-none bg-transparent select-none">
      {settled ? (
        <p className={`${numeral} absolute top-[3%] left-[3%]`}>
          {ordinal(hud.position)}
          <span className="text-name"> / {hud.riderCount}</span>
        </p>
      ) : (
        <>
          {racing && hud.copDistance >= 0 && (
            <CopWarning metres={hud.copDistance} />
          )}
          <Dashboard hud={hud} />
          <RivalTag hud={hud} tagRef={tagRef} />
          {hud.countdown > 0 && (
            <p
              className={`${numeral} notice-in absolute top-[30%] left-1/2 -translate-x-1/2`}
              key={hud.countdown}
            >
              {hud.countdown}
            </p>
          )}
          {hud.countdown === 0 && hud.notice !== "" && (
            <Notice className="hud-ink top-[30%]" key={hud.notice}>
              {noticeText(hud)}
            </Notice>
          )}
        </>
      )}
    </Screen>
  );
}
