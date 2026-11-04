import { describe, expect, it } from "vitest";

import { cleanGuestName } from "../src/messages.ts";

describe("a guest's name", () => {
  it("keeps letters from any language, digits and plain marks", () => {
    expect(cleanGuestName("  Amartya_07 ")).toBe("Amartya_07");
    expect(cleanGuestName("अमर्त्य")).toBe("अमर्त्य");
  });

  it("drops anything else and holds to 12 characters", () => {
    expect(cleanGuestName("<b>Ann</b>")).toBe("bAnnb");
    expect(cleanGuestName("a".repeat(30))).toBe("a".repeat(12));
  });

  it("still names a rider when nothing is left", () => {
    expect(cleanGuestName("<>")).toBe("Rider");
    expect(cleanGuestName("")).toBe("Rider");
  });
});
