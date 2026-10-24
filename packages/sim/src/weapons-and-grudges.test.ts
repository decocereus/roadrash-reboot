import { describe, expect, it } from "vitest";

import { streetBike } from "./bikes.ts";
import {
  brawl,
  cruising,
  field,
  fightFrame,
  frameOf,
  hold,
  player,
  pressing,
  rivalNamed,
  scripted,
  sideBySide,
  straight,
} from "./race-fixtures.ts";
import { createRace, defaultSetup, stepRace } from "./race.ts";
import { MAX_STAMINA, PLAYER_RIDER, TICK_RATE } from "./state.ts";
import type {
  RaceEvent,
  RiderId,
  RiderInput,
  RivalSetup,
  WeaponKind,
} from "./state.ts";
import { arm, disarm } from "./weapons.ts";

describe("weapons", () => {
  it("a club swing drains far more stamina than a punch", () => {
    const punched = sideBySide();
    brawl(punched.state, 1, (tick) =>
      fightFrame(punched.state, pressing("punch", tick === 0), cruising)
    );
    const clubbed = sideBySide();
    const events = brawl(clubbed.state, 1, (tick) =>
      fightFrame(clubbed.state, cruising, pressing("punch", tick === 0))
    );
    const fist = MAX_STAMINA - punched.moose.stamina;
    const club = MAX_STAMINA - clubbed.me.stamina;
    expect(fist).toBeGreaterThan(0);
    expect(club).toBeGreaterThan(fist * 1.5);
    expect(events).toContainEqual({
      attack: "swing",
      kind: "hit",
      rider: clubbed.moose.id,
      target: clubbed.me.id,
      weapon: "club",
    });
  });

  it("a club breaks after six hits and its owner goes back to fists", () => {
    const { moose, me, state } = sideBySide();
    expect(moose.weapon).toBe("club");
    const events = brawl(state, 14, () => {
      me.stamina = MAX_STAMINA;
      return fightFrame(state, cruising, pressing("punch", true));
    });
    const clubHits = events.filter(
      (event) => event.kind === "hit" && event.weapon === "club"
    );
    expect(clubHits).toHaveLength(6);
    expect(events).toContainEqual({
      kind: "weaponBroken",
      rider: moose.id,
      weapon: "club",
    });
    expect(moose.weapon).toBe("none");
    expect(events.at(-1)).toMatchObject({ attack: "punch", weapon: "none" });
  });

  it("a kick that lands on an armed rival takes the weapon", () => {
    const { moose, me, state } = sideBySide();
    expect(me.weapon).toBe("none");
    const events = brawl(state, 2, (tick) =>
      fightFrame(
        state,
        tick < 60
          ? pressing("kick", tick === 0)
          : pressing("punch", tick === 60),
        cruising
      )
    );
    expect(events).toContainEqual({
      kind: "weaponTaken",
      rider: me.id,
      target: moose.id,
      weapon: "club",
    });
    expect([me.weapon, moose.weapon]).toStrictEqual(["club", "none"]);
    expect(events).toContainEqual({
      attack: "swing",
      kind: "hit",
      rider: me.id,
      target: moose.id,
      weapon: "club",
    });
    expect(me.weaponHits).toBe(5);
  });
});

const duel = (
  unarmedSeat: "player" | "rival",
  inputsAt: (tick: number) => { unarmed: RiderInput; holder: RiderInput }
) => {
  const state = field(straight, 1, 1, 0);
  const seats = {
    player: player(state),
    rival: rivalNamed(state, "dee-santangelo"),
  };
  const unarmed = seats[unarmedSeat];
  const holder = seats[unarmedSeat === "player" ? "rival" : "player"];
  disarm(unarmed);
  arm(holder, "chain");
  for (const rider of state.riders) {
    rider.s = 50;
    rider.speed = 30;
  }
  for (let tick = 0; tick < TICK_RATE; tick += 1) {
    unarmed.x = 0.3;
    holder.x = 1.8;
    holder.s = unarmed.s;
    const inputs = inputsAt(tick);
    stepRace(
      state,
      straight,
      frameOf(state, [unarmed.id, inputs.unarmed], [holder.id, inputs.holder])
    );
  }
  return {
    holder: [holder.weapon, holder.weaponHits],
    unarmed: [unarmed.weapon, unarmed.weaponHits],
  };
};

