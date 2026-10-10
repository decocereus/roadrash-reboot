# Game design

Drafted October 10, 2026. This document describes the game that steps 5 and 6 of `docs/architecture.md` build: the career, money, bikes, weapons, police, cast, story, multiplayer, and ads. The companion documents are `screens.md` (every screen), `art-direction.md` (look and sound), and `tracks.md` (the five roads as `TrackPlan` data). All numbers in the four documents are the same numbers; if one changes, change it everywhere.

Every name, line, road, and bike here is original. Section 15 lists the checks against the original games' names.

## 1. Title

| Option | Why it works | Risk |
| --- | --- | --- |
| **LOWSIDE** | A lowside is the crash where the bike slides out from under you. It is also the name of the bar where the career lives, so the title, the hub, and the subject are one word. Short, easy to say, reads well in a condensed face. | Needs a trademark and store-name search before use. |
| **SHOULDER CHECK** | The road shoulder plus the hit you give a rival. It describes the game in two words and is a little funny. | Long for a logo; reads as a hockey term to some players. |
| **HARD SHOULDER** | British road term with a fighting edge. | Less clear to American players; a common phrase that may already be taken by other media. |

Recommendation: **LOWSIDE**. If the search finds a conflict, keep **RUSHLINE**, which the code and docs already use. The rest of this document says "the game" so either name drops in.

## 2. Pillars

**Riding you can trust.** Steering is direct and the bend physics are visible: a player who goes into the grass can say why. Every bike is a `BikeSpec`, so a better bike is a different set of numbers, never a different model. Fights never take control away for longer than the short hit stun.

**Fights with consequence.** A punch moves a rider sideways on a real road with real cars. Knocking someone down costs them places and might get them arrested. A stolen weapon stays stolen. A fall that ends in a bust or a wreck costs money that the player had plans for.

**Money that matters.** Prize money is the only way to a faster bike. Fines and repair bills come out of the same purse. Going broke is possible and has a clear rule. The player always knows what the next bike costs and how far away it is.

**A cast that remembers.** Ten named rivals race the whole season. Each remembers what happened in the last race with you: who knocked whom down, who stole what, who won by a wheel. Their lines and their aggression toward you change because of it.

## 3. Modes

**Career** is the main game: five levels, five roads, money, the bike shop, the cast, and the story. It saves to the browser after every race.

**Single Race** picks any road at any level the player has reached in a career (all of level 1 is open from the start), any bike in the catalogue the player has ever owned, and a random field. No money changes hands. It is the quick session and the place to learn a road.

**Multiplayer** comes after the career, in step 6. Two to eight players race on the same deterministic simulation run in a Cloudflare Durable Object, with AI filling empty grid slots. Section 12 describes it.

## 4. Career structure

### Levels and roads

There are five levels. Each level has the same five roads, one per region. A road at a higher level is the same road with more appended to the end, more traffic, and more police: the opening kilometres are familiar and the new part is where the level's difficulty lives. The roads are described in `tracks.md`.

| Region | Road | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 |
| --- | --- | --: | --: | --: | --: | --: |
| Salt Coast | Breakwater Run | 3.90 km | 5.05 km | 6.20 km | 7.35 km | 8.50 km |
| Cinder Flats | Cinder Wash | 4.40 km | 5.55 km | 6.70 km | 7.85 km | 9.00 km |
| Kettle Woods | Hollow Pine Road | 3.60 km | 4.75 km | 5.90 km | 7.05 km | 8.20 km |
| Lowtown | Slag Row | 4.00 km | 5.15 km | 6.30 km | 7.45 km | 8.60 km |
| Stonepeak | Ridge Road | 4.25 km | 5.40 km | 6.55 km | 7.70 km | 8.85 km |

Each level adds 1,150 m to every road. At a race average of about 42 m/s, a level-1 race lasts 90 to 110 seconds of riding and a level-5 race about 3.5 minutes, plus whatever time the player spends lying in the road. That keeps a single race inside a browser session's patience while still making level 5 feel like a long haul. A 9 km road is 9,480 samples with lead-in and runoff, which the compiler and the 60 Hz step handle without change.

### The field

Every race has **8 racers: the player and 7 rivals.** The reasons:

- Eight riders stay bunched for the first minute, so the opening fight happens on every road. With fifteen, the field strings out and most riders are dots.
- Seven rivals out of a cast of ten means every race has a different mix, but the player sees each rival in most races, which the memory system needs.
- It is a reasonable draw cost on an integrated-graphics laptop: eight rigged riders plus up to five police and the traffic.
- Multiplayer races hold up to eight players. Career and multiplayer use the same field size, so the same roads, police counts, and balance work for both.

Field selection: the two rivals whose home is the road's region always race there. The other five are drawn from the remaining cast with the race seed. Juno Kade does not race at level 1 ("she doesn't race new meat"), so at level 1 the draw excludes her. At level 5, Ridge Road's field always includes her.

### Qualification

**Finish in the top 3 to qualify a road.** Qualify all five roads in a level to move up. Roads can be raced in any order and retried as often as the player wants; each attempt pays prize money for whatever place it earns. A qualified road can be raced again for money but does not need to be.

Top 3 of 8 is a little more forgiving than the originals' ratios. That is deliberate: the browser player is often new, the session is short, and the real pressure comes from money, not from qualification alone.

A busted or wrecked rider does not finish, so the race does not qualify and pays no prize.

### Unlocks

| Reached | Unlocks |
| --- | --- |
| New career | All five level-1 roads. Shop stock: Gutter Pup 250, Halden Wren 400, Halden Kite 500, Ostra Sesta 600. |
| Level 2 | Level-2 roads. Shop adds Ostra Sette 750 and Brack Stoker 800. Pool cue appears in the field. Story: the envelope. |
| Level 3 | Level-3 roads. Shop adds Halden Meridian 900. Stop sign appears. First police roadblocks. Dee turns ally. |
| Level 4 | Level-4 roads. Shop adds Brack Anvil 1100. Unarmed rivals with aggression 0.5 or more start with a club. |
| Level 5 | Level-5 roads. Shop adds Ostra Nera 1000. Ridge Road at level 5 is the finale and opens only after the other four level-5 roads are qualified. |
| Career end | The ending screen, then Single Race at every level. |

### Going broke and game over

Bills (fines and repairs) can take cash below zero. While the player owes money:

- prize money pays the debt first;
- the shop is closed for buying, but selling still works.

Each bike has a **credit limit equal to half its trade-in value**. The Gutter Pup has a fixed limit of $750. If debt goes past the limit:

