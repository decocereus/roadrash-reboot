declare function describe(name: string, run: () => void): void;
declare function test(name: string, run: () => void): void;

type Comparable =
  | string
  | number
  | boolean
  | null
  | readonly Comparable[]
  | { readonly [key: string]: Comparable | undefined };

const assert = {
  equal(
    actual: string | number | boolean | null,
    expected: string | number | boolean | null,
  ): void {
    if (actual !== expected)
      throw new Error(`Expected ${String(actual)} to equal ${String(expected)}`);
  },
  deepEqual(actual: Comparable, expected: Comparable): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error("Expected values to be deeply equal");
  },
};

import {
  decodeClientMessage,
  encodeServerMessage,
  ErrorMessage,
  PROTOCOL_VERSION,
  RoomStateMessage,
} from "./index";
import { Schema } from "effect";

describe("protocol boundaries", () => {
  test("decodes a valid input message with Effect 4", () => {
    const result = decodeClientMessage({
      protocol: PROTOCOL_VERSION,
      type: "input",
      sequence: 4,
      input: { steer: -1, throttle: 1, brake: 0, attack: true },
    });

    assert.equal(result._tag, "Success");
    if (result._tag !== "Success") throw new Error("Expected a decoded input message");
    assert.equal(result.success.type, "input");
    if (result.success.type === "input") assert.equal(result.success.input.attack, true);
  });

  test("rejects invalid protocol versions and input ranges", () => {
    const badVersion = decodeClientMessage({ protocol: 2, type: "start" });
    const badInput = decodeClientMessage({
      protocol: PROTOCOL_VERSION,
      type: "input",
      sequence: -1,
      input: { steer: 2, throttle: 0, brake: 0, attack: false },
    });

    assert.equal(badVersion._tag, "Failure");
    assert.equal(badInput._tag, "Failure");
  });

  test("allows optional join and player fields to be omitted", () => {
    const join = decodeClientMessage({
      protocol: PROTOCOL_VERSION,
      type: "join",
      ticket: "ticket",
    });
    const room = Schema.decodeUnknownResult(RoomStateMessage)({
      protocol: PROTOCOL_VERSION,
      type: "room_state",
      roomCode: "ABCD",
      phase: "lobby",
      hostPlayerId: "player",
      players: [],
      maxPlayers: 4,
    });

    assert.equal(join._tag, "Success");
    assert.equal(room._tag, "Success");
  });

  test("encodes server messages as JSON without changing their shape", () => {
    const message = {
      protocol: PROTOCOL_VERSION,
      type: "error",
      code: "invalid_input",
      message: "bad",
    } as const;
    const encoded = encodeServerMessage(message);

    assert.deepEqual(JSON.parse(encoded), message);
    assert.equal(Schema.decodeUnknownResult(ErrorMessage)(JSON.parse(encoded))._tag, "Success");
  });
});
