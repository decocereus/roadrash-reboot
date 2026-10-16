# Career

A career starts with $1,500 and a Halden Wren 400 in the Lowside. Three intro cards from Vic lead to the clubhouse, where the player sees the board, a rival at the bar, their cash and record, and a menu to the garage and the route board. A career race pays a prize by place, charges repairs or fines, qualifies the road, and can level the player up. The garage buys and sells bikes. Everything is saved in the browser and survives a reload.

## Sub-features

- `career-new` starts a career from the title and shows the three intro cards.
- `clubhouse` shows the board, the rival at the bar, the record, and the Clubhouse menu with the next road named.
- `career-race` runs a race on the next open road at the career's level.
- `settlement` shows Results with the ledger (prize, repairs, fines, cash) and saves the new cash, record, and qualification.
- `garage-buy` buys a bike the player can afford with the trade-in.
- `garage-sell` sells the ridden bike for its trade-in and puts the player on the Gutter Pup 250.
- `save-reload` keeps the career across a reload, and Continue career returns to the clubhouse.
- `reload-mid-race` charges a race left by reloading as a wreck at the full repair bill.

## How to get to it (user POV)

- Title: Career (no save), Continue career (a save), or New career, which asks before erasing.
- Clubhouse: Route board to race, Garage to trade, Title to leave.
- After a race: Finish banner, Continue, Results, Continue back to the clubhouse (or Level up first).

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes on a slot started with a fresh profile, so `rv js --run <run> 'localStorage.getItem("rushline.career")'` prints `null`.
- To finish races quickly, the page is opened with `?autopilot&at=8000`, which puts the player 450-1,250 m from the end of any level-1 road. Say so in the report.

- **New career.** Run `rv open --run <run> "/?autopilot&at=8000" --until title` and `rv click --run <run> Career --within "Title menu"`. `rv aria --run <run> intro` shows the heading `THE LOWSIDE`, the card counter `1 / 3`, and `menu "Introduction"` with `NEXT` focused.
- **Intro cards.** Run `rv click --run <run> Next --within Introduction` twice, then `rv click --run <run> "To the Lowside" --within Introduction`. The save now holds `cash: 1500`: `rv js --run <run> 'JSON.parse(localStorage.getItem("rushline.career")).cash'`.
- **Clubhouse.** Run `rv aria --run <run> clubhouse`. `menu "Clubhouse"` shows `TITLE`, `GARAGE`, a disabled `BACK ROOM SOON`, and `ROUTE BOARD Next: Breakwater Run` focused.
- **Career race.** Run `rv click --run <run> "Route board" --within Clubhouse`, `rv click --run <run> Race --within "Route board"`, `rv click --run <run> Start --within "Pre-race"`, then `rv wait --run <run> 'document.querySelector("[role=menu][aria-label=Finish]") !== null' --timeout 120` and `rv shot --run <run> career-finish`. The banner shows 1ST.
- **Settlement.** Run `rv click --run <run> Continue --within Finish` and `rv aria --run <run> results`. The ledger lists `PRIZE, 1ST`, `REPAIRS`, `FINES`, `CASH`, and `menu "Results"` offers `RACE AGAIN Repeat run: half pay` and `CONTINUE`. Then confirm the save: `rv js --run <run> '(() => { const c = JSON.parse(localStorage.getItem("rushline.career")); return { cash: c.cash, record: c.record, qualified: c.qualified[1] }; })()'` prints `cash: 3000`, `wins: 1`, and `breakwater-run: 1`.
- **Garage, sell.** Run `rv click --run <run> Continue --within Results`, `rv click --run <run> Garage --within Clubhouse`, `rv click --run <run> Sell --within Garage`, `rv click --run <run> "Sell it" --within Sell`. The save reads `cash: 4800, bikeId: "gutter-pup-250"`.
- **Garage, buy.** After the sale, `rv click --run <run> "Halden Kite 500" --within Catalogue` then `rv click --run <run> Buy --within Garage`. With $4,800 against a $5,000 bike, Buy stays disabled and `rv click` reports `buy is disabled`. Win a second race first to afford it, then confirm with `rv click --run <run> "Do it" --within Buy` and read `bikeId` from the save.
- **Reload.** Run `rv open --run <run> / --until title` and `rv aria --run <run> title-with-save`. The first item reads `CONTINUE CAREER Level 1 · $...` with the saved cash and bike.
- **Reload mid-race.** Start a career race from the clubhouse, then `rv wait --run <run> 'JSON.parse(localStorage.getItem("rushline.career")).activeRace' --timeout 15` (the race is recorded at the green light), then `rv open --run <run> / --until title`. As soon as the title loads, the save has `activeRace: null`, `record.wrecks` one higher, cash lower by the full repair bill ($400 for the Wren at level 1), and a `leftRace` note on `board`; the title reads `CONTINUE CAREER Level 1 · $1,100 · Halden Wren 400` in a fresh career.

## Gotchas

- `?at` applies to every race the page starts. Open the page without it to race a career road from the start.
- The first career road is chosen by the career (Breakwater Run in a fresh save); the route board opens on it.
- `garage` in the save lists every bike the player has owned, including one they sold; read `bikeId` for the bike they ride.
- A repeat win on a qualified road pays half; `RACE AGAIN` says so.
- The save is per origin. Each slot has its own port and a fresh profile, so careers never leak between runs, and a career from the user's 1351 server is never visible here.
- Reloading during the countdown does not count: the race is recorded at the green light. Reloading after it counts as a wreck, charged on the next load. Do not reload mid-race by accident while verifying something else.