- on any bike but the Pup, the shop repossesses it. It is sold at trade-in value, the debt is paid, any remainder becomes cash, and the player rides away on a Gutter Pup;
- on the Pup, the career is over. The Game Over screen shows the season's record and offers a new career. There is no paid or ad-funded continue.

This keeps one clear threat in view (lose the bike), gives a second chance on a funny bike, and makes the end real.

## 5. Economy

### Money in

Starting cash is **$1,500** and a **Halden Wren 400**.

Prize money by finishing place. Level 1 is the base; later levels multiply it by 1.6, 2.4, 3.4, and 4.6.

| Place | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 |
| ----: | ------: | ------: | ------: | ------: | ------: |
|     1 |  $1,500 |  $2,400 |  $3,600 |  $5,100 |  $6,900 |
|     2 |  $1,000 |  $1,600 |  $2,400 |  $3,400 |  $4,600 |
|     3 |    $700 |  $1,120 |  $1,680 |  $2,380 |  $3,220 |
|     4 |    $400 |    $640 |    $960 |  $1,360 |  $1,840 |
|     5 |    $250 |    $400 |    $600 |    $850 |  $1,150 |
|     6 |    $150 |    $240 |    $360 |    $510 |    $690 |
|     7 |    $100 |    $160 |    $240 |    $340 |    $460 |
|     8 |     $50 |     $80 |    $120 |    $170 |    $230 |

### Money out

A **spill** (thrown, run back, remount) costs only time. A **wreck** happens when the bike's condition reaches zero (section 14 describes condition); the race ends and the bike is repaired for a bill. A **bust** ends the race with a fine. Bikes are repaired free between races after an ordinary race; only a wreck sends a bill.

| Level | Repair base | Featherweight (×1) | Middleweight (×1.5) | Heavyweight (×2) | Police fine |
| --: | --: | --: | --: | --: | --: |
| 1 | $400 | $400 | $600 | $800 | $500 |
| 2 | $700 | $700 | $1,050 | $1,400 | $900 |
| 3 | $1,100 | $1,100 | $1,650 | $2,200 | $1,500 |
| 4 | $1,600 | $1,600 | $2,400 | $3,200 | $2,200 |
| 5 | $2,200 | $2,200 | $3,300 | $4,400 | $3,000 |

Heavier bikes cost more to fix, so a faster bike is also a bigger bet.

### Trade-in

Trade-in value is **60% of the bike's list price**, whatever its history, because bikes are repaired between races. The Gutter Pup's trade-in value is $0: nobody wants it. The shop shows "cash + trade-in" as the spending power for each bike.

### The envelope

At level 2 the promoter offers an envelope (section 11). Taking it pays **$1,500** at once. If the player then finishes ahead of Tristan Lux on Breakwater Run at level 2, the promoter takes back **$2,000**. The bill follows the normal debt rules.

### Pacing

A decent player qualifies each level with about eight starts, including one failed finish, one bust, and one wreck. That player can step up one bike every level and one class every other level: Wren at level 1, Sesta 600 at level 2, Sette 750 at level 3, Meridian 900 at level 4, Anvil 1100 at level 5. A player who wins most races can afford the Nera 1000 during level 5.

| After level | Cash at end | Trade-in | Buys | Cash left |
| --: | --: | --: | --- | --: |
| 1 (Wren) | $6,550 | $1,800 | Ostra Sesta 600, $8,000 | $350 |
| 2 (Sesta) | $7,920 | $4,800 | Ostra Sette 750, $11,000 | $1,720 |
| 3 (Sette) | $12,850 | $6,600 | Halden Meridian 900, $18,500 | $950 |
| 4 (Meridian) | $15,780 | $11,100 | Brack Anvil 1100, $26,000 | $880 |
| 5 (Anvil) | $20,850 |  |  |  |

Each level in that table uses the same eight results as the worked example below, scaled by the level's prize, repair, and fine tables.

### Worked example: a level-1 season

| Start | Road | Result | Money | Cash after |
| --: | --- | --- | --: | --: |
|  |  | New career, Halden Wren 400 |  | $1,500 |
| 1 | Slag Row | 3rd, qualified | +$700 | $2,200 |
| 2 | Breakwater Run | 5th, not qualified | +$250 | $2,450 |
| 3 | Breakwater Run | 2nd, qualified | +$1,000 | $3,450 |
| 4 | Hollow Pine Road | Busted at the Sawmill Hook | −$500 | $2,950 |
| 5 | Hollow Pine Road | 1st, qualified | +$1,500 | $4,450 |
| 6 | Cinder Wash | Wrecked in the third wash | −$400 | $4,050 |
| 7 | Cinder Wash | 2nd, qualified | +$1,000 | $5,050 |
| 8 | Ridge Road | 1st, qualified; level 2 | +$1,500 | $6,550 |

At the start of level 2 the Wren trades in for $1,800, giving $8,350 of spending power. The player can buy the Sesta 600 for $8,000 and keep $350, or buy the Kite 500 for $5,000 and keep $3,350. With $350 in hand, a level-2 wreck on the Sesta ($1,050) leaves the player $700 in debt, well inside the Sesta's credit limit of $2,400. The choice is the point: the faster bike makes level 2 easier to qualify and one bad week more dangerous.

## 6. Bike catalogue

### Classes

**Featherweight** bikes are light and steer quickly, with high lateral speed and a soft `curvePush`, so bends barely move them. They top out low, so they lose every straight. A Featherweight takes most level-1 bends flat out, which is why the career starts on one.

**Middleweight** bikes are the reference. The Ostra Sesta 600 is today's `streetBike`, number for number, so the tests that pin the feel keep meaning what they mean now.

**Heavyweight** bikes are fast and stop well, but a lower `curvePush` means bends push them wider, and a lower `steerResponse` and `lateralSpeed` make them slower to answer the bars. At level 5 their top speed is wasted on a rider who cannot brake for the bends.

### The nine bikes

Top speed is where `powerPerMass / v` meets drag plus rolling deceleration. "Switchback" is the highest speed at which full steer holds Ridge Road's 50° right (section 9 of the road table, radius 136 m); a bike whose top speed is below it takes that bend flat out.

