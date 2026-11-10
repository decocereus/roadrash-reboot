import { describe, expect, it } from "vitest";

import { firstView, roomAddressOf, stepNavigation } from "../src/navigation.ts";
import type { NavigationEvent, RoomVisit, View } from "../src/navigation.ts";
import {
  CORRUPT,
  ELSEWHERE,
  EMPTY,
  entered,
  finding,
  fresh,
  home,
  LEFT,
  leftWith,
  invite,
  linkVisit,
  LOADING,
  lobbyOf,
  racing,
  readySave,
  ROOM_ID,
  roomLobby,
  roomPlan,
  roomResult,
  rulesReady,
  screens,
  settled,
  singlePlan,
  toSingleRace,
  UNREAD,
  walk,
} from "./navigation-walk.ts";

describe("a room's race", () => {
  const roomResults: View = { report: roomResult, screen: "results" };
  const inRoomRace: View = racing(roomPlan);
  const raceMenu: View = { ...racing(roomPlan), stage: { kind: "paused" } };

  it("leaves results for the bar in place, with no page load", () => {
    expect(stepNavigation(roomResults, LEFT)).toStrictEqual({
      effect: null,
      state: home,
    });
  });

  it("goes back to the same lobby for a rematch in place", () => {
    expect(
      stepNavigation(roomResults, { entry: toSingleRace, kind: "ridePicked" })
    ).toStrictEqual({
      effect: null,
      state: lobbyOf({ arrival: "rematch", rejoin: null, roomId: ROOM_ID }),
    });
  });

  it("leaves a lobby for the home the save holds", () => {
    const homes = [
      readySave(fresh),
      readySave({ ...fresh, gameOver: true }),
      EMPTY,
      CORRUPT,
      UNREAD,
      LOADING,
      ELSEWHERE,
    ].map((save) => walk(roomLobby, leftWith(save)));
    expect(homes).toStrictEqual([
      { at: home, effects: [], trail: ["bar/home"] },
      { at: home, effects: [], trail: ["bar/home"] },
      { at: home, effects: ["beginCareer"], trail: ["bar/home"] },
      { at: home, effects: [], trail: ["bar/home"] },
      { at: home, effects: [], trail: ["bar/home"] },
      { at: home, effects: [], trail: ["bar/home"] },
      { at: { screen: "elsewhere" }, effects: [], trail: ["elsewhere"] },
    ]);
  });

  it("moves inside the room as a new visit that remounts the lobby", () => {
    const moved = { arrival: "moved", rejoin: "try", roomId: ROOM_ID } as const;
    const { at, trail } = walk(
      roomLobby,
      { kind: "roomMoved", visit: moved },
      { kind: "roomMoved", visit: { ...moved, rejoin: "taken" } }
    );
    expect(trail).toStrictEqual(["bar/lobby", "bar/lobby"]);
    expect(at).toStrictEqual(lobbyOf({ ...moved, rejoin: "taken" }, 2));
  });

  it("opens a room from home, the queue and a lost race", () => {
    const made = { arrival: "made", rejoin: null, roomId: ROOM_ID } as const;
    for (const view of [
      home,
      finding,
      { ...inRoomRace, stage: { kind: "signalLost", lostAt: 0 } },
    ] as const satisfies readonly View[]) {
      expect(
        stepNavigation(view, { kind: "roomMoved", visit: made })
      ).toStrictEqual({ effect: null, state: lobbyOf(made) });
    }
  });

  it("opens the race menu on Esc and goes back to the race", () => {
    expect(
      walk(inRoomRace, { kind: "paused" }, { kind: "resumed" }).trail
    ).toStrictEqual(["race/paused", "race/riding"]);
  });

  it("leaves the race from its menu for home, with no rejoin", () => {
    expect(stepNavigation(raceMenu, LEFT)).toStrictEqual({
      effect: null,
      state: home,
    });
  });

  it("keeps a solo pause on its own quit path", () => {
    const soloPause: View = {
      ...racing(singlePlan),
      stage: { kind: "paused" },
    };
    expect(stepNavigation(soloPause, LEFT).state).toBe(soloPause);
  });

  it("closes the menu when the race ends or the signal drops under it", () => {
    expect(
      walk(raceMenu, settled("finished", roomResult), LEFT).trail
    ).toStrictEqual(["race/finishing", "results"]);
    expect(
      walk(raceMenu, settled("wrecked", roomResult), { kind: "raceOver" }).trail
    ).toStrictEqual(["race/consequence", "results"]);
    expect(
      walk(raceMenu, { kind: "signalLost", lostAt: 0 }).trail
    ).toStrictEqual(["race/signalLost"]);
  });

  it("walks an invite link from the lobby to the results", () => {
    const { at, trail } = walk(
      firstView(),
      entered(rulesReady, EMPTY, linkVisit),
      { kind: "raceBegun", plan: roomPlan },
      settled("finished", roomResult),
      LEFT
    );
    expect(trail).toStrictEqual([
      "bar/lobby",
      "race/riding",
      "race/finishing",
      "results",
    ]);
    expect(at).toStrictEqual(roomResults);
  });

  it("names the room in the address while the room is on screen", () => {
    expect(
      [
        roomLobby,
        { ...roomLobby, tab: "settings" as const },
        invite,
        inRoomRace,
        roomResults,
        racing(singlePlan),
      ].map(roomAddressOf)
    ).toStrictEqual([
      { arrival: "link", roomId: ROOM_ID },
      { arrival: "link", roomId: ROOM_ID },
      { arrival: "link", roomId: ROOM_ID },
      { arrival: null, roomId: ROOM_ID },
      { arrival: null, roomId: ROOM_ID },
      null,
    ]);
    expect(roomAddressOf(home)).toBeNull();
    expect(roomAddressOf(finding)).toBeNull();
  });
});

