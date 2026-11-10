import { controlOf } from "@racer/sim/control";
import { defaultSetup, neutralInput } from "@racer/sim/race";
import {
  playerFrame,
  ROOM_LIMIT_TICKS,
  straight,
} from "@racer/sim/race-fixtures";
import { createRaceRun } from "@racer/sim/race-run";
import { createRoom, roomSetup } from "@racer/sim/room";
import { createRoomClient } from "@racer/sim/room-client";
import { PLAYER_RIDER, riderIdAt, riderOf } from "@racer/sim/state";
import type { RiderInput } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { createControls } from "../src/game/input.ts";
import type { Controls, Pad } from "../src/game/input.ts";
import { createKeyboard } from "./hosts.ts";
import type { Keyboard } from "./hosts.ts";

const setUp = () => {
  const keyboard = createKeyboard();
  const controls = createControls((code) => {
    keyboard.commands.push(code);
  }, keyboard.host);
  return { controls, keyboard };
};

const readOnce = (controls: Controls): RiderInput => {
  const input = { ...neutralInput };
  controls.read(input);
  return input;
};

interface Pressed {
  readonly brake?: number;
  readonly kick?: boolean;
  readonly punch?: boolean;
  readonly remount?: boolean;
  readonly throttle?: number;
}

const button = (value: number) => ({ pressed: value > 0.5, value });

const pad = (
  axis: number | null,
  pressed: Pressed,
  connected = true,
  mapping: GamepadMappingType = "standard"
): Pad => ({
  axes: axis === null ? [] : [axis],
  buttons: [
    button(pressed.remount === true ? 1 : 0),
    button(pressed.kick === true ? 1 : 0),
    button(pressed.punch === true ? 1 : 0),
    button(0),
    button(0),
    button(0),
    button(pressed.brake ?? 0),
    button(pressed.throttle ?? 0),
  ],
  connected,
  mapping,
});

const THEM = riderIdAt(1);
const LEAD_TICKS = 6;
const KEY_EDGE_EVERY_TICKS = 40;
const WEAVE_TICKS = 600;

const weaveOnTheKeys = (keyboard: Keyboard, tick: number): boolean => {
  if (tick % KEY_EDGE_EVERY_TICKS !== 0) {
    return false;
  }
  const right = Math.floor(tick / KEY_EDGE_EVERY_TICKS) % 2 === 1;
  keyboard.release(right ? "ArrowLeft" : "ArrowRight");
  keyboard.press(right ? "ArrowRight" : "ArrowLeft");
  return true;
};

const soloRun = () => {
  const setup = defaultSetup(straight, 3);
  return createRaceRun({
    ...setup,
    police: { ...setup.police, count: 0 },
    rivals: [],
  });
};

