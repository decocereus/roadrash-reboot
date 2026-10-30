import { describe, expect, it } from "vitest";

import {
  floatAt,
  recordAt,
  samplesAt,
  schemaOf,
  textAt,
} from "./snapshot-members.ts";
import type { Fields } from "./snapshot-members.ts";

interface Seeded {
  seed: number;
}

interface Bordered {
  edge: number;
  seeded: Seeded;
}

interface Perhaps {
  seeded?: Seeded;
}

interface Sampled {
  readonly run: Float64Array;
}

type Tagged = { kind: "left"; left: number } | { kind: "right"; right: number };

const seededSchema = schemaOf<Seeded, Seeded>({ seed: floatAt("seed") });

describe("the snapshot schema", () => {
  it("refuses a codec that covers one variant of a union", () => {
    const covered = {
      kind: textAt("kind"),
      // @ts-expect-error -- a union needs one codec per variant, so Fields is never
    } satisfies Fields<Tagged, Tagged>;
    expect(covered.kind.bytes({ kind: "left" })).toBeGreaterThan(0);
  });

  it("refuses a record codec that leaves a field out", () => {
    const partial = {
      seeded: recordAt("seeded", seededSchema),
      // @ts-expect-error -- edge has no codec entry
    } satisfies Fields<Bordered, Bordered>;
    expect(Object.keys(partial)).toStrictEqual(["seeded"]);
  });

  it("refuses a codec that names a field the record does not hold", () => {
    const stray = {
      // @ts-expect-error -- Seeded holds no edge
      edge: floatAt("edge"),
      seed: floatAt("seed"),
    } satisfies Fields<Seeded, Seeded>;
    expect(Object.keys(stray)).toStrictEqual(["edge", "seed"]);
  });

  it("refuses an optional field without a codec that carries its presence", () => {
    const hopeful = {
      // @ts-expect-error -- an optional record is not a record the codec can read
      seeded: recordAt("seeded", seededSchema),
    } satisfies Fields<Perhaps, Perhaps>;
    expect(Object.keys(hopeful)).toStrictEqual(["seeded"]);
  });

  it("refuses a digest-only writer in a schema that must restore", () => {
    const written = {
      // @ts-expect-error -- samplesAt writes but never restores
      run: samplesAt("run"),
    } satisfies Fields<Sampled, Sampled>;
    expect(Object.keys(written)).toStrictEqual(["run"]);
  });
});
