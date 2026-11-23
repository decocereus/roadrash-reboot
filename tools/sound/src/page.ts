import type { Measure } from "./analysis.ts";
import type { Clip } from "./audition.ts";

const sections = [
  {
    names: [
      "move",
      "press",
      "back",
      "tab",
      "refused",
      "buy",
      "welcome",
      "menuOpen",
      "menuClose",
    ],
    title: "Menus",
  },
  { names: ["walkStep", "runStep"], title: "The bar" },
  {
    names: [
      "crash",
      "hit",
      "weaponHit",
      "swing",
      "whoosh",
      "thump",
      "shift",
      "siren",
    ],
    title: "The race",
  },
  {
    names: [
      "featherweight-idle",
      "featherweight-mid",
      "featherweight-redline",
      "featherweight-sweep",
      "middleweight-idle",
      "middleweight-mid",
      "middleweight-redline",
      "middleweight-sweep",
      "heavyweight-idle",
      "heavyweight-mid",
      "heavyweight-redline",
      "heavyweight-sweep",
    ],
    title: "Engines",
  },
  {
    names: ["muted-first-press", "early-thump-quiet-right", "ride-then-hush"],
    title: "Through the mixer",
  },
] as const;

const labels = new Map<string, string>([
  ["back", "Back or close"],
  ["buy", "Buying a bike"],
  ["crash", "Your crash, then the slide along the road"],
  ["hit", "A fist or boot hit"],
  ["menuClose", "Race menu closes"],
  ["menuOpen", "Race menu opens on Esc"],
  [
    "early-thump-quiet-right",
    "A quiet thump on the right, asked for before it was ready",
  ],
  ["muted-first-press", "A click with Sound Off saved: silence"],
  ["ride-then-hush", "Riding, then the race goes quiet at 0.5 s"],
  ["move", "Hover or focus moves to another button (several takes)"],
  ["press", "Click or confirm"],
  ["refused", "Something you can't do yet"],
  ["runStep", "Running footsteps (six takes)"],
  ["shift", "Gear change click"],
  ["siren", "Police siren"],
  ["swing", "A swing that misses"],
  ["tab", "Changing tab"],
  ["thump", "Bump, landing or knock"],
  ["walkStep", "Walking footsteps (six takes)"],
  ["weaponHit", "A weapon hit"],
  ["welcome", "Accepting the first-visit card"],
  ["whoosh", "Near miss"],
]);

const engineLabel = (name: string): string => {
  const [weight, state] = name.split("-");
  const when =
    state === "sweep"
      ? "revving from idle to redline and back"
      : `held at ${state}`;
  return `${weight} engine, ${when}`;
};

const labelOf = (name: string): string => labels.get(name) ?? engineLabel(name);

const row = (name: string, measures: ReadonlyMap<string, Measure>): string => {
  const found = measures.get(name);
  const facts = found
    ? `${found.seconds.toFixed(2)} s, peak ${found.peakDb.toFixed(1)} dBFS, loudness ${found.rmsDb.toFixed(1)} dBFS, brightness ${Math.round(found.centroid)} Hz`
    : "not rendered";
  return `<li><div><strong>${labelOf(name)}</strong><code>${name}</code></div><audio controls preload="none" src="${name}.wav"></audio><small>${facts}</small></li>`;
};

export const pageOf = (
  clips: readonly Clip[],
  measures: readonly Measure[],
  engine: string
): string => {
  const known = new Map(measures.map((each) => [each.name, each]));
  const rendered = new Set(clips.map((clip) => clip.name));
  const body = sections
    .map(
      (section) =>
        `<section><h2>${section.title}</h2><ul>${section.names
          .filter((name) => rendered.has(name))
          .map((name) => row(name, known))
          .join("")}</ul></section>`
    )
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sound audition</title>
<style>
:root{--ink:#f2efe6;--dim:#a49f92;--bg:#111014;--card:#1c1a21;--line:#2d2a33;--accent:#f5d90a}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 8px;color:var(--accent)}
p{color:var(--dim);margin:0 0 8px}
ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
li{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:grid;gap:6px}
li div{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
code{color:var(--dim);font-size:13px}small{color:var(--dim)}audio{width:100%}
</style></head><body><main>
<h1>Sound audition</h1>
<p>Every sound is made in code, so it costs no download. Rendered in ${engine} at 48 kHz, before the game's volume control.</p>
${body}
</main></body></html>
`;
};
