# Screens

Drafted October 10, 2026. The screen flow and a storyboard of every screen. Rules and numbers come from `game-design.md`; colours and type from `art-direction.md`.

React renders every screen here. The race view is the Three.js canvas with the HUD drawn over it by React at 15 Hz, as today.

## Conventions

- Every screen outside the race is a place or an object in the world: a bar, a corkboard, a garage, a ticket. There is no generic settings page; options live in the Lowside's back room.
- Dark background, one orange heading per screen, yellow for the current selection, warm white for body text, money in green when it comes in and red when it goes out.
- One primary action per screen, bottom right, bound to Enter. Back is bottom left, bound to Escape.
- Keyboard first: arrows or WASD move the selection, Enter confirms, Escape goes back. Everything is also clickable. A gamepad maps the same way.
- Transitions are short: 180 ms cross-fade between menu screens, 300 ms fade to and from the race. The consequence screens (Wrecked, Busted) cut in hard with no fade.
- Text strings below are final copy unless marked as a template. `{braces}` mark values filled from state.
- Only one interface element blinks: the police warning on the HUD. Every other element that changes state changes colour and holds it. Lights in the world, such as a police light bar, are scenery and not covered by this rule.
- "Settlement" is the moment a race's result becomes final, defined in `game-design.md` section 4. No screen after a race shows a number that settlement did not produce.
- The "Single Race menu" is the Route Board opened from the Back Room.

## Flow

Restructured on October 23, 2026. The Lowside bar is the first screen and the hub; the title, the intro cards, the pre-race screen, and the level-up screen were cut, and the route board serves Single Race only.

```
Load (wordmark while the bar's art decodes)
 └─► The Lowside (bar) ◄────────────────────────────────────────┐
      ├─ Ride (road picked on the flyer) ─► Ride-out ─► Race      │
      ├─ Garage                                     │             │
      └─ Back Room                                  ├─ Pause      │
          ├─ Settings                               ▼             │
          ├─ New career                Finish │ Wrecked │ Busted  │
          └─ Single Race ─► Route Board ─► Ride-out ─► Race       │
                              ▲                    ▼              │
                              └──────────────── Results ──────────┤
                                                   ├─ Game Over ─► Back Room
                                                   └─ Ending ──► Back Room
```

A promotion returns to the bar, where Vic says the level's line. A damaged save opens the Back Room.

## 1. Boot and the Back Room

**Boot.** On page load the screen shows the wordmark `RUSHLINE` and `Race. Fight. Pay for it.` while the save is read and the bar's art for the first road decodes, so the bar appears whole. With no save a new career begins and the bar opens. With a save it opens the bar, or Game Over or the ending when the career is over. A damaged save opens the Back Room. A `?ride=` or `?bench=` URL starts that race instead.

**Back Room.** Reached from the bar's menu or Escape, and from Game Over and the ending. Heading `BACK ROOM`. Items: `BACK TO THE BAR` with `Level {level} · ${cash} · {bike}` (or `CAREER OVER` / `See the record`, `SEASON OVER` / `See the ending`), `NEW CAREER`, `SINGLE RACE` with `Any road, no money at stake`, `SETTINGS`. Escape returns to the bar.

- New career confirm, when a save exists: `Start over? Your Level {level} career will be erased.` Buttons `ERASE AND START` / `KEEP IT`.
- Damaged save, in a red-edged panel above the menu (template): `{what is wrong} ({field}).` / `Save error: {kind}. Start over keeps the old save in the browser under a backup key and begins a new career.` The first menu item becomes `START OVER`. What is wrong, by kind: `notJson` reads `The save is not a save file`, `wrongVersion` reads `The save is from another version of the game`, `invalid` reads `The save holds a value the game does not have`, `inconsistent` reads `The save contradicts itself`.
- When the browser will not store the save, every screen carries a red line at the top: `The browser refused the save. Progress will be lost when you leave.`
- Small print: `Arrows to steer · Space to punch · Shift to kick`

The Back Room is drawn plainly for now; its painted room is still to come.

**Interrupted careers.** When the save holds an active-race record, the page was left during a race. Loading the career settles that race as a wreck, once, before any screen is drawn, and then opens the bar with Vic's note on the wall, or Game Over if the bill ended the career.

## 2. Clubhouse

**Purpose.** The hub. Shows where the player stands (cash, level, roads qualified), what the rivals think, and the way to everything else.

**Layout.** A fixed 1672×941 stage, scaled to the window. Left: the bar at dusk turning to night, one rider on the stool with the speech sticker, the wordmark and badge above. Centre: the season standings sheet, two note stickers, a rider's bill, and a sticker. Right: the flyer of the chosen road. Top strip: the player's status. Bottom strip: the navigation and the road picker. `DESIGN.md` describes the plates and slots.

**Text.**