const kickedFromBothSides = (firstX: number, secondX: number) => {
  const setup = defaultSetup(straight, 1);
  const state = scripted(
    createRace({
      ...setup,
      police: { ...setup.police, count: 0 },
      rivals: setup.rivals
        .slice(0, 2)
        .map((rival) => ({ ...rival, bike: streetBike })),
    })
  );
  const holder = player(state);
  const first = rivalNamed(state, "dee-santangelo");
  const second = rivalNamed(state, "moose-kowalczyk");
  arm(holder, "chain");
  disarm(first);
  disarm(second);
  for (const rider of state.riders) {
    rider.s = 50;
    rider.speed = 30;
  }
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < TICK_RATE; tick += 1) {
    holder.x = 0;
    first.x = firstX;
    second.x = secondX;
    first.s = holder.s;
    second.s = holder.s;
    const kick = pressing("kick", tick === 0);
    stepRace(
      state,
      straight,
      frameOf(state, [holder.id, cruising], [first.id, kick], [second.id, kick])
    );
    events.push(...state.events);
  }
  const seatOf = (id: RiderId) => {
    if (id === first.id) {
      return "first";
    }
    return id === second.id ? "second" : "holder";
  };
  return {
    hits: events.flatMap((event) =>
      event.kind === "hit" ? [[seatOf(event.rider), seatOf(event.target)]] : []
    ),
    taken: events.flatMap((event) =>
      event.kind === "weaponTaken"
        ? [
            {
              rider: seatOf(event.rider),
              target: seatOf(event.target),
              weapon: event.weapon,
            },
          ]
        : []
    ),
    weapons: state.riders.map((rider) => [rider.weapon, rider.weaponHits]),
  };
};

describe("simultaneous weapon grabs", () => {
  it.each([
    {
      firstX: -1.6,
      secondX: 1,
      taker: "second",
      weapons: [
        ["none", 0],
        ["none", 0],
        ["chain", 8],
      ],
      who: "the nearer, though listed later",
    },
    {
      firstX: -1.2,
      secondX: 1.2,
      taker: "first",
      weapons: [
        ["none", 0],
        ["chain", 8],
        ["none", 0],
      ],
      who: "the one listed first, when both are as near",
    },
  ])(
    "two unarmed riders who kick a chain holder from either side on the same tick leave the chain with $who",
    ({ firstX, secondX, taker, weapons }) => {
      expect(kickedFromBothSides(firstX, secondX)).toStrictEqual({
        hits: [
          ["first", "holder"],
          ["second", "holder"],
        ],
        taken: [{ rider: taker, target: "holder", weapon: "chain" }],
        weapons,
      });
    }
  );

  it.each([{ unarmed: "player" }, { unarmed: "rival" }] as const)(
    "an unarmed rider and a chain holder who kick each other on the same tick leave the chain with the unarmed one (unarmed is the $unarmed)",
    ({ unarmed }) => {
      const after = duel(unarmed, (tick) => ({
        holder: pressing("kick", tick === 0),
        unarmed: pressing("kick", tick === 0),
      }));
      expect(after).toStrictEqual({
        holder: ["none", 0],
        unarmed: ["chain", 8],
      });
    }
  );

  it.each([{ unarmed: "player" }, { unarmed: "rival" }] as const)(
    "a chain that lands on the tick it is kicked away has one hit fewer (unarmed is the $unarmed)",
    ({ unarmed }) => {
      const after = duel(unarmed, (tick) => ({
        holder: pressing("punch", tick === 0),
        unarmed: pressing("kick", tick === 3),
      }));
      expect(after).toStrictEqual({
        holder: ["none", 0],
        unarmed: ["chain", 7],
      });
    }
  );
});

describe("armed rivals", () => {
  it("a chain holder at full aggression swings at a rider 2.8 m across within five seconds", () => {
    const setup = defaultSetup(straight, 1);
    const [dee] = setup.rivals;
    if (!dee) {
      throw new Error("The default field has no rival.");
    }
    const state = createRace({
      ...setup,
      police: { ...setup.police, count: 0 },
      rivals: [{ ...dee, aggression: 1 }],
    });
    const holder = rivalNamed(state, "dee-santangelo");
    state.tick = 10 * TICK_RATE;
    const me = player(state);
    const events: RaceEvent[] = [];
    for (let tick = 0; tick < 5 * TICK_RATE; tick += 1) {
      for (const rider of state.riders) {
        rider.s = 50;
        rider.speed = 30;
      }
      me.x = -1;
      holder.x = 1.8;
      stepRace(state, straight, frameOf(state, [me.id, cruising]));
      events.push(...state.events);
    }
    expect(holder.weapon).toBe("chain");
    expect(events).toContainEqual({
      attack: "swing",
      kind: "hit",
      rider: holder.id,
      target: me.id,
      weapon: "chain",
    });
  });
});

