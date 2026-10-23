import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PathService from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { jsonlStoreLayer } from "../src/jsonl-store.ts";
import { HISTOGRAM_BUCKETS, TELEMETRY_VERSION } from "../src/limits.ts";
import { memoryStore } from "../src/memory-store.ts";
import { decodeStoredLineEffect } from "../src/schema.ts";
import type { Batch } from "../src/schema.ts";
import { TelemetryStore } from "../src/store.ts";

const FIRST = "3f0c2a1e-7b6d-4c1a-9e2f-0123456789ab";
const SECOND = "5a1b2c3d-0000-4000-8000-000000000002";
const DIRECTORY = "/sessions";

const batchOf = (sessionId: string, batchId: number): Batch => ({
  at: 30_000,
  batchId,
  discardedMs: 0,
  dropped: { batches: 0, events: 0, faults: 0 },
  events: [],
  frames: 1800,
  fromFrame: 0,
  histogram: Array.from({ length: HISTOGRAM_BUCKETS }, () => 0),
  kind: "periodic",
  parts: ["sim"],
  quality: null,
  reportId: null,
  sentAt: "2026-10-16T10:00:00.000Z",
  session: {
    build: { dirty: false, sha: "a90c5bc" },
    device: "air",
    pixelRatio: 2,
    renderer: "ANGLE (Apple)",
    screenHeight: 956,
    screenWidth: 1470,
    sessionId,
    startedAt: "2026-10-16T09:59:30.000Z",
    userAgent: "test",
  },
  toFrame: 1800,
  totalMs: 30_000,
  version: TELEMETRY_VERSION,
  worst: [],
});

const lineOf = (batch: Batch, receivedAt = "2026-10-16T10:00:30.000Z") =>
  JSON.stringify({ batch, receivedAt });

const save = (batch: Batch, line = lineOf(batch)) =>
  TelemetryStore.use((store) => store.save(batch, line));

interface Fixture {
  readonly layer: Layer.Layer<TelemetryStore>;
  readonly text: (sessionId: string) => Promise<string>;
}

let directory = "";

const nodeServices = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

const jsonlFixture = (): Fixture => ({
  layer: jsonlStoreLayer(directory).pipe(Layer.provide(nodeServices)),
  text: async (sessionId) =>
    await readFile(path.join(directory, `${sessionId}.jsonl`), "utf-8"),
});

const memoryFixture = (): Fixture => {
  const store = memoryStore();
  return {
    layer: store.layer,
    text: async (sessionId) =>
      await Promise.resolve(
        store
          .lines()
          .filter((line) => line.includes(sessionId))
          .map((line) => `${line}\n`)
          .join("")
      ),
  };
};

const run = async <A, E>(
  fixture: Fixture,
  effect: Effect.Effect<A, E, TelemetryStore>
) => await Effect.runPromise(effect.pipe(Effect.provide(fixture.layer)));

const systemError = (tag: "NotFound" | "PermissionDenied" | "Unknown") =>
  PlatformError.systemError({
    _tag: tag,
    method: "readFileString",
    module: "FileSystem",
  });

interface Disk {
  readonly text?: string;
  readonly read?: PlatformError.PlatformError;
  readonly append?: PlatformError.PlatformError;
}

const injected = (disk: Disk) => {
  const appended: string[] = [];
  let failing = disk.append;
  const fileSystem = FileSystem.layerNoop({
    makeDirectory: () => Effect.void,
    readFileString: () =>
      disk.read === undefined && disk.text !== undefined
        ? Effect.succeed(disk.text)
        : Effect.fail(disk.read ?? systemError("NotFound")),
    writeFileString: (_file, data) =>
      Effect.suspend(() => {
        const failure = failing;
        failing = undefined;
        if (failure !== undefined) {
          return Effect.fail(failure);
        }
        appended.push(data);
        return Effect.void;
      }),
  });
  return {
    appended: (): readonly string[] => [...appended],
    layer: jsonlStoreLayer(DIRECTORY).pipe(
      Layer.provide(Layer.mergeAll(fileSystem, PathService.layer))
    ),
  };
};

const failureOf = async (layer: Layer.Layer<TelemetryStore>, batch: Batch) =>
  await Effect.runPromise(Effect.flip(save(batch).pipe(Effect.provide(layer))));

const OLD_SESSION = "3f0c2a1e-7b4d-4c1a-9e2f-5d6a7b8c9d01";

const oldLine = async (): Promise<string> => {
  const fixtureFile = path.resolve(
    import.meta.dirname,
    `../../../tools/perf/test/fixtures/sessions/${OLD_SESSION}.jsonl`
  );
  const text = await readFile(fixtureFile, "utf-8");
  const [first = ""] = text.split("\n");
  return first;
};

