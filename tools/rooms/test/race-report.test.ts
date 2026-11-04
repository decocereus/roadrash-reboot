import type { RaceSeat, RoomNote } from "@racer/rooms/notes";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { describe, expect, it } from "vitest";

import { groupRaces, raceReport } from "../src/race-report.ts";
import { liveNotes, notesOfLines } from "../src/read.ts";

const seat = (rider: number, more: Partial<RaceSeat>): RaceSeat => ({
  accepted: 100,
  ahead: 0,
  colo: "DEL",
  crashes: 3,
  finishTick: -1,
  late: 2,
  leftAtTick: null,
  missed: 1,
  mode: "riding",
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
    raceId: "race-a",
    road: "slag-row",
    seats: 2,
    seed: 7,
  },
  { kind: "countdown", raceId: "race-a", stillLoading: [1], waitedMs: 20_000 },
  {
    kind: "stats",
    raceId: "race-a",
    rider: 0,
    stats: { crashes: 3, crashesAfterCorrection: 1, heldSteps: 9 },
  },
  {
    catchUpWakes: 4,
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
    raceId: "race-b",
    road: "slag-row",
    seats: 1,
    seed: 8,
  },
  {
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

  it("says when a race has no ended line, and what it knows", () => {
    const report = reportOf(1);
    expect(report).toContain("No ended line");
    expect(report).toContain("Rider 0 left at 0:10");
  });
});

const reportOfSeat = (only: RaceSeat): string =>
  raceReport({
    ended: {
      catchUpWakes: 0,
      kind: "ended",
      raceId: "race-c",
      seats: [only],
      tick: 7200,
      wakeGaps: [],
      worstBehindTicks: 0,
    },
    left: [],
    raceId: "race-c",
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
        'RaceServer {"kind":"refused","reason":"racing"}',
        "starting the worker",
        '{"not":"a note"}',
        "{broken",
      ].join("\n")
    );
    expect(found).toStrictEqual({
      notes: [{ kind: "refused", reason: "racing" }],
      unread: 0,
    });
  });

  it("counts a line that looks like a note but does not match", () => {
    expect(notesOfLines('{"kind":"ended","raceId":"a"}').unread).toBe(1);
  });
});

const answerWith = (sources: readonly unknown[]) =>
  HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        Response.json({
          result: {
            events: { events: sources.map((source) => ({ source })) },
          },
        })
      )
    )
  );

const textOf = ({ body }: HttpClientRequest.HttpClientRequest): string =>
  body._tag === "Uint8Array" ? new TextDecoder().decode(body.body) : "";

describe("reading Cloudflare's logs", () => {
  it("keeps the room's notes and skips other events", async () => {
    const notesRead = await Effect.runPromise(
      liveNotes("rooms-script", 24).pipe(
        Effect.provideService(
          HttpClient.HttpClient,
          answerWith([
            { kind: "refused", reason: "full" },
            { message: "Some other log line" },
          ])
        ),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ CLOUDFLARE_API_TOKEN: "test" })
        )
      )
    );
    expect(notesRead).toStrictEqual({
      notes: [{ kind: "refused", reason: "full" }],
      unread: 0,
    });
  });

  it("asks only for the room's notes, so other log lines cannot use up the limit", async () => {
    const asked: string[] = [];
    await Effect.runPromise(
      liveNotes("rooms-script", 24).pipe(
        Effect.provideService(
          HttpClient.HttpClient,
          HttpClient.make((request) => {
            asked.push(textOf(request));
            return Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                Response.json({ result: { events: { events: [] } } })
              )
            );
          })
        ),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ CLOUDFLARE_API_TOKEN: "test" })
        )
      )
    );
    expect(asked[0]).toContain(
      '{"key":"kind","operation":"exists","type":"string"}'
    );
  });

  it("reads an ended line whose nulls the log store dropped", async () => {
    const { notes: read, unread } = await Effect.runPromise(
      liveNotes("rooms-script", 24).pipe(
        Effect.provideService(
          HttpClient.HttpClient,
          answerWith([
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
        ),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ CLOUDFLARE_API_TOKEN: "test" })
        )
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
      liveNotes("rooms-script", 24).pipe(
        Effect.provideService(
          HttpClient.HttpClient,
          answerWith([
            {
              kind: "countdown",
              raceId: "fa883214-366f-4040-b12b-5ac2969322a9",
              waitedMs: 122,
            },
          ])
        ),
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ CLOUDFLARE_API_TOKEN: "test" })
        )
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
});
