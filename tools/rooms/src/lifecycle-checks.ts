export const GUARDS = [
  "GuardRetireReplaced",
  "GuardJoinByKey",
  "GuardSweepWaits",
  "GuardLeaveCode",
  "GuardBootLeavesRoom",
  "GuardNeverArrived",
  "GuardFreeColour",
  "GuardDropMarks",
  "GuardDropRetires",
  "GuardWaitForLoads",
  "GuardSameRun",
  "GuardReopen",
  "GuardLateRoomRacing",
  "GuardEndedBackToLobby",
  "GuardDropHolds",
  "GuardReplacedHolds",
  "GuardRejoin",
  "GuardRejoinCountdown",
  "GuardTakenStaysPut",
  "GuardHoldDeadline",
  "GuardRestoreHolds",
] as const;

export type Guard = (typeof GUARDS)[number];

const INVARIANTS = [
  "OneSocketPerMember",
  "SlotNeverShared",
  "NoGhostInBar",
  "LeaveFreesSpot",
  "BootFailureFreesSpot",
  "TakenTabStaysPut",
] as const;

const ACTION_PROPERTIES = [
  "HoldLastsAway",
  "RejoinKeepsSpot",
  "SeatsCanRide",
  "FairStart",
  "ReadyRiderRides",
  "BackOnBike",
  "BikeHeldForHold",
  "HoldEndsOnTime",
  "RideSurvivesRestart",
] as const;

const LIVENESS = ["NeverStuck"] as const;

type Invariant = (typeof INVARIANTS)[number];
type ActionProperty = (typeof ACTION_PROPERTIES)[number];
type Liveness = (typeof LIVENESS)[number];

export type Rule = Invariant | ActionProperty | Liveness;

export const RULES: readonly Rule[] = [
  ...INVARIANTS,
  ...ACTION_PROPERTIES,
  ...LIVENESS,
];

const isInvariant = (rule: Rule): rule is Invariant =>
  INVARIANTS.some((each) => each === rule);

const RIDER_NAMES = ["a", "b", "c"] as const;

interface Bounds {
  readonly kind: "custom" | "public";
  readonly maxRaces: number;
  readonly mostSeats: number;
  readonly oldPageFirst: boolean;
  readonly restarts: number;
  readonly riders: 1 | 2 | 3;
  readonly slots: number;
  readonly twins: boolean;
  readonly userActs: number;
}

interface Check {
  readonly bounds: Bounds;
  readonly rules: readonly Rule[];
  readonly says: string;
}

const SAFETY: readonly Rule[] = [...INVARIANTS, ...ACTION_PROPERTIES];

export const CHECKS = {
  full: {
    bounds: {
      kind: "public",
      maxRaces: 1,
      mostSeats: 1,
      oldPageFirst: true,
      restarts: 0,
      riders: 2,
      slots: 2,
      twins: false,
      userActs: 3,
    },
    rules: SAFETY,
    says: "one seat in a public room, three actions",
  },
  newMember: {
    bounds: {
      kind: "public",
      maxRaces: 2,
      mostSeats: 1,
      oldPageFirst: true,
      restarts: 0,
      riders: 1,
      slots: 2,
      twins: false,
      userActs: 4,
    },
    rules: ["BackOnBike"],
    says: "one rider in a public room over two races, whom the lobby can make a new member mid-race",
  },
  pair: {
    bounds: {
      kind: "custom",
      maxRaces: 1,
      mostSeats: 2,
      oldPageFirst: true,
      restarts: 0,
      riders: 2,
      slots: 2,
      twins: false,
      userActs: 3,
    },
    rules: SAFETY,
    says: "two riders in a custom room, one race",
  },
  public: {
    bounds: {
      kind: "public",
      maxRaces: 1,
      mostSeats: 2,
      oldPageFirst: true,
      restarts: 0,
      riders: 2,
      slots: 2,
      twins: false,
      userActs: 2,
    },
    rules: SAFETY,
    says: "two riders in a public room, one race",
  },
  restart: {
    bounds: {
      kind: "custom",
      maxRaces: 1,
      mostSeats: 2,
      oldPageFirst: true,
      restarts: 1,
      riders: 1,
      slots: 2,
      twins: false,
      userActs: 3,
    },
    rules: [...SAFETY, ...LIVENESS],
    says: "one rider whose room restarts once, mid-race or not, never stuck",
  },
  solo: {
    bounds: {
      kind: "custom",
      maxRaces: 2,
      mostSeats: 2,
      oldPageFirst: true,
      restarts: 0,
      riders: 1,
      slots: 2,
      twins: false,
      userActs: 4,
    },
    rules: [...SAFETY, ...LIVENESS],
    says: "one rider racing twice, never stuck",
  },
  twins: {
    bounds: {
      kind: "public",
      maxRaces: 1,
      mostSeats: 1,
      oldPageFirst: true,
      restarts: 0,
      riders: 2,
      slots: 1,
      twins: true,
      userActs: 2,
    },
    rules: SAFETY,
    says: "two tabs of one browser in a public room",
  },
} as const satisfies Record<string, Check>;

