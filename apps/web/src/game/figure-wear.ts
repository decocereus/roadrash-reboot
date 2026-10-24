import type { RiderView } from "@racer/sim/race-view";
import { PLAYER_RIDER } from "@racer/sim/state";
import type { RiderId } from "@racer/sim/state";

export const celebrityIds = ["kylie", "ronaldo"] as const;

export type CelebrityId = (typeof celebrityIds)[number];

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
  riders: readonly RiderView[]
): ReadonlyMap<RiderId, CelebrityId> => {
  const worn = new Map<RiderId, CelebrityId>();
  if (as !== null) {
    worn.set(PLAYER_RIDER, as);
  }
  const waiting = [...against];
  for (const rider of riders) {
    if (rider.id === PLAYER_RIDER || rider.profile.role !== "racer") {
      continue;
    }
    const celebrity = waiting.shift();
    if (celebrity === undefined) {
      break;
    }
    worn.set(rider.id, celebrity);
  }
  return worn;
};