- Heading: `THE LOWSIDE`
- Status: `LEVEL {n} · {level name}` · `ROADS {q} / 5 QUALIFIED` · `CASH ${cash}` (red and prefixed `OWED` when negative) · `{bike name}`
- Level names: `NEW MEAT`, `THE ENVELOPE`, `DEE'S TIP`, `THE BADGE`, `THE LONG RIDGE`
- Board heading: `THE BOARD`
- Board Polaroids: the top three of the season standings, then `YOU` wherever the player ranks, each with its points (`JUNO · 61`). Caption under the player's at level 1: `NEW MEAT`; after level 1: `KID CAN RIDE`.
- Season standings: every settled career race gives 8 points for 1st down to 1 for 8th, and 0 to a rider who was busted, wrecked, or not in that race. Ties go to more wins, then to whoever most recently placed better than the other in a race they shared.
- Board notes (templates, newest first, at most three shown):
  - `{RIVAL} WANTS {THEIR} {WEAPON} BACK.`
  - `{RIVAL} WENT DOWN AT {km} KM ON {ROAD}. ASK {THEM} ABOUT IT.`
  - `{RIVAL} PUT YOU DOWN AT {km} KM ON {ROAD}. EVERYBODY SAW.` (when a rival knocked the player off)
  - `PHOTO FINISH: {WINNER} BY A WHEEL OVER {LOSER}.`
  - `{RIVAL}: BUSTED ON {ROAD}. FINE ${fine}.`
  - `NEW AT THE GARAGE: {bike}.`
  - `ROADBLOCKS START THIS WEEK. RIDE ACCORDINGLY. V.` (when roadblocks ship)
  - `YOU LEFT A RACE. THE BIKE DIDN'T MAKE IT HOME. V.` (after a race settled on reload)
  - `THE GARAGE TOOK THE {bike}. YOU RIDE THE GUTTER PUP NOW. STAY ON IT.` (after a repossession)
- The rider on the stool: the boss of the chosen road, the home rider with the most season wins. Their name and `BOSS OF {road}` (or `HOLDS A GRUDGE` / `ON YOUR SIDE`) sit on yellow tape under the speech sticker, with their taunt, or their grudge taunt when they hold one against the player.
- Vic, before the first race of a career: `You've got $1,500, a Halden Wren, and nobody knows your name.` / `Top three on all five roads and you move up.` / `Don't go broke.`, one line per click on the speech sticker, tagged `{n} / 3`, with the stool empty. Each line plays once per page load.
- Text message line (template): `✉ {Rival}: {message}`. Shown when the story has one for this point.
- Navigation: `RIDE` · `GARAGE` · `BACK ROOM` and, right aligned, the road picker `◄ {road} ►`. It opens on the first unqualified road and steps through the open roads with Up and Down, its arrows, or a click on the flyer. A qualified road's flyer carries the stamp `QUALIFIED {place}`.
- When in debt: a red strip under the status, `YOU OWE ${debt}. PRIZE MONEY PAYS IT FIRST. LIMIT ${limit}.`
- Envelope (level 2 only, once): a manila envelope pinned to the board. Selecting it opens a card: `Breakwater Run. Behind the boy. V.` / `$1,500 inside.` Buttons `TAKE IT` / `LEAVE IT`.

**Buttons.** `RIDE` (primary), `GARAGE`, `BACK ROOM`. The envelope note is selectable. Escape opens the Back Room.

**In.** From boot, Results, Garage, Back Room. Cross-fade.

**Out.** `RIDE` goes to the ride-out card for the chosen road. Also to Garage and Back Room.

**Data.** Career state: cash, level, qualified roads, bike, season points for the ten rivals and the player, rival memory (which rival to seat at the bar and which line), story flags, board notes generated from the last settled race's incidents.

## 3. Route Board

**Purpose.** Single Race only: pick a road, a level, and a bike. Career races pick their road on the bar's flyer. The career parts of this section describe the screen before October 23, 2026.

**Layout.** A corkboard filling the screen. Five postcards pinned at slight angles in a loose row across the middle, each a flat illustration of the region in its palette. The selected card lifts, straightens, and grows. Left column under the heading: the selected road's description. Bottom strip: road facts and the race button. A qualified road has a red rubber stamp across its card.

**Text.**

- Heading: `ROUTE BOARD`
- Sub-heading: `LEVEL {n} · QUALIFY ALL FIVE · TOP 3 COUNTS`
- Card captions: `BREAKWATER RUN` / `Salt Coast`, `CINDER WASH` / `Cinder Flats`, `HOLLOW PINE ROAD` / `Kettle Woods`, `SLAG ROW` / `Lowtown`, `RIDGE ROAD` / `Stonepeak`
- Stamp on a qualified card: `QUALIFIED · {place}` (for example `QUALIFIED · 2ND`)
- Under the description of a qualified road: `ALREADY QUALIFIED. A REPEAT RUN PAYS HALF FOR THE TOP 3 AND NOTHING BELOW. FINES AND REPAIRS ARE FULL PRICE.`
- Lock on the level-5 Ridge Road card until the other four level-5 roads are qualified: `THE LONG RIDGE · QUALIFY THE OTHER FOUR FIRST`. Once open it stays open until the player finishes it in the top three; a quit, wreck, bust, or lower place leaves it open for another try.
- Descriptions:
  - Breakwater Run: `Harbour to pier along the seawall. One long bend by the water, one tunnel, and a kink at the tunnel mouth that nobody sees coming twice.`
  - Cinder Wash: `Dead straight across the dry lake, three washes, the last of which throws you in the air, then a hairpin up the mesa at the end of the fastest straight in the game.`
  - Hollow Pine Road: `Narrow, dark, and never straight for long. The trees are close and the crests hide the bends.`
  - Slag Row: `Two lanes and a lot of nothing, then a right angle. Rail tracks, an underpass, a drawbridge, and more traffic than anywhere else.`
  - Ridge Road: `The home road. Ten bends and two crests on the way up to the lookout.`
