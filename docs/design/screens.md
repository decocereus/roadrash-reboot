# Screens

Drafted October 10, 2026. The screen flow and a storyboard of every screen. Rules and numbers come from `game-design.md`; colours and type from `art-direction.md`.

React renders every screen here. The race view is the Three.js canvas with the HUD drawn over it by React at 15 Hz, as today.

## Conventions

- Every screen outside the race is the walkable bar with one panel or card from the kit in `packages/ui` over it, and every card over a race uses the same kit. Settings is the bar's third tab.
- Night-violet panels with a neon-yellow edge, a yellow italic title over a magenta rule, yellow for the primary button, warm white for body text, money in green when it comes in and red when it goes out.
- One primary action per screen, bottom right, bound to Enter. Back is bottom left, bound to Escape.
- Keyboard first: arrows or WASD move the selection, Enter confirms, Escape goes back. Everything is also clickable. A gamepad maps the same way.
- Transitions are short: 180 ms cross-fade between menu screens, 300 ms fade to and from the race. The consequence screens (Wrecked, Busted) cut in hard with no fade.
- Text strings below are final copy unless marked as a template. `{braces}` mark values filled from state.
- Only one interface element blinks: the police warning on the HUD. Every other element that changes state changes colour and holds it. Lights in the world, such as a police light bar, are scenery and not covered by this rule.
- "Settlement" is the moment a race's result becomes final, defined in `game-design.md` section 4. No screen after a race shows a number that settlement did not produce.
- The "Single Race menu" is the Ride solo panel on the bar's Race tab.

## Flow

Restructured on October 23, 2026. The Lowside bar is the first screen and the hub; the title, the intro cards, the pre-race screen, and the tier-up screen were cut, and the route board serves Single Race only.

Revised on November 11, 2026. Solo races leave through the same door as room races, and results, the career over card and the endings sit on the bar's Race panel. A first visit opens on the first-visit card over the bar, and every card drawn over a race uses the bar's kit.

```
Load (wordmark while the bar's art decodes)
 ├─► First-visit card (once) ─ Walk in ─► home, or the invite ─┐
 └─► The Lowside (walkable bar), Race panel ◄─────────────────────┤
      ├─ Ride solo ─► Ride (career) or Race (single) ─► Door ─► Race
      ├─ Find a race / Race friends ─► Lobby ─► Door ─► Race       │
      └─ Garage, Settings                               │          │
                                         Finish, wreck, bust, quit │
                                                        ▼          │
                                          Results on the Race panel┤
                                           ├─ Race again ─► Door   │
                                           ├─ Next race ─► Lobby   │
                                           └─ Career over card ────┘
```

A promotion returns to the bar, where Vic says the tier's line. A wreck or a bust has no screen of its own; Results names it in its title. `stepNavigation` in `apps/web/src/navigation.ts` is this diagram as code.

## 1. Boot and the first visit

**Boot.** On page load the screen shows the wordmark `RUSHLINE` and `Race. Fight. Pay for it.` while the rules and the save are read. With no save a new career begins and the bar opens. With a save it opens the bar. A `?ride=` or `?bench=` URL starts that race instead. When the career is held in another tab, the screen says so with `TRY AGAIN`, which reloads the page.

**First visit.** A player with no saved name, or who has not yet seen the data notice, gets this card once, over the dimmed bar, before anything else in the bar can be used: the tabs, the walk-up spots and the Race panel behind it wait. `stepNavigation` decides it as the bar's `welcome` panel, which holds the panel the player lands on after it.

- Heading: `WHAT DO THEY CALL YOU?`, over a name field that takes up to 12 characters, cleaned by the same rule as the room's names.
- Notice: `We record your races and how the game runs, under a random ID kept on this device. Never your name. You can switch it off in Settings.`
- Buttons: `WALK IN` (primary, also Enter), and the `PRIVACY` link.
- `WALK IN` saves the name and marks the notice seen, then shows the home panel, or the invite panel when the player came by a friend's link. A refresh before `WALK IN` shows the card again, with the friend's room still in the address. A returning player with a name who has seen the notice never sees it. Settings keeps the Race data switch and the name card for changing the name later.

**Interrupted careers.** When the save holds an active-race record, the page was left during a race. Loading the career settles that race as a wreck, once, before any screen is drawn, and then opens the bar.

