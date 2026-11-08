import { ROOM_FIELD_SIZE } from "@racer/career/room-race";
import type { RoomLobbyMessage } from "@racer/rooms/messages";
import { launchRoomConfig, publicRuleFor } from "@racer/rooms/room-config";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MemberRows } from "../src/components/screens/room-lobby.tsx";

const member = (id: string, here: boolean) => ({
  colour: 0,
  here,
  id,
  name: id,
  ready: false,
});

const lobby: RoomLobbyMessage = {
  atMs: 0,
  edition: 1,
  hostId: "ann",
  kind: "lobby",
  members: [member("ann", true), member("bo", true), member("cy", false)],
  phase: "gathering",
  roomKind: "custom",
  rule: publicRuleFor(launchRoomConfig.publicRace, 0),
  seatHoldSeconds: launchRoomConfig.seatHoldSeconds,
  startsInMs: null,
  you: "ann",
};

describe("the lobby's member list", () => {
  it("counts the street riders from the riders here, since an away rider does not race", () => {
    expect(renderToStaticMarkup(<MemberRows lobby={lobby} />)).toContain(
      `${ROOM_FIELD_SIZE - 2} street riders join to make ${ROOM_FIELD_SIZE}.`
    );
  });
});
