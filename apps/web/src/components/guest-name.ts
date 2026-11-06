const GUEST_NAME_KEY = "rushline.guestName.v1";
const MEMBER_KEY = "rushline.memberKey.v1";
const LAST_RACE_KEY = "rushline.lastRaceRoom.v1";

export const storedGuestName = (): string | null => {
  try {
    return globalThis.localStorage.getItem(GUEST_NAME_KEY);
  } catch {
    return null;
  }
};

export const storeGuestName = (name: string): boolean => {
  try {
    globalThis.localStorage.setItem(GUEST_NAME_KEY, name);
    return true;
  } catch {
    return false;
  }
};

export const rememberRaceRoom = (roomId: string): boolean => {
  try {
    globalThis.localStorage.setItem(LAST_RACE_KEY, roomId);
    return true;
  } catch {
    return false;
  }
};

export const racedIn = (roomId: string): boolean => {
  try {
    return globalThis.localStorage.getItem(LAST_RACE_KEY) === roomId;
  } catch {
    return false;
  }
};

export const memberKey = (): string => {
  const fresh = crypto.randomUUID();
  try {
    const stored = globalThis.localStorage.getItem(MEMBER_KEY);
    if (stored !== null) {
      return stored;
    }
    globalThis.localStorage.setItem(MEMBER_KEY, fresh);
    return fresh;
  } catch {
    return fresh;
  }
};
