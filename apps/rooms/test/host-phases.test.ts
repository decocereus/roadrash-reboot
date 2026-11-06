import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import { HOST_PHASES, hostAfter, NEW_HOST } from "../src/host-phase.ts";
import type { HostEvent, HostPhase, HostState } from "../src/host-phase.ts";
import { createHost } from "../src/host.ts";
import { decodeRoomPreview, ROOM_PHASES, SEAT_QUIT } from "../src/messages.ts";
import {
  advanceHearing,
  createClock,
  fakeSocket,
  loadingRace,
  nearby,
  readyAll,
  readyPacket,
  sameBuild,
  START_DELAY_MS,
  TICK_MS,
} from "./host-harness.ts";

const RUN = "this race";
const EVENTS = {
  loadingOver: { kind: "loadingOver", run: RUN, startsAt: 3000 },
  raceBuilt: { kind: "raceBuilt", run: RUN },
  raceOver: { kind: "raceOver" },
  startMoment: { kind: "startMoment" },
} as const satisfies Record<HostEvent<string>["kind"], HostEvent<string>>;

const MOVES = {
  countdown: {
    loadingOver: null,
    raceBuilt: null,
    raceOver: null,
    startMoment: "racing",
  },
  loading: {
    loadingOver: "countdown",
    raceBuilt: null,
    raceOver: null,
    startMoment: null,
  },
  racing: {
    loadingOver: null,
    raceBuilt: null,
    raceOver: "waiting",
    startMoment: null,
  },
  waiting: {
    loadingOver: null,
    raceBuilt: "loading",
    raceOver: null,
    startMoment: null,
  },
} as const satisfies Record<
  HostPhase,
  Record<HostEvent<string>["kind"], HostPhase | null>
>;

const ROADS_TO = {
  countdown: ["raceBuilt", "loadingOver"],
  loading: ["raceBuilt"],
  racing: ["raceBuilt", "loadingOver", "startMoment"],
  waiting: [],
} as const satisfies Record<HostPhase, readonly HostEvent<string>["kind"][]>;

const KINDS = [
  "loadingOver",
  "raceBuilt",
  "raceOver",
  "startMoment",
] as const satisfies readonly HostEvent<string>["kind"][];

const hostIn = (phase: HostPhase): HostState<string> => {
  let state: HostState<string> = NEW_HOST;
  for (const kind of ROADS_TO[phase]) {
    const next: HostState<string> | null = hostAfter(state, EVENTS[kind]);
    if (!next) {
      throw new Error(`A host cannot reach ${phase} by ${kind}.`);
    }
    state = next;
  }
  return state;
};

describe("the moves a host may make", () => {
  it.each(
    HOST_PHASES.flatMap((from) =>
      KINDS.map((kind) => ({ from, kind, to: MOVES[from][kind] }))
    )
  )("$from hears $kind and becomes $to", ({ from, kind, to }) => {
    expect(hostAfter(hostIn(from), EVENTS[kind])?.phase ?? null).toBe(to);
  });

  it("starts from the moment the countdown named, and carries its race there", () => {
    expect(hostIn("racing")).toStrictEqual({
      phase: "racing",
      run: RUN,
      startedAt: 3000,
    });
  });

  it("forgets its race when the race is over", () => {
    expect(hostAfter(hostIn("racing"), EVENTS.raceOver)?.run).toBeNull();
  });

  it("will not count down for a race it is not loading", () => {
    expect(
      hostAfter(hostIn("loading"), {
        kind: "loadingOver",
        run: "an older race",
        startsAt: 3000,
      })
    ).toBeNull();
  });
});

describe("a host's status", () => {
  it("names each step of a race, and is waiting again when it ends", () => {
    const { clock, far, host, near } = loadingRace();
    const steps = [host.status().hostPhase];
    host.message(near, readyPacket(near));
    steps.push(host.status().hostPhase);
    host.message(far, readyPacket(far));
    steps.push(host.status().hostPhase);
    clock.advance(START_DELAY_MS - 1);
    steps.push(host.status().hostPhase);
    clock.advance(TICK_MS * 3);
    steps.push(host.status().hostPhase);
    host.gone(near, SEAT_QUIT);
    host.gone(far, SEAT_QUIT);
    steps.push(host.status().hostPhase);
    clock.advance(1000);
    steps.push(host.status().hostPhase);
    expect(steps).toStrictEqual([
      "loading",
      "loading",
      "countdown",
      "countdown",
      "racing",
      "racing",
      "waiting",
    ]);
  });

  it("counts down at the load deadline when a seat never loads", () => {
    const { clock, far, host, near } = loadingRace();
    host.message(near, readyPacket(near));
    advanceHearing(host, clock, [far, near], 19_000);
    expect(host.status().hostPhase).toBe("loading");
    advanceHearing(host, clock, [far, near], 1000);
    expect(host.status().hostPhase).toBe("countdown");
  });

  it("stays waiting before any race", () => {
    const clock = createClock();
    const host = createHost(clock);
    const socket = fakeSocket();
    expect(host.status().hostPhase).toBe("waiting");
    host.seat(socket, "Guest", nearby, sameBuild());
    expect(host.status().hostPhase).toBe("waiting");
    readyAll(host, [socket]);
    expect(host.status().hostPhase).toBe("loading");
  });

  it("gives a tab on the previous deploy a phase it can read at every step", () => {
    expect(ROOM_PHASES).toStrictEqual(["waiting", "racing"]);
    const clock = createClock();
    const host = createHost(clock);
    const socket = fakeSocket();
    host.seat(socket, "Guest", nearby, sameBuild());
    const read = () => {
      const status = host.status();
      return {
        decoded: Option.isSome(decodeRoomPreview(JSON.stringify(status))),
        hostPhase: status.hostPhase,
        phase: status.phase,
      };
    };
    const steps = [read()];
    readyAll(host, [socket]);
    steps.push(read());
    host.message(socket, readyPacket(socket));
    steps.push(read());
    clock.advance(START_DELAY_MS + TICK_MS * 3);
    steps.push(read());
    expect(steps).toStrictEqual([
      { decoded: true, hostPhase: "waiting", phase: "waiting" },
      { decoded: true, hostPhase: "loading", phase: "racing" },
      { decoded: true, hostPhase: "countdown", phase: "racing" },
      { decoded: true, hostPhase: "racing", phase: "racing" },
    ]);
  });
});
