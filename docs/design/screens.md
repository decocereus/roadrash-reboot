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
          ├─ New career                Finish, wreck, bust, quit │
          └─ Single Race ─► Route Board ─► Ride-out ─► Race       │
                              ▲                    ▼              │
                              └──────────────── Results ──────────┤
                                                   ├─ Game Over ─► Back Room
                                                   └─ Ending ──► Back Room
```

A promotion returns to the bar, where Vic says the level's line. A damaged save opens the Back Room. A wreck or a bust no longer has its own screen; Results shows it as a stamp.

## 1. Boot and the Back Room

**Boot.** On page load the screen shows the wordmark `RUSHLINE` and `Race. Fight. Pay for it.` while the save is read and the bar's art for the first road decodes, so the bar appears whole. With no save a new career begins and the bar opens. With a save it opens the bar, or Game Over or the ending when the career is over. A damaged save opens the Back Room. A `?ride=` or `?bench=` URL starts that race instead.

**Back Room.** Reached from the bar's menu or Escape, and from Game Over and the ending. A painted room on the bar's stage: the office behind the bar where the races are run, with a desk under a green lamp, a rotary phone, the cash box, three CRTs showing night races, a locker, and the door to the bar spilling neon. The bar header runs along the top. The menu is a ruled paper list pinned to the left wall, titled `BACK ROOM` on its tape, two ruled lines per item. Items: `BACK TO THE BAR` with `Level {level} · ${cash} · {bike}` (or `CAREER OVER` / `See the record`, `SEASON OVER` / `See the ending`), `NEW CAREER`, `SINGLE RACE` with `Any road, no money at stake`, `SETTINGS`. Escape returns to the bar.

- New career confirm, when a save exists: `Start over? Your Level {level} career will be erased.` Buttons `ERASE AND START` / `KEEP IT`.
- Damaged save, on the pink note on the wall (template): `{what is wrong} ({field}).` / `Save error: {kind}. Start over keeps the old save in the browser under a backup key and begins a new career.` The first menu item becomes `START OVER`. What is wrong, by kind: `notJson` reads `The save is not a save file`, `wrongVersion` reads `The save is from another version of the game`, `invalid` reads `The save holds a value the game does not have`, `inconsistent` reads `The save contradicts itself`.
- When the browser will not store the save, every screen carries a red line at the top: `The browser refused the save. Progress will be lost when you leave.`
- Bottom strip: `Arrows to steer · Space to punch · Shift to kick`
- Settings is a second ruled sheet pinned beside the list, one line per setting, with the highlighted setting's explanation in an opaque bottom strip and `B while riding marks the moment · Session {id}` at its right. It opens the same way over Pause.

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

**Purpose.** Single Race only: pick a road, a level, and a bike. Career races pick their road on the bar's flyer.

**Layout.** The Back Room's painted room. The ruled paper list on the left wall, titled `SINGLE RACE` on its tape, holds three steppers and two buttons. The chosen road's flyer is pinned on the right; a click on it shows the next road. The road's facts are on the cyan note over the desk and its description on the pink note under the flyer. The bar header runs along the top.

**Text.**

- Steppers: `ROAD ◄ {road} ►`, `LEVEL ◄ {n} ►`, `BIKE ◄ {bike} ►`. Levels run up to the career's level (1 with no career); bikes are the ones in the career's garage.
- Buttons: `RACE` with `Loading the road` under it while the road loads, `BACK`.
- Facts note: `LENGTH {km} KM` · `TRAFFIC {LIGHT|STEADY|HEAVY}` · `POLICE {n}` · `HOME OF {rivals}`.
- Descriptions:
  - Breakwater Run: `Harbour to pier along the seawall. One long bend by the water, one tunnel, and a kink at the tunnel mouth that nobody sees coming twice.`
  - Cinder Wash: `Dead straight across the dry lake, three washes, the last of which throws you in the air, then a hairpin up the mesa at the end of the fastest straight in the game.`
  - Hollow Pine Road: `Narrow, dark, and never straight for long. The trees are close and the crests hide the bends.`
  - Slag Row: `Two lanes and a lot of nothing, then a right angle. Rail tracks, an underpass, a drawbridge, and more traffic than anywhere else.`
  - Ridge Road: `The home road. Ten bends and two crests on the way up to the lookout.`
- Bottom strip: `No money · Nothing to qualify` and `Left and right change the road, level, and bike`.

**Buttons.** `RACE` (primary), `BACK`. Left and right on a stepper change its value.

**In.** From the Back Room.

**Out.** `RACE` goes to the ride-out card. `BACK` goes to the Back Room.

**Data.** Level; for each road its plan at this level (length, `trafficPerKilometre`), police count from the level table, and home rivals. Traffic label: under 6 per km is LIGHT, 6 to 9 STEADY, 10 or more HEAVY.

## 4. Garage

**Purpose.** Buy and sell bikes. Make the trade-off between classes readable without a manual.

**Layout.** Its own room, the garage next to the Lowside, painted like the bar: a stage of plates over a backdrop of the roller door open on the wet street, a pegboard on the left, a workbench on the right, and an empty stand under a work light. The selected bike is the live 3D bike model from the race, in its showroom paint, turning on the stand. The mechanic stands at the bench on the right with a speech sticker, which says the bike's pitch. The bar header (wordmark, badge, status strip) runs across the top. The price list is the ruled standings paper on the left, grouped by class, with the class note written on the paper below it. The bike's name, class and price sit over the stand, with the five bars in an ink strip under them. The bottom strip holds the buttons and the money.

```
+------------------------------------------------------------------------------+
| THE LOWSIDE [badge] | LEVEL 2 · ... | ROADS 1/3 | CASH $4,900 | HALDEN WREN  |
+--------------------+-----------------------------------+---------------------+
|    FOR SALE        | HALDEN KITE 500                   |  .-------------.    |
| FEATHERWEIGHT      | FEATHERWEIGHT · $5,000            | ( The Wren with )   |
|  Gutter Pup  $900  | TOP SPEED  ▓▓▓▓▓▓▓▓░░┆  170 km/h  | ( more lungs... )   |
|  Halden Wren Yours | LAUNCH     ▓▓▓▓▓▓▓░░░┆  6.0 s     |  '---- THE MECHANIC |
|  Halden Kite $5,000| STEERING   ▓▓▓▓▓▓▓▓▓░  ┆          |                     |
| MIDDLEWEIGHT       | BEND GRIP  ▓▓▓▓▓▓▓▓▓░   ┆         |   [ the mechanic ]  |
|  ...               | BRAKES     ▓▓▓▓▓▓▓▓░░┆            |                     |
| HEAVYWEIGHT        | A wreck at level 2 costs $...     |                     |
|  Meridian  Level 3 |        [ bike turning on stand ]  |                     |
|  (class note)      |                                   |                     |
+--------------------+-----------------------------------+---------------------+
| [BUY] SELL  BACK    PRICE $5,000  WITH TRADE-IN $6,700  LEFT $1,700 |
+------------------------------------------------------------------------------+
```

**Text.**

- Price list title: `FOR SALE`. The status strip is the bar's.
- Class headers: `FEATHERWEIGHT`, `MIDDLEWEIGHT`, `HEAVYWEIGHT`
- Class notes, for the selected bike's class, written under the list:
  - Featherweight: `Light and quick to turn. Bends barely move them. They run out of speed early.`
  - Middleweight: `The all-rounders. Fast enough that some bends need the brakes.`
  - Heavyweight: `Fastest in a straight line. Bends push them wide and they are slow to answer.`
- Each row's tag: the price, `YOURS` on the owned bike, or `LEVEL {n}` on a locked one.
- Bars: `TOP SPEED {km/h}`, `LAUNCH {0 to 100 time} s`, `STEERING`, `BEND GRIP`, `BRAKES`. The dotted mark on each bar is the owned bike.
- The pitch line from the catalogue, in the mechanic's speech sticker. After a buy or a sale the sticker says the line below instead, until another bike is picked. The name tape reads `THE MECHANIC`.
- Bottom strip, right of the buttons: `PRICE ${price}` · `WITH TRADE-IN ${cash + trade}` · `LEFT AFTER ${remainder}`
- When too expensive: `SHORT BY ${amount}` in red, and the buy button is dimmed.
- When in debt: `THE GARAGE DOESN'T SELL TO PEOPLE WHO OWE VIC MONEY. YOU CAN STILL SELL.`
- Buy confirm: `Trade your {owned} for the {new}? You'll have ${remainder} left.` Buttons `DO IT` / `NOT YET`.
- After buying: `It's yours. Try not to bend it.`
- Why the selected bike cannot be bought, beside the price: `Yours.`, `Arrives at level {n}.`, `Short by ${amount}.`, or the debt line above.
- Sell confirm: `Sell the {owned} for ${trade-in}? You'll ride the Gutter Pup and have ${cash + trade}.` Buttons `SELL IT` / `KEEP IT`, with `KEEP IT` selected. The `SELL` button is dimmed on the Gutter Pup.
- After selling: `Sold. You ride the Gutter Pup now.`
- Repair bill reminder under the bars: `A wreck at Level {n} costs ${repair} on this bike.`

