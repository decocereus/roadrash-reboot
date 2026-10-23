import { roadBoss, roadsFor } from "@racer/career/field";
import { preRaceLine } from "@racer/career/lines";
import { seasonBoard } from "@racer/career/season";
import { creditLimit, debtOf } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { ENVELOPE_NOTE, storyBeat } from "@racer/career/story";
import { ALLY, FINALE_ROAD, roads } from "@racer/career/tables";
import type { RoadId } from "@racer/career/tables";
import { rivals } from "@racer/sim/cast";
import { Confirm } from "@racer/ui/components/confirm";
import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { formatMoney } from "@racer/ui/components/money";
import { Screen } from "@racer/ui/components/screen";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { bills, flyers, plates, stickers } from "../../assets/clubhouse-art.ts";
import { ENVELOPE_INSIDE, levelName } from "../../career/copy.ts";
import { careerEntry, planFor } from "../../career/flow.ts";
import { bikeName } from "../../career/format.ts";
import { boardNote, signedByVic } from "../../career/notes.ts";
import {
  BarBackdrop,
  BarLight,
  BarSeats,
  SpeechSticker,
  useBarClock,
} from "./clubhouse-bar.tsx";
import { Plate, place, Stage, stagePx } from "./clubhouse-stage.tsx";
import { Standings, WallNotes, WallPosters } from "./clubhouse-wall.tsx";
import type { WallNote } from "./clubhouse-wall.tsx";
import { standingTag, useEscape } from "./shared.tsx";

const WORDMARK = { h: 106, w: 405, x: 30, y: 16 } as const;
const BADGE = { h: 98, w: 82, x: 438, y: 24 } as const;
const STATUS = { h: 63, w: 1127, x: 522, y: 33 } as const;
const NAV = { h: 71, w: 1672, x: 0, y: 854 } as const;
const SOON = "Soon";

const StatusItem = ({
  label,
  children,
  tone,
}: {
  readonly label: ReactNode;
  readonly children: ReactNode;
  readonly tone: string;
}) => (
  <p className="flex items-baseline gap-[0.35em] whitespace-nowrap">
    <span className={tone}>{label}</span>
    <span>{children}</span>
  </p>
);

const notesFor = (
  career: CareerState,
  openEnvelope: () => void
): readonly WallNote[] => {
  const debt = debtOf(career);
  const notes: WallNote[] = [];
  if (debt > 0) {
    notes.push({
      text: `You owe ${formatMoney(debt)}. Prize money pays it first. Limit ${formatMoney(creditLimit(career))}.`,
    });
  }
  if (storyBeat(career).envelopeOpen) {
    notes.push({
      open: openEnvelope,
      signature: "Open it",
      text: "An envelope with your name on it.",
    });
  }
  for (const note of career.board) {
    notes.push({
      signature: signedByVic(note) ? "V." : undefined,
      text: boardNote(note),
    });
  }
  if (notes.length === 0) {
    notes.push({
      signature: "V.",
      text: "Top three on all five roads and you move up.",
    });
  }
  return notes;
};

const StatusStrip = ({
  career,
  qualified,
  roadCount,
}: {
  readonly career: CareerState;
  readonly qualified: number;
  readonly roadCount: number;
}) => (
  <div
    className="bg-ink/85 font-display text-paper flex items-center justify-around border-y border-white/10 font-bold tracking-wide uppercase"
    style={{ ...place(STATUS), fontSize: stagePx(27) }}
  >
    <StatusItem label={`Level ${career.level} ·`} tone="text-neon-cyan">
      {levelName(career.level)}
    </StatusItem>
    <StatusItem label="Roads" tone="text-neon-yellow">
      <span className="text-neon-yellow">
        {qualified} / {roadCount} qualified
      </span>
    </StatusItem>
    <StatusItem
      label={debtOf(career) > 0 ? "Owed" : "Cash"}
      tone="text-paper/75"
    >
      <span className="text-neon-red numeric">
        {formatMoney(Math.abs(career.cash))}
      </span>
    </StatusItem>
    <p className="text-neon-yellow whitespace-nowrap">
      {bikeName(career.bikeId)}
    </p>
  </div>
);

