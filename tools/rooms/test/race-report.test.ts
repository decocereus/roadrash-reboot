import type { RaceSeat, RoomNote } from "@racer/rooms/notes";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";

import { groupRaces, raceReport } from "../src/race-report.ts";
import { liveNotes, notesOfLines } from "../src/read.ts";

const seat = (rider: number, more: Partial<RaceSeat>): RaceSeat => ({
  accepted: 100,
  ahead: 0,
  asn: 64_512,
  colo: "DEL",
  crashes: 3,
  finishTick: -1,
  late: 2,
  leftAtTick: null,
  missed: 1,
  mode: "riding",
  network: "Test Net",
  readyMs: 2500,
  reported: false,
  rider,
  roadMetres: 4200,
  tcpRttMs: 8,
  ...more,
});

const notes: readonly RoomNote[] = [
  {
    at: 1_793_730_488_256,
    build: "abcdef0123456789",
    digest: "00",
    kind: "started",
    lobbyMs: 30_000,
    police: "normal",
    protocol: 1,
    raceId: "race-a",
    road: "slag-row",
    roomColo: "SIN",
    seats: 2,
    seed: 7,
    tier: 2,
    trackHash: "00",
    traffic: "normal",
  },
  { kind: "countdown", raceId: "race-a", stillLoading: [1], waitedMs: 20_000 },
  {
    kind: "stats",
    raceId: "race-a",
    rider: 0,
    stats: { crashes: 3, crashesAfterCorrection: 1, slowedMs: 9 },
  },
  {
    catchUpWakes: 4,
    dropped: 0,
    kind: "ended",
    raceId: "race-a",
    seats: [
      seat(0, { finishTick: 7200, reported: true }),
      seat(1, { colo: "MRS", leftAtTick: 3600, tcpRttMs: 160 }),
    ],
    tick: 7200,
    wakeGaps: [7000, 100, 50, 5, 1],
    worstBehindTicks: 3,
  },
  {
    at: 1_793_730_999_000,
    build: "abcdef0123456789",
    digest: "00",
    kind: "started",
    lobbyMs: 1000,
    police: "normal",
    protocol: 1,
    raceId: "race-b",
    road: "slag-row",
    roomColo: "SIN",
    seats: 1,
    seed: 8,
    tier: 2,
    trackHash: "00",
    traffic: "normal",
  },
  {
    closeCode: 1006,
    kind: "left",
    raceId: "race-b",
    seatsLeft: 0,
    tally: { accepted: 9, ahead: 0, late: 0, missed: 2, rider: 0 },
    tick: 600,
  },
];

const reportOf = (at: number): string => {
  const race = groupRaces(notes)[at];
  if (!race) {
    throw new Error("No race.");
  }
  return raceReport(race);
};

describe("the race report", () => {
  it("keeps races apart by race ID, oldest first", () => {
    expect(groupRaces(notes).map((race) => race.raceId)).toStrictEqual([
      "race-a",
      "race-b",
    ]);
  });

  it("says where the room ran and which network each rider came through", () => {
    const report = reportOf(0);
    expect(report).toContain("room in SIN");
    expect(report).toContain("DEL at 8 ms on Test Net");
  });

  it("names the race and how it started", () => {
    const report = reportOf(0);
    expect(report).toContain("Race race-a on slag-row");
    expect(report).toContain("build abcdef012345");
    expect(report).toContain("started without rider(s) 1");
    expect(report).toContain("browser stats from 1 of 2 riders");
    expect(report).toContain("over 100 ms: 1");
  });

  it("gives each rider's numbers, and says when a browser sent none", () => {
    const report = reportOf(0);
    expect(report).toContain("Rider 0: finished at 2:00, DEL at 8 ms");
    expect(report).toContain("crashes 3, 1 after a correction");
    expect(report).toContain("Rider 1: left at 1:00, MRS at 160 ms");
    expect(report).toContain("browser: no stats line arrived");
  });

  it("says when a rider lost the link and when they came back", () => {
    const [race] = groupRaces([
      ...notes,
      {
        closeCode: 1006,
        kind: "held",
        raceId: "race-a",
        rider: 1,
        tick: 3600,
      },
      {
        awayMs: 4200,
        catchUpTicks: 3852,
        kind: "rejoined",
        raceId: "race-a",
        rider: 1,
      },
    ]);
    if (!race) {
      throw new Error("No race.");
    }
    const report = raceReport(race);
    expect(report).toContain(
      "Rider 1 lost the link at 1:00, socket closed 1006, bike held"
    );
    expect(report).toContain(
      "Rider 1 came back after 4.2 s and caught up 3852 ticks"
    );
  });

  it("lists each link's browser stats when a rider came back", () => {
    const [race] = groupRaces([
      ...notes,
      {
        kind: "stats",
        raceId: "race-a",
        rider: 0,
        stats: { crashes: 5 },
      },
    ]);
    if (!race) {
      throw new Error("No race.");
    }
    const report = raceReport(race);
    expect(report).toContain("browser stats from 1 of 2 riders");
    expect(report).toMatch(
      /connection 1:\n {4}crashes 3[^]*connection 2:\n {4}crashes 5/u
    );
  });

  it("says when a race has no ended line, and what it knows", () => {
    const report = reportOf(1);
    expect(report).toContain("No ended line");
    expect(report).toContain("Rider 0 left at 0:10");
  });
});

