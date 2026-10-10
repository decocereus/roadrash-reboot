# Tracks

Drafted October 10, 2026. The five roads as `TrackPlan` data. Each level-1 plan below compiles with the existing format in `packages/track/src/track.ts`: sections of `{ length, turnDegrees, climb }`, with the same lead-in and runoff as Ridge Road. Levels 2 to 5 append sections to the same road.

All figures were computed from the plans with the compiler's own formulas: peak curvature is `turn / (length × 0.7)` because of the 30% ease in and out; a bend's hold speed is where full steer equals the outward push for that bike's `BikeSpec`; a crest launches where `slopeRate × speed²` passes gravity. They have not been ridden. Passing numbers do not show that a road plays well, so each needs a play test.

## Summary

| Region | Road | id | Level-1 length | Lanes / shoulder / verge | Traffic per km, level 1 | Seed |
| --- | --- | --- | --: | --- | --: | --- |
| Salt Coast | Breakwater Run | `breakwater-run` | 3,900 m | 3.6 / 0.9 / 7 m | 5 | `0xb4_7a_c1` |
| Cinder Flats | Cinder Wash | `cinder-wash` | 4,400 m | 3.8 / 1.4 / 14 m | 3 | `0xc1_d3_0a` |
| Kettle Woods | Hollow Pine Road | `hollow-pine-road` | 3,600 m | 3.4 / 0.6 / 5 m | 6 | `0x4f_17_e2` |
| Lowtown | Slag Row | `slag-row` | 4,000 m | 3.5 / 0.5 / 6 m | 8 | `0x5a_9c_33` |
| Stonepeak | Ridge Road | `ridge-road` | 4,250 m | 3.6 / 0.9 / 9 m | 5 | `0x51_ed_27` |

`trafficPerKilometre` is per direction, as in `createTraffic`. Every plan uses `leadInLength: 80` and `runoffLength: 400`.

### How hard each road is

A bend counts as "not flat" for a bike when the bike's top speed is above the speed full steer can hold. The three bikes stand for the three classes.

| Road | Level | Length | Bends | Tightest radius | Not flat: Wren 400 | Not flat: Sesta 600 | Not flat: Anvil 1100 |
| --- | --: | --: | --: | --: | --: | --: | --: |
| Breakwater Run | 1 | 3.90 km | 8 | 102 m | 0 | 2 | 4 |
| Breakwater Run | 2 | 5.05 km | 11 | 102 m | 0 | 4 | 6 |
| Breakwater Run | 3 | 6.20 km | 14 | 102 m | 0 | 5 | 7 |
| Breakwater Run | 4 | 7.35 km | 17 | 62 m | 1 | 6 | 9 |
| Breakwater Run | 5 | 8.50 km | 20 | 62 m | 2 | 8 | 11 |
| Cinder Wash | 1 | 4.40 km | 5 | 67 m | 1 | 1 | 1 |
| Cinder Wash | 2 | 5.55 km | 7 | 67 m | 2 | 2 | 2 |
| Cinder Wash | 3 | 6.70 km | 8 | 67 m | 3 | 3 | 3 |
| Cinder Wash | 4 | 7.85 km | 10 | 67 m | 4 | 4 | 4 |
| Cinder Wash | 5 | 9.00 km | 12 | 56 m | 5 | 6 | 6 |
| Hollow Pine Road | 1 | 3.60 km | 10 | 88 m | 1 | 5 | 7 |
| Hollow Pine Road | 2 | 4.75 km | 14 | 88 m | 1 | 7 | 10 |
| Hollow Pine Road | 3 | 5.90 km | 17 | 88 m | 1 | 10 | 13 |
| Hollow Pine Road | 4 | 7.05 km | 20 | 67 m | 3 | 12 | 15 |
| Hollow Pine Road | 5 | 8.20 km | 24 | 67 m | 4 | 15 | 19 |
| Slag Row | 1 | 4.00 km | 7 | 71 m | 3 | 4 | 5 |
| Slag Row | 2 | 5.15 km | 9 | 67 m | 4 | 5 | 7 |
| Slag Row | 3 | 6.30 km | 11 | 67 m | 5 | 6 | 8 |
| Slag Row | 4 | 7.45 km | 14 | 59 m | 6 | 9 | 11 |
| Slag Row | 5 | 8.60 km | 17 | 59 m | 7 | 11 | 13 |
| Ridge Road | 1 | 4.25 km | 10 | 136 m | 0 | 3 | 5 |
| Ridge Road | 2 | 5.40 km | 13 | 92 m | 0 | 5 | 8 |
| Ridge Road | 3 | 6.55 km | 16 | 92 m | 0 | 7 | 10 |
| Ridge Road | 4 | 7.70 km | 18 | 58 m | 1 | 9 | 12 |
| Ridge Road | 5 | 8.85 km | 21 | 58 m | 2 | 11 | 15 |

