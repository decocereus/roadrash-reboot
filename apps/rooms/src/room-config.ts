import * as Schema from "effect/Schema";

const FEWEST_HOLD_SECONDS = 5;
const MOST_HOLD_SECONDS = 120;

export const RoomConfigSchema = Schema.Struct({
  seatHoldSeconds: Schema.Int.check(
    Schema.isBetween({
      maximum: MOST_HOLD_SECONDS,
      minimum: FEWEST_HOLD_SECONDS,
    })
  ),
});

export type RoomConfig = typeof RoomConfigSchema.Type;

export const launchRoomConfig: RoomConfig = {
  seatHoldSeconds: 30,
};
