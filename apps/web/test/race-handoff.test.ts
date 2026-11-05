import { describe, expect, it } from "vitest";

import { preparedRace, preparedRaces } from "../src/prepare-outcome.ts";
import type { PrepareOutcome } from "../src/prepare-outcome.ts";
import {
  rideOutSignals,
  roomSignals,
  stepRideOut,
  stepRoom,
} from "../src/race-handoff.ts";
import type {
  RideOutEvent,
  RideOutHandoff,
  RoomEvent,
  RoomHandoff,
  Step,
} from "../src/race-handoff.ts";

const RIDE = "the ride";
type Ride = typeof RIDE;

const failedAt = (
  stage: Extract<PrepareOutcome, { readonly kind: "failed" }>["stage"]
): PrepareOutcome => ({ cause: new Error(stage), kind: "failed", stage });

const FIRST_RIDE_OUT: RideOutHandoff<Ride> = {
  kind: "waitingForGame",
  ride: RIDE,
};

const FIRST_ROOM: RoomHandoff<Ride> = { kind: "lobby" };

const BEGUN: RoomEvent<Ride> = { kind: "raceBegun", ride: RIDE };

const walk = <State extends { readonly kind: string }, Event>(
  step: (state: State, event: Event) => Step<State, { readonly kind: string }>,
  first: State,
  events: readonly Event[]
) => {
  let at = first;
  const effects: string[] = [];
  for (const event of events) {
    const { effect, state } = step(at, event);
    at = state;
    if (effect) {
      effects.push(effect.kind);
    }
  }
  return { effects, state: at.kind };
};

const rideOut = (...kinds: readonly RideOutEvent["kind"][]) =>
  walk(
    stepRideOut<Ride>,
    FIRST_RIDE_OUT,
    kinds.map((kind) => ({ kind }))
  );

const room = (...events: readonly RoomEvent<Ride>[]) =>
  walk(stepRoom<Ride>, FIRST_ROOM, events);

const sequences = <Item>(
  items: readonly Item[],
  length: number
): readonly (readonly Item[])[] =>
  length === 0
    ? [[]]
    : sequences(items, length - 1).flatMap((head) =>
        items.map((item) => [...head, item])
      );

const countOf = (items: readonly string[], item: string): number =>
  items.filter((each) => each === item).length;

const upToEffect = <Event>(
  events: readonly Event[],
  run: (prefix: readonly Event[]) => readonly string[],
  effect: string
): readonly Event[] =>
  events.slice(
    0,
    events.findIndex((_, end) =>
      run(events.slice(0, end + 1)).includes(effect)
    ) + 1
  );

const rideOutRulesHold = (events: readonly RideOutEvent["kind"][]): boolean => {
  const { effects } = rideOut(...events);
  const toStart = upToEffect(
    events,
    (prefix) => rideOut(...prefix).effects,
    "start"
  );
  const startRules =
    !effects.includes("start") ||
    (toStart.includes("gameReady") &&
      toStart.includes("built") &&
      toStart.includes("dwellElapsed") &&
      !toStart.includes("closed"));
  return (
    countOf(effects, "start") < 2 &&
    countOf(effects, "prepare") <= 1 + countOf(events, "retry") &&
    startRules
  );
};

const roomRulesHold = (events: readonly RoomEvent<Ride>[]): boolean => {
  const { effects } = room(...events);
  const reported = effects.includes("reportLoaded");
  const started = effects.includes("start");
  const kindsUpTo = (effect: string): readonly string[] =>
    upToEffect(events, (prefix) => room(...prefix).effects, effect).map(
      (event) => event.kind
    );
  const toReport = kindsUpTo("reportLoaded");
  const toStart = kindsUpTo("start");
  return (
    countOf(effects, "prepare") < 2 &&
    countOf(effects, "reportLoaded") < 2 &&
    countOf(effects, "start") < 2 &&
    !(effects.includes("leave") && (reported || started)) &&
    (!reported ||
      (toReport.includes("raceBegun") &&
        toReport.includes("built") &&
        toReport.includes("doorElapsed"))) &&
    (!started ||
      (effects.indexOf("reportLoaded") < effects.indexOf("start") &&
        toStart.at(-1) === "roomRacing"))
  );
};