The pattern is the design: Cinder Wash is easy to steer and hard to survive, Hollow Pine Road asks the most of a fast bike, Slag Row makes even the Wren brake, and every road gets tighter in the kilometres that later levels add.

## How levels extend a road

Level N is the level-1 section list followed by the appended blocks for levels 2 to N. The start line never moves, so the opening kilometres are the ones the player already knows; the finish moves 1,150 m further each level. Appended sections are written `[length, turnDegrees, climb]`.

Each level also changes the race around the road:

| Level | Length added | Traffic per km | Cops | Pursuit top speed | Roadblocks |
| --: | --: | --- | --: | --: | --: |
| 1 |  | Base (table above) | 1 | 166 km/h | 0 |
| 2 | +1,150 m | Base + 1 | 2 | 180 km/h | 0 |
| 3 | +1,150 m | Base + 2 | 3 | 194 km/h | 1 |
| 4 | +1,150 m | Base + 3 | 4 | 209 km/h | 2 |
| 5 | +1,150 m | Base + 4 | 5 | 223 km/h | 3 |

Traffic is a field of the plan, so a level's plan carries its own `trafficPerKilometre` and the sim needs no change for it. Cops stay at 700 m and every 1,600 m after, which puts the fifth at 7.1 km and fits every level-5 road. Cop count is already a `createRace` argument; pursuit speed and roadblocks are the changes listed in `game-design.md` section 14. A level's plan id is the road id with the level, for example `slag-row-3`, and it keeps the road's seed so the scenery of the familiar part does not change.

Roadblocks sit on a straight, at least 150 m past the end of the previous bend or crest, so they are in view for more than two seconds at 238 km/h. Good candidates are named under each road.

## Breakwater Run (Salt Coast)

Breakwater Run goes from the harbour to the pier along the seawall, with the sea on the right nearly the whole way. It is the easiest road to see down and the gentlest on a light bike: the Wren takes every level-1 bend flat. Its character is rhythm, a long stretch of holding one line followed by a sudden demand. The signature moments are **the Long Sweeper**, 700 m of constant right-hand bend beside the water at a radius of about 740 m that every bike holds flat out and that is the best place on any road to fight side by side; **the tunnel**, 300 m of straight where engine noise doubles and oncoming headlights are all you see; and **the Lighthouse Kink**, a 55° left packed into 140 m right at the tunnel mouth, which a Sesta 600 holds at 166 km/h and no faster. A rider who comes out of the tunnel flat out on a Middleweight meets the lighthouse. Two crests, the Headland drop and the Seawall hump, launch at 176 and 169 km/h.

### Level 1 sections

