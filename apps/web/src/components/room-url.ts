import { roomArrivals } from "@racer/telemetry/limits";
import type { RoomArrival } from "@racer/telemetry/limits";

const ROOM_ID_CHARS = 8;
const ARRIVAL_PARAM = "via";

export const newRoomId = (): string =>
  crypto.randomUUID().slice(0, ROOM_ID_CHARS);

export const roomLink = (roomId: string): string => {
  const search = new URLSearchParams(globalThis.location.search);
  search.set("room", roomId);
  search.delete(ARRIVAL_PARAM);
  return `${globalThis.location.origin}/?${search.toString()}`;
};

export const moveToRoom = (roomId: string, arrival: RoomArrival): void => {
  globalThis.location.assign(`${roomLink(roomId)}&${ARRIVAL_PARAM}=${arrival}`);
};

export const roomArrivalOf = (search: string): RoomArrival => {
  const named = new URLSearchParams(search).get(ARRIVAL_PARAM);
  return roomArrivals.find((each) => each === named) ?? "link";
};
