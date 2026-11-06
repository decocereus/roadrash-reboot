import { afterEach, describe, expect, it, vi } from "vitest";

import { memberKey } from "../src/components/guest-name.ts";

const storage = (): Pick<Storage, "getItem" | "setItem"> => {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
};

const openTab = (browser: Pick<Storage, "getItem" | "setItem">): string => {
  vi.stubGlobal("localStorage", browser);
  vi.stubGlobal("sessionStorage", storage());
  return memberKey();
};

describe(memberKey, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives a new tab in the same browser the key the closed tab rode with", () => {
    const browser = storage();
    expect(openTab(browser)).toBe(openTab(browser));
  });

  it("gives another browser its own key", () => {
    expect(openTab(storage())).not.toBe(openTab(storage()));
  });
});
