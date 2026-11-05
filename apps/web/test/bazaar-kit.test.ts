import { readFileSync } from "node:fs";

import { trackFor } from "@racer/track/roads";
import { stallSizes, stallVariants } from "@racer/track/stalls";
import * as Schema from "effect/Schema";
import type * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { modelUrls } from "../src/assets/model-urls.ts";
import { assetParsers } from "../src/game/assets.ts";
import { buildBazaar, decoParts, stallParts } from "../src/game/bazaar.ts";
import { createShading } from "../src/game/cel.ts";
import { createClearance } from "../src/game/clearance.ts";
import { lookOf } from "../src/game/looks.ts";
import { isMesh } from "../src/game/meshes.ts";
import { artFile } from "./art-files.ts";

const STALL_LIMIT = 400;
const DECO_LIMIT = 60;
const MARKET_CEL_TRIANGLES = 20_486;
const MARKET_GLOW_TRIANGLES = 22_308;

const kit = async () =>
  await assetParsers.parts(artFile(modelUrls.stalls), modelUrls.stalls);

const metrics = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        footprint: Schema.NullOr(
          Schema.Struct({ depth: Schema.Number, wide: Schema.Number })
        ),
      })
    )
  )
)(
  readFileSync(
    new URL(
      "../../../docs/art/breakwater-stalls/metrics.json",
      import.meta.url
    ),
    "utf-8"
  )
);

describe("the shipped stall kit", () => {
  it("holds every part the bazaar draws, with vertex colour in three components, within the art's triangle limits", async () => {
    const { release, value } = await kit();
    const looksOf = (part: string) => {
      const primitives = value.get(part) ?? [];
      return {
        colours: primitives.every(
          ({ geometry }) => geometry.getAttribute("color").itemSize === 3
        ),
        drawn: primitives.length > 0,
        slots: primitives.every(({ slot }) =>
          ["stall_cel", "stall_glow"].includes(slot)
        ),
        triangles: primitives.reduce(
          (total, { geometry }) =>
            total + (geometry.getIndex()?.count ?? 0) / 3,
          0
        ),
      };
    };
    const refused = (parts: readonly string[], limit: number): string[] =>
      parts.filter((part) => {
        const { colours, drawn, slots, triangles } = looksOf(part);
        return !(colours && drawn && slots && triangles <= limit);
      });
    expect(refused(stallParts, STALL_LIMIT)).toStrictEqual([]);
    expect(refused(decoParts, DECO_LIMIT)).toStrictEqual([]);
    release();
  });

  it("was built to the footprints the road's stall list uses", () => {
    for (const variant of stallVariants) {
      const { deep, wide } = stallSizes[variant];
      expect(metrics[`stall_${variant}`]?.footprint).toStrictEqual({
        depth: deep,
        wide,
      });
    }
  });
});

describe("Breakwater Run's market", () => {
  beforeAll(() => {
    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => null }),
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("merges to one mesh per material, at these triangle counts", async () => {
    const { release, value } = await kit();
    const track = trackFor("breakwater-run");
    const shading = createShading(lookOf(track.plan.region));
    const { object } = buildBazaar(track, shading, value, createClearance());
    const meshes: THREE.Mesh[] = [];
    object.traverse((node) => {
      if (isMesh(node)) {
        meshes.push(node);
      }
    });
    expect(meshes.map(({ castShadow }) => castShadow)).toStrictEqual([
      false,
      false,
    ]);
    expect(
      meshes.map(({ geometry }) => geometry.getAttribute("color").itemSize)
    ).toStrictEqual([3, 3]);
    expect(
      meshes.map(({ geometry }) => (geometry.getIndex()?.count ?? 0) / 3)
    ).toStrictEqual([MARKET_CEL_TRIANGLES, MARKET_GLOW_TRIANGLES]);
    shading.dispose();
    release();
  });
});
