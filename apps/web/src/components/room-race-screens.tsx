import type { RoomRun } from "@racer/rooms/room-run";

import type { HudFeed } from "../hud-feed.ts";
import type { RaceStage, RejoinChoice, RoomVisit } from "../navigation.ts";
import { RejoinWatch } from "./room-lobby.tsx";
import { RaceMenu } from "./screens/pause.tsx";
import { RoomNotices } from "./screens/rejoin.tsx";

export const RoomRaceScreens = ({
  feed,
  room,
  stage,
  onLeave,
  onMove,
  onMute,
  onResume,
}: {
  readonly feed: HudFeed;
  readonly room: RoomRun;
  readonly stage: RaceStage;
  readonly onLeave: () => void;
  readonly onMove: (visit: RoomVisit) => void;
  readonly onMute: () => void;
  readonly onResume: () => void;
}) => {
  const backInRoom = (rejoin: RejoinChoice): void => {
    onMove({ arrival: "moved", rejoin, roomId: room.roomId });
  };
  return (
    <>
      <RoomNotices
        feed={feed}
        onBackToBar={() => {
          backInRoom("no");
        }}
        room={room}
        stage={stage}
      />
      {stage.kind === "signalLost" && (
        <RejoinWatch
          holdSeconds={room.holdSeconds}
          onOpen={() => {
            backInRoom("try");
          }}
          roomId={room.roomId}
        />
      )}
      {stage.kind === "paused" && (
        <RaceMenu
          feed={feed}
          onLeave={onLeave}
          onMute={onMute}
          onResume={onResume}
        />
      )}
    </>
  );
};
