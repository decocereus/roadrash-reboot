# Round 4 on the Intel UHD 630: today, the set, and the set plus shared depth

Machine: vimaan, Intel UHD 630, fullscreen 1920x1080 at device ratio 1, the game's frame-rate setting of 60. Frame numbers compare only within this machine. All measured runs and all captures ran under `rv bench`, on the build `rv up` serves (development mode, as in round 3). No URL carries `ratio`, `rung` or `preset`.

Sides, each a fresh clone at the exact commit: A `e6eefae5` (origin/main), B `cbf1ff50` (feat/render-presets), C `cb90d509` (feat/shared-depth).

## The table

**The UHD 630 reaches 50 fps with the set and 52 fps with shared depth in the stress window, and 49 and 50 fps on a whole Breakwater race. Today it reaches 38. Nothing holds 60.**

| Scene and side | Canvas | fps | p50 ms | p95 ms | p99 ms | Over 33.4 ms | Over 36 ms | Over 50 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stress window, A, mean of 3 | 1536x864 | 37.7 | 26.6 | 33.0 | 41.6 | 3.6% | 3.5% | 0.00% |
| Stress window, B, mean of 3 | 1344x756 | 50.4 | 19.8 | 21.1 | 21.8 | 0.0% | 0.0% | 0.00% |
| Stress window, C, mean of 3 | 1344x756 | 52.5 | 18.9 | 22.3 | 29.2 | 0.8% | 0.6% | 0.00% |
| Breakwater, A, 1 run, disturbed | 1536x864 | 37.7 | 26.8 | 28.9 | 41.5 | 2.1% | 2.1% | 0.01% |
| Breakwater, B, 1 run, disturbed | 1344x756 | 48.6 | 20.6 | 22.3 | 24.4 | 0.5% | 0.4% | 0.04% |
| Breakwater, C, 1 run, disturbed | 1344x756 | 49.9 | 20.1 | 22.2 | 26.0 | 0.7% | 0.6% | 0.03% |

Stress window: `/?stress`, Slag Row, tier 3, seed 8, ticks 1800 to 2400 (10 s, about 375 to 530 frames per run). Breakwater: `/?ride=breakwater-run&tier=3&autopilot&prof`, tick 60 to the end of the race, finishing at 8,496 to 8,499 m at about tick 13,750, 8,583 to 11,416 frames. The URL does not name the seed: `apps/web/src/career/bench.ts` sets `RIDE_SEED = 31` for `?ride=`, on A as on B and C.

Each run:

| Run, in time order | fps | p50 | p95 | p99 | Over 33.4 | Over 36 | Over 50 | Disturbed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| a-round1 | 37.4 | 26.7 | 28.4 | 41.6 | 1.6% | 1.3% | 0 | |
| b-round1 (second attempt) | 50.4 | 19.8 | 21.1 | 21.9 | 0.0% | 0.0% | 0 | |
| c-round1 | 52.8 | 18.9 | 20.6 | 23.5 | 0.4% | 0.4% | 0 | |
| b-round2 (second attempt) | 50.3 | 19.8 | 21.2 | 21.8 | 0.0% | 0.0% | 0 | marked |
| c-round2 | 52.5 | 18.9 | 23.0 | 29.6 | 0.6% | 0.6% | 0 | |
| a-round2 | 37.6 | 26.6 | 29.5 | 41.7 | 4.0% | 4.0% | 0 | |
| c-round3 | 52.3 | 18.9 | 23.2 | 34.4 | 1.3% | 1.0% | 0 | |
| a-round3 | 38.0 | 26.5 | 41.0 | 41.6 | 5.3% | 5.3% | 0 | |
| b-round3 | 50.6 | 19.8 | 21.0 | 21.7 | 0.0% | 0.0% | 0 | |

**33.4 ms does not sit on a two-vsync cluster on any side.** The range 33.0 to 33.7 ms holds at most 0.6% of frames in any run (2 frames of 375 in a-round1, 1 of 526 in c-round2, none in most), and the shares over 33.4 and over 36 ms nearly match. So no result here turns on the 33.4 line. Where the slow frames do gather:

- **A** has a cluster at 41 to 42 ms: 35 of 1,132 stress frames across its rounds and 112 of 8,583 on Breakwater. That is 2.5 periods of a 60 Hz panel, so it is not a whole number of 60 Hz vsyncs, and I did not find out why it lands there. 41.7 ms is 2 x 20.8 ms, and 48 Hz is the bottom of this panel's range, but that is only an arithmetic match.
- **B** has almost no tail in the stress window. Its worst frames there fall under 25 ms.
- **C** has a small spread tail from 27 to 42 ms in the stress window, and on Breakwater 45 frames sit between 36 and 40 ms against B's 14. It also reaches the 16 ms slot more often: 61 to 125 frames per stress run, where B has 2 or 3.

Bins are in `tables.md`. Scripts: `scripts/analyze.mjs` and `scripts/tail.mjs`.

## Shared depth, frames half: PASS

The bar: on both the stress window and Breakwater, C's fps is no lower than B's, and C's share of frames over 36 ms and over 50 ms is no more than 2 points above B's.

| Scene | fps, B then C | Over 36 ms, B then C | Over 50 ms, B then C | Result |
| --- | --- | --- | --- | --- |
| Stress window, 3 rounds | 50.4 then 52.5 (+2.1) | 0.0% then 0.6% (+0.6) | 0.00% then 0.00% (0) | Pass |
| Breakwater, 1 run each, both disturbed | 48.6 then 49.9 (+1.3) | 0.4% then 0.6% (+0.2) | 0.04% then 0.03% (-0.01) | Pass |

Worst single stress round for C: 1.0% over 36 ms and 34.4 ms at p99. Leaving out the marked `b-round2` does not change B's row. Over 33.4 ms on Breakwater reads 0.5% then 0.7%. Round 3's jump, from about 4% to about 25%, did not recur. Its copy went through three's `copyTextureToTexture` and this one is a direct blit. I did not test that as the cause. I only compared the two commits.

C's tail is a little wider than B's. p99 goes from 21.8 to 29.2 ms in the stress window and from 24.4 to 26.0 ms on Breakwater, so the frame-rate gain is not free, but it stays well inside the bar.

## Pixel and look results

Changed pixels use round 3's threshold of 16 of 255 grey levels, on whole 1920x1080 screenshots with the HUD. Every frame advances one tick, as in round 3.

**One thing changes how to read B against A.** The stepping clock makes every frame look on time, so A's governor never steps down in the stills. A's race stills drew rung 3 at 1920x1080. A's real capped runs drew rung 5 at 1536x864. So the B against A race stills compare B with a sharper A than a player on this GPU sees, and they overstate B's softness. MSAA, bloom size and shadow map are the same at rungs 3 and 5, so only resolution is inflated. I used no pin to correct this, as the brief asks. The Bar is not affected: on A it takes its lean settings from the graphics card with no governor (`apps/web/src/game/bar.ts:85`), and it read 1344x756 in the stills. I ran no real-time Bar.

| Comparison | Scene | Stills | Changed pixels, mean | Worst | Exact differences, max |
| --- | --- | --- | --- | --- | --- |
| A against A (control) | Stress window | 8 | 0 | 0 | 0 |
| A against A (control) | Rock | 7 | 0 | 0 | 0 |
| A against A (control) | Bar door dusk, whole room night | 7 | 0 | 0 | 2,810 |
| A against A (control) | NVIDIA Bar door dusk | 5 | 0 | 0 | 3 |
| B against A | Stress window | 8 | 74,804 | 85,847 | 2,051,396 |
| B against A | Breakwater, 3 ticks | 3 | 65,247 | 70,379 | 1,894,799 |
| B against A | Rock, oil, pothole | 7, 5, 7 | 53,049, 62,459, 64,772 | 74,155 | 2,008,886 |
| B against A | Showroom | 2 | 0 | 0 | 679,550 |
| B against A | Bar door dusk, mid-clock, night | 5, 3, 5 | 22,747, 37,238, 53,541 | 193,263 | 2,053,656 |
| B against A | Bar follow, room dusk, room night | 2, 2, 2 | 26,936, 64,300, 89,119 | 91,560 | 2,060,964 |
| B against A | NVIDIA Bar door dusk, room night | 5, 2 | 0 | 0 | 71,183 |
| C against B | Stress window | 8 | 0 | 0 | 0 |
| C against B | Breakwater, 3 ticks | 3 | 0 | 0 | 0 |
| C against B | Rock, oil, pothole | 7, 5, 7 | 0 | 0 | 0 |
| C against B | Showroom | 2 | 0 | 0 | 678,568 |
| C against B | Bar door dusk | 5 | 3,369 | 4,098 | 14,511 |
| C against B | Bar door mid-clock | 3 | 2,646 | 3,641 | 10,712 |
| C against B | Bar door night | 5 | 1,221 | 1,523 | 13,733 |
| C against B | Bar follow camera | 2 | 989 | 989 | 6,380 |
| C against B | Bar whole room dusk | 2 | 628 | 662 | 23,476 |
| C against B | Bar whole room night | 2 | 286 | 300 | 25,983 |
| C against B | NVIDIA Bar door dusk | 5 | 7,227 | 8,043 | 31,814 |
| C against B | NVIDIA Bar whole room night | 2 | 2,387 | 2,410 | 61,590 |

