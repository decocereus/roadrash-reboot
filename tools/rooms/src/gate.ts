import { parseArgs } from "node:util";

import { gateRules } from "@racer/rooms/gate";
import { decodeRoomMessage, SEAT_CLOSED } from "@racer/rooms/messages";
import { queueUrl } from "@racer/rooms/queue-client";
import { decodeQueueMessage } from "@racer/rooms/queue-messages";
import { seatUrl } from "@racer/rooms/seat-client";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const usage =
  "Usage: pnpm rooms:gate --url http://127.0.0.1:<dev proxy port> [--network 203.0.113] (three octets, a new one each run by default) [--repeat n]";
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

const seatAnswer = (data: string): Answer | null =>
  Option.match(decodeRoomMessage(data), {
    onNone: () => null,
    onSome: (message) => {
      if (message.kind === "lobby") {
        return "admitted";
      }
      if (message.kind === "refused") {
        return message.reason === "limited" ? "limited" : "other";
      }
      return null;
    },
  });

const ticketAnswer = (data: string): Answer | null =>
  Option.match(decodeQueueMessage(data), {
    onNone: () => null,
    onSome: (message) => {
      if (message.kind === "refused") {
        return message.reason === "limited" ? "limited" : "other";
      }
      return "admitted";
    },
  });

interface Tally {
  admitted: number;
  limited: number;
  other: number;
}

const tallyOf = (doors: readonly Door[]): Tally => {
  const tally = { admitted: 0, limited: 0, other: 0 };
  for (const { answer } of doors) {
    tally[answer] += 1;
  }
  return tally;
};

const expect = (
  name: string,
  tally: Tally,
  admitted: number,
  limited: number
): readonly string[] =>
  tally.admitted === admitted && tally.limited === limited && tally.other === 0
    ? []
    : [
        `${name}: expected ${admitted} admitted and ${limited} limited, heard ${JSON.stringify(tally)}.`,
      ];

export const main = Effect.fn("rooms.gate")(function* gate(
  args: readonly string[]
) {
  const { network, repeat, url } = parseArgs({
    args: [...args],
    options: {
      network: {
        default: `203.0.${Math.floor(Math.random() * 250)}`,
        type: "string",
      },
      repeat: { default: "1", type: "string" },
      url: { type: "string" },
    },
  }).values;
  if (url === undefined || url === "") {
    return yield* new GateCheckFailed({ message: usage });
  }
  const stamp = Date.now().toString(36);
  const { build } = decodeStatus(
    yield* Effect.tryPromise(async () => {
      const answer = await globalThis.fetch(`${url}/rooms/gate-${stamp}`);
      return await answer.text();
    })
  );
  const seatIn = (roomId: string, key: string) =>
    seatUrl(url, roomId, "Gate", build, key);
  const rounds = Number(repeat);
  const reports = [];
  const problems: string[] = [];
  for (let round = 0; round < rounds; round += 1) {
    const seatClient = `${network}.${10 + round * 3}`;
    const openClient = `${network}.${11 + round * 3}`;
    const ticketClient = `${network}.${12 + round * 3}`;
    const room = `gate-${stamp}-${round}`;
    const anchor = yield* knock(seatIn(room, "anchor"), seatClient, seatAnswer);
    const seats: Door[] = [];
    for (let seat = 0; seat < gateRules.seat.limit + OVER; seat += 1) {
      const door = yield* knock(
        seatIn(room, "visitor"),
        seatClient,
        seatAnswer
      );
      door.close();
      seats.push(door);
    }
    anchor.close();
    const opens: Door[] = [];
    for (let open = 0; open < gateRules.open.limit + OVER; open += 1) {
      opens.push(
        yield* knock(
          seatIn(`${room}-open-${open}`, "opener"),
          openClient,
          seatAnswer
        )
      );
    }
    const tickets: Door[] = [];
    for (let ticket = 0; ticket < gateRules.queue.limit + OVER; ticket += 1) {
      tickets.push(
        yield* knock(queueUrl(url, build), ticketClient, ticketAnswer)
      );
    }
    for (const door of [...opens, ...tickets]) {
      door.close();
    }
    const report = {
      opens: tallyOf(opens),
      round,
      seats: tallyOf([anchor, ...seats]),
      tickets: tallyOf(tickets),
    };
    reports.push(report);
    problems.push(
      ...expect("seats", report.seats, gateRules.seat.limit, OVER + 1),
      ...expect("opens", report.opens, gateRules.open.limit, OVER),
      ...expect("tickets", report.tickets, gateRules.queue.limit, OVER)
    );
  }
  console.log(JSON.stringify({ problems, reports }, null, 2));
  if (problems.length > 0) {
    return yield* new GateCheckFailed({ message: problems.join(" ") });
  }
  return null;
});
