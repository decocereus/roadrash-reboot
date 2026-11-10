const GUEST_NAME_KEY = "rushline.guestName.v1";
const MEMBER_KEY = "rushline.memberKey.v1";
const LAST_ROOM_KEY = "rushline.lastRaceRoom.v1";

let typedName: string | null = null;

export const storedGuestName = (): string | null => {
  try {
    return globalThis.localStorage.getItem(GUEST_NAME_KEY) ?? typedName;
  } catch {
    return typedName;
  }
};

const nameWatchers = new Set<() => void>();

export const watchGuestName = (changed: () => void): (() => void) => {
  nameWatchers.add(changed);
  return () => {
    nameWatchers.delete(changed);
  };
};

const keepName = (name: string): boolean => {
  try {
    globalThis.localStorage.setItem(GUEST_NAME_KEY, name);
    return true;
  } catch {
    return false;
  }
};

export const storeGuestName = (name: string): boolean => {
  typedName = name;
  const kept = keepName(name);
  for (const changed of nameWatchers) {
    changed();
  }
  return kept;
};

export const rememberRoom = (roomId: string): boolean => {
  try {
    globalThis.localStorage.setItem(LAST_ROOM_KEY, roomId);
    return true;
  } catch {
    return false;
  }
};

export const joinedRoom = (roomId: string): boolean => {
  try {
    return globalThis.localStorage.getItem(LAST_ROOM_KEY) === roomId;
  } catch {
    return false;
  }
};

let unstoredKey: string | null = null;

export const memberKey = (): string => {
  try {
    const stored = globalThis.localStorage.getItem(MEMBER_KEY);
    if (stored !== null) {
      return stored;
    }
    const fresh = crypto.randomUUID();
    globalThis.localStorage.setItem(MEMBER_KEY, fresh);
    return fresh;
  } catch {
    unstoredKey ??= crypto.randomUUID();
    return unstoredKey;
  }
};
