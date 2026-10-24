import { readFileSync } from "node:fs";
import path from "node:path";

import { readCorridor } from "@racer/track/madrid-corridor";
import { Corridor } from "@racer/track/madrid-schema";
import { madridSources } from "@racer/track/madrid-sources";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");
const corridorFile = path.join(
  root,
  "packages/track/data/madrid-corridor.json"
);
const data = readCorridor(readFileSync(corridorFile, "utf-8"));
const schemaDocument = Schema.toJsonSchemaDocument(Corridor);

describe("committed Madrid corridor", () => {
  it("keeps the Bailén viaduct separate from the street below it", () => {
    const viaduct = data.streets
      .flatMap((street) => street.links)
      .find((link) => link.id === "TN-RO_ROADLINK_VIAL_TR280790000238");
    expect(viaduct?.bridge).toBe("Q6160850");
    expect(viaduct?.streetAreaWidthEstimate?.name).toBe("Calle de Bailén");
    expect(
      [
        ...new Set(
          data.streets
            .flatMap((street) => street.links)
            .map((link) => link.bridge)
            .filter((bridge) => bridge !== null)
        ),
      ].toSorted()
    ).toStrictEqual(["Q2838423", "Q6091607", "Q6160850"]);
  });

  it("connects the approved street chain from Alcalá to surface Bailén", () => {
    expect(data.lengthM).toBe(8702.7);
    expect(data.streets).toHaveLength(16);
    expect(data.streets[0].name).toContain("Puerta de Alcalá");
    expect(data.streets.at(-1)?.name).toBe("Bailén · palace frontage");
    expect([
      ...new Set(data.streets.map((street) => street.zone)),
    ]).toStrictEqual(["city", "park", "old-city"]);
  });

  it("places the landmark facts in route order", () => {
    expect(data.landmarks.map((landmark) => landmark.wikidata)).toStrictEqual([
      "Q1140634",
      "Q1849031",
      "Q465250",
      "Q2092717",
      "Q8771987",
      "Q6091607",
      "Q2838423",
      "Q2657591",
      "Q2473884",
      "Q6160850",
      "Q849711",
      "Q171517",
    ]);
    expect(
      data.landmarks.every((landmark) => landmark.distanceM < 200)
    ).toBeTruthy();
  });

  it("rejects a disconnected source node rather than drawing a connector", () => {
    const [firstStreet] = data.streets;
    const [firstLink, ...remainingLinks] = firstStreet.links;
    const disconnected = {
      ...data,
      streets: [
        {
          ...firstStreet,
          links: [
            { ...firstLink, to: "not-the-next-source-node" },
            ...remainingLinks,
          ],
        },
        ...data.streets.slice(1),
      ],
    };
    expect(() => readCorridor(JSON.stringify(disconnected))).toThrow(
      "Disconnected node"
    );
  });

  it("rejects a bridge annotation without a pinned source fact", () => {
    const [firstStreet] = data.streets;
    const [firstLink, ...remainingLinks] = firstStreet.links;
    const invalid = {
      ...data,
      streets: [
        {
          ...firstStreet,
          links: [{ ...firstLink, bridge: "Q999999999999" }, ...remainingLinks],
        },
        ...data.streets.slice(1),
      ],
    };
    expect(() => readCorridor(JSON.stringify(invalid))).toThrow(
      "Bridge has no pinned Wikidata source"
    );
  });

  it("rejects separated geometries even when their node IDs agree", () => {
    const [firstStreet] = data.streets;
    const [firstLink, ...remainingLinks] = firstStreet.links;
    const changed = {
      ...firstLink,
      centreline: [...firstLink.centreline.slice(0, -1), [0, 0]],
    };
    const disconnected = {
      ...data,
      streets: [
        { ...firstStreet, links: [changed, ...remainingLinks] },
        ...data.streets.slice(1),
      ],
    };
    expect(() => readCorridor(JSON.stringify(disconnected))).toThrow(
      "Disconnected geometry"
    );
  });

  it("validates provenance and leaves unavailable measurements explicit", () => {
    expect(data.sources).toStrictEqual(madridSources);
    expect(
      data.inputs.every((input) =>
        data.sources.some((source) => source.id === input.source)
      )
    ).toBeTruthy();
    expect(
      data.streets
        .flatMap((street) => street.links)
        .every((link) => link.pavedWidthM === null)
    ).toBeTruthy();
    expect(data.buildings.length).toBeGreaterThan(400);
    expect(
      data.buildings.every((building) => building.height.kind !== "measured")
    ).toBeTruthy();
  });

  it("covers the complete chain with ground elevation", () => {
    expect(data.elevation[0].atM).toBe(0);
    expect(data.elevation.at(-1)?.atM).toBe(data.lengthM);
    expect(() =>
      readCorridor(JSON.stringify({ ...data, lengthM: -1 }))
    ).toThrow(/./u);
    expect(() =>
      readCorridor(JSON.stringify({ ...data, crs: "EPSG:4326" }))
    ).toThrow(/./u);
    expect(() =>
      readCorridor(JSON.stringify({ ...data, elevation: [] }))
    ).toThrow(/./u);
  });

  it("ships the generated schema and the complete CDLA agreement with both artifacts", () => {
    const expectedSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      ...schemaDocument.schema,
      $defs: schemaDocument.definitions,
    };
    expect(
      JSON.parse(
        readFileSync(
          path.join(root, "packages/track/data/madrid-corridor.schema.json"),
          "utf-8"
        )
      )
    ).toStrictEqual(expectedSchema);
    const licence = readFileSync(
      path.join(root, "packages/track/data/CDLA-Permissive-2.0.txt"),
      "utf-8"
    );
    expect(licence).toContain("5.4.");
    expect(
      readFileSync(
        path.join(root, "apps/web/public/licenses/cdla-permissive-2.0.txt"),
        "utf-8"
      )
    ).toBe(licence);
  });
});