const reportOfSeat = (only: RaceSeat): string =>
  raceReport({
    browsers: [],
    drops: [],
    ended: {
      catchUpWakes: 0,
      dropped: 0,
      kind: "ended",
      raceId: "race-c",
      seats: [only],
      tick: 7200,
      wakeGaps: [],
      worstBehindTicks: 0,
    },
    left: [],
    raceId: "race-c",
    restarts: [],
    stats: [],
  });

describe("a rider who left", () => {
  it("still reads as having left when the pilot finishes for them", () => {
    expect(
      reportOfSeat(seat(0, { finishTick: 7200, leftAtTick: 3600 }))
    ).toContain("Rider 0: left at 1:00, the pilot finished at 2:00");
  });

  it("reads as finished when they closed the tab after the line", () => {
    expect(
      reportOfSeat(seat(0, { finishTick: 3600, leftAtTick: 7200 }))
    ).toContain("Rider 0: finished at 1:00");
  });
});

describe("reading a log", () => {
  it("finds notes in log lines and skips everything else", () => {
    const found = notesOfLines(
      [
        'RaceServer {"kind":"refused","reason":"full"}',
        "starting the worker",
        '{"not":"a note"}',
        "{broken",
      ].join("\n")
    );
    expect(found).toStrictEqual({
      notes: [{ kind: "refused", reason: "full" }],
      unread: 0,
    });
  });

  it("counts a line that looks like a note but does not match", () => {
    expect(notesOfLines('{"kind":"ended","raceId":"a"}').unread).toBe(1);
  });
});

const textOf = ({ body }: HttpClientRequest.HttpClientRequest): string =>
  body._tag === "Uint8Array" ? new TextDecoder().decode(body.body) : "";

const decodeAsked = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      limit: Schema.Number,
      timeframe: Schema.Struct({ from: Schema.Number, to: Schema.Number }),
    })
  )
);

interface StoredLine {
  readonly source: unknown;
  readonly timestamp: number;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

const logStore = (
  lines: readonly StoredLine[],
  widestUnsampledMs: number
): HttpClient.HttpClient =>
  HttpClient.make((request) => {
    const { limit, timeframe } = decodeAsked(textOf(request));
    const sampled = timeframe.to - timeframe.from > widestUnsampledMs;
    const inWindow = lines
      .filter(
        ({ timestamp }) =>
          timestamp > timeframe.from && timestamp < timeframe.to
      )
      .toSorted((left, right) => right.timestamp - left.timestamp);
    const answered = sampled
      ? inWindow.filter((_line, at) => at % 10 === 0)
      : inWindow;
    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        Response.json({
          result: {
            events: { events: answered.slice(0, limit) },
            statistics: { abr_level: sampled ? 10 : 1 },
          },
        })
      )
    );
  });

const readFrom = (store: HttpClient.HttpClient) =>
  liveNotes("rooms-script", 24).pipe(
    Effect.provideService(HttpClient.HttpClient, store),
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ CLOUDFLARE_API_TOKEN: "test" })
    ),
    Effect.provide(TestClock.layer())
  );

