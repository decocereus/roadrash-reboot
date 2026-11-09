import { roomArrivals } from "@racer/telemetry/limits";
import type { RoomArrival } from "@racer/telemetry/limits";

const ROOM_ID_CHARS = 8;
const ARRIVAL_PARAM = "via";
const REJOIN_PARAM = "rejoin";

const rejoinChoices = ["try", "no", "taken", "flooded"] as const;

export type RejoinChoice = (typeof rejoinChoices)[number];

export const newRoomId = (): string =>
  crypto.randomUUID().slice(0, ROOM_ID_CHARS);

export const roomLink = (roomId: string): string => {
  const search = new URLSearchParams(globalThis.location.search);
  search.set("room", roomId);
  search.delete(ARRIVAL_PARAM);
  search.delete(REJOIN_PARAM);
  return `${globalThis.location.origin}/?${search.toString()}`;
};

export const moveToRoom = (
  roomId: string,
  arrival: RoomArrival,
  rejoin: RejoinChoice | null = null
): void => {
  const choice = rejoin === null ? "" : `&${REJOIN_PARAM}=${rejoin}`;
  globalThis.location.assign(
    `${roomLink(roomId)}&${ARRIVAL_PARAM}=${arrival}${choice}`
  );
};

export const rejoinOf = (search: string): RejoinChoice | null =>
  rejoinChoices.find(
    (each) => each === new URLSearchParams(search).get(REJOIN_PARAM)
  ) ?? null;

export const clearRejoinNo = (): void => {
  const search = new URLSearchParams(globalThis.location.search);
  if (search.get(REJOIN_PARAM) === "no") {
    search.delete(REJOIN_PARAM);
    globalThis.history.replaceState(
      globalThis.history.state,
      "",
      `${globalThis.location.pathname}?${search.toString()}`
    );
  }
};

export const roomArrivalOf = (search: string): RoomArrival => {
  const named = new URLSearchParams(search).get(ARRIVAL_PARAM);
  return roomArrivals.find((each) => each === named) ?? "link";
};
