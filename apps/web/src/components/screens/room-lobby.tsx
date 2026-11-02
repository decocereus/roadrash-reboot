import type { SeatPhase } from "@racer/rooms/seat-client";
import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { Screen } from "@racer/ui/components/screen";
import { Stencil } from "@racer/ui/components/stencil";

const statusOf = (
  phase: SeatPhase,
  riders: number,
  refusal: string | null
): string => {
  switch (phase) {
    case "connecting": {
      return "Finding the room.";
    }
    case "lobby": {
      return riders === 1 ? "1 rider here." : `${riders} riders here.`;
    }
    case "racing": {
      return "Rolling out.";
    }
    case "ended": {
      return "This race is over.";
    }
    case "left": {
      return "You left this room.";
    }
    case "lost": {
      return "Reconnecting to the room.";
    }
    case "refused": {
      return refusal === "full"
        ? "This room is full."
        : "This race has already started.";
    }
    default: {
      return phase satisfies never;
    }
  }
};

export const RoomLobbyScreen = ({
  phase,
  raceId,
  refusal,
  requeued,
  riders,
  startsInSeconds,
  onBack,
  onStart,
}: {
  readonly phase: SeatPhase;
  readonly raceId: string;
  readonly refusal: string | null;
  readonly requeued: boolean;
  readonly riders: number;
  readonly startsInSeconds: number;
  readonly onBack: () => void;
  readonly onStart: () => void;
}) => (
  <Screen className="bg-ink flex flex-col items-center justify-center gap-6">
    <Stencil>{raceId}</Stencil>
    <p aria-live="polite" className="font-display text-quote text-paper">
      {statusOf(phase, riders, refusal)}
    </p>
    {phase === "lobby" && (
      <p className="font-display text-paper">
        {requeued
          ? "The last room dropped. A new race starts from the line."
          : `Rolling out in ${startsInSeconds} s.`}
      </p>
    )}
    <MenuList
      autoFocus
      defaultValue={phase === "lobby" ? "start" : "back"}
      label="Room"
      onSelect={(id) => {
        if (id === "start") {
          onStart();
        } else {
          onBack();
        }
      }}
    >
      {phase === "lobby" && <MenuItem value="start">Start the race</MenuItem>}
      <MenuItem value="back">Leave</MenuItem>
    </MenuList>
  </Screen>
);
