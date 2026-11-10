import { recordedRules } from "@racer/career/bench";
import type { PracticePick } from "@racer/career/field";
import { abandonedOutcome } from "@racer/career/outcome";
import { settleRace, startRace } from "@racer/career/settle";
import { newCareer } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { STARTING_BIKE } from "@racer/career/tables";
import { bikeIds } from "@racer/sim/bikes";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { careerEntry, planFor, rideEntry } from "../src/career/flow.ts";
import type { SaveStorage } from "../src/career/save-storage.ts";
import { freshCareer, settledRace } from "../src/career/save.ts";
import {
  CareerOver,
  SoloResults,
} from "../src/components/screens/results-panel.tsx";
import { SoloDoor } from "../src/components/solo-door.tsx";
import { stepNavigation } from "../src/navigation.ts";
import type { NavigationEvent, View } from "../src/navigation.ts";

const SEED = 31;
const ROAD = "breakwater-run";

const fresh = newCareer(SEED);

const viewAfter = (from: View, events: readonly NavigationEvent[]): View => {
  let view = from;
  for (const event of events) {
    view = stepNavigation(view, event).state;
  }
  return view;
};

const storageWith = (setItem: SaveStorage["setItem"]): (() => SaveStorage) => {
  const storage: SaveStorage = {
    getItem: () => null,
    removeItem: vi.fn<SaveStorage["removeItem"]>(),
    setItem,
  };
  return () => storage;
};

const resultsAfter = (open: () => SaveStorage) => {
  const begun = startRace(fresh, ROAD, SEED);
  if (!begun.started || !begun.career.activeRace) {
    throw new Error("A new career starts its first road.");
  }
  const settled = settledRace(
    open,
    settleRace(
      begun.career,
      abandonedOutcome(recordedRules, begun.career.activeRace)
    )
  );
  if (settled === null) {
    throw new Error("A race that started settles.");
  }
  const results = viewAfter(
    {
      plan: planFor(recordedRules, fresh, careerEntry(fresh, ROAD)),
      screen: "race",
      stage: { kind: "riding" },
    },
    [
      {
        kind: "raceSettled",
        report: settled.report,
        result: settled.report.result,
      },
      { kind: "raceOver" },
    ]
  );
  if (results.screen !== "bar" || results.panel.kind !== "results") {
    throw new Error("A settled career race opens Results in the bar.");
  }
  const markup = renderToStaticMarkup(
    <SoloResults
      canRaceAgain={false}
      onContinue={vi.fn<() => void>()}
      onRaceAgain={vi.fn<() => void>()}
      repeatRun={false}
      report={results.panel.report}
      riding={settled.save.career.bikeId}
    />
  );
  return {
    banner: settled.save.unsaved,
    notSaved: markup.includes("Settled, not saved"),
    saved: markup.includes("Settled and saved"),
  };
};

describe("the results of a career race", () => {
  it("say the race is not saved when the browser refused the settlement", () => {
    expect(
      resultsAfter(
        storageWith(() => {
          throw new Error("The quota is used up.");
        })
      )
    ).toStrictEqual({ banner: true, notSaved: true, saved: false });
  });

  it("say settled and saved when the settlement was written", () => {
    expect(
      resultsAfter(storageWith(vi.fn<SaveStorage["setItem"]>()))
    ).toStrictEqual({ banner: false, notSaved: false, saved: true });
  });
});

const raceOf = (career: CareerState, pick: PracticePick) => {
  const ride = viewAfter(
    { panel: { kind: "solo" }, screen: "bar", tab: "race" },
    [
      {
        entry: rideEntry("quick", pick.roadId, career, pick, SEED),
        kind: "ridePicked",
      },
    ]
  );
  if (ride.screen !== "bar" || ride.panel.kind !== "door") {
    throw new Error("Race on Ride solo opens the door.");
  }
  const plan = planFor(recordedRules, career, ride.panel.entry);
  return {
    bikeId: plan.bikeId,
    roadId: plan.setup.roadId,
    tier: plan.setup.tier,
  };
};

const overCardOf = (career: CareerState): string =>
  renderToStaticMarkup(
    <CareerOver
      career={career}
      onClose={vi.fn<() => void>()}
      onNewCareer={vi.fn<() => void>()}
    />
  );

describe("the career over card", () => {
  it("names a broke career and offers a new one or Close", () => {
    const markup = overCardOf({ ...fresh, gameOver: true });
    expect([
      markup.includes("Broke"),
      markup.includes("New career"),
      markup.includes("Close"),
    ]).toStrictEqual([true, true, true]);
  });

  it("keeps the ending's name and note", () => {
    const markup = overCardOf({
      ...fresh,
      story: { ...fresh.story, ending: "runner-up" },
    });
    expect([
      markup.includes("Runner-up"),
      markup.includes("Broke"),
    ]).toStrictEqual([true, false]);
  });
});

type SoloDoorProps = ComponentProps<typeof SoloDoor>;

const doorOf = (failure: string): string =>
  renderToStaticMarkup(
    <SoloDoor
      career={fresh}
      entry={careerEntry(fresh, ROAD)}
      failure={failure}
      onBack={vi.fn<() => void>()}
      onPrepare={vi.fn<SoloDoorProps["onPrepare"]>()}
      onStart={vi.fn<() => void>()}
      ready={false}
      rules={recordedRules}
    />
  );

describe("the solo door", () => {
  it("draws nothing while the race loads behind the open door", () => {
    expect(doorOf("")).toBe("");
  });

  it("says the game could not start and offers Back when the game failed to boot", () => {
    const markup = doorOf("The game chunk did not load.");
    expect([
      markup.includes("Could not start the game: The game chunk did not load."),
      markup.includes("Back"),
      markup.includes("Retry"),
    ]).toStrictEqual([true, true, false]);
  });
});

describe("the single race pick", () => {
  it("rides the new career's tier and bike after a pick made in the career before it", () => {
    const fastBike = bikeIds.find((bike) => bike !== STARTING_BIKE);
    if (fastBike === undefined) {
      throw new Error("The game has a second bike.");
    }
    const veteran: CareerState = {
      ...fresh,
      bikeId: fastBike,
      garage: [STARTING_BIKE, fastBike],
      tier: 3,
    };
    const pick: PracticePick = { bikeId: fastBike, roadId: ROAD, tier: 3 };
    const next = freshCareer(0.5);
    expect({
      afterRace: raceOf(next, pick),
      beforeRace: raceOf(veteran, pick),
    }).toStrictEqual({
      afterRace: { bikeId: STARTING_BIKE, roadId: ROAD, tier: 1 },
      beforeRace: { bikeId: fastBike, roadId: ROAD, tier: 3 },
    });
  });
});
