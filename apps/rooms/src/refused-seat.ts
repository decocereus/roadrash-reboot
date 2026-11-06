import * as HttpBody from "effect/http/HttpBody";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { SEAT_CLOSED } from "./messages.ts";

export const refusedSeat = (
  message: string
): HttpServerResponse.HttpServerResponse => {
  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();
  server.send(message);
  server.close(SEAT_CLOSED, "limited");
  return HttpServerResponse.setBody(
    HttpServerResponse.empty({ status: 101 }),
    HttpBody.raw(new Response(null, { status: 101, webSocket: client }))
  );
};
