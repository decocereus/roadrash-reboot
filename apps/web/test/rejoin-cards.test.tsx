import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RoomNotices, TooLate } from "../src/components/screens/rejoin.tsx";
import { createHudFeed, idleHud } from "../src/hud-feed.ts";
import type { RaceStage } from "../src/navigation.ts";
import { createHost, VSYNC_MS } from "./hosts.ts";

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

describe("a room race whose link goes silent", () => {
  const feed = createHudFeed();
  const room = {
    awayMs: null,
    holdSeconds: 30,
    pressed: vi.fn<() => void>(),
    reportNow: vi.fn<() => void>(),
    stoppedDrawing: vi.fn<() => void>(),
  };
  const backToBar = vi.fn<() => void>();
  const riding: RaceStage = { kind: "riding" };
  const screenAt = (
    stallLeftMs: number | null,
    stage: RaceStage = riding
  ): string => {
    feed.write({ ...idleHud, phase: "racing", stallLeftMs });
    return renderToStaticMarkup(
      <RoomNotices
        feed={feed}
        onBackToBar={backToBar}
        room={room}
        stage={stage}
      />
    );
  };

  it("reads nothing while the race rides through a short hold, with its live region already in place", () => {
    const shortHold = screenAt(null);
    expect(shortHold).not.toContain("Waiting for the room");
    expect(shortHold).toContain('<p class="sr-only" role="status"></p>');
  });

  it("says it is waiting for the room once the race has stopped, counting down to the hang-up", () => {
    const stopped = screenAt(3200);
    expect(stopped).toContain(
      'Reconnecting in <span class="numeric">4</span> s.'
    );
    expect(stopped).toContain(
      '<p class="sr-only" role="status">Waiting for the room. Your link stalled.</p>'
    );
    expect(screenAt(200)).toContain(
      'Reconnecting in <span class="numeric">1</span> s.'
    );
    expect(screenAt(-300)).toContain("Reconnecting now.");
  });

  it("shows on the frame the race stops and is gone on the frame its ticks resume", () => {
    const host = createHost();
    const notices = () =>
      renderToStaticMarkup(
        <RoomNotices
          feed={host.feed}
          onBackToBar={backToBar}
          room={room}
          stage={riding}
        />
      );
    let notified = 0;
    host.feed.subscribe(() => {
      notified += 1;
    });
    let now = 0;
    const frames = (count: number) => {
      for (let frame = 0; frame < count; frame += 1) {
        now += VSYNC_MS;
        host.at(now);
      }
    };
    frames(30);
    host.stall(3500);
    const heard = notified;
    frames(1);
    expect({
      notified: notified - heard,
      pill: notices().includes(
        'Reconnecting in <span class="numeric">4</span> s.'
      ),
    }).toStrictEqual({ notified: 1, pill: true });
    const stoppedAt = host.run.view.tick;
    frames(10);
    expect(host.run.view.tick).toBe(stoppedAt);
    host.stall(null);
    const before = notified;
    frames(1);
    expect({
      moved: host.run.view.tick > stoppedAt,
      notified: notified - before,
      pill: notices().includes("Waiting for the room"),
    }).toStrictEqual({ moved: true, notified: 1, pill: false });
  });

  it("hands over to Signal lost at the hang-up", () => {
    const lost = screenAt(0, { kind: "signalLost", lostAt: performance.now() });
    expect(lost).toContain("Signal lost");
    expect(lost).not.toContain("Waiting for the room");
  });
});
