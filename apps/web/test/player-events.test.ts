import { MAX_EVENTS_IN_BATCH } from "@racer/telemetry/limits";
import type { GraphicsPlace } from "@racer/telemetry/limits";
import type { PlayerEvent } from "@racer/telemetry/player-events";
import { describe, expect, it } from "vitest";

import { roomArrivalOf } from "../src/components/room-url.ts";
import {
  createGraphicsLoss,
  RECOVERY_WAIT_MS,
} from "../src/diagnostics/graphics-loss.ts";
import {
  browserFamilyOf,
  createPlayerEvents,
  storedPlayerId,
} from "../src/diagnostics/player-events.ts";
import { createRaceEvents } from "../src/diagnostics/race-events.ts";
import { createSettingsStore } from "../src/diagnostics/settings.ts";
import type { SettingsStore } from "../src/diagnostics/settings.ts";
import { graphicsPlaceOf } from "../src/navigation.ts";
import type { View } from "../src/navigation.ts";

const PLAYER = "3f0c2a1e-7b6d-4c1a-9e2f-0123456789ab";
const again: PlayerEvent = { event: "race_again" };

type StorageListener = (
  event: Pick<StorageEvent, "key" | "newValue" | "oldValue">
) => void;

const browserTabs = () => {
  const items = new Map<string, string>();
  const tabs: StorageListener[][] = [];
  const queued: (() => void)[] = [];
  return {
    deliver: () => {
      for (const news of queued.splice(0)) {
        news();
      }
    },
    open: (): SettingsStore => {
      const heard: StorageListener[] = [];
      tabs.push(heard);
      return createSettingsStore(
        () => ({
          getItem: (key) => items.get(key) ?? null,
          setItem(key, newValue) {
            const oldValue = items.get(key) ?? null;
            items.set(key, newValue);
            for (const listener of tabs.filter((tab) => tab !== heard).flat()) {
              queued.push(() => {
                listener({ key, newValue, oldValue });
              });
            }
          },
        }),
        {
          addEventListener(_type, listener) {
            heard.push(listener);
          },
        }
      );
    },
  };
};

const senderWith = (
  send: (body: string) => boolean,
  settings: SettingsStore = browserTabs().open()
) => {
  const timers: (() => void)[] = [];
  let clock = 0;
  const events = createPlayerEvents({
    after(_ms, run) {
      timers.push(run);
    },
    build: "abc",
    now: () => clock,
    playerId: () => PLAYER,
    raceData: settings.raceData,
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

  it("gives a later batch its full wait when a full batch beat the first timer", () => {
    const sent: string[] = [];
    const { events, timers } = senderWith((body) => {
      sent.push(body);
      return true;
    });
    for (let count = 0; count <= MAX_EVENTS_IN_BATCH; count += 1) {
      events.track(again);
    }
    expect(sent).toHaveLength(1);
    expect(timers).toHaveLength(2);
    timers[0]?.();
    expect(sent).toHaveLength(1);
    events.track(again);
    expect(timers).toHaveLength(2);
    timers[1]?.();
    expect(sent).toHaveLength(2);
  });

  it("sends what it held when the switch goes off, then records and sends nothing more", () => {
    const sent: string[] = [];
    const settings = browserTabs().open();
    const { events, fire } = senderWith((body) => {
      sent.push(body);
      return true;
    }, settings);
    events.track(again);
    settings.change({ raceData: false });
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0] ?? "")).toStrictEqual({
      build: "abc",
      events: [{ agoMs: 0, event: again }],
      playerId: PLAYER,
    });
    events.track({ event: "invite_copied" });
    fire();
    events.flush();
    expect(sent).toHaveLength(1);
  });

  it("sends what this tab held when another tab turns the switch off, then stops", () => {
    const sent: string[] = [];
    const tabs = browserTabs();
    const here = tabs.open();
    const there = tabs.open();
    const { events, fire } = senderWith((body) => {
      sent.push(body);
      return true;
    }, here);
    events.track(again);
    there.change({ raceData: false });
    tabs.deliver();
    expect(sent).toHaveLength(1);
    events.track(again);
    fire();
    events.flush();
    expect(sent).toHaveLength(1);
  });

  it("keeps nothing this tab records after another tab turns the switch off, before the news arrives", () => {
    const sent: string[] = [];
    const tabs = browserTabs();
    const here = tabs.open();
    const there = tabs.open();
    const { events, fire } = senderWith((body) => {
      sent.push(body);
      return true;
    }, here);
    events.track(again);
    there.change({ raceData: false });
    events.track({ event: "invite_copied" });
    tabs.deliver();
    fire();
    events.flush();
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0] ?? "")).toStrictEqual({
      build: "abc",
      events: [{ agoMs: 0, event: again }],
      playerId: PLAYER,
    });
  });

  it("sends what it held at the switch when another tab turns it off and on again before the news arrives", () => {
    const sent: string[] = [];
    const tabs = browserTabs();
    const here = tabs.open();
    const there = tabs.open();
    const { events } = senderWith((body) => {
      sent.push(body);
      return true;
    }, here);
    events.track(again);
    there.change({ raceData: false });
    there.change({ raceData: true });
    tabs.deliver();
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0] ?? "")).toStrictEqual({
      build: "abc",
      events: [{ agoMs: 0, event: again }],
      playerId: PLAYER,
    });
  });

  it("records again from the moment the switch is back on", () => {
    const sent: string[] = [];
    const settings = browserTabs().open();
    const { events, fire } = senderWith((body) => {
      sent.push(body);
      return true;
    }, settings);
    settings.change({ raceData: false });
    events.track(again);
    settings.change({ raceData: true });
    events.track({ event: "invite_copied" });
    fire();
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0] ?? "")).toStrictEqual({
      build: "abc",
      events: [{ agoMs: 0, event: { event: "invite_copied" } }],
      playerId: PLAYER,
    });
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

