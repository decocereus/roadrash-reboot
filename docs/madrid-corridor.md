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

`fitPolyline` in `tools/madrid/src/fit.ts` takes a polyline in corridor metres and a minimum radius. It returns a start pose and 25 m pieces whose curvature changes linearly between knots, so the road is a chain of clothoids. It also returns the RMS, 95th percentile and largest distance from the street, the tightest radius, the street chainage where the limit held a knot at full lock, and each street point's distance from the fitted road. The fit is a bounded least-squares solve with a light penalty on curvature changes. It first matches points at equal arclength, then settles each street point on its nearest point of the fitted road in order. It trims the road to where the street ends and repeats until the length stops changing. Fitted roads are horizontal only, so every grade is 0, and the start pose uses the corridor's translated coordinates. A fit of the whole corridor at 60 m takes about 40 s.

Fits on the pinned corridor, all distances in metres:

| Stretch | Radius limit | RMS | 95th percentile | Max | Tightest radius | Fitted length (street) |
| --- | --: | --: | --: | --: | --: | --: |
| Whole corridor | none | 0.9 | 2.0 | 10.3 | 5.6 | 8,689 (8,703) |
| Whole corridor | 60 | 5.8 | 13.0 | 39.6 | 60.0 | 8,559 |
| Whole corridor | 120 | 17.9 | 45.7 | 79.9 | 120.0 | 8,565 |
| Whole corridor | 265 | 54.2 | 132.0 | 157.5 | 265.0 | 8,066 |
| 0.60 to 1.60 km | none | 0.1 | 0.3 | 0.7 | 44.4 | 1,000 (1,000) |
| 0.60 to 1.60 km | 60 | 0.2 | 0.4 | 1.0 | 60.0 | 1,000 |
| 0.60 to 1.60 km | 120 | 0.4 | 1.0 | 2.4 | 120.0 | 999 |
| 0.60 to 1.60 km | 265 | 1.4 | 3.4 | 5.7 | 265.0 | 997 |

Without a limit the fit follows the street within 2 m for 95% of its length, but its tightest bend is 5.6 m. The IGN centreline turns far tighter than a bike can ride: −142° within 40 m at Cuesta de San Vicente, a 91° turn within 25 m in the park, and four right angles in a row at Ronda de Segovia and Puerta de Toledo.

### The 60 m limit

Use a 60 m minimum radius. No Madrid bend can hold 200 km/h, so the limit comes from the bends the game already asks riders to take. Every existing road reaches a bend of 55.5 to 66.8 m by level 5, and Cinder Wash and Slag Row have bends of 67 and 70 m at level 1. A Sesta holds 88 km/h at 60 m with full steer and a Wren 101 km/h. A bike at 200 km/h brakes for it, as it does for the right angles on Slag Row. 60 m is also the bottom of the launch research's 60 to 120 m band for a major junction turn, below which a forced turn is a flagged exception.

The larger limits leave the street. Holding 200 km/h at full lock on a Sesta needs 265 m, and that road leaves the street by up to 158 m, through buildings. At 120 m it leaves the street by up to 80 m. At 60 m the 95th percentile is 13.0 m, and the test interval on Alcalá and Gran Vía stays within 1 m.

Whole corridor at 60 m, where the limit moved the road more than 1 m further from the street than the unlimited fit:

| Street chainage | Street | Max distance | Unlimited fit |
| --- | --- | --: | --: |
| 0 to 230 | Alcalá · Puerta de Alcalá to Cibeles | 9.5 | 2.9 |
| 1,502 to 1,576 | Gran Vía | 2.2 | 0.7 |
| 2,258 to 2,306 | Plaza de España | 1.5 | 0.3 |
| 2,407 to 2,456 | Cuesta de San Vicente | 1.2 | 0.1 |
| 2,507 to 2,629 | Cuesta de San Vicente | 2.3 | 0.8 |
| 2,730 to 2,779 | Cuesta de San Vicente | 1.4 | 0.1 |
| 2,830 to 2,878 | Cuesta de San Vicente | 1.2 | 0.2 |
| 2,904 to 3,101 | Cuesta de San Vicente | 19.3 | 10.3 |
| 3,227 to 3,609 | Puente del Rey · Embarcadero · lake edge | 7.0 | 3.4 |
| 3,660 to 3,808 | Puente del Rey · Embarcadero · lake edge | 1.8 | 0.3 |
| 3,834 to 3,908 | Puente del Rey · Embarcadero · lake edge | 1.4 | 0.2 |
| 3,934 to 4,645 | Puente del Rey · Embarcadero · lake edge | 16.7 | 3.3 |
| 4,846 to 4,944 | Paseo Puerta del Ángel | 1.7 | 0.6 |
| 5,125 to 5,225 | Paseo de Extremadura | 3.4 | 2.3 |
| 6,000 to 6,386 | Calle de Segovia | 21.6 | 4.9 |
| 6,487 to 6,560 | Ronda de Segovia | 1.5 | 0.4 |
| 7,086 to 7,615 | Ronda de Segovia | 39.6 | 3.8 |
| 7,816 to 7,967 | Gran Vía de San Francisco | 3.2 | 1.3 |

Five places leave the street by more than 9 m: the Cibeles turn, the Cuesta de San Vicente hairpin, the park, the turn onto Calle de Segovia and the Puerta de Toledo sequence. The greybox needs an authored race line inside the paved area at each of them, or a junction the rider slows for.

### What a playable road still needs

- Paved widths. `pavedWidthM` is null, and the fit measures distance from the centreline, not whether the road stays on tarmac.
- Bridge-deck heights for Puente del Rey, Puente de Segovia and Viaducto de Segovia, and a vertical fit from them. The ground grid passes under the bridges, so the fitter leaves every grade at 0.
- Hazard places from curvature. `placeHazards` finds bends from pieces that turn 20° or more, and a fitted 25 m piece rarely does.
- A start height and an origin. The start pose has no height, and corridor coordinates are kilometres from the game's origin.

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