| # | Starts at (m) | length | turnDegrees | climb | Note |
| --: | --: | --: | --: | --: | --- |
| 1 | 0 | 240 | 0 | 0 | Harbour start |
| 2 | 240 | 300 | -18 | 2 | Onto the seafront |
| 3 | 540 | 200 | 0 | 6 | Climb to the headland |
| 4 | 740 | 160 | 34 | 4 | Headland right |
| 5 | 900 | 120 | 0 | -12 | Headland drop; launches at 176 km/h |
| 6 | 1,020 | 220 | -42 | -4 | Left down to the beach |
| 7 | 1,240 | 700 | 38 | 0 | The Long Sweeper, along the water |
| 8 | 1,940 | 300 | 0 | 0 | Tunnel |
| 9 | 2,240 | 140 | -55 | 0 | Lighthouse Kink at the tunnel mouth |
| 10 | 2,380 | 160 | 48 | 2 | Right, recovering |
| 11 | 2,540 | 360 | 0 | 8 | Seawall climb |
| 12 | 2,900 | 100 | 0 | 6 | Seawall hump, rise |
| 13 | 3,000 | 100 | 0 | -9 | Seawall hump, drop; launches at 169 km/h |
| 14 | 3,100 | 300 | -26 | -5 | Sweeping left down to the pier |
| 15 | 3,400 | 200 | 30 | 0 | Pier approach |
| 16 | 3,600 | 300 | 0 | 0 | Finish on the pier |

Total 3,900 m.

```ts
export const breakwaterRun: TrackPlan = {
  id: "breakwater-run",
  laneWidth: 3.6,
  leadInLength: 80,
  name: "Breakwater Run",
  runoffLength: 400,
  sections: [
    { climb: 0, length: 240, turnDegrees: 0 },
    { climb: 2, length: 300, turnDegrees: -18 },
    { climb: 6, length: 200, turnDegrees: 0 },
    { climb: 4, length: 160, turnDegrees: 34 },
    { climb: -12, length: 120, turnDegrees: 0 },
    { climb: -4, length: 220, turnDegrees: -42 },
    { climb: 0, length: 700, turnDegrees: 38 },
    { climb: 0, length: 300, turnDegrees: 0 },
    { climb: 0, length: 140, turnDegrees: -55 },
    { climb: 2, length: 160, turnDegrees: 48 },
    { climb: 8, length: 360, turnDegrees: 0 },
    { climb: 6, length: 100, turnDegrees: 0 },
    { climb: -9, length: 100, turnDegrees: 0 },
    { climb: -5, length: 300, turnDegrees: -26 },
    { climb: 0, length: 200, turnDegrees: 30 },
    { climb: 0, length: 300, turnDegrees: 0 },
  ],
  seed: 0xb4_7a_c1,
  shoulderWidth: 0.9,
  trafficPerKilometre: 5,
  vergeWidth: 7,
};
```

### Levels 2 to 5

**Level 2 appends (1,150 m).** Past the pier and into the cannery district: a 62° right at a radius of 104 m and a 48° left behind the sheds.

`[260, -20, 0], [200, 0, 4], [160, 62, 2], [140, -48, -2], [240, 0, -4], [150, 0, 0]`

**Level 3 appends (1,150 m).** The cliff road: a climb, a crest that launches at 152 km/h, and a 70° left at Gull Rock immediately after it.

`[320, 44, 6], [120, 0, 7], [90, 0, -9], [200, -70, -4], [240, 22, 0], [180, 0, 0]`

**Level 4 appends (1,150 m).** A second long sweeper, 500 m to the left this time, then the Boathouse Hairpin: 84° in 130 m at a radius of 62 m.

`[500, -36, 0], [160, 0, 0], [130, 84, 3], [160, -40, 3], [200, 0, -6]`

**Level 5 appends (1,150 m).** The climb to the ferry: a crest that launches at 144 km/h, a 92° left falling toward the water, and the finish at the ferry terminal.

`[220, 0, 10], [80, 0, 5], [80, 0, -8], [170, -92, -5], [140, 58, 0], [260, 30, 0], [200, 0, -2]`

Traffic per km by level: 5, 6, 7, 8, 9. Roadblocks: the seawall climb at 2.7 km, the pier straight at 3.75 km, and the level-2 cannery straight at 4.8 km. Never in the tunnel or at its mouth.

## Cinder Wash (Cinder Flats)

