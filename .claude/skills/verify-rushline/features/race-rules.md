# Race rules

The server decides how many racers a race seats and whether the celebrities ride. A fresh game seats ten racers, the player and nine rivals. The tier table in `packages/sim/src/difficulty.ts` sets traffic, convoys, hazards, hit damage, police, pacing and rival skill for each of the three tiers. Qualifying two roads at tier 3 opens the Long Ridge finale, and no career moves past tier 3. The player never sees a setting for any of it. If the rules cannot be read, the Back Room says "Could not start the game:" and why.

## Sub-features

- `rules-route` answers `GET /api/race-rules` with the rules as JSON, uncached.
- `ten-racers` lists ten racers on the ride-out grid and on the race sheet, which draws ten ruled lines.
- `tier-stock` stocks four bikes at tier 1, adds three at tier 2 and two at tier 3, and Vic's tier-3 promotion line names the Ridge.
- `three-tiers` offers tiers 1 to 3 in a single race for a tier-3 career, and opens the Long Ridge after two tier-3 roads.
- `tier-conditions` shows more cops, more traffic, a slow convoy and more hazards as the tier rises, on the same road.
- `tier-refusal` refuses a save from tier 4 and names `tier` in the Back Room.

## How to get to it (user POV)

- Load the site. The rules are read before the bar appears.
- Ride any race from the Clubhouse or the route board to see the grid.
- Qualify every road at tiers 1 and 2 to reach tier 3, then two roads at tier 3 to open the Long Ridge.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes on a slot started with a fresh profile.
- The slot's port, printed by `rv up`, is `<port>` below.

- **Rules route.** Run `curl -si http://127.0.0.1:<port>/api/race-rules`. The answer is `200` with `cache-control: no-store` and the body `{"celebrities":true,"fieldSize":10}`. `pnpm exec vitest run apps/web/test/race-rules.test.ts` proves the same answer decodes with `RaceRulesSchema`.
- **Ten racers.** Run `rv open --run <run> "/?autopilot&at=8000" --until bar`, then `rv click --run <run> Ride --within Clubhouse` and `rv shot --run <run> ride-out-grid`. The ride-out card lists nine rivals and `YOU` last, and the HUD place reads `/10`. After the finish, Results' race sheet draws ten ruled lines and fills them with ten prizes, $5,000 for 1st down to $100 for 10th.
- **Three tiers.** With the bar open, run `rv js --run <run> '(() => { const c = JSON.parse(localStorage.getItem("rushline.career")); const all = { "breakwater-run": 3, "slag-row": 3, "ridge-road": 3 }; const two = { "breakwater-run": 3, "slag-row": 3 }; c.tier = 3; c.qualified = { ...c.qualified, 1: all, 2: all, 3: two }; localStorage.setItem("rushline.career", JSON.stringify(c)); return c.tier; })()'`, then `rv open --run <run> / --until bar`. The status strip reads `TIER 3` and `ROADS 2 / 3 QUALIFIED`, the flyer offers Ridge Road as the next race, and with nothing else on the board Vic's note reads `The Ridge is last. She'll be waiting.` In the Back Room, Single race offers `Tier` 1 to 3 and no higher.
- **Garage stock and the tier-3 card.** Build saves with the career package (`seasonsOf`/`playAll` then `serialiseCareer`) and load one with `rv js --run <run> "localStorage.setItem('rushline.career', JSON.stringify(<save>))"`, then `rv open --run <run> "/?autopilot&at=8000" --until bar`. In the Garage, `rv aria` shows the `Catalogue` menu. At tier 1 the Pup, Wren, Kite and Sesta carry prices, the Sette, Stoker and Meridian read `TIER 2`, and the Anvil and Nera `TIER 3`. At tier 2 only the Anvil and Nera read `TIER 3`, and at tier 3 every bike has a price. From a tier-2 save with two roads qualified, ride the third and Continue past Results. Vic's bubble reads `Everyone's armed now. Try to keep up. One more round. The Ridge is last. She'll be waiting.` and the wall note `Tier 3. 3 cops. 1st pays $23,000. New at the garage: Brack Anvil 1100, Ostra Nera 1000.`
- **Tier conditions.** Run `rv open --run <run> "/?ride=slag-row&tier=1&prof" --until race` and the same with `tier=3`. The road and its length do not change. Tier 3 shows five cops against one, more cars, and two groups of six slow cars filling the same-way lanes.
- **Tier refusal.** Run the same `rv js` with `c.tier = 4`, then `rv open --run <run> /` and `rv wait --run <run> 'document.querySelector("[role=menu][aria-label=\"Back room\"]") !== null' --timeout 30`. The Back Room's pink note reads `The save holds a value the game does not have (tier).` and the menu offers `START OVER`.

## Gotchas

- `?stress` and the replay fixtures use the recorded rules, fifteen racers and no celebrities, so a stress race shows fifteen.
- The race sheet draws one ruled line per racer and never fewer than eight, the lines its paper art holds, so a race with fifteen racers shows fifteen and a served race ten.
- The rules are read once per page load. After editing `apps/web/src/server/race-rules.ts`, reload the page.
- The tier-refusal recipe leaves a save the game will not load. Start over from the Back Room, or clear `rushline.career`, before the next recipe.
