import { corridorZones, Input } from "@racer/track/madrid-schema";
import * as Schema from "effect/Schema";

export const decodeInputs = Schema.decodeUnknownSync(
  Schema.NonEmptyArray(Input)
);
const decodeRoute = Schema.decodeUnknownSync(
  Schema.NonEmptyArray(
    Schema.Struct({
      bridges: Schema.Array(
        Schema.Struct({
          links: Schema.NonEmptyArray(Schema.String),
          wikidata: Schema.String.check(Schema.isPattern(/^Q[0-9]+$/u)),
        })
      ),
      links: Schema.NonEmptyArray(Schema.String),
      name: Schema.String,
      startNode: Schema.String,
      widthNames: Schema.NonEmptyArray(Schema.String),
      zone: Schema.Literals(corridorZones),
    })
  )
);

export const readRoute = (text: string) => {
  const route = decodeRoute(JSON.parse(text));
  for (const leg of route) {
    for (const span of leg.bridges) {
      if (span.links.some((id) => !leg.links.includes(id))) {
        throw new Error(
          `Bridge annotation names an unselected link in ${leg.name}`
        );
      }
    }
  }
  return route;
};
