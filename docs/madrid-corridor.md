# Madrid corridor data

`pnpm madrid` downloads pinned free inputs into `tools/madrid/.cache/`, verifies their SHA-256 hashes, and writes `packages/track/data/madrid-corridor.json` plus its JSON Schema. It also writes a self-contained preview to the cache. Run `pnpm madrid --preview /absolute/path/corridor.html` to put that report elsewhere. A clean checkout needs only `pnpm install` and this command. No GIS installation, map tiles or API key is needed.

The default cache is ignored by Git. `--cache /absolute/path/to/empty-cache` proves a cold regeneration without disturbing a working cache. A second run must produce identical corridor bytes. The file is compact JSON, so Oxfmt leaves that generated asset alone. The schema comes from `packages/track/src/madrid-schema.ts` and is regenerated with the asset. Tests read the committed asset through the same decoder and connectivity checks as the generator.

## Route and coordinates

The corridor starts at an IGN road node on Plaza de la Independencia by Puerta de Alcalá. It follows Alcalá through Cibeles, Gran Vía, Plaza de España, Cuesta de San Vicente and Puente del Rey. It takes Paseo del Embarcadero along the lake, Glorieta de los Patines, Paseo Puerta del Ángel and Extremadura, then Puente de Segovia, Calle and Ronda de Segovia, Puerta de Toledo, Gran Vía de San Francisco and surface Bailén to the palace frontage.

The centreline measures 8,702.7 m after rounding coordinates to 0.1 m. It has 16 ordered street legs and no repeated source node. It describes a closed race corridor. It is not a legal driving itinerary, and the park section includes pedestrian routes.

`tools/madrid/route.json` pins the ordered IGN road-link IDs and each leg's starting node. Links join through their original node IDs and identical coordinates. The generator never invents a connector, snaps disconnected geometry or crosses between stacked roads at an intersection on the map. Missing source IDs, a disconnected node, separated coordinates, a repeated node or a wrong chainage fail generation. The selected chain was inspected against the official municipal street-area geometry. Regeneration checks that every leg has coverage from its approved municipal street names in the pinned 2019 width polygons. Individual width samples without a unique named match remain null. Node identity, rather than a 2D polygon overlap, governs connection between stacked roads.

Coordinates are metres in EPSG:25830, translated by `origin`, the easting and northing pair `[437000, 4473000]`. Add that origin to a position to recover the source projection. Street `startM`, `endM`, junction and landmark `atM`, and elevation `atM` measure distance along the ordered centreline. City, park and old-city zones are authored subdivisions, not municipal classifications.

This file is not imported by the game or renderer, and no `TrackPlan` is built from it yet. Only the source notices are imported by `/credits`.

## Inputs and licences

`tools/madrid/inputs.json` records every exact download URL and content hash. The processed file repeats this manifest and the source catalogue. Mutable services are pinned to the downloaded snapshot on 2026-10-24. If an upstream value changes, generation stops. A changed IGN snapshot requires re-pinning and re-checking the selected IDs and surface connections in `route.json`. The daily street register informed authoring and is credited, but is not downloaded by regeneration. Review that source and deliberately update its pin rather than accepting a new dataset silently. For the IGN WFS response only, the request's `timeStamp` attribute is normalised before hashing. Every feature and coordinate remains covered by the hash. Wikidata URLs pin individual entity revisions. Microsoft's tile URL pins its 2026-08-13 release.