const ClubhouseNav = ({
  roadName,
  onRouteBoard,
  onGarage,
  onTitle,
}: {
  readonly roadName: string;
  readonly onRouteBoard: () => void;
  readonly onGarage: () => void;
  readonly onTitle: () => void;
}) => {
  const items = [
    { id: "route-board", label: "Route board", run: onRouteBoard },
    { id: "garage", label: "Garage", run: onGarage },
    { id: "back-room", label: "Back room", run: undefined },
    { id: "title", label: "Title", run: onTitle },
  ];
  return (
    <nav
      className="bg-ink/90 font-display flex items-center justify-between border-y border-white/10 px-[3.6cqw] font-bold uppercase"
      style={{ ...place(NAV), fontSize: stagePx(33) }}
    >
      <MenuList
        autoFocus
        className="flex-nowrap gap-x-[2.4cqw]"
        defaultValue="route-board"
        label="Clubhouse"
        onSelect={(id) => items.find((item) => item.id === id)?.run?.()}
        orientation="horizontal"
        size="sm"
      >
        {items.map((item) => (
          <MenuItem
            className="data-selected:text-neon-yellow data-selected:outline-neon-yellow px-[0.4em] !text-[1em] data-selected:outline-2"
            disabled={item.run === undefined}
            key={item.id}
            trailing={item.run === undefined ? SOON : undefined}
            value={item.id}
          >
            {item.label}
          </MenuItem>
        ))}
      </MenuList>
      <p className="text-paper/70 whitespace-nowrap">
        Next: <span className="text-neon-yellow">{roadName}</span>
      </p>
    </nav>
  );
};

const useBarCast = (career: CareerState, roadId: RoadId) => {
  const setup = useMemo(
    () => planFor(career, careerEntry(career, roadId)).setup,
    [career, roadId]
  );
  const speaker = useMemo(() => preRaceLine(career, setup), [career, setup]);
  const boss = roadBoss(career, roadId);
  const regulars = useMemo(() => {
    const others = setup.field.filter(
      (rider) => rider !== speaker?.rival && rider !== boss
    );
    return boss === speaker?.rival ? others : [boss, ...others];
  }, [setup, speaker, boss]);
  const visit = career.record.starts;
  return {
    billRider: regulars[visit % Math.max(1, regulars.length)] ?? boss,
    boss,
    regulars,
    speaker,
    sticker: stickers[visit % stickers.length] ?? plates.badge,
  };
};

export const ClubhouseScreen = ({
  career,
  onRouteBoard,
  onGarage,
  onTitle,
  onEnvelope,
}: {
  readonly career: CareerState;
  readonly onRouteBoard: () => void;
  readonly onGarage: () => void;
  readonly onTitle: () => void;
  readonly onEnvelope: (take: boolean) => void;
}) => {
  const [envelope, setEnvelope] = useState(false);
  const clock = useBarClock();
  const board = roadsFor(career);
  const roadId =
    board.next ??
    board.roads.find((status) => status.open)?.road.id ??
    FINALE_ROAD;
  const road = roads[roadId];
  const { billRider, boss, regulars, speaker, sticker } = useBarCast(
    career,
    roadId
  );
  const rival = speaker === null ? null : rivals[speaker.rival];
  const ally = rival?.id === ALLY && storyBeat(career).deeAlly;
  useEscape(onTitle, !envelope);
  return (
    <Screen
      className="flex"
      enter="fade"
      style={{
        backgroundImage: `url(${plates.wall})`,
        backgroundSize: "60vw auto",
      }}
    >
      <Stage inert={envelope ? true : undefined}>
        <BarBackdrop clock={clock} />
        <BarSeats
          boss={boss}
          regulars={regulars}
          roadName={road.name}
          speaker={speaker?.rival ?? null}
        />
        {speaker !== null && rival !== null && (
          <SpeechSticker
            line={speaker.text}
            name={rival.name}
            tag={standingTag(ally, career.memory[rival.id].grudge)}
          />
        )}
        <h1
          className="font-stencil text-paper flex items-center leading-none font-black whitespace-nowrap uppercase drop-shadow-[0_0.06em_0_rgb(0_0_0/60%)]"
          style={{ ...place(WORDMARK), fontSize: stagePx(84) }}
        >
          The Lowside
        </h1>
        <Plate box={BADGE} src={plates.badge} />
        <StatusStrip
          career={career}
          qualified={board.qualifiedCount}
          roadCount={board.roads.length}
        />
        <Standings
          playerCaption={career.level === 1 ? "New meat" : "Kid can ride"}
          rows={seasonBoard(career)}
        />
        <WallNotes
          notes={notesFor(career, () => {
            setEnvelope(true);
          })}
        />
        <WallPosters
          bill={bills[billRider]}
          flyer={flyers[roadId]}
          roadName={road.name}
          sticker={sticker}
        />
        <BarLight clock={clock} />
        <ClubhouseNav
          onGarage={onGarage}
          onRouteBoard={onRouteBoard}
          onTitle={onTitle}
          roadName={road.name}
        />
      </Stage>
      {envelope && (
        <Confirm
          defaultValue="leave"
          label="The envelope"
          onDismiss={() => {
            setEnvelope(false);
          }}
          onSelect={(value) => {
            setEnvelope(false);
            onEnvelope(value === "take");
          }}
          options={[
            { label: "Leave it", value: "leave" },
            { label: "Take it", value: "take" },
          ]}
          warning={ENVELOPE_INSIDE}
        >
          {ENVELOPE_NOTE}
        </Confirm>
      )}
    </Screen>
  );
};
