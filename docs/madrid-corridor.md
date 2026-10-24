# Madrid corridor data

`pnpm madrid` downloads pinned free inputs into `tools/madrid/.cache/`, verifies their SHA-256 hashes, and writes `packages/track/data/madrid-corridor.json` plus its JSON Schema. It also writes a self-contained preview to the cache. Run `pnpm madrid --preview /absolute/path/corridor.html` to put that report elsewhere. A clean checkout needs only `pnpm install` and this command. No GIS installation, map tiles or API key is needed.

The default cache is ignored by Git. `--cache /absolute/path/to/empty-cache` proves a cold regeneration without disturbing a working cache. A second run must produce identical corridor bytes. The file is compact JSON, so Oxfmt leaves that generated asset alone. The schema comes from `packages/track/src/madrid-schema.ts` and is regenerated with the asset. Tests read the committed asset through the same decoder and connectivity checks as the generator.

## Route and coordinates

The corridor starts at an IGN road node on Plaza de la Independencia by Puerta de Alcalá. It follows Alcalá through Cibeles, Gran Vía, Plaza de España, Cuesta de San Vicente and Puente del Rey. It takes Paseo del Embarcadero along the lake, Glorieta de los Patines, Paseo Puerta del Ángel and Extremadura, then Puente de Segovia, Calle and Ronda de Segovia, Puerta de Toledo, Gran Vía de San Francisco and surface Bailén to the palace frontage.

The centreline measures 8,702.7 m after rounding coordinates to 0.1 m. It has 16 ordered street legs and no repeated source node. It describes a closed race corridor. It is not a legal driving itinerary, and the park section includes pedestrian routes.

`tools/madrid/route.json` pins the ordered IGN road-link IDs and each leg's starting node. Links join through their original node IDs and identical coordinates. The generator never invents a connector, snaps disconnected geometry or crosses between stacked roads at an intersection on the map. Missing source IDs, a disconnected node, separated coordinates, a repeated node or a wrong chainage fail generation. The selected chain was inspected against the official municipal street-area geometry. Regeneration checks that every leg has coverage from its approved municipal street names in the pinned 2019 width polygons. Individual width samples without a unique named match remain null. Node identity, rather than a 2D polygon overlap, governs connection between stacked roads.

Coordinates are metres in EPSG:25830, translated by `origin`, the easting and northing pair `[437000, 4473000]`. Add that origin to a position to recover the source projection. Street `startM`, `endM`, junction and landmark `atM`, and elevation `atM` measure distance along the ordered centreline. City, park and old-city zones are authored subdivisions, not municipal classifications.

This file does not change `TrackPlan` and is not imported by the game or renderer. Only the source notices are imported by `/credits`.

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