Cinder Wash is the fast road: 2.5 km of near-straight across the dry lake before the first real bend. The danger is speed and air. **The three washes** are dips where the road drops into a dry stream bed and climbs out; the lip of each launches the bike, the first at 176 km/h, the second at 147, and the third at 128, so on the third one everybody flies and the question is who lands next to whom. Then comes **the Drag**, 760 m flat out, and at the end of it **the Mesa Hairpin**: 120° of right-hand bend at a radius of 67 m, which a Sesta 600 holds at 132 km/h. It is the hairpin after the straight, the hardest braking zone at level 1, and the place where slipstreaming rivals arrive too fast together. The road then climbs 22 m up the mesa, crosses a crest that launches only the fastest bikes (215 km/h), and falls in a long sweeper to the drive-in. Traffic is light, the verge is wide and open, and there is nothing to hit but the occasional cactus and each other.

### Level 1 sections

| # | Starts at (m) | length | turnDegrees | climb | Note |
| --: | --: | --: | --: | --: | --- |
| 1 | 0 | 400 | 0 | 0 | Start at the dead gas station |
| 2 | 400 | 600 | 8 | -6 | Long fall to the dry lake |
| 3 | 1,000 | 60 | 0 | -3 | First wash, down |
| 4 | 1,060 | 60 | 0 | 3 | First wash, up; launches at 176 km/h |
| 5 | 1,120 | 240 | 0 | 0 |  |
| 6 | 1,360 | 50 | 0 | -3 | Second wash, down |
| 7 | 1,410 | 50 | 0 | 3 | Second wash, up; launches at 147 km/h |
| 8 | 1,460 | 200 | 0 | 0 |  |
| 9 | 1,660 | 40 | 0 | -2.5 | Third wash, down |
| 10 | 1,700 | 40 | 0 | 2.5 | Third wash, up; launches at 128 km/h |
| 11 | 1,740 | 760 | 0 | 2 | The Drag, 760 m flat out |
| 12 | 2,500 | 200 | 120 | 6 | Mesa Hairpin; 132 km/h on a Sesta 600 |
| 13 | 2,700 | 300 | 0 | 22 | Climb the mesa |
| 14 | 3,000 | 200 | -30 | 4 | Left along the rim |
| 15 | 3,200 | 120 | 0 | 5 | Mesa top, rise |
| 16 | 3,320 | 120 | 0 | -8 | Mesa top, drop; launches at 215 km/h |
| 17 | 3,440 | 400 | 24 | -20 | Sweeping descent off the mesa |
| 18 | 3,840 | 250 | -36 | 0 | Left at the cattle grid |
| 19 | 4,090 | 310 | 0 | 0 | Finish at the drive-in |

Total 4,400 m.

```ts
export const cinderWash: TrackPlan = {
  id: "cinder-wash",
  laneWidth: 3.8,
  leadInLength: 80,
  name: "Cinder Wash",
  runoffLength: 400,
  sections: [
    { climb: 0, length: 400, turnDegrees: 0 },
    { climb: -6, length: 600, turnDegrees: 8 },
    { climb: -3, length: 60, turnDegrees: 0 },
    { climb: 3, length: 60, turnDegrees: 0 },
    { climb: 0, length: 240, turnDegrees: 0 },
    { climb: -3, length: 50, turnDegrees: 0 },
    { climb: 3, length: 50, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: 0 },
    { climb: -2.5, length: 40, turnDegrees: 0 },
    { climb: 2.5, length: 40, turnDegrees: 0 },
    { climb: 2, length: 760, turnDegrees: 0 },
    { climb: 6, length: 200, turnDegrees: 120 },
    { climb: 22, length: 300, turnDegrees: 0 },
    { climb: 4, length: 200, turnDegrees: -30 },
    { climb: 5, length: 120, turnDegrees: 0 },
    { climb: -8, length: 120, turnDegrees: 0 },
    { climb: -20, length: 400, turnDegrees: 24 },
    { climb: 0, length: 250, turnDegrees: -36 },
    { climb: 0, length: 310, turnDegrees: 0 },
  ],
  seed: 0xc1_d3_0a,
  shoulderWidth: 1.4,
  trafficPerKilometre: 3,
  vergeWidth: 14,
};
```

### Levels 2 to 5

**Level 2 appends (1,150 m).** A fourth wash (163 km/h) and a 72° right around the water tower.

`[420, 0, 0], [60, 0, -3.5], [60, 0, 3.5], [300, -28, 0], [160, 72, 2], [150, 0, 0]`

