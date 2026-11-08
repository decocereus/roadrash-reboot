import { afterEach, describe, expect, it, vi } from "vitest";

import { memberKey } from "../src/components/guest-name.ts";

type Browser = Pick<Storage, "getItem" | "setItem">;

const storage = (): Browser => {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
};

const refused = (): never => {
  throw new DOMException("Storage is off.", "SecurityError");
};

const openTab = (browser: Browser): string => {
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

  it("keeps one key for the page when the browser refuses storage, so a reopened seat is the same member", () => {
    vi.stubGlobal("localStorage", { getItem: refused, setItem: refused });
    expect(memberKey()).toBe(memberKey());
  });

  it("keeps one key for the page when the browser cannot save a new one", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: refused });
    expect(memberKey()).toBe(memberKey());
  });
});
