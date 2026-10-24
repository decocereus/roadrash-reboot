# Race rules

The server decides how many racers a race seats, how many levels a career has, and how many police ride each level. A fresh game seats ten racers, the player and nine rivals, and a career has three levels. Qualifying four roads at level 3 opens the Long Ridge finale, and no career moves past level 3. The player never sees a setting for any of it. If the rules cannot be read, the Back Room says "Could not start the game:" and why.

## Sub-features

- `rules-route` answers `GET /api/race-rules` with the rules as JSON, uncached.
- `ten-racers` lists ten racers on the ride-out grid and on the race sheet.
- `three-levels` offers levels 1 to 3 in a single race for a level-3 career, and opens the Long Ridge after four level-3 roads.
- `level-refusal` refuses a save from level 4 or 5 and names `level` in the Back Room.

## How to get to it (user POV)

- Load the site. The rules are read before the bar appears.
- Ride any race from the Clubhouse or the route board to see the grid.
- Qualify every road at levels 1 and 2 to reach level 3, then four roads at level 3 to open the Long Ridge.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes on a slot started with a fresh profile.
- The slot's port, printed by `rv up`, is `<port>` below.

- **Rules route.** Run `curl -si http://127.0.0.1:<port>/api/race-rules`. The answer is `200` with `cache-control: no-store` and the body `{"fieldSize":10,"levelCount":3,"police":{"1":1,"2":2,"3":3,"4":4,"5":5}}`. `pnpm exec vitest run apps/web/test/race-rules.test.ts` proves the same answer decodes with `RaceRulesSchema`.
- **Ten racers.** Run `rv open --run <run> "/?autopilot&at=8000" --until bar`, then `rv click --run <run> Ride --within Clubhouse` and `rv shot --run <run> ride-out-grid`. The ride-out card lists nine rivals and `YOU` last, and the HUD place reads `/10`. After the finish, Results' race sheet fills ten lines with ten prizes.
- **Three levels.** With the bar open, run `rv js --run <run> '(() => { const c = JSON.parse(localStorage.getItem("rushline.career")); const all = { "breakwater-run": 3, "cinder-wash": 3, "hollow-pine-road": 3, "slag-row": 3, "ridge-road": 3 }; const four = { "breakwater-run": 3, "cinder-wash": 3, "hollow-pine-road": 3, "slag-row": 3 }; c.level = 3; c.qualified = { ...c.qualified, 1: all, 2: all, 3: four }; localStorage.setItem("rushline.career", JSON.stringify(c)); return c.level; })()'`, then `rv open --run <run> / --until bar`. The status strip reads `LEVEL 3` and `ROADS 4 / 5 QUALIFIED`, the flyer offers Ridge Road as the next race, and with nothing else on the board Vic's note reads `The Ridge is last. She'll be waiting.` In the Back Room, Single race offers `Level` 1 to 3 and no higher.
- **Level refusal.** Run the same `rv js` with `c.level = 4` and `3: all`, then `rv open --run <run> /` and `rv wait --run <run> 'document.querySelector("[role=menu][aria-label=\"Back room\"]") !== null' --timeout 30`. The Back Room's pink note reads `The save holds a value the game does not have (level).` and the menu offers `START OVER`.

## Gotchas

- `?stress` and the replay fixtures use the recorded rules, fifteen racers and five levels, so a stress race shows fifteen.
- The race sheet keeps fifteen ruled lines whatever the field, so count the filled lines, not the paper.
- The rules are read once per page load. After editing `apps/web/src/server/race-rules.ts`, reload the page.
- The level-refusal recipe leaves a save the game will not load. Start over from the Back Room, or clear `rushline.career`, before the next recipe.
