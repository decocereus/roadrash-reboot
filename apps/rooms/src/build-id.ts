import * as Config from "effect/Config";

export const LOCAL_BUILD = "local";

export const roomsBuild = Config.String("RUSHLINE_BUILD").pipe(
  Config.withDefault(LOCAL_BUILD)
);
