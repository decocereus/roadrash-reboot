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
import { formatMoney } from "@racer/ui/components/money";
import { Screen } from "@racer/ui/components/screen";
import { useEffect, useMemo, useState } from "react";

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
  vicCard,
} from "../../career/copy.ts";
import { bikeName, ordinal } from "../../career/format.ts";
import { boardNote, signedByVic } from "../../career/notes.ts";
import { BarHeader, BarNav } from "./bar-chrome.tsx";
import {
  BarBackdrop,
  BarLight,
  BarSeats,
  SpeechSticker,
  useBarClock,
} from "./clubhouse-bar.tsx";
import type { Speech } from "./clubhouse-bar.tsx";
import { Stage } from "./clubhouse-stage.tsx";
import { Standings, WallNotes, WallPosters } from "./clubhouse-wall.tsx";
import type { WallNote } from "./clubhouse-wall.tsx";
import { standingTag, stepped, useEscape } from "./shared.tsx";

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
}) => (
  <BarNav
    actions={[
      { id: "ride", label: "Ride", run: onRide },
      { id: "garage", label: "Garage", run: onGarage },
      { id: "back-room", label: "Back room", run: onBackRoom },
    ]}
    label="Clubhouse"
    onKeyDown={(event) => {
      const step = roadStep(event.key);
      if (step !== 0) {
        event.preventDefault();
        onStep(step);
      }
    }}
    primary="ride"
  >
    <RoadPicker onStep={onStep} roadName={roadName} />
  </BarNav>
);

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
        <BarHeader career={career} />
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
