import { parseArgs } from "node:util";

import { gateRules } from "@racer/rooms/gate";
import type { Gate } from "@racer/rooms/gate";
import { decodeRoomMessage, SEAT_CLOSED } from "@racer/rooms/messages";
import { queueUrl } from "@racer/rooms/queue-client";
import { decodeQueueMessage } from "@racer/rooms/queue-messages";
import { seatUrl } from "@racer/rooms/seat-client";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const usage = "Usage: pnpm rooms:gate --url http://127.0.0.1:<dev proxy port>";
const ANSWER_MS = 5000;
const OVER = 3;

class GateCheckFailed extends Data.TaggedError("GateCheckFailed")<{
  readonly message: string;
}> {}

const decodeStatus = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ build: Schema.String }))
);

type Answer = "admitted" | "limited" | "other";

interface Door {
  readonly answer: Answer;
  readonly close: () => void;
}

const knock = (
  url: string,
  client: string,
  answerOf: (data: string) => Answer | null
) =>
  Effect.callback<Door>((resume) => {
    const socket = new WebSocket(url, {
      headers: { "cf-connecting-ip": client },
    });
    const close = (): void => {
      socket.close(SEAT_CLOSED, "Gate check done.");
    };
    let answered = false;
    const answer = (value: Answer): void => {
      if (!answered) {
        answered = true;
        resume(Effect.succeed({ answer: value, close }));
      }
    };
    socket.addEventListener("message", (event) => {
      const data: unknown = event.data;
      const heard = data instanceof ArrayBuffer ? null : answerOf(String(data));
      if (heard !== null) {
        answer(heard);
      }
    });
    socket.addEventListener("close", () => {
      answer("other");
    });
    setTimeout(() => {
      answer("other");
    }, ANSWER_MS);
  });

const refusalAnswer = (reason: string): Answer =>
  reason === "limited" ? "limited" : "other";

const seatAnswer = (data: string): Answer | null =>
  Option.match(decodeRoomMessage(data), {
    onNone: () => null,
    onSome: (message) => {
      if (message.kind === "lobby") {
        return "admitted";
      }
      return message.kind === "refused" ? refusalAnswer(message.reason) : null;
    },
  });

const ticketAnswer = (data: string): Answer | null =>
  Option.match(decodeQueueMessage(data), {
    onNone: () => null,
    onSome: (message) =>
      message.kind === "refused" ? refusalAnswer(message.reason) : "admitted",
  });

export const main = Effect.fn("rooms.gate")(function* gate(
  args: readonly string[]
) {
  const { url } = parseArgs({
    args: [...args],
    options: { url: { type: "string" } },
  }).values;
  if (url === undefined || url === "") {
    return yield* new GateCheckFailed({ message: usage });
  }
  const room = `gate-${Date.now().toString(36)}`;
  const { build } = decodeStatus(
    yield* Effect.tryPromise(async () => {
      const answer = await globalThis.fetch(`${url}/rooms/${room}`);
      return await answer.text();
    })
  );
  const network = `203.0.${Math.floor(Math.random() * 250)}`;
  const anchor = yield* knock(
    seatUrl(url, room, "Gate", build, "anchor"),
    `${network}.10`,
    seatAnswer
  );
  const bursts = {
    open: (knockNumber) =>
      knock(
        seatUrl(url, `${room}-${knockNumber}`, "Gate", build, "opener"),
        `${network}.11`,
        seatAnswer
      ),
    queue: () => knock(queueUrl(url, build), `${network}.12`, ticketAnswer),
    seat: () =>
      knock(
        seatUrl(url, room, "Gate", build, "visitor"),
        `${network}.10`,
        seatAnswer
      ),
  } satisfies Record<Gate, (knockNumber: number) => Effect.Effect<Door>>;
  const problems: string[] = [];
  const tallies = {
    open: { admitted: 0, limited: 0, other: 0 },
    queue: { admitted: 0, limited: 0, other: 0 },
    seat: { admitted: 0, limited: 0, other: 0 },
  } satisfies Record<Gate, Record<Answer, number>>;
  tallies.seat[anchor.answer] += 1;
  for (const name of ["seat", "open", "queue"] as const) {
    const tally = tallies[name];
    const { limit } = gateRules[name];
    while (tally.admitted + tally.limited + tally.other < limit + OVER) {
      const door = yield* bursts[name](tally.admitted + tally.limited);
      door.close();
      tally[door.answer] += 1;
    }
    if (tally.admitted !== limit || tally.limited !== OVER) {
      problems.push(
        `${name}: expected ${limit} admitted and ${OVER} limited, heard ${JSON.stringify(tally)}.`
      );
    }
  }
  anchor.close();
  console.log(JSON.stringify({ problems, tallies }, null, 2));
  if (problems.length > 0) {
    return yield* new GateCheckFailed({ message: problems.join(" ") });
  }
  return null;
});