**Level 3 appends (1,150 m).** A second drag, 560 m, into the Corral: a 110° left at a radius of 80 m, then a crest.

`[560, 0, -2], [220, -110, 4], [130, 0, 6], [80, 0, 4], [100, 0, -6], [60, 0, 0]`

**Level 4 appends (1,150 m).** Twin washes back to back (147 and 117 km/h), so the bike lands from one and takes off from the next, then a 100° left.

`[360, 18, -10], [50, 0, -3], [50, 0, 3], [40, 0, -3], [40, 0, 3], [260, 0, 0], [170, -100, 0], [180, 0, 0]`

**Level 5 appends (1,150 m).** The last drag into the tightest bend in the game, a 130° right at a radius of 56 m, then a climb, a crest at 152 km/h, and a 50° left down to the airstrip finish.

`[380, 0, 0], [180, 130, 8], [160, 0, 10], [90, 0, 5], [90, 0, -9], [140, -50, -6], [110, 0, 0]`

Traffic per km by level: 3, 4, 5, 6, 7. Roadblocks: the dry lake descent at 0.6 km, the Drag at 1.9 km, and the level-2 straight at 4.6 km. Never inside a wash.

## Hollow Pine Road (Kettle Woods)

Hollow Pine Road is the technical road: the shortest, the narrowest (3.4 m lanes and a 5 m verge with trees at the edge of it), and never straight for more than 380 m. Ten bends in 3.6 km, five of which a Sesta 600 cannot take flat. Its signature is the **blind crest** at 0.96 km: the road rises 6 m, drops away, and the 44° right that follows is hidden until the bike is over the top. After it come **the Esses**, a left and a right at radii of 120 and 127 m with no straight between them, where a shove sends a rider into the pines. **Logjam Left** is a 60° bend at the bottom of a long descent, **the Hummocks** are a double crest that launches at 186 km/h, and the **covered bridge** is 220 m of straight in a timber tunnel. The last bend is **the Sawmill Hook**, 64° at a radius of 88 m, 153 km/h on a Sesta, 380 m before the line: a lead can be lost there. Fog limits sight to about 350 m. Log trucks make the traffic slow and long.

### Level 1 sections

| # | Starts at (m) | length | turnDegrees | climb | Note |
| --: | --: | --: | --: | --: | --- |
| 1 | 0 | 260 | 0 | 0 | Start at the ranger station |
| 2 | 260 | 200 | -20 | 0 | Gentle left into the trees |
| 3 | 460 | 180 | 30 | 3 | S-bend, right |
| 4 | 640 | 180 | -34 | 3 | S-bend, left |
| 5 | 820 | 140 | 0 | 6 | Blind crest, rise |
| 6 | 960 | 100 | 0 | -6 | Blind crest, drop |
| 7 | 1,060 | 160 | 44 | -3 | Right hander hidden by the crest |
| 8 | 1,220 | 120 | -40 | 0 | Esses, left |
| 9 | 1,340 | 120 | 38 | 0 | Esses, right |
| 10 | 1,460 | 340 | 0 | -8 | Long descent |
| 11 | 1,800 | 220 | -60 | -4 | Logjam Left |
| 12 | 2,020 | 160 | 0 | 4 | Hummocks, rise |
| 13 | 2,180 | 90 | 0 | 5 | Hummocks, second rise |
| 14 | 2,270 | 90 | 0 | -6 | Hummocks, drop; launches at 186 km/h |
| 15 | 2,360 | 300 | 32 | -2 | Right through the clearing |
| 16 | 2,660 | 200 | -28 | 0 | Left along the creek |
| 17 | 2,860 | 220 | 0 | 0 | Covered bridge |
| 18 | 3,080 | 140 | 64 | 0 | Sawmill Hook; 153 km/h on a Sesta 600 |
| 19 | 3,220 | 380 | 0 | 0 | Finish in the sawmill yard |

Total 3,600 m.