describe("keyboard controls", () => {
  it("a held key drives the input until it is released", () => {
    const { controls, keyboard } = setUp();
    keyboard.press("ArrowUp");
    expect(readOnce(controls).throttle).toBe(1);
    expect(readOnce(controls).throttle).toBe(1);
    keyboard.release("ArrowUp");
    expect(readOnce(controls).throttle).toBe(0);
  });

  it("a held key asks for full lock on its side from the first read, and opposing keys cancel", () => {
    const { controls, keyboard } = setUp();
    keyboard.press("ArrowRight");
    expect(readOnce(controls).steer).toBe(1);
    expect(readOnce(controls).steer).toBe(1);
    keyboard.press("KeyA");
    expect(readOnce(controls).steer).toBe(0);
    keyboard.release("ArrowRight");
    expect(readOnce(controls).steer).toBe(-1);
  });

  it("a repeated keydown neither dispatches a second command nor drops the key", () => {
    const { controls, keyboard } = setUp();
    keyboard.press("KeyR");
    keyboard.press("KeyR", true);
    keyboard.press("ArrowDown");
    keyboard.press("ArrowDown", true);
    expect(keyboard.commands).toStrictEqual(["KeyR", "ArrowDown"]);
    expect(keyboard.prevented()).toBe(2);
    expect(readOnce(controls).brake).toBe(1);
  });

  it("leaves a key typed into a text field to the field", () => {
    const { controls, keyboard } = setUp();
    keyboard.typeInField("KeyA");
    keyboard.typeInField("KeyM");
    expect(keyboard.prevented()).toBe(0);
    expect(keyboard.commands).toStrictEqual([]);
    expect(readOnce(controls).steer).toBe(0);
  });

  it("punch and kick stay held while their keys are down", () => {
    const { controls, keyboard } = setUp();
    keyboard.press("Space");
    keyboard.press("ShiftLeft");
    expect(readOnce(controls)).toMatchObject({ kick: true, punch: true });
    expect(readOnce(controls)).toMatchObject({ kick: true, punch: true });
    keyboard.release("Space");
    expect(readOnce(controls)).toMatchObject({ kick: true, punch: false });
  });

  it("E and the pad's first face button ask to get back on the bike", () => {
    const { controls, keyboard } = setUp();
    expect(readOnce(controls).remount).toBeFalsy();
    keyboard.press("KeyE");
    expect(readOnce(controls).remount).toBeTruthy();
    keyboard.release("KeyE");
    expect(readOnce(controls).remount).toBeFalsy();
    keyboard.pads.push(pad(0, { remount: true }));
    expect(readOnce(controls).remount).toBeTruthy();
  });

  it("a key pressed under Cmd never sticks when its release is lost, as with Cmd+Shift+4 on a Mac", () => {
    const { controls, keyboard } = setUp();
    keyboard.press("MetaLeft");
    keyboard.press("ShiftLeft");
    expect(readOnce(controls).kick).toBeFalsy();
    keyboard.release("MetaLeft");
    expect(readOnce(controls).kick).toBeFalsy();
  });

  it("releasing Cmd lets go of a key held since before Cmd, whose release Cmd may have swallowed", () => {
    const { controls, keyboard } = setUp();
    keyboard.press("ShiftLeft");
    keyboard.press("MetaLeft");
    expect(readOnce(controls).kick).toBeTruthy();
    keyboard.release("MetaLeft");
    expect(readOnce(controls).kick).toBeFalsy();
  });

  it("losing focus lets go of every key", () => {
    const { controls, keyboard } = setUp();
    keyboard.press("ArrowUp");
    keyboard.press("KeyD");
    expect(readOnce(controls)).toMatchObject({ steer: 1, throttle: 1 });
    keyboard.blur();
    expect(readOnce(controls)).toMatchObject({ steer: 0, throttle: 0 });
  });

  it("dispose stops listening", () => {
    const { controls, keyboard } = setUp();
    expect(keyboard.listeners()).toBe(3);
    controls.dispose();
    expect(keyboard.listeners()).toBe(0);
    keyboard.press("ArrowUp");
    expect(readOnce(controls).throttle).toBe(0);
  });
});

describe("gamepad controls", () => {
  it("the first connected pad drives the input", () => {
    const { controls, keyboard } = setUp();
    keyboard.pads.push(
      null,
      pad(-1, { throttle: 1 }, false),
      pad(0.5, { brake: 0.3, punch: true, throttle: 0.8 }),
      pad(-1, { brake: 1, kick: true })
    );
    expect(readOnce(controls)).toStrictEqual({
      brake: 0.3,
      kick: false,
      punch: true,
      remount: false,
      steer: 0.5,
      throttle: 0.8,
    });
  });

  it("skips a pad the browser cannot map to the standard layout, whose buttons mean something else", () => {
    const { controls, keyboard } = setUp();
    keyboard.pads.push(
      pad(1, { kick: true, throttle: 1 }, true, ""),
      pad(-0.5, { brake: 0.6 })
    );
    expect(readOnce(controls)).toStrictEqual({
      ...neutralInput,
      brake: 0.6,
      steer: -0.5,
    });
  });

  it("a stick inside its deadzone leaves steering to the keys", () => {
    const { controls, keyboard } = setUp();
    keyboard.pads.push(pad(0.1, {}));
    keyboard.press("ArrowLeft");
    expect(readOnce(controls).steer).toBe(-1);
  });

  it("a pad without axes or buttons reads as idle", () => {
    const { controls, keyboard } = setUp();
    keyboard.pads.push({
      axes: [],
      buttons: [],
      connected: true,
      mapping: "standard",
    });
    expect(readOnce(controls)).toStrictEqual(neutralInput);
  });

  it("keys and pad combine by taking the larger of each pedal", () => {
    const { controls, keyboard } = setUp();
    keyboard.pads.push(pad(null, { brake: 0.7, throttle: 0.4 }));
    keyboard.press("ArrowUp");
    expect(readOnce(controls)).toMatchObject({ brake: 0.7, throttle: 1 });
    keyboard.press("ArrowDown");
    expect(readOnce(controls)).toMatchObject({ brake: 1, throttle: 1 });
  });
});