**Buttons.** `BUY` (primary), `SELL`, `BACK`. Up and down move through the catalogue.

**In.** From the Clubhouse, with a fade.

**Out.** `BACK` to the Clubhouse.

The wireframe is the decent player's garage at the start of level 2 (`game-design.md` section 5): $4,900 in cash, a Wren worth $1,800 in trade, and the Kite within reach with $1,700 left over.

**Data.** Catalogue (name, class, price, pitch, `BikeSpec`), unlock level per bike, owned bike, cash, trade-in (60% of the owned bike's price), debt. The bars are computed from the `BikeSpec`: top speed from power and drag; launch from the 0 to 100 km/h time; steering from `steerRate` and `lateralSpeed`; bend grip from `curvePush`, where a larger `curvePush` is a longer bar because the bike is pushed out less; brakes from `brakeDeceleration`. The Gutter Pup is the one Featherweight with a short steering bar.

## 5. Ride-out

**Purpose.** Show who is on the grid while the road loads, then start. It has no buttons.

**Layout.** Left: the road's flyer. Right: `LEVEL {n} · TOP 3 QUALIFIES` (or `SINGLE RACE`), the road name in the stencil face, `{km} KM · {cops} COPS`, the grid as one row per racer (slot, name, bike and weapon, `HOLDS A GRUDGE` or `ON YOUR SIDE`), `YOU` last on a yellow bar, the rival with the strongest memory and their taunt, and the status `LOADING THE ROAD`, then `RIDE`.

**In.** From the bar's `RIDE`, the route board's `RACE`, or Results' `RACE AGAIN`.

**Out.** The race starts on its own once the road is prepared and the card has shown for 2.2 s. Escape goes back to the bar, or to the route board in Single Race. In a career race the active-race record is written to the save when the countdown ends. From that tick, leaving the page counts as a wreck.

**Grid order.** The player starts in slot 15, at the back, so every race opens with a pack to ride through. Rivals fill slots 1 to 14 in an order drawn from the race seed, across every lane of the road in rows 7 m apart (`game-design.md` section 9).

**The field.** The road's two home riders and five drawn from the rest of the cast. At level 1 Juno is never drawn, and Ridge Road's home riders are Coach and Ruth Ann.

**Data.** The compiled track's name and length, police count, the drawn rivals and their grid slots, each rider's profile (name, paint, weapon) and bike for this level, memory record (grudge flag, chosen taunt), the player's bike and carried weapon.

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

Folded into Results on October 23, 2026. A wreck settles at the tick of the `wrecked` event at the full repair bill, like a bust, and the race cuts to Results 1.2 s after the crash so the player sees it land. Results stamps `WRECKED`, puts the repair on the ledger, and seats Mags on the stool with one of her lines:

- `"I can fix it. I can't fix how you ride it."`
- `"I've seen worse. On fire, mostly."`
- `"Sweetheart, the front wheel was in a different lane."`

The rewarded ad that halves the bill is not built. When it is, it belongs on Results after a wreck, and the wreck's settlement has to wait for the player's choice again.

## 9. Busted

Folded into Results on October 23, 2026. Results stamps `BUSTED`, puts the fine on the ledger, and puts the km and any confiscated weapon under the stamp: `KM {km} · TOOK YOUR {WEAPON}`. The arresting officer takes the stool with one of their lines in the speech sticker and `BOOKED YOU` on the tape. The officer is the one who patrols the road: `SERGEANT DOLORES PIKE` on Breakwater Run, Cinder Wash, and Ridge Road; `DEPUTY WENDELL HAVERTY` on Slag Row and Hollow Pine Road. Both are drawn as fan-service pin-ups in uniform, in the same figure framing as the riders. The cut to Results comes 0.8 s after the `busted` event, so the player sees the cop arrive.

The arrest record comes from the race runner, because the sim's own state no longer holds it by the time Results draws: the road; the km, taken from the body's `s` at the `busted` event; and the weapon the player held on the tick before the throw that put them on the ground.

## 10. Results

**Purpose.** The reckoning: place, qualification, money in, money out, cash now, and what the rivals made of it.

**Layout.** Results happens in the bar, on the same 1672 × 941 stage as the Clubhouse, with the same header, status strip (now showing the new cash), and bottom strip. The left half is the bar: the rival with the post-race line sits on the stool, with the line in the speech sticker and their name and finishing place on yellow tape. After a bust the arresting officer takes the stool, and after a wreck or a quit Mags does. The wall on the right shows:

- **The race sheet:** the standings paper, stretched to fifteen ruled lines, the most a race seats (its border image repeats one ruled gap), with `{ROAD} · LEVEL {n}` on the tape and one rider per line. The player's line is yellow.
- **The stamp:** the place (`1ST`) framed in yellow, or `WRECKED`, `QUIT`, or `BUSTED` framed in red, with one line under it: `QUALIFIED · {q} / 5 ROADS`, `NOT QUALIFIED`, `QUALIFIED ALREADY`, `{km} KM IN, THE BIKE GAVE UP`, `PULLED OUT AT KM {km}`, or the bust line above.
- **The ledger** on the cyan note.
- **The pink note,** only when there is something to say: the career-over line, the repossession, or the debt warning, in that order.

There is no display ad slot since Results moved into the bar. If one comes back, it should be a bill on the wall rather than a box.

**Text.**

- Sheet title: `{ROAD} · LEVEL {n}`
- Rows: place, name, bike, result, prize. The result is a time as `m:ss.t` for a rider who had finished by the settlement tick, `+ {m} m` (distance behind the player, or behind the leader on the road if the player did not finish) for a rider still racing at that tick, or `BUSTED`, `WRECKED`, or `LEFT` (multiplayer). Rivals' prizes are shown for flavour and follow the settled places.
- Incident note after a rider's name, in red, at most two on the sheet (templates): `you knocked {Rival} down at {km} km` · `{Rival} knocked you down at {km} km` · `you took {Rival}'s {weapon}` · `by a wheel`
- Ledger: `PRIZE, {place}` · `REPAIRS` · `FINES` · `VIC'S ENVELOPE` (only when it applies) · `CASH` (or `OWED`)
- On a road that was already qualified the prize line reads `PRIZE · HALF, REPEAT RUN` for places 1 to 3 and `REPEAT RUN · NO PAY` with `$0` for places 4 to 15.
- Rival line in the speech sticker, from the rival who finished directly ahead of the player, or directly behind if the player won.
- Debt warning: `YOU OWE ${debt}. LIMIT ${limit}. PAST THAT, THE GARAGE TAKES THE BIKE.`
- Repossession notice, when debt passed the bike's credit limit: `THE GARAGE TOOK THE {bike}. IT SOLD FOR ${trade-in}, PAID WHAT YOU OWED, AND LEFT YOU ${cash}. YOU RIDE THE GUTTER PUP NOW. IT CAN'T OUTRUN A COP. STAY ON IT.` If the sale did not cover the debt the middle sentence reads `IT SOLD FOR ${trade-in}. YOU STILL OWE ${debt}.`
- Career over, when the player is on the Pup (before or after a repossession) and still owes more than $750: `YOU OWE ${debt} ON A GUTTER PUP. VIC WANTS A WORD.`

**Buttons.** `CONTINUE` (primary), `RACE AGAIN` (same road, new seed, straight to the ride-out card). `RACE AGAIN` is not shown when the career is over, when this race qualified the fifth road, or when the finale was just finished in the top three. On a road that is already qualified it reads `RACE AGAIN · HALF PAY`.

**In.** From Finish, from the race after a wreck or a bust, and from a career quit. Never before the settlement write.

**Out.** `CONTINUE` goes to Game Over if the debt check ended the career, to the ending if the player finished the finale in the top three, to the bar with Vic's promotion line if this race qualified the fifth road of levels 1 to 4, and otherwise to the Clubhouse. There is no interstitial ad on the way. A reload on this screen opens the Clubhouse, or Game Over if the career is over, because everything shown here is already in the save.

**Single Race.** No status strip, ledger, prize column, or qualification. The stamp reads the place with `SINGLE RACE` under it, and the pink note says nothing is written to the career. `CONTINUE` goes back to the Single Race menu and `RACE AGAIN` restarts the same road. Nothing is written to the career.

**Data.** The settled result: places, each rider's finish tick or distance behind at the settlement tick, modes, the prize paid (full, half, or none), the bill, any repossession, cash before and after, qualified count, incidents from the race's events up to the settlement tick, and the post-race line chosen by the memory rules.

## 11. Promotion

**Purpose.** Mark the promotion briefly and say what is new, in the bar.

**In the bar.** After a race that qualifies the fifth road of levels 1 to 4, Continue on Results returns to the bar. The stool is empty and Vic speaks the level's line in the speech sticker until it is clicked:

- Level 2: `Longer roads. Two cops. Bigger purses. The garage got a delivery.`
- Level 3: `Longer again. Three cops, and the new ones are quicker.`
- Level 4: `Four cops. Everyone's armed now. Try to keep up.`
- Level 5: `Five roads left. The Ridge is last. She'll be waiting.`

The first wall note reads `Level {n}. {cops} cops. 1st pays ${prize}.`, with `New at the garage: {bikes}.` when the level unlocks bikes, signed `V.`. The status strip shows the new level name.

**Endings.** After a level-5 Ridge Road race that the player finishes in the top three, this screen is replaced by the ending. A quit, wreck, bust, or lower place in the finale is an ordinary result that returns to the Clubhouse with the finale still open. The ending is the bar with the stool empty: the ending's name on the tape of the ruled paper with its text from `game-design.md` section 11 written on the lines, a `SEASON OVER` stamp, the season's record (level, races and wins, knockdowns, busts, money earned) on the cyan note, and `BACK ROOM`.

## 12. Game Over

**Purpose.** End the career clearly and without cruelty.

**Layout.** A painted stage: the Lowside car park at night in the rain, a tow truck hauling the Gutter Pup off on its hook, the bar's back door under pink neon. The bar header runs along the top. The card is written on the ruled paper pinned to the dark wall on the left, titled `BROKE` on its tape. The season record is on the cyan note, bottom right. The buttons are in the bottom strip with `The Lowside car park, after closing` at the right.

**Text.**

- Heading: `BROKE`
- The card: `You owe more than a Gutter Pup is worth, which is saying something. We're done.`
- Record: `REACHED LEVEL {n}` · `{races} RACES · {wins} WINS` · `KNOCKED DOWN {k} RIDERS` · `BUSTED {b} TIMES` · `BEST BIKE: {bike}`

**Buttons.** `NEW CAREER` (primary), `BACK ROOM`. There is no `RACE AGAIN`, no continue, and no ad offer.

**In.** From Results, slow fade (600 ms). Also straight from the Back Room or a page load whenever the save is marked over.

**Out.** `NEW CAREER` replaces the save and plays the new-career intro. `BACK ROOM` leaves the finished career in the save, where it can only reopen this screen.

**Persistence.** The career is marked over in the same save write that settles the last race, before Results is drawn. Reloading the page on Results or here cannot bring the career back, and no route from a finished career leads to the Route Board, the Garage, or a race.

**Data.** Career totals and the over flag.

## 13. Multiplayer Lobby

**Purpose.** Gather two to eight players, let each pick a bike, and start.

**Layout.** The Lowside car park. Eight parking bays in a row across the middle, each either a player's bike in their paint with their name above it or an AI rival's bike with an `AI` tag. A bay with no player always holds an AI rival, and seven more AI rivals wait beyond the bays, so the grid always holds the field the server's race rules set. Top left: the room code. Left column: the host's race settings. Right column: the local player's bike picker, a compact version of the Garage bars. Bottom strip: ready state.

**Text.**

- Heading: `CAR PARK`
- Room: `ROOM {CODE}` · `COPY INVITE LINK`
- Bays: `{player name}` with `READY` or `PICKING`, or `{Rival} · AI` with the small print `JOIN TO TAKE THIS BAY`
- Host settings: `ROAD ◄ {road} ►` · `LEVEL ◄ {n} ►` · `BIKES ◄ ANY | FEATHERWEIGHT | MIDDLEWEIGHT | HEAVYWEIGHT ►`. There is no setting for AI riders or the field size. Every race has the field the server's race rules set, and AI rivals fill whatever the players do not.
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

**Layout.** The race view freezes and dims. The menu is the ruled paper list pinned on the left, titled `PAUSED` on its tape, the same list as the Back Room. The road is still visible on the right. The bottom strip holds the controls and, in Career, the line about leaving the page; Settings pins its sheet beside the list, as in the Back Room.

**Text.**

- Heading: `PAUSED`
- Items: `RESUME` · `RESTART RACE` (Single Race only) · `SOUND` with `ON` / `OFF` · `SETTINGS` · `QUIT RACE`
- Quit confirm in Career: `Quit this race? It counts as a wreck: no prize, and a ${repair} repair bill.` Buttons `QUIT AND PAY` / `KEEP RACING`. When the bill would pass the credit limit, a red line is added: `THIS BILL TAKES THE {bike}.` or `THIS BILL ENDS THE CAREER.`
- Bottom strip: `Arrows to steer · Space to punch · Shift to kick · M to mute`, and at the right in Career `Leaving or reloading the page counts as a wreck too`, in Single Race `R restarts a single race`.
- Quit confirm in Single Race: `Quit this race?` Buttons `QUIT` / `KEEP RACING`.
- In multiplayer the race does not pause. Escape opens the same panel over the live race with the heading `MENU`, without `RESTART RACE`, and with `LEAVE RACE` in place of `QUIT RACE`: `Leave? Your bike rides on autopilot and you're scored as LEFT.`

**Buttons.** `RESUME` (primary, also Escape).

**In.** Escape during a race. Also when the tab loses focus in single player.

**Out.** `RESUME` returns after a `3 2 1` count so the player can get their hands back. Quitting a career race settles it as a wreck at the tick of the quit and goes straight to Results at the full bill, stamped `QUIT`. Quitting a Single Race goes back to the Single Race menu and records nothing.

**Data.** Settings, mode, the repair bill a quit would cost, and whether that bill would pass the credit limit.

**Rules.** Quitting a career race is charged as a wreck so that a player cannot dodge a fine or a bad finish by quitting. Closing or reloading the page is the same quit by another route, which is why the active-race record exists: the next load charges the wreck once. A quit or wreck in the finale costs the same and leaves the finale open; it does not end the career unless the debt check does. The frame loop must stop stepping the simulation while paused; nothing in `packages/sim` changes.