| Bike | Class | Price | Top speed | 0 to 100 km/h | Switchback | Pitch |
| --- | --- | --: | --: | --: | --: | --- |
| Gutter Pup 250 | Featherweight | $1,000 | 151 km/h | 5.8 s | 199 km/h, flat | Zip ties, spite, and a seat from a different bike. Too slow to fly off the Saddle. |
| Halden Wren 400 | Featherweight | $3,000 | 177 km/h | 4.0 s | 222 km/h, flat | Light, honest, and forgiving. Takes every level-1 bend on the Ridge flat and still loses to people who brake. |
| Halden Kite 500 | Featherweight | $5,000 | 190 km/h | 3.8 s | 209 km/h, flat | The Wren with more lungs. Still turns before you finish deciding to. |
| Ostra Sesta 600 | Middleweight | $8,000 | 209 km/h | 3.5 s | 194 km/h | The bike everyone measures against. Fast enough to need the brakes, light enough to forgive you. |
| Ostra Sette 750 | Middleweight | $11,000 | 218 km/h | 3.4 s | 189 km/h | More of everything the Sesta does, and a little less patience in the bends. |
| Brack Stoker 800 | Middleweight | $13,500 | 207 km/h | 3.1 s | 181 km/h | Tops out early, leaves the line like it was kicked. Built for riders who fall off a lot. |
| Halden Meridian 900 | Heavyweight | $18,500 | 228 km/h | 3.2 s | 189 km/h | The heavyweight that still listens to the handlebars. |
| Brack Anvil 1100 | Heavyweight | $26,000 | 238 km/h | 3.0 s | 171 km/h | Straights are a formality. Bends are a negotiation. |
| Ostra Nera 1000 | Heavyweight | $34,000 | 249 km/h | 2.8 s | 181 km/h | The fastest thing in the Lowside car park, and it knows it. Brake early or brake in the trees. |

The Gutter Pup is the joke bike and the repossession bike. Its slow `steerResponse` makes it wallow, its brakes are weak, and its top speed is below the 162 km/h launch speed of Ridge Road's Saddle, so it only gets air on the sharpest humps, such as the Slag Row rail crossing and the later washes on Cinder Wash. The Brack Stoker is the sideways choice: lower top speed than the Sette for more money, but the best launch in its class and the strongest brakes, which matters to a rider who spends a lot of time remounting from zero.

### BikeSpec numbers

`name` is the bike name above. The Sesta row is `streetBike` unchanged.

| Bike | launchAcceleration | powerPerMass | dragFactor | rollingDeceleration | engineBraking | brakeDeceleration | lateralSpeed | lateralSpeedPerSpeed | steerResponse | curvePush | visualLean |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| Gutter Pup 250 | 6.0 | 120 | 1.40e-3 | 0.40 | 1.0 | 8.0 | 9.5 | 0.030 | 11 | 2.00 | 0.46 |
| Halden Wren 400 | 7.6 | 181 | 1.42e-3 | 0.25 | 1.1 | 10.5 | 10.0 | 0.035 | 19 | 2.30 | 0.44 |
| Halden Kite 500 | 8.0 | 219 | 1.40e-3 | 0.25 | 1.15 | 10.8 | 9.6 | 0.033 | 18 | 2.15 | 0.41 |
| Ostra Sesta 600 | 8.5 | 284 | 1.38e-3 | 0.25 | 1.2 | 11.0 | 9.0 | 0.030 | 16 | 2.00 | 0.38 |
| Ostra Sette 750 | 8.8 | 318 | 1.36e-3 | 0.25 | 1.25 | 11.2 | 8.8 | 0.030 | 15.5 | 1.95 | 0.37 |
| Brack Stoker 800 | 9.6 | 300 | 1.50e-3 | 0.28 | 1.6 | 12.0 | 8.6 | 0.028 | 14 | 1.85 | 0.34 |
| Halden Meridian 900 | 9.2 | 354 | 1.33e-3 | 0.25 | 1.3 | 11.8 | 9.0 | 0.031 | 16 | 1.90 | 0.37 |
| Brack Anvil 1100 | 10.0 | 395 | 1.30e-3 | 0.27 | 1.5 | 11.5 | 8.4 | 0.027 | 13 | 1.70 | 0.33 |
| Ostra Nera 1000 | 10.4 | 436 | 1.27e-3 | 0.25 | 1.35 | 12.5 | 8.8 | 0.029 | 15 | 1.80 | 0.36 |

How the numbers were derived from the Sesta:

- `powerPerMass` sets top speed through the cube root of `powerPerMass / dragFactor`. Featherweights also carry slightly more drag, because a small bike with an upright rider is not slippery.
- `curvePush` falls with weight. The push at a given speed is `curvature · speed² / curvePush`, so the Anvil at 1.70 is pushed 18% harder than the Sesta at the same speed, and the Wren at 2.30 13% less.
- `lateralSpeed`, `lateralSpeedPerSpeed`, and `steerResponse` are highest on the Featherweights. The Meridian keeps the Sesta's steering, which is what you pay for.
- `brakeDeceleration` rises with class, but the traction limit in `rider.ts` caps it in a bend anyway. `engineBraking` is highest on the Stoker and Anvil (big engines).
- `visualLean` is larger on light bikes so a Wren looks busy and an Anvil looks planted.

Rivals ride these same specs. The sim gives every rider the shared `RaceState.bike` today; section 14 lists the change.

## 7. Weapons

### The set

The four existing weapons stay as they are. Two new ones fill gaps the set does not cover: a long, fragile reach weapon and a slow, huge hit.

| Strike | Damage | Shove | Reach (along × across) | Hits | ticks / strikeTick / cooldown | First appears |
| --- | --: | --: | --- | --: | --- | --- |
| Fist | 14 | 1.6 | 1.9 × 2.2 m |  | 16 / 10 / 30 | Level 1 |
| Boot | 22 | 3.2 | 1.9 × 2.2 m |  | 26 / 16 / 45 | Level 1 |
| Club | 28 | 3.8 | 2.2 × 2.6 m | 6 | 22 / 13 / 40 | Level 1 (Moose) |
| Chain | 20 | 2.2 | 2.6 × 3.1 m | 8 | 22 / 13 / 38 | Level 1 (Dee) |
| Crowbar | 22 | 2.8 | 2.2 × 2.6 m | 4 | 20 / 12 / 36 | Level 1 (Mags) |
| Baton | 18 | 2.4 | 2.2 × 2.6 m | 12 | 20 / 12 / 36 | Level 1 (police, Lyle) |
| **Pool cue** | 15 | 1.8 | 3.0 × 3.4 m | 3 | 18 / 11 / 30 | Level 2 (Coach) |
| **Stop sign** | 32 | 4.6 | 2.4 × 2.8 m | 3 | 30 / 18 / 54 | Level 3 (Gus) |