The showroom's exact differences, about 680,000 pixels with none above threshold on both comparisons, have no control behind them, because I dropped the A against A showroom to save time. Round 3 read 0 exact there. I can't say whether they come from the sides or from the turntable's start.

### B against A: what a player loses

**I see no clear visible loss in B. It is softer.** No holes, no sparkle, no missing objects in what I opened.

- **Softness.** B's picture is plainly softer than A's stepped stills, on outlines and shop signs (`crops/race-stress-t02140-a-b-glow-1x.png`). Part of that gap is the stills' 1080p A. The real A draws 1536x864, so a player on this GPU loses less than these crops show.
- **Glow.** Still there, on signs and lit windows, with softer edges. In the race its reach looks about the same as A's. In the Bar, half-size glow reads wider and hazier than A's rather than weaker: the shelf lines and the Lowside sign carry a broader halo (`crops/bar-room-night-a-b-1x.png`). Most of the Bar's 20,000 to 190,000 changed pixels are that halo, as the mask shows. That is a change of look the owner may or may not like.
- **Far riders in motion.** I can't see the change of body, as a pop or as a loss. From tick 1130 to 1249 two rivals go through it, and the near and far counts move at ticks 1190 and 1206. I read 5 frames at 2x side by side and measured the change between consecutive frames: no spike at those two steps (3.6 and 2.2 mean grey against 3.3 to 4.1 and 2.3 around them). Those counts cover the whole frame, so I can't say the swaps fell inside my crop. Far rivals look softer than A's, which is the resolution. `crops/far-rival-a-left-b-right-t1130-t1249-2x.mp4`.
- **Shadows.** I compared no shadow crop for itself. In the crops I opened, rider and building shadows sit in the same places with the same edges at this scale. A's and B's GL records both show `SHADOWMAP_TYPE_PCF` and a 2048x2048 map. I did not separately prove the sample count on either side.
- **NVIDIA.** The Bar reads 0 changed on 7 stills, so B leaves it alone there: same 3024x1546 canvas, full preset.

### C against B: ink around the Bar's cutout plates

**My call: better overall, with one small cost at the road join.** The parent decides from the crops.

- **The sky line goes.** B draws a dark, stepped line across the sky along the plate's top edge, at both dusk and night, on Intel and NVIDIA. C does not (`crops/bar-door-dusk-b-c-topedge-2x.png`, `crops/nv-bar-door-dusk-b-c-topedge-2x.png`). It reads as an artefact, and this matches what round 3 reported. At door dusk it is the largest visible change between the sides.
- **The plate-to-road join gets worse, slightly.** B has a crisp join with bright windows down to the road. In C a soft dark band covers the plate's lowest few pixels, so the bottom row of windows dims to olive at dusk and to a muted tone at night (`crops/bar-door-join-4x-left-dusk-right-night-top-b-bottom-c.png`, which is 3x). I needed zoom to see it clearly. At 1x it shows only as a slightly heavier base to the city.
- **The follow camera loses thin dark lines** across the plate above the bar (`crops/bar-follow-dusk-b-c-1x.png`). Same reasoning as the sky line, and I'd call that better too.
- **Whole room:** small scattered marks only, in window ink, and the plant at left (`crops/bar-room-night-b-c-1x.png`). I can't see a difference without the mask.
- **No holes** through plates, night plates or the rain curtain in anything I opened.
- **Everything else is identical at threshold:** the stress window, the hazard scenes, the showroom and Breakwater's ticks, with exact differences of 0 on stress and hazards. C's GL record shows the main pass not clearing depth and one blit per frame, so identical pictures do mean C's path was active. B's record clears depth and has no blit.

