const GUEST_NAME_KEY = "rushline.guestName.v1";

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