The pool cue reaches a rider in the next lane but snaps after three hits, so it is a weapon to steal, use, and lose. The stop sign is the biggest hit in the game and the slowest: half a second of wind-up that a watchful rider can steer away from. It reads at a distance because it is a red octagon on a pole.

Both need new `WeaponKind` values (`"cue"`, `"sign"`) and entries in `weapons.ts`. No other code changes.

### By level

| Level | Armed at the start |
| --: | --- |
| 1 | Moose (club), Dee (chain), Mags (crowbar), Lyle (baton). Police carry batons. |
| 2 | As level 1, plus Coach (pool cue). |
| 3 | As level 2, plus Gus (stop sign). |
| 4 | Unarmed rivals with aggression 0.5 or more start with a club (Ines). |
| 5 | As level 4. Juno, Tristan, and Ruth Ann still start unarmed; Juno never carries one. |

### The stealing loop

The sim already has the loop; the career adds what happens afterwards.

1. An unarmed rider kicks an armed one and takes the weapon (`weaponTaken`). This includes police: kicking a cop takes the baton.
2. A thrown rider drops whatever they hold, and it is gone.
3. A weapon breaks after its hit count (`weaponBroken`).
4. **New:** a weapon the player still holds at the finish line carries into the next race with the hits it has left. A busted player loses it (the sim already disarms on bust).
5. **New:** the rival it was stolen from starts the next race with a fresh one, holds a grudge (section 10), and the clubhouse board posts about it.

The loop that results: arrive unarmed, find the armed rider, line up a kick, keep the weapon alive to the finish, and come back next race to someone who wants it back.

## 8. Police

### Escalation

Police keep their current rules: a cop chases a downed racer within 60 m first, then the nearest riding racer within sight range, and busts a racer whose body is within 2.5 m while they are off the bike. Cops are placed 700 m into the road and every 1,600 m after that. With five cops at level 5, the last one sits at 7.1 km, which fits every level-5 road.

| Level | Cops | Pursuit top speed | Sight range | Roadblocks |   Fine |
| ----: | ---: | ----------------: | ----------: | ---------: | -----: |
|     1 |    1 | 46 m/s (166 km/h) |        40 m |          0 |   $500 |
|     2 |    2 | 50 m/s (180 km/h) |        40 m |          0 |   $900 |
|     3 |    3 | 54 m/s (194 km/h) |        45 m |          1 | $1,500 |
|     4 |    4 | 58 m/s (209 km/h) |        50 m |          2 | $2,200 |
|     5 |    5 | 62 m/s (223 km/h) |        60 m |          3 | $3,000 |

The pursuit top speed always stays below the top speed of the bike a decent player rides at that level (Wren 177, Sesta 209, Sette 218, Meridian 228, Anvil 238 km/h). A rider who holds the throttle on a straight escapes; a rider who brakes, fights, or falls does not. Level 3 is today's `COP_TOP_SPEED` and `BUST_FINE`.

### Roadblocks

From level 3 a parked cruiser blocks one lane, lights on, at a seeded spot on a straight, at least 150 m past the end of the previous bend or crest. At 238 km/h, 150 m of sightline is more than two seconds. Roadblocks alternate sides. Hitting one is a traffic crash. The parked officer does not chase. In the sim a roadblock is a traffic car with zero cruise speed that ignores the follow logic; the renderer draws it as a cruiser.

From level 3, Dee's tip (section 11) shows the first roadblock's distance on the Route Board.

### Busted

A bust ends the race. The rider is placed after all finishers, gets no prize, pays the level's fine, and loses any weapon. If the fine takes cash below zero, the debt rules in section 4 apply. The Busted screen shows one of two officers and one of their lines.

| Officer | Who they are |
| --- | --- |
| **Sergeant Dolores Pike** | Nineteen years on the coast highway. Dry, unbothered, enjoys the paperwork more than the chase. Patrols Breakwater Run, Ridge Road, and Cinder Wash. |
| **Deputy Wendell Haverty** | Six weeks into the job, eager, apologetic, and secretly thrilled. Patrols Slag Row and Hollow Pine Road. |

Sergeant Pike's lines:

1. "Pay at the window. The window is me."
2. "Nineteen years writing tickets. You're the first one I've enjoyed."
3. "Tell your friends you met me. You can tell them from the back seat."

Deputy Haverty's lines:

1. "Okay, so, technically you're under arrest? Sorry. Is that okay?"
2. "This is my first bust! Can you hold still? It's for my mom."
3. "I'm supposed to read you your rights, but I left them in my other pants."

## 9. Rival cast

### Summary

| Rival | Age | Home | Skill | Aggression | Starts with | Bike paint | Jacket |
| --- | --: | --- | --: | --: | --- | --- | --- |
| Juno Kade | 34 | Stonepeak | 0.99 | 0.25 | Nothing, ever | `#15171B` black, gold stripe `#D4A63A` | `#15171B` |
| Ruth Ann Bixby | 38 | Cinder Junction | 0.95 | 0.45 | Nothing | `#26A6A0` teal | `#A8743E` suede |
| Dee Santangelo | 20 | Lowtown | 0.93 | 0.50 | Chain | `#2F9A4E` basil green | `#D7263D` red |
| Ines Marchetti | 29 | Saltmouth | 0.91 | 0.75 | Nothing (club from level 4) | `#F2ECDF` ivory | `#F2ECDF` ivory |
| Mags Dunleavy | 58 | Cinder Junction | 0.90 | 0.60 | Crowbar | `#77806A` primer grey | `#3F4A57` coveralls |
| Lyle Gorski | 47 | Kettle | 0.90 | 0.70 | Baton | `#22335C` navy | `#8A7A55` khaki |
| Tristan Lux | 24 | Saltmouth | 0.88 | 0.35 | Nothing | `#E040A0` magenta | `#7B4FE0` purple |
| Coach Dale Hutto | 55 | Stonepeak | 0.86 | 0.55 | Pool cue from level 2 | `#E0A21B` gold | `#1E5AA8` polo blue |
| Moose Kowalczyk | 41 | Lowtown | 0.84 | 0.85 | Club | `#C2521F` rust | `#5B4632` brown vest |
| Gus Abernathy | 66 | Kettle | 0.82 | 0.65 | Stop sign from level 3 | `#6B6B3A` olive | `#C8E03A` hi-vis |

The player's default is bike `#C82F2F` red and jacket `#23262C` charcoal. Police are bike `#F4F6F8` white with `#2F6BFF` blue panels and jacket `#141C33`.

