# Race rules

The server decides how many racers a race seats, whether the celebrities ride, and which rivals' bikes match the player's. A fresh game seats ten racers, the player and nine rivals. The tier table in `packages/sim/src/difficulty.ts` sets traffic, convoys, hazards, hit damage, police, pacing and rival skill for each of the three tiers. Qualifying two roads at tier 3 opens the Long Ridge finale, and no career moves past tier 3. The player never sees a setting for any of it. If the rules cannot be read, or take more than 10 seconds, the home panel says "Could not start the game:" and why, Ride solo offers only `Try again` and Back, which reloads the page.

## Sub-features

- `rules-route` answers `GET /api/race-rules` with the rules as JSON, uncached.
- `ten-racers` puts nine rivals in the stakes line on Ride solo and ten riders on Results.
- `tier-stock` stocks four bikes at tier 1, adds three at tier 2 and two at tier 3.
- `three-tiers` offers tiers 1 to 3 in a single race for a tier-3 career, and opens the Long Ridge after two tier-3 roads.
- `tier-conditions` shows more cops, more traffic, a slow convoy and more hazards as the tier rises, on the same road.
- `bike-match` puts a tier-1 career rider on the Ostra Sesta 600 against rivals who would ride the Halden Kite 500 on Sestas too. Room races match no bikes.
- `rules-failure` shows `Could not start the game` on the home panel, and Ride solo with only `Try again` and Back, when the rules never answer, and Try again loads the game once they do.
- `tier-refusal` refuses a save from tier 4 and names `tier` on Ride solo.

## How to get to it (user POV)

- Load the site. The rules are read before the bar appears.
- Ride any race from Ride solo to see the grid.
- Qualify every road at tiers 1 and 2 to reach tier 3, then two roads at tier 3 to open the Long Ridge.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes on a slot started with a fresh profile.
- The slot's port, printed by `rv up`, is `<port>` below.

- **Rules route.** Run `curl -si http://127.0.0.1:<port>/api/race-rules`. The answer is `200` with `cache-control: no-store` and the body `{"bikeMatches":[{"from":"halden-kite-500","tier":1,"to":"ostra-sesta-600"}],"celebrities":true,"fieldSize":10}`. `pnpm exec vitest run apps/web/test/race-rules.test.ts` proves the same answer decodes with `RaceRulesSchema`.
- **Ten racers.** Run `rv open --run <run> "/?autopilot&at=8000" --until bar`, then `rv click --run <run> "Ride solo" --within Race`, `rv click --run <run> Ride --within "Ride solo"`. Ride solo's stakes line read `9 rivals` before the click, and the HUD place reads `/10`. After the finish, Results reads `<place> of 10` and `5 more behind you.` under the top five.
- **Three tiers.** With the bar open, run `rv js --run <run> '(() => { const c = JSON.parse(localStorage.getItem("rushline.career")); const all = { "breakwater-run": 3, "slag-row": 3, "ridge-road": 3 }; const two = { "breakwater-run": 3, "slag-row": 3 }; c.tier = 3; c.qualified = { ...c.qualified, 1: all, 2: all, 3: two }; localStorage.setItem("rushline.career", JSON.stringify(c)); return c.tier; })()'`, then `rv open --run <run> / --until bar` and `rv click --run <run> "Ride solo" --within Race`. Ride solo reads `Career. Tier 3.` and Ride reads `Next up, Ridge Road.`, the finale.
- **Garage stock.** Build saves with the career package (`seasonsOf`/`playAll` then `serialiseCareer`) and load one with `rv js --run <run> "localStorage.setItem('rushline.career', JSON.stringify(<save>))"`, then `rv open --run <run> "/?autopilot&at=8000" --until bar`. On the Garage tab, `rv click --run <run> Catalogue --within Garage` and step through with `rv click --run <run> ">" --within "Bikes on this shelf"`, reading the summary under each heading. At tier 1 the Pup, Wren, Kite and Sesta carry prices, the Sette, Stoker and Meridian read `Tier 2.`, and the Anvil and Nera `Tier 3.` At tier 2 only the Anvil and Nera read `Tier 3.`, and at tier 3 every bike has a price. `For sale` holds only the priced bikes the rider does not ride. From a tier-2 save with two roads qualified, ride the third and Continue past Results: Ride solo reads `Career. Tier 3.`
- **Tier conditions.** Run `rv open --run <run> "/?ride=slag-row&tier=1&prof" --until race` and the same with `tier=3`. The road and its length do not change. Tier 3 shows five cops against one, more cars, and two groups of six slow cars filling the same-way lanes.
- **Bike match.** In a tier-1 career, buy the Ostra Sesta 600 as in [career.md](career.md), then ride a career race. Results' race sheet names each rider's bike: no rival rides a Halden Kite 500, and the rivals who would have ride the Sesta.
- **Tier refusal.** Run the same `rv js` with `c.tier = 4`, then `rv open --run <run> / --until bar` and `rv click --run <run> "Ride solo" --within Race`. Ride solo reads `The save holds a value the game does not have (tier).` and offers `Start over`.
- **Rules failure.** Hold the rules open with the CDP Fetch domain on the page's DevTools socket: `Fetch.enable` with the pattern `*/api/race-rules*` at the `Request` stage, and never continue the paused request. Open `/` on a fresh profile. At 4 s the boot screen still shows `RUSHLINE`. After 10 s the home panel reads `Could not start the game: Getting the race ready took too long. Try again.` and the menu holds one item, `TRY AGAIN`. Send `Fetch.disable`, then click Try again. The page reloads once and the bar opens.

## Gotchas

- `?stress` and the replay fixtures use the recorded rules, fifteen racers and no celebrities, so a stress race shows fifteen.
- The race sheet draws one ruled line per racer and never fewer than eight, the lines its paper art holds, so a race with fifteen racers shows fifteen and a served race ten.
- The rules are read once per page load. After editing `apps/web/src/server/race-rules.ts`, reload the page.
- The tier-refusal recipe leaves a save the game will not load. Start over from Ride solo, or clear `rushline.career`, before the next recipe.
