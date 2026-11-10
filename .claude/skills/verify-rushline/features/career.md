# Career

A career starts with $1,500 and a Halden Wren 400 in the Lowside. The game opens in the walkable bar on the Race tab. Ride solo shows the career line, the tier and the cash, and Ride races the next open road. A career race pays a prize by place, charges repairs or fines, qualifies the road, and can tier the player up. The Garage tab buys and sells bikes. Everything is saved in the browser and survives a reload.

## Sub-features

- `career-new` starts a career on the first load, or from New career in Settings or on Ride solo when the career is over.
- `ride-solo` shows `Career. Tier <n>. $<cash> in your pocket.` and Ride with `Next up, <road>.`, the first open road the career has not qualified.
- `career-race` runs a race on the next open road at the career's tier. Its pause menu has no Restart race, and Quit race asks Quit and pay.
- `settlement` shows Results with the ledger (prize, repairs, fines, cash) and saves the new cash, record, and qualification.
- `garage-buy` buys a bike the player can afford with the trade-in.
- `garage-sell` sells the ridden bike for its trade-in and puts the player on the Gutter Pup 250.
- `celebrities` rides the six parody riders as home riders on Slag Row, Ridge Road and Breakwater Run: named on the grid card and the results.
- `debt`: a bill the cash cannot cover leaves the player owing, shown as negative cash on Ride solo and in Results. Prize money pays it first, the garage will not sell until it is paid, and past the bike's credit limit the bike is taken and the player rides the Gutter Pup 250.
- `game-over`: a debt past the Gutter Pup's limit ends the career on the game over screen with the record.
- `ending`: the Long Ridge finale ends the career on an ending screen: Clean Crown or Runner-up.
- `rider-load-failure` keeps the player on the ride-out card with Retry and Back when a race's riders do not load.
- `save-reload` keeps the career across a reload, and Ride solo reads the saved tier and cash.
- `reload-mid-race` charges a race left by reloading as a wreck at the full repair bill.
- `save-refused` shows the unsaved banner when the browser refuses a write, also when the refused write is the charge for a race left by reloading. Results after a refused settlement reads `Settled, not saved` at the foot instead of `Settled and saved`.

## How to get to it (user POV)

- Load the site: the bar on the Race tab. Ride solo, then Ride, races the next open road. Settings has New career, which asks before erasing.
- The Garage tab trades bikes; Back or Escape returns to the bar.
- After a race: Finish banner, Continue (or wait 5 seconds), Results, Continue back to the bar.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes on a slot started with a fresh profile, so `rv js --run <run> 'localStorage.getItem("rushline.career")'` prints `null`.
- To finish races quickly, the page is opened with `?autopilot&at=8000`, which puts the player 450-1,250 m from the end of any road. Say so in the report.

