export const FIGHT_PROBE = `(() => {
  if (globalThis.__fightProbe) { return "kept"; }
  const frames = [];
  const presses = [];
  const attacks = [];
  const falls = [];
  const hits = [];
  const lostButtons = [];
  const placed = [];
  const sends = [];
  globalThis.__fightProbe = { attacks, falls, frames, hits, lostButtons, placed, presses, sends };
  const BUTTONS_PLACE = 256 * 256 * 256;
  const watchClient = (client, me) => {
    if (client.__probed) { return; }
    client.__probed = true;
    const { confirm, predict, writeInputs } = client;
    const own = new Map();
    const was = [];
    client.predict = (control) => {
      const went = predict(control);
      if (went) { own.set(client.predicted.tick, control); }
      return went;
    };
    client.writeInputs = (view) => {
      const bytes = writeInputs(view);
      if (bytes > 0) { sends.push({ at: Date.now(), through: client.predicted.tick }); }
      return bytes;
    };
    client.confirm = (frame, hash) => {
      confirm(frame, hash);
      const at = Date.now();
      const { tick } = client.confirmed;
      const [first, second] = client.confirmed.riders;
      placed.push({ at, riding: [first.mode === "riding", second.mode === "riding"], tick, x: [first.x, second.x] });
      const sent = own.get(tick);
      own.delete(tick);
      if (sent !== undefined && Math.floor(sent / BUTTONS_PLACE) > 0 && frame.controls.get(me) !== sent) {
        lostButtons.push({ at, tick });
      }
      for (const event of client.confirmed.events) {
        if (event.kind === "hit" && event.rider <= 1 && event.target <= 1) {
          hits.push({ at, attack: event.attack, rider: event.rider, target: event.target, tick });
        }
        if ((event.kind === "crash" || event.kind === "knockedDown") && event.rider <= 1) {
          falls.push({ at, by: event.by, cause: event.kind === "crash" ? event.cause : "knockedDown", rider: event.rider, s: client.confirmed.riders[event.rider].s, tick });
        }
      }
      [0, 1].forEach((index) => {
        const { attack } = client.confirmed.riders[index];
        if (attack !== "none" && attack !== was[index]) {
          attacks.push({ at, attack, rider: index, tick });
        }
        was[index] = attack;
      });
    };
  };
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
    return { attack: r.attack, attackTicks: r.attackTicks, hitStun: r.hitStun, lastHitBy: r.lastHitBy, lastHitTick: r.lastHitTick, mode: r.mode, s: r.s, speed: r.speed, stamina: r.stamina, x: r.x };
  };
  const sample = () => {
    const room = globalThis.__rushlineRoom;
    const cast = globalThis.__rushlineCast;
    if (room && cast) {
      const { client } = room;
      const humans = [0, 1];
      watchFigures(cast);
      watchClient(client, room.me);
      frames.push({
        at: Date.now(),
        confirmed: humans.map((i) => rider(client.confirmed, i)),
        drawn: humans.map((i) => ({ flinch: stances[i] ? stances[i].flinch : 0, pose: stances[i] ? stances[i].pose : "seated", reach: stances[i] ? stances[i].reach : 0, blend: cast[i].drawn.blend, fromTick: cast[i].drawn.fromTick, toTick: cast[i].drawn.toTick, x: cast[i].drawn.x })),
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
  `(() => { const p = globalThis.__fightProbe; const after = (list) => list.filter((f) => f.at >= ${since}); return { attacks: after(p.attacks), falls: after(p.falls), frames: after(p.frames), hits: after(p.hits), lostButtons: after(p.lostButtons), placed: after(p.placed), presses: after(p.presses), sends: after(p.sends) }; })()`;

export const FIGHT_PILOT = `(() => {
  if (globalThis.__fightPilot) { return "kept"; }
  const held = new Set();
  addEventListener("blur", () => { held.clear(); });
  const hold = (code, down) => {
    if (down === held.has(code)) { return; }
    if (down) { held.add(code); } else { held.delete(code); }
    dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { bubbles: true, code, key: code }));
  };
  const WEAVE_MS = 2400;
  const WEAVE_METRES = 0.3;
  const pilot = { armed: null, laneX: null };
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
      if (pilot.laneX === null && riding) { pilot.laneX = me.x; }
      let toward = 0;
      if (riding && mine === 0) {
        const gap = Math.abs(them.x - me.x);
        const away = gap < 1.2 ? -1 : 0;
        toward = (gap > 2 ? 1 : away) * Math.sign(them.x - me.x);
      } else if (riding) {
        const side = Math.floor(performance.now() / WEAVE_MS) % 2 === 0 ? 1 : -1;
        const off = me.x - (pilot.laneX + side * WEAVE_METRES);
        toward = Math.abs(off) > 0.15 ? -Math.sign(off) : 0;
      }
      hold("ArrowRight", toward > 0);
      hold("ArrowLeft", toward < 0);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return "installed";
})()`;