## Which settings each side drew

| | A, real capped runs | A, stepped stills | B and C |
| --- | --- | --- | --- |
| Quality | Rung 5 of its ladder on every measured frame, its lowest rung | Rung 3, never moved | Preset `lean` |
| Canvas | 1536x864, ratio 0.8 | 1920x1080, ratio 1 | 1344x756, ratio 0.7, every frame and every 1 s sample |
| MSAA | 0 samples | 0 samples, no multisample buffer allocated | 0 samples, no multisample buffer allocated |
| Bloom | Scale 1 | 960x540 down to 60x34 | Scale 0.5, 480x270 down to 30x17 |
| Shadow map | 2048 | 2048x2048 | 2048x2048 |
| Far riders | None | None: only near bodies of 94,206 to 94,482 indices | In use (below) |

**A's governor** starts on Intel at rung 3 and falls to rung 5 at 0.8 almost at once: the Breakwater run's first samples read 1920x1080, then 1728x972, then 1536x864, all before the measured window at tick 61. It then stayed there all race. 0.8 is the last rung A's ladder allows, so A sits on its floor here.

**Far riders in B and C.** Stepped B at the stress window draws two body sizes: 94,482 indices (near) and 12,000 indices (far, 4,000 triangles), with 76,789 far draws against 11,672 near across the run. A draws no 12,000-index body. In real capped runs the median triangles in the main pass fall from 1,014,276 (A) to about 665,500 (B and C) in the stress window, and from 897,721 to about 658,300 on Breakwater. Resolution doesn't change triangle counts, so those falls are the far bodies.

**C's depth.** Main pass with no depth clear and 1 blit per frame in the Bar's record. Bar calls fall from 92 to 87 at door dusk and from 105 to 99 at room night, which is the see-through and cutout meshes leaving the normal pass.

**The Bar.** Intel: A, B and C all read a 1344x756 canvas. A's bloom is 960x540, B's and C's 480x270. NVIDIA: all three read 3024x1546 at device ratio 2, page 1512x773, as in round 3. That is not a 1920x1080 window. All three allocate a 4x multisample buffer and a 4096x4096 shadow map. C's main pass still clears depth there, so its copy is off under MSAA, and its normal pass drops from 31 to 26 draws. So NVIDIA's ink changes come from the see-through and cutout meshes leaving the normal pass.

## Disturbed-run counts

Rule as round 3: more than 5 points of CPU busy above the median for the kind, at any second of the window.

| Block | Attempts | Disturbed attempts | Rerun | Kept and marked |
| --- | --- | --- | --- | --- |
| Stress window | 11 | 3 | `b-round1`, `b-round2`, once each | `b-round2`, second attempt, 20.7 against 15.0 for one second |
| Breakwater | 3 | 3 | None, as asked | All three: 26.9 against 13.0, 43.3 against 16.0, 43.7 against 17.8 |

Who was busiest at the worst second, leaving out the game's own Chromium and compositor:

| Attempt | Process |
| --- | --- |
| `bw-a` | None above the game's own |
| `bw-b` | A `claude` process, pid 922978, at 1.57 cores, not this agent (pid 913377), and `t3 serve` at 0.59 core. Another thread started it. It has since exited |
| `bw-c` | `systemd-tmpfiles --clean` at 0.56 core, 5 s before the end of the race |
| `b-round1`, first attempt | `t3 serve` at 0.58 core |
| `b-round2`, both attempts | None above the game's own |

The Breakwater window is about 227 s, and 5, 12 and 23 of those seconds were over the margin. Its one run per side has no repeat, so treat those rows as disturbed. All three sides were marked, so the marks don't favour one.

**The long-running `chrome-headless-shell` from `.t3/tools`.** I did not touch it. It is pid 27682 with GPU process 27706, profile `~/.t3/userdata/server-browser/profiles/default`, a child of `t3 serve`, flags `--disable-gpu` and SwiftShader. It is T3's own browser, not a rushline leftover, so I did not stop it. Its 12.5% is a lifetime average from `ps`: 7 h 58 m of CPU over 2 d 15 h of uptime. It used 0 ticks in a 5 s check before the runs, and the samplers read at most 0.5 jiffies per second on it across every measured run. It was not using real CPU during this round and it disturbed nothing.