describe("telemetry stores", () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "rushline-store-"));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  describe.each([
    ["JSONL", jsonlFixture],
    ["memory", memoryFixture],
  ])("the %s telemetry store", (_name, make) => {
    it("saves a first batch and refuses its duplicate without writing again", async () => {
      const fixture = make();
      await expect(run(fixture, save(batchOf(FIRST, 0)))).resolves.toBe(
        "saved"
      );
      await expect(run(fixture, save(batchOf(FIRST, 0)))).resolves.toBe(
        "duplicate"
      );
      await expect(fixture.text(FIRST)).resolves.toBe(
        `${lineOf(batchOf(FIRST, 0))}\n`
      );
    });

    it("keys a batch by its session as well as its id", async () => {
      const fixture = make();
      await run(fixture, save(batchOf(FIRST, 0)));
      await expect(run(fixture, save(batchOf(SECOND, 0)))).resolves.toBe(
        "saved"
      );
      await expect(fixture.text(SECOND)).resolves.toBe(
        `${lineOf(batchOf(SECOND, 0))}\n`
      );
    });

    it("keeps the first line when a duplicate arrives with other bytes", async () => {
      const fixture = make();
      const batch = batchOf(FIRST, 1);
      await run(fixture, save(batch));
      await run(
        fixture,
        save(batch, lineOf(batch, "2026-10-16T11:00:00.000Z"))
      );
      await expect(fixture.text(FIRST)).resolves.toBe(`${lineOf(batch)}\n`);
    });

    it("writes one line for duplicates that arrive together", async () => {
      const fixture = make();
      const batch = batchOf(FIRST, 2);
      await expect(
        run(
          fixture,
          Effect.all([save(batch), save(batch), save(batch)], {
            concurrency: "unbounded",
          })
        )
      ).resolves.toStrictEqual(["saved", "duplicate", "duplicate"]);
      await expect(fixture.text(FIRST)).resolves.toBe(`${lineOf(batch)}\n`);
    });
  });

  describe("the JSONL telemetry store", () => {
    it("remembers saved batches across a restart", async () => {
      await run(jsonlFixture(), save(batchOf(FIRST, 0)));
      const restarted = jsonlFixture();
      await expect(run(restarted, save(batchOf(FIRST, 0)))).resolves.toBe(
        "duplicate"
      );
      await expect(run(restarted, save(batchOf(FIRST, 1)))).resolves.toBe(
        "saved"
      );
      await expect(restarted.text(FIRST)).resolves.toBe(
        `${lineOf(batchOf(FIRST, 0))}\n${lineOf(batchOf(FIRST, 1))}\n`
      );
    });

    it.each([["PermissionDenied"], ["Unknown"]] as const)(
      "fails without appending when the session file read fails with %s",
      async (tag) => {
        const read = systemError(tag);
        const disk = injected({ read, text: "" });
        const failure = await failureOf(disk.layer, batchOf(FIRST, 0));
        expect(failure.operation).toBe("read");
        expect(failure.path).toBe(`${DIRECTORY}/${FIRST}.jsonl`);
        expect(failure.cause).toBe(read);
        expect(disk.appended()).toStrictEqual([]);
      }
    );

    it.each([
      ["is not JSON", "{not json"],
      ["is not a stored batch", '{"batch":{"batchId":0}}'],
    ])(
      "fails without appending when a stored line %s",
      async (_case, broken) => {
        const disk = injected({
          text: `${lineOf(batchOf(FIRST, 0))}\n${broken}\n`,
        });
        const failure = await failureOf(disk.layer, batchOf(FIRST, 1));
        expect(failure.operation).toBe("decode");
        expect(failure.line).toBe(2);
        expect(failure.cause).toBeDefined();
        expect(disk.appended()).toStrictEqual([]);
      }
    );

    it("ignores blank lines and the trailing newline", async () => {
      const disk = injected({
        text: `\n${lineOf(batchOf(FIRST, 0))}\n\n`,
      });
      await expect(
        Effect.runPromise(
          Effect.all([save(batchOf(FIRST, 0)), save(batchOf(FIRST, 1))]).pipe(
            Effect.provide(disk.layer)
          )
        )
      ).resolves.toStrictEqual(["duplicate", "saved"]);
      expect(disk.appended()).toStrictEqual([`${lineOf(batchOf(FIRST, 1))}\n`]);
    });

    it("does not count a batch whose append failed, and lets the next save in", async () => {
      const append = systemError("Unknown");
      const disk = injected({ append });
      const failure = await failureOf(disk.layer, batchOf(FIRST, 0));
      expect(failure.operation).toBe("append");
      expect(failure.cause).toBe(append);
      await expect(
        Effect.runPromise(
          save(batchOf(FIRST, 0)).pipe(Effect.provide(disk.layer))
        )
      ).resolves.toBe("saved");
      expect(disk.appended()).toStrictEqual([`${lineOf(batchOf(FIRST, 0))}\n`]);
    });

    it("reads an old line without frame rate or samples and adds no defaults", async () => {
      const line = await oldLine();
      const stored = await Effect.runPromise(decodeStoredLineEffect(line));
      expect(Object.keys(stored.batch.quality ?? {}).toSorted()).toStrictEqual([
        "bloomScale",
        "pace",
        "pixelRatio",
        "rung",
        "shadowMap",
      ]);
      const disk = injected({ text: `${line}\n` });
      await expect(
        Effect.runPromise(
          save(batchOf(OLD_SESSION, stored.batch.batchId)).pipe(
            Effect.provide(disk.layer)
          )
        )
      ).resolves.toBe("duplicate");
      expect(disk.appended()).toStrictEqual([]);
    });
  });
});