- Facts strip: `LENGTH {km} KM` · `TRAFFIC {LIGHT|STEADY|HEAVY}` · `POLICE {n}` · `PRIZE FOR 1ST ${prize}` · `HOME OF {rival} AND {rival}`. On a qualified road the prize shown is the halved one.
- Home riders are the road's two home rivals. The one exception is Ridge Road at level 1, which reads `HOME OF COACH AND RUTH ANN` because Juno does not race at level 1.
- Dee's tip, from level 3, once roadblocks ship: `✉ Dee: roadblock at {km} km.`
- Single Race adds two selectors above the facts strip: `LEVEL ◄ {n} ►` and `BIKE ◄ {bike} ►`. Its sub-heading reads `SINGLE RACE · NO MONEY · NOTHING TO QUALIFY`, and its cards carry no stamps, no lock, no prize, and no repeat-run line.

**Buttons.** `RACE` (primary), `BACK`. Left and right move between cards.

**In.** From the Back Room. The cards drop onto the board one after another, 60 ms apart.

**Out.** `RACE` goes to the ride-out card. `BACK` goes to the Back Room.

**Data.** Level; for each road its plan at this level (length, `trafficPerKilometre`), police count from the level table, qualified flag and best place, home rivals, first roadblock distance if Dee's tip is active. Every road has two lanes, so no lane count is shown. Traffic label: under 6 per km is LIGHT, 6 to 9 STEADY, 10 or more HEAVY.

## 4. Garage

**Purpose.** Buy and sell bikes. Make the trade-off between classes readable without a manual.

**Layout.** The garage next to the Lowside: concrete floor, roller door, one bike on a stand under a work light. The bike is the largest thing on screen and slowly turns. Left column: the catalogue as a list grouped by class. Right column: the selected bike's numbers as bars, with a ghost bar for the bike the player owns. Bottom strip: money and the buy button.

```
+------------------------------------------------------------------------------+
| GARAGE                                              CASH $4,900  TRADE $1,800|
+--------------------+-----------------------------------+---------------------+
| FEATHERWEIGHT      |                                   | HALDEN KITE 500     |
|   Gutter Pup 250   |                                   | FEATHERWEIGHT       |
|   Halden Wren 400 ●|          [ bike, turning ]        |                     |
| ► Halden Kite 500  |                                   | TOP SPEED  170 km/h |
| MIDDLEWEIGHT       |                                   | ▓▓▓▓▓▓▓▓░░░░ ┆      |
|   Ostra Sesta 600  |                                   | LAUNCH     6.0 s    |
|   Ostra Sette 750  |                                   | ▓▓▓▓▓▓▓░░░░░ ┆      |
|   Brack Stoker 800 |                                   | STEERING            |
| HEAVYWEIGHT        |                                   | ▓▓▓▓▓▓▓▓▓░░░   ┆    |
|   Meridian 900   🔒|  "The Wren with more lungs.       | BEND GRIP           |
|   Brack Anvil    🔒|   Still turns before you finish   | ▓▓▓▓▓▓▓▓▓░░░    ┆   |
|   Ostra Nera     🔒|   deciding to."                   | BRAKES              |
|                    |                                   | ▓▓▓▓▓▓▓▓░░░░ ┆      |
+--------------------+-----------------------------------+---------------------+
| PRICE $5,000   YOU HAVE $6,700 WITH TRADE-IN   LEFT AFTER $1,700    ► BUY    |
+------------------------------------------------------------------------------+
```

**Text.**

- Heading: `GARAGE`
- Top right: `CASH ${cash}` · `TRADE ${trade-in}`
- Class headers: `FEATHERWEIGHT`, `MIDDLEWEIGHT`, `HEAVYWEIGHT`
- Class notes, shown when a header is selected:
  - Featherweight: `Light and quick to turn. Bends barely move them. They run out of speed early.`
  - Middleweight: `The all-rounders. Fast enough that some bends need the brakes.`
  - Heavyweight: `Fastest in a straight line. Bends push them wide and they are slow to answer.`
