import { recordedRules } from "@racer/career/bench";
import { abandonedOutcome } from "@racer/career/outcome";
import { settleRace, startRace } from "@racer/career/settle";
import { newCareer } from "@racer/career/state";
import type { CareerState } from "@racer/career/state";
import { STARTING_BIKE } from "@racer/career/tables";
import { bikeIds } from "@racer/sim/bikes";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  careerReport,
  pickWithin,
  planFor,
  quickEntry,
} from "../src/career/flow.ts";
import type { QuickPick } from "../src/career/flow.ts";
import type { SaveStorage } from "../src/career/save-storage.ts";
import { freshCareer, isUnsaved, storeCareer } from "../src/career/save.ts";
import { ResultsScreen } from "../src/components/screens/results.tsx";

const SEED = 31;
const ROAD = "breakwater-run";

const settled = () => {
  const begun = startRace(newCareer(SEED), ROAD, SEED);
  if (!begun.started || !begun.career.activeRace) {
    throw new Error("A new career starts its first road.");
  }
  const settlement = settleRace(
    begun.career,
    abandonedOutcome(recordedRules, begun.career.activeRace)
  );
  if (!settlement.settled || !settlement.career.lastResult) {
    throw new Error("A race that started settles.");
  }
  return {
    career: settlement.career,
    report: careerReport(settlement.career.lastResult),
  };
};

const storageWith = (setItem: SaveStorage["setItem"]): (() => SaveStorage) => {
  const storage: SaveStorage = {
    getItem: () => null,
    removeItem: vi.fn<SaveStorage["removeItem"]>(),
    setItem,
  };
  return () => storage;
};

const resultsAfter = (open: () => SaveStorage): string => {
  const { career, report } = settled();
  return renderToStaticMarkup(
    <ResultsScreen
      canRaceAgain={false}
      career={career}
      onContinue={vi.fn<() => void>()}
      onRaceAgain={vi.fn<() => void>()}
      repeatRun={false}
      report={report}
      riding={career.bikeId}
      unsaved={isUnsaved(storeCareer(open, career))}
    />
  );
};

describe("the results of a career race", () => {
  it("say the race is not saved when the browser refused the settlement", () => {
    const markup = resultsAfter(
      storageWith(() => {
        throw new Error("The quota is used up.");
      })
    );
    expect({
      notSaved: markup.includes("Settled, not saved"),
      saved: markup.includes("Settled and saved"),
    }).toStrictEqual({ notSaved: true, saved: false });
  });

  it("say settled and saved when the settlement was written", () => {
    const markup = resultsAfter(storageWith(vi.fn<SaveStorage["setItem"]>()));
    expect({
      notSaved: markup.includes("Settled, not saved"),
      saved: markup.includes("Settled and saved"),
    }).toStrictEqual({ notSaved: false, saved: true });
  });
});

describe("the route board pick", () => {
  it("rides the new career's tier and bike after a pick made in the career before it", () => {
    const fastBike = bikeIds.find((bike) => bike !== STARTING_BIKE);
    if (fastBike === undefined) {
      throw new Error("The game has a second bike.");
    }
    const veteran: CareerState = {
      ...newCareer(SEED),
      bikeId: fastBike,
      garage: [STARTING_BIKE, fastBike],
      tier: 3,
    };
    const pick: QuickPick = { bikeId: fastBike, roadId: ROAD, tier: 3 };
    expect(pickWithin(pick, veteran)).toStrictEqual(pick);
    const next = freshCareer(0.5);
    const plan = planFor(
      recordedRules,
      next,
      quickEntry(pickWithin(pick, next), SEED)
    );
    expect({
      bikeId: plan.bikeId,
      roadId: plan.setup.roadId,
      tier: plan.setup.tier,
    }).toStrictEqual({ bikeId: STARTING_BIKE, roadId: ROAD, tier: 1 });
  });
});