```ts
export const hollowPineRoad: TrackPlan = {
  id: "hollow-pine-road",
  laneWidth: 3.4,
  leadInLength: 80,
  name: "Hollow Pine Road",
  runoffLength: 400,
  sections: [
    { climb: 0, length: 260, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: -20 },
    { climb: 3, length: 180, turnDegrees: 30 },
    { climb: 3, length: 180, turnDegrees: -34 },
    { climb: 6, length: 140, turnDegrees: 0 },
    { climb: -6, length: 100, turnDegrees: 0 },
    { climb: -3, length: 160, turnDegrees: 44 },
    { climb: 0, length: 120, turnDegrees: -40 },
    { climb: 0, length: 120, turnDegrees: 38 },
    { climb: -8, length: 340, turnDegrees: 0 },
    { climb: -4, length: 220, turnDegrees: -60 },
    { climb: 4, length: 160, turnDegrees: 0 },
    { climb: 5, length: 90, turnDegrees: 0 },
    { climb: -6, length: 90, turnDegrees: 0 },
    { climb: -2, length: 300, turnDegrees: 32 },
    { climb: 0, length: 200, turnDegrees: -28 },
    { climb: 0, length: 220, turnDegrees: 0 },
    { climb: 0, length: 140, turnDegrees: 64 },
    { climb: 0, length: 380, turnDegrees: 0 },
  ],
  seed: 0x4f_17_e2,
  shoulderWidth: 0.6,
  trafficPerKilometre: 6,
  vergeWidth: 5,
};
```

### Levels 2 to 5

**Level 2 appends (1,150 m).** A crest that launches at 153 km/h with a 62° left hidden behind it.

`[200, -36, 2], [150, 40, 2], [120, 0, 6], [80, 0, -7], [150, -62, -3], [250, 20, -2], [200, 0, 0]`

**Level 3 appends (1,150 m).** A tight S at 52° each way, a crest at 145 km/h, and a 70° right.

`[160, 52, 0], [140, -52, 0], [220, 0, -6], [110, 0, 5], [70, 0, -6], [180, 70, -2], [270, 0, 0]`

**Level 4 appends (1,150 m).** The steepest blind crest on the road (126 km/h) into a 78° left at a radius of 67 m, then a 66° right.

`[240, 0, 8], [100, 0, 6], [70, 0, -8], [130, -78, -4], [140, 66, 0], [200, -30, 0], [270, 0, -2]`

**Level 5 appends (1,150 m).** Three linked bends, a last crest at 162 km/h, and a 90° left to the finish at the lake.

`[180, 46, -4], [150, -58, -2], [140, 62, 0], [200, 0, 6], [90, 0, 5], [90, 0, -8], [160, -90, -3], [140, 0, 0]`

Traffic per km by level: 6, 7, 8, 9, 10. Roadblocks: the long descent at 1.65 km, the run to the sawmill at 3.4 km, and the level-3 straight at 5.8 km. Never in the covered bridge.

## Slag Row (Lowtown)

Slag Row is the stop-and-go road. Long, wide straights through the port end in right-angle corners at radii near 70 m, which even the Wren must brake for (about 156 km/h) and a Sesta 600 holds at 137 to 139 km/h. Three of them, **Foundry Corner**, **Canal Corner**, and **Smelter Gate**, set the rhythm: sprint, brake, turn, sprint. Between them, **the rail crossing** is a 60 m hump that launches at 139 km/h, so every bike hops it, and **the underpass** is a dip under the freeway that compresses the suspension and hides what is coming up the far side. **The scrapyard chicane** flicks right and left at 46° each, and **the drawbridge** is a 10 m ramp with a crest at the top that launches at 166 km/h. Traffic is the heaviest of any road and includes buses and vans that block the view. The finish is 310 m after Smelter Gate, close enough that the exit of the last corner decides the race.

### Level 1 sections