- Owned marker `●` and label `YOURS`. Lock `🔒` with `ARRIVES AT LEVEL {n}`.
- Bars: `TOP SPEED {km/h}`, `LAUNCH {0 to 100 time} s`, `STEERING`, `BEND GRIP`, `BRAKES`. The dotted mark on each bar is the owned bike.
- The pitch line from the catalogue, in quotes, under the bike.
- Bottom strip: `PRICE ${price}` · `YOU HAVE ${cash + trade} WITH TRADE-IN` · `LEFT AFTER ${remainder}`
- When too expensive: `SHORT BY ${amount}` in red, and the buy button is dimmed.
- When in debt: `THE GARAGE DOESN'T SELL TO PEOPLE WHO OWE VIC MONEY. YOU CAN STILL SELL.`
- Buy confirm: `Trade your {owned} for the {new}? You'll have ${remainder} left.` Buttons `DO IT` / `NOT YET`.
- After buying: `It's yours. Try not to bend it.`
- Why the selected bike cannot be bought, beside the price: `Yours.`, `Arrives at level {n}.`, `Short by ${amount}.`, or the debt line above.
- Sell confirm: `Sell the {owned} for ${trade-in}? You'll ride the Gutter Pup and have ${cash + trade}.` Buttons `SELL IT` / `KEEP IT`, with `KEEP IT` selected. The `SELL` button carries the second line `{owned} for ${trade-in}`, or `Nobody wants the Gutter Pup.` when it is dimmed.
- After selling: `Sold. You ride the Gutter Pup now.`
- Repair bill reminder under the bars: `A wreck at Level {n} costs ${repair} on this bike.`

**Buttons.** `BUY` (primary), `SELL`, `BACK`. Up and down move through the catalogue.

**In.** From the Clubhouse. The roller door lifts (the screen wipes upward, 250 ms).

**Out.** `BACK` to the Clubhouse.

The wireframe is the decent player's garage at the start of level 2 (`game-design.md` section 5): $4,900 in cash, a Wren worth $1,800 in trade, and the Kite within reach with $1,700 left over.