describe("one page load", () => {
  const roomVisit: RoomVisit = {
    arrival: "moved",
    rejoin: "no",
    roomId: ROOM_ID,
  };
  const views: readonly View[] = [
    ...screens,
    racing(roomPlan),
    { ...racing(roomPlan), stage: { kind: "paused" } },
    { ...racing(roomPlan), stage: { kind: "signalLost", lostAt: 0 } },
    { report: roomResult, screen: "results" },
  ];
  const events: readonly NavigationEvent[] = [
    LEFT,
    leftWith(EMPTY),
    leftWith(CORRUPT),
    leftWith(LOADING),
    { kind: "roomMoved", visit: roomVisit },
    { entry: toSingleRace, kind: "ridePicked" },
    { kind: "paused" },
    { kind: "resumed" },
    { kind: "signalLost", lostAt: 0 },
    settled("finished", roomResult),
    settled("quit", null),
    { kind: "raceOver" },
    { kind: "careerBegun" },
    { kind: "tabbed", tab: "garage" },
    { kind: "picked", panel: "finding" },
    { kind: "joined" },
    { kind: "doorOpened" },
    { kind: "raceRefused" },
    { kind: "raceBegun", plan: roomPlan },
    entered(rulesReady, EMPTY, roomVisit),
  ];

  it("never goes back to the boot screen once the game has loaded", () => {
    for (const view of views.filter(({ screen }) => screen !== "boot")) {
      for (const event of events) {
        expect(stepNavigation(view, event).state.screen).not.toBe("boot");
      }
    }
  });

  it("leaves every room screen with no effect but a new career", () => {
    const roomScreens = views.filter((view) => roomAddressOf(view) !== null);
    const effects = new Set(
      roomScreens.flatMap((view) =>
        events.flatMap((event) => {
          const { effect } = stepNavigation(view, event);
          return effect ? [effect.kind] : [];
        })
      )
    );
    expect([...effects]).toStrictEqual(["beginCareer"]);
  });
});
