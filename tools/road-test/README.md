# Road test

`pnpm road:test` races the bots on a road and prints the numbers that decide whether the road works: do riders finish, do they fight, and where do they get stuck behind traffic or each other.

```sh
pnpm road:test --road breakwater-run --tiers 1,3 --out /tmp/road.json
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--road <roadId>` | required | The road to race. With `--plan` it still picks the career field's home rivals. |
| `--tiers 1,3` | `1,2,3` | The tiers to race. Each uses `difficulties[tier].conditions`. |
| `--seeds <count>` | `30` | How many seeds to take from the start of the fixed list in `src/options.ts`, up to 60. |
| `--field default\|career` | `default` | `defaultSetup`'s rivals, or the career field from `practiceSetup` on the Ostra Sesta 600. |
| `--pacing on\|off` | `on` | `on` uses `difficulties[tier].pacing`. `off` turns catch-up and lead ease off. |
| `--plan <module path>` | none | A module that exports a `TrackPlan` as `default`, raced in place of the road's plan. |
| `--out <json path>` | none | Writes the full report, with a row per seed and unrounded numbers. |

Every race has a police count of 0, because a race with police behaves differently, and the player is controller `pilot`. A race stops when every rider has finished or at 420 seconds. Thirty seeds on one tier used 41 s of CPU on tier 1 and 61 s on tier 3, in one process.

## What each number means

A tick counts for a rider only until that rider finishes. Rates in the district table are per kilometre per race, and the kilometres are that district's length.

| Number | Definition |
| --- | --- |
| Stuck | A same-way car is 0 to 30 m ahead, within 2.2 m across, and the rider's speed is below the car's plus 9 m/s. Stuck mean averages each seed's share of its rider ticks. By open lanes pools all ticks, keyed by `openLanesAt` at the rider. |
| Held | A rider that is `riding` has another racing rider 0 to 15 m ahead, within 1.7 m across, and its speed is below that rider's plus 1 m/s. |
| Boxed | A held rider has no lane to pass on. The lanes are the same-way and oncoming lanes open both here and 60 m ahead. A lane is shut when `carThreat` sees a car on it, or a racing rider is 2 m behind to 15 m ahead and within 1.7 m of it. |
| In reach | A rider who is `riding`, grounded and not finished has a rival on either side within reach of its weapon or its kick, by `nearestRival`. |
| Pass | One rider goes from behind another to level or ahead while both are `riding`, grounded and not finished. It counts in the passer's district. |
| Contact pass | A pass within 90 ticks of the two riders being within 1.9 m along and 2.2 m across while both were `riding` and grounded. |
| Attacks, hits, crashes | The race's `attack`, `hit` and `crash` events, in the district of the event's rider. A combat crash is a crash with the cause `combat`. |
| Off-road | The median over seeds of each seed's share of rider ticks with `offRoad` set. |
| Car overlap | Two `race.cars` boxes touch: the gap along is under the sum of their half lengths, and the gap across is under the sum of their half widths. For two cars of one size that is within a car's length and width. Each pair counts once per meeting, so a pair that stays touching counts once and a pair that parts and touches again counts twice. Junction cross traffic is not counted. |
| Median finish, first to last | Each seed's median finish time and last minus first finish, then the median of those over the seeds. |

The stuck, held, boxed and in-reach definitions are frozen so numbers from different roads and dates compare. Change one only with a reason, and rerun the roads you compare against.