describe("a solo ride-out", () => {
  it("waits for the game before it prepares", () => {
    expect(rideOut("dwellElapsed")).toStrictEqual({
      effects: [],
      state: "waitingForGameDwelt",
    });
    expect(rideOut("dwellElapsed", "gameReady").effects).toStrictEqual([
      "prepare",
    ]);
    expect(rideOut("gameReady").effects).toStrictEqual(["prepare"]);
  });

  it("prepares once however often the game says it is ready", () => {
    expect(rideOut("gameReady", "gameReady").effects).toStrictEqual([
      "prepare",
    ]);
    expect(rideOut("gameReady", "missing", "gameReady").effects).toStrictEqual([
      "prepare",
    ]);
  });

  it("starts once the race is built and the dwell is over, in either order", () => {
    expect(rideOut("gameReady", "built")).toStrictEqual({
      effects: ["prepare"],
      state: "dwelling",
    });
    expect(rideOut("gameReady", "built", "dwellElapsed")).toStrictEqual({
      effects: ["prepare", "start"],
      state: "started",
    });
    expect(rideOut("gameReady", "dwellElapsed")).toStrictEqual({
      effects: ["prepare"],
      state: "preparingDwelt",
    });
    expect(rideOut("gameReady", "dwellElapsed", "built")).toStrictEqual({
      effects: ["prepare", "start"],
      state: "started",
    });
  });

  it("offers Retry after a missing race and prepares again when pressed", () => {
    const race = preparedRace(failedAt("dress"));
    expect(rideOut("gameReady", race)).toStrictEqual({
      effects: ["prepare"],
      state: "failed",
    });
    expect(rideOut("gameReady", race, "retry")).toStrictEqual({
      effects: ["prepare", "prepare"],
      state: "preparing",
    });
  });

  it("does not wait out the dwell again after a Retry", () => {
    expect(
      rideOut("gameReady", "missing", "dwellElapsed", "retry", "built")
    ).toStrictEqual({
      effects: ["prepare", "prepare", "start"],
      state: "started",
    });
    expect(
      rideOut("gameReady", "dwellElapsed", "missing", "retry", "built").effects
    ).toStrictEqual(["prepare", "prepare", "start"]);
  });

  it("still waits out the dwell when a Retry comes before it ends", () => {
    expect(rideOut("gameReady", "missing", "retry", "built")).toStrictEqual({
      effects: ["prepare", "prepare"],
      state: "dwelling",
    });
  });

  it("ignores Retry unless the load failed", () => {
    expect(rideOut("retry").effects).toStrictEqual([]);
    expect(rideOut("gameReady", "retry").effects).toStrictEqual(["prepare"]);
    expect(rideOut("gameReady", "built", "retry").state).toBe("dwelling");
  });

  it("changes nothing when a preparation is cancelled", () => {
    expect(rideOut("gameReady", "cancelled")).toStrictEqual(
      rideOut("gameReady")
    );
    expect(rideOut("gameReady", "dwellElapsed", "cancelled")).toStrictEqual(
      rideOut("gameReady", "dwellElapsed")
    );
  });

  it("starts nothing for an outcome that arrives after the card closed", () => {
    expect(
      rideOut("gameReady", "dwellElapsed", "closed", "built")
    ).toStrictEqual({ effects: ["prepare"], state: "closed" });
    expect(
      rideOut("gameReady", "built", "closed", "dwellElapsed").effects
    ).toStrictEqual(["prepare"]);
    expect(rideOut("closed", "gameReady").effects).toStrictEqual([]);
    expect(
      rideOut("gameReady", "missing", "closed", "retry").effects
    ).toStrictEqual(["prepare"]);
  });

  it("keeps the rules in every order of its events", () => {
    const kinds = [...rideOutSignals, ...preparedRaces];
    expect(
      sequences(kinds, 6).filter((events) => !rideOutRulesHold(events))
    ).toStrictEqual([]);
  });
});

