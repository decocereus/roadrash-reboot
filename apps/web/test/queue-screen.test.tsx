import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { QueueScreen } from "../src/components/screens/room-lobby.tsx";

const queueScreen = (
  props: Partial<Parameters<typeof QueueScreen>[0]> = {}
): string =>
  renderToStaticMarkup(
    <QueueScreen
      onBack={vi.fn<() => void>()}
      refusal={null}
      riders={1}
      waitSeconds={30}
      {...props}
    />
  );

describe("the queue screen", () => {
  it("says how long the race waits from the room config it was given", () => {
    expect(queueScreen({ waitSeconds: 12 })).toContain(
      "The race leaves with whoever is here after 12 s."
    );
  });

  it("tells an older tab that its spot moved to another tab, with no Reload", () => {
    const screen = queueScreen({ refusal: "replaced" });
    expect(screen).toContain("You opened the queue in another tab.");
    expect(screen).not.toContain("Reload");
    expect(screen).not.toContain("1 of");
  });
});