Home roads: Breakwater Run (Tristan, Ines), Cinder Wash (Ruth Ann, Mags), Hollow Pine Road (Lyle, Gus), Slag Row (Moose, Dee), Ridge Road (Juno, Coach).

### Bikes by level

Rivals move up the catalogue as the season goes on. The player's "decent" path is in the last row for comparison.

| Rival | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 |
| --- | --- | --- | --- | --- | --- |
| Juno Kade | sits out | Sesta 600 | Sette 750 | Meridian 900 | Nera 1000 |
| Ruth Ann Bixby | Wren 400 | Kite 500 | Sesta 600 | Sette 750 | Meridian 900 |
| Dee Santangelo | Wren 400 | Sesta 600 | Sette 750 | Sette 750 | Meridian 900 |
| Ines Marchetti | Kite 500 | Sesta 600 | Sette 750 | Meridian 900 | Meridian 900 |
| Mags Dunleavy | Wren 400 | Kite 500 | Stoker 800 | Stoker 800 | Anvil 1100 |
| Lyle Gorski | Wren 400 | Kite 500 | Sesta 600 | Meridian 900 | Anvil 1100 |
| Tristan Lux | Kite 500 | Sesta 600 | Sette 750 | Meridian 900 | Nera 1000 |
| Coach Dale Hutto | Wren 400 | Kite 500 | Sesta 600 | Sette 750 | Anvil 1100 |
| Moose Kowalczyk | Kite 500 | Kite 500 | Stoker 800 | Stoker 800 | Anvil 1100 |
| Gus Abernathy | Gutter Pup 250 | Wren 400 | Kite 500 | Stoker 800 | Stoker 800 |
| _Player, decent path_ | _Wren 400_ | _Sesta 600_ | _Sette 750_ | _Meridian 900_ | _Anvil 1100_ |

### The riders

Each rider has six lines: two pre-race taunts (the first is the default, the second is the grudge line chosen by section 10), a post-race line for when they beat you, one for when you beat them, a line when they knock you down, and a line when you knock them down.

#### Juno Kade

34, Stonepeak. Skill 0.99, aggression 0.25. Rides clean lines, brakes later than anyone, and never throws the first punch. She has won the circuit three years running and has never once said a newcomer's name out loud.

Juno grew up above her father's tyre shop on the Ridge and learned to ride on the road the finale is held on. She thinks fighting is for people who cannot ride, which does not stop her hitting back very hard.

Visual: tall and narrow, upright on the bike. Black one-piece leathers with a single gold stripe from collar to boot. Black helmet, dark visor, gold stripe continued over the crown. The cleanest silhouette in the field: no fringe, no patches, nothing loose.

- Taunt: "There are seven people on this grid. I counted you as a maybe."
- Grudge taunt: "You touched me last time. I wrote it down. I don't write things down."
- She beat you: "Good effort. I mean that the way people say it to children."
- You beat her: "Enjoy it. Frame something. I'll be back to normal by Thursday."
- She knocks you down: "Stay there. It suits you."
- You knock her down: "Oh, now it's personal. Congratulations, you're a person."

#### Ruth Ann Bixby

38, Cinder Junction. Skill 0.95, aggression 0.45. Takes bends like barrels at a rodeo: tight inside line, all the speed on the way out. Kicks rather than swings, and only after a warning look.

Ruth Ann grows alfalfa on forty dry acres and rode barrels until her horse retired. She treats every other rider as livestock that needs moving.

Visual: compact, sits low. Suede jacket with a short fringe along the sleeves that flutters at speed. Helmet with a moulded brim like a hat, and a long braid out the back.

- Taunt: "I've seen heifers take a corner cleaner than you."
- Grudge taunt: "You kicked me last time. Mules remember. So do I."
- She beat you: "Rode you like a fence line. Straight, then done."
- You beat her: "Well. Even a blind sow finds an acorn."
- She knocks you down: "Whoa there."
- You knock her down: "That's my good braid ruined."

#### Dee Santangelo

20, Lowtown. Skill 0.93, aggression 0.50. Rides like she is late, because she is: splits traffic, never brakes for a crest, swings the chain from either side. Turns ally at level 3 (section 11).

Dee delivers pizza for Gino's on Slag Row and races because the prize money pays better than tips. The insulated delivery box stays bolted to her bike, even on race day.

Visual: small and forward, elbows out. Red delivery jacket with a white collar. Green bike with a white top box on the tail. Open-face helmet with a sticker-covered shell.

- Taunt: "I've got a large pepperoni going cold at the finish. Move."
- Grudge taunt: "Last race cost me a tip. You owe me four dollars and an apology."
- She beat you: "Thirty minutes or less. You took thirty-one."
- You beat her: "Fine. You win. I'm still getting a one-star review because of you."
- She knocks you down: "Delivery!"
- You knock her down: "My box! Do you know how hard it is to get cheese off a highway?"

#### Ines Marchetti

29, Saltmouth. Skill 0.91, aggression 0.75. Hunts the nearest rider, any rider, and fights with whatever she can steal. She is fast in a straight line and impatient in bends.

Ines was left at the altar in June by a man named Kevin and is riding to the honeymoon hotel alone, one race at a time. She is still wearing the veil.

Visual: ivory leathers that were clearly a wedding outfit once. A torn veil tied to the back of a white helmet streams a metre behind her; it is the easiest silhouette to spot in a mirror.

- Taunt: "I was left at the altar by a man named Kevin. You look like a Kevin."
- Grudge taunt: "You knocked me down last time. Kevin also knocked me down. Emotionally."
- She beat you: "Something old, something new, something borrowed, something beat you."
- You beat her: "Fine. Throw the bouquet. Throw it at your own face."
- She knocks you down: "Speak now or forever hold your peace!"
- You knock her down: "This veil was nonrefundable!"

#### Mags Dunleavy

58, Cinder Junction. Skill 0.90, aggression 0.60. Rides whatever came into the yard that week and rides it hard. Picks one target per race and works on them with the crowbar until one of them falls.

Mags runs the scrapyard on the road out of Cinder Junction and has built a running bike out of three dead ones more times than she can count. She calls everyone sweetheart, including the police.

Visual: short and hunched over the tank. Oil-stained blue-grey coveralls, a pudding-bowl helmet, round goggles, a toothpick. Crowbar carried across the handlebars when not in use.

