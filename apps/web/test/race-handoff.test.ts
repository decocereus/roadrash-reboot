import { describe, expect, it } from "vitest";

import { preparedRace, preparedRaces } from "../src/prepare-outcome.ts";
import type { PrepareOutcome } from "../src/prepare-outcome.ts";
import { soloDoorSignals, stepSoloDoor } from "../src/race-handoff.ts";
import type {
  SoloDoorEvent,
  SoloDoorHandoff,
  Step,
} from "../src/race-handoff.ts";
import {
  roomSignals,
  seatChange,
  seatClosing,
  stepRoom,
} from "../src/room-handoff.ts";
import type { RoomEvent, RoomHandoff } from "../src/room-handoff.ts";

const RIDE = "the ride";
type Ride = typeof RIDE;

const failedAt = (
  stage: Extract<PrepareOutcome, { readonly kind: "failed" }>["stage"]
): PrepareOutcome => ({ cause: new Error(stage), kind: "failed", stage });

const FIRST_SOLO_DOOR: SoloDoorHandoff<Ride> = {
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

const soloDoor = (...kinds: readonly SoloDoorEvent["kind"][]) =>
  walk(
    stepSoloDoor<Ride>,
    FIRST_SOLO_DOOR,
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

const soloDoorRulesHold = (
  events: readonly SoloDoorEvent["kind"][]
): boolean => {
  const { effects } = soloDoor(...events);
  const toStart = upToEffect(
    events,
    (prefix) => soloDoor(...prefix).effects,
    "start"
  );
  const startRules =
    !effects.includes("start") ||
    (toStart.includes("gameReady") &&
      toStart.includes("built") &&
      toStart.includes("doorElapsed") &&
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

describe("a solo race at the door", () => {
  it("waits for the game before it prepares", () => {
    expect(soloDoor("doorElapsed")).toStrictEqual({
      effects: [],
      state: "waitingForGamePastDoor",
    });
    expect(soloDoor("doorElapsed", "gameReady").effects).toStrictEqual([
      "prepare",
    ]);
    expect(soloDoor("gameReady").effects).toStrictEqual(["prepare"]);
  });

  it("prepares once however often the game says it is ready", () => {
    expect(soloDoor("gameReady", "gameReady").effects).toStrictEqual([
      "prepare",
    ]);
    expect(soloDoor("gameReady", "missing", "gameReady").effects).toStrictEqual(
      ["prepare"]
    );
  });

  it("starts once the race is built and the door moment is over, in either order", () => {
    expect(soloDoor("gameReady", "built")).toStrictEqual({
      effects: ["prepare"],
      state: "atDoor",
    });
    expect(soloDoor("gameReady", "built", "doorElapsed")).toStrictEqual({
      effects: ["prepare", "start"],
      state: "started",
    });
    expect(soloDoor("gameReady", "doorElapsed")).toStrictEqual({
      effects: ["prepare"],
      state: "preparingPastDoor",
    });
    expect(soloDoor("gameReady", "doorElapsed", "built")).toStrictEqual({
      effects: ["prepare", "start"],
      state: "started",
    });
  });

  it("offers Retry after a missing race and prepares again when pressed", () => {
    const race = preparedRace(failedAt("dress"));
    expect(soloDoor("gameReady", race)).toStrictEqual({
      effects: ["prepare"],
      state: "failed",
    });
    expect(soloDoor("gameReady", race, "retry")).toStrictEqual({
      effects: ["prepare", "prepare"],
      state: "preparing",
    });
  });

  it("does not wait out the door again after a Retry", () => {
    expect(
      soloDoor("gameReady", "missing", "doorElapsed", "retry", "built")
    ).toStrictEqual({
      effects: ["prepare", "prepare", "start"],
      state: "started",
    });
    expect(
      soloDoor("gameReady", "doorElapsed", "missing", "retry", "built").effects
    ).toStrictEqual(["prepare", "prepare", "start"]);
  });

  it("still waits out the door when a Retry comes before it ends", () => {
    expect(soloDoor("gameReady", "missing", "retry", "built")).toStrictEqual({
      effects: ["prepare", "prepare"],
      state: "atDoor",
    });
  });

  it("ignores Retry unless the load failed", () => {
    expect(soloDoor("retry").effects).toStrictEqual([]);
    expect(soloDoor("gameReady", "retry").effects).toStrictEqual(["prepare"]);
    expect(soloDoor("gameReady", "built", "retry").state).toBe("atDoor");
  });

  it("changes nothing when a preparation is cancelled", () => {
    expect(soloDoor("gameReady", "cancelled")).toStrictEqual(
      soloDoor("gameReady")
    );
    expect(soloDoor("gameReady", "doorElapsed", "cancelled")).toStrictEqual(
      soloDoor("gameReady", "doorElapsed")
    );
  });

  it("starts nothing for an outcome that arrives after the rider backed out", () => {
    expect(
      soloDoor("gameReady", "doorElapsed", "closed", "built")
    ).toStrictEqual({ effects: ["prepare"], state: "closed" });
    expect(
      soloDoor("gameReady", "built", "closed", "doorElapsed").effects
    ).toStrictEqual(["prepare"]);
    expect(soloDoor("closed", "gameReady").effects).toStrictEqual([]);
    expect(
      soloDoor("gameReady", "missing", "closed", "retry").effects
    ).toStrictEqual(["prepare"]);
  });

  it("keeps the rules in every order of its events", () => {
    const kinds = [...soloDoorSignals, ...preparedRaces];
    expect(
      sequences(kinds, 6).filter((events) => !soloDoorRulesHold(events))
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

describe("a room seat that closes", () => {
  it("leaves the room, freeing the spot, when the game failed to boot", () => {
    expect(seatClosing(FIRST_ROOM, true)).toBe("leaveRoom");
  });

  it("keeps the away hold when the lobby closes for any other reason", () => {
    expect(seatClosing(FIRST_ROOM, false)).toBe("leave");
    expect(seatClosing({ kind: "preparing", ride: RIDE }, false)).toBe("leave");
  });

  it("stays open for the race while the rider is riding", () => {
    expect(seatClosing({ kind: "riding", ride: RIDE }, false)).toBe("keep");
  });
});

describe("a room seat that changes", () => {
  const RIDING: RoomHandoff<Ride> = { kind: "riding", ride: RIDE };
  const PREPARING: RoomHandoff<Ride> = { kind: "preparing", ride: RIDE };

  it("sends a rider whose race ended before they rode it back to the room's lobby", () => {
    expect(seatChange("ended", null, false, FIRST_ROOM)).toBe("backToLobby");
    expect(seatChange("ended", null, true, PREPARING)).toBe("backToLobby");
    expect(
      seatChange("ended", null, true, { kind: "preparingPastDoor", ride: RIDE })
    ).toBe("backToLobby");
  });

  it("leaves a rider who rode the race on its results", () => {
    expect(seatChange("ended", null, true, RIDING)).toBe("redraw");
  });

  it("reopens a seat lost in the lobby", () => {
    expect(seatChange("lost", null, false, FIRST_ROOM)).toBe("reopen");
  });

  it("keeps a rider who lost the link mid-race on the race to get back on", () => {
    expect(seatChange("lost", null, true, RIDING)).toBe("raceLost");
  });

  it("tries to put a rider who lost the link before riding back on their bike", () => {
    expect(seatChange("lost", null, true, PREPARING)).toBe("tryRejoin");
  });

  it("sends a seat another tab took to the taken screen, riding or not", () => {
    expect(seatChange("lost", "replaced", true, RIDING)).toBe("seatTaken");
    expect(seatChange("lost", "replaced", true, PREPARING)).toBe("seatTaken");
  });

  it("sends a seat the room cut for flooding to the flooded screen, never back to its bike", () => {
    expect(seatChange("lost", "flooded", true, RIDING)).toBe("seatFlooded");
    expect(seatChange("lost", "flooded", true, PREPARING)).toBe("seatFlooded");
  });

  it("redraws every other change", () => {
    expect(seatChange("lobby", null, false, FIRST_ROOM)).toBe("redraw");
    expect(seatChange("loading", null, true, FIRST_ROOM)).toBe("redraw");
    expect(seatChange("refused", "replaced", false, FIRST_ROOM)).toBe("redraw");
  });
});