const storeOf = (sources: readonly unknown[]): HttpClient.HttpClient =>
  logStore(
    sources.map((source) => ({ source, timestamp: -MS_PER_HOUR })),
    Number.POSITIVE_INFINITY
  );

const refusedLines = (count: number, from: number): readonly StoredLine[] =>
  Array.from({ length: count }, (_unused, at) => ({
    source: { kind: "refused", reason: "full" },
    timestamp: from + at * 1000,
  }));

describe("reading Cloudflare's logs", () => {
  it("keeps the room's notes and skips other events", async () => {
    const notesRead = await Effect.runPromise(
      readFrom(
        storeOf([
          { kind: "refused", reason: "full" },
          { message: "Some other log line" },
        ])
      )
    );
    expect(notesRead).toStrictEqual({
      notes: [{ kind: "refused", reason: "full" }],
      unread: 0,
    });
  });

  it("asks only for the room's notes, without saving the query in the account", async () => {
    const asked: string[] = [];
    await Effect.runPromise(
      readFrom(
        HttpClient.make((request) => {
          asked.push(textOf(request));
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({ result: { events: { events: [] } } })
            )
          );
        })
      )
    );
    expect(asked[0]).toContain(
      '{"key":"kind","operation":"exists","type":"string"}'
    );
    expect(asked[0]).toContain('"dry":true');
  });

  it("reads an ended line whose nulls the log store dropped", async () => {
    const { notes: read, unread } = await Effect.runPromise(
      readFrom(
        storeOf([
          {
            catchUpWakes: 0,
            kind: "ended",
            raceId: "9f635600-4c59-420c-98c2-e9b40f23d752",
            seats: [
              {
                accepted: 0,
                ahead: 0,
                crashes: 0,
                finishTick: 12_286,
                late: 0,
                missed: 12_286,
                mode: "riding",
                reported: false,
                rider: 1,
                roadMetres: 8624,
              },
            ],
            tick: 12_664,
            wakeGaps: [13_858, 0, 0, 0, 0],
            worstBehindTicks: 1,
          },
        ])
      )
    );
    expect({
      seat: read[0]?.kind === "ended" ? read[0].seats[0] : null,
      unread,
    }).toMatchObject({
      seat: { colo: null, leftAtTick: null, readyMs: null, tcpRttMs: null },
      unread: 0,
    });
  });

  it("reads a countdown whose empty list the log store dropped", async () => {
    const { notes: read, unread } = await Effect.runPromise(
      readFrom(
        storeOf([
          {
            kind: "countdown",
            raceId: "fa883214-366f-4040-b12b-5ac2969322a9",
            waitedMs: 122,
          },
        ])
      )
    );
    expect({ read, unread }).toStrictEqual({
      read: [
        {
          kind: "countdown",
          raceId: "fa883214-366f-4040-b12b-5ac2969322a9",
          stillLoading: [],
          waitedMs: 122,
        },
      ],
      unread: 0,
    });
  });

  it("reads a window Cloudflare samples in parts, so every race keeps its ended line", async () => {
    const { notes: read } = await Effect.runPromise(
      readFrom(
        logStore(
          notes.map((source, at) => ({
            source,
            timestamp: -2 * MS_PER_HOUR + at * MS_PER_MINUTE,
          })),
          MS_PER_HOUR
        )
      )
    );
    expect(read).toStrictEqual(notes);
  });

  it("reads a window whose answer fills the limit in parts", async () => {
    const lines = refusedLines(4500, -3 * MS_PER_HOUR);
    const { notes: read } = await Effect.runPromise(
      readFrom(logStore(lines, Number.POSITIVE_INFINITY))
    );
    expect(read).toHaveLength(lines.length);
  });

  it("fails rather than report a sampled log as the whole log", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(readFrom(logStore(refusedLines(30, -MS_PER_HOUR), 0)))
    );
    expect(failure.message).toContain("sampled");
  });

  it("keeps a line that falls exactly where the reader splits a window", async () => {
    const day = 24 * MS_PER_HOUR;
    const middle: StoredLine = {
      source: { kind: "refused", reason: "full" },
      timestamp: -day / 2,
    };
    const { notes: read } = await Effect.runPromise(
      readFrom(logStore([middle], day - 1))
    );
    expect(read).toStrictEqual([middle.source]);
  });
});
