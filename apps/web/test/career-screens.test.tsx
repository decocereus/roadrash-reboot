import { recordedRules } from "@racer/career/bench";
import type { PracticePick } from "@racer/career/field";
import { abandonedOutcome } from "@racer/career/outcome";
import { settleRace, startRace } from "@racer/career/settle";
import { newCareer } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { STARTING_BIKE } from "@racer/career/tables";
import { bikeIds } from "@racer/sim/bikes";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  careerEntry,
  planFor,
  rideEntry,
  settledRace,
} from "../src/career/flow.ts";
import { bikeName } from "../src/career/format.ts";
import type { SaveStorage } from "../src/career/save-storage.ts";
import { freshCareer } from "../src/career/save.ts";
import { ResultsScreen } from "../src/components/screens/results.tsx";
import { RouteBoardScreen } from "../src/components/screens/route-board.tsx";
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
  if (results.screen !== "results") {
    throw new Error("A settled career race opens Results.");
  }
  const markup = renderToStaticMarkup(
    <ResultsScreen
      canRaceAgain={false}
      career={settled.save.career}
      onContinue={vi.fn<() => void>()}
      onRaceAgain={vi.fn<() => void>()}
      repeatRun={false}
      report={results.report}
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

const stepperValue = (markup: string, label: string): string => {
  const [, value] =
    new RegExp(
      `>${label}</span>.*?data-slot="menu-step-value"[^>]*>([^<]+)<`,
      "u"
    ).exec(markup) ?? [];
  if (value === undefined) {
    throw new Error(`The route board shows a ${label} stepper.`);
  }
  return value;
};

const boardOf = (career: CareerState, pick: PracticePick) => {
  const markup = renderToStaticMarkup(
    <RouteBoardScreen
      career={career}
      onBack={vi.fn<() => void>()}
      onPick={vi.fn<(next: PracticePick) => void>()}
      onRace={vi.fn<() => void>()}
      pick={pick}
      ready
      rules={recordedRules}
    />
  );
  return {
    bike: stepperValue(markup, "Bike"),
    tier: stepperValue(markup, "Tier"),
  };
};

const raceOf = (career: CareerState, pick: PracticePick) => {
  const ride = viewAfter({ screen: "routeBoard" }, [
    {
      entry: rideEntry("quick", pick.roadId, career, pick, SEED),
      kind: "ridePicked",
    },
  ]);
  if (ride.screen !== "rideOut") {
    throw new Error("Race on the route board opens the ride out.");
  }
  const plan = planFor(recordedRules, career, ride.entry);
  return {
    bikeId: plan.bikeId,
    roadId: plan.setup.roadId,
    tier: plan.setup.tier,
  };
};

describe("the single race pick", () => {
  it("shows and rides the new career's tier and bike after a pick made in the career before it", () => {
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
      afterBoard: boardOf(next, pick),
      afterRace: raceOf(next, pick),
      beforeBoard: boardOf(veteran, pick),
      beforeRace: raceOf(veteran, pick),
    }).toStrictEqual({
      afterBoard: { bike: bikeName(STARTING_BIKE), tier: "1" },
      afterRace: { bikeId: STARTING_BIKE, roadId: ROAD, tier: 1 },
      beforeBoard: { bike: bikeName(fastBike), tier: "3" },
      beforeRace: { bikeId: fastBike, roadId: ROAD, tier: 3 },
    });
  });
});