const steerAway = (weapon: "none" | "sign", seconds: number): number => {
  const state = field(straight, 1, 0, 0);
  const rider = player(state);
  rider.speed = 40;
  arm(rider, weapon);
  hold(state, straight, { ...cruising, steer: 1, throttle: 0.6 }, seconds);
  return rider.lateralSpeed;
};

const reaches = (weapon: WeaponKind, across = 2.8): boolean => {
  const { me, moose, state } = sideBySide();
  arm(moose, weapon);
  const events: RaceEvent[] = [];
  for (let tick = 0; tick < TICK_RATE; tick += 1) {
    me.x = -1;
    moose.x = across - 1;
    moose.s = me.s;
    stepRace(
      state,
      straight,
      fightFrame(state, cruising, pressing("punch", tick === 0))
    );
    events.push(...state.events);
  }
  return events.some((event) => event.kind === "hit");
};

const ticksBetweenHits = (weapon: WeaponKind): number => {
  const { moose, me, state } = sideBySide();
  arm(moose, weapon);
  const landedAt: number[] = [];
  brawl(state, 3, () => {
    me.stamina = MAX_STAMINA;
    if (state.events.some((event) => event.kind === "hit")) {
      landedAt.push(state.tick);
    }
    return fightFrame(state, cruising, pressing("punch", true));
  });
  const [first = 0, second = 0] = landedAt;
  return second - first;
};

const staminaLostTo = (weapon: "sign" | "club"): number => {
  const { moose, me, state } = sideBySide();
  arm(moose, weapon);
  brawl(state, 1, (tick) =>
    fightFrame(state, cruising, pressing("punch", tick === 0))
  );
  return MAX_STAMINA - me.stamina;
};

const ticksToLand = (weapon: WeaponKind, steer: number): number => {
  const { moose, me, state } = sideBySide();
  arm(moose, weapon);
  me.x = -0.5;
  let pressed = -1;
  let landed = -1;
  for (let tick = 0; tick < TICK_RATE; tick += 1) {
    moose.x = 1.8;
    moose.s = me.s;
    stepRace(
      state,
      straight,
      fightFrame(state, { ...cruising, steer }, pressing("punch", tick === 0))
    );
    for (const event of state.events) {
      if (event.kind === "attack" && event.rider === moose.id) {
        pressed = state.tick;
      }
      if (event.kind === "hit" && event.rider === moose.id) {
        landed = state.tick;
      }
    }
  }
  return landed < 0 ? -1 : landed - pressed;
};

describe("the new weapons", () => {
  it("a stop sign lands 27 ticks after the press, so a rider two metres across who steers away at once is out of reach, and a club lands at 7 before they can move", () => {
    expect({
      club: ticksToLand("club", 0),
      clubDodged: ticksToLand("club", -1),
      sign: ticksToLand("sign", 0),
      signDodged: ticksToLand("sign", -1),
    }).toStrictEqual({ club: 7, clubDodged: 7, sign: 27, signDodged: -1 });
  });

  it("a pool cue breaks after three hits", () => {
    const { moose, me, state } = sideBySide();
    arm(moose, "cue");
    const events = brawl(state, 10, () => {
      me.stamina = MAX_STAMINA;
      return fightFrame(state, cruising, pressing("punch", true));
    });
    expect(
      events.filter((event) => event.kind === "hit" && event.weapon === "cue")
    ).toHaveLength(3);
    expect(events).toContainEqual({
      kind: "weaponBroken",
      rider: moose.id,
      weapon: "cue",
    });
    expect(moose.weapon).toBe("none");
  });

  it("a pool cue reaches a rider 2.8 m across, where a club does not", () => {
    expect({ club: reaches("club"), cue: reaches("cue") }).toStrictEqual({
      club: false,
      cue: true,
    });
  });

  it("a pool cue has the longest reach, 3.3 m across where a chain falls short, and still not a full lane", () => {
    expect({
      chain: reaches("chain", 3.3),
      cue: reaches("cue", 3.3),
      cueAcrossTheLane: reaches("cue", 3.5),
    }).toStrictEqual({ chain: false, cue: true, cueAcrossTheLane: false });
  });

  it("a stop sign comes round again more slowly than any other weapon, and a pool cue fastest", () => {
    expect({
      club: ticksBetweenHits("club"),
      cue: ticksBetweenHits("cue"),
      sign: ticksBetweenHits("sign"),
    }).toStrictEqual({ club: 40, cue: 30, sign: 50 });
  });

  it("a stop sign hits harder than a club and its holder answers the bars more slowly", () => {
    expect(staminaLostTo("sign")).toBeGreaterThan(staminaLostTo("club"));
    expect(steerAway("sign", 0.05)).toBeLessThan(
      steerAway("none", 0.05) * 0.95
    );
    expect(steerAway("sign", 1.5)).toBeCloseTo(steerAway("none", 1.5), 1);
  });
});