describe("a room's handoff", () => {
  it("prepares once when the race begins", () => {
    expect(room(BEGUN)).toStrictEqual({
      effects: ["prepare"],
      state: "preparing",
    });
    expect(room(BEGUN, BEGUN).effects).toStrictEqual(["prepare"]);
    expect(room({ kind: "built" })).toStrictEqual({
      effects: [],
      state: "lobby",
    });
  });

  it("ignores a door moment that ends before the race begins", () => {
    expect(room({ kind: "doorElapsed" }, BEGUN)).toStrictEqual({
      effects: ["prepare"],
      state: "preparing",
    });
  });

  it("reports loaded only when the race is built and the door moment is over", () => {
    expect(room(BEGUN, { kind: "built" }).effects).toStrictEqual(["prepare"]);
    expect(room(BEGUN, { kind: "doorElapsed" }).effects).toStrictEqual([
      "prepare",
    ]);
    expect(
      room(BEGUN, { kind: "built" }, { kind: "doorElapsed" })
    ).toStrictEqual({
      effects: ["prepare", "reportLoaded"],
      state: "waitingForRoom",
    });
    expect(
      room(BEGUN, { kind: "doorElapsed" }, { kind: "built" })
    ).toStrictEqual({
      effects: ["prepare", "reportLoaded"],
      state: "waitingForRoom",
    });
  });

  it("starts after it reported loaded, once the room says racing", () => {
    expect(
      room(
        BEGUN,
        { kind: "built" },
        { kind: "doorElapsed" },
        { kind: "roomRacing" }
      )
    ).toStrictEqual({
      effects: ["prepare", "reportLoaded", "start"],
      state: "riding",
    });
  });

  it("waits for its own race when the room says racing first", () => {
    expect(room(BEGUN, { kind: "roomRacing" })).toStrictEqual({
      effects: ["prepare"],
      state: "preparing",
    });
    expect(
      room(
        BEGUN,
        { kind: "roomRacing" },
        { kind: "built" },
        { kind: "roomRacing" }
      ).effects
    ).toStrictEqual(["prepare"]);
  });

  it("leaves the seat and never reports loaded when no race was built", () => {
    const dressing = { kind: preparedRace(failedAt("dress")) };
    const building = { kind: preparedRace(failedAt("build")) };
    expect(room(BEGUN, dressing)).toStrictEqual({
      effects: ["prepare", "leave"],
      state: "left",
    });
    expect(room(BEGUN, { kind: "doorElapsed" }, building)).toStrictEqual({
      effects: ["prepare", "leave"],
      state: "left",
    });
    expect(
      room(
        BEGUN,
        dressing,
        { kind: "doorElapsed" },
        { kind: "built" },
        { kind: "doorElapsed" },
        { kind: "roomRacing" }
      )
    ).toStrictEqual({ effects: ["prepare", "leave"], state: "left" });
  });

  it("reports loaded for a race that was built but failed to warm", () => {
    expect(
      room(
        BEGUN,
        { kind: preparedRace(failedAt("compile")) },
        { kind: "doorElapsed" }
      ).effects
    ).toStrictEqual(["prepare", "reportLoaded"]);
  });

  it("reports nothing and starts nothing when a preparation is cancelled", () => {
    expect(
      room(
        BEGUN,
        { kind: "cancelled" },
        { kind: "doorElapsed" },
        { kind: "roomRacing" }
      ).effects
    ).toStrictEqual(["prepare"]);
  });

  it("keeps the rules in every order of its events", () => {
    const events: readonly RoomEvent<Ride>[] = [
      BEGUN,
      ...[...roomSignals, ...preparedRaces].map((kind) => ({ kind })),
    ];
    expect(
      sequences(events, 6).filter((run) => !roomRulesHold(run))
    ).toStrictEqual([]);
  });
});
