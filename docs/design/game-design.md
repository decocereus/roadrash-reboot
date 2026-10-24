# Game design

Drafted October 10, 2026. This document describes the game: the career, money, bikes, weapons, police, cast, story, multiplayer, and ads. Section 0 is the launch direction agreed on October 23, 2026. Where a later section disagrees with it, section 0 is the target, and the later section describes the current build until that part is rebuilt. The companion documents are `screens.md` (every screen), `art-direction.md` (look and sound), and `tracks.md` (the five roads as `TrackPlan` data). All numbers in the four documents are the same numbers; if one changes, change it everywhere.

Every name, line, road, and bike here is original. Section 15 lists the checks against the original games' names.

## 0. Launch direction

Agreed with the owner on October 23, 2026. `docs/architecture.md` has the lanes and milestones that build it.

- **Launch.** Free, on the game's own site, desktop only, spread by clips. Launch needs three finished cities, all six celebrities, multiplayer, payments, and sign-in. There is no date. More cities and celebrities come in updates.
- **Audience.** People who played Road Rash and want a game with the same mechanics.
- **World.** A near-future version of the real one. Illegal road races are streamed around the world, and people watch them and bet on them inside the story. The streets have ordinary pedestrians. The police are a company's private security, the junction lights are its "smart city" system, and cops react to a rider who runs a red light.
- **Race director.** Code that decides which obstacles appear where and how they move. It is not a character in the story.
- **Cast.** Parodies of real celebrities, six at launch: Elon Musk, Sam Altman, Kylie Jenner, Ranveer Singh, Cristiano Ronaldo, and Kylian Mbappé. Each gets a parody name and a recognisable caricature, never a real name, photo, or exact likeness. Each one's personality comes from the public memes about them: Ronaldo as a vain, beloved superhero with something rotten underneath, after the memes comparing him to Homelander, without that character's name or costume; Mbappé after the memes of him as a dictator; Musk and Altman with their feud. Ordinary riders fill the rest of the field. Section 9's sixteen rivals stay in the build until the new cast lands, and their skill, aggression, weapons, and grudges are the templates for it.
- **The player.** Your own rider, an unknown climbing the league, with the celebrities as named rivals. Each celebrity's story plays out as a scene inside the career. Beating a celebrity in their story moment unlocks them for single races and multiplayer.
- **Cities.** Each launch city hosts a pair of celebrities on an existing road shape. Landmarks are parodied, not copied.

| City | Road shape | Celebrities | The road |
| --- | --- | --- | --- |
| Madrid | Slag Row, city | Ronaldo and Mbappé | Real Madrid's old king against its new one. Pedestrians and red-light junctions go here first. |
| Mumbai | Breakwater Run, coast | Ranveer Singh and Jenner | Marine Drive, a sea-link bridge, and monsoon nights in the wet night look. Their rivalry is invented. |
| Bay Area | Ridge Road, mountain | Musk and Altman | A parody of Skyline Boulevard, the motorcycle road along the hills above Silicon Valley. |

- **Career.** Three levels across the three cities: nine qualifying races and a finale. Ten riders a race. The number of levels and the field size come from the race rules the server serves (section 12), so changing either means re-measuring the economy, bust rates, road lengths, and bikes by level, not rewriting code. The career tables are written for five levels, which section 4 calls rungs, and a career with fewer levels spreads them over its levels. Sections 4, 5, and 10 carry measurements at ten riders and three levels; section 8's bust rates were measured with five levels and fifteen riders.
- **Bikes.** Parodies of real bikes (Ducati, Kawasaki Ninja, Aprilia, Yamaha, and so on) under parody brands with no logos, and near-future prototypes at the top, each from a celebrity's company. Three tiers after the real-world convention: starter (400 cc and up), mid-tier (600 cc and up), and litre (1000 cc and up). Six bikes at launch, two per tier. Section 6 has the current catalogue.
- **Money.** Sponsors buy billboards along the roads, and players buy cosmetics: character skins and bike skins at listed prices. Nothing sold changes speed or handling, there are no random loot boxes, and bikes are earned with prize money, never bought. Section 13 has the billboard rules. Payments go through Polar or Dodo Payments, not yet chosen.
- **Accounts.** Anyone can play, and start a career, as a guest, and a guest's career saves in the browser. Signing in, with Discord, Google, or an emailed link, adds saving across devices and is required to buy something or to race online.
- **Multiplayer.** Rooms joined with a code, and a public Quick Race. Section 12.
- **Story.** Section 11.
- **Legal.** A lawyer reviews the cast, the bike brands, the store, and the licences of the generated 3D assets before launch. Section 15 has the parody rules.

## 1. Title

| Option | Why it works | Risk |
| --- | --- | --- |
| **LOWSIDE** | A lowside is the crash where the bike slides out from under you. It is also the name of the bar where the career lives, so the title, the hub, and the subject are one word. Short, easy to say, reads well in a condensed face. | Needs a trademark and store-name search before use. |
| **SHOULDER CHECK** | The road shoulder plus the hit you give a rival. It describes the game in two words and is a little funny. | Long for a logo; reads as a hockey term to some players. |
| **HARD SHOULDER** | British road term with a fighting edge. | Less clear to American players; a common phrase that may already be taken by other media. |

Decided October 23, 2026: **LOWSIDE** is the working name, and it may still change with the story. It needs a trademark and store-name search before launch. The code still says Rushline, and the rest of this document says "the game" so either name drops in.

## 2. Pillars

**Riding you can trust.** The bars answer the way the 1990s game's did, with most of a second to full lock and a carry-on after release, and the bend physics are visible: a player who goes into the grass can say why. Every bike is a `BikeSpec`, so a better bike is a different set of numbers, never a different model. Fights never take control away for longer than the short hit stun.

**Fights with consequence.** A punch moves a rider sideways on a real road with real cars. Knocking someone down costs them places and might get them arrested. A stolen weapon stays stolen. A fall that ends in a bust or a wreck costs money that the player had plans for.

**Money that matters.** Prize money is the only way to a faster bike. Fines and repair bills come out of the same purse. Going broke is possible and has a clear rule. The player always knows what the next bike costs and how far away it is.

**A cast that remembers.** The named rivals race the whole season. Each remembers what happened in the last race with you: who knocked whom down, who stole what, who won by a wheel. Their lines and their aggression toward you change because of it.

## 3. Modes

**Career** is the main game: your own rider, money, the bike shop, the cast, and the story. The server's race rules set three levels on the current five roads; launch has three levels across three cities and a finale (section 0). A guest's career saves to the browser after every race, and a signed-in player's saves on the server.

**Single Race** picks any road at any level the player has reached in a career (all of level 1 is open from the start), any bike in the catalogue the player has ever owned, and a random field. There is no qualification and no money: no prize, no fine, no repair bill, and nothing is written to the career. Results go back to the Single Race menu. It is the quick session and the place to learn a road.

**Multiplayer** ships at launch. Two to eight signed-in players race on the same deterministic simulation run in a Cloudflare Durable Object, with AI rivals filling the rest of the grid. Section 12 describes it.

## 4. Career structure

For launch the career becomes three levels across the three cities, nine qualifying races and a finale, with ten riders a race (section 0). The tables below are written for five levels on five roads and fifteen riders, the rules the replay fixtures still record. The server now serves ten riders and three levels.

### Rungs

The five columns of the career tables are **rungs**. A career with five levels gives each level its own rung. A career with fewer levels spreads the rungs over its levels in `packages/career/src/rules.ts`:

- Level L's field rides rung 1 + round((L − 1) × 4 / (levels − 1)). At three levels the fields ride rungs 1, 3 and 5, so level 1 is still the starter's level and the last level is still the finale's.
- Everything the field brings reads that rung. That covers rival bikes and weapons, pacing, the police and their fine, and the repair bill.
- A level also takes in the rungs between its field's rung and the one below. At three levels the bikes, story chapters and Vic's cards of rungs 2 and 3 arrive at level 2, and those of rungs 4 and 5 at level 3. Dee turns ally at the level whose field rides rung 3 or higher.
- Prizes are the rung's prizes times the number of rungs the level climbs to the next one: two at three levels and one at five. One level now has to pay for two steps of bike (section 5).
- Which bikes the rivals ride depends on the count. At three levels all nine are under some rival. At two levels the fields ride rungs 1 and 5 and nobody rides the Sesta, because Juno, its only rung-1 rider, sits out level 1.
- Road lengths, traffic and roadblock spots still follow the career level, so level 3's roads are the level-3 roads in the table below. Whether the last level should run the level-5 roads is open.

### Levels and roads

There are five levels. Each level has the same five roads, one per region. A road at a higher level is the same road with more appended to the end, more traffic, and more police: the opening kilometres are familiar and the new part is where the level's difficulty lives. The roads are described in `tracks.md`.

| Region | Road | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 |
| --- | --- | --: | --: | --: | --: | --: |
| Salt Coast | Breakwater Run | 8.50 km | 9.65 km | 10.80 km | 11.95 km | 13.10 km |
| Cinder Flats | Cinder Wash | 8.85 km | 10.00 km | 11.15 km | 12.30 km | 13.45 km |
| Kettle Woods | Hollow Pine Road | 8.05 km | 9.20 km | 10.35 km | 11.50 km | 12.65 km |
| Lowtown | Slag Row | 8.50 km | 9.65 km | 10.80 km | 11.95 km | 13.10 km |
| Stonepeak | Ridge Road | 8.55 km | 9.70 km | 10.85 km | 12.00 km | 13.15 km |

The level-1 lengths follow the original game, whose level-1 roads measure 8.0 to 8.9 km. Each level adds 1,150 m to every road; the original's growth per level was not measured. The AI pilot rides a level-1 road in 2.9 to 3.2 minutes alone on the Wren and in 3.2 to 4.1 minutes in a full field with traffic, and a level-5 race on the Meridian 900 in 5.2 to 7.2 minutes, plus whatever time the player spends lying in the road. A 13.45 km road is 13,931 samples with lead-in and runoff, which the compiler and the 60 Hz step handle without change.

### The field

The measured field is **15 racers: the player and 14 rivals**, the original's field. The reasons it was chosen:

- Fifteen riders is what the original put on the road, and the pack is the game: with fourteen rivals the player is never alone for long, and there is always someone to pass or to fend off.
- Fourteen rivals out of a cast of sixteen means every rival is in nearly every race, so the memory system sees each rider often; the draw changes which two sit out. At ten riders nine of the sixteen race and seven sit out, so a rival misses nearly half the races. Section 10's fade counts those races too.
- The pacing rule in section 9 keeps the field around the player. Without it fifteen riders string out and most of them are dots, which is why the field was eight for a while.
- Multiplayer races hold up to eight players and AI rivals fill the other seven slots, so career and multiplayer use the same field size, roads, police counts, and balance.

Field selection: the rivals whose home is the road's region always race there (three, or four on Slag Row). The rest are drawn from the remaining cast with the race seed.

Juno Kade is the one exception. She does not race at level 1 ("she doesn't race new meat"), so at level 1 no draw includes her, and Ridge Road's two home riders are Coach Dale Hutto and Ruth Ann Bixby, who stands in for Juno as the best rider left in the cast. She also keeps her own home road, Cinder Wash. From level 2 Juno takes her place back, Ridge Road's home riders are Juno and Coach, and the finale's field always includes her.

### Qualification

**Finish in the top 3 to qualify a road.** Qualify all five roads in a level to move up. Roads can be raced in any order and retried as often as the player wants; each attempt on a road that is not yet qualified pays full prize money for whatever place it earns. A qualified road can be raced again but pays less (section 5, "Repeat runs") and does not need to be.

Top 3 of 15 is the 1994 original's rule (its manual asks for third place or better; the 1991 game asked for fourth of fifteen). The pilot standing in for the decent player finishes fifth of fifteen in the median level-1 race and fourth at level 5 with the pacing rule, so a third is within reach but not given. With ten riders a third is easier. The same stand-in places in the top three in 27%, 31% and 34% of its starts at levels 1, 2 and 3, against 19% to 27% with fifteen (section 5, "Measured careers"). Qualifying stays at top 3 until play tests say otherwise. The place is one value, `QUALIFYING_PLACE` in `packages/career/src/tables.ts`; if play tests show that new players cannot qualify level 1, loosen it to 4 before touching the field or the pacing, because the real pressure is meant to come from money, not from qualification alone.

A busted or wrecked rider does not finish, so the race does not qualify and pays no prize.

### Unlocks

| Reached | Unlocks |
| --- | --- |
| New career | All five level-1 roads. Shop stock: Gutter Pup 250, Halden Wren 400, Halden Kite 500, Ostra Sesta 600. |
| Level 2 | Level-2 roads. Shop adds Ostra Sette 750 and Brack Stoker 800. Pool cue appears in the field. Story: the envelope. |
| Level 3 | Level-3 roads. Shop adds Halden Meridian 900. Stop sign appears. First police roadblocks. Dee turns ally. |
| Level 4 | Level-4 roads. Shop adds Brack Anvil 1100. Unarmed rivals with aggression 0.5 or more start with a club. |
| Level 5 | Level-5 roads. Shop adds Ostra Nera 1000. Ridge Road at level 5 is the finale and opens only when the other four level-5 roads are qualified. |
| Career end | The ending screen, then Single Race at every level. |

At three levels the rungs fold into the levels like this.

| Reached | Unlocks |
| --- | --- |
| New career | All five level-1 roads. Shop stock: Gutter Pup 250, Halden Wren 400, Halden Kite 500, Ostra Sesta 600. |
| Level 2 | Level-2 roads, with the rung-3 field. Shop adds Ostra Sette 750, Brack Stoker 800 and Halden Meridian 900. Pool cue and stop sign appear in the field. Story: the envelope. Dee turns ally. |
| Level 3 | Level-3 roads, with the rung-5 field. Shop adds Brack Anvil 1100 and Ostra Nera 1000. Unarmed rivals with aggression 0.5 or more start with a club. Ridge Road at level 3 is the finale and opens only when the other four level-3 roads are qualified. |

### Going broke and game over

Bills (fines and repairs) can take cash below zero. While the player owes money:

- prize money pays the debt first;
- the shop is closed for buying, but selling still works.

Each bike has a **credit limit equal to half its trade-in value**. The Gutter Pup has a fixed limit of $750. The debt check runs once per race, as soon as the bill is known ("Settlement and persistence" below), in this order:

1. Add the prize, then subtract the fine or repair bill. If the player took the rewarded ad (section 13), the repair bill is halved first, so the ad can keep a bike from being repossessed.
2. If debt is now more than the bike's credit limit and the bike is not the Pup, the shop repossesses the bike: it is sold at trade-in value, the debt is paid from the sale, any remainder becomes cash, and the player now owns a Gutter Pup.
3. If debt is still more than the Pup's $750 limit (after step 2, or because the player was already on the Pup), the career is over. The Game Over screen shows the season's record and offers a new career. There is no paid or ad-funded continue.

A repossession clears the debt whenever the debt is no more than the bike's trade-in value, which is the usual case. A cheap bike at a high level is the exception: a player on a Wren ($1,800 trade-in) who is $800 in debt and wrecks at level 5 ($2,200) owes $3,000, loses the Wren, still owes $1,200, and is out in one step.

This keeps one clear threat in view (lose the bike), gives a second chance on a funny bike, and makes the end real.

### Settlement and persistence

A race changes the career at exactly one moment, called settlement. Everything the player sees afterwards reads the settled result.

**When a race settles.** The race settles for the player at the tick the player's `finish`, `busted`, or `wrecked` event fires. Quitting from the pause menu settles the race as a wreck at the tick of the quit.

