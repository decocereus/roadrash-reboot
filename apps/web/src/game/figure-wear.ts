import type { CareerRaceSetup } from "@racer/career/field";
import { celebrityIds, celebrityModels, isCelebrity } from "@racer/sim/cast";
import type { CelebrityId } from "@racer/sim/cast";
import { PLAYER_RIDER, rosterOf } from "@racer/sim/state";
import type { RiderId } from "@racer/sim/state";

export interface Wearing {
  readonly as: CelebrityId | null;
  readonly against: readonly CelebrityId[];
}

export const wearingNothing: Wearing = { against: [], as: null };

const celebritiesNamed = (name: string | null): CelebrityId[] =>
  celebrityIds.filter((id) => id === name);

export const wearingFrom = (search: string): Wearing => {
  const flags = new URLSearchParams(search);
  const [as = null] = celebritiesNamed(flags.get("as"));
  return {
    against: (flags.get("against") ?? "").split(",").flatMap(celebritiesNamed),
    as,
  };
};

export const wornBy = (
  { against, as }: Wearing,
  setup: CareerRaceSetup
): ReadonlyMap<RiderId, CelebrityId> => {
  const worn = new Map<RiderId, CelebrityId>();
  if (as !== null) {
    worn.set(PLAYER_RIDER, as);
  }
  const waiting = [...against];
  const { rivals } = rosterOf(setup);
  for (let slot = 0; slot < rivals.length; slot += 1) {
    const rider = rivals[slot];
    const rival = setup.field[slot];
    const named = waiting.shift();
    if (rider !== undefined && named !== undefined) {
      worn.set(rider, named);
    } else if (
      rider !== undefined &&
      rival !== undefined &&
      isCelebrity(rival)
    ) {
      worn.set(rider, celebrityModels[rival]);
    }
  }
  return worn;
};
