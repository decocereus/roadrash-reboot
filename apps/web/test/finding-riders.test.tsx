import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FindingPart } from "../src/components/screens/room-lobby.tsx";

const findingPanel = (
  props: Partial<Parameters<typeof FindingPart>[0]> = {}
): string =>
  renderToStaticMarkup(
    <FindingPart
      onCancel={vi.fn<() => void>()}
      refusal={null}
      riders={3}
      waitSeconds={30}
      {...props}
    />
  );

describe("the finding riders panel", () => {
  it("says how many riders are in and how long the doors wait, from the room config", () => {
    const panel = findingPanel({ waitSeconds: 12 });
    expect(panel).toContain("Three of eight in.");
    expect(panel).toContain("or after 12");
    expect(panel).toContain("Cancel");
  });

  it("tells an older tab that its spot moved to another tab, with no Reload", () => {
    const panel = findingPanel({ refusal: "replaced" });
    expect(panel).toContain("You opened the queue in another tab.");
    expect(panel).not.toContain("Reload");
    expect(panel).not.toContain("of eight in");
  });
});
