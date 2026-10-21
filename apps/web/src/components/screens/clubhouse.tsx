import { roadsFor } from "@racer/career/field";
import { preRaceLine } from "@racer/career/lines";
import { seasonBoard } from "@racer/career/season";
import type { BoardRow } from "@racer/career/season";
import { creditLimit, debtOf } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { ENVELOPE_NOTE, storyBeat } from "@racer/career/story";
import { ALLY, roadList, roads, tradeInOf } from "@racer/career/tables";
import { bikes } from "@racer/sim/bikes";
import { rivals } from "@racer/sim/cast";
import { defaultPlayer } from "@racer/sim/race";
import { regions } from "@racer/track/regions";
import { AdSlot } from "@racer/ui/components/ad-slot";
import { Confirm } from "@racer/ui/components/confirm";
import { CorkBoard, CorkNote } from "@racer/ui/components/cork-note";
import { Heading } from "@racer/ui/components/heading";
import { formatMoney, Money } from "@racer/ui/components/money";
import { Panel } from "@racer/ui/components/panel";
import { Postcard } from "@racer/ui/components/postcard";
import { RiderCard, RiderPortrait } from "@racer/ui/components/rider-card";
import { Screen, ScreenBody, ScreenStrip } from "@racer/ui/components/screen";
import { Stat } from "@racer/ui/components/stat";
import { useMemo, useState } from "react";

import { riderColours } from "../../career/colours.ts";
import {
  classNames,
  ENVELOPE_INSIDE,
  levelName,
  shortNames,
} from "../../career/copy.ts";
import { careerEntry, planFor } from "../../career/flow.ts";
import { bikeName } from "../../career/format.ts";
import { boardNote, signedByVic } from "../../career/notes.ts";
import { ActionMenu, useEscape } from "./shared.tsx";

const POLAROIDS = 3;
const tilts = [-3, 2, -1.5, 3] as const;
const noteTilts = [-1.5, 1.5, -0.5] as const;
const notePins = ["red", "blue", "green"] as const;
const SOON = "Soon";

const polaroidRows = (career: CareerState): readonly BoardRow[] => {
  const rows = seasonBoard(career);
  const top = rows.slice(0, POLAROIDS);
  const mine = rows.find((row) => row.racer === "player");
  return mine && !top.includes(mine) ? [...top, mine] : top;
};

function Polaroid({
  row,
  career,
  tilt,
}: {
  readonly row: BoardRow;
  readonly career: CareerState;
  readonly tilt: number;
}) {
  const you = row.racer === "player";
  const profile = row.racer === "player" ? defaultPlayer : rivals[row.racer];
  const caption = you
    ? `${row.points} · ${career.level === 1 ? "New meat" : "Kid can ride"}`
    : `${row.points}`;
  return (
    <Postcard
      caption={caption}
      pin={you ? "yellow" : "red"}
      scene={
        <RiderPortrait
          className="h-full border-b-0"
          colours={riderColours(profile)}
        />
      }
      size="xs"
      tilt={tilt}
      title={row.racer === "player" ? "You" : shortNames[row.racer]}
    />
  );
}