| # | Starts at (m) | length | turnDegrees | climb | Note |
| --: | --: | --: | --: | --: | --- |
| 1 | 0 | 320 | 0 | 0 | Start under the gantry cranes |
| 2 | 320 | 160 | 88 | 0 | Foundry Corner |
| 3 | 480 | 480 | 0 | 0 | Warehouse straight |
| 4 | 960 | 30 | 0 | 1.2 | Rail crossing, rise |
| 5 | 990 | 30 | 0 | -1.2 | Rail crossing, drop; launches at 139 km/h |
| 6 | 1,020 | 440 | -20 | 0 | Long left drift past the depot |
| 7 | 1,460 | 120 | 0 | -5 | Underpass, down |
| 8 | 1,580 | 120 | 0 | 5 | Underpass, up |
| 9 | 1,700 | 160 | -90 | 0 | Canal Corner |
| 10 | 1,860 | 560 | 0 | 2 | Canal straight along the docks |
| 11 | 2,420 | 200 | 46 | 0 | Scrapyard chicane, right |
| 12 | 2,620 | 150 | -46 | 0 | Scrapyard chicane, left |
| 13 | 2,770 | 300 | 0 | 10 | Bridge ramp |
| 14 | 3,070 | 80 | 0 | 4 | Drawbridge, rise |
| 15 | 3,150 | 80 | 0 | -6 | Drawbridge, drop; launches at 166 km/h |
| 16 | 3,230 | 300 | -10 | -8 | Down off the bridge |
| 17 | 3,530 | 160 | 90 | 0 | Smelter Gate |
| 18 | 3,690 | 310 | 0 | 0 | Finish at the smelter |

Total 4,000 m.

```ts
export const slagRow: TrackPlan = {
  id: "slag-row",
  laneWidth: 3.5,
  leadInLength: 80,
  name: "Slag Row",
  runoffLength: 400,
  sections: [
    { climb: 0, length: 320, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: 88 },
    { climb: 0, length: 480, turnDegrees: 0 },
    { climb: 1.2, length: 30, turnDegrees: 0 },
    { climb: -1.2, length: 30, turnDegrees: 0 },
    { climb: 0, length: 440, turnDegrees: -20 },
    { climb: -5, length: 120, turnDegrees: 0 },
    { climb: 5, length: 120, turnDegrees: 0 },
    { climb: 0, length: 160, turnDegrees: -90 },
    { climb: 2, length: 560, turnDegrees: 0 },
    { climb: 0, length: 200, turnDegrees: 46 },
    { climb: 0, length: 150, turnDegrees: -46 },
    { climb: 10, length: 300, turnDegrees: 0 },
    { climb: 4, length: 80, turnDegrees: 0 },
    { climb: -6, length: 80, turnDegrees: 0 },
    { climb: -8, length: 300, turnDegrees: -10 },
    { climb: 0, length: 160, turnDegrees: 90 },
    { climb: 0, length: 310, turnDegrees: 0 },
  ],
  seed: 0x5a_9c_33,
  shoulderWidth: 0.5,
  trafficPerKilometre: 8,
  vergeWidth: 6,
};
```

### Levels 2 to 5

**Level 2 appends (1,150 m).** A 90° left and a second rail crossing.

`[300, 0, 0], [150, -90, 0], [260, 0, -4], [30, 0, 1.2], [30, 0, -1.2], [200, 40, 4], [180, 0, 0]`

**Level 3 appends (1,150 m).** The flyover: a crest at 153 km/h, a 92° right, and a 390 m boulevard.

`[240, 0, 6], [80, 0, 4], [80, 0, -7], [200, -26, -3], [160, 92, 0], [390, 0, 0]`

**Level 4 appends (1,150 m).** An 88° left in 130 m (radius 59 m), a second chicane, and a second underpass.

`[340, 0, 0], [130, -88, 0], [160, 50, 0], [140, -50, 0], [120, 0, -5], [120, 0, 5], [140, 0, 0]`

**Level 5 appends (1,150 m).** The freeway ramp with a crest at 152 km/h, a 95° right, and the finish at the container terminal.

`[300, 0, 8], [90, 0, 5], [90, 0, -9], [220, -12, -4], [150, 95, 0], [150, -40, 0], [150, 0, 0]`

Traffic per km by level: 8, 9, 10, 11, 12. Roadblocks: the warehouse straight at 0.65 km, the canal straight at 2.05 km, and the level-3 boulevard at 6.1 km.

## Ridge Road (Stonepeak)