describe("the settings", () => {
  it("reach a tab that is already open when another tab changes them", () => {
    const tabs = browserTabs();
    const here = tabs.open();
    const there = tabs.open();
    let heard = 0;
    here.subscribe(() => {
      heard += 1;
    });
    expect(here.read().raceData).toBeTruthy();
    there.change({ raceData: false });
    tabs.deliver();
    expect({ heard, raceData: here.read().raceData }).toStrictEqual({
      heard: 1,
      raceData: false,
    });
  });

  it("keep the switch in this tab when the browser will not store it", () => {
    const heard: StorageListener[] = [];
    const settings = createSettingsStore(
      () => ({
        getItem: () => null,
        setItem: () => {
          throw new Error("The quota is full.");
        },
      }),
      {
        addEventListener(_type, listener) {
          heard.push(listener);
        },
      }
    );
    settings.change({ raceData: false });
    expect(settings.raceData.sharing()).toBeFalsy();
  });
});

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

const LOST = "webglcontextlost";
const RESTORED = "webglcontextrestored";

interface ShownScreen {
  shown: View["screen"];
}

const lossTracker = () => {
  const sent: PlayerEvent[] = [];
  const waits = new Map<number, () => void>();
  const screen: ShownScreen = { shown: "race" };
  let next = 0;
  const loss = createGraphicsLoss({
    after(ms, run) {
      expect(ms).toBe(RECOVERY_WAIT_MS);
      next += 1;
      const id = next;
      waits.set(id, run);
      return () => {
        waits.delete(id);
      };
    },
    place: () => graphicsPlaceOf[screen.shown],
    track(event) {
      sent.push(event);
    },
  });
  const giveUp = (): void => {
    for (const run of waits.values()) {
      run();
    }
  };
  return { giveUp, loss, screen, sent, waits };
};

const report = (
  where: GraphicsPlace,
  recovered: "no" | "yes"
): readonly PlayerEvent[] => [{ event: "graphics_lost", recovered, where }];

const fire = (canvas: EventTarget, name: string): void => {
  canvas.dispatchEvent(new Event(name));
};

