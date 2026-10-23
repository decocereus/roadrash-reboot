import { preRaceLine } from "@racer/career/lines";
import type { CareerState } from "@racer/career/state";
import { ALLY, roads } from "@racer/career/tables";
import { Screen } from "@racer/ui/components/screen";
import { cn } from "@racer/ui/utils";

import { flyers, plates } from "../../assets/clubhouse-art.ts";
import { shortNames } from "../../career/copy.ts";
import {
  copCount,
  kilometres,
  shortBike,
  weaponLabel,
} from "../../career/format.ts";
import type { RacePlan } from "../../game/hud.ts";
import { standingTag, useEscape } from "./shared.tsx";

const kitOf = (bike: string, weapon: string): string =>
  weapon === "" ? shortBike(bike) : `${shortBike(bike)} · ${weapon}`;

const GridRow = ({
  slot,
  name,
  kit,
  tag,
  you = false,
}: {
  readonly slot: number;
  readonly name: string;
  readonly kit: string;
  readonly tag?: string | undefined;
  readonly you?: boolean;
}) => (
  <li
    className={cn(
      "grid grid-cols-[1.6em_1fr_auto] items-baseline gap-x-3 px-2 py-0.5",
      you && "bg-neon-yellow text-ink"
    )}
  >
    <span className="numeric opacity-70">{slot}</span>
    <span>
      {name}
      {tag !== undefined && (
        <span className="text-neon-red ml-2 text-[0.6em]">{tag}</span>
      )}
    </span>
    <span className={cn("text-[0.7em]", you ? "" : "text-paper/60")}>
      {kit}
    </span>
  </li>
);

export const RideOutScreen = ({
  plan,
  career,
  ready,
  failure,
  onBack,
}: {
  readonly plan: RacePlan;
  readonly career: CareerState | null;
  readonly ready: boolean;
  readonly failure: string;
  readonly onBack: () => void;
}) => {
  const { setup } = plan;
  const road = roads[setup.roadId];
  const quick = plan.mode === "quick";
  const speaker = career && !quick ? preRaceLine(career, setup) : null;
  useEscape(onBack);
  return (
    <Screen
      className="bg-ink"
      enter="fade"
      style={{
        backgroundImage: `linear-gradient(rgb(14 15 18 / 85%), rgb(14 15 18 / 85%)), url(${plates.wall})`,
        backgroundSize: "60vw auto",
      }}
    >
      <div className="flex flex-1 items-center justify-center gap-[4vw] px-[5vw]">
        <img
          alt={`${road.name} flyer`}
          className="max-h-[82dvh] w-[38vw] -rotate-2 object-contain"
          draggable={false}
          src={flyers[road.id]}
        />
        <section
          aria-label="Riding out"
          className="font-display text-paper flex w-[34vw] flex-col gap-4 font-bold uppercase"
        >
          <p className="text-neon-cyan tracking-wide">
            {quick ? "Single race" : `Level ${setup.level} · Top 3 qualifies`}
          </p>
          <h1 className="font-stencil text-[5vw] leading-none">{road.name}</h1>
          <p className="text-paper/70 tracking-wide">
            {kilometres(setup.track.length)} km · {copCount(setup.police.count)}
          </p>
          <ol className="flex flex-col text-[1.35vw] leading-tight">
            {setup.field.map((rival, slot) => {
              const entrant = setup.rivals[slot];
              if (!entrant) {
                return null;
              }
              const ally =
                !quick && rival === ALLY && career?.story.deeAlly === true;
              const grudge = !quick && career?.memory[rival].grudge === true;
              return (
                <GridRow
                  key={rival}
                  kit={kitOf(entrant.bike.name, weaponLabel(entrant.weapon))}
                  name={shortNames[rival]}
                  slot={slot + 1}
                  tag={standingTag(ally, grudge)}
                />
              );
            })}
            <GridRow
              kit={kitOf(
                setup.player.bike.name,
                weaponLabel(setup.player.weapon)
              )}
              name="You"
              slot={setup.field.length + 1}
              you
            />
          </ol>
          {speaker && (
            <blockquote className="text-paper/90 border-neon-magenta border-l-4 pl-3 text-[1.3vw] leading-snug normal-case">
              <span className="text-neon-magenta uppercase">
                {shortNames[speaker.rival]}:
              </span>{" "}
              “{speaker.text}”
            </blockquote>
          )}
          {failure === "" ? (
            <p
              aria-live="polite"
              className={cn(
                "tracking-wide",
                ready ? "text-neon-yellow" : "text-paper/60"
              )}
            >
              {ready ? "Ride" : "Loading the road"}
            </p>
          ) : (
            <p className="text-neon-red normal-case" role="alert">
              Could not start the game: {failure}
            </p>
          )}
        </section>
      </div>
    </Screen>
  );
};