Ridge Road is the existing track, unchanged at level 1: 4.25 km, ten bends, and two crests on the climb to the lookout. It is the balanced road and the home road. On a Wren every bend is flat; on a Sesta 600 three are not; on an Anvil 1100 five are not. The signature moments are **the Switchback**, a 44° left straight into a 50° right at radii of 155 and 136 m, where the right is the bend the Sesta cannot take flat (194 km/h); **the Saddle**, a 90 m rise and 90 m drop at 2.19 km that launches at 162 km/h with bare rock on both sides; **Quarry Bend**, a 42° right at a radius of 143 m; and **the Hump**, a second, gentler crest before the finish that only launches above 211 km/h. Its name stays. It is the finale at level 5, where it is called the Long Ridge.

### Level 1 sections

| # | Starts at (m) | length | turnDegrees | climb | Note |
| --: | --: | --: | --: | --: | --- |
| 1 | 0 | 220 | 0 | 0 | Start straight below the ridge |
| 2 | 220 | 260 | 22 | 4 | Easy right, climbing |
| 3 | 480 | 180 | 0 | 8 |  |
| 4 | 660 | 240 | -38 | 6 | Left over the shoulder |
| 5 | 900 | 160 | 0 | -9 |  |
| 6 | 1,060 | 300 | 48 | -4 | Long right, falling |
| 7 | 1,360 | 140 | 0 | 3 |  |
| 8 | 1,500 | 170 | -44 | 0 | Switchback left |
| 9 | 1,670 | 170 | 50 | 2 | Switchback right; not flat on a Sesta 600 |
| 10 | 1,840 | 260 | 0 | 10 | Climb to the Saddle |
| 11 | 2,100 | 90 | 0 | 7 | The Saddle, rise |
| 12 | 2,190 | 90 | 0 | -8 | The Saddle, drop; launches at 162 km/h |
| 13 | 2,280 | 320 | -30 | -10 | Long descending left |
| 14 | 2,600 | 200 | 16 | 3 |  |
| 15 | 2,800 | 150 | 42 | 0 | Quarry Bend |
| 16 | 2,950 | 240 | 0 | -6 |  |
| 17 | 3,190 | 280 | -52 | 8 | Climbing left 52 degrees |
| 18 | 3,470 | 110 | 0 | 6 | The Hump, rise |
| 19 | 3,580 | 110 | 0 | -7 | The Hump, drop; launches at 211 km/h |
| 20 | 3,690 | 260 | 26 | 0 | Run toward the lookout |
| 21 | 3,950 | 300 | 0 | -3 | Finish at the lookout |

Total 4,250 m.

This is `packages/track/src/tracks/ridge-road.ts` as it stands; nothing changes at level 1.

### Levels 2 to 5

**Level 2 appends (1,150 m).** Past the lookout: the Elbow, a 70° right at a radius of 92 m, then a 58° left.

`[200, -34, 6], [180, 0, 9], [160, 70, 4], [200, 0, -6], [150, -58, -4], [260, 0, 2]`

**Level 3 appends (1,150 m).** The Step: a crest that launches at 144 km/h into an 80° left.

`[240, 30, 8], [120, 0, 6], [80, 0, -8], [220, -80, -6], [180, 0, 0], [160, 62, 4], [150, 0, -4]`

**Level 4 appends (1,150 m).** A 300 m descent into the Drop Hairpin, 96° at a radius of 58 m, then a crest at 134 km/h.

`[300, 0, -12], [140, -96, -3], [200, 0, 5], [100, 0, 6], [70, 0, -7], [180, 54, -2], [160, 0, 0]`

**Level 5 appends (1,150 m).** The summit climb: a 76° left, a crest that launches at 128 km/h into an 88° right, and the finish at the summit mast.

`[220, 40, 10], [160, -76, 6], [140, 0, 8], [90, 0, 6], [80, 0, -10], [200, 88, -6], [260, 0, -4]`

Traffic per km by level: 5, 6, 7, 8, 9. Roadblocks: the climb to the Saddle at 2.0 km, the descent at 3.1 km, and the run to the lookout at 4.1 km.
