import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { RaceIdSchema } from "./contract.ts";
import { RaceServer } from "./race-server.ts";

const decodeRaceId = Schema.decodeUnknownOption(RaceIdSchema);
const ROOM_PATH = /^\/rooms\/(?<raceId>[^/]+)/u;

const props = Effect.map(
  Config.Int("RUSHLINE_ROOMS_PORT").pipe(Config.withDefault(1352)),
  (port) => ({
    dev: { port, strictPort: true },
    main: import.meta.url,
  })
);

export default class Rooms extends Cloudflare.Worker<Rooms>()(
  "Rooms",
  props,
  Effect.gen(function* rooms() {
    const races = yield* RaceServer;
    return {
      fetch: Effect.gen(function* route() {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const raceId = decodeRaceId(
          ROOM_PATH.exec(new URL(request.url, "http://rooms").pathname)?.groups
            ?.raceId
        );
        if (Option.isNone(raceId)) {
          return HttpServerResponse.text("No room lives at this path.", {
            status: 404,
          });
        }
        return yield* races.getByName(raceId.value).fetch(request);
      }),
    };
  })
) {}