| Input | Source, date and licence |
| --- | --- |
| Named street polygons used for corridor selection | [Madrid Viales vigentes](https://datos.madrid.es/dataset/300735-0-mapas-callejero-viales), service snapshot 2026-10-24, CC BY 4.0 |
| Street-area widths | [Madrid Ancho medio de viario](https://geoportal.madrid.es/IDEAM_WBGEOPORTAL/dataset.iam?id=50eb8888-9edf-11ea-94f1-987654321), data date 2019-12-01, service snapshot 2026-10-24, municipal reuse conditions and CC BY 4.0 |
| Road centrelines and junction nodes | [IGN IGR Redes de Transporte](https://servicios.idee.es/wfs-inspire/transportes?service=WFS&request=GetCapabilities), RoadLink snapshot 2026-10-24, CC BY 4.0 |
| Ground elevation | [IGN MDT05 WCS](https://servicios.idee.es/wcs-inspire/mdt?service=WCS&request=GetCapabilities&version=1.0.0), Elevacion25830_5 snapshot 2026-10-24, CC BY 4.0 |
| Signal devices | [Madrid acoustic signal devices](https://datos.madrid.es/dataset/202539-0-semaforos-avisadores), September 2026 file updated 2026-10-01, CC BY 4.0 |
| Footprints and available height estimates | [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints), Spain tile 033111012, release 2026-08-13, CDLA Permissive 2.0 |
| Landmark names and coordinate statements | [Wikidata structured data](https://www.wikidata.org/wiki/Wikidata:Licensing), entity revisions retrieved 2026-10-24 and pinned in the manifest, CC0 1.0 |

The attribution wording and modification notices live in `packages/track/src/madrid-sources.ts`. `/credits` displays all of them. The complete CDLA Permissive 2.0 agreement ships beside the corridor and at `/licenses/cdla-permissive-2.0.txt`; a test keeps those copies identical. The preview also shows the source notices. The full agreement must accompany any redistribution of the processed footprints.

No geometry or other data was imported from OpenStreetMap, Overture, Google or the prior OSM research exports. Only the coordinator's named street sequence guided selection. All source geometry comes directly from the providers listed above.

## Fitting track pieces

`pnpm madrid:fit` fits track pieces to the corridor centreline and prints how closely the fitted road follows the street. It writes the pieces to `tools/madrid/.cache/fits.json`. `--interval from:to` picks stretches in metres of chainage and defaults to `600:1600`. `--min-radius` sets the limits to try and defaults to none, 60, 120 and 265 m. The whole corridor is always fitted too.

`fitPolyline` in `tools/madrid/src/fit.ts` takes a polyline in corridor metres, a minimum radius and a list of slow places. A slow place lowers the radius limit between two chainages of the polyline, for a bend the rider brakes for or a junction. It returns a start pose and 25 m pieces whose curvature changes linearly between knots, so the road is a chain of clothoids. It also returns the RMS, 95th percentile and largest distance from the street, the tightest radius, the street chainage where the limit held a knot at full lock, and each street point's distance from the fitted road. The fit is a bounded least-squares solve with a penalty on each change of curvature between knots. It first matches points at equal arclength, then settles each street point on its nearest point of the fitted road in order. It trims the road to where the street ends and repeats until the length stops changing. Fitted roads are horizontal only, so every grade is 0, and the start pose uses the corridor's translated coordinates. A fit of the whole corridor at 60 m takes about 40 s.

The penalty stands for what the rider feels. A change of curvature turns the chase camera's heading faster or slower, and that yaw acceleration grows with the square of the speed. So each change is weighed by the fourth power of the speed a bike takes that stretch at, relative to 50 m/s. The speed comes from the street's own curvature, the mean turn of its heading over 50 m, or from the radius limit where the limit is tighter, at 8 m/s² of cornering. On a straight the street's vertex noise would otherwise make the road weave from piece to piece at top speed, and the full weight stops it. A slow bend gets a light weight and keeps its shape. The centreline's vertices sit 12 to 29 m apart with about half a metre of jitter, so before this weighting the fit changed the sign of its curvature 16 to 20 times a kilometre on straight streets.

`tools/madrid/src/smoothness.ts` holds the limits that every existing road meets at every level. Curvature changes sign at most 3 times a kilometre, counting only bends tighter than a 1 km radius. The change of grade changes sign at most 7 times a kilometre, counting only crests and dips tighter than a 10 km radius. Grade changes by at most 6 per mille per metre. `tools/madrid/test/fit.test.ts` holds a noisy straight street and a noisy climb to the same limits, and both tests fail on the uniform light penalty the fitter used before.

Fits on the pinned corridor, all distances in metres:

| Stretch | Radius limit | RMS | 95th percentile | Max | Tightest radius | Fitted length (street) |
| --- | --: | --: | --: | --: | --: | --: |
| Whole corridor | none | 1.3 | 2.5 | 17.3 | 9.2 | 8,683 (8,703) |
| Whole corridor | 60 | 5.8 | 12.9 | 39.2 | 60.0 | 8,508 |
| Whole corridor | 120 | 18.1 | 45.3 | 80.6 | 120.0 | 8,616 |
| Whole corridor | 265 | 54.2 | 132.1 | 155.5 | 265.0 | 8,093 |
| 0.60 to 1.60 km | none | 0.4 | 1.0 | 1.8 | 72.9 | 999 (1,000) |
| 0.60 to 1.60 km | 60 | 0.4 | 1.0 | 1.8 | 72.9 | 999 |
| 0.60 to 1.60 km | 120 | 0.5 | 1.1 | 2.9 | 120.0 | 998 |
| 0.60 to 1.60 km | 265 | 1.4 | 3.5 | 5.7 | 265.0 | 997 |

Without a limit the fit keeps within 2.5 m of the street for 95% of its length, but it rounds the sharpest turns. Its tightest bend is 9.2 m, and it misses the street by up to 17.3 m there. The IGN centreline turns far tighter than a bike can ride: −142° within 40 m at Cuesta de San Vicente, a 91° turn within 25 m in the park, and four right angles in a row at Ronda de Segovia and Puerta de Toledo.

### The 60 m limit

Use a 60 m minimum radius. No Madrid bend can hold 200 km/h, so the limit comes from the bends the game already asks riders to take. Every existing road reaches a bend of 55.5 to 66.8 m by level 5, and Cinder Wash and Slag Row have bends of 67 and 70 m at level 1. A Sesta holds 88 km/h at 60 m with full steer and a Wren 101 km/h. A bike at 200 km/h brakes for it, as it does for the right angles on Slag Row. 60 m is also the bottom of the launch research's 60 to 120 m band for a major junction turn, below which a forced turn is a flagged exception.

The larger limits leave the street. Holding 200 km/h at full lock on a Sesta needs 265 m, and that road leaves the street by up to 158 m, through buildings. At 120 m it leaves the street by up to 80 m. At 60 m the 95th percentile is 12.9 m, and the test interval on Alcalá and Gran Vía stays within 1.8 m.

Whole corridor at 60 m, where the limit moved the road more than 1 m further from the street than the unlimited fit:

| Street chainage | Street | Max distance | Unlimited fit |
| --- | --- | --: | --: |
| 0 to 109 | Alcalá · Puerta de Alcalá to Cibeles | 9.8 | 3.2 |
| 2,921 to 3,055 | Cuesta de San Vicente | 20.1 | 17.3 |
| 3,320 to 3,426 | Puente del Rey · Embarcadero · lake edge | 5.8 | 3.3 |
| 4,006 to 4,249 | Embarcadero S-bend by the boathouse | 13.1 | 2.0 |
| 4,378 to 4,602 | Glorieta de los Patines | 17.8 | 4.7 |
| 5,135 to 5,211 | Paseo de Extremadura | 5.0 | 3.6 |
| 6,114 to 6,279 | Calle de Segovia | 23.0 | 6.9 |
| 6,806 to 6,856 | Ronda de Segovia | 3.2 | 1.8 |
| 7,157 to 7,564 | Ronda de Segovia | 39.2 | 7.7 |
| 7,866 to 7,917 | Gran Vía de San Francisco | 3.9 | 2.7 |

Six places leave the street by more than 9 m: the corridor's first 109 m from Puerta de Alcalá, the Cuesta de San Vicente hairpin, the S-bend and Patines in the park, the turn onto Calle de Segovia and the Puerta de Toledo sequence. The first is new with the speed-weighted penalty. The street circles Puerta de Alcalá and turns 83° in its first 64 m. The 60 m limit holds the road at full lock there, and even a bend at the limit now carries about a hundred times the old penalty, so the road runs up to 9.8 m off the street. The greybox needs an authored race line inside the paved area at each of them, or a junction the rider slows for.

### What a playable road still needs

- Paved widths. `pavedWidthM` is null, and the fit measures distance from the centreline, not whether the road stays on tarmac.
- Bridge-deck heights for Puente del Rey, Puente de Segovia and Viaducto de Segovia, and a vertical fit from them. The ground grid passes under the bridges, so the fitter leaves every grade at 0.
- Hazard places from curvature. `placeHazards` finds bends from pieces that turn 20° or more, and a fitted 25 m piece at 60 m rarely does. The hook's slow places turn 22° to 57° per piece, so the hook needs no new rule.
- A start height and an origin for each stretch. The hook settles both for itself.

## Casa de Campo hook

`pnpm madrid:hook` builds a greybox of the hook, chainage 3,600 to 4,650 m: Paseo del Embarcadero along the lake, the S-bend by the boathouse, then Glorieta de los Patines. `tools/madrid/src/hook.ts` fits the street, fits the grade, keeps the blocks and places the lake. `tools/madrid/hook.ts` writes `packages/track/src/tracks/madrid-hook.ts` and prints the numbers below. The plan is not a career road. It rides at `/?ride=madrid-hook` in a development build, with `&bike=` and `&with=alone|field|traffic`; [the hook recipe](../.claude/skills/verify-rushline/features/madrid-hook.md) drives it.

The line is fitted at 60 m with two slow places. The fitted road runs 1,039 m against 1,050 m of street, RMS 1.3 m, 95th percentile 2.9 m, largest 7.6 m from the street. Outside the slow places it stays within 0.9 m. Curvature changes sign 5.8 times per kilometre, each time where the street turns. Those are the Paseo's two gentle bends, the way into the S-bend and its middle, Patines' wide entry and the turn itself. The change of grade changes sign 2.9 times per kilometre.

| Place | Chainage | Radius | Largest distance | 60 m line | Choice |
| --- | --- | --: | --: | --: | --- |
| Embarcadero S-bend by the boathouse | 4,030 to 4,230 | 35 m | 3.5 m | 14.8 m | A slow bend the rider brakes for |
| Glorieta de los Patines | 4,380 to 4,620 | 25 m | 7.6 m | 19.0 m | A junction the rider slows for, through the roundabout's east side |

At 60 m both places cut through the trees beside the street. That would be an invented road, so neither gets an authored line off the paving. The S-bend keeps to the paved Paseo at 35 m. Patines is a roundabout, and at 25 m the line keeps to its eastern carriageway, within 7.6 m of the IGN centreline, on paving the orthophoto shows.

The grade comes from the corridor's MDT05 samples between the two chainages, fitted by least squares on the 25 m knots with a penalty on grade change, starting and ending level. There is no bridge on the hook, because the Puente del Rey envelope ends at 3,435 m. The fit misses the ground by RMS 0.3 m, largest 0.8 m. The steepest grade is 7.9% and the sharpest change 2.72 per mille per metre. The road starts at 581.8 m above sea level, which is y 0. The origin is the street's first point, rounded, at corridor 1,444, 1,465, so the start pose sits within a few metres of the game origin. The last piece is 14 m long because the plan ends level.

The scene is a greybox. `apps/web/src/game/greybox.ts` draws it when a plan carries `scenery`, instead of the open terrain and roadside, because the hook doubles back and terrain built along the road would cross itself. The ground is a world-space grid that follows the nearest road height and falls to the lake. The 48 blocks are the corridor footprints within 180 m of the street that stay clear of the verge, at their estimated heights; one more was dropped. The lake was traced by eye from the IGN PNOA orthophoto as 208 points. Its level sits 1.5 m below the nearest road point, which is 14.6 m from the shore. Trees are procedural, placed on a jittered grid clear of the verge, the lake and the blocks. Props are chevrons only.

The pilot's lap, level 1, seed 31, from `createRace` and confirmed in Helium at the same points:

| Bike | Company | Lap | Slowest in the S-bend | Slowest at Patines | Below 60 km/h |
| --- | --- | --: | --: | --: | --: |
| Ostra Sesta 600 | alone | 35.1 s | 60 km/h | 54 km/h | 2.4 s |
| Halden Wren 400 | alone | 35.0 s | 68 km/h | 61 km/h | 0.0 s |

Police posts start at 1,500 m, past the hook's finish, so no cop rides on the hook.

The Sesta rides Patines under 60 km/h for 2.4 s. That is the junction doing its job, and the reason to look again if the hook is meant to flow.

`apps/web/test/madrid-hook-camera.test.ts` rides the pilot alone on every road at level 1 and drives the real chase camera at the simulation's 60 ticks a second. It holds the hook's straights to the shakiest existing road's on both bikes. A straight is road whose heading nets under 0.05 rad over 100 m with no bend tighter than 100 m in it, so a weave still counts as straight. Yaw wobble is the camera's yaw acceleration less its own one-second average, so a weave stays in and a bend the road eases into drops out. On the Sesta, in m/s² and rad/s²:

| Road | Height acceleration on straights | Yaw wobble on straights |
| --- | --: | --: |
| Hook as map-3 fitted it | 0.78 | 0.216 |
| Hook now | 0.74 | 0.015 |
| Slag Row | 3.49 | 0.008 |
| Ridge Road | 3.72 | 0.016 |
| Hollow Pine Road | 3.18 | 0.024 |

The hook's grade was gentler than every existing road's before the change, and stays so. Its yaw on straights now sits inside the existing roads' range of 0.006 to 0.024. Its yaw rate on straights stays higher than theirs, 0.020 rad/s against 0.002 to 0.005, because the Paseo curves gently at a radius of 500 m to 1 km where the authored roads run dead straight. That is the street's shape, not a shake.

## Measurement limits

- `pavedWidthM` is null. These inputs do not provide a verified paved-width measurement. `streetAreaWidthEstimate` is a separate municipal estimate from the area and perimeter of the named street section. It samples the true arc-length midpoint and accepts only one matching polygon with an approved street name, excluding polygon holes. The chosen name travels with the estimate. It includes the street area, and must not become a paved width or lane count without further evidence.
- IGN road links retain `fictitious`. This is a source cartographic property, including abstract network connections, and is not a claim that every centreline is a surveyed riding line.
- Each road link has `bridge`, either null or the Wikidata ID of its bridge. `route.json` authors conservative whole-link envelopes for Puente del Rey, Puente de Segovia and Viaducto de Segovia. They can include short approaches and are not surveyed abutment positions. Their pinned Wikidata facts are in the landmark inputs. Ground heights are not corrected or interpolated across these envelopes.
- The 5 m grid is ground terrain. The profile samples its cells every 10 m. It includes terrain beneath bridges, and has no road-deck correction. It must not drive ramps, crests or vehicle grade directly.
- The context buffer is 180 m. Whole footprints that intersect the buffer are retained. Footprints are simplified with a 0.6 m local tolerance and rounded to 0.1 m. Microsoft heights remain machine estimates. Missing values remain `unavailable`; no survey height or invented default is written.
- Junctions use IGN nodes of degree three or more on the chain. Signal points are acoustic devices within 40 m of it. Several devices can belong to one crossing. They are a partial inventory and contain neither zebra-crossing outlines nor signal phases.
- Landmark positions are independently sourced Wikidata points. `distanceM` records their perpendicular distance from the centreline. Their route chainage is the nearest point, not an assurance of visibility from a chase camera.

## Verification and credits entry point

Run `pnpm madrid` twice and compare the corridor hash. For a cold proof, use a new `--cache` directory and compare with the warm output. Run `pnpm verify` and follow [the credits recipe](../.claude/skills/verify-rushline/features/credits.md).

The game links to `/credits` from the bottom strip of Settings, both in the back room and when a race is paused. It opens a new tab so the race is not discarded. A future landing-page footer can link directly to `/credits`. The page works at its direct URL and in the production build.