**Data.** Catalogue (name, class, price, pitch, `BikeSpec`), unlock level per bike, owned bike, cash, trade-in (60% of the owned bike's price), debt. The bars are computed from the `BikeSpec`: top speed from power and drag; launch from the 0 to 100 km/h time; steering from `steerRate` and `lateralSpeed`; bend grip from `curvePush`, where a larger `curvePush` is a longer bar because the bike is pushed out less; brakes from `brakeDeceleration`. The Gutter Pup is the one Featherweight with a short steering bar.

## 5. Ride-out

**Purpose.** Show who is on the grid while the road loads, then start. It has no buttons.

**Layout.** Left: the road's flyer. Right: `LEVEL {n} · TOP 3 QUALIFIES` (or `SINGLE RACE`), the road name in the stencil face, `{km} KM · {cops} COPS`, the grid as a list of fifteen rows (slot, name, bike and weapon, `HOLDS A GRUDGE` or `ON YOUR SIDE`), `YOU` last on a yellow bar, the rival with the strongest memory and their taunt, and the status `LOADING THE ROAD`, then `RIDE`.

**In.** From the bar's `RIDE`, the route board's `RACE`, or Results' `RACE AGAIN`.

**Out.** The race starts on its own once the road is prepared and the card has shown for 2.2 s. Escape goes back to the bar, or to the route board in Single Race. In a career race the active-race record is written to the save when the countdown ends. From that tick, leaving the page counts as a wreck.

**Grid order.** The player starts in slot 15, at the back, so every race opens with a pack to ride through. Rivals fill slots 1 to 14 in an order drawn from the race seed, across every lane of the road in rows 7 m apart (`game-design.md` section 9).

**The field.** The road's two home riders and five drawn from the rest of the cast. At level 1 Juno is never drawn, and Ridge Road's home riders are Coach and Ruth Ann.

**Data.** The compiled track's name and length, police count, the fourteen drawn rivals and their grid slots, each rider's profile (name, paint, weapon) and bike for this level, memory record (grudge flag, chosen taunt), the player's bike and carried weapon.

## 6. Race HUD

**Purpose.** Tell the player what they need while steering and fighting, and nothing else. The road stays clear: no dashboard, no panel across the bottom.

**Layout.** Four small corner clusters and one floating tag. Everything sits within 12% of the screen edges except the rival tag, which follows the nearest rival.

```
+------------------------------------------------------------------------------+
| 3rd / 15                   ▲ COP 40 m ▲                         2.1 km to go |
|                                                    ├────────●───────────┤    |
|                                                                              |
|                                                                              |
|                         ┌──────────────┐                                     |
|                         │ MOOSE ▓▓▓▓░░ │   (follows the nearest rival)       |
|                         └──────────────┘                                     |
|                               [rival]                                        |
|                                                                              |
|                                        [you]                                 |
|                                                                              |
|  187                    YOU ▓▓▓▓▓▓▓▓░░░░                      CLUB ▮▮▮▮▯▯    |
|  km/h                   BIKE ▓▓▓▓▓▓▓▓▓▓░░                                    |
+------------------------------------------------------------------------------+
```

**Elements.**

| Where | Element | Shows | Sim source |
| --- | --- | --- | --- |
| Top left | Position | `3rd / 15`, large numerals. Turns yellow when it changes, holds for half a second, and returns to white. It does not blink. | `standings` |
| Top centre | Cop warning | Hidden unless a cop is chasing the player. `▲ COP {m} m ▲` in police blue and red, alternating at 2 Hz, with a short siren cue. Under 15 m it reads `COP ON YOU`. This is the only element on the HUD that blinks. | `chase` on police riders, distance to the player |
| Top right | Distance | `{km} km to go` over a thin progress line with a dot for the player and small ticks for the riders ahead. Police roadblocks the player knows about (Dee's tip) show as a blue tick. | `s` over track length |
| Bottom left | Speed | Speed in km/h as large tabular numerals with `km/h` under it. No dial. | `speed` |
| Bottom centre | Player bars | `YOU` stamina bar and, under it, a thinner `BIKE` condition bar. Stamina goes green, yellow under 50, red under 25. The bike bar is warm white, yellow under 50, and red under 25. Both bars change colour and hold it; neither flashes. | `stamina`, `condition` |
| Bottom right | Weapon | Weapon name and one pip per hit left. Shows `FISTS` with no pips when unarmed. | `weapon`, `weaponHits` |
| Floating | Rival tag | Name and stamina bar of the nearest rival within 25 m, placed above their helmet and clamped to the screen. Only one tag at a time. An arrow replaces the tag at the screen edge when that rival is behind: `◄ MOOSE 6 m`. | nearest racer by `s` and `x`, their `stamina` |
| Floating | Speech | A rival's knockdown line for two seconds, attached to their tag. | `crash` event with `by` |
| Centre, brief | Notices | One word or short phrase, 0.8 s, then gone. | events |

**Notice strings.** `WIPEOUT` (crash), `CLOSE` (near miss), `AIR` (landing after more than half a second), `HIT` (your strike lands), `DOWN!` (you knock a rider off), `GOT THE {WEAPON}` (weapon taken), `{WEAPON} BROKE`, `DISARMED` (yours taken), `COP!` (pursuit starts), `RUN!` (off the bike with a cop within 60 m), `LAST KM`.

**Off the bike.** While thrown, running, or mounting, the speed readout dims, and an arrow at the screen edge points to the bike: `◄ BIKE 14 m`. The HUD otherwise stays up; the race continues around the player.

**Rules.**

- Nothing is drawn in the middle 60% of the width between 25% and 80% of the height, except the rival tag, the speech tag, and the brief notice.
- Only the cop warning blinks. Position and the two bars change colour without flashing, and notices appear once and fade.
- At most one rival tag. No rear-view mirror; the edge arrow does that job.
- All numerals are tabular so they do not jitter.
- The HUD scales with the shorter screen side and stays readable at 1280 × 720.

**In.** Fades in during the countdown.

**Out.** On finish, wreck, or bust the HUD fades out over 300 ms, except the position on Finish. The position shown from that tick is the settled place and no longer changes.

## 7. Finish

**Purpose.** Mark the line and let the moment breathe before the numbers.

**Layout.** The race view keeps running; the bike coasts and brakes under the pilot's control. A banner sits in the upper third. The camera swings 30° to the side and slows.

**Text.**

- Banner: `FINISHED`
- Under it: `{place}` in large numerals with its suffix (`1ST`, `2ND`, `3RD`, `4TH`) and one of `QUALIFIED` (yellow) or `NOT THIS TIME` (white).
- For first place the banner reads `WINNER`.
- `BY A WHEEL OVER {RIVAL}` when that rival was riding and 25 m or less behind as the player crossed the line. `{RIVAL} BY A WHEEL` when that rival finished 30 ticks (0.5 s) or less before the player.

**Buttons.** `CONTINUE` appears after 1.5 s. The screen moves on by itself after 5 s.

**In.** Cuts in when the player's `finish` event fires. The race settles at that tick: the place on the banner is final, rivals still on the road are classified where they are, and the result is written to the save before the banner is drawn. Riders who cross the line during the animation are scenery; their places do not change.

**Out.** Fade to Results. Results opens only from here, after the animation, and never before the settlement write. A reload during the animation finds no active-race record and opens the Clubhouse with the result already counted.

**Data.** The settled result: the player's `finishTick` and place, the finish tick of each rider ahead, and the distance behind of each rider still racing at that tick.

## 8. Wrecked

**Purpose.** Show that the bike is finished for this race, and what it costs, before anything else.

**Layout.** Hard cut to a full-screen illustrated panel: the garage floor, the player's bike in pieces in the player's paint, and Mags crouched beside it with a crowbar and a toothpick (she does the repairs). Heading low and left in the stencil face. The bill is a paper invoice pinned bottom right.

**Text.**

- Heading: `WRECKED`
- Mags, one of:
  - `"I can fix it. I can't fix how you ride it."`
  - `"I've seen worse. On fire, mostly."`
  - `"Sweetheart, the front wheel was in a different lane."`
- Invoice: `REPAIR, {bike}` / `LEVEL {n} · {class}` / `${repair}` / `CASH AFTER ${cash}` (or `YOU OWE ${debt}` in red)
- Rewarded ad offer, if available: `WATCH AN AD, PAY HALF: ${half}`
- When the full bill would pass the credit limit: `THIS BILL TAKES THE {bike}.` in red under the invoice, or `THIS BILL ENDS THE CAREER.` on the Gutter Pup. The line is recomputed for the halved bill, so the player can see when the ad saves the bike.

**Buttons.** `PAY UP` (primary). `WATCH AN AD, PAY HALF` when offered. The offer appears once per wreck and only on this screen.

**In.** Hard cut from the race 1.2 s after the wrecking crash, so the player sees the crash land. The race settled at the tick of the `wrecked` event: places, prizes, and rival memory are already final. The screen is not shown for a quit or for a race settled after a reload; both go to the full bill with no offer.

**Out.** Leaving the screen fixes the bill at the full amount or half of it. The debt check then runs on that bill (repossession, then game over), and the result is written to the save in one step. Fade to Results. If the page is closed while this screen is up, the active-race record is still in the save, so the next load charges the full bill once.

**Data.** Bike and class, level, repair bill from the table, cash before and after for both the full and the halved bill, debt and credit limit.

## 9. Busted

**Purpose.** Show the arrest, the officer, and the fine.

**Layout.** Hard cut to a dark blue panel lit from one side by alternating red and blue. Left third: the officer's portrait, chest up. Right two thirds: the heading, the officer's name and line, and below it a ticket torn from a pad with the fine.

**Text.**

- Heading: `BUSTED`
- Officer: the one who patrols the road. `SERGEANT DOLORES PIKE` on Breakwater Run, Cinder Wash, and Ridge Road; `DEPUTY WENDELL HAVERTY` on Slag Row and Hollow Pine Road. One of their three lines from `game-design.md`.
- Ticket: `CITATION` / `{road}, KM {km}` / `RACING ON A PUBLIC ROAD. ALSO, FALLING OFF ON ONE.` / `FINE ${fine}` / `CASH AFTER ${cash}` (or `YOU OWE ${debt}`)
- If the player was carrying a weapon when they were thrown: `ALSO CONFISCATED: ONE {WEAPON}.`
- When the fine passes the credit limit: `THIS FINE TAKES THE {bike}.` in red, or `THIS FINE ENDS THE CAREER.` on the Gutter Pup.

**Buttons.** `PAY THE FINE` (primary). There is no ad offer; fines are never reduced.

**In.** Hard cut 0.8 s after the `busted` event, so the player sees the cop arrive. The race settled at the tick of that event, and the fine, the debt check, and the result were written to the save then.

**Out.** Fade to Results.

**Data.** The arrest record kept by the race runner, because the sim's own state no longer holds it by the time this screen draws: the road; the km, taken from the body's `s` at the `busted` event before the sim moves the rider and bike onto the verge; and the weapon the player held on the tick before the throw that put them on the ground, since a thrown rider drops the weapon at once. Also the `busted` event (cop index, fine), which officer patrols the road, and cash before and after.

## 10. Results

**Purpose.** The reckoning: place, qualification, money in, money out, cash now, and what the rivals made of it.

**Layout.** Heading and outcome across the top. Left: the standings as fifteen rows. Right: the money as a short ledger, and under it one rival's post-race line. Bottom: the ad slot, then the buttons. The ad slot is the only one inside the race loop; the other two placements in the game are the poster on the Clubhouse board and the rewarded repair discount on the Wrecked screen.

```
+------------------------------------------------------------------------------+
| RESULTS · SLAG ROW · LEVEL 2                        2ND · QUALIFIED          |
+------------------------------------------+-----------------------------------+
|  1  DEE      Sesta 600   2:04.3  $2,400  |  PRIZE, 2ND            + $1,600   |
|  2  YOU      Kite 500    2:04.6  $1,600  |  REPAIRS                    $0    |
|  3  JUNO     Sesta 600   + 38 m  $1,120  |  FINES                      $0    |
|  4  LYLE     Kite 500   + 210 m    $640  |  ------------------------------   |
|  5  INES     Sesta 600  + 260 m    $400  |  CASH                    $3,200   |
|  6  COACH    Kite 500   + 540 m    $240  |                                   |
|  7  GUS      Wren 400   + 910 m    $160  |  DEE: "Thirty minutes or less.    |
|  8  MOOSE    Kite 500    BUSTED     $0   |  You took thirty-one."            |
|     ▸ you knocked Moose down at 3.1 km   |                                   |
+------------------------------------------+-----------------------------------+
| [ ad slot ]                                                                  |
+------------------------------------------------------------------------------+
| RACE AGAIN                                                      ► CONTINUE   |
+------------------------------------------------------------------------------+
```

**Text.**

- Heading: `RESULTS · {ROAD} · LEVEL {n}`
- Outcome: `{place} · QUALIFIED`, `{place} · NOT QUALIFIED`, `WRECKED`, or `BUSTED`
- Rows: place, name, bike, result, prize. The result is a time as `m:ss.t` for a rider who had finished by the settlement tick, `+ {m} m` (distance behind the player, or behind the leader on the road if the player did not finish) for a rider still racing at that tick, or `BUSTED`, `WRECKED`, or `LEFT` (multiplayer). Rivals' prizes are shown for flavour and follow the settled places.
- Incident line under a rival's row, at most two on the screen (templates): `you knocked {Rival} down at {km} km` · `{Rival} knocked you down at {km} km` · `you took {Rival}'s {weapon}` · `by a wheel`
- Ledger: `PRIZE, {place}` · `REPAIRS` · `FINES` · `VIC'S ENVELOPE` (only when it applies) · `CASH` (or `OWED`)
- On a road that was already qualified the prize line reads `PRIZE, {place} · REPEAT RUN, HALF PAY` for places 1 to 3 and `REPEAT RUN · NO PAY BELOW 3RD` with `$0` for places 4 to 15.
- After the rewarded ad the repair line reads `REPAIRS · HALF, THANKS TO OUR SPONSOR`.
- Under the ledger when a road qualifies: `{q} / 5 ROADS QUALIFIED`
- Rival line: `{RIVAL}: "{post-race line}"`, from the rival who finished directly ahead of the player, or directly behind if the player won.
- Debt warning: `YOU OWE ${debt}. LIMIT ${limit}. PAST THAT, THE GARAGE TAKES THE BIKE.`
- Repossession notice, when debt passed the bike's credit limit: `THE GARAGE TOOK THE {bike}. IT SOLD FOR ${trade-in}, PAID WHAT YOU OWED, AND LEFT YOU ${cash}. YOU RIDE THE GUTTER PUP NOW. IT CAN'T OUTRUN A COP. STAY ON IT.` If the sale did not cover the debt the middle sentence reads `IT SOLD FOR ${trade-in}. YOU STILL OWE ${debt}.`
- Career over, when the player is on the Pup (before or after a repossession) and still owes more than $750: `YOU OWE ${debt} ON A GUTTER PUP. VIC WANTS A WORD.`

**Buttons.** `CONTINUE` (primary), `RACE AGAIN` (same road, new seed, straight to the ride-out card). `RACE AGAIN` is not shown when the career is over, when this race qualified the fifth road, or when the finale was just finished in the top three. On a road that this race qualified, it carries the small print `REPEAT RUN: HALF PAY`.

**In.** From Finish, Wrecked, or Busted, and from a career quit. Never before the settlement write. The rows count in from fifteenth to first, 80 ms apart; the ledger adds up after them.

**Out.** `CONTINUE` goes to Game Over if the debt check ended the career, to the ending if the player finished the finale in the top three, to the bar with Vic's promotion line if this race qualified the fifth road of levels 1 to 4, and otherwise to the Clubhouse. There is no interstitial ad on the way. A reload on this screen opens the Clubhouse, or Game Over if the career is over, because everything shown here is already in the save.

**Single Race.** No ledger, no prize column, no qualification, and no stamps: the outcome reads `{place}` alone and the right column shows only the rival's line. `CONTINUE` goes back to the Single Race menu and `RACE AGAIN` restarts the same road. Nothing is written to the career.

**Data.** The settled result: places, each rider's finish tick or distance behind at the settlement tick, modes, the prize paid (full, half, or none), the bill, any repossession, cash before and after, qualified count, incidents from the race's events up to the settlement tick, and the post-race line chosen by the memory rules.

## 11. Promotion

**Purpose.** Mark the promotion briefly and say what is new, in the bar.

**In the bar.** After a race that qualifies the fifth road of levels 1 to 4, Continue on Results returns to the bar. The stool is empty and Vic speaks the level's line in the speech sticker until it is clicked:

- Level 2: `Longer roads. Two cops. Bigger purses. The garage got a delivery.`
- Level 3: `Longer again. Three cops, and the new ones are quicker.`
- Level 4: `Four cops. Everyone's armed now. Try to keep up.`
- Level 5: `Five roads left. The Ridge is last. She'll be waiting.`

The first wall note reads `Level {n}. {cops} cops. 1st pays ${prize}.`, with `New at the garage: {bikes}.` when the level unlocks bikes, signed `V.`. The status strip shows the new level name.

**Endings.** After a level-5 Ridge Road race that the player finishes in the top three, this screen is replaced by the ending. A quit, wreck, bust, or lower place in the finale is an ordinary result that returns to the Clubhouse with the finale still open. The ending is the board with the final Polaroids, three lines of text from `game-design.md` section 11 for the ending earned, the season's record (races, wins, knockdowns, busts, money earned), and `BACK ROOM`.

## 12. Game Over

**Purpose.** End the career clearly and without cruelty.

**Layout.** The Lowside car park at night, empty except for the Gutter Pup on a tow hook. Heading in the stencil face. A typed card from Vic. The season record under it.

**Text.**

- Heading: `BROKE`
- Vic's card: `You owe more than a Gutter Pup is worth, which is saying something. We're done. V.`
- Record: `REACHED LEVEL {n}` · `{races} RACES · {wins} WINS` · `KNOCKED DOWN {k} RIDERS` · `BUSTED {b} TIMES` · `BEST BIKE: {bike}`

**Buttons.** `NEW CAREER` (primary), `TITLE`. There is no `RACE AGAIN`, no continue, and no ad offer.

**In.** From Results, slow fade (600 ms). Also straight from the Back Room or a page load whenever the save is marked over.

**Out.** `NEW CAREER` replaces the save and plays the new-career intro. `TITLE` leaves the finished career in the save, where it can only reopen this screen.

**Persistence.** The career is marked over in the same save write that settles the last race, before Results is drawn. Reloading the page on Results or here cannot bring the career back, and no route from a finished career leads to the Route Board, the Garage, or a race.

**Data.** Career totals and the over flag.

## 13. Multiplayer Lobby

**Purpose.** Gather two to eight players, let each pick a bike, and start.

**Layout.** The Lowside car park. Eight parking bays in a row across the middle, each either a player's bike in their paint with their name above it or an AI rival's bike with an `AI` tag. A bay with no player always holds an AI rival, and seven more AI rivals wait beyond the bays, so the grid is always fifteen. Top left: the room code. Left column: the host's race settings. Right column: the local player's bike picker, a compact version of the Garage bars. Bottom strip: ready state.

**Text.**

- Heading: `CAR PARK`
- Room: `ROOM {CODE}` · `COPY INVITE LINK`
- Bays: `{player name}` with `READY` or `PICKING`, or `{Rival} · AI` with the small print `JOIN TO TAKE THIS BAY`
- Host settings: `ROAD ◄ {road} ►` · `LEVEL ◄ {n} ►` · `BIKES ◄ ANY | FEATHERWEIGHT | MIDDLEWEIGHT | HEAVYWEIGHT ►`. There is no setting for AI riders: every race has fifteen riders, and AI rivals fill whatever the players do not.
- Non-hosts see the same settings read-only with `{host} IS PICKING THE ROAD`.
- Bike picker: `YOUR BIKE ◄ {bike} ►` · `PAINT ◄ ► `
- Bottom strip: `{ready} / {players} READY` and, for the host, `START` (enabled when everyone is ready and at least two players are present).
- Start countdown: `STARTING IN 3` `2` `1`
- Connection toasts: `{Name} joined.` · `{Name} left.` · `{Name} lost connection. The bike rides on autopilot.` · `{Name} is back.`
- Errors: `Room not found. Check the code.` · `Room is full.` · `Lost connection to the room. Retrying.`

**Buttons.** `READY` / `NOT READY` (primary for players), `START` (host), `LEAVE`.

**In.** From the bar once it ships, or straight from an invite link.

**Out.** To the race when the Durable Object sends the start message. After Results, back here with the same room.

**Data.** Room state from the Durable Object: players, their bike and paint, ready flags, host, road, level, seed, and which rivals fill the remaining bays.

## 14. Pause

**Purpose.** Stop a single-player race, change volume, or give up.

**Layout.** The race view freezes and dims to 40%. A narrow panel on the left third, styled as a torn piece of the corkboard. The road is still visible on the right.

**Text.**

- Heading: `PAUSED`
- Items: `RESUME` · `RESTART RACE` (Single Race only) · `MUSIC VOLUME` · `EFFECTS VOLUME` · `CONTROLS` · `QUIT RACE`
- Quit confirm in Career: `Quit this race? It counts as a wreck: no prize, and a ${repair} repair bill.` Buttons `QUIT AND PAY` / `KEEP RACING`. When the bill would pass the credit limit, a red line is added: `THIS BILL TAKES THE {bike}.` or `THIS BILL ENDS THE CAREER.`
- Small print under the items in Career: `Leaving or reloading the page during a race counts as a wreck too.`
- Quit confirm in Single Race: `Quit this race?` Buttons `QUIT` / `KEEP RACING`.
- In multiplayer the race does not pause. Escape opens the same panel over the live race with the heading `MENU`, without `RESTART RACE`, and with `LEAVE RACE` in place of `QUIT RACE`: `Leave? Your bike rides on autopilot and you're scored as LEFT.`

**Buttons.** `RESUME` (primary, also Escape).

**In.** Escape during a race. Also when the tab loses focus in single player.

**Out.** `RESUME` returns after a `3 2 1` count so the player can get their hands back. Quitting a career race settles it as a wreck at the tick of the quit and goes straight to Results at the full bill, with no Wrecked screen and no ad offer. Quitting a Single Race goes back to the Single Race menu and records nothing.

**Data.** Settings, mode, the repair bill a quit would cost, and whether that bill would pass the credit limit.

**Rules.** Quitting a career race is charged as a wreck so that a player cannot dodge a fine or a bad finish by quitting. Closing or reloading the page is the same quit by another route, which is why the active-race record exists: the next load charges the wreck once. A quit or wreck in the finale costs the same and leaves the finale open; it does not end the career unless the debt check does. The frame loop must stop stepping the simulation while paused; nothing in `packages/sim` changes.
