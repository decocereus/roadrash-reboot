import { Point } from "@racer/track/madrid-schema";
import type {
  CorridorData,
  Position,
  RoadLink,
} from "@racer/track/madrid-schema";
import * as Schema from "effect/Schema";
import { XMLParser } from "fast-xml-parser";

import {
  distance,
  inside,
  origin,
  pointAlong,
  polylineLength,
  round,
} from "./geometry.ts";
import { readRoute } from "./schema.ts";

const NodeReference = Schema.Struct({ "@_href": Schema.String });
const RoadResponse = Schema.Struct({
  FeatureCollection: Schema.Struct({
    "@_numberMatched": Schema.String,
    "@_numberReturned": Schema.String,
    member: Schema.NonEmptyArray(
      Schema.Struct({
        RoadLink: Schema.Struct({
          "@_id": Schema.String,
          centrelineGeometry: Schema.Struct({
            LineString: Schema.Struct({ posList: Schema.String }),
          }),
          endNode: NodeReference,
          fictitious: Schema.Literals(["true", "false"]),
          startNode: NodeReference,
        }),
      })
    ),
  }),
});
const xml = new XMLParser({
  ignoreAttributes: false,
  isArray: (name) => name === "member",
  parseTagValue: false,
  removeNSPrefix: true,
});
const decodeRoads = Schema.decodeUnknownSync(RoadResponse);
const Polygon = Schema.Struct({
  coordinates: Schema.Array(Schema.Array(Point)),
  type: Schema.Literal("Polygon"),
});
const MultiPolygon = Schema.Struct({
  coordinates: Schema.Array(Schema.Array(Schema.Array(Point))),
  type: Schema.Literal("MultiPolygon"),
});
const decodeWidths = Schema.decodeUnknownSync(
  Schema.Struct({
    features: Schema.Array(
      Schema.Struct({
        geometry: Schema.Union([Polygon, MultiPolygon]),
        properties: Schema.Struct({
          Ancho_medio: Schema.Number,
          SVIA_ID: Schema.Int,
          VIAS: Schema.String,
        }),
      })
    ),
  })
);
const nodeId = (href: string): string => href.slice(href.lastIndexOf("#") + 1);
const coordinates = (
  text: string,
  reverse: boolean
): readonly [Position, ...Position[]] => {
  const values = text.trim().split(/\s+/u).map(Number);
  const result: Position[] = [];
  for (let index = 0; index < values.length; index += 2) {
    const x = values[index];
    const y = values[index + 1];
    if (x === undefined || y === undefined || !Number.isFinite(x + y)) {
      throw new Error("Invalid IGN centreline coordinate pair");
    }
    result.push([round(x - origin[0]), round(y - origin[1])]);
  }
  if (reverse) {
    result.reverse();
  }
  const [first, ...rest] = result;
  if (!first || rest.length === 0) {
    throw new Error("IGN centreline has fewer than two points");
  }
  return [first, ...rest];
};

const roadGraph = (roadsText: string) => {
  const response = decodeRoads(xml.parse(roadsText)).FeatureCollection;
  if (response["@_numberMatched"] !== response["@_numberReturned"]) {
    throw new Error("IGN road response is truncated");
  }
  const sourceLinks = new Map(
    response.member.map(({ RoadLink: road }) => [road["@_id"], road])
  );
  const degrees = new Map<string, Set<string>>();
  for (const road of sourceLinks.values()) {
    for (const reference of [road.startNode, road.endNode]) {
      const id = nodeId(reference["@_href"]);
      const links = degrees.get(id) ?? new Set<string>();
      links.add(road["@_id"]);
      degrees.set(id, links);
    }
  }
  return { degrees, sourceLinks };
};

export const buildRoads = (
  roadsText: string,
  routeText: string,
  widthsText: string
) => {
  const { degrees, sourceLinks } = roadGraph(roadsText);
  const widths = decodeWidths(JSON.parse(widthsText)).features.flatMap(
    (area) => {
      const polygons =
        area.geometry.type === "Polygon"
          ? [area.geometry.coordinates]
          : area.geometry.coordinates;
      return polygons.map((rings) => ({ properties: area.properties, rings }));
    }
  );
  const route = readRoute(routeText);
  let atM = 0;
  const line: Position[] = [];
  const junctions: CorridorData["junctions"][number][] = [];
  const streets: CorridorData["streets"][number][] = [];
  for (const leg of route) {
    let from = leg.startNode;
    const links: RoadLink[] = [];
    const startM = round(atM);
    for (const id of leg.links) {
      const road = sourceLinks.get(id);
      if (!road) {
        throw new Error(`Missing selected IGN road link ${id}`);
      }
      const a = nodeId(road.startNode["@_href"]);
      const b = nodeId(road.endNode["@_href"]);
      if (from !== a && from !== b) {
        throw new Error(`Disconnected source node at ${id}`);
      }
      const centreline = coordinates(
        road.centrelineGeometry.LineString.posList,
        from === b
      );
      const to = from === a ? b : a;
      const [first] = centreline;
      const last = line.at(-1);
      if (last && distance(last, first) > 0) {
        throw new Error(`Disconnected centreline at ${id}`);
      }
      const degree = degrees.get(from)?.size ?? 0;
      if (degree >= 3) {
        junctions.push({ atM: round(atM), degree, id: from, position: first });
      }
      atM += polylineLength(centreline);
      const middle = pointAlong(centreline, polylineLength(centreline) / 2);
      const candidates = widths.filter(
        (area) =>
          area.properties.VIAS.split(",").some((name) =>
            leg.widthNames.includes(name)
          ) &&
          inside(
            [middle[0] + origin[0], middle[1] + origin[1]],
            area.rings[0] ?? []
          ) &&
          !area.rings
            .slice(1)
            .some((ring) =>
              inside([middle[0] + origin[0], middle[1] + origin[1]], ring)
            )
      );
      const width = candidates.length === 1 ? candidates[0] : undefined;
      const bridge =
        leg.bridges.find((span) => span.links.includes(id))?.wikidata ?? null;
      links.push({
        bridge,
        centreline,
        fictitious: road.fictitious === "true",
        from,
        id,
        pavedWidthM: null,
        streetAreaWidthEstimate: width
          ? {
              id: width.properties.SVIA_ID,
              metres: round(width.properties.Ancho_medio),
              name: width.properties.VIAS,
            }
          : null,
        to,
      });
      line.push(...centreline.slice(line.length === 0 ? 0 : 1));
      from = to;
    }
    if (links.every((link) => link.streetAreaWidthEstimate === null)) {
      throw new Error(`No named municipal street coverage for ${leg.name}`);
    }
    const [firstLink, ...remainingLinks] = links;
    if (!firstLink) {
      throw new Error(`Empty street ${leg.name}`);
    }
    streets.push({
      endM: round(atM),
      links: [firstLink, ...remainingLinks],
      name: leg.name,
      startM,
      zone: leg.zone,
    });
  }
  const [firstStreet, ...remainingStreets] = streets;
  if (!firstStreet) {
    throw new Error("Empty Madrid corridor");
  }
  return {
    junctions,
    lengthM: round(atM),
    line,
    streets: [firstStreet, ...remainingStreets] as const,
  };
};
