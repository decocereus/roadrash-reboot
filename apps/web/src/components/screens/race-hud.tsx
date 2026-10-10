import { Bar, Pips } from "@racer/ui/components/bar";
import { Heading } from "@racer/ui/components/heading";
import { Notice } from "@racer/ui/components/notice";
import { Panel } from "@racer/ui/components/panel";
import { Screen } from "@racer/ui/components/screen";
import { useSyncExternalStore } from "react";

import { distanceToGo, ordinal } from "../../career/format.ts";
import { idleHud } from "../../game/hud.ts";
import type { HudFeed, HudState } from "../../game/hud.ts";

const COP_ON_YOU = 15;

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
      {hud.rivalName !== "" && (
        <Panel
          className={hud.speech === "" ? "w-44" : "w-72"}
          edge={hud.rivalColour}
          padding="sm"
          tone="plate"
        >
          <Heading as="p" size="sm" tone="text">
            {hud.rivalName}
          </Heading>
          {hud.speech === "" ? (
            <Bar
              className="mt-2"
              label={`${hud.rivalName} stamina`}
              max={1}
              value={hud.rivalStamina}
            />
          ) : (
            <p className="mt-1 text-sm font-semibold text-pretty">
              “{hud.speech}”
            </p>
          )}
        </Panel>
      )}
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
      <p className={`${numeral} absolute top-[3%] left-[3%]`}>
        <span className="flash-hold" key={hud.position}>
          {ordinal(hud.position)}
        </span>
        <span className="text-name"> / {hud.riderCount}</span>
      </p>
      {!settled && (
        <>
          {racing && hud.copDistance >= 0 && (
            <CopWarning metres={hud.copDistance} />
          )}
          <div className="absolute top-[3%] right-[3%] w-[min(18rem,26vw)] text-right">
            <p className={label}>{hud.roadName}</p>
            <p className="font-display tracking-display numeric text-name hud-ink font-bold uppercase">
              {distanceToGo(hud.distanceLeft)} to go
            </p>
            <div className="bg-text ring-ink relative mt-2 h-1 ring-2">
              <span
                className="bg-yellow ring-ink absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
                style={{ left: `${hud.progress * 100}%` }}
              />
            </div>
          </div>
          <div
            className={`absolute bottom-[4%] left-[3%] ${hud.offBike ? "opacity-50" : ""}`}
          >
            <p className={numeral}>{Math.round(hud.speedKmh)}</p>
            <p className={label}>km/h</p>
          </div>
          <div className="absolute bottom-[4%] left-1/2 grid w-[min(20rem,30vw)] -translate-x-1/2 grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
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
          <div className="absolute right-[3%] bottom-[4%] flex flex-col items-end gap-2">
            <p className="font-display tracking-display text-name hud-ink font-bold uppercase">
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
