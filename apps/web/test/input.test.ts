import { defaultSetup, neutralInput } from "@racer/sim/race";
import { straight } from "@racer/sim/race-fixtures";
import { createRaceRun } from "@racer/sim/race-run";
import { PLAYER_RIDER, riderOf, TICK_SECONDS } from "@racer/sim/state";
import type { InputFrame, RiderInput } from "@racer/sim/state";
import { describe, expect, it } from "vitest";

import { createControls } from "../src/game/input.ts";
import type { Controls, Pad } from "../src/game/input.ts";
import { createKeyboard } from "./hosts.ts";

const setUp = () => {
  const keyboard = createKeyboard();
  const controls = createControls((code) => {
    keyboard.commands.push(code);
  }, keyboard.host);
  return { controls, keyboard };
};

const readOnce = (controls: Controls): RiderInput => {
  const input = { ...neutralInput };
  controls.read(TICK_SECONDS, input);
  return input;
};

interface Pressed {
  readonly brake?: number;
  readonly kick?: boolean;
  readonly punch?: boolean;
  readonly throttle?: number;
}

const button = (value: number) => ({ pressed: value > 0.5, value });

const pad = (axis: number | null, pressed: Pressed, connected = true): Pad => ({
  axes: axis === null ? [] : [axis],
  buttons: [
    button(0),
    button(pressed.kick === true ? 1 : 0),
    button(pressed.punch === true ? 1 : 0),
    button(0),
    button(0),
    button(0),
    button(pressed.brake ?? 0),
    button(pressed.throttle ?? 0),
  ],
  connected,
});

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

  it("steering eases toward a held key, and opposing keys cancel", () => {
    const { controls, keyboard } = setUp();
    keyboard.press("ArrowRight");
    expect(readOnce(controls).steer).toBeCloseTo(0.15, 9);
    expect(readOnce(controls).steer).toBeCloseTo(0.3, 9);
    keyboard.press("KeyA");
    expect(readOnce(controls).steer).toBe(0);
    expect(readOnce(controls).steer).toBe(0);
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

  it("punch and kick stay held while their keys are down", () => {
    const { controls, keyboard } = setUp();
    keyboard.press("Space");
    keyboard.press("ShiftLeft");
    expect(readOnce(controls)).toMatchObject({ kick: true, punch: true });
    expect(readOnce(controls)).toMatchObject({ kick: true, punch: true });
    keyboard.release("Space");
    expect(readOnce(controls)).toMatchObject({ kick: true, punch: false });
  });

  it("losing focus lets go of every key, and steering eases back", () => {
    const { controls, keyboard } = setUp();
    keyboard.press("ArrowUp");
    keyboard.press("KeyD");
    readOnce(controls);
    readOnce(controls);
    readOnce(controls);
    keyboard.blur();
    const after = readOnce(controls);
    expect(after.throttle).toBe(0);
    expect(after.steer).toBeCloseTo(0.15, 9);
    expect(readOnce(controls).steer).toBe(0);
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
      steer: 0.5,
      throttle: 0.8,
    });
  });

  it("a stick inside its deadzone leaves steering to the keys", () => {
    const { controls, keyboard } = setUp();
    keyboard.pads.push(pad(0.1, {}));
    keyboard.press("ArrowLeft");
    expect(readOnce(controls).steer).toBeCloseTo(-0.15, 9);
  });

  it("a pad without axes or buttons reads as idle", () => {
    const { controls, keyboard } = setUp();
    keyboard.pads.push({ axes: [], buttons: [], connected: true });
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
    const frame: InputFrame = new Map([[PLAYER_RIDER, input]]);
    const ride = (ticks: number) => {
      for (let tick = 0; tick < ticks; tick += 1) {
        controls.read(TICK_SECONDS, input);
        run.step(frame);
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
