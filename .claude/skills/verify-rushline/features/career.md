# Career

A career starts with $1,500 and a Halden Wren 400 in the Lowside. The game opens in the bar. On a career with no races yet, Vic says three lines in the speech bubble, one per click, before the road's boss takes the stool. The player sees the standings, the boss of the chosen road at the bar, their cash and record, and the road flyer, which flips through the open roads. A career race pays a prize by place, charges repairs or fines, qualifies the road, and can tier the player up. The garage buys and sells bikes. Everything is saved in the browser and survives a reload.

## Sub-features

- `career-new` starts a career on the first load, or from New career in the back room, with Vic's three lines in the bubble.
- `clubhouse` shows the standings, the road's boss on the stool with their line, the record, and the Clubhouse menu (Ride, Find a race, Race friends, Garage, Back room) with the road picker.
- `road-flip` changes the road with Up/Down, the arrows in the menu strip, or a click on the flyer; the flyer, the boss, and the qualified stamp follow.
- `promotion` after the third road of a tier: Vic's tier line in the bubble and a note with the new police count and prize.
- `career-race` runs a race on the next open road at the career's tier. Its pause menu has no Restart race, and Quit race asks Quit and pay.
- `settlement` shows Results with the ledger (prize, repairs, fines, cash) and saves the new cash, record, and qualification.
- `garage-buy` buys a bike the player can afford with the trade-in.
- `garage-sell` sells the ridden bike for its trade-in and puts the player on the Gutter Pup 250.
- `celebrities` rides the six parody riders as home riders on Slag Row, Ridge Road and Breakwater Run: named on the bar's sticker, the grid card, the results and the standings.
- `envelope`: at tier 2 a wall note reads `An envelope with your name on it.`; its `The envelope` confirm offers Leave it and Take it, and the choice decides the ending.
- `debt`: a bill the cash cannot cover leaves the player owing, shown as a `You owe $...` wall note. Prize money pays it first, the garage will not sell until it is paid, and past the bike's credit limit the bike is taken and the player rides the Gutter Pup 250.
- `game-over`: a debt past the Gutter Pup's limit ends the career on the game over screen with the record.
- `ending`: the Long Ridge finale ends the career on an ending screen: Clean Crown, Bought Crown or Runner-up.
- `rider-load-failure` keeps the player on the ride-out card with Retry and Back when a race's riders do not load.
- `save-reload` keeps the career across a reload, and Continue career returns to the clubhouse.
- `reload-mid-race` charges a race left by reloading as a wreck at the full repair bill.
- `save-refused` shows the unsaved banner when the browser refuses a write, also when the refused write is the charge for a race left by reloading. Results after a refused settlement reads `Settled, not saved` at the foot instead of `Settled and saved`.

## How to get to it (user POV)

- Load the site: the bar. Escape or Back room opens the back room, where New career asks before erasing.
- Clubhouse: Up/Down picks the road, Ride races it, Garage to trade.
- After a race: Finish banner, Continue (or wait 5 seconds), Results, Continue back to the bar.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes on a slot started with a fresh profile, so `rv js --run <run> 'localStorage.getItem("rushline.career")'` prints `null`.
- To finish races quickly, the page is opened with `?autopilot&at=8000`, which puts the player 450-1,250 m from the end of any road. Say so in the report.

