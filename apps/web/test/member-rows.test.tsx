import { ROOM_FIELD_SIZE } from "@racer/career/room-race";
import type { RoomLobbyMessage } from "@racer/rooms/messages";
import { launchRoomConfig, publicRuleFor } from "@racer/rooms/room-config";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MemberRows } from "../src/components/screens/room-lobby.tsx";

const member = (id: string, here: boolean, rttMs: number | null = null) => ({
  colour: 0,
  here,
  id,
  name: id,
  ready: false,
  rttMs,
});

const lobby: RoomLobbyMessage = {
  atMs: 0,
  edition: 1,
  hostId: "ann",
  kind: "lobby",
  lostRace: null,
  members: [member("ann", true, 48), member("bo", true), member("cy", false)],
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

  it("shows the round trip of each rider whose link the room has measured", () => {
    const rows = renderToStaticMarkup(<MemberRows lobby={lobby} />);
    expect(rows).toContain(">48 ms<");
    expect(rows.match(/ ms</gu)).toHaveLength(1);
    expect(rows).toContain("round trip to this room");
  });

  it("says nothing about round trips before the room has measured one", () => {
    const unmeasured = {
      ...lobby,
      members: [member("ann", true), member("cy", false)],
    };
    expect(
      renderToStaticMarkup(<MemberRows lobby={unmeasured} />)
    ).not.toContain("round trip");
  });
});
