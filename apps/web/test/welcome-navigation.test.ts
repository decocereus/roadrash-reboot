import { describe, expect, it } from "vitest";

import { firstView, roomAddressOf, stepNavigation } from "../src/navigation.ts";
import type { NavigationEvent } from "../src/navigation.ts";
import {
  barAt,
  EMPTY,
  entered,
  fresh,
  home,
  invite,
  LEFT,
  linkVisit,
  readySave,
  ROOM_ID,
  roomLobby,
  rulesFailed,
  rulesReady,
  walk,
  welcome,
} from "./navigation-walk.ts";

const WALKED_IN: NavigationEvent = { kind: "welcomed" };
const READY = readySave(fresh);

const firstVisit = (save = READY): NavigationEvent =>
  entered(rulesReady, save, null, false, false, false);

const invitedFirstVisit = entered(
  rulesReady,
  READY,
  linkVisit,
  false,
  true,
  false
);

const welcomeToInvite = barAt({
  kind: "welcome",
  next: { kind: "invite", roomId: ROOM_ID },
});

describe("the first-visit card", () => {
  it("opens over the bar on a first visit and starts the career under it", () => {
    const { at, effects, trail } = walk(
      firstView(),
      firstVisit(EMPTY),
      firstVisit(READY),
      { kind: "careerBegun" }
    );
    expect(trail).toStrictEqual(["bar/welcome", "bar/welcome", "bar/welcome"]);
    expect(effects).toStrictEqual(["beginCareer"]);
    expect(at).toStrictEqual(welcome);
  });

  it("walks in to the home panel", () => {
    const { at, trail } = walk(firstView(), firstVisit(), WALKED_IN);
    expect(trail).toStrictEqual(["bar/welcome", "bar/home"]);
    expect(at).toStrictEqual(home);
  });

  it("walks in to the invite when a friend's link is waiting", () => {
    const { at, trail } = walk(firstView(), invitedFirstVisit, WALKED_IN);
    expect(trail).toStrictEqual(["bar/welcome", "bar/invite"]);
    expect(at).toStrictEqual(invite);
  });

  it("walks in to the room when the link was joined before", () => {
    const { at } = walk(
      firstView(),
      entered(rulesReady, READY, linkVisit, false, false, false),
      WALKED_IN
    );
    expect(at).toStrictEqual(roomLobby);
  });

  it("keeps the friend's room in the address while the card is up", () => {
    const { at } = walk(firstView(), invitedFirstVisit);
    expect(at).toStrictEqual(welcomeToInvite);
    expect(roomAddressOf(at)).toStrictEqual({
      arrival: "link",
      roomId: ROOM_ID,
    });
  });

  it("never shows the card to a returning player", () => {
    for (const save of [READY, EMPTY]) {
      const { trail } = walk(
        firstView(),
        entered(rulesReady, save),
        entered(rulesReady, READY)
      );
      expect(trail).not.toContain("bar/welcome");
    }
    expect(
      walk(
        firstView(),
        entered(rulesReady, READY, linkVisit, false, true, true)
      ).trail
    ).toStrictEqual(["bar/invite"]);
  });

  it("shows the card again after a refresh before Walk in, and not after", () => {
    const before = walk(firstView(), firstVisit(), firstVisit());
    expect(before.trail).toStrictEqual(["bar/welcome", "bar/welcome"]);
    const after = walk(
      walk(firstView(), firstVisit(), WALKED_IN).at,
      entered(rulesReady, READY)
    );
    expect(after.trail).toStrictEqual(["bar/home"]);
    expect(
      walk(firstView(), invitedFirstVisit, invitedFirstVisit).at
    ).toStrictEqual(welcomeToInvite);
  });

  it("shows the card over a rules failure too", () => {
    expect(
      walk(
        firstView(),
        entered(rulesFailed, READY, null, false, false, false),
        WALKED_IN
      ).trail
    ).toStrictEqual(["bar/welcome", "bar/home"]);
  });

  it("holds the tabs, the walk-up spots and Esc until Walk in", () => {
    const events: readonly NavigationEvent[] = [
      { kind: "tabbed", tab: "garage" },
      { kind: "tabbed", tab: "settings" },
      { kind: "walkedUp", spot: "garage" },
      { kind: "picked", panel: "solo" },
      LEFT,
    ];
    for (const event of events) {
      expect(stepNavigation(welcome, event).state).toStrictEqual(welcome);
    }
  });

  it("ignores Walk in anywhere but the card", () => {
    expect(stepNavigation(home, WALKED_IN).state).toStrictEqual(home);
    expect(stepNavigation(firstView(), WALKED_IN).state).toStrictEqual(
      firstView()
    );
  });
});