const BYSTANDER = rivalNamed(field(straight, 1, 2, 0), "moose-kowalczyk").id;

const hitsByTheRival = (
  rival: RivalSetup,
  bystanderAcross: number,
  playerAcross = -1.2
) => {
  const setup = defaultSetup(straight, 1);
  const [, other] = setup.rivals;
  if (!other) {
    throw new Error("The default field has no second rival.");
  }
  const state = scripted(
    createRace({
      ...setup,
      police: { ...setup.police, count: 0 },
      rivals: [rival, other],
    })
  );
  state.tick = 10 * TICK_RATE;
  const striker = rivalNamed(state, "dee-santangelo");
  striker.controller = "pilot";
  const bystander = rivalNamed(state, "moose-kowalczyk");
  const frame = frameOf(
    state,
    [PLAYER_RIDER, cruising],
    [bystander.id, cruising]
  );
  const targets: RiderId[] = [];
  for (let tick = 0; tick < 6 * TICK_RATE; tick += 1) {
    for (const rider of state.riders) {
      rider.s = 50;
      rider.speed = 30;
      rider.stamina = MAX_STAMINA;
    }
    player(state).x = playerAcross;
    striker.x = 0;
    bystander.x = bystanderAcross;
    stepRace(state, straight, frame);
    targets.push(
      ...state.events.flatMap((event) =>
        event.kind === "hit" && event.rider === striker.id ? [event.target] : []
      )
    );
  }
  return targets;
};

describe("grudges", () => {
  it("a rival with a grudge attacks its target rather than a nearer rider when both are in reach", () => {
    const [dee] = defaultSetup(straight, 1).rivals;
    if (!dee) {
      throw new Error("The default field has no rival.");
    }
    const impartial = hitsByTheRival({ ...dee, aggression: 1 }, 2);
    const grudging = hitsByTheRival(
      { ...dee, aggression: 1, grudge: BYSTANDER },
      2
    );
    expect(impartial[0]).toBe(PLAYER_RIDER);
    expect(grudging.length).toBeGreaterThan(0);
    expect(new Set(grudging)).toStrictEqual(new Set([BYSTANDER]));
  });

  it("a rival who is otherwise peaceful attacks the player it has a score to settle with, and nobody else", () => {
    const [dee] = defaultSetup(straight, 1).rivals;
    if (!dee) {
      throw new Error("The default field has no rival.");
    }
    const sore = { ...dee, aggression: 0, aggressionBoost: 1 };
    const alongside = hitsByTheRival(sore, 2);
    expect(alongside.length).toBeGreaterThan(0);
    expect(new Set(alongside)).toStrictEqual(new Set([PLAYER_RIDER]));
    expect(hitsByTheRival(sore, 2, -12)).toStrictEqual([]);
  });

  it("a rival who has gone soft on the player leaves them alone and still fights the others", () => {
    const [dee] = defaultSetup(straight, 1).rivals;
    if (!dee) {
      throw new Error("The default field has no rival.");
    }
    const friendly = { ...dee, aggression: 1, aggressionBoost: -1 };
    const others = hitsByTheRival(friendly, 2, -12);
    expect(hitsByTheRival(friendly, 12)).toStrictEqual([]);
    expect(others.length).toBeGreaterThan(0);
    expect(new Set(others)).toStrictEqual(new Set([BYSTANDER]));
  });

  it("a grudge picks the target and leaves the rival's aggression toward that rider as it was", () => {
    const [dee] = defaultSetup(straight, 1).rivals;
    if (!dee) {
      throw new Error("The default field has no rival.");
    }
    const peaceful = {
      ...dee,
      aggression: 0,
      aggressionBoost: 1,
      grudge: BYSTANDER,
    };
    expect(hitsByTheRival(peaceful, 2, -12)).toStrictEqual([]);
  });
});
