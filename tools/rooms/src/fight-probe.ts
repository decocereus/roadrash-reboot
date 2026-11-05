export const FIGHT_PROBE = `(() => {
  if (globalThis.__fightProbe) { return "kept"; }
  const frames = [];
  const presses = [];
  globalThis.__fightProbe = { frames, presses };
  addEventListener("keydown", (event) => {
    if (!event.repeat) { presses.push({ at: Date.now(), code: event.code }); }
  }, true);
  const stances = [];
  const watchFigures = (cast) => {
    cast.forEach((view, index) => {
      const { figure } = view;
      if (figure.__probed) { return; }
      const animate = figure.animate;
      figure.__probed = true;
      figure.animate = (stance, seconds) => {
        stances[index] = { flinch: stance.flinch, pose: stance.pose, reach: stance.reach };
        animate(stance, seconds);
      };
    });
  };
  const rider = (state, index) => {
    const r = state.riders[index];
    return { attack: r.attack, attackTicks: r.attackTicks, hitStun: r.hitStun, mode: r.mode, s: r.s, speed: r.speed, stamina: r.stamina, x: r.x };
  };
  const sample = () => {
    const room = globalThis.__rushlineRoom;
    const cast = globalThis.__rushlineCast;
    if (room && cast) {
      const { client } = room;
      const humans = [0, 1];
      watchFigures(cast);
      frames.push({
        at: Date.now(),
        confirmed: humans.map((i) => rider(client.confirmed, i)),
        drawn: humans.map((i) => ({ flinch: stances[i] ? stances[i].flinch : 0, pose: stances[i] ? stances[i].pose : "seated", reach: stances[i] ? stances[i].reach : 0, x: client.predicted.riders[i].x + (cast[i].drift ? cast[i].drift.x : 0) })),
        heard: client.confirmed.tick,
        predicted: humans.map((i) => rider(client.predicted, i)),
        rtt: room.rttMs(),
        tick: client.predicted.tick,
      });
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  return "installed";
})()`;

export const POSITIONS = `(() => {
  const room = globalThis.__rushlineRoom;
  if (!room) { return null; }
  const { client } = room;
  const [a, b] = client.confirmed.riders;
  return { aMode: a.mode, aS: a.s, aSpeed: a.speed, aX: a.x, bMode: b.mode, bS: b.s, bSpeed: b.speed, bX: b.x, tick: client.confirmed.tick };
})()`;

export const TAKE_FRAMES = (since: number): string =>
  `(() => { const p = globalThis.__fightProbe; return { frames: p.frames.filter((f) => f.at >= ${since}), presses: p.presses.filter((f) => f.at >= ${since}) }; })()`;

export const FIGHT_PILOT = `(() => {
  if (globalThis.__fightPilot) { return "kept"; }
  const held = new Set();
  addEventListener("blur", () => { held.clear(); });
  const hold = (code, down) => {
    if (down === held.has(code)) { return; }
    if (down) { held.add(code); } else { held.delete(code); }
    dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { bubbles: true, code, key: code }));
  };
  const pilot = { armed: null };
  globalThis.__fightPilot = pilot;
  const strikeWhenInReach = (room, mine) => {
    const riders = room.client.predicted.riders;
    const me = riders[mine];
    const them = riders[mine === 0 ? 1 : 0];
    const across = Math.abs(them.x - me.x);
    const bothRiding = me.mode === "riding" && them.mode === "riding";
    if (pilot.armed && bothRiding && Math.abs(them.s - me.s) < 1 && across > 1.1 && across < 2) {
      const code = pilot.armed;
      pilot.armed = null;
      hold(code, true);
      setTimeout(() => hold(code, false), 80);
    }
  };
  const step = () => {
    const room = globalThis.__rushlineRoom;
    if (room) {
      const riders = room.client.confirmed.riders;
      const mine = riders.findIndex((rider) => rider.id === room.me);
      const me = riders[mine];
      const them = riders[mine === 0 ? 1 : 0];
      const ahead = me.s - them.s;
      const riding = me.mode === "riding";
      strikeWhenInReach(room, mine);
      hold("KeyE", !riding);
      const easing = ahead > 1 && me.speed >= them.speed - 1;
      hold("ArrowUp", riding && !easing);
      hold("ArrowDown", riding && ahead > 6);
      if (mine === 0 && riding) {
        const gap = Math.abs(them.x - me.x);
        const towards = gap > 2;
        const steering = towards || gap < 1.2;
        const right = them.x > me.x === towards;
        hold("ArrowRight", steering && right);
        hold("ArrowLeft", steering && !right);
      }
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return "installed";
})()`;
