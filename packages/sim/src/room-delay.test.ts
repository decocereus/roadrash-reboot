import { describe, expect, it } from "vitest";

import {
  BUTTONS_OF_A_CONTROL,
  controlOf,
  holds,
  withoutButtons,
} from "./control.ts";
import { ROOM_LIMIT_TICKS, track } from "./race-fixtures.ts";
import { defaultSetup, neutralInput } from "./race.ts";
import { createRoomClient } from "./room-client.ts";
import {
  createInputBatch,
  inputBytes,
  MOST_BATCHED_CONTROLS,
  readInput,
} from "./room-wire.ts";
import { roomSetup } from "./room.ts";
import { PLAYER_RIDER } from "./state.ts";
import type { Control } from "./state.ts";

const [PUNCH] = BUTTONS_OF_A_CONTROL;
const steeringLeft = controlOf({ ...neutralInput, steer: -0.4, throttle: 1 });
const punchingRight = controlOf({
  ...neutralInput,
  punch: true,
  steer: 0.4,
  throttle: 1,
});

const sentControls = (
  ridden: (client: ReturnType<typeof createRoomClient>) => void
): Map<number, Control> => {
  const setup = roomSetup(defaultSetup(track, 3), [PLAYER_RIDER]);
  const client = createRoomClient(setup, PLAYER_RIDER, ROOM_LIMIT_TICKS);
  ridden(client);
  const out = new DataView(new ArrayBuffer(inputBytes(MOST_BATCHED_CONTROLS)));
  const batch = createInputBatch();
  const sent = new Map<number, Control>();
  for (
    let bytes = client.writeInputs(out);
    bytes > 0;
    bytes = client.writeInputs(out)
  ) {
    readInput(new DataView(out.buffer, 0, bytes), batch);
    for (const [at, control] of batch.controls.entries()) {
      sent.set(batch.firstTick + at, control);
    }
  }
  return sent;
};

describe("controls a room client sends ahead of its race", () => {
  it("sends a control the delay's ticks ahead, holding the last steer without its presses over the ticks it skipped", () => {
    const sent = sentControls((client) => {
      client.predict(punchingRight);
      client.predict(steeringLeft, 3);
    });
    expect([...sent.keys()]).toStrictEqual([1, 2, 3, 4, 5]);
    expect(sent.get(1)).toBe(punchingRight);
    expect([sent.get(2), sent.get(3), sent.get(4)]).toStrictEqual([
      withoutButtons(punchingRight),
      withoutButtons(punchingRight),
      withoutButtons(punchingRight),
    ]);
    expect(sent.get(5)).toBe(steeringLeft);
  });

  it("keeps the controls it already planned when the delay shrinks, and carries a press into the next control it plans", () => {
    const sent = sentControls((client) => {
      client.predict(steeringLeft, 3);
      client.predict(punchingRight, 0);
      client.predict(steeringLeft, 0);
      client.predict(steeringLeft, 0);
      client.predict(steeringLeft, 0);
    });
    expect([...sent.keys()]).toStrictEqual([1, 2, 3, 4, 5]);
    expect(sent.get(4)).toBe(steeringLeft);
    expect(holds(sent.get(5) ?? steeringLeft, PUNCH)).toBeTruthy();
  });
});
