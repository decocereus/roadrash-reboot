import { openRoomSeat } from "@racer/rooms/seat-client";
import type { RoomSeat } from "@racer/rooms/seat-client";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { BarStage } from "../components/bar-stage.tsx";
import { memberKey, storedGuestName } from "../components/guest-name.ts";

const UNNAMED = "Rider";

const seatFromUrl = (): RoomSeat | null => {
  const search = new URLSearchParams(globalThis.location.search);
  const roomId = search.get("room");
  return roomId === null
    ? null
    : openRoomSeat(
        import.meta.env.VITE_ROOMS_URL,
        roomId,
        search.get("name") ?? storedGuestName() ?? UNNAMED,
        __RUSHLINE_BUILD__.rooms,
        memberKey(),
        () => null
      );
};

const BarPage = () => {
  const [seat, setSeat] = useState<{ readonly seat: RoomSeat | null } | null>(
    null
  );
  useEffect(() => {
    const opened = seatFromUrl();
    setSeat({ seat: opened });
    return () => {
      opened?.leave();
    };
  }, []);
  return seat && <BarStage seat={seat.seat} />;
};

export const Route = createFileRoute("/bar")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      notFound({ throw: true });
    }
  },
  component: BarPage,
  head: () => ({
    meta: [{ title: "The Lowside" }, { content: "noindex", name: "robots" }],
  }),
  ssr: false,
});
