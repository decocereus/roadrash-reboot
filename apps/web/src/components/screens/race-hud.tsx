import { Dial } from "@racer/ui/components/dial";
import { Heading } from "@racer/ui/components/heading";
import { Notice } from "@racer/ui/components/notice";
import { Panel } from "@racer/ui/components/panel";
import { Screen } from "@racer/ui/components/screen";
import { useSyncExternalStore } from "react";

import { ordinal } from "../../career/format.ts";
import { idleHud } from "../../game/hud.ts";
import type { HudFeed, HudState } from "../../game/hud.ts";

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

function Speedometer({ hud }: { readonly hud: HudState }) {
  return (
    <Dial
      className={`absolute bottom-[1.5%] left-1/2 h-[25%] min-h-36 -translate-x-1/2 ${hud.offBike ? "opacity-60" : ""}`}
      field={hud.riderCount}
      gear={hud.offBike ? 0 : hud.gear}
      label="Speed"
      max={DIAL_TOP_KMH}
      place={ordinal(hud.position)}
      progress={hud.progress}
      unit="km/h"
      value={hud.speedKmh}
    />
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
          <Speedometer hud={hud} />
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
