import type { QueueRefusal } from "@racer/rooms/queue-messages";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  FindingPart,
  RoomStatusPart,
} from "../src/components/screens/room-lobby.tsx";

const LIMITED =
  "Too many riders joined from your network. Try again in a minute.";

const findingWith = (refusal: QueueRefusal): string =>
  renderToStaticMarkup(
    <FindingPart
      onCancel={vi.fn<() => void>()}
      refusal={refusal}
      riders={1}
      waitSeconds={30}
    />
  );

describe("a rider the rooms Worker refused for joining too often", () => {
  it("reads why in the lobby panel and is offered Leave, not Reload", () => {
    const panel = renderToStaticMarkup(
      <RoomStatusPart
        onLeave={vi.fn<() => void>()}
        phase="refused"
        refusal="limited"
      />
    );
    expect(panel).toContain(LIMITED);
    expect(panel).toContain("Leave");
    expect(panel).not.toContain("Reload");
  });

  it("reads why in the finding riders panel instead of a rider count", () => {
    const panel = findingWith("limited");
    expect(panel).toContain(LIMITED);
    expect(panel).not.toContain("Reload");
    expect(panel).not.toContain("of eight in");
  });

  it("still sends a rider on an old build to Reload from the queue", () => {
    const panel = findingWith("build");
    expect(panel).toContain("The game has updated. Reload to join.");
    expect(panel).toContain("Reload");
  });
});

describe("a rider the room cut for sending too many messages", () => {
  it("reads why and is offered Leave, not Reload", () => {
    const panel = renderToStaticMarkup(
      <RoomStatusPart
        onLeave={vi.fn<() => void>()}
        phase="refused"
        refusal="flooded"
      />
    );
    expect(panel).toContain(
      "The room threw you out for sending too much at once."
    );
    expect(panel).toContain("Leave");
    expect(panel).not.toContain("Reload");
  });
});
