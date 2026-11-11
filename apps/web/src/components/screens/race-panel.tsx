import { pickWithin, practiceCareer, roadsFor } from "@racer/career/field";
import type { PracticePick } from "@racer/career/field";
import type { RaceRules } from "@racer/career/rules";
import type { CareerState } from "@racer/career/state";
import { ALLY, QUALIFYING_PLACE, roads } from "@racer/career/tables";
import type { RoadId } from "@racer/career/tables";
import type { RivalId } from "@racer/sim/cast";
import {
  PanelLine,
  PanelRule,
  PanelTitle,
} from "@racer/ui/components/kit-panel";
import { formatMoney } from "@racer/ui/components/money";
import {
  SkewButton,
  TextButton,
  TextLinks,
} from "@racer/ui/components/skew-button";

import { SAVE_UNREAD, saveErrors, shortNames } from "../../career/copy.ts";
import { careerEntry, nextRoad, planFor } from "../../career/flow.ts";
import { kilometres } from "../../career/format.ts";
import type { SaveState } from "../../career/save.ts";

const soloLine = (save: SaveState, rules: RaceRules | null): string | null => {
  if (save.status !== "ready" || rules === null) {
    return null;
  }
  const { career } = save;
  if (career.gameOver) {
    return "Career over. Start a new one.";
  }
  if (career.story.ending !== null) {
    return "Season over. Start a new one.";
  }
  return `Career, next up ${roads[nextRoad(rules, career)].name}.`;
};

export const HomePanel = ({
  save,
  rules,
  failure,
  onFind,
  onFriends,
  onSolo,
}: {
  readonly save: SaveState;
  readonly rules: RaceRules | null;
  readonly failure: string;
  readonly onFind: () => void;
  readonly onFriends: () => void;
  readonly onSolo: () => void;
}) => (
  <>
    <PanelTitle>Race</PanelTitle>
    <PanelRule />
    <SkewButton
      detail="Public lobby. Eight riders, one road."
      onClick={onFind}
      title="Find a race"
      tone="primary"
    />
    <SkewButton
      detail="Your own lobby. Send them the link."
      onClick={onFriends}
      title="Race friends"
    />
    <SkewButton
      detail={soloLine(save, rules) ?? "Career and single races."}
      onClick={onSolo}
      title="Ride solo"
    />
    {failure !== "" && (
      <PanelLine role="alert" tone="warn">
        Could not start the game: {failure}
      </PanelLine>
    )}
  </>
);

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

const standingOf = (career: CareerState, field: readonly RivalId[]): string => {
  const ally =
    career.story.deeAlly && field.includes(ALLY)
      ? ` ${shortNames[ALLY]} rides with you.`
      : "";
  const grudges = field
    .filter((rival) => career.memory[rival].grudge)
    .map((rival) => shortNames[rival]);
  const [first] = grudges;
  if (first === undefined) {
    return ally;
  }
  return grudges.length === 1
    ? `${ally} ${first} holds a grudge.`
    : `${ally} ${grudges.length} riders hold a grudge.`;
};

const stakesOf = (
  rules: RaceRules,
  career: CareerState,
  roadId: RoadId
): string => {
  const { setup } = planFor(rules, career, careerEntry(career, roadId));
  return `Top ${QUALIFYING_PLACE} qualify. ${plural(setup.field.length, "rival", "rivals")} and ${plural(setup.police.count, "cop", "cops")} on ${kilometres(setup.track.length)} km.${standingOf(career, setup.field)}`;
};

const careerOver = (career: CareerState): string | null => {
  if (career.gameOver) {
    return "Your career is over. You went broke.";
  }
  return career.story.ending === null
    ? null
    : "Your season is done. The crown is settled.";
};