- Taunt: "I built my bike out of three dead ones. I'll build the next one out of yours."
- Grudge taunt: "You put me in the dirt last time, sweetheart. I've buried better in the scrap pile."
- She beat you: "Bring that bike by the yard. I'll give you forty bucks for the seat."
- You beat her: "Not bad. Your clutch sounds like a goose with a cough, though."
- She knocks you down: "Don't get up on my account."
- You knock her down: "Fifty-eight years old and you pick me? Your mother would be thrilled."

#### Lyle Gorski

47, Kettle. Skill 0.90, aggression 0.70. Rides a tidy, defensive line and swings the baton at anyone who passes him on the inside. Hates police and racers equally.

Lyle was a county deputy in Kettle until an incident involving a parade float. He kept the baton, and he still narrates everything in report language.

Visual: broad shoulders, upright like he is on patrol. Khaki uniform jacket with the patches torn off and the stitching still showing. Open-face helmet, mirrored sunglasses, thick moustache.

- Taunt: "Rider, I'm going to need you to step away from first place."
- Grudge taunt: "I've opened a file on you. It's thick. It's mostly drawings of you crying."
- He beat you: "Let the record show the suspect finished behind me. Case closed."
- You beat him: "This doesn't go in the report. There is no report. I'm not a deputy anymore."
- He knocks you down: "Stay down. That's a lawful order. Probably."
- You knock him down: "Assaulting an officer! A former officer! Same thing, morally!"

#### Tristan Lux

24, Saltmouth. Skill 0.88, aggression 0.35. Rides for the camera: holds a pretty line, avoids fights unless one would make a good clip, and slows down near anything photogenic.

Tristan livestreams every race from a phone on a chest mount and earns more from sponsors than from prizes. His father owns half the Saltmouth marina.

Visual: lean, glossy purple jacket covered in sponsor patches, phone on a chest harness, a small camera stuck to the top of a magenta helmet. Bike is new and spotless at the start of every race.

- Taunt: "Chat says you look like a substitute teacher. Chat's being nice."
- Grudge taunt: "Chat is clipping what you did last race. You're going viral, and not the fun way."
- He beat you: "GG. Chat, do not rewatch turn four, I looked weird."
- You beat him: "Chat, that was a sponsored loss. Use code CRASH for ten percent off."
- He knocks you down: "Chat, did you get that? Tell me you got that."
- You knock him down: "Not the phone! Not the phone! Is it still recording?"

#### Coach Dale Hutto

55, Stonepeak. Skill 0.86, aggression 0.55. Rides by the numbers and attacks on a schedule, because the tape says momentum is a habit. From level 2 he fights with a pool cue he calls the Pointer.

Coach Dale sold motivational cassette tapes out of his car for twenty years. He has twelve volumes left and a strong belief that each race is a teachable moment, mostly for other people.

Visual: soft round build, sits back on the bike. Blue polo shirt over a back protector, a sun visor worn over the helmet, a headset microphone he talks into the whole race.

- Taunt: "Visualise success. Now visualise this cue in your visor. That's growth."
- Grudge taunt: "You knocked me down last time. I've reframed it as a gift. Today I give it back."
- He beat you: "Winners never quit, and you, my friend, should quit."
- You beat him: "Failure is just success that hasn't been invoiced yet. Tape six, side B."
- He knocks you down: "Lesson one: gravity is your coach now!"
- You knock him down: "I'm not falling, I'm pivoting!"

#### Moose Kowalczyk

41, Lowtown. Skill 0.84, aggression 0.85. Slow into bends and immovable in them: he blocks the inside line and swings the club at anything that tries to pass. Polite about all of it.

Moose moved pianos for twenty years and has carried more weight up stairs than anyone on the circuit has lifted. His mother gave him the club.

Visual: the widest rider in the field. Brown quilted vest over a plain shirt, bare forearms, a full beard under an open-face helmet. The club rests on his shoulder like a tool he is taking to a job.

- Taunt: "Hello. I'm going to hit you with this club. I wanted to say hello first."
- Grudge taunt: "Last time you made me fall down. I've been thinking about it in the bath."
- He beat you: "Good race. Ice your face. Twenty minutes on, twenty off."
- You beat him: "You were very fast. I'll be faster after a sandwich."
- He knocks you down: "Sorry. Not sorry. Sorry, I get those mixed up."
- You knock him down: "Ow. Okay. That's fair. Ow."

#### Gus Abernathy

66, Kettle. Skill 0.82, aggression 0.65. The slowest rider in the field and the most dangerous in a straight line next to you, because from level 3 he carries a stop sign. He waits for riders to come to him.

Gus held a stop sign on road crews for forty-one years and retired without ever being allowed to use it on anyone. He took it home with him.

Visual: lanky and bent, white beard, hi-vis vest over a red flannel shirt, a helmet shaped like a hard hat. From level 3 the red octagon sits over his shoulder and rises above every other silhouette in the pack.

- Taunt: "Forty-one years I held this sign. Today I finally get to use it."
- Grudge taunt: "You ran my sign last time, kid. Nobody runs my sign."
- He beat you: "Slow and steady. Mostly slow. But steady."
- You beat him: "Back in my day the road was shorter. And I was faster. And it was uphill."
- He knocks you down: "STOP. Means stop."
- You knock him down: "That's coming out of the county's budget!"

## 10. Memory

Each rival keeps a small record about the player in the career save: their `aggressionBonus` toward the player (starts at 0), a `grudge` flag, and the incidents from the last race they shared. Incidents are read from the race's events after the finish.

| Incident in the last shared race | Detected from | Next pre-race line | Aggression bonus | Other effect |
| --- | --- | --- | --: | --- |
| You stole their weapon | `weaponTaken` with `rider` = player, `target` = them | Grudge taunt | +0.15 | Grudge flag. Board post: "MOOSE WANTS HIS CLUB BACK." They start the next race with a fresh weapon. |
| You knocked them down | `crash` with cause `combat` and `by` = player (new field) | Grudge taunt | +0.10 each, at most +0.25 | Board post naming the road and the km. |
| You beat them by a wheel | both finished, you ahead by 30 ticks (0.5 s) or less | Grudge taunt | +0.10 | Board post: "PHOTO FINISH: YOU BY A WHEEL OVER INES." |
| They got busted near you | `busted` for them while you were within 100 m | Grudge taunt | +0.05 | They blame you. |
| They got busted, you were far away | `busted` for them | Default taunt | 0 |  |
| They knocked you down | `crash` with cause `combat` and `by` = them | Default taunt | −0.05 | They are satisfied. |
| They beat you by a wheel | both finished, they ahead by 30 ticks or less | Default taunt | 0 | Board post in their favour. |
| You finished ahead and never hit them | no `hit` either way | Default taunt | −0.05 | Respect. |
| No shared incident |  | Default taunt | Moves 0.05 toward 0 |  |

