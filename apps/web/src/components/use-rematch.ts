import type { RoomPresence } from "@racer/rooms/messages";
import { useEffect, useState } from "react";

import { watchRematch } from "./rematch-watch.ts";

export const useRematch = (roomId: string | null): RoomPresence | null => {
  const [presence, setPresence] = useState<RoomPresence | null>(null);
  useEffect(
    () =>
      roomId === null
        ? undefined
        : watchRematch(import.meta.env.VITE_ROOMS_URL, roomId, setPresence),
    [roomId]
  );
  return presence;
};