describe("controls in a real race", () => {
  it("throttle moves the player, the brake slows it and a punch starts one attack", () => {
    const { controls, keyboard } = setUp();
    const run = soloRun();
    const input: RiderInput = { ...neutralInput };
    const ride = (ticks: number) => {
      for (let tick = 0; tick < ticks; tick += 1) {
        controls.read(input);
        run.step(playerFrame(input));
      }
    };
    const player = () => riderOf(run.view.riders, PLAYER_RIDER);
    const start = player()?.s ?? 0;
    keyboard.press("ArrowUp");
    ride(240);
    const fast = player()?.speed ?? 0;
    keyboard.release("ArrowUp");
    keyboard.press("ArrowDown");
    ride(60);
    keyboard.release("ArrowDown");
    const slowed = player()?.speed ?? 0;
    keyboard.press("Space");
    ride(1);
    const attacks = run.view.events.filter(
      (event) => event.kind === "attack" && event.rider === PLAYER_RIDER
    );
    expect(player()?.s).toBeGreaterThan(start + 50);
    expect(fast).toBeGreaterThan(20);
    expect(slowed).toBeLessThan(fast - 5);
    expect(attacks).toHaveLength(1);
  });
});

describe("a rider on the keys in a race room", () => {
  it("costs the other seat one rollback per key edge, and no more while the bars travel", () => {
    const { controls, keyboard } = setUp();
    const setup = roomSetup(defaultSetup(straight, 3), [PLAYER_RIDER, THEM]);
    const room = createRoom(setup, ROOM_LIMIT_TICKS);
    const client = createRoomClient(setup, PLAYER_RIDER, ROOM_LIMIT_TICKS);
    const riding = controlOf({ ...neutralInput, throttle: 1 });
    const theirs: RiderInput = { ...neutralInput };
    for (let tick = 0; tick < LEAD_TICKS; tick += 1) {
      client.predict(riding);
    }
    keyboard.press("ArrowUp");
    let edges = 0;
    let moved = 0;
    let rollbacksBefore = 0;
    let resimulatedBefore = 0;
    for (let tick = 1; tick <= WEAVE_TICKS; tick += 1) {
      if (tick === KEY_EDGE_EVERY_TICKS) {
        rollbacksBefore = client.stats.rollbacks;
        resimulatedBefore = client.stats.resimulatedTicks;
      }
      edges += weaveOnTheKeys(keyboard, tick) ? 1 : 0;
      controls.read(theirs);
      room.accept(PLAYER_RIDER, tick, [riding]);
      room.accept(THEM, tick, [controlOf(theirs)]);
      room.step();
      client.confirm(room.frame, null);
      client.predict(riding);
      for (const { rider, x } of client.takeCorrections()) {
        moved += rider === THEM ? Math.abs(x) : 0;
      }
    }
    expect(edges).toBe(WEAVE_TICKS / KEY_EDGE_EVERY_TICKS);
    expect(client.stats.rollbacks - rollbacksBefore).toBe(edges);
    expect(
      client.stats.resimulatedTicks - resimulatedBefore
    ).toBeLessThanOrEqual(edges * LEAD_TICKS);
    expect(moved).toBeLessThan(edges * 0.05);
  });
});
