const ROOM_ID_CHARS = 8;

export const newRoomId = (): string =>
  crypto.randomUUID().slice(0, ROOM_ID_CHARS);

export const roomLink = (roomId: string): string => {
  const search = new URLSearchParams(globalThis.location.search);
  search.set("room", roomId);
  return `${globalThis.location.origin}/?${search.toString()}`;
};

export const moveToRoom = (roomId: string): void => {
  globalThis.location.assign(roomLink(roomId));
};
