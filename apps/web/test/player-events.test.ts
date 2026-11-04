import type { PlayerEvent } from "@racer/telemetry/player-events";
import { describe, expect, it } from "vitest";

import { roomArrivalOf } from "../src/components/room-url.ts";
import {
  browserFamilyOf,
  createPlayerEvents,
  storedPlayerId,
} from "../src/diagnostics/player-events.ts";
import { createRaceEvents } from "../src/diagnostics/race-events.ts";

const PLAYER = "3f0c2a1e-7b6d-4c1a-9e2f-0123456789ab";
const again: PlayerEvent = { event: "race_again" };

const senderWith = (
  send: (body: string) => boolean,
  sharing: () => boolean = () => true
) => {
  const timers: (() => void)[] = [];
  let clock = 0;
  const events = createPlayerEvents({
    after(_ms, run) {
      timers.push(run);
    },
    build: "abc",
    enabled: sharing,
    now: () => clock,
    playerId: () => PLAYER,
    send,
  });
  return {
    advance: (ms: number) => {
      clock += ms;
    },
    events,
    fire: () => {
      for (const run of timers.splice(0)) {
        run();
      }
    },
    timers,
  };
};

describe("the player event sender", () => {
  it("sends nothing until its timer fires, then one batch", () => {
    const sent: string[] = [];
    const { advance, events, fire } = senderWith((body) => {
      sent.push(body);
      return true;
    });
    events.track(again);
    advance(100);
    events.track({ event: "invite_copied" });
    expect(sent).toHaveLength(0);
    fire();
    expect(JSON.parse(sent[0] ?? "")).toStrictEqual({
      build: "abc",
      events: [
        { agoMs: 100, event: again },
        { agoMs: 0, event: { event: "invite_copied" } },
      ],
      playerId: PLAYER,
    });
  });

  it("arms one timer for a burst of events", () => {
    const { events, timers } = senderWith(() => true);
    events.track(again);
    events.track(again);
    expect(timers).toHaveLength(1);
  });

  it("sends nothing while the switch is off", () => {
    const sent: string[] = [];
    let sharing = true;
    const { events, fire } = senderWith(
      (body) => {
        sent.push(body);
        return true;
      },
      () => sharing
    );
    events.track(again);
    sharing = false;
    fire();
    events.track(again);
    events.flush();
    expect(sent).toHaveLength(0);
  });

  it("does not let a failed send reach the caller", () => {
    const { events, fire } = senderWith(() => {
      throw new Error("The network is gone.");
    });
    events.track(again);
    expect(fire).not.toThrow();
    expect(events.dropped()).toBe(1);
  });

  it("counts a batch the browser refused to queue, and does not resend it", () => {
    let sends = 0;
    const { events, fire } = senderWith(() => {
      sends += 1;
      return false;
    });
    events.track(again);
    fire();
    events.flush();
    expect({ dropped: events.dropped(), sends }).toStrictEqual({
      dropped: 1,
      sends: 1,
    });
  });
});

const facts = { crashes: 2, place: 3, roadMetres: 400, seconds: 60 };

const tracked = () => {
  const seen: PlayerEvent[] = [];
  return {
    races: createRaceEvents((event) => {
      seen.push(event);
    }),
    seen,
  };
};

const start = {
  bots: 6,
  humans: 2,
  mode: "friends",
  raceId: "race-a",
  road: "slag-row",
} as const;

describe("a race's events", () => {
  it("ends a race once, whichever way out comes second", () => {
    const { races, seen } = tracked();
    races.started(start);
    races.ended("finished", facts);
    races.ended("closed", facts);
    expect(seen.map((event) => event.event)).toStrictEqual([
      "race_started",
      "race_ended",
    ]);
  });

  it("names the race it ends", () => {
    const { races, seen } = tracked();
    races.started(start);
    races.ended("lost", facts);
    expect(seen[1]).toStrictEqual({
      ...facts,
      event: "race_ended",
      raceId: "race-a",
      result: "lost",
    });
  });

  it("counts a rider who leaves from the grid as riding no road", () => {
    const { races, seen } = tracked();
    races.started(start);
    races.ended("quit", { ...facts, roadMetres: -23 });
    expect(seen[1]).toMatchObject({ roadMetres: 0 });
  });

  it("says nothing when no race is running", () => {
    const { races, seen } = tracked();
    races.ended("closed", facts);
    expect(seen).toStrictEqual([]);
  });
});

const memoryStorage = (read?: (key: string) => string | null): Storage => {
  const stored = new Map<string, string>();
  return {
    clear: () => {
      stored.clear();
    },
    getItem: read ?? ((key) => stored.get(key) ?? null),
    key: () => null,
    get length() {
      return stored.size;
    },
    removeItem: (key) => {
      stored.delete(key);
    },
    setItem: (key, value) => {
      stored.set(key, value);
    },
  };
};

describe("the player ID", () => {
  it("stays the same on the same device", () => {
    const device = memoryStorage();
    expect(storedPlayerId(device)).toBe(storedPlayerId(device));
  });

  it("is different on another device", () => {
    expect(storedPlayerId(memoryStorage())).not.toBe(
      storedPlayerId(memoryStorage())
    );
  });

  it("still gives an ID when storage refuses", () => {
    const refusing = memoryStorage(() => {
      throw new Error("Blocked.");
    });
    expect(storedPlayerId(refusing)).toMatch(/^[0-9a-f]{8}-/u);
  });
});

describe("device facts", () => {
  it.each([
    ["Mozilla/5.0 Chrome/130.0 Safari/537.36", "chrome"],
    ["Mozilla/5.0 Chrome/130.0 Safari/537.36 Edg/130.0", "edge"],
    ["Mozilla/5.0 Version/18.0 Safari/605.1.15", "safari"],
    ["Mozilla/5.0 Gecko/20100101 Firefox/130.0", "firefox"],
    ["SomethingElse/1.0", "other"],
  ])("reads %s as %s", (agent, family) => {
    expect(browserFamilyOf(agent)).toBe(family);
  });

  it.each([
    ["?room=abc&via=rematch", "rematch"],
    ["?room=abc&via=made", "made"],
    ["?room=abc", "link"],
    ["?room=abc&via=nonsense", "link"],
  ])("reads the arrival in %s as %s", (search, arrival) => {
    expect(roomArrivalOf(search)).toBe(arrival);
  });
});