export function ClubhouseScreen({
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
}) {
  const [envelope, setEnvelope] = useState(false);
  const board = roadsFor(career);
  const beat = storyBeat(career);
  const debt = debtOf(career);
  const nextRoad =
    board.next ?? board.roads.find((status) => status.open)?.road.id;
  const speaker = useMemo(() => {
    const roadId = nextRoad ?? roadList[0]?.id;
    return roadId === undefined
      ? null
      : preRaceLine(career, planFor(career, careerEntry(career, roadId)).setup);
  }, [career, nextRoad]);
  const rival = speaker ? rivals[speaker.rival] : null;
  const ally = rival?.id === ALLY && beat.deeAlly;
  useEscape(onTitle, !envelope);
  return (
    <Screen enter="fade">
      <ScreenStrip>
        <Heading as="h1">The Lowside</Heading>
        <div className="flex flex-wrap gap-x-10 gap-y-2">
          <Stat
            label={`Level ${career.level}`}
            size="sm"
            value={levelName(career.level)}
          />
          <Stat
            label="Roads"
            size="sm"
            value={`${board.qualifiedCount} / ${board.roads.length} qualified`}
          />
          <Stat label="Bike" size="sm" value={bikeName(career.bikeId)} />
          <Stat
            align="right"
            label={debt > 0 ? "Owed" : "Cash"}
            size="sm"
            tone={debt > 0 ? "red" : "green"}
            value={formatMoney(Math.abs(career.cash))}
          />
        </div>
      </ScreenStrip>
      {debt > 0 && (
        <p className="bg-red/15 text-red px-gutter text-label py-2 font-semibold uppercase">
          You owe {formatMoney(debt)}. Prize money pays it first. Limit{" "}
          {formatMoney(creditLimit(career))}.
        </p>
      )}
      <ScreenBody
        className="grid grid-cols-[1.7fr_1fr_0.8fr] gap-6 overflow-y-auto"
        inert={envelope ? true : undefined}
      >
        <CorkBoard className="flex flex-col gap-5 p-5">
          <Heading as="h2" size="sm" tone="ink">
            The board
          </Heading>
          <div className="flex flex-wrap gap-4">
            {polaroidRows(career).map((row, index) => (
              <Polaroid
                career={career}
                key={row.racer}
                row={row}
                tilt={tilts[index] ?? 0}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-start gap-5">
            {beat.envelopeOpen && (
              <button
                className="rounded-sm"
                onClick={() => {
                  setEnvelope(true);
                }}
                type="button"
              >
                <CorkNote
                  hand="typed"
                  pin="yellow"
                  signature="Open it"
                  tilt={2}
                >
                  An envelope with your name on it.
                </CorkNote>
              </button>
            )}
            {career.board.map((note, index) => (
              <CorkNote
                hand={signedByVic(note) ? "typed" : "marker"}
                key={`${note.kind}-${index}`}
                pin={notePins[index] ?? "red"}
                signature={signedByVic(note) ? "V." : undefined}
                tilt={noteTilts[index] ?? 0}
              >
                {boardNote(note)}
              </CorkNote>
            ))}
            {career.board.length === 0 && !beat.envelopeOpen && (
              <CorkNote hand="typed" pin="green" signature="V." tilt={-1}>
                Top three on all five roads and you move up.
              </CorkNote>
            )}
          </div>
          <AdSlot className="mt-auto" label="Poster · advertisement" />
        </CorkBoard>
        <div className="flex flex-col gap-3">
          <Heading as="h2" size="sm" tone="muted">
            At the bar
          </Heading>
          {rival && speaker ? (
            <RiderCard
              aggression={rival.aggression}
              className="w-full"
              colours={riderColours(rival)}
              home={regions[rival.home].name}
              line={speaker.text}
              name={rival.name}
              skill={rival.skill}
              tag={
                ally
                  ? "On your side"
                  : career.memory[rival.id].grudge
                    ? "Holds a grudge"
                    : undefined
              }
            />
          ) : (
            <Panel>Nobody is at the bar.</Panel>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <Heading as="h2" size="sm" tone="muted">
            Out back
          </Heading>
          <Panel className="flex flex-col gap-3">
            <Stat
              label={classNames[bikes[career.bikeId].bikeClass]}
              size="sm"
              value={bikeName(career.bikeId)}
            />
            <Stat
              label="Trade-in"
              layout="row"
              size="sm"
              value={<Money amount={tradeInOf(career.bikeId)} />}
            />
            <Stat
              label="Credit limit"
              layout="row"
              size="sm"
              value={<Money amount={creditLimit(career)} />}
            />
          </Panel>
          <Panel className="flex flex-col gap-3">
            <Stat
              label="Races"
              layout="row"
              size="sm"
              value={career.record.starts}
            />
            <Stat
              label="Wins"
              layout="row"
              size="sm"
              value={career.record.wins}
            />
            <Stat
              label="Knockdowns"
              layout="row"
              size="sm"
              value={career.record.knockdowns}
            />
          </Panel>
        </div>
      </ScreenBody>
      <ScreenStrip edge="bottom" inert={envelope ? true : undefined}>
        <ActionMenu
          actions={[
            { id: "title", label: "Title", run: onTitle },
            { id: "garage", label: "Garage", run: onGarage },
            {
              disabled: true,
              id: "back-room",
              label: "Back room",
              trailing: SOON,
            },
            {
              detail:
                nextRoad === undefined
                  ? undefined
                  : `Next: ${roads[nextRoad].name}`,
              id: "route-board",
              label: "Route board",
              run: onRouteBoard,
            },
          ]}
          className="w-full justify-between"
          label="Clubhouse"
          primary="route-board"
        />
      </ScreenStrip>
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
}