**How rivals are classified.** Rivals who crossed the line before that tick keep their finishing order and time. Rivals still racing at that tick, whether riding, thrown, running, or remounting, are placed behind the finishers in the order `standings` gives at that tick, which is distance covered. Busted and wrecked riders come last. The simulation may keep running for the finish animation, but nothing that happens after the settlement tick changes a place.

**What becomes final.** Places, prize money, qualification, season points, the carried weapon, and rival memory (section 10) are computed once from the state and events up to the settlement tick. A rival's bust or crash after the player has settled is not remembered.

**The bill and the write.** A fine and a repair bill are both fixed at settlement, at the full amount. Then the debt check above runs, and the result, the bill, any repossession, and the end of the career are written to the save in one step, at the settlement tick for a finish, a bust, or a wreck. A quit settles at the tick of the quit. The rewarded ad that halves a repair bill is not built; when it is, a wreck's write has to wait for the player's choice on Results.

**Margins.** A rival ahead of the player beat them "by a wheel" if they finished 30 ticks (0.5 s) or less before the player. A rival behind the player lost "by a wheel" if they were riding and 25 m or less behind when the player crossed the line. Results shows a time for every rider who finished by the settlement tick and a gap in metres for every rider who had not.

**When Results opens.** After a finish, the Finish screen plays its animation and then opens Results. After a bust or wreck, the consequence screen comes first. Results never opens before the write and never shows a number the write did not store.

**The active-race record.** When a career race starts (the tick the countdown ends), the save gets an active-race record: road, level, seed, and the bike ridden. The write that stores the result removes it. If the career loads and finds an active-race record, the page was refreshed, closed, or crashed during a race. That race is settled as a wreck: no prize, the level's repair bill for that bike, then the debt check above. The record is removed in the same write, so the charge happens exactly once however many times the page is reloaded. The Clubhouse then shows a note from Vic: "You left a race. The bike didn't make it home. V." The rewarded ad is not offered for this bill.

**Game over is written at once.** If the debt check ends the career, the save is marked over in that same write, before Results or Game Over is shown. A reload at that point opens Game Over, not the Clubhouse. `RACE AGAIN` is not offered on Results when the career is over.

**What Results needs for a bust.** A racer is only busted while off the bike, and a thrown rider has already dropped their weapon, so the sim's state at the `busted` event no longer holds either fact the ticket prints. The runner records the weapon the player held on the tick before the throw that led to the bust, and the arrest position (road, and the body's distance along it in km) at the `busted` event, before the sim moves the rider and bike onto the verge.

**Season standings.** Every settled career race scores points for all sixteen rivals and the player: 15 for 1st, 14 for 2nd, down to 1 for 15th. A busted or wrecked rider scores 0 for that race, and so does a rival who was not in that race's field. The Clubhouse board ranks by total points. Ties go to the rider with more wins, then to the rider who most recently placed better than the other in a race they shared.

**The finale.** Ridge Road at level 5 opens only when the other four level-5 roads are qualified. A top-three finish there ends the season and plays an ending (section 11). Anything else, including a quit, a wreck, a bust, or fourth place, is an ordinary result: it pays or costs what it normally would, the debt check runs as usual, and the finale stays open for another attempt. Failing the finale never ends the career by itself.

**Single Race and multiplayer.** Neither writes an active-race record or touches the career save. Single Race results go back to the Single Race menu; multiplayer results go back to the lobby.

## 5. Economy

### Money in

Starting cash is **$1,500** and a **Halden Wren 400**.

Prize money by finishing place, by rung (section 4). Rung 1 is the base; later rungs multiply it by 1.6, 2.4, 3.4, and 4.6. With five levels each level is its rung. "Three levels and ten riders" below has the prizes the served career pays.

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
|     9 |     $40 |     $64 |     $96 |    $136 |    $184 |
|    10 |     $30 |     $48 |     $72 |    $102 |    $138 |
|    11 |     $25 |     $40 |     $60 |     $85 |    $115 |
|    12 |     $20 |     $32 |     $48 |     $68 |     $92 |
|    13 |     $15 |     $24 |     $36 |     $51 |     $69 |
|    14 |     $10 |     $16 |     $24 |     $34 |     $46 |
|    15 |     $10 |     $16 |     $24 |     $34 |     $46 |

Places 9 to 15 pay pocket money, so a rider who limps home is paid something and a bust or a wreck, which pays nothing, is still worse than last.

### Money out

A **spill** (thrown, run back, remount) costs only time. A **wreck** happens when the bike's condition reaches zero (section 14 describes condition); the race ends and the bike is repaired for a bill. A **bust** ends the race with a fine. Bikes are repaired free between races after an ordinary race; only a wreck sends a bill.

| Level | Repair base | Featherweight (×1) | Middleweight (×1.5) | Heavyweight (×2) | Police fine |
| --: | --: | --: | --: | --: | --: |
| 1 | $400 | $400 | $600 | $800 | $400 |
| 2 | $700 | $700 | $1,050 | $1,400 | $900 |
| 3 | $1,100 | $1,100 | $1,650 | $2,200 | $1,500 |
| 4 | $1,600 | $1,600 | $2,400 | $3,200 | $2,200 |
| 5 | $2,200 | $2,200 | $3,300 | $4,400 | $3,000 |

Heavier bikes cost more to fix, so a faster bike is also a bigger bet.

The level-1 fine is the original's: a level-1 arrest there cost $400 every time it was measured (cash went from $1,000 to $600 to $200 over two arrests, and from $1,000 to $600 in a second career). The original's fines at levels 2 to 5, its repair bills, and its prizes have not been measured, so the rest of this table and the prize table are still our own numbers.

### Trade-in

Trade-in value is **60% of the bike's list price**, whatever its history, because bikes are repaired between races. The Gutter Pup's trade-in value is $0: nobody wants it. The shop shows "cash + trade-in" as the spending power for each bike.

### The envelope

At level 2 the promoter offers an envelope (section 11). Taking it pays **$1,500** at once. If the player then finishes ahead of Tristan Lux on Breakwater Run at level 2, the promoter takes back **$2,000**. The bill follows the normal debt rules.

### Repeat runs

Prize money depends on whether the road is already qualified at the current level.

| Road at the current level | Places 1 to 3    | Places 4 to 15 |
| ------------------------- | ---------------- | -------------- |
| Not yet qualified         | Full prize       | Full prize     |
| Already qualified         | 50% of the prize | Nothing        |

Fines and repair bills are never reduced. A repeat win at level 1 pays $750 and a repeat third pays $350, against a possible $400 fine or $400 to $800 repair. A repeat win at level 5 pays $3,450 against a $3,000 fine. Rerunning a qualified road is therefore a poor way to earn and a real way to lose, while a player who is still trying to qualify is always paid in full for the attempt. Moving up is the better trade: a third on a new level-2 road pays $1,120, more than three repeat thirds at level 1.

Single Race and multiplayer pay nothing, so the rule only applies to the career.

### Pacing

The reference is the **decent player**: eight starts per level, of which six are finishes averaging third place (2nd, 3rd, 3rd, 3rd, 3rd, and one 4th that does not qualify), one is a bust, and one is a wreck. The 4th, the bust, and the wreck all happen on roads that are not yet qualified, so every prize is paid in full.

The promise to that player is **one bike per level and one class every other level**: Wren 400 at level 1, Kite 500 at level 2, Sesta 600 at level 3, Sette 750 at level 4, Meridian 900 at level 5. The Anvil 1100 and the Nera 1000 are for players who win.

| Level | Rides | Cash at start | Prizes | Fine | Repair | Cash at end | Trade-in | Buys | Cash left |
| --: | --- | --: | --: | --: | --: | --: | --: | --- | --: |
| 1 | Wren 400 | $1,500 | +$4,200 | −$400 | −$400 | $4,900 | $1,800 | Halden Kite 500, $5,000 | $1,700 |
| 2 | Kite 500 | $1,700 | +$6,720 | −$900 | −$700 | $6,820 | $3,000 | Ostra Sesta 600, $8,000 | $1,820 |
| 3 | Sesta 600 | $1,820 | +$10,080 | −$1,500 | −$1,650 | $8,750 | $4,800 | Ostra Sette 750, $11,000 | $2,550 |
| 4 | Sette 750 | $2,550 | +$14,280 | −$2,200 | −$2,400 | $12,230 | $6,600 | Halden Meridian 900, $18,500 | $330 |
| 5 | Meridian 900 | $330 | +$19,320 | −$3,000 | −$4,400 | $12,250 |  |  |  |

Prizes are one 2nd, four 3rds, and one 4th from the level's column of the prize table. The repair is the level's bill for the class of the bike ridden.

What the table shows:

- Each purchase is the next bike up and nothing more. After level 1 the Sesta is $1,300 out of reach; after level 2 the Sette is $1,180 out of reach; after level 3 the Stoker, the sideways choice at $13,500, would leave $50.
- The Meridian is the tightest step. It leaves $330, and the Meridian's credit limit is $5,550, so a level-5 bust ($3,000) is survivable but a bust and a wreck ($4,400) before the first prize would repossess it. A careful player rides the Sette into level 5 and buys the Meridian after the first third ($3,220).
- The Anvil 1100 needs a better season. A player who wins three roads per level, places 2nd and 3rd on the other two, and pays no bills has $29,100 of spending power after level 3 and can buy the Anvil ($26,000) the day it arrives at level 4, and the Nera 1000 ($34,000) at level 5.

### The weak player

The second reference is the **weak player**: twelve starts per level, of which five are thirds that qualify the five roads, five are sevenths on roads not yet qualified, and two are wrecks. No busts.

| Level | Rides | Cash at start | Prizes | Repairs | Cash at end | Trade-in | Buys | Cash left |
| --: | --- | --: | --: | --: | --: | --: | --- | --: |
| 1 | Wren 400 | $1,500 | +$4,000 | −$800 | $4,700 | $1,800 | Halden Kite 500, $5,000 | $1,500 |
| 2 | Kite 500 | $1,500 | +$6,400 | −$1,400 | $6,500 | $3,000 | Ostra Sesta 600, $8,000 | $1,500 |
| 3 | Sesta 600 | $1,500 | +$9,600 | −$3,300 | $7,800 | $4,800 | Ostra Sette 750, $11,000 | $1,600 |
| 4 | Sette 750 | $1,600 | +$13,600 | −$4,800 | $10,400 | $6,600 | Nothing. The Meridian is $1,500 short. | $10,400 |
| 5 | Sette 750 | $10,400 | +$18,400 | −$6,600 | $22,200 |  |  |  |

What the table shows:

- The weak player still moves forward. Five thirds qualify a level whatever else happens, and the sevenths pay a little because those roads were not yet qualified.
- Progress is slow in the way that matters to the player: twelve starts per level instead of eight, so sixty races for the season instead of forty, and the fifth bike never arrives. The weak player finishes the season on the Sette.
- The margin is thin after every purchase. If both wrecks come before the first prize of a level, cash goes to $100 at level 2, to $1,800 of debt at level 3 (the Sesta's limit is $2,400), and to $3,200 of debt at level 4 (the Sette's limit is $3,300).
- Bankruptcy comes from busts and wrecks, never from slow riding. Prize money is never negative, so a player with no bills only gains: the same ten finishes without the two wrecks end level 4 with $20,700 and buy the Meridian with $8,800 to spare. Add one bust per level to the two wrecks and the Sesta leaves only $200 at the start of level 3; two wrecks and a bust before the first prize ($4,800) then pass the Sesta's $2,400 limit and cost the bike.
- Farming does not rescue a weak player. Twelve reruns of a qualified level-1 road at this player's results pay five thirds at $350, nothing for five sevenths, and cost two $400 repairs: $950 for twelve races, about $80 a race. The price of a Kite is more than sixty races away.

### Three levels and ten riders

The served career reads the rungs as section 4 sets out. Its levels ride rungs 1, 3 and 5, and each level climbs two rungs, so each pays twice its rung's prizes. A field of ten has no places 11 to 15.

| Place | Level 1 | Level 2 | Level 3 |
| ----: | ------: | ------: | ------: |
|     1 |  $3,000 |  $7,200 | $13,800 |
|     2 |  $2,000 |  $4,800 |  $9,200 |
|     3 |  $1,400 |  $3,360 |  $6,440 |
|     4 |    $800 |  $1,920 |  $3,680 |
|     5 |    $500 |  $1,200 |  $2,300 |
|     6 |    $300 |    $720 |  $1,380 |
|     7 |    $200 |    $480 |    $920 |
|     8 |    $100 |    $240 |    $460 |
|     9 |     $80 |    $192 |    $368 |
|    10 |     $60 |    $144 |    $276 |

Bills are one incident each, so they are the rung's and are not doubled. The level-1 fine is still the original's $400.

| Level | Rung | Featherweight | Middleweight | Heavyweight | Police fine |
| ----: | ---: | ------------: | -----------: | ----------: | ----------: |
|     1 |    1 |          $400 |         $600 |        $800 |        $400 |
|     2 |    3 |        $1,100 |       $1,650 |      $2,200 |      $1,500 |
|     3 |    5 |        $2,200 |       $3,300 |      $4,400 |      $3,000 |

The doubling is what keeps the promise of one bike per level. The fields jump two rungs a level, so the player has to as well. The decent player rides the Wren at level 1, the Sesta at level 2 and the Meridian at level 3, the bikes most of each field rides (section 9). The same eight starts as the five-level plan, from the same columns of the tables above:

| Level | Rides | Cash at start | Prizes | Fine | Repair | Cash at end | Trade-in | Buys | Cash left |
| --: | --- | --: | --: | --: | --: | --: | --: | --- | --: |
| 1 | Wren 400 | $1,500 | +$8,400 | −$400 | −$400 | $9,100 | $1,800 | Ostra Sesta 600, $8,000 | $2,900 |
| 2 | Sesta 600 | $2,900 | +$20,160 | −$1,500 | −$1,650 | $19,910 | $4,800 | Halden Meridian 900, $18,500 | $6,210 |
| 3 | Meridian 900 | $6,210 | +$38,640 | −$3,000 | −$4,400 | $37,450 |  |  |  |

The weak player, with the same twelve starts as before:

| Level | Rides | Cash at start | Prizes | Repairs | Cash at end | Trade-in | Buys | Cash left |
| --: | --- | --: | --: | --: | --: | --: | --- | --: |
| 1 | Wren 400 | $1,500 | +$8,000 | −$800 | $8,700 | $1,800 | Ostra Sesta 600, $8,000 | $2,500 |
| 2 | Sesta 600 | $2,500 | +$19,200 | −$3,300 | $18,400 | $4,800 | Halden Meridian 900, $18,500 | $4,700 |
| 3 | Meridian 900 | $4,700 | +$36,800 | −$8,800 | $32,700 |  |  |  |

What the tables show:

- Both players buy the Sesta after level 1 and the Meridian after level 2. The weak player gets every bike in the plan here, where with five levels the fifth never arrived, because the season has two purchases instead of four.
- The margin after each purchase is still thin. If both of the weak player's wrecks come before the first prize of a level, cash goes to $800 of debt at level 2 (the Sesta's limit is $2,400) and $4,100 of debt at level 3 (the Meridian's limit is $5,550).
- The Anvil 1100 and the Nera 1000 arrive at level 3 and are for players who win. `packages/career/src/rules.test.ts` pins both tables.

### Measured careers

At ten riders and three levels the stand-in pilot (skill 0.9, aggression 0.5) rode six whole careers through the career rules, on the same six career seeds, before and after this change. It always took the first road it had not yet qualified, and when it moved up it bought the plan's next bike if it could afford it. "Before" is the five-level tables read by career level, with the fade only on shared races, riding the Wren, then the Kite, then the Sesta. "After" is the rungs, the doubled prizes and the fade on every race (section 10), riding the Wren, then the Sesta, then the Meridian.

|  | Level | Starts | Busts | Wrecks | Median place | Top three | Net per start | Cash when the level ends |
| --- | --: | --- | --: | --: | --: | --: | --: | --- |
| Before | 1 | 13 to 26, 112 in all | 15% | 0 | 4th | 27% | $310 | $5,990 to $8,500 |
| After | 1 | 13 to 26, 112 in all | 15% | 0 | 4th | 27% | $688 | $11,300 to $17,460 |
| Before | 2 | 11 to 34, 140 in all | 17% | 0 | 5th | 21% | $347 | $9,128 to $14,600 |
| After | 2 | 10 to 19, 96 in all | 10% | 0 | 4th | 31% | $1,795 | $25,776 to $54,580 |
| Before | 3 | 10 to 19, 93 in all | 19% | 0 | 4th | 32% | $680 | $8,178 to $23,060 |
| After | 3 | 9 to 17, 87 in all | 17% | 0 | 4th | 34% | $3,490 | $58,424 to $99,740 |

What the rows show:

- **Level 1 plays nearly the same.** Its field and bills did not change, so 106 of its 112 races came out exactly as before, and the six that differ are where the new fade changed a rival's aggression. Only the prizes doubled.
- **Every career buys every plan bike.** All six bought the Sesta after level 1 and the Meridian after level 2. Before, all six rode a Kite into level 2 and a Sesta into level 3.
- **The rungs had to come with the bikes.** A first try kept the Kite at level 2 against the rung-3 field, without the doubled prizes. Top three fell to 8% of starts there, and one career took 107 starts to qualify level 2.
- **The season is 41 to 62 starts**, against 41 to 67 before and 92 to 260 with fifteen riders and five levels.
- **Money is loose for this player.** The stand-in needs about twice the plan's eight starts a level, every attempt on a road it has not qualified pays in full, and it ends the season with $58,000 to $100,000. Play tests should judge whether places 4 to 10 should pay the doubled prizes too.
- Level 2's bust rate, 10%, is below section 8's target of 12.5% to 25%. Its police are the rung-3 police, whose beat is 1,800 m, against the rung-2 beat of 5,000 m that level 2 had before.

The measurement with fifteen riders and five levels, kept for reference:

The tables above are a plan. To see what fifteen riders and 8 to 13 km roads do to it, the pilot standing in for the decent player (skill 0.9, aggression 0.5) rode six whole careers through the career rules. It always took the first road it had not yet qualified, and it bought the next bike in the pacing table whenever it moved up and could afford it. "Before" is the rules as they were with the field of fifteen: the old memory rule and a $500 level-1 fine. "After" is the memory fade (section 10) and the $400 fine. The same six career seeds were used for both.

|  | Level-1 starts | Busts | Wrecks | Median place | Top three | Net per start | Cash when level 1 ends |
| --- | --- | --: | --: | --: | --: | --: | --- |
| Before | 17 to 39, 162 in all | 11% | 0 | 5th | 19% | $228 | $6,465 to $9,235 |
| After | 10 to 38, 141 in all | 13% | 0 | 5th | 21% | $240 | $5,740 to $9,035 |

|  | Level-2 starts | Busts | Wrecks | Median place | Top three | Net per start | Cash when level 2 ends |
| --- | --- | --: | --: | --: | --: | --: | --- |
| Before | 23 to 42, 201 in all | 20% | 0 | 6th | 15% | $182 | $1,996 to $19,599 |
| After | 17 to 49, 192 in all | 16% | 0 | 5th | 16% | $241 | $9,282 to $18,731 |

The differences between the two rows are mostly noise. The memory rule changes which rival attacks whom, and that changes every race that follows, so the same seed gives a different career. What both rows show:

- **The stand-in needs about three times the plan's eight starts a level.** It places in the top three in one start in five, so qualifying five roads takes 10 to 49 starts. A level-1 race lasts 190 to 248 seconds, so level 1 takes about 35 minutes to two and a quarter hours of racing.
- **It still buys one bike per level.** Every attempt on a road that is not yet qualified pays in full, and places 4 to 8 pay $50 to $400 at level 1, so the extra starts pay for themselves. All six careers bought the Kite at level 2. After the change all six bought the Sesta at level 3, and both careers that reached level 4 bought the Sette. Before it, one career paid fourteen level-2 fines ($12,600), ended level 2 with $1,996, and could not buy the Sesta.
- **Busts, not wrecks, are the bill.** No start in 960, over all levels the twelve careers reached, ended in a wreck, and no bike fell below 25 condition. The plan's one wreck in eight starts is still a guess about human riders.

### Worked example: a level-1 season

The decent player's level 1, start by start.

| Start | Road | Result | Money | Cash after |
| --: | --- | --- | --: | --: |
|  |  | New career, Halden Wren 400 |  | $1,500 |
| 1 | Slag Row | 3rd, qualified | +$700 | $2,200 |
| 2 | Breakwater Run | 4th, not qualified | +$400 | $2,600 |
| 3 | Breakwater Run | 3rd, qualified | +$700 | $3,300 |
| 4 | Hollow Pine Road | Busted at the Sawmill Hook | −$400 | $2,900 |
| 5 | Hollow Pine Road | 3rd, qualified | +$700 | $3,600 |
| 6 | Cinder Wash | Wrecked in the Main Wash | −$400 | $3,200 |
| 7 | Cinder Wash | 2nd, qualified | +$1,000 | $4,200 |
| 8 | Ridge Road | 3rd, qualified; level 2 | +$700 | $4,900 |

At the start of level 2 the Wren trades in for $1,800, giving $6,700 of spending power. The player can buy the Kite 500 for $5,000 and keep $1,700, or stay on the Wren with $4,900 in hand and aim straight for the Sesta 600, which two level-2 thirds ($2,240) would then pay for. With the Kite and $1,700, a level-2 wreck ($700) and a level-2 bust ($900) are both covered. On the Wren, a level-2 cop (187 km/h) is nearly as fast as the bike (190 km/h, 198 tucked in). The choice is the point: the upgrade makes level 2 easier to qualify, and waiting makes the next bike come sooner.

## 6. Bike catalogue

For launch the catalogue becomes parodies of real bikes and near-future prototypes in three tiers: starter (400 cc and up), mid-tier (600 cc and up), and litre (1000 cc and up), six bikes at launch (section 0). The current bikes already sit roughly in those tiers: the Wren and the Kite are starter bikes, the 600 to 800 cc bikes are mid-tier, and the 1000 and 1100 cc bikes are litre bikes. The 250 cc Gutter Pup and the 900 cc Meridian fall outside them. The tuned handling carries over to the new bikes.

### Classes

**Featherweight** bikes are light and steer quickly, with the highest lateral speed and `steerRate`, a large `curvePush`, and the largest `leanScrub`. The push in a bend is divided by `curvePush`, so a larger value means less outward push, and `leanScrub` is how fast the bike sheds speed when it is leaned over, so a light bike slows itself into a bend. They top out low, so they lose every straight. A Featherweight takes most level-1 bends with the throttle held, which is why the career starts on one.

**Middleweight** bikes are the reference. The Ostra Sesta 600 is `streetBike` in `packages/sim`, number for number, and the default race and most of the feel tests ride it.

**Heavyweight** bikes are fast and stop well, but a smaller `curvePush` means bends push them wider, a lower `steerRate` and `lateralSpeed` make them slower to answer the bars, and a smaller `leanScrub` means a heavy bike leaned over keeps more of its speed, so it needs the brake where a light bike only needs to lean. At level 5 their top speed is wasted on a rider who cannot brake for the bends.

### The nine bikes

Retuned October 14, 2026, twice. The morning's tune fitted the Wren to the original game's measured starter bike (158 km/h, 60 mph in 6.2 s); the user played it and found the whole game slow, so the evening's tune made the lineup read like modern road bikes and gave every bike a gearbox (`docs/architecture.md`, "Riding model"). The Wren now reaches 100 km/h in 3.6 s and tops out at 190 km/h, 198 tucked in; the Nera reaches 100 in 2.6 s and tops out at 283, 294 tucked. The ladder is kept: every class is quicker and faster than the one below. Top speed is where the thrust in top gear meets drag plus rolling deceleration, seated; the tucked figure cuts drag by 14%. "Switchback" is the highest speed at which full steer holds Ridge Road's 50° right (section 9 of the road table, radius 136 m), turning in 50 m before the bend. The grip was retuned on October 15, 2026, when every `curvePush` went up by 30% and the lean scrub came in ("Bends and the lean scrub" below), and these are the retuned numbers.

| Bike | Class | Price | Top speed | Tucked | 0 to 100 km/h | Switchback | Pitch |
| --- | --- | --: | --: | --: | --: | --: | --- |
| Gutter Pup 250 | Featherweight | $1,000 | 145 km/h | 151 km/h | 7.1 s | 141 km/h | Zip ties, spite, and a seat from a different bike. Too slow to fly off anything. |
| Halden Wren 400 | Featherweight | $3,000 | 190 km/h | 198 km/h | 3.6 s | 158 km/h | Light, honest, and forgiving. Takes every level-1 bend on the Ridge with the throttle held, slowing itself in the tight ones, and still loses to people who brake. |
| Halden Kite 500 | Featherweight | $5,000 | 203 km/h | 211 km/h | 3.5 s | 149 km/h | The Wren with more lungs. Still turns before you finish deciding to. |
| Ostra Sesta 600 | Middleweight | $8,000 | 230 km/h | 239 km/h | 3.3 s | 138 km/h | The bike everyone measures against. Fast enough to need the brakes, light enough to forgive you. |
| Ostra Sette 750 | Middleweight | $11,000 | 243 km/h | 253 km/h | 3.0 s | 134 km/h | More of everything the Sesta does, and a little less patience in the bends. |
| Brack Stoker 800 | Middleweight | $13,500 | 233 km/h | 242 km/h | 3.0 s | 128 km/h | Tops out early, leaves the line like it was kicked. Built for riders who fall off a lot. |
| Halden Meridian 900 | Heavyweight | $18,500 | 253 km/h | 263 km/h | 3.0 s | 134 km/h | The heavyweight that still listens to the handlebars. |
| Brack Anvil 1100 | Heavyweight | $26,000 | 267 km/h | 278 km/h | 2.7 s | 121 km/h | Straights are a formality. Bends are a negotiation. |
| Ostra Nera 1000 | Heavyweight | $34,000 | 283 km/h | 294 km/h | 2.6 s | 128 km/h | The fastest thing in the Lowside car park, and it knows it. Brake early or brake in the trees. |

No bike holds the Switchback at its top speed: the Wren's 190 km/h is 32 km/h above its 158, and the Pup's 145 is 4 above its 141. The Wren still gets through it with the throttle held, because the lean scrub takes it from 190 into the 140s inside the bend; the Sesta, arriving at 230 against a hold of 138, is pushed wide. The Gutter Pup is the joke bike and the repossession bike. It is the exception to the Featherweight rule: its `steerRate` of 3.5 is the slowest in the catalogue on purpose, so it wallows where a Wren darts, and its `curvePush` is only the Sesta's. Its brakes are weak, and its top speed of 145 km/h, 151 tucked, is still below every launch speed in the game (the lowest is the Slag Row rail crossing at 152 km/h, `tracks.md`), so on level ground it never leaves the road. The Wren at 190 clears every crest up to that speed, so Ridge Road's Saddle at 162 is a flight on a Wren now and the AI pilot lifts for it. The Brack Stoker is the sideways choice: lower top speed than the Sette for more money, but the best launch in its class and the strongest brakes, which matters to a rider who spends a lot of time remounting from zero.

### BikeSpec numbers

`name` is the bike name above. The rows are `packages/sim/src/bikes.ts`. The steering and braking columns are the morning's fit to the original's measured starter bike, scaled by class; the drive columns were set in the evening for the modern feel; `curvePush` and `leanScrub` were set on October 15 for the bends (see the notes under the table).

| Bike | gears (redline m/s) | launchAcceleration | powerPerMass | dragFactor | rollingDeceleration | engineBraking | brakeDeceleration | lateralSpeed | lateralSpeedPerSpeed | steerRate | curvePush | leanScrub | visualLean |
| --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| Gutter Pup 250 | 18.4, 26.3, 33.7, 39.4, 43.8 | 5.2 | 126 | 1.60e-3 | 0.48 | 1.2 | 17.5 | 3.80 | 0.0214 | 3.5 | 2.43 | 0.20 | 0.46 |
| Halden Wren 400 | 22.9, 31.6, 39, 45.3, 51.6, 57.4 | 9.0 | 240 | 1.50e-3 | 0.30 | 1.5 | 23.0 | 4.00 | 0.0250 | 6.0 | 2.79 | 0.20 | 0.44 |
| Halden Kite 500 | 24.5, 33.7, 41.7, 48.4, 55.2, 61.3 | 9.3 | 281 | 1.45e-3 | 0.30 | 1.6 | 23.7 | 3.84 | 0.0236 | 5.6 | 2.60 | 0.20 | 0.41 |
| Ostra Sesta 600 | 27.8, 38.2, 47.2, 54.9, 62.5, 69.4 | 9.8 | 385 | 1.38e-3 | 0.30 | 1.8 | 24.1 | 3.60 | 0.0214 | 5.0 | 2.43 | 0.17 | 0.38 |
| Ostra Sette 750 | 29.3, 40.4, 49.9, 58, 66, 73.4 | 10.2 | 439 | 1.34e-3 | 0.30 | 1.9 | 24.5 | 3.52 | 0.0214 | 4.9 | 2.37 | 0.17 | 0.37 |
| Brack Stoker 800 | 28.1, 38.7, 47.8, 55.6, 63.3, 70.4 | 11.0 | 430 | 1.48e-3 | 0.34 | 2.4 | 26.3 | 3.44 | 0.0200 | 4.4 | 2.25 | 0.17 | 0.34 |
| Halden Meridian 900 | 30.6, 42, 51.9, 60.3, 68.8, 76.4 | 10.4 | 479 | 1.30e-3 | 0.30 | 2.0 | 25.8 | 3.60 | 0.0221 | 5.0 | 2.31 | 0.14 | 0.37 |
| Brack Anvil 1100 | 32.2, 44.3, 54.8, 63.7, 72.6, 80.6 | 11.6 | 546 | 1.26e-3 | 0.32 | 2.4 | 25.2 | 3.36 | 0.0193 | 4.1 | 2.07 | 0.14 | 0.33 |
| Ostra Nera 1000 | 34.2, 47, 58.1, 67.5, 76.9, 85.4 | 12.0 | 625 | 1.22e-3 | 0.30 | 2.1 | 27.4 | 3.52 | 0.0207 | 4.75 | 2.18 | 0.14 | 0.36 |

How the numbers were derived:

- The drive is `packages/sim/src/engine.ts`. `gears` lists the road speed at each gear's redline; the box shifts up at 96% of it and down below 58%. Thrust in a gear is `throttle × powerPerMass × torque(revs) / (redline speed × 0.79)`, where the torque hump peaks at 72% of the redline, so the bikes pull hardest in the middle of each gear and surge again after every shift. `powerPerMass` was chosen for the 0 to 100 km/h time of each class (a modern 400 in under 4 s, a superbike under 3 s) and `dragFactor` for the top speed in sixth; the drag is lower than the morning's because the redline speeds, not the drag alone, now decide where each bike runs out. `launchAcceleration` caps the pull off the line, so the lightest bikes leave the grid cleanly and the heavy ones still need the first second to hook up.
- `engineBraking` is light on purpose, 1.2 to 2.4 m/s² at the redline and fading with the revs, so coasting keeps three quarters of a bike's speed over three seconds. The morning's coast-down, fitted to the original's needle, bled half the speed in three seconds and made every lift feel like a brake.
- The Wren's steering and braking were fitted to the original starter bike's measured stop and lane change: `brakeDeceleration` 23 stops it from 190 km/h in 2.3 s and under 70 m; `lateralSpeed` 4 plus 0.025 per m/s and `steerRate` 6 give 5 m/s of sideways speed at 90 mph reached in 0.8 s, which is the road edge at 0.8 s and the shoulder at 1.0 s from the lane centre.
- Every other bike's steering, braking, and push columns are its earlier row times the Wren's ratio for that column: brakes × 2.19, lateral speed × 0.4, lateral speed per speed × 0.71, curve push × 0.89, and `steerRate` is the old `steerResponse` divided by 4. Every bike therefore stands in the same ratio to the Wren as before in the bends, and the order within and between classes is unchanged. `steerRate` is in m/s² of sideways speed: the bars move the bike's sideways speed by that much each second, toward lock and back.
- Featherweights carry slightly more drag, because a small bike with an upright rider is not slippery.
- `curvePush` falls with weight. The push at a given speed is `curvature · speed² / curvePush`, so the Anvil at 2.07 is pushed 17% harder than the Sesta at the same speed, and the Wren at 2.79 13% less. Every `curvePush` is 1.3 times what it was on October 14; the ratios between bikes are unchanged.
- `leanScrub` is the share of its speed a bike loses each second at full lock, scaled by the square of the lock: 0.20 on the Featherweights, 0.17 on the Middleweights, 0.14 on the Heavyweights. A heavy bike has more to carry through a bend, so it keeps more of its speed and asks for the brake sooner.
- `lateralSpeed`, `lateralSpeedPerSpeed`, and `steerRate` are highest on the Featherweights, with the Gutter Pup's `steerRate` as the deliberate exception. The Meridian keeps the Sesta's steering, which is what you pay for.
- `brakeDeceleration` rises with class. In a bend the brakes keep 35% of their bite at full lock, so the Nera at 27.4 still stops harder at full lock than the old catalogue did on a straight. `engineBraking` is highest on the Stoker and Anvil (big engines).
- Measured on a flat road, 0 to 100 km/h, top seated and tucked, and the stop from top speed: Pup 7.1 s, 145/151 km/h, 48 m; Wren 3.6 s, 190/198, 63 m; Kite 3.5 s, 203/211, 70 m; Sesta 3.3 s, 230/239, 85 m; Sette 3.0 s, 243/253, 93 m; Stoker 3.0 s, 233/242, 80 m; Meridian 3.0 s, 253/263, 96 m; Anvil 2.7 s, 267/278, 106 m; Nera 2.6 s, 283/294, 111 m.
- `visualLean` is larger on light bikes so a Wren looks busy and an Anvil looks planted.

Rivals ride these same specs. Each rider needs their own `BikeSpec`; section 14 lists the change. The other eight rows in `packages/sim/src/bikes.ts` should be brought in line with this table.

### The tuck

The tuck is the rider settling in, and it is where the top speeds marked "tucked" come from. The rule, in `packages/sim/src/rider-drive.ts`:

- **Settling in takes speed and time.** The rider has to hold the throttle past 0.8 with no brake, less than 0.3 of steering lock, on the road, above **120 km/h**, for **1.5 s** (90 ticks). Then the tuck eases in over about a second. On the Wren that is 120 km/h at about 5.5 s off the line and a full tuck at about 8 s; nothing happens in the first seconds of a race or below cruising speed.
- **Steering does not sit the rider up.** A settled rider stays settled through bends and through a lifted throttle. Only a brake past half, a strike, a hit, a crash, leaving the road, or dropping below **95 km/h** brings the rider up, at once, and the next tuck needs a fresh 1.5 s.
- **Steering costs a little of the tuck.** The tucked rider rises with the lock: the tuck is `1 − 0.25 × lock`, 0.75 at full lock. The drag cut is proportional, 14% straight and 10.5% at full lock, so the rider holding a long sweeper tucked is still faster than one sitting up, just by less. The user's call on October 15, 2026 was "keep it realistic, small loss".
- **The renderer hangs the rider in.** The tuck and the lean are blended together: a tucked rider in a bend rolls with the bike and the body rolls a further 18° into the turn with the head counter-rolled 9°, so the figure reads as a racer hanging into the corner. A left-right flick re-leans through the centre at the bike's own rate and never stops at the upright pose.

Before October 15 the tuck came in at 72 km/h after 0.6 s and any steering dropped it at once; the play test read that as the rider standing up every time they turned.

### Bends and the lean scrub

Retuned October 15, 2026, after the play test: "when turning corners we don't decelerate enough and that causes crashes and makes me brake, like that should still happen, but it should not be this extreme." The bikes had been made 20% faster the evening before and the grip had not followed, so the push in a bend, which grows with the square of the speed, was 44% harder at the top of each bike than when the grip was fitted, and a bike kept its full speed in a bend because steering cost only a flat 1.5 m/s² at full lock. The rule in `packages/sim/src/rider-drive.ts`:

- **Leaning scrubs speed.** Every second the bike loses `leanScrub × lock² × speed`, throttle held or not. `lock` is the share of the bike's sideways speed it is using, so a sweeper at a quarter lock costs a sixteenth of what full lock costs. On the Wren at 190 km/h full lock costs 10.6 m/s², about 38 km/h a second, which is more than the brake gives at full lock (35% of 23 m/s²). The brake is still three times stronger on the straight before the bend, so the quick way through a tight corner is still to brake first.
- **The grip is retuned for the fast lineup.** Every `curvePush` is 1.3 times the October 14 value. The hold speed on a 73 m right angle on the Wren went from 97 to 112 km/h and on the Switchback from 137 to 158.
- **The consequence is gradual.** A rider slightly over a bend's hold speed drifts out slowly while the scrub brings the speed back under it, so running wide is a few metres onto the shoulder, not a shot into the scenery. A rider far over it still leaves the road.

Measured with a probe that turns in 50 m before each bend at the speed a flat-out Wren arrives with, steers as hard as the bend needs up to full lock, and holds the throttle. Level-1 bends the Wren cannot take that way: before, 3 of 16 on Breakwater Run, 2 of 10 on Cinder Wash, 12 of 24 on Hollow Pine Road, 8 of 15 on Slag Row, and 6 of 19 on Ridge Road; after, 0, 1, 3, 7, and 0. The ones left are the tightest bends in the game: the Mesa Hairpin (67 m), the Sawmill Hook, the Widowmaker and the Kiln Hook on Hollow Pine Road (88 to 97 m, with trees at the verge), and Slag Row's seven right angles at 70 to 73 m, which is that road's design. On every one of them a lift with no brake, back on the throttle under the hold speed, gets the Wren round. The Sesta, 40 km/h faster, cannot take 4, 2, 12, 8, and 7 of the same bends with the throttle held, down from 8, 2, 21, 11, and 10. The AI pilot alone on a quiet road on the Wren finishes Breakwater Run in 178 s, Cinder Wash in 180, Hollow Pine Road in 185, Slag Row in 199, and Ridge Road in 181, against 181, 182, 191, 206, and 184 before; on the Sesta 165, 163, 178, 192, and 170 against 172, 167, 191, 202, and 178. The pilot's corner limit is the same hold speed with its 80% margin, so no pilot change was needed.

## 7. Weapons

### The set

The four existing weapons stay as they are. Two new ones fill gaps the set does not cover: a long, fragile reach weapon and a slow, huge hit.

| Strike | Damage | Shove | Reach (along × across) | Hits | ticks / strikeTick / cooldown | Lands after | First appears |
| --- | --: | --: | --- | --: | --- | --: | --- |
| Fist | 14 | 1.6 | 1.9 × 2.2 m |  | 18 / 14 / 16 | 4 ticks | Level 1 |
| Boot | 22 | 3.2 | 1.9 × 2.2 m |  | 15 / 11 / 36 | 4 ticks | Level 1 |
| Club | 28 | 3.8 | 2.2 × 2.6 m | 6 | 24 / 17 / 40 | 7 ticks | Level 1 (Moose) |
| Chain | 20 | 2.2 | 2.6 × 3.1 m | 8 | 24 / 17 / 38 | 7 ticks | Level 1 (Dee) |
| Crowbar | 22 | 2.8 | 2.2 × 2.6 m | 4 | 22 / 16 / 36 | 6 ticks | Level 1 (Mags) |
| Baton | 18 | 2.4 | 2.2 × 2.6 m | 12 | 22 / 16 / 36 | 6 ticks | Level 1 (police, Lyle) |
| **Pool cue** | 15 | 1.8 | 3.0 × 3.4 m | 3 | 20 / 15 / 30 | 5 ticks | Level 2 (Coach) |
| **Stop sign** | 32 | 4.6 | 2.4 × 2.8 m | 3 | 44 / 17 / 50 | 27 ticks | Level 3 (Gus) |

These are the numbers in `packages/sim/src/weapons.ts`. `ticks` is how long the swing lasts. `strikeTick` is the number of ticks left in the swing when the hit lands, so a strike lands `ticks − strikeTick` ticks after the press, which is the "Lands after" column, and `strikeTick` is the follow-through. `cooldown` is the shortest time from one press to the next and can be shorter than the swing: a press during the follow-through, once the hit has landed, starts the next swing at once with no return to neutral. Only the fist has a cooldown shorter than its swing, by two ticks, so only punches chain. A kick cannot be chained that way and always waits for its cooldown. Every weapon leaves its holder's steering alone except the stop sign, whose holder has 85% of the bike's `steerRate`.

The fist and the boot were first set to the original's timings, measured on its starter rider on October 12, 2026: the swing's arm fully out about 0.2 s after the key and back to neutral at 0.65 to 0.85 s; the kick's leg out at 0.20 to 0.27 s and back by 0.47 to 0.63 s. The first play test of that build, on October 14, called the punches and kicks very slow, and the player's feel wins over the capture. That build's punch was out at 0.10 s and its kick at 0.12 s, and the second play test, the same day, still called both sluggish. Frame captures showed why: the renderer eased into the strike pose and eased out of it, so the arm decelerated into the hit and faded back, and a long static hold in between read as a held arm. Ours now: punch out at 0.07 s (4 ticks) and over at 0.30 s; kick out at 0.07 s (4 ticks) and over at 0.25 s; a second punch pressed at 0.27 s starts at once and lands at 0.33 s, with no neutral pose between. The renderer no longer eases: the arm extends linearly over the wind-up and is fully out on the landing tick, holds 4 ticks, and is back in 5, and the struck rider's torso and head snap away from the hit on the landing tick and recover over the 10-tick stun. The damage per hit is unchanged. Because the fist's cooldown of 16 ticks is nearly the whole swing, mashing lands a hit every 16 ticks at most, which is 52 stamina a second against 47 before, so a fight to the ground still takes eight punches and about two seconds in reach. The kick's cooldown fell from 45 to 36 ticks, and the renderer no longer holds a strike pose through the cooldown, so a held kick key shows a kick every 0.6 s rather than a leg held out. The weapons land one to three ticks after a fist would and keep their swings and cooldowns, so the pool cue is still the quickest weapon round and the sign the slowest. The original's backhand has no strike of its own here, as before. The third play test, on October 15, asked for quicker kicks and for the original's kick shape: the rider comes up off the seat onto the pegs before the leg goes out. The kick went from 5 ticks to 4 and its swing from 20 to 15; the cooldown stays at 36, so a held kick key still lands 22 stamina every 0.6 s and a fight lasts as long as it did. The renderer spends the first 2.5 ticks rising, snaps the leg out over the last 1.5, holds it 2, pulls it in over 3, and drops back onto the seat from tick 8 to tick 13.

The pool cue has the longest reach in the game: 3.4 m across, against 3.1 m for the chain and 2.2 m for a fist. That is still not a full lane. Lanes are 3.4 to 3.8 m wide, so two riders in the middle of neighbouring lanes are at least 3.4 m apart and the cue does not connect. The holder has to close laterally first, by moving toward the lane line, and then needs far less of a move than any other weapon asks for. It snaps after three hits, so it is a weapon to steal, use, and lose.

The stop sign is the biggest hit in the game and the slowest. Its swing lasts 44 ticks with a `strikeTick` of 17, so the wind-up is 27 ticks, 0.45 s, which is the shortest wind-up a watchful rider can still steer out of: a rider 1.2 m across who steers away on the press moves 0.52 m in 27 ticks on the Sesta's bars and is just out of the sign's 2.8 m reach when it lands, and the same rider does not get clear of a club, which lands at 7. The follow-through is 17 ticks and the cooldown is 50, so the wait after the swing is 6 ticks. It reads at a distance because it is a red octagon on a pole.

Both are `WeaponKind` values (`"cue"`, `"sign"`) with entries in `weapons.ts`, and their numbers are the ones in this table.

### By level

| Level | Armed at the start |
| --: | --- |
| 1 | Moose (club), Dee (chain), Mags (crowbar), Lyle (baton), Felix (club). Police carry batons. |
| 2 | As level 1, plus Coach (pool cue). |
| 3 | As level 2, plus Gus (stop sign). |
| 4 | Unarmed rivals with aggression 0.5 or more start with a club (Ines, Orrin). |
| 5 | As level 4. Juno, Tristan, Ruth Ann, Benny, Wanda, Hollis, and Agnes still start unarmed; Juno never carries one. |

The rows are rungs (section 4). At three levels the fields carry the rung 1, 3 and 5 rows: level 2 brings the cue and the sign together, and level 3 brings the clubs.

### The stealing loop

The sim already has the loop; the career adds what happens afterwards.

1. An unarmed rider kicks an armed one and takes the weapon (`weaponTaken`). This includes police: kicking a cop takes the baton.
2. A thrown rider drops whatever they hold, and it is gone.
3. A weapon breaks after its hit count (`weaponBroken`).
4. **New:** a weapon the player still holds at the finish line carries into the next race with the hits it has left. A busted or wrecked player has nothing to carry, because a racer is only busted while off the bike and a thrown rider has already dropped the weapon (rule 2). Results still names it as confiscated (section 4, "Settlement and persistence").
5. **New:** the rival it was stolen from starts the next race with a fresh one, holds a grudge (section 10), and the clubhouse board posts about it.

The loop that results: arrive unarmed, find the armed rider, line up a kick, keep the weapon alive to the finish, and come back next race to someone who wants it back.

## 8. Police

### Escalation

A cop chases a downed racer within 60 m first, then the nearest riding racer within sight range. Cops are parked across the whole road: the first 1.5 km in, the last 1 km before the finish, and the rest evenly between, so the spacing comes from the road's length and the level's count. At level 2 that is two cops about 7.2 km apart, at level 5 five cops about 2.7 km apart, and at level 1 the single cop sits at 1.5 km. The first post was 700 m while the field was eight; with fifteen riders the pack is still bunched there, and a cop pulling into it put the stand-in player on the ground in the first kilometre in a fifth of level-1 starts, most of them at 690 to 780 m. At 1.5 km the pack has sorted itself and those falls are one in thirteen starts. Before either, cops were parked 700 m in and every 1,600 m after, which was set for the 4 km level-1 roads; once those roads ran 8.05 to 8.85 km the last 4.3 to 6.5 km of every race had no police, and the stand-in player was busted in 8% of starts against a target of 12.5% to 25%.

Each cop has a **beat**: it gives up the chase that many metres past the spot where it was parked, pulls onto the verge, and stays there. A cop that is riding to a downed racer finishes that first. Without a beat every cop the pack woke rode with it to the finish, so five cops meant five batons around the player for the last three kilometres.

| Level | Cops | Pursuit top speed | Sight range | Beat | Roadblocks | Fine |
| --: | --: | --: | --: | --: | --: | --: |
| 1 | 1 | 49 m/s (176 km/h) | 40 m | 6,000 m | 0 | $400 |
| 2 | 2 | 52 m/s (187 km/h) | 40 m | 5,000 m | 0 | $900 |
| 3 | 3 | 60 m/s (216 km/h) | 45 m | 1,800 m | 1 | $1,500 |
| 4 | 4 | 64 m/s (230 km/h) | 50 m | 1,500 m | 2 | $2,200 |
| 5 | 5 | 69 m/s (248 km/h) | 60 m | 1,200 m | 3 | $3,000 |

The beats are not in order of level because the police bikes are not equal and the cops are not equally far apart. With the brakes the bikes have had since the handling retune of October 14, 2026, every cop stops inside a body's slide, so a cop riding alongside a rider who falls makes the arrest; the beat is what limits how much road each cop covers. The single level-1 cop holds the longest beat because the decent player on a Wren falls only about once every three races and seldom near it; levels 3 to 5 hold short ones because three to five cops with batons are the fall as well as the arrest. The beats were 3,000, 5,000, 3,000, 1,500, and 2,000 m before that retune and 3,000, 1,200, 1,400, 750, and 700 m when the level-1 roads were 4 km with one lane each way; see "Measured bust rates" for both retunes.

The pursuit top speed always stays below the seated top speed of the bike a decent player rides at that level (Wren 190, Kite 203, Sesta 230, Sette 243, Meridian 253 km/h), by 14, 16, 14, 13, and 5 km/h, and a rider who tucks in gains another 4%, once they have held 120 km/h for a second and a half (section 6, "The tuck"). A rider who holds the throttle on a straight escapes; a rider who brakes, fights, or falls does not.

The table's rows are rungs (section 4), except the count of cops, which the served rules set per level. At three levels the police are the rung 1, 3 and 5 rows with one, two and three cops. The decent player rides the Wren, the Sesta and the Meridian there, so the cops stay 14, 14 and 5 km/h below the bike, as at those rungs with five levels.

A player who falls a bike behind loses that margin. A Wren at level 2 has 3 km/h on the cops seated and 11 tucked in, and the Gutter Pup (145 km/h) cannot outrun a cop at any level, not even level 1's 176 km/h. The Pup's survival rule is therefore different and should be taught on the repossession notice: **stay on the bike.** A cop can swing a baton at a riding racer but can only bust one who is off the bike, so a Pup rider survives by not crashing and not being knocked down, never by speed.

### The bust window

A racer is busted when a riding cop is within **4 m** of their body while they are off the bike, but not in the first **half second** (30 ticks) after the fall. A rider who is already on their feet, running back or lifting the bike, can be arrested at once.

Both numbers matter to what the player sees:

- **The half second.** Before it, a cop riding alongside arrested a rider on the very tick they were knocked off. Every level-1 bust in the first measurement was of that kind, which is what a play test met as "busted after one crash, 29 seconds in". Now the cop has to still be beside the body half a second later. At walking pace it is. At 160 km/h the body flies and slides about 70 m over five seconds; the cop brakes for it, the body passes it still flying at 29 m/s, and the cop picks it up again and makes the arrest about a second after the fall, so a cop riding alongside is an arrest; a cop 60 m back when a rider falls at 50 km/h arrives after the remount and gives chase instead.
- **The 4 m.** A cop gives up on a body once it is more than the reach behind it. At 2.5 m a cop on a Sesta stopped just past the body nearly every time and rode off, so levels 1 to 3 measured between 1% and 9%.

A rider who is down gets up by themselves, and from then on the player steers them on foot (section 14, "The fall, by speed"). A cop that reaches the body arrests them wherever they are, standing still or running, so being on foot near a cop is the danger and the run back to the bike is the race against it. The player's better part still comes before the fall, by staying clear of the cop, outrunning it, or knocking it down first.

### Measured bust rates

Measured by simulation, with a pilot standing in for the decent player: skill 0.9, aggression 0.5, the level's bike from section 5, a field of seven rivals from the career's own draw, 16 seeds on each of the five roads, 80 starts a level. "Before" is 8 seeds, 40 starts. These were measured with the field of eight; the police balance test pins the same bands with the field of fifteen, and the stand-in's bust rate there is 15% of level-1 starts and 30% of level-5 starts (8 seeds, 40 starts a level), with 2.1 and 3.0 rivals busted per race.

| Level |         Target | Before | After | Rivals busted per race, after |
| ----: | -------------: | -----: | ----: | ----------------------------: |
|     1 | 12.5% (1 of 8) |  25.0% | 11.3% |                           0.8 |
|     2 |      about 16% |  50.0% | 18.8% |                           0.7 |
|     3 |      about 19% |  92.5% | 17.5% |                           1.7 |
|     4 |      about 22% |  85.0% | 20.0% |                           1.6 |
|     5 |   25% (2 of 8) |  95.0% | 27.5% |                           1.7 |

With 80 starts a rate is good to about 4 or 5 points either way, so the five levels are on their targets and nothing finer can be claimed. `packages/career/src/police.test.ts` runs 40 of those starts a level on every check and fails if a level leaves a band around its target, so a retune shows.

Road hazards (October 16, 2026) first took the test's 40 level-2 starts from 5 busts to 13, and the band was widened to 13 of 40. Sol's review found that more than the dice had moved: a pilot dodging a rock could swerve into a slow truck or onto a second hazard, and the hazard miss roll drew from the same dice as jump misreads and fights. With dodges that respect traffic and other hazards, and a dice stream of their own for hazards, the same 40 starts measure 6 busts. The stand-in was thrown by a hazard in none of them, and the level-2 band is back to 11 of 40. When the pilot came to choose one line with hazards and traffic in the same scoring, the test's 40 starts a level measured 7, 7, 8, 13, and 15 busts at levels 1 to 5, against 10, 6, 9, 10, and 13 before, and the level-1 band's top, raised to 10 for the earlier escape rule, is back to 9. Levels 4 and 5 sit at the top of their bands, but on 80 fresh starts a level (seeds 9 to 24) busts went from 12, 19, 20, 32, and 29 to 14, 14, 21, 25, and 25, 112 to 99 in all, so the 40-start rise there is the dice. The 40-start total is 50 of 200, exactly a quarter, so the test of the overall share now accepts a quarter itself; the 400 fresh starts measure 24.75%, against 28% before. Over those 400 starts the AI riders were thrown by a hazard 21 times instead of 69.

Placing hazards with intent (October 16, 2026, `tracks.md`) put oil at bend turn-ins and exits, potholes on the inside line mid-bend, and small rocks in the lanes instead of on the centre line and the road edge, kept rocks out of tight bends and at a lane's edge in gentle ones, kept the total near the old count while raising the oil share, eased the oil crash rule, and lowered the speed from which a pothole hit hard over throws the rider from 198 to 175 km/h (section 14, entry 24). On the same 400 fresh starts busts went from 14, 14, 21, 25, and 25 at levels 1 to 5 to 15, 17, 21, 28, and 19, 99 to 100 in all (24.75% to 25%), and the AI riders were thrown by a hazard 22 times instead of 21, all of them by rocks: no pothole threw anyone. They touch hazards about twice as often (795 touches at level 1 against 394) and ride on. A first try that put rocks mid-bend measured 159 hazard throws, nearly all riders leaning through an apex rock, which is why the apex takes potholes. The test's 40 starts a level measured 3, 5, 13, 9, and 15 busts, against 7, 7, 8, 13, and 15 before, 45 of 200 (22.5%). In the 13 level-3 busts the stand-in went down to a fight or a car first and never to a hazard, and the 400 fresh starts give level 3 the same 21 busts as before, so the 40-start sample is the dice: the level-3 band now reaches 13 of 40. The first try at this placement measured 14 of 40 at level 2 the same way, and that band reaches 14, with the overall share at 27%. Those are the test being too tight for 40 starts, not a change in the feel. Testing on Ridge Road's real hazards then showed cops sliding wide on turn-in oil into cars: 3 of 12 races had a cop crash into traffic with no rider forcing it, against none on main. With the pilot slowing for oil in a bend, the same 12 races have 1, which was not oil, and the AI crashes into a car within 2 s of a slide fell from 5 to 2, both by racers squeezed onto a slick's edge. On the 400 fresh starts busts went from 15, 17, 21, 28, and 19 to 15, 11, 23, 35, and 25, 100 to 109 in all (27.25%), and hazard throws from 22 to 24, all rocks. The stand-in brakes for that oil too, which costs it time with a cop behind; the level-4 rise from 28 to 35 is about one standard deviation of an 80-start sample. The test's 40 starts a level measured 5, 6, 13, 11, and 14, 49 of 200 (24.5%), inside every band.

What the measurement found about the dials, in the order they were tried:

- **Cop count** cannot do it alone. One cop per race at every level, with the old rules, still measured 25% at level 1 and over 60% at level 3.
- **Sight range** does almost nothing. Halving it and quartering it moved no level by more than the noise, because a cop that has lost its quarry patrols at 22 m/s and every rider behind it has to pass within range. It is kept in the table but it is not a balance dial.
- **Pursuit top speed** does little. Cutting it to 85% of the decent bike's top speed moved level 5 from 68% to 63%. The pilot is rarely flat out for long, and the officer's skill of 0.95 is better than the decent player's in the bends.
- **The bust window and the beat** are the two dials that work, and the table above is set with them.

**The wide, long roads.** When three roads gained a second lane each way and every level-1 road grew to 8.05 to 8.85 km, the same 40 starts a level measured 4, 4, 3, 4, and 1 busts at levels 1 to 5, 8% overall: levels 3 and 5 left their bands. The stand-in fell no less often (0.7 to 0.85 falls a race, most of them in the first kilometre where the pack is bunched), but the cops no longer reached most of the road. Two changes brought it back, measured the same way:

- **Posts spread by road length.** Moving the posts alone changed no level by more than the noise (4, 3, 5, 2, 1), because the beats were still set for 4 km roads; it is kept for the feel, so a fall at 11 km can still be a bust.
- **Longer beats at levels 2 to 5.** With the spread posts, the beats in the table measure 4, 7, 8, 7, and 10 busts of 40 (10%, 17.5%, 20%, 17.5%, 25%), 18% overall, with 0.5, 0.6, 1.1, 1.6, and 1.8 rivals busted a race. Making every beat reach the next post measured 5, 6, 8, 14, and 12, which is over the band at level 4 and 2.5 rivals a race at level 5: the Meridian and Nera cops knock riders down for the whole stretch. Level 1 keeps 3,000 m; 4,000 to 7,800 m all measured 5.

With the retune the busts come anywhere on the road, from 1 to 12.6 km, instead of inside the first 4 km.

**The snappy strikes and the run on foot.** With strikes landing in 6 to 9 ticks instead of 12 to 15, the run back at 7 m/s instead of 10, and the pilot steering every downed rider straight to its bike, the same 40 starts a level measure 6, 7, 6, 10, and 10 busts (15%, 17.5%, 15%, 25%, 25%), 19.5% overall, with 2.8, 2.1, 2.9, 3.0, and 2.7 rivals busted a race and the stand-in falling 0.9 to 1.2 times a race. Every level is inside its band and no police dial changed.

**The measured handling.** When the bikes were retuned to the original's starter bike (section 6), the same 40 starts a level measured 1, 7, 15, 8, and 19 busts with the pursuit speeds already lowered to keep their margins. The decent player on the slower Wren fell only 15 times in 40 level-1 races, three of them near the one cop, so level 1 starved; at levels 3 and 5 the brakes made every baton knockdown beside a cop an arrest, so they overflowed. The beats were retuned, level 1 to 6,000 m and levels 3 and 5 to 1,800 and 1,200 m, which measures 3, 7, 8, 8, and 12 busts of 40 (7.5%, 17.5%, 20%, 20%, 30%), 19% overall, with 0.8, 0.6, 1.3, 1.4, and 2.0 rivals busted a race. Level-1 career races on the Wren now take 218 to 255 s, level 3 on the Sesta 267 to 348 s, level 5 on the Meridian 329 to 433 s. At level 5 the stand-in now falls 1.3 times a race against 0.7 before, nearly all of the extra from batons: the Nera cops are the fall as well as the arrest, which the note below already records.

**The fast lineup.** When the bikes were retuned again the same evening for the modern feel (section 6), the pursuit speeds were raised to 49, 52, 60, 64, and 69 m/s to keep their margins under the new tops, and the pilot's corner limit was changed from a guess at the bike's grip at 60 m/s to the exact speed at which a bend's push takes 80% of its sideways speed, which cut the stand-in's falls at level 1 from 1.07 to 0.88 a race and stopped the cops riding into traffic in the Switchback. The beats are unchanged. The same 40 starts a level measure 4, 8, 6, 7, and 7 busts of 40 (10%, 20%, 15%, 17.5%, 17.5%), 16% overall, with 1.8, 2.0, 1.9, 2.4, and 2.0 rivals busted a race. Level-1 career races on the Wren take 190 to 248 s (median 225), level 2 on the Kite 218 to 300 s, level 3 on the Sesta 236 to 351 s, level 4 on the Sette 260 to 392 s, and level 5 on the Meridian 309 to 429 s (median 374). The stand-in finishes fifth to seventh in the median level-1 race and fourth at level 5.

**The snappier strikes and the settled tuck.** With punches landing at 4 ticks and kicks at 5 (section 7), and the tuck needing 1.5 s above 120 km/h and surviving the bends (section 6), the same 40 starts a level measure 5, 9, 8, 11, and 11 busts of 40 (12.5%, 22.5%, 20%, 27.5%, 27.5%), 22% overall, with 2.5, 2.0, 3.2, 3.7, and 3.1 rivals busted a race. Every level is inside its band and no police dial changed; the quicker fists put more riders on the ground near a cop, which is where the rise from 16% comes from.

**The risen kick.** With the kick landing at 4 ticks and its swing over at 15 (section 7), the same 40 starts a level measure 9, 8, 8, 7, and 10 busts of 40 (22.5%, 20%, 20%, 17.5%, 25%), 21% overall, with 2.0, 2.7, 3.1, 3.5, and 3.3 rivals busted a race. Every level is inside its band and no police dial changed, but level 1 sits at the top of its band. A swing of 14 ticks with the same landing measured 10 at level 1, outside the band; the numbers move by a few busts with any change to how long a rider is mid-strike, so the 15-tick swing was kept for the band, not for the feel.

**Late braking (October 16, 2026).** A play test said the AI riders braked far too soon for bends. The pilot now plans its speed along the road from the bike's real brakes, grade, drag and lean, aims at 0.93 to 0.99 of the speed its bike can hold through each bend, and brakes as late as that plan allows (architecture, "Riding model"). On an empty road on the Sesta its speed at a bend's tightest point went from 73%, 82%, and 90% of that hold speed at skills 0.8, 0.9, and 0.99 to 92%, 94%, and 97%, and it starts braking 9 to 14 m before the latest point the brakes allow instead of 65 to 85 m.

The police test's 40 starts a level measure 8, 8, 8, 14, and 11 busts, 49 of 200 or 24.5%, against 5, 6, 13, 11, and 14 before. Level 4 exceeds its old upper band by one bust. On the separate 80 starts per level, seeds 9 to 24, level 4 falls from 35 busts on main to 24 with this pilot. The level-4 test band therefore reaches 14 of 40, while the overall limit stays at 27% and no police dial changes. Trying a 62 m/s pursuit cap made the fixed sample pass at 13 busts but raised the separate sample to 26, so the cap stays at 64 m/s.

Across those 400 separate starts, busts fall from 109 to 95, 27.25% to 23.75%. Busts per level out of 80 are 9, 13, 17, 24, and 32. The winner of a level-1 race is 12 s quicker and of a level-5 race about 30 s quicker. Crashes into scenery fall from 662 to 618, while crashes into traffic rise from 3,164 to 3,272. Rocks throw riders 40 times instead of 26.

Two things the same runs show that are not fixed here:

- **The pilot rarely wrecks.** One start in 400 ended in a wreck. The stand-in falls about once a race at 100 to 150 km/h, which costs 15% to 20% of the bike (section 14). The economy in section 5 assumes one wreck in eight starts for the decent player, so either a human crashes into traffic far more than the pilot does or that assumption is too high. A play test has to say which.
- **Cops knock riders down themselves.** At levels 3 to 5 the baton is the most common cause of the fall that ends in a bust. The officer's aggression of 0.9 and the baton's 18 damage were not touched.

### Roadblocks

From level 3 a parked cruiser blocks one lane, lights on, at a seeded spot on a straight. The spot is at least 250 m past the end of the previous bend, at least 150 m before the start of the next bend or the finish line, and never inside a dip or within 150 m after a crest that can launch a bike. At the Nera's 249 km/h, 250 m of sightline is 3.6 seconds. Only straights of 400 m or more qualify; `tracks.md` names three valid spots on each road. Roadblocks alternate sides. Hitting one is a traffic crash. The parked officer does not chase. In the sim a roadblock is a traffic car with zero cruise speed that ignores the follow logic; the renderer draws it as a cruiser.

From level 3, Dee's tip (section 11) shows the first roadblock's distance on the Route Board.

### Busted

A bust ends the race. The rider is placed after all finishers, gets no prize, pays the level's fine, and carries no weapon into the next race. If the fine takes cash below zero, the debt rules in section 4 apply. Results stamps the bust and shows the officer who patrols that road and one of their lines. It prints the arrest position and the confiscated weapon from the record described in section 4, "Settlement and persistence".

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

For launch, six parody celebrities and ordinary riders replace this cast (section 0). Its skill, aggression, weapons, and grudges are the templates for them, and it stays in the build until the new cast lands.

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
| Sister Agnes Mulcahy | 61 | Lowtown | 0.89 | 0.20 | Nothing | `#BFC4C9` convent grey | `#1A1A1F` black habit |
| Hollis Thorne | 33 | Stonepeak | 0.88 | 0.45 | Nothing | `#7A1F3D` rescue maroon | `#F26B1D` high-vis orange |
| Wanda Pruitt | 49 | Cinder Junction | 0.87 | 0.30 | Nothing | `#5FB7E6` studio blue | `#E9E3D6` cream blazer |
| Benny Okafor | 27 | Saltmouth | 0.85 | 0.40 | Nothing | `#F27D16` tangerine | `#1D7A8C` sequin teal |
| Orrin Blackwell | 31 | Kettle | 0.83 | 0.55 | Nothing (club from level 4) | `#6B4A2B` bark brown | `#8C9A5B` field khaki |
| Dr Felix Aurand | 44 | Lowtown | 0.80 | 0.70 | Club | `#6AD6B5` mint | `#2B5F8F` scrubs blue |

The player's default is bike `#C82F2F` red and jacket `#23262C` charcoal. Police are bike `#F4F6F8` white with `#2F6BFF` blue panels and jacket `#141C33`.

Home roads: Breakwater Run (Tristan, Ines, Benny), Cinder Wash (Ruth Ann, Mags, Wanda), Hollow Pine Road (Lyle, Gus, Orrin), Slag Row (Moose, Dee, Agnes, Felix), Ridge Road (Juno, Coach, Hollis). At level 1, where Juno does not race, Ridge Road's home riders are Coach, Hollis, and Ruth Ann (section 4).

### Pilot rules two riders need

Two profiles describe behaviour that skill and aggression alone do not produce, so the pilot needs a rule for each.

- **Juno Kade: retaliation only.** Juno attacks only a rider who has hit her in the last 10 seconds (600 ticks), read from the `hit` events against her. Her aggression then sets how often she strikes that rider. She never attacks anyone else and never strikes first, at any level, including the finale, where her aggression of 0.9 means she answers a hit almost every time she is in reach.
- **Ruth Ann Bixby: kicks preferred.** Whenever a rival is inside boot reach, Ruth Ann kicks. She punches only when the target is inside fist reach and outside boot reach, which with the current reaches is never, so in practice she only kicks. If she takes a weapon with a kick she carries it but still kicks.

### The pack: balance still to measure

- **Side contact is capped.** Each pair of bikes in side contact used to cost both riders 0.9 m/s on every tick, and the losses added up across pairs, so a rider boxed in on both sides for one second lost every bit of their speed and two bikes leaning on each other from the grid could hold each other at walking pace for a whole race. A rider now loses 0.9 m/s on a tick with side contact however many bikes touch, and at most 6 m/s over any one second.
- **The opening pack.** The player starts last (section 14), behind fourteen rivals in rows 7 m apart across every lane of the road. Measured with the pilot standing in for the decent player over 80 level-1 starts: the player falls in the first kilometre in 6 of them, 2.2 rivals go down per race in the first kilometre (most into traffic, the rest in fights), and no rival is busted there. The three things that got it there, in order of effect: the first cop post moved from 700 m to 1.5 km (section 8), the rows widened from 4.5 m to 7 m, and the truce before the first punch grew from 3 s to 7 s (420 ticks) so the pack sorts itself before the fists come out.
- **The held-throttle start.** The second play test held the throttle from the gun on Slag Row and was thrown into the back of a rival within seven seconds, and three rivals went down into an oncoming van at the gantry in the first three. Measured on October 14, 2026 with a player bot on the Wren at level 1 that holds full throttle and steers not at all, and one that steers half a lock around the nearest rider ahead, 24 seeds on each of the five roads: before, the first bot was thrown in the first 10 s in 54% of starts and the second in 38%, every one a rear-end, and 1.02 rivals a race went down in the first 3 s, nearly all into traffic. The causes were that every pilot aimed for the home lane off the grid, since a bike alongside did not count as a threat, so the pack leaned on itself and lost speed to side contact while the player at the back, touching nobody, closed at 8 to 9 m/s; that oncoming cars spawned on the grid's oncoming lanes; and that a rear-end threw at 9 m/s of closing. After the rules in section 14, item 23, and the 18 m/s line in item 21: neither bot is thrown in the first 10 s in any of the 240 starts, no rival goes down in the first 3 s, and 0.12 rivals a race go down in the first 10 s, nearly all on the two roads with one lane each way where the half of the grid that stands in the oncoming lane has to merge. Over 20 s the no-steer bot still crashes in 44% of starts and the mild steerer in 22%, but those are the first bends: Slag Row's 88° turn at 320 m and Hollow Pine Road's, where a bot that does not steer for a bend runs into the scenery or into the pack braking for it, and the pack's own losses in 20 s are down from 2.2 to 1.0 a race. The sim's start test pins the first ten seconds on both road widths over three seeds.
- **Pacing by the gap to the player.** Each rival's pace depends on where the player is, so the player rides in the field for most of a race. A rival ahead of the player rolls off the throttle: its throttle holds it at no more than `topSpeed × (1 − leadEase × share)`, where `share` is the gap over 200 m, clamped to 1. It never brakes for pace and the corner speeds its bike asks for still apply, so at level 1 a rival 200 m clear cruises at 78% of its top speed and one 50 m clear at 94.5%. A rival behind the player takes its bends a little better: its corner skill is lifted by `catchUp × share`, never above 1.0, and it never exceeds its bike's top speed, so a rival on a Wren cannot catch a player on a Sesta down a straight. The player, the police, busted and wrecked rivals, and every rival once the player has finished, been busted, or been wrecked are not paced. The numbers by level are in `pacingLevels` in `packages/career/src/tables.ts`:

  | Level | leadEase | catchUp |
  | ----: | -------: | ------: |
  |     1 |     0.22 |    0.08 |
  |     2 |     0.20 |    0.07 |
  |     3 |     0.18 |    0.06 |
  |     4 |     0.16 |    0.05 |
  |     5 |     0.14 |    0.04 |

  The original (the 1994 3DO version, read from a third-party reconstruction of its code, so a prediction rather than a fact) paced opponents by rank once a second: the three rivals ranked just ahead of the player took a speed penalty from a table and the three just behind a bonus; far rivals ahead of the player lost a level-scaled share of their target speed (10% at level 1 down to 2% at level 5) while those behind gained one; rivals near the player were scaled by a table indexed by the gap in 256-unit steps; and far rivals halved their target speed while the player was down. The tables are not in the reconstruction, so this rule keeps the idea, ease the leaders by the gap and help the dropped, in two numbers a level, and measures the result. Measured with the pilot standing in for the decent player, 8 seeds on five roads: at level 1 the leader is 124, 143, and 134 m ahead at 2, 4, and 6 km (medians), the last rival 298, 460, and 492 m behind, five to seven rivals are within 100 m of the player, and the pilot finishes fifth of fifteen in the median race in 3.7 to 4.4 minutes. At level 5 on the Meridian the leader is 279, 395, and 435 m ahead, the last rival 346, 445, and 438 m behind, and the pilot finishes fourth in 5.6 to 7.7 minutes. Bike and skill still decide: at level 5 the Nera and Anvil riders lead, and the Gutter Pup is last whatever Gus does.

- **Bust rates** for the pack are in section 8: between 0.7 and 1.7 rivals busted per race, down from 1.5 to 3.2.

### Bikes by level

Rivals move up the catalogue as the season goes on. The player's "decent" path (section 5) is in the last row for comparison. From level 2 the decent player is a step behind the front of the field: the fastest rivals ride a Sesta against the player's Kite at level 2, and a Nera against the player's Meridian at level 5. Top three out of fifteen allows for that, and it is what makes a win pay for the next class. The columns are rungs (section 4). At three levels the fields ride the Level 1, Level 3 and Level 5 columns, and the decent player rides the Wren, the Sesta and the Meridian against them. Between them those three columns put all nine bikes under some rival.

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
| Sister Agnes Mulcahy | Wren 400 | Kite 500 | Sesta 600 | Sesta 600 | Sette 750 |
| Hollis Thorne | Wren 400 | Kite 500 | Sesta 600 | Sette 750 | Meridian 900 |
| Wanda Pruitt | Wren 400 | Kite 500 | Sesta 600 | Sette 750 | Sette 750 |
| Benny Okafor | Wren 400 | Kite 500 | Sesta 600 | Sette 750 | Meridian 900 |
| Orrin Blackwell | Wren 400 | Wren 400 | Kite 500 | Sesta 600 | Sette 750 |
| Dr Felix Aurand | Kite 500 | Kite 500 | Stoker 800 | Stoker 800 | Anvil 1100 |
| _Player, decent path_ | _Wren 400_ | _Kite 500_ | _Sesta 600_ | _Sette 750_ | _Meridian 900_ |

### The riders

Each rider has six lines: two pre-race taunts (the first is the default, the second is the grudge line chosen by section 10), a post-race line for when they beat you, one for when you beat them, a line when they knock you down, and a line when you knock them down.

#### Juno Kade

34, Stonepeak. Skill 0.99, aggression 0.25. Rides clean lines, brakes later than anyone, and never throws the first punch. She has won the circuit three years running and has never once said a newcomer's name out loud.

Juno grew up above her father's tyre shop on the Ridge and learned to ride on the road the finale is held on. She thinks fighting is for people who cannot ride, which does not stop her hitting back very hard.

Visual: tall and narrow, upright on the bike. Black one-piece leathers with a single gold stripe from collar to boot. Black helmet, dark visor, gold stripe continued over the crown. The cleanest silhouette in the field: no fringe, no patches, nothing loose.

- Taunt: "I counted everyone on this grid. You came out as a maybe."
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

Visual: broad, heavy shoulders and tattooed arms. A blond mullet with a shaved side, a scar over one eyebrow, hoop earrings, a sleeveless black vest with the Lowside skull on the back, fingerless gloves and a wallet chain. The club rests on his shoulder like a tool he is taking to a job.

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

#### Sister Agnes Mulcahy

61, Lowtown. Skill 0.89, aggression 0.20. Brakes once, early, and carries the speed through the bend like she is late for something that matters. She almost never raises a hand, and when she does it is one measured shove.

Sister Agnes runs the Lowtown soup kitchen and rides because the diocese van was repossessed and the bike was donated. Every dollar she wins goes to the roof fund, and she keeps the ledger in her jacket.

Visual: small and very upright, elbows in. Black habit cut short over grey leathers, a plain white helmet with a black band, and a wooden rosary wound round the left mirror.

- Taunt: "I'll pray for you. From ahead. The reception's better up there."
- Grudge taunt: "You struck a nun last time. I've forgiven you. The roof fund hasn't."
- She beat you: "Blessed are the meek, dear. Meek enough to brake for the corners."
- You beat her: "Well done. Put something in the tin on your way out."
- She knocks you down: "Mind the step."
- You knock her down: "Sixty-one years, and that's the first time I've said that word."

#### Benny Okafor

27, Saltmouth. Skill 0.85, aggression 0.40. Rides in time with whatever he is singing, which means smooth on the ballads and ragged on the fast ones. Swings only on the downbeat.

Benny fronts a wedding band that plays the Saltmouth hotels, and he sings the entire race, audibly, to nobody. He learned to ride delivering sound gear between gigs and has never been on time for either.

Visual: broad-shouldered, head back, mouth open. A teal sequinned stage jacket over tangerine leathers, with a white helmet and a tangerine bike that matches the jacket's lining.

- Taunt: "I'll be singing the whole way. You'll know where I am. You won't catch up."
- Grudge taunt: "You hit me last time, mid-chorus. Nobody hits Benny mid-chorus."
- He beat you: "That was a duet. You sang backup."
- You beat him: "Fine. Encore next week. Bring a bike this time."
- He knocks you down: "And that's the key change!"
- You knock him down: "My voice! My beautiful... no, wait, that's my knee."

#### Dr Felix Aurand

44, Lowtown. Skill 0.80, aggression 0.70. The weakest rider in the cast and the most willing to fight for it. Starts every level with a club and swings it like a man who bills by the hour.

Felix has the dental practice on the corner of Slag Row and most of the field as patients. He races, he says, for the cardio. He also races because every rider he knocks down comes back to him for the crown.

Visual: lean and tense, elbows high. Pale blue surgical scrubs under a mint jacket, matching mint bike, a white helmet with a mirrored visor and his practice's name on the back.

- Taunt: "Open wide. Not your mouth. The gap. I'm coming through it."
- Grudge taunt: "You chipped something of mine last time. I don't do my own work."
- He beat you: "Floss, ride less, and see me in six months."
- You beat him: "Congratulations. Here's my card. You'll need it eventually."
- He knocks you down: "That's going to need a crown."
- You knock him down: "My hands! Do you know what these hands bill by the hour?"

#### Hollis Thorne

33, Stonepeak. Skill 0.88, aggression 0.45. Knows every inch of the Ridge because he has carried people off it. Rides the bends with wide margins and the straights with none, and fights only to make room.

Hollis leads the Stonepeak mountain rescue volunteers and entered the circuit after one too many call-outs to the Saddle. He hands out hydration advice to riders who did not ask for it.

Visual: tall, square, and relaxed, sitting far back on the seat. High-vis orange rescue jacket with reflective bands on the arms, a maroon bike, and an orange helmet with a headlamp strapped round it.

- Taunt: "If you go off at the Saddle, stay with the bike. Makes you easier to find."
- Grudge taunt: "You put me over the edge last time. I had to rescue myself. There's paperwork."
- He beat you: "You're fine. You're all fine. I checked, from the front."
- You beat him: "Good ride. Hydrate. I mean it, hydrate."
- He knocks you down: "Don't move. I'm trained. Okay, move a little."
- You knock him down: "That's a textbook fall, actually. Chapter four."

#### Orrin Blackwell

31, Kettle. Skill 0.83, aggression 0.55. Rides like someone is filming, because someone is: a camera is strapped to his helmet. Takes risks a thinking rider would not and narrates them as they happen.

Orrin runs a wilderness survival channel from a rented cabin on the edge of Kettle Woods with the heating on. He has never spent a night outdoors by accident and says he has spent hundreds.

Visual: compact and forward, chin down. Field khaki jacket with too many pockets, a bark-brown bike, a brown helmet with an action camera on top and a second one on the chest strap.

- Taunt: "Rule one of survival: never let the new kid finish ahead of you. I made that up just now."
- Grudge taunt: "You put me in the dirt last time. I got footage. It did numbers."
- He beat you: "And that, subscribers, is how you survive a race. Like and remember."
- You beat him: "The wild is unpredictable. So are you, apparently. Cut that bit."
- He knocks you down: "Nature is brutal! Did we get that? Say we got that."
- You knock him down: "I've survived worse. I haven't, but I've said I have."

#### Wanda Pruitt

49, Cinder Junction. Skill 0.87, aggression 0.30. Rides to a plan she announced before the start and sticks to it whatever the road does. Rarely fights; prefers to be proved right.

Wanda has read the weather on the Cinder Junction evening news for twenty years and has been wrong in public exactly once, which she still brings up. She treats the race as a forecast and the finish as the six o'clock bulletin.

Visual: neat and still on the bike, shoulders square. A cream blazer with the station logo over studio-blue leathers, a studio-blue bike, and a matching helmet with a tinted visor and her hair pinned under it.

- Taunt: "Today's forecast: you, behind me, with a chance of gravel."
- Grudge taunt: "Last week I predicted you'd behave. I'm correcting that on air tonight."
- She beat you: "As predicted. Back to you in the studio."
- You beat her: "An unexpected front. I'll be issuing an apology at six."
- She knocks you down: "Heavy fall expected. Oh, there it is."
- You knock her down: "This blazer is station property!"

## 10. Memory

Each rival keeps a small record about the player in the career save: their `aggressionBonus` toward the player (starts at 0), a `grudge` flag, and the incidents from the last race they shared. Incidents are read from the race's events up to the settlement tick (section 4) and nothing after it.

| Incident in the last shared race | Detected from | Next pre-race line | Aggression bonus | Other effect |
| --- | --- | --- | --: | --- |
| You stole their weapon | `weaponTaken` with `rider` = player, `target` = them | Grudge taunt | +0.15 | Grudge flag. Board post: "MOOSE WANTS HIS CLUB BACK." They start the next race with a fresh weapon. |
| You knocked them down | `crash` with cause `combat` and `by` = player (new field) | Grudge taunt | +0.10 each, at most +0.25 | Board post naming the road and the km. |
| You beat them by a wheel | they were riding and 25 m or less behind when you crossed the line | Grudge taunt | +0.10 | Board post: "PHOTO FINISH: YOU BY A WHEEL OVER INES." |
| They got busted near you | `busted` for them while you were within 100 m | Grudge taunt | +0.05 | They blame you. |
| They got busted, you were far away | `busted` for them | Default taunt | 0 |  |
| They knocked you down | `crash` with cause `combat` and `by` = them | Default taunt | −0.05 | They are satisfied. |
| They beat you by a wheel | they finished 30 ticks (0.5 s) or less before you | Default taunt | 0 | Board post in their favour. |
| You finished ahead and never hit them | no `hit` either way | Default taunt | −0.05 | Respect. |
| No shared incident |  | Default taunt | 0 | Only the fade below. |

Rules:

- When several incidents apply, the line comes from the highest row; bonuses add up.
- **Memory fades.** Every career race, every rival's bonus first moves 0.05 toward 0, whether they rode it or not, and then that race's incidents add to it for those who rode. A rider remembers recent races, not the whole season.
- So respect has a floor. Outrunning a rider cleanly every race, or letting them knock you down every race, holds their bonus at −0.05 and no lower: they ease off a little but never stop fighting. Anger has no such floor, because one race can add up to +0.55. Two knockdowns in a race take a rider from −0.05 to +0.20 and a grudge. A grudge from a stolen weapon ends after two races in which the player outruns that rider cleanly (0.15, then 0.05, then −0.05), or after three races the rider sits out (0.10, 0.05, then 0), and lasts as long as the player keeps adding to it.
- Why: with fourteen of the sixteen rivals in every race, a player who finishes near the front and stays out of fights outruns about ten of them cleanly every race. Before the fade applied to every race, the −0.05 for respect added up for each of them: twenty such races put a rider on the −1 floor, where they never attack and two knockdowns still leave them at −0.8. In the stand-in pilot's careers (section 5, "Measured careers") one rival reached −0.95 by the end of level 1. With the fade, every rival in those careers ends every level between −0.05 and +0.20, and grudges still form.
- Why every race and not only shared ones: at fifteen riders two of the sixteen rivals sit out each race, and at ten seven do. A fade that only ran on shared races made a grudge last more of the season with the smaller field. In the stand-in's careers (section 5, "Measured careers") a grudge lasted a median of 3 career races and at most 14 with fifteen riders and five levels, and a median of 5 and at most 22 with ten riders and three levels. With the fade on every race it lasts a median of 3 and at most 10. After an average start 0.74 rivals hold a grudge, against 1.32 before and 1.09 with fifteen riders. With fifteen riders the change only touches the two who sit out.
- Effective aggression toward the player is `profile.aggression + aggressionBonus`, clamped to 0 to 1. Toward other riders it stays the profile value.
- The grudge flag is set when the bonus reaches 0.15 and cleared when it falls below 0.05. A rider with a grudge picks the player as their attack target whenever the player is in reach, even if another rider is closer.
- The post-race line follows the settled places: if they are placed ahead, their "beat you" line; if you are placed ahead, their "you beat them" line. A rival who was busted or wrecked uses the "you beat them" line.
- The two in-race lines appear as a speech tag on the HUD for two seconds when the knockdown happens.
- Dee's bonus is fixed at −1 toward the player from the level whose field rides rung 3 (level 3 of five, level 2 of three; she will not attack you), unless the player knocks her down twice in one race, which ends the alliance for the rest of that level. Her memory keeps running underneath the alliance, so the two knockdowns that end it also give her the usual +0.20 and a grudge for the next race.

## 11. Story

The Vic Lomax story that stood here was retired on October 23, 2026. Its text is still in `packages/career/src/story.ts` and in the bar's lines until the new story replaces it. Treat both as placeholders and build nothing new on them.

The new story is drafted as a short story bible, which the owner rewrites in their own voice. What is decided:

- **The league.** Illegal road races are streamed around the world, touring real cities. Viewers watch and bet on them inside the story; the game itself sells only cosmetics (section 0).
- **The player** is an unknown rider on a cheap bike, climbing the league. The career is that rise, across three levels and a finale.
- **The celebrities** each have a story moment on their home road, built from their public memes, and each pair's feud plays out in races the player rides in: Musk and Altman in the Bay Area, Ronaldo and Mbappé in Madrid, and Ranveer Singh and Jenner in Mumbai. Beating a celebrity in their story moment unlocks them for single races and multiplayer.
- **The Lowside** stays the bar where riders wait between races, and the hub of the menus. Where it sits on a world tour is for the story bible.
- **The limits.** Jokes come from public, well-known memes. The parodies never claim real crimes or private facts about the real people (section 15).

Until the new story lands, a career with fewer levels joins the old chapters of the rungs each level takes in (section 4). At three levels level 2 is "Dee's Tip", with the envelope and Dee's tip, and level 3 is "The Long Ridge", with the badge and the finale. Vic's promotion cards join the same way, so the level-3 card ends "The Ridge is last. She'll be waiting."

Still for the story bible: the six parody names, the league's arc, one scene or line for each of the nine races, the bar's lines, and the ending.

## 12. Multiplayer

### What it is

Two to eight signed-in players race one road at one level. Bots fill the other seats, so every race has the field the server's race rules set, ten racers at launch. Police and traffic are extra actors in the simulation, so the humans in a room, the racers, and the actors stepped are three different counts. A host creates a private room and shares its short code. A private room admits anyone and shows each player's connection. Quick Race puts the player in a public lobby, where bots fill the empty seats and present as human, so a race starts however few people are playing. A public room targets an 80 ms round trip and admits no one above 100 ms. Ranked matchmaking waits until enough people play to fill it. A player rides any celebrity they have unlocked, in any skin they own, on a bike from the full catalogue, and the bike is locked when the race starts. There is no money; the reward is the result and, later, a leaderboard. There is no pacing in multiplayer, because the rule in section 9 reads the gap to rider 0 and would favour one seat.

Race rules belong to the server and are never player settings. Field size, level count, and police per level are one `RaceRules` record in `apps/web/src/server/race-rules.ts`, served at `/api/race-rules`. The browser reads it once at boot, and the career and race setup take it as input.

### How it runs

- **The room is the authority.** One Durable Object per race steps the simulation at 60 Hz, and its result is the result.
- **Clients predict.** Each client steps the whole race ahead with its own input and a guess at everyone else's. When the room's confirmed inputs differ, it rewinds up to 16 ticks and replays them. Inputs travel at 60 Hz in both directions, and the rate is a server setting.
- **Inputs.** The room sets a deadline for each tick. A late input is replaced by a neutral one, never by a held punch or kick. The room acknowledges the input it used, and a client that predicted another corrects. An input packs steer, throttle, and brake as 8 bits each with the buttons, four bytes, plus tick, sequence, and version headers. Inputs name riders by a stable id, not by array position.
- **Bots.** A bot's input comes from `pilotInput`. The pilot keeps history and changes state outside `stepRace`, so the pilot and the step become one simulation operation before a room runs them.
- **Checks.** The room and each client hash confirmed ticks. A mismatch reveals a fault but does not make the code safe. Agreement rests on the simulation's own trig, the enforced math whitelist, and a cross-engine test of recorded inputs.

### Disconnects and lost rooms

When a player drops, their rider stays and a bot rides it under an "AUTO" tag. A player who comes back proves their seat lease, gets a snapshot of the room's version, catches up, and takes the bars back at a tick the room schedules. After 30 seconds the seat stays a bot until the finish, and the results list the rider as "left". If the room itself dies mid-race, the race is cancelled with no result and everyone moves to a fresh room from the line.

### What the sim already supports

- Determinism, from no clock, no unseeded randomness, a fixed tick, the AI's dice in `RaceState`, its own trig, and a math whitelist.
- A bike on each rider, set from the race setup.
- Race rules passed in by the caller, with only the ceiling of 15 racers in the simulation.
- A stable `RiderId` for every rider, given once when the race is built, with the rider array in a fixed order for the whole race. Grudges, chases, `lastHitBy`, events and results name riders by id, and `null` means no rider.

### What it lacks

- **Ids in the input frame.** `stepRace` still takes one input per array slot. Each slot's id equals its place, so a room can address a seat today, and the tick operation can take inputs keyed by id when it lands.
- **Input validation and the codec.** `stepRace` trusts its inputs. The room clamps and quantizes them and drops inputs for ticks already stepped before they reach the simulation.
- **One tick operation.** The pilot and `stepRace` as one call, so a bot's tick is the same everywhere.
- **Event copying.** `state.events` is cleared at the start of every step, so the runner copies events out each tick for the renderer and the room.
- **Snapshot and hash.** An explicit codec, because `RaceState` can hold NaN, Infinity, and pilot history that JSON loses, and a test that a restored race steps exactly like the original.
- **Room lifecycle.** Who writes the result and how it is written once, pinning a race to the deploy it started on, backpressure, version mismatch, and abuse limits.
- **Scale gates.** CPU per room, bytes and messages per second, region placement, admission, and cost, measured before public rooms open.

## 13. Ads

The game is free and ad-funded, so ads exist, but they never touch the riding or the moment a result lands.

**Where an ad can live:**

There are three placements here, and the sponsor billboards below are the fourth. There are no others.

- **Results screen:** no display ad since Results moved into the bar (October 23, 2026). If one returns, it is a bill on the wall, never covering the placings, money, or buttons.
- **Clubhouse board,** one small static slot styled as a poster pinned beside the corkboard, out of the way of every button.
- **Rewarded ad for a repair discount** (not built), offered on Results after a wreck only: "Watch an ad, pay half the repair bill." Optional, once per wreck, and the bill is shown in full first. The halved bill is applied before the debt check (section 4), so the ad can be the difference between keeping a bike and losing it. It is not offered for a quit or for a race settled after a reload.

There is no interstitial between races. An earlier draft had one after Results; it was removed so that the Results slot is the only ad shown unasked between pressing Start and being back in the Clubhouse.

**Where an ad must never appear:**

- During a race, except the sponsor billboards at the kerb (below), or in the countdown, the pause menu, or the Finish screen.
- As a full-screen interstitial anywhere.
- In the bar before the first race of a session.
- Over the Busted or Wrecked consequence itself; the player sees what happened and what it cost before any offer.
- As a way to undo a Game Over, skip a qualification, or reduce a police fine. Fines are the cost of getting caught; buying them down with attention would make the police meaningless.
- In the Multiplayer lobby countdown or between multiplayer races while other players wait.
- Anywhere for players who have paid to remove ads, if that option is added.

### Sponsor billboards and the store

Launch money comes from sponsor billboards and cosmetics (section 0). Whether the placements above ship at launch is not decided.

- **Billboards** are a fourth placement, the only ad seen during a race. They are scenery at the kerb, drawn like every other sign in the city and open kits, never an overlay, and never on the road. The track format lists each road's billboard slots.
- **Selling them.** At launch the owner sells slots to sponsors directly and bills them by card invoice. A schedule file says which slot shows which sponsor's art on which dates. A self-serve booking platform comes only if sponsors ask for one.
- **Proof.** From the first day the game counts, for each billboard, how many riders pass it and how long it is on screen, so a sponsor can be shown what they bought.
- **Unsold slots** show parody ads for made-up brands that mock real ones, so a slot never looks empty.
- **The store** sells character skins and bike skins at listed prices, to signed-in players only. Nothing sold changes speed or handling, and there are no random loot boxes.

## 14. What the simulation needs

The design assumes these changes. Each one is a rule, so it belongs in `packages/sim` or `packages/track`, except where noted. The Release column says when each is needed: **first career release** is the smallest set that makes the career in sections 4 to 11 playable, and **later** can follow without changing a save.

| # | Change | What it is | Release |
| --: | --- | --- | --- |
| 1 | Per-rider `BikeSpec` | The bike belongs to each rider, not to `RaceState`, and the riding step, the pilot, and the renderer read it from the rider. | Built |
| 2 | Selected cast | `createRace` takes the list of rival profiles for this race. The earlier placeholder names are replaced by the cast; "Viper" in particular is the name of a rider in the original game (section 15). | Built. `RaceSetup.rivals` carries each race's profiles from `setupFor`. |
| 3 | Per-race police settings | Cop count, pursuit top speed, sight range, beat, and fine are race inputs. The posts come from the track: the first at `FIRST_COP_S` (1,500 m), the last `LAST_COP_BEFORE_FINISH` (1,000 m) before the finish, the rest evenly between. | Built |
| 4 | Bike condition and the wreck | A `condition` value from 100 on each rider. Each crash takes the damage its cause costs at 200 km/h (traffic 34, prop 32, landing 30, rider 30, combat 28, off-track 22), scaled by the rider's speed at impact over 200 km/h and held between 0.1 and 1.25. At zero the rider enters the `wrecked` mode, which ends their race like a bust without a fine. Three or four hard crashes wreck a bike. The table below gives the cost by speed. | Built, retuned |
| 5 | Crash attribution | The `crash` event has a `by` field naming the rider whose hit or contact caused it within the last second, so memory knows who knocked whom down. | Built |
| 6 | Carried weapon | `createRace` accepts a starting weapon and hit count for the player. | Built |
| 7 | Grudge targeting | The pilot's attack choice takes a preferred target, and its aggression can differ for that target. | Built. `grudge` and `aggressionBoost` on the rival's setup. |
| 8 | Pilot rules for Juno and Ruth Ann | Juno: retaliation only, attacking only a rider who hit her in the last 10 s. Ruth Ann: kicks preferred. Section 9 gives both rules. They can be two flags on the profile. | Not built. The profile has no flag for either. |
| 9 | HUD data | Bike condition, distance to the nearest chasing cop, and distance remaining. | Built as data in the HUD feed. The HUD draws only the speedometer (section 0). |
| 10 | Detail for a bust on Results | The player's `crash` event carries the weapon dropped, and the `busted` event carries the body's `s`, both read before the sim clears or moves them (section 4). | Built on the `busted` event instead, which carries the weapon, the body's `s` and its `x`. |
| 11 | Career rules | Money, level, qualified roads, repeat-run pay, owned bike, carried weapon, rival memory, season points, story flags, settlement, the active-race record, and the debt check are plain data advanced by plain functions. They are rules, so they live in a deterministic package (a new `packages/career`, or a `career` module in `packages/sim`), not in React. | Built in `packages/career`. |
| 12 | Paint palette | `paint` stays an index, but into a palette of eighteen rider colours (`art-direction.md`), with a second index for jacket colour. The cast cannot be told apart without it. | Built. `riderPalette` in `packages/sim/src/palette.ts`. |
| 13 | Traffic per level | No change: a level's road is its own `TrackPlan`, and `trafficPerKilometre` is already per plan. `tracks.md` gives the values. | First career release, no work |
| 14 | Side-contact cap | The cap on speed lost to side contact described in section 9: 0.9 m/s a tick and 6 m/s in any second, kept as `bumpLoss` on the rider. | Built |
| 15 | Extra weapons | `"cue"` and `"sign"` in `WeaponKind` and `weapons.ts`. | Built. Both carry the numbers in section 7. The sign lands 30 ticks after the press: `ticks` 62, `strikeTick` 32. |
| 16 | Last-slot grid start | The player starts in the last grid slot, behind every rival, in rows 7 m apart across every lane: four abreast on a road with two lanes each way, two abreast on a one-lane road. | Built and measured (section 9). |
| 22 | Pacing by the gap to the player | `RaceSetup.pacing` carries `leadEase` and `catchUp`; the pilot caps a leading rival's throttle and lifts a dropped rival's corner skill by the gap to rider 0 (section 9). | Built |
| 17 | Roadblocks | Stationary cruisers in the traffic list with zero speed that do not follow, placed by the rules in section 8 at the spots in `tracks.md`. | Later |
| 18 | Region scenery kits | A `kit` field on `TrackPlan` so `scatterProps` places palms, cacti, streetlights, or pines instead of the same trees everywhere. | Later |
| 19 | The bust window | A racer cannot be busted in the first 30 ticks after a fall unless they are already on their feet, and the arrest reach is 4 m. `BUST_DELAY_TICKS` and `BUST_REACH` in `police.ts`. Section 8 has the reasons. | Built |
| 20 | Patrol beats | Every cop remembers where it was parked (`post`) and gives up the chase `beat` metres past it, unless it is riding to a downed racer. The beat is a race input per level. | Built |
| 21 | Rear-end by the last tick | Rider contact is classified by where the two bikes were a tick earlier. Clear along the road and overlapping across it means the rider behind ran in: a rear-end, which throws them above a closing speed of 18 m/s and below it is a bump that drops them to the speed of the bike ahead and shunts that bike on by 30% of the closing speed, up to 5.4 m/s. Clear across and overlapping along is a side shove. If both gaps closed in the same tick, the one that closed last decides. Before this a rider closing fast enough to overlap more than 0.86 m in a tick was shoved aside and rode through; until October 14, 2026 the throw line was 9 m/s, which threw a player who held the throttle off the grid into the pack in most starts. | Built |
| 23 | The start | The pilot does not steer into a bike alongside, so the grid gets away in its lanes; it enters an oncoming lane only when the nearest oncoming car is more than 8 s of closing away, 12 s in the first 10 s of a race, and leaves one when a car is within 4.5 s; and oncoming traffic spawns no nearer than 300 m past the line. On foot, a control held through the fall is dead until released, and a rider left alone for 4 s walks back to the bike. Measured in section 9. | Built |
| 24 | Road hazards | Oil slicks, small rocks 0.3 m high, and potholes lie on the road at their real size and are not made to stand out: no glow, no markers. They lie where they change the riding, by the rules in `tracks.md`: oil where a bend turns in and at bend exits, a pothole on the inside line mid-bend, rocks at exits, over crests, and on the straights where riders pass traffic, never in a tight bend or where a bike that hits one would land in one, and in a gentle bend only at the edge of a lane, all on the lanes and none on the shoulder. A hazard need only be visible from 25 m, so one round a blind bend is part of the game. Traffic drives over every hazard unchanged; only riders meet them. They are good to avoid, not must avoid: none is a crash on contact. Oil takes the grip: straight across is safe at any speed, and so is a quick tap of the bars, but holding them hard over (0.8 or more for 0.3 s) on it or just past it above 94 km/h puts the rider down. Before October 16, 2026 the threshold was 0.6 for 10 ticks with the danger lasting 0.45 s past the slick, so a keyboard rider tapping a key on the slick for a quarter of a second went down nearly every time; the play test read that as "the sparkly thing always crashes me". A rock bumps the bike into the air and costs 6 to 16% of the speed: below 50 km/h it is a stagger, from 130 to 180 km/h straight on the bike lands wobbling and rides on, and from about 210 km/h, or steering hard from much lower, it lands sideways and the rider is thrown. A pothole is a jolt that costs 3 to 6% of the speed and a wobble, and throws only a bike leaned hard over (past 85% of its steering limit) above 175 km/h; ridden straight it never throws. Until October 16, 2026 that threshold was 198 km/h; the user lowered it to 175 so a pothole taken flat out in a corner is a real risk. Pilots and cops slow for oil in a bend so the slide stays inside their lane, and ride round it when a lane is free. Pilots and cops choose one line with hazards and traffic in the same scoring: traffic, a ramp's side, and the road edge rule a line out, a hazard on it is a cost (a rock most, then oil, then a pothole), and they keep the line they chose rather than flip sides mid-move. A bump beats a truck, so when the only lines clear of traffic cross a hazard they ride through it, easing to 150 km/h for a rock. `docs/architecture.md` has the numbers. | Built |
| 25 | Server-owned race rules | Field size, level count, and police per level come from one `RaceRules` record that the server serves and the career and race setup take as input. The simulation keeps only the ceiling, `MOST_RACERS` (15). | Built |

### Condition by speed

What one crash takes off a bike that starts at 100, by cause and by the rider's speed at impact. The earlier numbers are in brackets.

| Cause                | 60 km/h | 100 km/h | 150 km/h | 200 km/h |
| -------------------- | ------: | -------: | -------: | -------: |
| Traffic              | 10 (18) |  17 (24) |  26 (37) |  34 (49) |
| Tree, pole, or rock  | 10 (15) |  16 (21) |  24 (31) |  32 (42) |
| Hard landing         |  9 (13) |  15 (17) |  23 (26) |  30 (35) |
| Running into a rider |   9 (8) |  15 (10) |  23 (16) |  30 (21) |
| Knocked down         |   8 (5) |   14 (7) |  21 (10) |  28 (14) |
| Thrown by a hazard   |       8 |       14 |       21 |       28 |
| Leaving the track    |   7 (5) |   11 (7) |  17 (10) |  22 (14) |

A crash at 200 km/h costs about 30 and one at 100 km/h about 15, whatever caused it. Three crashes into traffic at 200 km/h wreck a bike, four knockdowns at that speed do, and at 100 km/h it takes six to eight. A tip-over at walking pace costs about 3. The earlier curve had a floor of half the base figure and a spread of three and a half to one between causes, so one car at 200 km/h took half the bike and a wreck from fights took ten falls. A ride onto the grass that does not end in a fall still costs nothing.

### The fall, by speed

How long a crash takes, measured by simulation on a straight road on October 14, 2026, against the original's crash near 100 mph into a billboard, where the rider tumbles and slides for at least 4.5 s and is standing about 5.5 s after the impact, and its remount within about 3 s after a slower fall. The rider lands, slides at 6 m/s², lies still for half a second, takes 0.3 s to stand, and is then on foot under the player's control; the table assumes they run straight back at the full 7 m/s, and the bike takes half a second to lift. "Standing" includes the rise. The pole rows take the slide and the run distance of the earlier measurement and add the run at the new speed.

| Fall | Sliding ends | Standing | Back on the bike | Run back |
| --- | --: | --: | --: | --: |
| Into a pole at 160 km/h | 5.1 s | 5.9 s | 16.1 s | 67 m |
| Knocked off at 160 km/h | 6.2 s | 6.7 s | 13.1 s | 39 m |
| Knocked off at 100 km/h | 4.2 s | 4.7 s | 8.5 s | 21 m |
| Knocked off at 50 km/h | 2.6 s | 3.1 s | 5.3 s | 10 m |
| Into a pole at 50 km/h | 2.2 s | 3.0 s | 5.2 s | 11 m |
| Knocked off at 10 km/h | 1.3 s | 1.8 s | 2.9 s | 2 m |

The pole crash matches the measured one up to standing; the knockdown at the same speed is a second longer because the body keeps 65% of the bike's speed instead of half, which is what lets a cop riding alongside catch it (section 8). The slow falls are about two seconds longer than the original's "about 3 s", nearly all of it the run back, which at 7 m/s is a sprint rather than the 10 m/s of the earlier build. The long walks after a fast crash are the price of a bike that stays where it fell. A rider on foot who is hit by a car or a bike goes down again for about two seconds, as the original's did.

**On foot.** After the first play test asked for it, the rider on foot is the player's to steer, as the original's was: once they are up, throttle runs up the road, brake runs back down it, and left and right run across it, at up to 7 m/s whichever way, with a quarter of a second to reach full speed and to stop. The camera keeps facing along the road, so the keys mean on foot what they mean on the bike. A key that was already held when the rider went down does nothing on foot until it has been released: the second play test found a player still holding the throttle from the ride walking the rider straight away from the bike and out of frame without meaning to, so each of throttle, brake, and steer is dead after a fall until it has read zero once, and a fresh press moves. A rider who touches nothing stands where they got up, mid-stride, and can be arrested there; after four seconds on their feet with no live input they walk back to the bike on their own, so a player who does not know the controls is never stuck, and any press takes over again. The rider remounts on reaching the bike, within 0.7 m of it, with no key to press, and the bike waits where it fell. They cannot leave the verges and cannot finish on foot: the body stops at the finish line. The pilot runs rivals and police straight back to their bikes through the same five input values, so an AI rider's recovery is the table above, and in multiplayer a remote player's on-foot steering is their ordinary input frame. There is no fighting on foot.

### The first career release without the later items

- **No roadblocks.** The Roadblocks column in section 8 reads 0 at every level until item 17 ships. Dee still turns ally at level 3 and still texts, but her texts carry no distance, the Route Board shows no tip line, and the HUD shows no blue tick. Vic's level-3 card uses its alternate copy (`screens.md`).
- **One scenery kit.** Every road uses today's trees, poles, rocks, and chevrons with its region's palette and fog. The roads are told apart by colour, layout, and traffic until item 18 ships.
- **Cue and sign as built.** Coach carries the cue from level 2 and Gus the sign from level 3 with the numbers in section 7. Tuning them does not change a save.
- **Balance measurements.** The bust rates in section 8 and the opening pack and pacing in section 9 are measured, and the bust rates are pinned by a test. Measurements may change numbers in this document, not its rules.

## 15. Originality check

Checked against every name in the research note and the 25 reference captures:

- **Riders.** None of the sixteen rivals or two officers shares a first name, surname, or nickname with a rider or officer named in the reference (including the 1991, 1992, 1994, 1995, and later casts and the officers seen in the captures). The existing sim name **Viper** does match a rider in the original game's results screen and must be replaced.
- **Bikes.** No bike name or maker matches the reference catalogues (none of the original makers, models, or the original class names). Two draft names were dropped during this check: "Mule", a Kawasaki product name, and "Ultima", an Electronic Arts game series.
- **Roads and regions.** Salt Coast, Cinder Flats, Kettle Woods, Lowtown, Stonepeak, and the five road names do not match any original route or location name. Ridge Road is ours already.
- **Places.** The Lowside, Gino's, and the scrapyard are ours. The reference clubhouse, shop, and restroom names are not used, and there is no restroom options menu.
- **Lines.** Every line was written for this cast. None quotes or paraphrases a line visible in the captures or quoted in the research note.
- **Weapons.** Club, chain, crowbar, and baton are generic objects already in the game. The pool cue and stop sign do not appear in the reference weapon lists; the reference spray, prod, and oil weapons were deliberately avoided.
- **Title.** LOWSIDE, SHOULDER CHECK, and HARD SHOULDER do not contain "Road" or "Rash". A trademark search is still needed.

The launch cast and bikes add checks against the real world, decided on October 23, 2026:

- **Real people.** Each celebrity is a parody: a twisted name on an exaggerated caricature, with the memes as their personality. No real name, photo, voice, or exact likeness is used. Games that transformed a real person have won when sued (Lohan v. Take-Two, 2018; Noriega v. Activision, 2014), and a game that copied one closely lost (Hart v. Electronic Arts, 2013). A paid skin of a real person is the most exposed thing the game could sell, which is why the store sells only parodies.
- **Claims.** Jokes come from public, well-known memes. No line claims a real crime or a private fact about the real person.
- **Borrowed fiction.** A meme that leans on someone else's character is used for its idea only. Ronaldo's superhero parody takes nothing from Homelander or _The Boys_, which belong to Amazon: no name, costume, or logo.
- **Brands.** Bikes parody real makers under invented brand names, with no logos or badges, as GTA does with its cars. Real landmarks are parodied, not copied.
- **Generated art.** Each 3D generator's licence for commercial use is checked before its output ships.
- **Review.** A lawyer reviews the cast, the brands, the store, and the generated assets before launch.
