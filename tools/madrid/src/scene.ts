import { Point } from "@racer/track/madrid-schema";
import * as Schema from "effect/Schema";

import { ringProblem } from "./geometry.ts";

const Distance = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
const Ring = Schema.NonEmptyArray(Point)
  .check(Schema.isMinLength(3))
  .check(
    Schema.makeFilter((ring) => ringProblem(ring) ?? undefined, {
      title: "a simple counter-clockwise ring",
    })
  );
const SceneFile = Schema.Struct({
  grass: Schema.Array(Ring),
  massing: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      parts: Schema.NonEmptyArray(
        Schema.Struct({ heightM: Distance, liftM: Distance, ring: Ring })
      ),
    })
  ),
  water: Schema.Array(Schema.Struct({ dropM: Distance, ring: Ring })),
});

export type Scene = Schema.Schema.Type<typeof SceneFile>;
export const decodeScene = Schema.decodeUnknownSync(SceneFile);
