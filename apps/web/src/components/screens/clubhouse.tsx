import { roadsFor } from "@racer/career/field";
import { seasonBoard } from "@racer/career/season";
import type { LevelUp } from "@racer/career/settle";
import { creditLimit, debtOf } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { ENVELOPE_NOTE, storyBeat } from "@racer/career/story";
import { ALLY, policeLevels, roads } from "@racer/career/tables";
import type { RoadId } from "@racer/career/tables";
import { rivals } from "@racer/sim/cast";
import { Confirm } from "@racer/ui/components/confirm";
import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { formatMoney } from "@racer/ui/components/money";
import { Screen } from "@racer/ui/components/screen";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { flyers, plates } from "../../assets/clubhouse-art.ts";
import {
  barCast,
  firstRoad,
  openRoads,
  preload,
  roadPlates,
} from "../../career/bar.ts";
import {
  ENVELOPE_INSIDE,
  firstPrize,
  introCards,
  levelName,
  vicCard,
} from "../../career/copy.ts";
import { bikeName, ordinal } from "../../career/format.ts";
import { boardNote, signedByVic } from "../../career/notes.ts";
import {
  BarBackdrop,
  BarLight,
  BarSeats,
  SpeechSticker,
  useBarClock,
} from "./clubhouse-bar.tsx";
import type { Speech } from "./clubhouse-bar.tsx";
import { Plate, place, Stage, stagePx } from "./clubhouse-stage.tsx";
import { Standings, WallNotes, WallPosters } from "./clubhouse-wall.tsx";
import type { WallNote } from "./clubhouse-wall.tsx";
import { standingTag, stepped, useEscape } from "./shared.tsx";

const WORDMARK = { h: 106, w: 405, x: 30, y: 16 } as const;
const BADGE = { h: 98, w: 82, x: 438, y: 24 } as const;
const STATUS = { h: 63, w: 1127, x: 522, y: 33 } as const;
const NAV = { h: 71, w: 1672, x: 0, y: 854 } as const;
const VIC = "Vic Lomax";

const roadKeys = {
  back: new Set(["ArrowUp", "w", "W"]),
  forward: new Set(["ArrowDown", "s", "S"]),
} as const;

const roadStep = (key: string): -1 | 0 | 1 => {
  if (roadKeys.forward.has(key)) {
    return 1;
  }
  return roadKeys.back.has(key) ? -1 : 0;
};

const heard = new Set<string>();

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

const promotionNote = ({ level, bikes }: LevelUp): WallNote => {
  const delivery =
    bikes.length === 0
      ? ""
      : ` New at the garage: ${bikes.map((bikeId) => bikeName(bikeId)).join(", ")}.`;
  return {
    signature: "V.",
    text: `Level ${level}. ${policeLevels[level].count} cops. 1st pays ${formatMoney(firstPrize(level))}.${delivery}`,
  };
};

