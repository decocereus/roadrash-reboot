const GUEST_NAME_KEY = "rushline.guestName.v1";
const MEMBER_KEY = "rushline.memberKey.v1";

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

export const memberKey = (): string => {
  const fresh = crypto.randomUUID();
  try {
    const stored = globalThis.sessionStorage.getItem(MEMBER_KEY);
    if (stored !== null) {
      return stored;
    }
    globalThis.sessionStorage.setItem(MEMBER_KEY, fresh);
    return fresh;
  } catch {
    return fresh;
  }
};