describe("a graphics loss", () => {
  it("reports yes when the graphics come back, and not before", () => {
    const { loss, sent, waits } = lossTracker();
    const canvas = new EventTarget();
    loss.watch(canvas, "game");
    fire(canvas, LOST);
    expect(sent).toStrictEqual([]);
    fire(canvas, RESTORED);
    expect(sent).toStrictEqual(report("race", "yes"));
    expect(waits.size).toBe(0);
  });

  it("reports no when the wait runs out, and stays one report if they return later", () => {
    const { giveUp, loss, screen, sent } = lossTracker();
    const canvas = new EventTarget();
    screen.shown = "elsewhere";
    loss.watch(canvas, "game");
    fire(canvas, LOST);
    giveUp();
    expect(sent).toStrictEqual(report("menu", "no"));
    fire(canvas, RESTORED);
    expect(sent).toHaveLength(1);
  });

  it("reports no when the page closes before the answer is known", () => {
    const { loss, sent, waits } = lossTracker();
    const canvas = new EventTarget();
    loss.watch(canvas, "game");
    fire(canvas, LOST);
    loss.leaving();
    loss.leaving();
    expect(sent).toStrictEqual(report("race", "no"));
    expect(waits.size).toBe(0);
  });

  it("says where the player was when it happened, not where they went next", () => {
    const { loss, screen, sent } = lossTracker();
    const canvas = new EventTarget();
    loss.watch(canvas, "game");
    fire(canvas, LOST);
    screen.shown = "elsewhere";
    fire(canvas, RESTORED);
    expect(sent).toStrictEqual(report("race", "yes"));
  });

  it("makes one report when a GPU crash takes the bar and the game behind it", () => {
    const { loss, screen, sent } = lossTracker();
    const game = new EventTarget();
    const bar = new EventTarget();
    screen.shown = "bar";
    loss.watch(game, "game");
    loss.watch(bar, "bar");
    fire(game, LOST);
    fire(bar, LOST);
    fire(game, RESTORED);
    expect(sent).toStrictEqual([]);
    fire(bar, RESTORED);
    expect(sent).toStrictEqual(report("bar", "yes"));
  });

  it("reports a second loss on its own", () => {
    const { loss, screen, sent } = lossTracker();
    const canvas = new EventTarget();
    screen.shown = "bar";
    loss.watch(canvas, "bar");
    fire(canvas, LOST);
    fire(canvas, RESTORED);
    fire(canvas, LOST);
    fire(canvas, RESTORED);
    expect(sent).toStrictEqual([
      ...report("bar", "yes"),
      ...report("bar", "yes"),
    ]);
  });

  it("counts the bar as the bar before its own canvas is drawn", () => {
    const { loss, screen, sent } = lossTracker();
    const game = new EventTarget();
    screen.shown = "bar";
    loss.watch(game, "game");
    fire(game, LOST);
    fire(game, RESTORED);
    expect(sent).toStrictEqual(report("bar", "yes"));
  });

  it("says nothing when the bar closes its own healthy canvas", () => {
    const { loss, sent } = lossTracker();
    const canvas = new EventTarget();
    const unwatch = loss.watch(canvas, "game");
    unwatch();
    fire(canvas, LOST);
    expect(sent).toStrictEqual([]);
  });

  it("reports no when the player leaves the bar with its graphics still gone", () => {
    const { loss, screen, sent } = lossTracker();
    const game = new EventTarget();
    const bar = new EventTarget();
    screen.shown = "bar";
    loss.watch(game, "game");
    const unwatch = loss.watch(bar, "bar");
    fire(bar, LOST);
    unwatch();
    expect(sent).toStrictEqual(report("bar", "no"));
    screen.shown = "elsewhere";
    fire(game, LOST);
    fire(game, RESTORED);
    expect(sent.at(-1)).toStrictEqual(report("menu", "yes")[0]);
  });

  it("stays no when the bar is left lost and the game behind it comes back", () => {
    const { loss, screen, sent } = lossTracker();
    const game = new EventTarget();
    const bar = new EventTarget();
    screen.shown = "bar";
    loss.watch(game, "game");
    const unwatch = loss.watch(bar, "bar");
    fire(game, LOST);
    fire(bar, LOST);
    unwatch();
    fire(game, RESTORED);
    expect(sent).toStrictEqual(report("bar", "no"));
  });
});