- **New career.** Run `rv open --run <run> "/?autopilot&at=8000" --until bar`. The save holds `cash: 1500`: `rv js --run <run> 'JSON.parse(localStorage.getItem("rushline.career")).cash'`. The bubble reads Vic's first line with the tag `1 / 3`.
- **Vic's lines.** Run `rv js --run <run> 'document.querySelector("figure button").click()'` three times. The bubble then holds the boss's line and the tape reads `Boss of Breakwater Run`. Name the boss the tape shows; it is the home rider with the most wins, then points, then skill.
- **Clubhouse.** Run `rv aria --run <run> clubhouse`. `menu "Clubhouse"` shows `RIDE` focused, `FIND A RACE`, `RACE FRIENDS`, `GARAGE`, `BACK ROOM`; the strip names `Breakwater Run`. `rv press --run <run> ArrowDown` flips to the next open road.
- **Career race.** Run `rv click --run <run> Ride --within Clubhouse` (the ride-out card shows for about 2 seconds and has no button, then the race starts), then `rv wait --run <run> 'document.querySelector("[role=menu][aria-label=Finish]") !== null' --timeout 120` and `rv shot --run <run> career-finish`. The banner shows `WINNER` and 1ST.
- **Settlement.** Run `rv click --run <run> Continue --within Finish` at once, since the banner moves on to Results by itself after 5 seconds, and `rv aria --run <run> results`. Results is the bar: the post-race rival on the stool, the race sheet, a `1ST` stamp over `QUALIFIED, 1 OF 3 ROADS`, and the ledger listing `PRIZE, 1ST` at `+ $5,000`, `REPAIRS`, `FINES`, `CASH`. `menu "Results"` offers `RACE AGAIN FOR HALF PAY` and `CONTINUE`. A quit from Pause (`Quit race`, then `Quit and pay`) lands on Results stamped `QUIT` with Mags on the stool and `REPAIRS − $400`. Then confirm the save: `rv js --run <run> '(() => { const c = JSON.parse(localStorage.getItem("rushline.career")); return { cash: c.cash, record: c.record, qualified: c.qualified[1] }; })()'` prints `cash: 6500` (a tier-1 win pays $5,000), `wins: 1`, and `breakwater-run: 1`. Continue returns to the bar with `Next race: Slag Row`.
- **Garage, sell.** Run `rv click --run <run> Continue --within Results`, `rv click --run <run> Garage --within Clubhouse`, `rv click --run <run> Sell --within Garage`, `rv click --run <run> "Sell it" --within Sell`. The save reads `cash: 8300, bikeId: "gutter-pup-250"`: the Wren's trade-in is 60% of $3,000.
- **Garage, buy.** After the sale, `rv click --run <run> "Ostra Sette 750" --within Catalogue`. Its row reads `TIER 2` and no confirm opens. Then `rv click --run <run> "Ostra Sesta 600" --within Catalogue`: a bike the player can afford opens the `Buy` confirm on the click. Confirm with `rv click --run <run> "Do it" --within Buy` and read `bikeId` from the save.
- **Celebrities.** Open `/?autopilot&prof` on a fresh profile, run `rv js --run <run> 'document.querySelector("figure button").click()'` three times, then `rv press --run <run> ArrowDown` until the tape reads `Boss of Slag Row`. The sticker names Captain Penaldo with the bio and the stool is empty. `rv click --run <run> Ride --within Clubhouse`: the grid card lists Captain Penaldo and Supreme Leader M'Bossé. Nothing names them during the race. `rv wait` for the Finish menu as above, `rv click --run <run> Continue --within Finish`: the race sheet lists both by their whole names. `performance.getEntriesByType("resource")` shows eleven `.glb` entries, nine at boot and two for the race. Every career road has two home celebrities.
- **Rider load failure.** At the bar on Ridge Road, run `rv throttle --run <run> --network offline`, then `rv click --run <run> Ride --within Clubhouse`. The card shows `The riders did not load.` with Retry focused and Back, the speed meter is absent, and the save has no `activeRace`. `rv click --run <run> Back` returns to the bar. Ride again for the same card, then `rv throttle --run <run> --network off` and `rv click --run <run> Retry`: the race starts on Ridge Road.
- **Save from an older version.** Set `version` to any value other than 6 in `localStorage["rushline.career"]` and `rv open --run <run> /`: the back room says `The save is from another version of the game` and offers Start over, which keeps the old text under the backup key.
- **Reload.** Run `rv open --run <run> / --until bar`. The status strip shows the saved cash and bike, and Back room's first item reads `BACK TO THE BAR Tier 1, $<cash>, <bike>`.
- **Reload mid-race.** Start a career race from the clubhouse, then `rv wait --run <run> 'JSON.parse(localStorage.getItem("rushline.career")).activeRace' --timeout 15` (the race is recorded at the green light), then `rv open --run <run> / --until bar`. As soon as the bar loads, the save has `activeRace: null`, `record.wrecks` one higher, cash lower by the full repair bill ($400 for the Wren at tier 1), and a `leftRace` note on `board`, which the bar shows as a note; the strip reads `CASH $1,100` in a fresh career.
- **Save refused during a load.** Start a career race as in Reload mid-race, then fill the storage so the charge cannot be written: `rv js --run <run> '(() => { let filler = ""; for (let size = 1 << 22; size >= 1; size >>= 1) { const chunk = "x".repeat(size); try { localStorage.setItem("rushline.filler", filler + chunk); filler += chunk; } catch {} } return filler.length; })()'`. Run `rv open --run <run> / --until bar`. The strip reads `CASH $1,100`, the banner reads `The browser refused the save. Progress will be lost when you leave.`, and the save still has `activeRace` and `cash: 1500`. Run `rv js --run <run> 'localStorage.removeItem("rushline.filler")'` and `rv open` again: the banner is gone, and the save has `activeRace: null` and `cash: 1100`.

## Gotchas

- `?at` applies to every race the page starts. Open the page without it to race a career road from the start.
- The first career road is chosen by the career (Breakwater Run in a fresh save); the bar opens on it.
- Vic's lines are remembered per page load, so a reload before the first race plays them again.
- `garage` in the save lists every bike the player has owned, including one they sold; read `bikeId` for the bike they ride.
- A repeat win on a qualified road pays half; `RACE AGAIN FOR HALF PAY` says so.
- Celebrities need `/api/race-rules`. If the rules fail to load, the game opens on the back room instead of the bar.
- The save is per origin. Each slot has its own port and a fresh profile, so careers never leak between runs, and a career from the user's 1351 server is never visible here.
- Reloading during the countdown does not count: the race is recorded at the green light. Reloading after it counts as a wreck, charged on the next load. Do not reload mid-race by accident while verifying something else.
