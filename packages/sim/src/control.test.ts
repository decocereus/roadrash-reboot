import { describe, expect, it } from "vitest";

import {
  CONTROL_BYTES,
  controlOf,
  readControl,
  writeControl,
} from "./control.ts";
import {
  controlsOf,
  field,
  player,
  playerFrame,
  quietTrack,
  rivalNamed,
  straight,
} from "./race-fixtures.ts";
import {
  createRace,
  defaultSetup,
  emptyFrame,
  neutralInput,
  stepRace,
} from "./race.ts";
import { PLAYER_RIDER, TICK_RATE } from "./state.ts";
import type {
  Controller,
  InputFrame,
  RaceState,
  RiderId,
  RiderInput,
} from "./state.ts";

const STEER_BYTE = 0;
const BUTTONS_BYTE = 3;

const handing = (
  rider: RiderId,
  to: Controller,
  ...controls: readonly (readonly [RiderId, Readonly<RiderInput>])[]
): InputFrame => ({
  controls: controlsOf(...controls).controls,
  handovers: new Map([[rider, to]]),
});

const rideFor = (
  state: RaceState,
  seconds: number,
  frame: InputFrame
): void => {
  for (let tick = 0; tick < seconds * TICK_RATE; tick += 1) {
    stepRace(state, quietTrack, frame);
  }
};

const weaving = (tick: number): RiderInput => ({
  brake: tick % 300 > 240 ? 0.7 : 0,
  kick: tick % 170 === 0,
  punch: tick % 110 < 4,
  steer: ((tick % 120) - 60) / 75,
  throttle: tick % 300 > 240 ? 0 : 0.9,
});