- **New career.** Run `rv open --run <run> "/?autopilot&at=8000" --until bar`. The save holds `cash: 1500`: `rv js --run <run> 'JSON.parse(localStorage.getItem("rushline.career")).cash'`.
- **Ride solo.** Run `rv click --run <run> "Ride solo" --within Race` and `rv aria --run <run> ride-solo`. `region "Ride solo"` reads `Career. Tier 1. $1,500 in your pocket.` and `button "Ride Next up, Breakwater Run."`.
- **Career race.** Run `rv click --run <run> Ride --within "Ride solo"` (the ride-out card shows for about 2 seconds and has no button, then the race starts), then `rv wait --run <run> 'document.querySelector("[role=menu][aria-label=Finish]") !== null' --timeout 120` and `rv shot --run <run> career-finish`. The banner shows `WINNER` and 1ST.
- **Settlement.** Run `rv click --run <run> Continue --within Finish` at once, since the banner moves on to Results by itself after 5 seconds, and `rv aria --run <run> results`. Results is the bar: the post-race rival on the stool, the race sheet, a `1ST` stamp over `QUALIFIED, 1 OF 3 ROADS`, and the ledger listing `PRIZE, 1ST` at `+ $5,000`, `REPAIRS`, `FINES`, `CASH`. `menu "Results"` offers `RACE AGAIN FOR HALF PAY` and `CONTINUE`. A quit from Pause (`Quit race`, then `Quit and pay`) lands on Results stamped `QUIT` with Mags on the stool and `REPAIRS − $400`. Then confirm the save: `rv js --run <run> '(() => { const c = JSON.parse(localStorage.getItem("rushline.career")); return { cash: c.cash, record: c.record, qualified: c.qualified[1] }; })()'` prints `cash: 6500` (a tier-1 win pays $5,000), `wins: 1`, and `breakwater-run: 1`. Continue returns to the bar's home panel, whose Ride solo reads `Career, next up Slag Row.`
- **Garage, sell.** Run `rv click --run <run> Continue --within Results`, `rv click --run <run> Garage --within "The bar"`, `rv click --run <run> Sell --within Garage`, `rv click --run <run> "Sell it" --within Sell`. The save reads `cash: 8300, bikeId: "gutter-pup-250"`: the Wren's trade-in is 60% of $3,000.
- **Garage, buy.** After the sale, `rv click --run <run> "Ostra Sette 750" --within Catalogue`. Its row reads `TIER 2` and no confirm opens. Then `rv click --run <run> "Ostra Sesta 600" --within Catalogue`: a bike the player can afford opens the `Buy` confirm on the click. Confirm with `rv click --run <run> "Do it" --within Buy` and read `bikeId` from the save.
- **Celebrities.** Open `/?autopilot&prof` on a fresh profile, `rv click --run <run> "Ride solo" --within Race`, `rv click --run <run> "Slag Row" --within "Ride solo"` and `rv click --run <run> Race --within "Ride solo"`: the grid card lists Captain Penaldo and Supreme Leader M'Bossé. Nothing names them during the race. `rv wait` for the Finish menu as above, `rv click --run <run> Continue --within Finish`: the race sheet lists both by their whole names. `performance.getEntriesByType("resource")` shows eleven `.glb` entries, nine at boot and two for the race. Every career road has two home celebrities.
- **Rider load failure.** On Ride solo with Ridge Road picked, run `rv throttle --run <run> --network offline`, then `rv click --run <run> Race --within "Ride solo"`. The card shows `The riders did not load.` with Retry focused and Back, the speed meter is absent, and the save has no `activeRace`. `rv click --run <run> Back` returns to Ride solo. Ride again for the same card, then `rv throttle --run <run> --network off` and `rv click --run <run> Retry`: the race starts on Ridge Road.
- **Save from an older version.** Set `version` to any value other than 6 in `localStorage["rushline.career"]` and `rv open --run <run> /`: Ride solo says `The save is from another version of the game` and offers Start over, which keeps the old text under the backup key.
- **Reload.** Run `rv open --run <run> / --until bar` and open Ride solo. Its career line reads the saved tier and cash.
- **Reload mid-race.** Start a career race from Ride solo, then `rv wait --run <run> 'JSON.parse(localStorage.getItem("rushline.career")).activeRace' --timeout 15` (the race is recorded at the green light), then `rv open --run <run> / --until bar`. As soon as the bar loads, the save has `activeRace: null`, `record.wrecks` one higher, cash lower by the full repair bill ($400 for the Wren at tier 1), and a `leftRace` note on `board`; Ride solo reads `$1,100 in your pocket.` in a fresh career.
- **Save refused during a load.** Start a career race as in Reload mid-race, then fill the storage so the charge cannot be written: `rv js --run <run> '(() => { let filler = ""; for (let size = 1 << 22; size >= 1; size >>= 1) { const chunk = "x".repeat(size); try { localStorage.setItem("rushline.filler", filler + chunk); filler += chunk; } catch {} } return filler.length; })()'`. Run `rv open --run <run> / --until bar`. Ride solo reads `$1,100 in your pocket.`, the banner reads `The browser refused the save. Progress will be lost when you leave.`, and the save still has `activeRace` and `cash: 1500`. Run `rv js --run <run> 'localStorage.removeItem("rushline.filler")'` and `rv open` again: the banner is gone, and the save has `activeRace: null` and `cash: 1100`.

## Gotchas

- `?at` applies to every race the page starts. Open the page without it to race a career road from the start.
- The next career road is chosen by the career (Breakwater Run in a fresh save); Ride always races it.
- `garage` in the save lists every bike the player has owned, including one they sold; read `bikeId` for the bike they ride.
- A repeat win on a qualified road pays half; `RACE AGAIN FOR HALF PAY` says so.
- Celebrities need `/api/race-rules`. If the rules fail to load, Ride solo shows `Could not start the game` with Try again.
- The save is per origin. Each slot has its own port and a fresh profile, so careers never leak between runs, and a career from the user's 1351 server is never visible here.
- Reloading during the countdown does not count: the race is recorded at the green light. Reloading after it counts as a wreck, charged on the next load. Do not reload mid-race by accident while verifying something else.