- When the browser will not store the save, every screen carries a red line at the top: `The browser refused the save. Progress will be lost when you leave.`

## 2. Clubhouse

Removed on November 11, 2026. The painted Clubhouse, the Back Room and their art, the ruled paper sheets, the notes, the stickers and the bar header and bottom strip, are gone. The walkable bar is the home, with its Race, Garage and Settings tabs; [browser-client.md](../architecture/browser-client.md#the-bar-lobby) describes it.

## 3. Route Board

Removed in the menus redesign of November 2026. A single race is picked on the Ride solo panel of the Race tab.

## 4. Garage

**Purpose.** Buy and sell bikes. Make the trade-off between bikes readable without a manual.

Rebuilt on November 11, 2026. The Garage is the bar's second tab, not a painted room. The painted garage, its price list paper, the mechanic and her speech sticker are gone, and so are the bike pitches and the class notes they showed.

**Layout.** The bar's camera eases to the stand in the garage corner, where the selected bike stands as the race draws it, in its showroom paint, with the tuner sitting on it. Dragging across the bar turns the bike. The panel on the right holds the bike's name, a one-line summary, the five bars, the three shelf chips and one action card, with a quiet line at the foot. A stepper sits at the lower left over the bar. The hint strip reads `Drag to turn the bike` on the left and `Back to the bar Esc` on the right. While the Garage is open the rider stands still where they were and the bar's keys and clicks do nothing, so the camera and the rider are where the player left them when the tab closes.

```
+------------------------------------------------------------------------------+
| RACE | GARAGE | SETTINGS                                  [■] RIDING AS ALPHA |
+-----------------------------------------------------+------------------------+
|                                                     | HALDEN WREN 400        |
|                                                     |------------------------|
|              [ the bike on its stand ]              | Yours. Top speed       |
|                                                     | 190 km/h.              |
|                                                     | TOP SPEED  ■■■■■□□□    |
|                                                     | LAUNCH     ■■■■□□□□    |
|                                                     | STEERING   ■■■■■■□□    |
|                                                     | BEND GRIP  ■■■■■□□□    |
|                                                     | BRAKES     ■■■■□□□□    |
|                                                     |------------------------|
|                                                     | [YOURS] FOR SALE  CATA |
|                                                     | SELL                   |
|  < BIKE 1/1 >                                       | The mechanic pays $1,8 |
|                                                     | Room races put everyon |
+-----------------------------------------------------+------------------------+
| DRAG TO TURN THE BIKE                                      BACK TO THE BAR ESC |
+------------------------------------------------------------------------------+
```

**Shelves.** `Yours` holds the bike the player rides. `For sale` holds every other bike the player's tier has. `Catalogue` holds every bike, locked ones included. The Garage always opens on `Yours`. The stepper reads `Bike {n}/{count}` and steps through the shelf, wrapping at both ends, and the left and right arrow keys step it too.

**Text.**

- Summary: `Yours. Top speed {km/h} km/h.`, `${price}. Top speed {km/h} km/h.`, or `Tier {n}. Top speed {km/h} km/h.` on a locked bike.
- Bars, eight cells each: `Top speed`, `Launch`, `Steering`, `Bend grip`, `Brakes`.
- Action on the player's own bike: `Sell`, `The mechanic pays ${trade-in}.` On the Gutter Pup it is dimmed: `Nobody wants the Gutter Pup.`
- Action on a bike for sale: `Buy`, `You have ${cash}. Price ${price}, ${price - trade-in} with your trade-in.`
- When it cannot be bought, `Buy` is dimmed with the reason: `Arrives at tier {n}.`, the buy numbers and `Short by ${amount}.`, `The garage doesn't sell to people who owe Vic money. You can still sell.`, or `The garage is shut.`
- Buy confirm, in the panel: `Trade your {owned} for the {new}? You'll have ${remainder} left.` Buttons `Do it` / `Not yet`.
- Sell confirm, in the panel: `Sell the {owned} for ${trade-in}? You ride the Gutter Pup and have ${cash + trade-in}.` Buttons `Sell it` / `Keep it`.
- After buying: `It's yours. Try not to bend it.` After selling: `Sold. You ride the Gutter Pup now.` Either moves the stand to `Yours`.
- Foot of the panel: `Room races put everyone on the same bike.`

**In.** The Garage tab, or walking the rider up to the stand and pressing `E` at the `Garage E` prompt, from any Race panel, a lobby included. The tab is dimmed until a career exists.

**Out.** The Race tab or `Esc` returns to the panel the player left, with a lobby still seated. A confirm open in the panel closes first.

**Data.** `shopStock`, `canSell`, `spendingPower`, `buyBike` and `sellBike` from `packages/career/src/shop.ts`, and `tradeInOf` from its tables; `apps/web/src/career/garage-stand.ts` picks the shelf, the bike on the stand and the action from what they return. The bars are computed from the `BikeSpec`: top speed from power and drag; launch from the 0 to 100 km/h time; steering from `steerRate` and `lateralSpeed`; bend grip from `curvePush`, where a larger `curvePush` is a longer bar because the bike is pushed out less; brakes from `brakeDeceleration`.

## 5. The door

**Purpose.** Leave the bar for the road. A solo race and a room race leave the same way.

**On the Ride solo panel.** Under `Ride` the career line says what the next race holds (template): `Top 3 qualify. {n} rivals and {c} cops on {km} km.`, then `Dee rides with you.` when she does, then `{Rival} holds a grudge.` or `{n} riders hold a grudge.`

**The moment.** `Ride` or `Race` closes the panel and the bar's door lifts. The player walks out while the game prepares the race. The race starts once the race is prepared and the door has stood open for 5 s. Nothing is on screen during the moment.

**Failure.** When a rider's model does not load, the Race panel shows `No ride` with `The riders did not load. Check your connection and try again.`, `Retry`, and `Back`. Back returns to Ride solo and closes the door.

**In.** From the career's `Ride`, the single race's `Race`, or Results' `Race again`. In a career race the active-race record is written to the save when the countdown ends. From that tick, leaving the page counts as a wreck.

**Grid order.** The player starts in slot 15, at the back, so every race opens with a pack to ride through. Rivals fill slots 1 to 14 in an order drawn from the race seed, across every lane of the road in rows 7 m apart (`game-design.md` section 9).

**The field.** The road's two home riders and five drawn from the rest of the cast. At tier 1 Juno is never drawn, and Ridge Road's home riders are Coach and Ruth Ann.

**Data.** The compiled track's name and length, police count, the drawn rivals and their grid slots, each rider's profile (name, paint, weapon) and bike for this tier, memory record (grudge flag, chosen taunt), the player's bike and carried weapon.

## 6. Race HUD

**Purpose.** Tell the player what they need while steering and fighting, and nothing else. The road stays clear: no dashboard, no panel across the bottom.

**Layout.** Four small corner clusters. Everything sits within 12% of the screen edges.

```
+------------------------------------------------------------------------------+
| 3rd / 15                   ▲ COP 40 m ▲                         2.1 km to go |
|                                                    ├────────●───────────┤    |
|                                                                              |
|                                                                              |
|                         ┌──────────────┐                                     |
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
| Top centre | Cop warning | Hidden unless a cop is chasing the player. `▲ COP {m} m AHEAD ▲` or `▼ COP {m} m BEHIND ▼` in police blue and red, alternating at 2 Hz, with a short siren cue. Under 15 m it reads `COP ON YOU`. This is the only element on the HUD that blinks. | `chase` on police riders, distance to the player |
| Top right | Distance | `{km} km to go` over a thin progress line with a dot for the player and small ticks for the riders ahead. Police roadblocks the player knows about (Dee's tip) show as a blue tick. | `s` over track length |
| Bottom left | Speed | Speed in km/h as large tabular numerals with `km/h` under it. No dial. | `speed` |
| Bottom centre | Player bars | `YOU` stamina bar and, under it, a thinner `BIKE` condition bar. Stamina goes green, yellow under 50, red under 25. The bike bar is warm white, yellow under 50, and red under 25. Both bars change colour and hold it; neither flashes. | `stamina`, `condition` |
| Bottom right | Weapon | Weapon name and one pip per hit left. Shows `FISTS` with no pips when unarmed. | `weapon`, `weaponHits` |
| Centre, brief | Notices | One word or short phrase, 0.8 s, then gone. | events |

**Notice strings.** `WIPEOUT` (crash), `CLOSE` (near miss), `AIR` (landing after more than half a second), `HIT` (your strike lands), `DOWN!` (you knock a rider off), `GOT THE {WEAPON}` (weapon taken), `{WEAPON} BROKE`, `DISARMED` (yours taken), `COP!` (pursuit starts), `RUN!` (off the bike with a cop within 60 m), `LAST KM`.

**Off the bike.** While thrown, running, or mounting, the speed readout dims, and an arrow at the screen edge points to the bike: `◄ BIKE 14 m`. The HUD otherwise stays up; the race continues around the player.

**Rules.**

- Nothing is drawn in the middle 60% of the width between 25% and 80% of the height, except the brief notice.
- Only the cop warning blinks. Position and the two bars change colour without flashing, and notices appear once and fade.
- No rival tags, names or speech during a race. No rear-view mirror.
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

**Buttons.** `CONTINUE`, the kit's yellow button at the lower right, appears after 1.5 s and takes focus. The screen moves on by itself after 5 s.

**In.** Cuts in when the player's `finish` event fires. The race settles at that tick: the place on the banner is final, rivals still on the road are classified where they are, and the result is written to the save before the banner is drawn. Riders who cross the line during the animation are scenery; their places do not change.

**Out.** Fade to Results. Results opens only from here, after the animation, and never before the settlement write. A reload during the animation finds no active-race record and opens the bar with the result already counted.

**Data.** The settled result: the player's `finishTick` and place, the finish tick of each rider ahead, and the distance behind of each rider still racing at that tick.

## 8. Wrecked

Folded into Results on October 23, 2026. A wreck settles at the tick of the `wrecked` event at the full repair bill, like a bust, and the race cuts to Results 1.2 s after the crash so the player sees it land. Results stamps `WRECKED`, puts the repair on the ledger, and seats Mags on the stool with one of her lines:

- `"I can fix it. I can't fix how you ride it."`
- `"I've seen worse. On fire, mostly."`
- `"Sweetheart, the front wheel was in a different lane."`

The rewarded ad that halves the bill is not built. When it is, it belongs on Results after a wreck, and the wreck's settlement has to wait for the player's choice again.

## 9. Busted

Folded into Results on October 23, 2026. Results stamps `BUSTED`, puts the fine on the ledger, and puts the km and any confiscated weapon under the stamp: `KM {km} · TOOK YOUR {WEAPON}`. The arresting officer takes the stool with one of their lines in the speech sticker and `BOOKED YOU` on the tape. The officer is the one who patrols the road: `SERGEANT DOLORES PIKE` on Breakwater Run and Ridge Road; `DEPUTY WENDELL HAVERTY` on Slag Row. Both are drawn as fan-service pin-ups in uniform, in the same figure framing as the riders. The cut to Results comes 0.8 s after the `busted` event, so the player sees the cop arrive.

The arrest record comes from the race runner, because the sim's own state no longer holds it by the time Results draws: the road; the km, taken from the body's `s` at the `busted` event; and the weapon the player held on the tick before the throw that put them on the ground.

## 10. Results

**Purpose.** The reckoning: place, qualification, money in, money out, cash now.

**Layout.** Results is the bar's Race panel, in the panel kit, over the walkable bar. From the top: the title, the road (with `, tier {n}` in a career race), one verdict line, the placings, the money, a warning when there is one, then the buttons.

**Text.**

- Title: `{place} of {riders}`, or `Busted`, `Wrecked`, `Quit`.
- Verdict: `Qualified, {q} of 3 roads.`, `Not qualified.`, `Qualified already.`, `{km} km in, the bike gave up.`, `Pulled out at km {km}.`, or `Booked at km {km}, took your {weapon}.`
- Placings: the top five, or down to the player's line when lower, then `{n} more behind you.` Each line is the place, the name (`You` for the player, with the rider's colour chip in a room race), and a time as `m:ss.t`, `+{m} m`, `Leading`, `Busted` or `Wrecked`.
- Money: `Prize, {place}`, `Repairs` (or `Half repairs`), `Fines`, and `Cash` (or `Owed`). On a road that was already qualified the prize line reads `Half prize, repeat run` for places 1 to 3 and `Repeat run, no pay` for the rest.
- Debt warning: `You owe ${debt}. Limit ${limit}. Past that, the garage takes the bike.`
- Repossession: `The garage took the {bike}. It sold for ${trade-in}, paid what you owed, and left you ${cash}. You ride the Gutter Pup now.` If the sale did not cover the debt the middle sentence reads `It sold for ${trade-in}. You still owe ${debt}.`
- Career over: `You owe ${debt} on a Gutter Pup. Vic wants a word.`
- Under the buttons: `Settled and saved`, or `Settled, not saved` when the browser refused the save.

**Buttons, solo.** `Continue` (primary) goes to the career over card when the career is over or the season is done, and otherwise to the Race panel's home. A single race also offers `Race again` (`Same road.`, or `Same road, half pay.` on a repeat run), which goes straight through the door again. `Race again` is not shown when the career is over, when this race qualified the third road, or when the finale was just finished in the top three.

**Buttons, room.** `Next race` (primary, `Back to the lobby.`) returns to the room's lobby for a rematch, and `Leave` frees the spot and goes home.

**In.** From the finish banner, from the race after a wreck or a bust, and from a quit. Never before the settlement write.

**Single Race.** No money, no tier and no qualification. Nothing is written to the career.

**Data.** The settled result: places, each rider's finish tick or distance behind at the settlement tick, the prize paid (full, half, or none), the bill, any repossession, cash after, and the qualified count.

## 11. Promotion

**Purpose.** Mark the promotion briefly and say what is new, in the bar.

**In the bar.** After a race that qualifies the third road of any tier but the last, Continue on Results returns to the bar. The stool is empty and Vic speaks the tier's line in the speech sticker until it is clicked. Each rung (`game-design.md` section 4) has a line, and a tier speaks the lines of the rungs it takes in, in order:

- Rung 2: `Longer roads and bigger purses. The garage got a delivery.`
- Rung 3: `The new cops are quicker.`
- Rung 4: `Everyone's armed now. Try to keep up.`
- Rung 5: `One more round. The Ridge is last. She'll be waiting.`

There is one card per tier, so the last promotion always names the finale. The lines leave the cop count to the wall note, which reads the served rules.

The first wall note reads `Tier {n}. {cops} cops. 1st pays ${prize}.`, with `New at the garage: {bikes}.` when the tier unlocks bikes, signed `V.`. The status strip shows the new tier name.

**Endings.** After a last-tier Ridge Road race that the player finishes in the top three, this screen is replaced by the ending. A quit, wreck, bust, or lower place in the finale is an ordinary result that returns to the bar with the finale still open. The ending is the career over card (section 12) with the ending's name as its title and its note from `game-design.md` section 11.

## 12. Career over

**Purpose.** End the career clearly and without cruelty. One card serves going broke and both endings.

**Layout.** The bar's Race panel, in the panel kit, over the walkable bar.

**Text.**

- Title: `Broke`, `Clean Crown`, or `Runner-up`.
- The note: for Broke, `You owe more than a Gutter Pup is worth, which is saying something. We're done.`; for an ending, its note from `game-design.md` section 11.
- Record: `Reached`, `Tier {n}`; `Races`, `{wins} wins in {starts}`; `Knocked down`, `{k} riders`; `Busted`, `{b} times`; `Earned`, `${earned}`.

**Buttons.** `New career` (primary, `Back to tier 1 with a fresh bike.`) and `Close`. There is no `Race again` and no continue.

**In.** From Results' `Continue` when the career is over or the season is done.

**Out.** `New career` replaces the save and returns to the Race panel's home. `Close` leaves the finished career in the save and returns home, where Ride solo offers only a new career.

**Persistence.** The career is marked over in the same save write that settles the last race, before Results is drawn. Reloading the page cannot bring the career back, and no route from a finished career leads to a career race.

**Data.** Career totals, the over flag and the ending.

## 13. Multiplayer Lobby

**Purpose.** Gather two to eight players, let each pick a bike, and start.

**Layout.** The Lowside car park. Eight parking bays in a row across the middle, each holding a rider's bike in their paint with their name above it. A bay no player has taken holds a bot, drawn exactly like a player's bay, because bots present as human (`game-design.md` section 12). More bots wait beyond the bays, so the grid always holds the field the server's race rules set. Top left: the room code. Left column: the host's race settings. Right column: the local player's bike picker, a compact version of the Garage bars. Bottom strip: ready state.

**Text.**

- Heading: `CAR PARK`
- Room: `ROOM {CODE}` · `COPY INVITE LINK`
- Bays: `{rider name}` with `READY` or `PICKING`. A bot's bay reads like any other.
- Host settings: `ROAD ◄ {road} ►` · `TIER ◄ {n} ►` · `BIKES ◄ ANY | FEATHERWEIGHT | MIDDLEWEIGHT | HEAVYWEIGHT ►`. There is no setting for bots or the field size. Every race has the field the server's race rules set, and bots fill whatever the players do not.
- Non-hosts see the same settings read-only with `{host} IS PICKING THE ROAD`.
- Bike picker: `YOUR BIKE ◄ {bike} ►` · `PAINT ◄ ► `
- Bottom strip: `{ready} / {players} READY` and, for the host, `START` (enabled when everyone is ready and at least two players are present).
- Start countdown: `STARTING IN 3` `2` `1`
- Connection toasts: `{Name} joined.` · `{Name} left.` · `{Name} lost connection. The bike rides on autopilot.` · `{Name} is back.`
- Errors: `Room not found. Check the code.` · `Room is full.` · `Lost connection to the room. Retrying.`

**Buttons.** `READY` / `NOT READY` (primary for players), `START` (host), `LEAVE`.

**In.** From the bar once it ships, or straight from an invite link.

**Out.** To the race when the Durable Object sends the start message. After Results, back here with the same room.

**Data.** Room state from the Durable Object: players, their bike and paint, ready flags, host, road, tier, seed, and which rivals fill the remaining bays.

## 14. Race menu

Rebuilt on November 11, 2026 as one card in the bar's kit for solo and room races, in place of the paper list.

**Purpose.** Stop a solo race, change the sound or settings, or give up. In a room race, the same card over the live race.

**Layout.** The race view dims. A card in the centre holds the title `RACE MENU`, one line, the yellow back button with `Esc` under it, `SOUND ON` or `SOUND OFF` and `SETTINGS` side by side, and the way out with what it costs. A quiet line at the foot holds the controls.

**Text.**

- Line: `The race is paused.` in a solo race, `The race keeps going.` in a room race.
- Back: `RESUME` in a solo race, `BACK TO THE RACE` in a room race, both with `Esc`.
- `RESTART RACE` with `R restarts a single race.` (single race only).
- `QUIT RACE` in a solo race. In Career its line is `Counts as a wreck, and a ${repair} repair bill. Leaving or reloading the page counts as a wreck too.`, in a single race `Back to the bar.`
- `LEAVE RACE` in a room race, with `Back to the bar. Your bike rides on without you.`
- Quit confirm in Career: `Quit this race? It counts as a wreck: no prize, and a ${repair} repair bill.` Buttons `KEEP RACING` (yellow, focused) / `QUIT AND PAY`. When the bill would pass the credit limit, a red line is added: `THIS BILL TAKES THE {bike}.` or `THIS BILL ENDS THE CAREER.`
- Quit confirm in a single race: `Quit this race?` Buttons `KEEP RACING` / `QUIT`.
- Foot: `Arrows to steer, Space to punch, Shift to kick, E to get back on, M to mute.`

**Buttons.** The back button (primary, also Escape). `SETTINGS` opens the Settings panel over the card; Esc closes Settings first and leaves the card up.

**In.** Escape during a race. Also when the tab loses focus in a solo race.

**Out.** `RESUME` returns after a `3 2 1` count so the player can get their hands back. Quitting a career race settles it as a wreck at the tick of the quit and goes to Results on the Race panel at the full bill. Quitting a single race goes back to the bar and records nothing. `LEAVE RACE` goes home and the room rides the bike on.

**Data.** Settings, mode, the repair bill a quit would cost, and whether that bill would pass the credit limit.

**Rules.** Quitting a career race is charged as a wreck so that a player cannot dodge a fine or a bad finish by quitting. Closing or reloading the page is the same quit by another route, which is why the active-race record exists: the next load charges the wreck once. A quit or wreck in the finale costs the same and leaves the finale open; it does not end the career unless the debt check does. The frame loop must stop stepping the simulation while paused; nothing in `packages/sim` changes.
