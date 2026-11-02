import type { SeatPhase } from "@racer/rooms/seat-client";
import { MenuItem, MenuList } from "@racer/ui/components/menu-list";
import { Screen } from "@racer/ui/components/screen";
import { Stencil } from "@racer/ui/components/stencil";

const statusOf = (
  phase: SeatPhase,
  seats: number,
  refusal: string | null
): string => {
  switch (phase) {
    case "connecting": {
      return "Finding the room.";
    }
    case "lobby": {
      return seats === 1 ? "1 rider here." : `${seats} riders here.`;
    }
    case "racing": {
      return "Rolling out.";
    }
    case "ended": {
      return "This race is over.";
    }
    case "lost": {
      return "The room closed.";
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
  seats,
  onBack,
  onStart,
}: {
  readonly phase: SeatPhase;
  readonly raceId: string;
  readonly refusal: string | null;
  readonly seats: number;
  readonly onBack: () => void;
  readonly onStart: () => void;
}) => (
  <Screen className="bg-ink flex flex-col items-center justify-center gap-6">
    <Stencil>{raceId}</Stencil>
    <p aria-live="polite" className="font-display text-quote text-paper">
      {statusOf(phase, seats, refusal)}
    </p>
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