All console errors in measured runs are the known "status of 500" line, 1 to 3 per run. I did not check whether any fell inside a window. Preflight's wait for a heavy process was cut from 15 to 2 minutes, and it never waited.

## What I did not check, and where I sampled

- **A's stills ran at rung 3, not rung 5**, as above. No B against A still shows the 1536x864 picture a player gets on A.
- **Breakwater stills are sampled:** ticks 900, 2700 and 3900 on A, B and C. Three of the 20 ticks round 3 used, in 3 of its 7 distance bands, ending at 2,312 m of 8,500 m. Past that, Breakwater has no stills on any side, so its later districts are checked only by frame times.
- **NVIDIA Bar is sampled:** door dusk and whole room night only. Door night, mid-clock, follow and whole room dusk did not run there, to stay inside the hour. Its control covers door dusk only.
- **Controls are partial:** A against A covers stress, rock, Bar door dusk, Bar whole room night, NVIDIA door dusk and nothing on Breakwater. It does not cover Breakwater, oil, pothole, the showroom or the other Bar scenes.
- **Crash scene** (rider thrown) did not run. Rocks, dust after the bump, oil and pothole did.
- **Stills I opened by eye:** Bar door dusk and night, follow dusk and room night for C against B; Bar door night and room night, the stress window at t02140 and Breakwater t02700 (whole frame only) for B against A; NVIDIA door dusk's top edge. All the others have counts only. Hazard scenes for C against B are 0 by count, and I opened none. For B against A, hazards are counted, not opened.
- **Clip:** I built the 2 s clip and read 5 of its 120 frames at 2x, plus the frame-to-frame numbers. I can't watch video here.
- **Round 3's room path** (`/?room=`) did not run. The Bar was reached at `/bar?prof&time=...`, as round 3's scripts do.
- **Build:** `rv` serves a development-mode build. I did not time a production build. Round 3 used the same.
- **Not on this machine:** 120 Hz, and a play test on a real thin laptop, as `AGENTS.md` says.

## Files

- `README.md`, `tables.md` (with 0.2 ms bins), `summary.json`, `driver.log`, `capture.log`, `commands.log`, `preflight.log`, `disturbance.jsonl`.
- `raw/stress/`, `raw/breakwater/`: one result per run with `.sysfs.jsonl`, `.ps.jsonl`, `.cpu.json`. `raw/excluded/`: the two disturbed first attempts.
- `frames/a`, `a2`, `b`, `c`, `nv-a`, `nv-a2`, `nv-b`, `nv-c`: stills, `facts.json`, `proof.json`, `ticklog.json`. `frames/compare-*.json`, `frames/masks/`.
- `crops/`: every crop named above, each as `-1x.png`, `-2x.png` and `-whole.jpg`, with `race-stress-*-glow`, `race-stress-*-rider` and `race-breakwater-t00900`, `t02700`, `t03900` for B against A, and `bar-door-dusk`, `bar-door-night`, `bar-room-night`, `nv-bar-door-dusk` for C against B. The clip is `crops/far-rival-a-left-b-right-t1130-t1249-2x.mp4`, A left and B right, at A's 1080p.
- `scripts/`: `make-driver.mjs`, `driver.mjs`, `make-capture.mjs`, `capture.mjs`, `stepper.mjs`, `analyze.mjs`, `tail.mjs`, `disturb.mjs`, `compare-tree.mjs`, `crop.sh`, `cap.sh`, `part2a.sh`, `part2b.sh`.
- Kept for the next job: `/var/tmp/rushline-r4-b` and `/var/tmp/rushline-r4-c`. `rv` run folders are in each clone's `tools/perf/results/verify/`. `/var/tmp/rushline-r4-a` stays too, because its `rv` folders hold A's runs.
- Evidence branch: `evidence/uhd630-round4`, commit `3388e81`, 19 MB of crops and clip plus the two round 3 files. It's an orphan branch and I touched no other branch.

Release: 2026-11-05 16:24:49 IST (10:54:49 UTC), about 56 minutes after first holding the bench at 15:28:45. `rv list` reads no slots, `rv desktop status` reads no session, and no bench or preview process is left. The T3 `chrome-headless-shell` is still running, untouched.