export type CheckName = keyof typeof CHECKS;

interface Defect {
  readonly bounds: Bounds;
  readonly breaks: Rule;
  readonly rules: readonly Rule[];
  readonly says: string;
}

export const KNOWN_DEFECTS = {
  lateQuitRejoins: {
    bounds: { ...CHECKS.solo.bounds, oldPageFirst: false },
    breaks: "NeverStuck",
    rules: CHECKS.solo.rules,
    says: "a failed preparation's quit that reaches the room after the new page's seat puts the rider back on the bike, for Multiplayer core, whose fix deletes this entry and the oldPageFirst bound",
  },
} as const satisfies Record<string, Defect>;

export type DefectName = keyof typeof KNOWN_DEFECTS;

interface GuardOff {
  readonly breaks: Rule;
  readonly on: CheckName;
}

export const GUARD_OFFS = {
  GuardBootLeavesRoom: { breaks: "BootFailureFreesSpot", on: "solo" },
  GuardDropHolds: { breaks: "BikeHeldForHold", on: "solo" },
  GuardDropMarks: { breaks: "NoGhostInBar", on: "solo" },
  GuardDropRetires: { breaks: "SeatsCanRide", on: "full" },
  GuardEndedBackToLobby: { breaks: "NeverStuck", on: "solo" },
  GuardFreeColour: { breaks: "SlotNeverShared", on: "pair" },
  GuardHoldDeadline: { breaks: "HoldEndsOnTime", on: "solo" },
  GuardJoinByKey: { breaks: "RejoinKeepsSpot", on: "solo" },
  GuardLateRoomRacing: { breaks: "ReadyRiderRides", on: "solo" },
  GuardLeaveCode: { breaks: "LeaveFreesSpot", on: "solo" },
  GuardNeverArrived: { breaks: "LeaveFreesSpot", on: "solo" },
  GuardRejoin: { breaks: "BackOnBike", on: "solo" },
  GuardRejoinCountdown: { breaks: "ReadyRiderRides", on: "solo" },
  GuardReopen: { breaks: "NeverStuck", on: "solo" },
  GuardReplacedHolds: { breaks: "BackOnBike", on: "solo" },
  GuardRestoreHolds: { breaks: "RideSurvivesRestart", on: "restart" },
  GuardRetireReplaced: { breaks: "OneSocketPerMember", on: "solo" },
  GuardSameRun: { breaks: "FairStart", on: "solo" },
  GuardSweepWaits: { breaks: "HoldLastsAway", on: "solo" },
  GuardTakenStaysPut: { breaks: "TakenTabStaysPut", on: "twins" },
  GuardWaitForLoads: { breaks: "FairStart", on: "pair" },
} as const satisfies Record<Guard, GuardOff>;

const TIMERS = {
  Away: 3,
  ClientDead: 1,
  Deadline: 2,
  Door: 1,
  Gather: 2,
  Grace: 1,
  Hold: 1,
  Quiet: 2,
  Reopen: 1,
  StartDelay: 1,
  Wait: 3,
} as const;

const constantsOf = (
  {
    kind,
    maxRaces,
    mostSeats,
    oldPageFirst,
    restarts,
    riders,
    slots,
    twins,
    userActs,
  }: Bounds,
  off: Guard | null
): readonly string[] => [
  `Riders = {${RIDER_NAMES.slice(0, riders).join(", ")}}`,
  `Twins = ${twins ? "TRUE" : "FALSE"}`,
  `Kind = "${kind}"`,
  `MostSeats = ${mostSeats}`,
  `MaxRaces = ${maxRaces}`,
  `Slots = ${slots}`,
  `UserActs = ${userActs}`,
  `OldPageFirst = ${oldPageFirst ? "TRUE" : "FALSE"}`,
  `Restarts = ${restarts}`,
  ...Object.entries(TIMERS).map(([name, ticks]) => `${name} = ${ticks}`),
  ...GUARDS.map((guard) => `${guard} = ${guard === off ? "FALSE" : "TRUE"}`),
];

export const configOf = (
  bounds: Bounds,
  rules: readonly Rule[],
  off: Guard | null
): string => {
  const invariants = rules.filter(isInvariant);
  const properties = rules.filter((rule) => !isInvariant(rule));
  const live = rules.some((rule) => LIVENESS.some((each) => each === rule));
  return [
    "SPECIFICATION Spec",
    "CONSTANTS",
    ...constantsOf(bounds, off).map((line) => `    ${line}`),
    ...(invariants.length > 0
      ? ["INVARIANTS", ...invariants.map((rule) => `    ${rule}`)]
      : []),
    ...(properties.length > 0
      ? ["PROPERTIES", ...properties.map((rule) => `    ${rule}`)]
      : []),
    ...(bounds.riders > 1 && !bounds.twins && !live
      ? ["SYMMETRY RiderSymmetry"]
      : []),
    "",
  ].join("\n");
};