describe("a rider's controls", () => {
  it("ride on a grid of 127 steps of steer each way and 255 of throttle and brake, with full lock, full pedal and zero exact", () => {
    const state = field(straight, 1, 0, 0);
    const ridden = (input: RiderInput): RiderInput => {
      stepRace(state, straight, playerFrame(input));
      return { ...player(state).input };
    };
    expect(ridden({ ...neutralInput, steer: 1, throttle: 1 })).toStrictEqual({
      ...neutralInput,
      steer: 1,
      throttle: 1,
    });
    expect(ridden({ ...neutralInput, brake: 1, steer: -3 })).toStrictEqual({
      ...neutralInput,
      brake: 1,
      steer: -1,
    });
    expect(
      ridden({
        brake: 0,
        kick: true,
        punch: true,
        steer: -0.001,
        throttle: 0.5,
      })
    ).toStrictEqual({
      brake: 0,
      kick: true,
      punch: true,
      steer: 0,
      throttle: 128 / 255,
    });
    expect(ridden({ ...neutralInput, steer: 0.3 }).steer).toBe(38 / 127);
    expect(ridden({ ...neutralInput, steer: -0.3 }).steer).toBe(-38 / 127);
  });

  it.each(
    (["steer", "throttle", "brake"] as const).flatMap((axis) =>
      [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map(
        (value) => [axis, value] as const
      )
    )
  )(
    "a control whose %s is %d is refused before it reaches a frame",
    (axis, value) => {
      expect(() => playerFrame({ ...neutralInput, [axis]: value })).toThrow(
        RangeError
      );
    }
  );

  it("a refused control names the steer, throttle and brake it was given", () => {
    expect(() =>
      playerFrame({ ...neutralInput, throttle: Number.POSITIVE_INFINITY })
    ).toThrow(
      "A control needs finite steer, throttle and brake, not 0, Infinity and 0."
    );
  });

  it("a race fed its controls through four bytes each rides exactly as one fed the controls themselves", () => {
    const direct = field(quietTrack, 3, 0, 0);
    const wired = field(quietTrack, 3, 0, 0);
    const wire = new DataView(new ArrayBuffer(CONTROL_BYTES));
    for (let tick = 0; tick < 30 * TICK_RATE; tick += 1) {
      const control = controlOf(weaving(tick));
      writeControl(wire, 0, control);
      const read = readControl(wire, 0);
      if (read === undefined) {
        throw new Error(`Tick ${tick} wrote a control it cannot read.`);
      }
      stepRace(direct, quietTrack, {
        ...emptyFrame,
        controls: new Map([[PLAYER_RIDER, control]]),
      });
      stepRace(wired, quietTrack, {
        ...emptyFrame,
        controls: new Map([[PLAYER_RIDER, read]]),
      });
    }
    expect(player(direct).s).toBeGreaterThan(100);
    expect(wired).toStrictEqual(direct);
  });

  it("four bytes with a steer byte of -128 or a button bit past punch and kick are not a control", () => {
    const wire = new DataView(new ArrayBuffer(CONTROL_BYTES));
    wire.setUint8(STEER_BYTE, 128);
    expect(readControl(wire, 0)).toBeUndefined();
    wire.setUint8(STEER_BYTE, 129);
    expect(readControl(wire, 0)).toBe(
      controlOf({ ...neutralInput, steer: -1 })
    );
    wire.setUint8(BUTTONS_BYTE, 4);
    expect(readControl(wire, 0)).toBeUndefined();
    wire.setUint8(BUTTONS_BYTE, 3);
    expect(readControl(wire, 0)).toBe(
      controlOf({ ...neutralInput, kick: true, punch: true, steer: -1 })
    );
  });
});

describe("handing a rider over", () => {
  it("a human rider handed to the pilot rides on from that tick with no control in the frame", () => {
    const state = createRace(defaultSetup(quietTrack, 1));
    rideFor(state, 2, playerFrame(neutralInput));
    const parked = player(state).s;
    expect(player(state).speed).toBe(0);
    stepRace(state, quietTrack, handing(PLAYER_RIDER, "pilot"));
    expect(player(state).controller).toBe("pilot");
    expect(player(state).input.throttle).toBeGreaterThan(0);
    rideFor(state, 10, emptyFrame);
    expect(player(state).speed).toBeGreaterThan(20);
    expect(player(state).s - parked).toBeGreaterThan(200);
  });

  it("a pilot rider handed to a human rides the frame's control from the tick of the handover", () => {
    const setup = defaultSetup(quietTrack, 1);
    const state = createRace({
      ...setup,
      player: { ...setup.player, controller: "pilot" },
    });
    rideFor(state, 10, emptyFrame);
    expect(player(state).speed).toBeGreaterThan(20);
    const braking = { ...neutralInput, brake: 1 };
    stepRace(
      state,
      quietTrack,
      handing(PLAYER_RIDER, "human", [PLAYER_RIDER, braking])
    );
    expect(player(state).controller).toBe("human");
    expect(player(state).input).toStrictEqual(braking);
    rideFor(state, 6, playerFrame(braking));
    expect(player(state).speed).toBe(0);
  });

  it("a frame that hands a rider to the controller already riding it is rejected before the tick moves", () => {
    const state = createRace(defaultSetup(quietTrack, 1));
    expect(() => {
      stepRace(
        state,
        quietTrack,
        handing(PLAYER_RIDER, "human", [PLAYER_RIDER, neutralInput])
      );
    }).toThrow(
      `The frame hands rider ${PLAYER_RIDER} to the human, who already rides it.`
    );
    expect(state.tick).toBe(0);
    expect(player(state).controller).toBe("human");
  });

  it("a frame that hands a rider to the pilot and still carries its control is rejected", () => {
    const state = createRace(defaultSetup(quietTrack, 1));
    expect(() => {
      stepRace(
        state,
        quietTrack,
        handing(PLAYER_RIDER, "pilot", [PLAYER_RIDER, neutralInput])
      );
    }).toThrow(
      `Rider ${PLAYER_RIDER} is ridden by the pilot and has a control in the frame.`
    );
    expect(player(state).controller).toBe("human");
  });

  it("a frame that hands a rival to a human without a control for it is rejected", () => {
    const state = createRace(defaultSetup(quietTrack, 1));
    const dee = rivalNamed(state, "dee-santangelo");
    expect(() => {
      stepRace(
        state,
        quietTrack,
        handing(dee.id, "human", [PLAYER_RIDER, neutralInput])
      );
    }).toThrow(
      `Rider ${dee.id} is ridden by a human and has no control in the frame.`
    );
    expect(dee.controller).toBe("pilot");
  });

  it("a frame that hands over a rider who is not in the race is rejected", () => {
    const state = field(straight, 1, 0, 0);
    const stranger = rivalNamed(field(straight, 1, 1, 0), "dee-santangelo").id;
    expect(() => {
      stepRace(
        state,
        straight,
        handing(stranger, "pilot", [PLAYER_RIDER, neutralInput])
      );
    }).toThrow(`The frame names rider ${stranger}, who is not in the race.`);
  });
});