Rules:

- When several incidents apply, the line comes from the highest row; bonuses add up.
- Effective aggression toward the player is `profile.aggression + aggressionBonus`, clamped to 0 to 1. Toward other riders it stays the profile value.
- The grudge flag is set when the bonus reaches 0.15 and cleared when it falls below 0.05. A rider with a grudge picks the player as their attack target whenever the player is in reach, even if another rider is closer.
- The post-race line follows the result: if they finished ahead, their "beat you" line; if you finished ahead (or they did not finish), their "you beat them" line. A rival who was busted or wrecked uses the "you beat them" line.
- The two in-race lines appear as a speech tag on the HUD for two seconds when the knockdown happens.
- Dee's bonus is fixed at −1 toward the player from level 3 (she will not attack you), unless the player knocks her down twice in one race, which ends the alliance for the rest of that level.

## 11. Story

The story is told in short screens between races: the clubhouse corkboard, text messages from rivals, and a line or two from the promoter. Nothing longer than a phone screen. It can be skipped and does not gate play, except for the level-5 finale.

**The Lowside** is a bar under the Lowtown freeway. **Vic Lomax** runs the races out of the back room: he sets the purses, takes a cut, pins the results to the corkboard, and is friendly in the way a man is friendly when you owe him money.

**Level 1: New Meat.** You roll into the Lowside car park on a Halden Wren with $1,500 and no reputation. Vic pins a Polaroid of you to the board under "NEW MEAT" and tells you the deal: top three on all five roads and you move up. Juno Kade is at the bar and does not look up. Moose introduces himself and apologises in advance. Texts arrive from numbers you never gave out ("Dee: are you the one with the red bike. you're in my lane"). When you qualify the last road, Vic moves your Polaroid up a row and writes "KID CAN RIDE" under it. Juno looks up.

**Level 2: The Envelope.** Tristan's sponsor wants a win on his home road, and Vic wants the sponsor. There is an envelope on the corkboard with your name on it and $1,500 inside; the note says "Breakwater Run. Behind the boy. V." Taking it is optional and is the only branch in the story. If you take it and beat Tristan anyway, Vic takes back $2,000 and pins a photo of your bike with a red X on it. If you leave it, the envelope is gone the next morning and Vic is very pleasant to you, which is worse. Juno races for the first time and says nothing to you at all.

**Level 3: Dee's Tip.** Dee wins a race on her home road and Vic pays her half, with a "processing fee" for the rest. She sits at your table and stops pretending to dislike you. From now on, before each race, she texts where the first roadblock will be ("cop van at 2.4 on slag row. same as always. vic knows. vic ALWAYS knows"), and she does not attack you on the road. Police roadblocks start this level, and the board fills up with tickets from riders who did not get a text.

**Level 4: The Badge.** Lyle, drunk and furious, tells you what he was really fired for: he wrote up Sergeant Pike for taking money from Vic, and the report vanished. Now the cops seem to know which riders Vic likes, and you are not one of them. Coach Dale tries to sell you tape seven. Someone writes your name in marker over the top of Juno's spot on the board; Juno crosses it out, then, after you beat her once, leaves it there. She says your name for the first time.

**Level 5: The Long Ridge.** The last race of the season is Ridge Road at full length, 8.85 km, and it opens only when you have qualified the other four roads. Juno rides it at aggression 0.9 for this one race. The finish is no longer the lookout but the summit mast, and Vic is waiting there with a cash box and two friends.

**Ending: Clean Crown.** You win the Long Ridge and never took the envelope. Sergeant Pike, who has read the room, busts Vic in the Lowside car park instead of you. Deputy Haverty asks Vic to hold still for a photo. Your Polaroid goes at the top of the board, Juno buys the first round, and Dee delivers a pizza nobody ordered.

**Ending: Bought Crown.** You win the Long Ridge but took the envelope at level 2. Vic hands you the purse and a contract: next season you ride for him. Your Polaroid goes at the top of the board, pinned through Vic's business card. Juno does not buy a round. This is the hook for a second season.

**Ending: Runner-up.** You qualify the Long Ridge but do not win it. Juno keeps the crown, sits down next to you, and says, "Next year." The board shows her Polaroid on top and yours right under it, and that is the first time anyone has put a picture there.

## 12. Multiplayer

### What it is

Two to eight players race one road at one level on the same simulation. Empty grid slots are filled by rivals from the cast, so every race has eight riders and the same police and traffic as the career. There is no money; the reward is the result and, later, a leaderboard. Each player picks a bike from the full catalogue in the lobby, so a lobby can agree on "Featherweights only" or let anyone ride the Nera.

### How it runs

One Durable Object per race holds the room, collects inputs, and runs `stepRace` itself as the authority. Clients run the same `stepRace` locally.

- **Lobby.** The host creates a room and gets a short code. Players join, pick a bike and paint, and ready up. The host picks road, level, and seed. The Durable Object sends a start message with the seed, the grid order, each rider's `BikeSpec` name and profile, and a start tick.
- **Lockstep at 60 Hz with input delay.** Each client samples its input every tick and sends it tagged for `currentTick + delay`. The default delay is 4 ticks (67 ms); the Durable Object raises it to as much as 8 ticks (133 ms) for a room with a slow player. The Durable Object collects inputs for tick N; if a player's input has not arrived by its deadline, it reuses that player's last input. It then broadcasts the input frame for tick N, and every client steps tick N with exactly those inputs. Inputs are five values (steer, throttle, brake, punch, kick) and pack into two bytes, so a frame for eight riders is small.
- **Desync check.** Every 60 ticks the Durable Object and each client hash the race state. A client whose hash differs asks for a snapshot and rejoins from it.
- **AI fill.** AI slots are driven by `pilotInput` on every client; it reads `RaceState` and uses the dice in it, so it is deterministic and needs no network input.

### Disconnects

When a player drops, their rider is not removed. The Durable Object switches that slot to `pilotInput`, and every client shows the rider's tag with a grey "AUTO" label and a toast: "Moose lost connection. The bike rides on autopilot." If the player returns within 30 seconds they get a snapshot and take the bars back at the next tick; their tag returns to normal. After 30 seconds the slot stays AI until the finish, and the results list the rider as "left" after the finishers. The host leaving does not end the race; the Durable Object owns it.

