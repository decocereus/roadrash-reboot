import { roomArrivals } from "@racer/telemetry/limits";
import type { RoomArrival } from "@racer/telemetry/limits";

const ROOM_ID_CHARS = 8;
const ROOM_PARAM = "room";
const ARRIVAL_PARAM = "via";

export interface RoomAddress {
  readonly roomId: string;
  readonly arrival: RoomArrival | null;
}

export const newRoomId = (): string =>
  crypto.randomUUID().slice(0, ROOM_ID_CHARS);

export const roomLink = (roomId: string): string => {
  const search = new URLSearchParams(globalThis.location.search);
  search.set(ROOM_PARAM, roomId);
  search.delete(ARRIVAL_PARAM);
  return `${globalThis.location.origin}/?${search.toString()}`;
};

const paramsFor = (
  search: string,
  address: RoomAddress | null
): ReadonlyMap<string, string | null> => {
  if (address === null) {
    return new Map([
      [ROOM_PARAM, null],
      [ARRIVAL_PARAM, null],
    ]);
  }
  const arrival =
    address.arrival ?? new URLSearchParams(search).get(ARRIVAL_PARAM);
  return new Map([
    [ROOM_PARAM, address.roomId],
    [ARRIVAL_PARAM, arrival],
  ]);
};

export const searchFor = (
  search: string,
  address: RoomAddress | null
): string => {
  const next = new URLSearchParams(search);
  const wanted = paramsFor(search, address);
  if ([...wanted].every(([name, value]) => next.get(name) === value)) {
    return search;
  }
  for (const [name, value] of wanted) {
    if (value === null) {
      next.delete(name);
    } else {
      next.set(name, value);
    }
  }
  const text = next.toString();
  return text === "" ? "" : `?${text}`;
};

export const showAddress = (address: RoomAddress | null): void => {
  const { history, location } = globalThis;
  const search = searchFor(location.search, address);
  if (search !== location.search) {
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${search}${location.hash}`
    );
  }
};

export const roomArrivalOf = (search: string): RoomArrival => {
  const named = new URLSearchParams(search).get(ARRIVAL_PARAM);
  return roomArrivals.find((each) => each === named) ?? "link";
};
