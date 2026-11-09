import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TooLate } from "../src/components/screens/rejoin.tsx";

describe("a rider who arrives with rejoin=try and lands in the lobby", () => {
  it("reads that the hold ran out when the room kept its race", () => {
    const html = renderToStaticMarkup(
      <TooLate holdSeconds={30} lostRace={null} />
    );
    expect(html).toContain("We kept your bike");
    expect(html).toContain("30 seconds");
  });

  it("reads that the room restarted and lost the race when the lobby names it", () => {
    const html = renderToStaticMarkup(
      <TooLate holdSeconds={30} lostRace="race-1" />
    );
    expect(html).toContain("That race is gone");
    expect(html).not.toContain("We kept your bike");
  });
});