### What the sim already supports

- Determinism: no clock, no unseeded randomness, a fixed tick, and the AI's dice in `RaceState`.
- An `inputs` array indexed by rider, which is exactly a lockstep frame.
- Plain-data state that can be serialised for a snapshot or hashed.
- `pilotInput` for AI fill and disconnects.

### What it lacks

- **Per-rider ids.** Riders are array indices. Multiplayer needs a stable id per rider so input frames, events, and results cannot be misattributed if the array ever changes.
- **Per-rider bikes.** `RaceState.bike` is shared by all riders (also needed for the career).
- **Input validation.** `stepRace` trusts its inputs. The Durable Object must clamp steer to −1..1, throttle and brake to 0..1, and drop inputs for ticks already stepped, before they reach the sim.
- **Event copying.** `state.events` is cleared at the start of every step. The client renderer and the Durable Object both need the events after each tick (for audio, HUD notices, results, and memory), so the runner must copy them out each tick rather than read them later.
- **Snapshot and hash.** A function that serialises `RaceState` and one that hashes it, both deterministic.
- **Floating-point agreement.** All clients run the same JavaScript, which keeps `Math.sqrt` and the trig in the sim consistent across V8 builds in practice. The hash check above is the safety net.

## 13. Ads

The game is free and ad-funded, so ads exist, but they never touch the riding or the moment a result lands.

**Where an ad can live:**

- **Results screen,** in a fixed slot below the standings, at most one display ad per results screen, never covering the placings, money, or buttons.
- **Between races,** one interstitial at most every two completed races and at least five minutes apart, shown after the player presses Continue on Results and before the Clubhouse. Skippable after five seconds.
- **Rewarded ad for a repair discount,** offered on the Wrecked screen and on Results after a wreck: "Watch an ad, pay half the repair bill." Optional, once per wreck, and the bill is shown in full first.
- **Clubhouse,** one small static slot styled as a poster on the wall, out of the way of every button.

**Where an ad must never appear:**

- During a race, the countdown, or the pause menu.
- On the Title screen before the first race of a session.
- Over the Busted or Wrecked consequence itself; the player sees what happened and what it cost before any offer.
- As a way to undo a Game Over, skip a qualification, or reduce a police fine. Fines are the cost of getting caught; buying them down with attention would make the police meaningless.
- In the Multiplayer lobby countdown or between multiplayer races while other players wait.
- Anywhere for players who have paid to remove ads, if that option is added.

## 14. What the simulation needs

The design assumes these changes. Each one is a rule, so it belongs in `packages/sim` or `packages/track`, except where noted.

1. **Per-rider `BikeSpec`.** Move the bike from `RaceState` to each rider (or to `RiderProfile`), and read it in `rider.ts`, `pilot.ts`, and the renderer.
2. **Field of eight with chosen profiles.** `createRace` takes the list of rival profiles for this race instead of slicing `rivalProfiles`. The current names Viper, Bruiser, Slick, Ratchet, and Nova are replaced by the cast; "Viper" in particular is the name of a rider in the original game (section 15).
3. **Per-race police settings.** Cop count (already a parameter), pursuit top speed (`COP_TOP_SPEED`), sight range (`SIGHT_RANGE`), and fine (`BUST_FINE`) become race inputs. `FIRST_COP_S` and `COP_SPACING` stay.
4. **Roadblocks.** Stationary cruisers in the traffic list with zero speed that do not follow, placed by the rules in section 8.
5. **Bike condition and the wreck.** A `condition` value from 100 on each rider. Each crash takes damage by cause, scaled by impact speed over 40 m/s (clamped 0.5 to 1.5): traffic 35, prop 30, landing 25, rider 15, combat 10, off-track 10. At zero the rider enters a new `wrecked` mode, which ends their race like a bust (without a fine). About three hard crashes wreck a bike.
6. **Crash attribution.** The `crash` event gets a `by` field naming the rider whose hit or contact caused it within the last second, so memory knows who knocked whom down.
7. **Two weapons.** `"cue"` and `"sign"` in `WeaponKind` and `weapons.ts`.
8. **Weapon carry-over.** `createRace` accepts a starting weapon and hit count for the player.
9. **Grudge targeting.** The pilot's attack choice takes a preferred target index, and its aggression can differ per target.
10. **Traffic per level.** No change: a level's road is its own `TrackPlan`, and `trafficPerKilometre` is already per plan. `tracks.md` gives the values.
11. **Region scenery.** `TrackPlan` needs a `kit` field so `scatterProps` can place palms, cacti, streetlights, or pines instead of the same trees everywhere.
12. **Paint palette.** `paint` stays an index, but into a palette of twelve rider colours (`art-direction.md`), and a second index or table for jacket colour.
13. **HUD values.** Bike condition, distance to the nearest chasing cop, and distance remaining.
14. **Grid order.** The player starts in the last grid slot, behind the seven rivals, instead of on the front row.
15. **Career state.** Money, level, qualified roads, owned bike, carried weapon, rival memory, and story flags are plain data advanced by plain functions after each race. They are rules, so they should live in a deterministic package (a new `packages/career`, or a `career` module in `packages/sim`), not in React.

## 15. Originality check

Checked against every name in the research note and the 25 reference captures:

- **Riders.** None of the ten rivals or two officers shares a first name, surname, or nickname with a rider or officer named in the reference (including the 1991, 1992, 1994, 1995, and later casts and the officers seen in the captures). The existing sim name **Viper** does match a rider in the original game's results screen and must be replaced.
- **Bikes.** No bike name or maker matches the reference catalogues (none of the original makers, models, or the original class names). Two draft names were dropped during this check: "Mule", a Kawasaki product name, and "Ultima", an Electronic Arts game series.
- **Roads and regions.** Salt Coast, Cinder Flats, Kettle Woods, Lowtown, Stonepeak, and the five road names do not match any original route or location name. Ridge Road is ours already.
- **Places.** The Lowside, Gino's, and the scrapyard are ours. The reference clubhouse, shop, and restroom names are not used, and there is no restroom options menu.
- **Lines.** Every line was written for this cast. None quotes or paraphrases a line visible in the captures or quoted in the research note.
- **Weapons.** Club, chain, crowbar, and baton are generic objects already in the game. The pool cue and stop sign do not appear in the reference weapon lists; the reference spray, prod, and oil weapons were deliberately avoided.
- **Title.** LOWSIDE, SHOULDER CHECK, and HARD SHOULDER do not contain "Road" or "Rash". A trademark search is still needed.