const CareerPart = ({
  save,
  rules,
  onRide,
  onNewCareer,
  onStartOver,
}: {
  readonly save: SaveState;
  readonly rules: RaceRules;
  readonly onRide: (roadId: RoadId) => void;
  readonly onNewCareer: () => void;
  readonly onStartOver: () => void;
}) => {
  switch (save.status) {
    case "ready": {
      const { career } = save;
      const over = careerOver(career);
      if (over !== null) {
        return (
          <>
            <PanelLine>{over}</PanelLine>
            <SkewButton
              detail="Back to tier 1 with a fresh bike."
              onClick={onNewCareer}
              title="New career"
              tone="primary"
            />
          </>
        );
      }
      const roadId = nextRoad(rules, career);
      return (
        <>
          <PanelLine>
            Career. Tier {career.tier}. {formatMoney(career.cash)} in your
            pocket.
          </PanelLine>
          <SkewButton
            detail={`Next up, ${roads[roadId].name}.`}
            onClick={() => {
              onRide(roadId);
            }}
            title="Ride"
            tone="primary"
          />
          <PanelLine tone="quiet">{stakesOf(rules, career, roadId)}</PanelLine>
        </>
      );
    }
    case "corrupt": {
      return (
        <>
          <PanelLine role="alert" tone="warn">
            {saveErrors[save.error.kind]}
            {save.error.field === "" ? "." : ` (${save.error.field}).`}
          </PanelLine>
          <SkewButton
            detail="The old save stays in the browser as a backup."
            onClick={onStartOver}
            title="Start over"
          />
        </>
      );
    }
    case "unread": {
      return (
        <>
          <PanelLine role="alert" tone="warn">
            {SAVE_UNREAD}
          </PanelLine>
          <SkewButton
            onClick={() => {
              globalThis.location.reload();
            }}
            title="Try again"
          />
        </>
      );
    }
    case "elsewhere":
    case "empty":
    case "loading": {
      return null;
    }
    default: {
      return save satisfies never;
    }
  }
};

export const SoloPanel = ({
  save,
  rules,
  failure,
  pick,
  onPick,
  onRide,
  onRace,
  onNewCareer,
  onStartOver,
  onBack,
}: {
  readonly save: SaveState;
  readonly rules: RaceRules | null;
  readonly failure: string;
  readonly pick: PracticePick;
  readonly onPick: (pick: PracticePick) => void;
  readonly onRide: (roadId: RoadId) => void;
  readonly onRace: (roadId: RoadId) => void;
  readonly onNewCareer: () => void;
  readonly onStartOver: () => void;
  readonly onBack: () => void;
}) => {
  const career = save.status === "ready" ? save.career : null;
  const shown = pickWithin(pick, career);
  const roadIds =
    rules === null
      ? []
      : roadsFor(rules, practiceCareer(shown, 0)).roads.map(
          (status) => status.road.id
        );
  return (
    <>
      <PanelTitle>Ride solo</PanelTitle>
      <PanelRule />
      {rules === null ? (
        <>
          <PanelLine role="alert" tone="warn">
            Could not start the game: {failure}
          </PanelLine>
          <SkewButton
            onClick={() => {
              globalThis.location.reload();
            }}
            title="Try again"
            tone="primary"
          />
        </>
      ) : (
        <>
          <CareerPart
            onNewCareer={onNewCareer}
            onRide={onRide}
            onStartOver={onStartOver}
            rules={rules}
            save={save}
          />
          <PanelLine className="mt-2" tone="quiet">
            Single race. Pick a road. No money on it.
          </PanelLine>
          <div className="grid grid-cols-2 gap-3.5">
            {roadIds.map((roadId) => (
              <SkewButton
                aria-pressed={roadId === shown.roadId}
                key={roadId}
                onClick={() => {
                  onPick({ ...shown, roadId });
                }}
                size="slim"
                title={roads[roadId].name}
                tone={roadId === shown.roadId ? "picked" : "plain"}
              />
            ))}
            <SkewButton
              onClick={() => {
                onRace(shown.roadId);
              }}
              size="slim"
              title="Race"
              tone="primary"
            />
          </div>
        </>
      )}
      <TextLinks>
        <TextButton onClick={onBack}>Back</TextButton>
      </TextLinks>
    </>
  );
};
