import * as Schema from "effect/Schema";

export const corridorZones = ["city", "park", "old-city"] as const;
export const Point = Schema.Tuple([Schema.Finite, Schema.Finite]);
const Distance = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
const Height = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("estimated"), metres: Distance }),
  Schema.Struct({ kind: Schema.Literal("measured"), metres: Distance }),
  Schema.Struct({ kind: Schema.Literal("unavailable") }),
]);
const Link = Schema.Struct({
  bridge: Schema.NullOr(Schema.String.check(Schema.isPattern(/^Q[0-9]+$/u))),
  centreline: Schema.NonEmptyArray(Point).check(Schema.isMinLength(2)),
  fictitious: Schema.Boolean,
  from: Schema.String,
  id: Schema.String,
  pavedWidthM: Schema.Null,
  streetAreaWidthEstimate: Schema.NullOr(
    Schema.Struct({
      id: Schema.Int,
      metres: Distance,
      name: Schema.String,
    })
  ),
  to: Schema.String,
});
const Street = Schema.Struct({
  endM: Distance,
  links: Schema.NonEmptyArray(Link),
  name: Schema.String,
  startM: Distance,
  zone: Schema.Literals(corridorZones),
});
const Source = Schema.Struct({
  attribution: Schema.String,
  changes: Schema.String,
  date: Schema.String,
  id: Schema.String,
  licence: Schema.String,
  licenceUrl: Schema.String,
  name: Schema.String,
  url: Schema.String,
});
export const Input = Schema.Struct({
  file: Schema.String,
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
  source: Schema.String,
  url: Schema.String,
});
export const Corridor = Schema.Struct({
  bufferM: Distance,
  buildings: Schema.Array(
    Schema.Struct({
      height: Height,
      id: Schema.String,
      rings: Schema.NonEmptyArray(
        Schema.Array(Point).check(Schema.isMinLength(4))
      ),
    })
  ),
  crs: Schema.Literal("EPSG:25830"),
  elevation: Schema.NonEmptyArray(
    Schema.Struct({ atM: Distance, groundM: Schema.Finite })
  ),
  inputs: Schema.NonEmptyArray(Input),
  junctions: Schema.Array(
    Schema.Struct({
      atM: Distance,
      degree: Schema.Int.check(Schema.isGreaterThanOrEqualTo(3)),
      id: Schema.String,
      position: Point,
    })
  ),
  landmarks: Schema.Array(
    Schema.Struct({
      atM: Distance,
      distanceM: Distance,
      name: Schema.String,
      position: Point,
      revision: Schema.Int,
      wikidata: Schema.String.check(Schema.isPattern(/^Q[0-9]+$/u)),
    })
  ),
  lengthM: Distance,
  origin: Point,
  signals: Schema.Array(
    Schema.Struct({
      atM: Distance,
      crossingId: Schema.Int,
      id: Schema.Int,
      position: Point,
    })
  ),
  sources: Schema.NonEmptyArray(Source),
  streets: Schema.NonEmptyArray(Street),
  version: Schema.Literal(1),
});
export type CorridorData = Schema.Schema.Type<typeof Corridor>;
export type Position = Schema.Schema.Type<typeof Point>;
export type RoadLink = Schema.Schema.Type<typeof Link>;
export const decodeCorridor = Schema.decodeUnknownSync(Corridor);