const notesFor = (
  career: CareerState,
  promotion: LevelUp | undefined,
  openEnvelope: () => void
): readonly WallNote[] => {
  const debt = debtOf(career);
  const notes: WallNote[] = promotion ? [promotionNote(promotion)] : [];
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

const RoadPicker = ({
  roadName,
  onStep,
}: {
  readonly roadName: string;
  readonly onStep: (step: -1 | 1) => void;
}) => (
  <p className="text-paper/70 flex items-center gap-[0.5em] whitespace-nowrap">
    <button
      aria-label="Previous road"
      className="hover:text-neon-yellow px-[0.2em]"
      onClick={() => {
        onStep(-1);
      }}
      tabIndex={-1}
      type="button"
    >
      ◀
    </button>
    <span className="text-neon-yellow min-w-[8.5em] text-center">
      {roadName}
    </span>
    <button
      aria-label="Next road"
      className="hover:text-neon-yellow px-[0.2em]"
      onClick={() => {
        onStep(1);
      }}
      tabIndex={-1}
      type="button"
    >
      ▶
    </button>
  </p>
);

const ClubhouseNav = ({
  roadName,
  onStep,
  onRide,
  onGarage,
  onBackRoom,
}: {
  readonly roadName: string;
  readonly onStep: (step: -1 | 1) => void;
  readonly onRide: () => void;
  readonly onGarage: () => void;
  readonly onBackRoom: () => void;
}) => {
  const items = [
    { id: "ride", label: "Ride", run: onRide },
    { id: "garage", label: "Garage", run: onGarage },
    { id: "back-room", label: "Back room", run: onBackRoom },
  ];
  return (
    <nav
      className="bg-ink/90 font-display flex items-center justify-between border-y border-white/10 px-[3.6cqw] font-bold uppercase"
      style={{ ...place(NAV), fontSize: stagePx(33) }}
    >
      <MenuList
        autoFocus
        className="flex-nowrap gap-x-[2.4cqw]"
        defaultValue="ride"
        label="Clubhouse"
        onKeyDown={(event) => {
          const step = roadStep(event.key);
          if (step !== 0) {
            event.preventDefault();
            onStep(step);
          }
        }}
        onSelect={(id) => items.find((item) => item.id === id)?.run()}
        orientation="horizontal"
        size="sm"
      >
        {items.map((item) => (
          <MenuItem
            className="data-selected:text-neon-yellow data-selected:outline-neon-yellow px-[0.4em] !text-[1em] data-selected:outline-2"
            key={item.id}
            value={item.id}
          >
            {item.label}
          </MenuItem>
        ))}
      </MenuList>
      <RoadPicker onStep={onStep} roadName={roadName} />
    </nav>
  );
};

const vicLines = (
  career: CareerState,
  promotion: LevelUp | undefined
): readonly string[] => {
  if (promotion) {
    return [vicCard(promotion.level)];
  }
  return career.record.starts === 0 ? introCards : [];
};

const useVic = (lines: readonly string[]): Speech | null => {
  const [, setListened] = useState(0);
  const index = lines.findIndex((line) => !heard.has(line));
  const line = lines[index];
  if (line === undefined) {
    return null;
  }
  return {
    line,
    name: VIC,
    next: () => {
      heard.add(line);
      setListened((count) => count + 1);
    },
    tag: lines.length > 1 ? `${index + 1} / ${lines.length}` : undefined,
  };
};

const useRoad = (career: CareerState) => {
  const open = openRoads(career);
  const [picked, setPicked] = useState(() => firstRoad(career));
  const roadId = open.includes(picked) ? picked : firstRoad(career);
  useEffect(() => {
    void preload(roadPlates(career));
  }, [career]);
  return {
    roadId,
    step: (step: -1 | 1) => {
      setPicked(stepped(open, roadId, step));
    },
  };
};

const qualifiedStamp = (
  career: CareerState,
  roadId: RoadId
): string | undefined => {
  const status = roadsFor(career).roads.find((each) => each.road.id === roadId);
  return status?.qualified === true
    ? `Qualified ${ordinal(status.bestPlace)}`
    : undefined;
};

export const ClubhouseScreen = ({
  career,
  promotion,
  onRide,
  onGarage,
  onBackRoom,
  onEnvelope,
}: {
  readonly career: CareerState;
  readonly promotion: LevelUp | undefined;
  readonly onRide: (roadId: RoadId) => void;
  readonly onGarage: () => void;
  readonly onBackRoom: () => void;
  readonly onEnvelope: (take: boolean) => void;
}) => {
  const [envelope, setEnvelope] = useState(false);
  const clock = useBarClock();
  const board = roadsFor(career);
  const { roadId, step } = useRoad(career);
  const road = roads[roadId];
  const bar = useMemo(() => barCast(career, roadId), [career, roadId]);
  const rival = rivals[bar.boss];
  const ally = rival.id === ALLY && storyBeat(career).deeAlly;
  const vic = useVic(vicLines(career, promotion));
  const speech: Speech = vic ?? {
    line: bar.line.text,
    name: rival.name,
    tag:
      standingTag(ally, career.memory[rival.id].grudge) ??
      `Boss of ${road.name}`,
  };
  useEscape(onBackRoom, !envelope);
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
        <BarSeats rider={vic ? null : bar.boss} />
        <SpeechSticker speech={speech} />
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
          notes={notesFor(career, promotion, () => {
            setEnvelope(true);
          })}
        />
        <WallPosters
          bill={bar.bill}
          flyer={flyers[roadId]}
          onFlyer={() => {
            step(1);
          }}
          roadName={road.name}
          stamp={qualifiedStamp(career, roadId)}
          sticker={bar.sticker}
        />
        <BarLight clock={clock} />
        <ClubhouseNav
          onBackRoom={onBackRoom}
          onGarage={onGarage}
          onRide={() => {
            onRide(roadId);
          }}
          onStep={step}
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
