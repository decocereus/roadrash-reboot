export const ROOM_ID_PATTERN = /^[a-z0-9-]{6,40}$/u;

export const ROOM_KINDS = ["custom", "public"] as const;

export type RoomKind = (typeof ROOM_KINDS)[number];

const PUBLIC_PREFIX = "pub-";
const ID_CHARS = 8;

export const publicRoomId = (): string =>
  `${PUBLIC_PREFIX}${crypto.randomUUID().slice(0, ID_CHARS)}`;

export const roomKindOf = (roomId: string): RoomKind =>
  roomId.startsWith(PUBLIC_PREFIX) ? "public" : "custom";
