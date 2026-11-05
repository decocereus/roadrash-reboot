// Derives job3 capture from round 4's capture.mjs. Adds the crash, gap and owner commands. Each swap matches once.
import fs from "node:fs";
let text = fs.readFileSync("/var/tmp/rushline-round4/scripts/capture.mjs", "utf8");
const swap = (from, to) => { const parts = text.split(from); if (parts.length !== 2) throw new Error(`matched ${parts.length - 1}: ${from.slice(0, 60)}`); text = parts.join(to); };
swap(`from "./stepper.mjs"`, `from "/var/tmp/rushline-round4/scripts/stepper.mjs"`);
swap(`const ROOT = path.join(OUT, process.env.CAP_ROOT ?? "frames");`, `const ROOT = path.join(OUT, "job3/frames");`);
swap(`fs.appendFileSync(path.join(OUT, "capture.log")`, `fs.appendFileSync(path.join(OUT, "job3/capture.log")`);
swap("fs.writeFileSync(path.join(OUT, `doctor-capture-${Date.now()}.log`), doctor);", "fs.writeFileSync(path.join(OUT, `job3/doctor-${Date.now()}.log`), doctor);");
swap(`const commands = {`, `// Today at rung 5: refuses a run that is not 1536x864 with no MSAA. Landing refuses anything but 1344x756.
const RACE_CANVAS = { landing: [1344, 756], today: [1536, 864] };
const checkRace = async (page, side, where) => {
  const q = await page.js(QUALITY);
  const want = RACE_CANVAS[side];
  const samplesOk = q.quality?.samples === 0;
  say(\`proof \${side} \${where}: \${JSON.stringify(q)}\`);
  if (q.canvas?.[0] !== want[0] || q.canvas?.[1] !== want[1] || !samplesOk) throw new Error(\`WRONG STATE \${side} \${where}: \${JSON.stringify(q)}\`);
};
const raceUrl = (side, url) => (side === "today" ? \`\${url}&rung=5\` : url);
const shotsAt = async (side, label, url, ticks) => {
  const dir = path.join(ROOT, side, label);
  fs.mkdirSync(dir, { recursive: true });
  const consoleFrom = consoleCount();
  URLS.__scene = raceUrl(side, url);
  const page = await steppedPage("__scene", side === "today" ? 1 : ticks[0]);
  await waitFor(page, "!__step.auto", 900_000, 100);
  if (side === "today") await say(\`aspect nudge \${label}: \${await page.js(NUDGE)}\`);
  const rows = [];
  for (const tick of ticks) {
    const got = await runToOrEnd(page, tick);
    await checkRace(page, side, \`\${label} \${tick}\`);
    await png(page, path.join(dir, \`\${name(tick)}.png\`));
    rows.push({ dist: await page.js(hudKm), got, tick, ...(await page.js(QUALITY)) });
    if (got < tick) break;
  }
  await page.js("__glProof.reset()");
  await page.js("__step.one()");
  fs.writeFileSync(path.join(dir, "proof.json"), JSON.stringify(await page.js(proofRead), null, 1));
  fs.writeFileSync(path.join(dir, "ticklog.json"), JSON.stringify(await page.js("__glProof.tickLog")));
  const facts = await page.js(pageFacts);
  fs.writeFileSync(path.join(dir, "facts.json"), JSON.stringify({ ...facts, rows, url: URLS.__scene }, null, 1));
  say(\`\${side}/\${label}: \${rows.length} stills, last \${JSON.stringify({ d: rows.at(-1).dist, g: rows.at(-1).got })} jumps=\${JSON.stringify(facts.step.jumps.slice(0, 5))} stalls=\${facts.step.stalls} client=\${facts.canvas?.client} inner=\${facts.inner} dpr=\${facts.dpr} renderer=\${facts.renderer}\`);
  saveConsole(dir, consoleFrom);
  page.close();
};
// At e6eefae5 a pinned rung with a changed pixel ratio applies the size in applyDeviceStart, so the first resize() returns early and the chase camera keeps aspect 1. Moving the canvas's CSS width and back makes the game's own ResizeObserver run chase.resize. Sim state is untouched.
const NUDGE = \`(async () => { const c = document.querySelector("canvas"); const was = c.style.width; c.style.width = "1800px"; await new Promise((r) => setTimeout(r, 400)); c.style.width = was; await new Promise((r) => setTimeout(r, 400)); return JSON.stringify([c.clientWidth, c.clientHeight, c.width, c.height]); })()\`;
const WIPEOUT_OFFSETS = [0, 3, 6, 10, 15, 21, 30, 45, 60, 90, 120, 180];
const crashRecipe = async (side, url) => {
  const dir = path.join(ROOT, side, "rock-crash");
  fs.mkdirSync(dir, { recursive: true });
  const consoleFrom = consoleCount();
  URLS.__scene = raceUrl(side, url);
  const page = await steppedPage("__scene", 1);
  await waitFor(page, "!__step.auto", 300_000, 100);
  const seen = 'document.body.innerText.includes("WIPEOUT")';
  let found = null;
  const series = [];
  for (let step = 0; step < 900; step += 1) {
    const tick = await page.js("__step.one()");
    const speed = await page.js('Number(document.querySelector("[role=meter][aria-label=Speed]")?.getAttribute("aria-valuenow"))');
    if (step % 15 === 0) series.push([tick, speed]);
    if (await page.js(seen)) { found = tick; break; }
  }
  say(\`rock-crash: WIPEOUT first at tick \${found}; speeds \${JSON.stringify(series.slice(-12))}\`);
  if (found === null) { page.close(); return; }
  await checkRace(page, side, "rock-crash");
  const rows = [];
  for (const offset of WIPEOUT_OFFSETS) {
    const got = await runToOrEnd(page, found + offset);
    const file = \`w\${String(offset).padStart(3, "0")}-t\${String(got).padStart(5, "0")}.png\`;
    await png(page, path.join(dir, file));
    rows.push({ file, got });
  }
  fs.writeFileSync(path.join(dir, "ticklog.json"), JSON.stringify(await page.js("__glProof.tickLog")));
  fs.writeFileSync(path.join(dir, "facts.json"), JSON.stringify({ ...(await page.js(pageFacts)), found, rows, url: URLS.__scene }, null, 1));
  saveConsole(dir, consoleFrom);
  page.close();
};
const JOB3 = JSON.parse(process.env.JOB3 ?? "{}");
const commands = {
  async job3() {
    const [side] = rest;
    if (JOB3.realtime) {
      rv("open", "--run", run, "/kit", "--timeout", "60");
      rv("js", "--run", run, \`(localStorage.setItem("rushline.settings.v1", \${JSON.stringify(JSON.stringify({ frameRate: "60" }))}), 1)\`);
      await sleep(500);
      rv("open", "--run", run, "/?stress", "--until", "race", "--timeout", "120");
      const page = await Page.open(port);
      await page.send("Page.enable");
      await waitFor(page, \`(globalThis.__rushlineProfile?.info().tick ?? 0) >= \${JOB3.realtime}\`, 120_000, 100);
      const dir = path.join(ROOT, side, "realtime");
      fs.mkdirSync(dir, { recursive: true });
      const q = await page.js(QUALITY);
      const tick = await page.js("__rushlineProfile.info().tick");
      await png(page, path.join(dir, \`t\${String(tick).padStart(5, "0")}.png\`));
      say(\`realtime \${side}: tick \${tick} \${JSON.stringify(q)} \${JSON.stringify(await page.js(pageFacts.replace(/step: \\{[^}]*\\},/u, "")))}\`);
      page.close();
    }
    if (JOB3.breakwater) await shotsAt(side, "breakwater", "/?ride=breakwater-run&tier=3&autopilot&prof", JOB3.breakwater);
    if (JOB3.crash) await crashRecipe(side, "/?ride=slag-row&hazard=hazard-7&before=40&kmh=215&straight&clear&prof");
    if (JOB3.stress) await shotsAt(side, "stress", "/?stress", JOB3.stress);
    for (const scene of JOB3.bar ?? []) await barScene(path.join(ROOT, side, \`bar-\${scene}\`), BAR_SCENES[scene]);
  },`);
swap(`  "door-dusk": { camera: "angled", door: 120, ticks: [120, 240, 420, 660, 900], time: "dusk" },`, `  "door-dusk": { camera: "angled", door: 120, ticks: [120, 420, 660], time: "dusk" },`);
swap(`  "door-night": { camera: "angled", door: 120, ticks: [120, 240, 420, 660, 900], time: "night" },`, `  "door-night": { camera: "angled", door: 120, ticks: [120, 420, 660], time: "night" },`);
fs.writeFileSync("/var/tmp/rushline-round4/job3/capture.mjs", text);
