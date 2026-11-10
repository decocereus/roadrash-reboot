import { runInThisContext } from "node:vm";

import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { FIGHT_PROBE } from "../src/fight-probe.ts";

const BUTTONS_PLACE = 256 * 256 * 256;
const STEERING = 7;
const PUNCHING = STEERING + BUTTONS_PLACE;
const DELAY = 5;

interface Probed {
  readonly delays: (number | undefined)[];
  readonly lostTicks: () => readonly number[];
  readonly confirmTick: (tick: number, control: number) => void;
  readonly predict: (control: number, delay: number) => boolean;
}

const decodeTicks = Schema.decodeUnknownSync(Schema.Array(Schema.Number));

const rider = () => ({
  attack: "none",
  attackTicks: 0,
  hitStun: 0,
  lastHitBy: null,
  lastHitTick: -1,
  mode: "riding",
  s: 0,
  speed: 25,
  stamina: 100,
  x: 0,
});

const probedClient = (plansAhead = true): Probed => {
  const delays: (number | undefined)[] = [];
  const confirmed = { events: [], riders: [rider(), rider()], tick: 0 };
  const predicted = { events: [], riders: [rider(), rider()], tick: 0 };
  let plannedThrough = 0;
  const riding = {
    confirm: (frame: { controls: Map<number, number>; tick: number }) => {
      confirmed.tick = frame.tick;
    },
    confirmed,
    predict: (_control: number, delay?: number) => {
      delays.push(delay);
      predicted.tick += 1;
      plannedThrough = Math.max(plannedThrough, predicted.tick + (delay ?? 0));
      return true;
    },
    predicted,
    writeInputs: () => 0,
  };
  const client = plansAhead
    ? { ...riding, plannedThrough: () => plannedThrough }
    : riding;
  const frames: (() => void)[] = [];
  const listened: string[] = [];
  const animated: string[] = [];
  const figure = {
    animate: (stance: { readonly pose: string }) => {
      animated.push(stance.pose);
    },
  };
  Reflect.set(globalThis, "requestAnimationFrame", (frame: () => void) => {
    frames.push(frame);
    return 0;
  });
  Reflect.set(globalThis, "addEventListener", (kind: string) => {
    listened.push(kind);
  });
  Reflect.set(globalThis, "__rushlineRoom", { client, me: 0, rttMs: () => 0 });
  Reflect.set(globalThis, "__rushlineCast", [
    { drawn: { blend: 0, fromTick: 0, toTick: 0, x: 0 }, figure },
    { drawn: { blend: 0, fromTick: 0, toTick: 0, x: 0 }, figure },
  ]);
  Reflect.deleteProperty(globalThis, "__fightProbe");
  runInThisContext(FIGHT_PROBE);
  frames[0]?.();
  return {
    confirmTick: (tick, control) => {
      client.confirm({ controls: new Map([[0, control]]), tick });
    },
    delays,
    lostTicks: () =>
      decodeTicks(
        runInThisContext(
          "globalThis.__fightProbe.lostButtons.map((lost) => lost.tick)"
        )
      ),
    predict: (control, delay) => client.predict(control, delay),
  };
};

describe("the fights probe on a room client", () => {
  it("forwards the input delay to the client and counts a press lost only at the tick it was planned for", () => {
    const { confirmTick, delays, lostTicks, predict } = probedClient();
    predict(STEERING, 0);
    predict(PUNCHING, DELAY);
    expect(delays).toStrictEqual([0, DELAY]);
    confirmTick(2, STEERING);
    expect(lostTicks()).toStrictEqual([]);
    confirmTick(2 + DELAY, PUNCHING);
    expect(lostTicks()).toStrictEqual([]);
  });

  it("keys a press by the tick it was sampled on for a build whose client plans no delay", () => {
    const { confirmTick, lostTicks, predict } = probedClient(false);
    predict(STEERING, 0);
    predict(PUNCHING, 0);
    confirmTick(2, STEERING);
    expect(lostTicks()).toStrictEqual([2]);
  });

  it("counts a press the room rode without its button at the planned tick", () => {
    const { confirmTick, lostTicks, predict } = probedClient();
    predict(STEERING, 0);
    predict(PUNCHING, DELAY);
    confirmTick(2 + DELAY, STEERING);
    expect(lostTicks()).toStrictEqual([2 + DELAY]);
  });
});
