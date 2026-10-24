import { gunzipSync } from "node:zlib";

import { Point } from "@racer/track/madrid-schema";
import type { CorridorData, Position } from "@racer/track/madrid-schema";
import { parse } from "csv-parse/sync";
import * as Schema from "effect/Schema";

import {
  nearCorridor,
  nearest,
  origin,
  project,
  round,
  simplify,
} from "./geometry.ts";

const Building = Schema.Struct({
  geometry: Schema.Struct({
    coordinates: Schema.NonEmptyArray(Schema.Array(Point)),
    type: Schema.Literal("Polygon"),
  }),
  properties: Schema.Struct({ height: Schema.Number }),
});
const decodeBuilding = Schema.decodeUnknownSync(Building);
const decodeSignals = Schema.decodeUnknownSync(
  Schema.Array(
    Schema.Struct({
      id: Schema.String,
      id_cruce: Schema.String,
      utm_x: Schema.String,
      utm_y: Schema.String,
    })
  )
);
const Entity = Schema.Struct({
  claims: Schema.Struct({
    P625: Schema.NonEmptyArray(
      Schema.Struct({
        mainsnak: Schema.Struct({
          datavalue: Schema.Struct({
            value: Schema.Struct({
              latitude: Schema.Finite,
              longitude: Schema.Finite,
            }),
          }),
        }),
      })
    ),
  }),
  id: Schema.String,
  labels: Schema.Struct({ es: Schema.Struct({ value: Schema.String }) }),
  lastrevid: Schema.Int,
});
const decodeEntity = Schema.decodeUnknownSync(
  Schema.Struct({ entities: Schema.Record(Schema.String, Entity) })
);

export const buildBuildings = (
  bytes: Uint8Array,
  line: readonly Position[],
  bufferM: number
) => {
  const buildings: CorridorData["buildings"][number][] = [];
  const minX = Math.min(...line.map((p) => p[0])) - bufferM;
  const maxX = Math.max(...line.map((p) => p[0])) + bufferM;
  const minY = Math.min(...line.map((p) => p[1])) - bufferM;
  const maxY = Math.max(...line.map((p) => p[1])) + bufferM;
  let row = 0;
  for (const record of gunzipSync(bytes).toString("utf-8").split("\n")) {
    row += 1;
    if (record.trim() === "") {
      continue;
    }
    const building = decodeBuilding(JSON.parse(record));
    const rings = building.geometry.coordinates.map((ring) =>
      ring.map(project)
    );
    const [exterior] = rings;
    if (
      !exterior ||
      Math.max(...exterior.map((p) => p[0])) < minX ||
      Math.min(...exterior.map((p) => p[0])) > maxX ||
      Math.max(...exterior.map((p) => p[1])) < minY ||
      Math.min(...exterior.map((p) => p[1])) > maxY
    ) {
      continue;
    }
    if (!nearCorridor(exterior, line, bufferM)) {
      continue;
    }
    const simplified = rings.map((ring) => {
      const reduced = simplify(ring);
      return reduced.length >= 4 ? reduced : ring;
    });
    const [outer, ...holes] = simplified;
    if (!outer) {
      continue;
    }
    const height: CorridorData["buildings"][number]["height"] =
      building.properties.height >= 0
        ? { kind: "estimated", metres: round(building.properties.height) }
        : { kind: "unavailable" };
    buildings.push({
      height,
      id: `ms-033111012-${row}`,
      rings: [outer, ...holes],
    });
  }
  return buildings;
};

export const buildSignals = (bytes: Uint8Array, line: readonly Position[]) =>
  decodeSignals(
    parse(new TextDecoder("windows-1252").decode(bytes), {
      columns: true,
      delimiter: ";",
      skip_empty_lines: true,
    })
  )
    .map((signal) => {
      const position: Position = [
        round(Number(signal.utm_x) - origin[0]),
        round(Number(signal.utm_y) - origin[1]),
      ];
      const match = nearest(position, line);
      return {
        atM: round(match.atM),
        crossingId: Number(signal.id_cruce),
        distanceM: match.distanceM,
        id: Number(signal.id),
        position,
      };
    })
    .filter((signal) => signal.distanceM <= 40)
    .map(({ atM, crossingId, id, position }) => ({
      atM,
      crossingId,
      id,
      position,
    }))
    .toSorted((a, b) => a.atM - b.atM || a.id - b.id);

export const buildLandmark = (text: string, line: readonly Position[]) => {
  const entities = Object.values(decodeEntity(JSON.parse(text)).entities);
  const [entity] = entities;
  if (entities.length !== 1 || !entity) {
    throw new Error("Expected one pinned Wikidata entity");
  }
  const coordinate = entity.claims.P625[0].mainsnak.datavalue.value;
  const position = project([coordinate.longitude, coordinate.latitude]);
  const match = nearest(position, line);
  return {
    atM: round(match.atM),
    distanceM: round(match.distanceM),
    name: entity.labels.es.value,
    position,
    revision: entity.lastrevid,
    wikidata: entity.id,
  };
};
