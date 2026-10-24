# Career

A career starts with $1,500 and a Halden Wren 400 in the Lowside. The game opens in the bar. On a career with no races yet, Vic says three lines in the speech bubble, one per click, before the road's boss takes the stool. The player sees the standings, the boss of the chosen road at the bar, their cash and record, and the road flyer, which flips through the open roads. A career race pays a prize by place, charges repairs or fines, qualifies the road, and can level the player up. The garage buys and sells bikes. Everything is saved in the browser and survives a reload.

## Sub-features

- `career-new` starts a career on the first load, or from New career in the back room, with Vic's three lines in the bubble.
- `clubhouse` shows the standings, the road's boss on the stool with their line, the record, and the Clubhouse menu (Ride, Garage, Back room) with the road picker.
- `road-flip` changes the road with Up/Down, the arrows in the menu strip, or a click on the flyer; the flyer, the boss, and the qualified stamp follow.
- `promotion` after the fifth road of a level: Vic's level line in the bubble and a note with the new police count and prize.
- `career-race` runs a race on the next open road at the career's level.
- `settlement` shows Results with the ledger (prize, repairs, fines, cash) and saves the new cash, record, and qualification.
- `garage-buy` buys a bike the player can afford with the trade-in.
- `garage-sell` sells the ridden bike for its trade-in and puts the player on the Gutter Pup 250.
- `save-reload` keeps the career across a reload, and Continue career returns to the clubhouse.
- `reload-mid-race` charges a race left by reloading as a wreck at the full repair bill.

## How to get to it (user POV)

- Load the site: the bar. Escape or Back room opens the back room, where New career asks before erasing.
- Clubhouse: Up/Down picks the road, Ride races it, Garage to trade.
- After a race: Finish banner, Continue, Results, Continue back to the bar.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes on a slot started with a fresh profile, so `rv js --run <run> 'localStorage.getItem("rushline.career")'` prints `null`.
- To finish races quickly, the page is opened with `?autopilot&at=8000`, which puts the player 450-1,250 m from the end of any level-1 road. Say so in the report.

- **New career.** Run `rv open --run <run> "/?autopilot&at=8000" --until bar`. The save holds `cash: 1500`: `rv js --run <run> 'JSON.parse(localStorage.getItem("rushline.career")).cash'`. The bubble reads Vic's first line with the tag `1 / 3`.
- **Vic's lines.** Run `rv js --run <run> 'document.querySelector("figure button").click()'` three times. The bubble then holds Ines's line and the tape reads `Boss of Breakwater Run`.
- **Clubhouse.** Run `rv aria --run <run> clubhouse`. `menu "Clubhouse"` shows `RIDE` focused, `GARAGE`, `BACK ROOM`; the strip names `Breakwater Run`. `rv press --run <run> ArrowDown` flips to the next open road.
- **Career race.** Run `rv click --run <run> Ride --within Clubhouse` (the ride-out card shows for about 2 seconds, then the race starts), then `rv wait --run <run> 'document.querySelector("[role=menu][aria-label=Finish]") !== null' --timeout 120` and `rv shot --run <run> career-finish`. The banner shows 1ST.
- **Settlement.** Run `rv click --run <run> Continue --within Finish` and `rv aria --run <run> results`. Results is the bar: the post-race rival on the stool, the race sheet, a `1ST` stamp over `QUALIFIED · 1 / 5 ROADS`, and the ledger listing `PRIZE, 1ST`, `REPAIRS`, `FINES`, `CASH`. `menu "Results"` offers `RACE AGAIN · HALF PAY` and `CONTINUE`. A quit from Pause (`Quit race`, then `Quit and pay`) lands on Results stamped `QUIT` with Mags on the stool and `REPAIRS − $400`. Then confirm the save: `rv js --run <run> '(() => { const c = JSON.parse(localStorage.getItem("rushline.career")); return { cash: c.cash, record: c.record, qualified: c.qualified[1] }; })()'` prints `cash: 4500` (a level-1 win pays $3,000 at three levels), `wins: 1`, and `breakwater-run: 1`.
- **Garage, sell.** Run `rv click --run <run> Continue --within Results`, `rv click --run <run> Garage --within Clubhouse`, `rv click --run <run> Sell --within Garage`, `rv click --run <run> "Sell it" --within Sell`. The save reads `cash: 6300, bikeId: "gutter-pup-250"`.
- **Garage, buy.** After the sale, `rv click --run <run> "Ostra Sesta 600" --within Catalogue` then `rv click --run <run> Buy --within Garage`. With $6,300 against an $8,000 bike, Buy stays disabled and `rv click` reports `buy is disabled`. Pick `Halden Kite 500` instead, `rv click --run <run> Buy --within Garage`, confirm with `rv click --run <run> "Do it" --within Buy`, and read `bikeId` from the save.
- **Reload.** Run `rv open --run <run> / --until bar`. The status strip shows the saved cash and bike, and Back room's first item reads `BACK TO THE BAR Level 1 · $...`.
- **Reload mid-race.** Start a career race from the clubhouse, then `rv wait --run <run> 'JSON.parse(localStorage.getItem("rushline.career")).activeRace' --timeout 15` (the race is recorded at the green light), then `rv open --run <run> / --until bar`. As soon as the bar loads, the save has `activeRace: null`, `record.wrecks` one higher, cash lower by the full repair bill ($400 for the Wren at level 1), and a `leftRace` note on `board`, which the bar shows as a note; the strip reads `CASH $1,100` in a fresh career.

## Gotchas

- `?at` applies to every race the page starts. Open the page without it to race a career road from the start.
- The first career road is chosen by the career (Breakwater Run in a fresh save); the bar opens on it.
- Vic's lines are remembered per page load, so a reload before the first race plays them again.
- `garage` in the save lists every bike the player has owned, including one they sold; read `bikeId` for the bike they ride.
- A repeat win on a qualified road pays half; `RACE AGAIN` says so.
- The save is per origin. Each slot has its own port and a fresh profile, so careers never leak between runs, and a career from the user's 1351 server is never visible here.
- Reloading during the countdown does not count: the race is recorded at the green light. Reloading after it counts as a wreck, charged on the next load. Do not reload mid-race by accident while verifying something else.
