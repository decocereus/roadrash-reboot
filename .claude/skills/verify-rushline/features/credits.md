# Data credits

The credits page names the datasets behind the Madrid corridor and links their licences. Settings opens it in a new tab so an ongoing race stays in place.

## Sub-features

- `settings-link`: data credits in Settings, available in the back room and the paused race.
- `credits`: direct `/credits` page, with dataset dates, source links, adaptation notices and licence links.
- `licence-text`: the full CDLA Permissive 2.0 agreement ships with the site.

## How to get to it (user POV)

Open the back room, choose Settings, then Data credits (new tab). During a race, pause and choose Settings to reach the same link. The page also opens directly at `/credits`.

## Driving it with rv

Preconditions: a fresh windowed Helium slot, using slot 3 for map-1.

- Open the back room with `rv open --run <run> "/" --until bar`, then `rv click --run <run> "Back room"` and `rv click --run <run> "Settings" --within "Back room"`. Save `rv aria --run <run> settings-before-credits`. The Data credits link says it opens a new tab and has `/credits` as its href. Read it with `rv js --run <run> '({href:document.querySelector("a[href=\"/credits\"]").getAttribute("href"),target:document.querySelector("a[href=\"/credits\"]").target})'`.
- Open the destination in the controlled tab with `rv open --run <run> "/credits"`, then `rv shot --run <run> credits` and `rv aria --run <run> credits`. The heading says Data credits. The page lists Madrid streets, widths and acoustic signals, IGN roads and terrain, Microsoft buildings and Wikidata. Read all seven source entries and their links with `rv js --run <run> 'Array.from(document.querySelectorAll("main li")).map(li=>({text:li.innerText,links:Array.from(li.querySelectorAll("a")).map(a=>a.getAttribute("href"))}))'`.
- Open `rv open --run <run> "/licenses/cdla-permissive-2.0.txt"`. The document contains sections 1 to 5, including the conditions for sharing data and definitions. A local file comparison in the corridor tests also verifies that the site copy matches the licence distributed beside the corridor.
- Check `rv console --run <run> errors`. Save screenshots and the journal before `rv down --run <run>`.

## Gotchas

The generator's map preview is an offline report, not a game route. It has no base-map dependency. Inspect the actual PNGs before reporting visual verification. A direct visit to `/credits` alone does not prove the Settings entry point. The new tab avoids navigating away from a paused career race.
