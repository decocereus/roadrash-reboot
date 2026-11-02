import type { RoomPresence } from "@racer/rooms/messages";
import { useEffect, useState } from "react";

import { watchRematch } from "./rematch-watch.ts";

export const useRematch = (raceId: string | null): RoomPresence | null => {
  const [presence, setPresence] = useState<RoomPresence | null>(null);
  useEffect(
    () =>
      raceId === null
        ? undefined
        : watchRematch(import.meta.env.VITE_ROOMS_URL, raceId, setPresence),
    [raceId]
  );
  return presence;
};
