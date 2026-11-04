import { monitorEventLoopDelay } from "node:perf_hooks";

import * as Clock from "effect/Clock";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

import { decodeClientPlan, encodeClientResult } from "./load-plan.ts";
import type { ClientPlan } from "./load-plan.ts";
import { sleepUntil } from "./machine.ts";
import { openSeat } from "./seat.ts";
import { capWebSocketSends } from "./send-budget.ts";
import { createLoadTally, openThinSeat } from "./thin-seat.ts";
import type { LoadTally } from "./thin-seat.ts";

const CHECK_CAP_EVERY_MS = 100;
const NANOS_PER_MS = 1e6;

interface Rider {
  readonly leave: () => void;
}

const gapsOf = (tally: LoadTally): readonly (readonly [number, number])[] =>
  [...tally.gaps.entries()].filter(([, count]) => count > 0);

const seatAll = (plan: ClientPlan, tally: LoadTally) => {
  const full = plan.seats
    .filter((seat) => seat.full)
    .map((seat) => ({
      open: openSeat(plan.url, seat.roomId, plan.build),
      plan: seat,
    }));
  const thin = plan.seats
    .filter((seat) => !seat.full)
    .map((seat) => ({
      open: openThinSeat(
        plan.url,
        seat.roomId,
        plan.inputEvery,
        tally,
        plan.build
      ),
      plan: seat,
    }));
  const riders: readonly Rider[] = [...full, ...thin].map(({ open }) => ({
    leave: open.leave,
  }));
  return { full: full.map(({ open }) => open), riders };
};

export const clientsMain = Effect.fn("rooms.load.clients")(
  function* clientsMain(planJson: string) {
    const plan = yield* decodeClientPlan(planJson);
    const budget = capWebSocketSends(plan.mostSent);
    const tally = createLoadTally();
    const { full, riders } = seatAll(plan, tally);
    yield* sleepUntil(plan.startAt);
    const loop = monitorEventLoopDelay({ resolution: 5 });
    loop.enable();
    while (!budget.capped() && (yield* Clock.currentTimeMillis) < plan.endAt) {
      yield* Effect.sleep(CHECK_CAP_EVERY_MS);
    }
    loop.disable();
    const reports = full.map((seat) => seat.report());
    for (const rider of riders) {
      rider.leave();
    }
    yield* Console.log(
      encodeClientResult({
        capped: budget.capped(),
        full: reports,
        gaps: gapsOf(tally),
        heard: tally.heard,
        loopMaxMs: loop.max / NANOS_PER_MS,
        loopP99Ms: loop.percentile(99) / NANOS_PER_MS,
        lost: tally.lost,
        refused: tally.refused,
        sent: budget.spent(),
        worstRttMs: tally.worstRttMs,
      })
    );
  }
);
