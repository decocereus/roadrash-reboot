---
name: Rushline
description: Race. Fight. Pay for it.
colors:
  ink: "#0e0f12"
  paper: "#ede4d0"
  text: "#f2eee6"
  muted: "#9a9aa3"
  neon-yellow: "#fff04a"
  neon-cyan: "#19e6ff"
  neon-red: "#ff2e3d"
  neon-magenta: "#ff2fb5"
  neon-ink: "#0a0810"
  yellow: "#ffc531"
  red: "#e5312b"
  green: "#5bd06a"
  blue: "#2f6bff"
typography:
  outcome:
    fontFamily: "Big Shoulders Stencil Display, Saira Extra Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(3.5rem, 16.67vmin, 11rem)"
    fontWeight: 800
    lineHeight: 0.85
    letterSpacing: "0.02em"
  wordmark:
    fontFamily: "Big Shoulders Stencil Display, Saira Extra Condensed, Arial Narrow, sans-serif"
    fontSize: "5.024cqw"
    fontWeight: 800
    lineHeight: 1
  hud:
    fontFamily: "Saira Extra Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "clamp(2.5rem, 8.89vmin, 6rem)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "0.02em"
  sheet-title:
    fontFamily: "Saira Extra Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "2.273cqw"
    fontWeight: 800
    lineHeight: 1
  sheet-row:
    fontFamily: "Saira Extra Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "1.555cqw"
    fontWeight: 700
    lineHeight: 0.9
  strip:
    fontFamily: "Saira Extra Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "1.974cqw"
    fontWeight: 700
    lineHeight: 1
  name:
    fontFamily: "Saira Extra Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "clamp(1.375rem, 3.89vmin, 2.5rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.02em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(0.9375rem, 2.5vmin, 1.5rem)"
    fontWeight: 400
    lineHeight: 1.444
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(0.6875rem, 1.8vmin, 1.125rem)"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.08em"
rounded:
  sm: "2.4px"
spacing:
  gutter: "clamp(1rem, 4.4vmin, 3rem)"
components:
  sheet-item:
    textColor: "{colors.ink}"
    typography: "{typography.sheet-row}"
  sheet-item-selected:
    backgroundColor: "{colors.neon-yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.sheet-row}"
  strip-action:
    textColor: "{colors.text}"
    typography: "{typography.strip}"
    rounded: "{rounded.sm}"
    padding: "0 0.4em"
  strip-action-selected:
    textColor: "{colors.neon-yellow}"
    typography: "{typography.strip}"
  name-tape:
    backgroundColor: "{colors.neon-yellow}"
    textColor: "{colors.ink}"
    padding: "0.2em 0.4em"
  stamp:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.neon-yellow}"
    padding: "0 0.3em"
  stamp-bad:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.neon-red}"
    padding: "0 0.3em"
  place-plate:
    backgroundColor: "{colors.neon-yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.hud}"
---

# Design System: Rushline

## Overview

**Creative North Star: "The Lowside Wall"**

Between races the player is in the Lowside, the bar where the career lives, and every screen is a room in it or something pinned to its wall. Ruled sheets with yellow tape across the top, cyan and magenta stickers, flyers, bills, and stencilled stamps sit on painted anime rooms: the bar, the garage, the back room, the car park. The art is painted and the words are live text set over it, so a name, a number, or a line can change without new art. The race view stays clean. The road is the brightest thing on screen, and the only interface that stays on it is one speedometer.

Every room is one fixed 1672 × 941 stage scaled to fit the window. Pieces sit at boxes measured from the approved comps and their type is sized against the stage width, so a room keeps its composition at any window size. Menus are lists written on paper, not buttons. The selected line gets a highlighter stroke of neon yellow, and the actions along the bottom strip get a neon-yellow outline.

Density is low. A room has one sheet of choices, one or two notes, one figure, and the strip. Keyboard first: arrows move, Enter takes the highlighted line, Escape goes back.

**Key Characteristics:**

- Painted rooms on a fixed stage; text is code, set over the plates.
- Ruled paper with yellow tape for every list, form, and written card.
- Neon yellow marks where you are: the highlighted line, the outlined strip action, the name tape.
- Saira Extra Condensed capitals for anything set; the stencil for the wordmark, verdicts, and stamps only.
- No health bars. In the race, one speedometer and nothing else that persists.

## Colors

Near-black rooms, cream paper, and four neon inks from the 3D world. The older warm set (yellow, red, green, blue) survives only where money and the cop siren need it.

### Primary

- **Highlighter Yellow** (`neon-yellow`): the selected line on a sheet (at 85% over the paper), the outline and text of the selected strip action, name tape under a speech sticker, the place plate under the dial, lit speed ticks, "Roads" in the status strip, the good stamp (`QUALIFIED`, `SEASON OVER`, the place on Results).

### Secondary

- **Night Cyan** (`neon-cyan`): ink on the cyan note, the level in the status strip, the dial's progress arc and the left half of the speed split.
- **Siren Red** (`neon-red`): warnings written on paper (the line under a Confirm question), cash in the status strip, bad stamps (`WRECKED`, `BUSTED`, `QUIT`), the redline ticks and the right half of the speed split.
- **Sign Magenta** (`neon-magenta`): the magenta note and the bar's neon wash. Text on it is ink.

### Tertiary

- **Ledger Green** (`green`) and **Ledger Red** (`red`): money in and money out on the Results ledger, with `+` or `−`.
- **Siren Blue** (`blue`) and **Ledger Red** (`red`): the cop warning blinks between them.
- **Menu Yellow** (`yellow`): the pointer and selected text of a plain menu that sits on ink rather than paper (the Finish banner's Continue).

### Neutral

- **Ink** (`ink`): every room's ground, text on paper and on tape, stamp backing at 80%, strips at 90%, the outline under HUD text, the Confirm dim at 70%.
- **Paper** (`paper`): the colour of the sheets and stickers in the plates, the Lowside wordmark, and quiet captions on ink at 60%.
- **Warm White** (`text`): HUD numerals and unselected strip actions.
- **Muted** (`muted`): a zero on the ledger and details under a plain menu item.
- **Dial Ink** (`neon-ink`): the speedometer's soft backing and the stroke under its numerals.

**The Highlighter Rule.** Neon yellow means "you are here". On paper it is a highlighter stroke behind ink text; on ink it is the text and outline itself. Never use it to decorate.

**The Ink on Paper Rule.** Text on paper and tape is ink. The only other colour allowed on paper is a neon-red warning.

**The Ledger Colour Rule.** Money coming in is green with `+`, money going out is red with `−`, a zero is muted, and a balance is warm white unless it is negative. Amounts use tabular numerals.

## Typography

**Display Font:** Saira Extra Condensed 700 and 800 (with Arial Narrow, Roboto Condensed) **Body Font:** Inter 400 and 600 (with the system UI sans) **Stamp Font:** Big Shoulders Stencil Display 800 (with Saira Extra Condensed)

**Character:** Tall, tight condensed capitals read like marker on a sign-up sheet and numbers on a race bib. The stencil is sprayed paint: the wordmark, a verdict, a stamp. Inter is for long reading off the stage (the kit, dev pages) and plain menu details.

All three are self-hosted through Fontsource. The page asks no other origin for fonts.

### Hierarchy

On the stage, sizes are written in stage pixels and turned into container units (`stagePx`), so they scale with the stage. Off the stage, sizes scale with the shorter side of the window.

- **Outcome** (stencil 800, 3.5 to 11 rem, line height 0.85): `WINNER`, `FINISHED`, and the boot wordmark.
- **Wordmark** (stencil 800, 84 stage px): `THE LOWSIDE` in paper at the top left of every room.
- **HUD** (Saira 800, 2.5 to 6 rem, line height 0.9): place, countdown, notices, all with the HUD ink outline.
- **Sheet title** (Saira 800, 38 to 50 stage px, rotated −6°): the word on a sheet's tape.
- **Sheet row** (Saira 700, 26 stage px, line height 0.9): a line on a pinned list. A detail sits under it at 0.62 em in ink at 60%.
- **Strip** (Saira 700, 33 stage px): actions in the bottom strip; captions there are 20 to 22 stage px in paper at 60%.
- **Name** (Saira 700, 1.375 to 2.5 rem): the cop warning and HUD sub-lines.
- **Body** and **Label** (Inter): plain menus, the kit page.

Every display face is set in capitals. Money, times, speeds, and places use tabular numerals (the `numeric` utility).

**The Stencil Is Paint Rule.** The stencil face is for the wordmark, outcomes, and stamps. A list line, a title, or a button never uses it.

**The Fixed Digits Rule.** A number that changes while the player watches uses tabular numerals, so a rising speed or a counting ledger never shifts the layout.

## Layout

Every room is a `Stage`: a 1672 × 941 box scaled to the largest size that fits the window, centred, and letterboxed on ink (or on the bar's wall texture in the Clubhouse). Pieces are placed with `place(box)` at stage coordinates, and type uses `stagePx`, so nothing reflows with the window. There are no breakpoints; the game targets desktop browsers.

The rooms share one frame:

- **Header** (top band): the wordmark at (30, 16), the badge beside it, and the status strip from x 522 to the right edge: level and rank in cyan, roads qualified in yellow, cash in red, the bike in yellow.
- **Pinned sheet** (left): a ruled sheet at (36, 110), 470 × 691, scale 0.75. Rows start at y 258 in two-line slots (label, then detail); a compact list uses one-line slots from y 264. A second sheet can pin beside it (Settings) by shifting it right.
- **Bottom strip** (y 854, 71 high, full width): actions on the left, captions on the right, ink at 90%, or solid ink when it covers another strip.
- **The rest** belongs to the room: a figure with a speech sticker, a flyer, notes, a stamp.

Overlays use the same frame. Pause pins the sheet over the race dimmed to 60% ink. Confirm pins a slip in the middle of the stage over a 70% ink dim.

In the race, the HUD is drawn over the canvas: place at the top left, the speedometer at the bottom centre at a quarter of the screen height, notices and the countdown centred at 30% of the height, the cop warning at the top centre, and a rival's taunt above the rival.

## Elevation & Depth

Depth is painted. Sheets, stickers, flyers, and tape carry their own torn edges and shadows in the plates, so CSS adds no box shadows. The stage dims what is behind an overlay instead of lifting the overlay. Text over the 3D road gets the HUD ink outline instead of a box.

### Shadow Vocabulary

- **HUD ink** (`text-shadow: -2px 0 ink, 2px 0 ink, 0 -2px ink, 0 2px ink, 0 4px 10px rgb(0 0 0 / 45%)`): every HUD number and word, and the Finish banner.
- **Wordmark drop** (`drop-shadow(0 0.06em 0 rgb(0 0 0 / 60%))`): the Lowside wordmark over the room.

**The Painted Depth Rule.** If a piece needs to lift off the wall, paint it into the plate. A CSS shadow on a stage piece is a floating card; leave it out.

## Shapes

The shapes come from paper: torn edges, tape strips, a speech sticker with a tail at the lower left. Code adds almost none. The ruled sheet is the standings plate as a CSS border image (slices 297, 50, 445, 80) whose middle repeats one ruled gap, so a sheet can be any height without new art. Lines fall at 206 then every 45.2 plate pixels, scaled with the sheet. Pieces sit at small angles: titles −6°, rows −0.4°, notes −3° to −6°, stamps −6°. Stamps are square boxes with a border of 0.12 em in their ink. The only rounding is 2.4 px on the focus outline of a strip action.

## Components

### Ruled sheet, pinned list, and written sheet

The signature of the system. `RuledSheet` draws the paper; `SheetTitle` writes on the tape; `ruledLines` gives the box that puts text on the lines.

- **Pinned list** (`PinnedList`): the menu of a room. Each line is a sheet row in ink. Selected: a neon-yellow highlighter stroke at 85% behind the line and a ▸ pointer. Disabled: ink at 35%. A detail line sits under the label in ink at 60%. Steppers read `LABEL ◄ value ►`; left and right step them. Hovering a line selects it.
- **Written sheet** (`WrittenSheet`): prose on the ruled lines at 0.72 of a line, used for the game-over card and the ending.

### Bottom strip

`BarStrip` and `BarNav`. A horizontal list of strip actions in warm white. Selected: neon-yellow text, a ▸ pointer, and a 2 px neon-yellow outline. Disabled: paper at 35%. Captions sit on the right in paper at 60%.

### Notes and stamps

- **Cyan note:** short facts or a ledger, in Saira capitals, paper or cyan ink on the dark sticker.
- **Magenta note:** a warning or a description, ink on magenta.
- **Stamp:** a stencil word in a 0.12 em border on ink at 80%, rotated −6°, neon yellow for a good verdict and neon red for a bad one.

### Speech sticker

A paper speech sticker with the line in ink Saira at 18 to 25 stage px depending on its length, and the speaker's name (and role) on neon-yellow tape under the tail. It flips for a figure on the right. In the race, the rival's taunt uses the same sticker at 16 rem wide with the rival's bike colour as a 0.35 em edge on the tape.

### Confirm

A ruled slip (560 × 420 at scale 0.75) pinned in the middle of the stage over a 70% ink dim. The question is on the tape, the body sits on the lines, any consequence follows in neon red, and the choices are a horizontal list one line lower with the safe choice first and selected. Escape takes the safe way out, and focus returns to whatever opened it.

### Speedometer

The whole race HUD in one dial. A 240° ring of 48 ticks that light neon yellow with speed and turn neon red past the redline, a major tick and number every quarter, a cyan arc that fills with progress along the road, the gear as a small yellow numeral at the top, the speed as a large skewed numeral split into cyan and red with a white face and ink stroke, the unit in small capitals, and the place as ink on a yellow plate with a clipped corner. It dims to 60% while the rider is off the bike.

### HUD text

- **Place and countdown:** HUD numerals in warm white with the HUD ink outline.
- **Notice:** one or two words, centred at 30% of the height, entering over 180 ms from 8 px lower and 96% scale.
- **Cop warning:** the only blinking element in the interface, alternating siren blue and red twice a second on an ink plate.
- **Finish banner:** `WINNER` or `FINISHED` in the outcome stencil, the place beneath with `· QUALIFIED` in neon yellow, then Continue after 1.5 s.

### Rooms

- **Clubhouse** (`clubhouse.tsx`): the bar on the left with a 150 s dusk-to-night time-lapse, the road boss on the stool with a speech sticker, and the wall on the right: standings, the two notes, a bill, a sticker, and the road's flyer. Results is the same stage after a race, with the race sheet, a verdict stamp, the ledger on the cyan note, and the post-race speaker on the stool.
- **Garage** (`garage.tsx`): the price list on the pinned sheet, the bike turning live on the stand, the mechanic with a flipped speech sticker.
- **Back room** (`back-room.tsx`): the pinned list, Settings pinned beside it, Single Race (`route-board.tsx`) with the road's flyer and its facts on the notes.
- **Game over and the ending** (`game-over.tsx`): the car park or the bar, a written sheet, the record on the cyan note, and for the ending a `SEASON OVER` stamp.
- **Boot** (`boot.tsx`): the stencil wordmark and the tagline in paper at 60%, centred on ink, until the bar's plates have decoded.

### Motion

Rooms cross-fade in 180 ms. Notices and the Confirm slip enter in 180 ms on a quint ease-out. Figures and flyers slide in 4% over 700 ms. The bar's time-lapse runs 150 s. Reduced motion collapses all of it and holds the night bar.

## Do's and Don'ts

### Do:

- **Do** build every room on the 1672 × 941 stage with `place` and `stagePx`, and keep the header, the pinned sheet, and the bottom strip where they are.
- **Do** put every list, form, and written card on a ruled sheet, with text on the lines.
- **Do** mark the current choice with the neon-yellow highlighter on paper, or neon-yellow text and outline on ink, and make everything reachable from the keyboard.
- **Do** keep painted material in plates and text in code: names, numbers, lines, and notes are live text set over the art.
- **Do** show new character or plate art to the user before wiring it in.
- **Do** colour every amount by the Ledger Colour Rule and set it in tabular numerals.
- **Do** honour reduced motion.
- **Do** check new pieces on `/kit` (development only), which lays out the pieces the game ships on the same stage.

### Don't:

- **Don't** add health, stamina, or bike condition bars to the race HUD. The speedometer carries speed, gear, place, and progress; the rider and the bike show damage themselves.
- **Don't** make a second element blink. The cop warning is the only one.
- **Don't** put a dark panel, a card, or a filled button on a room. Choices are lines on paper or actions in the strip.
- **Don't** add CSS shadows to stage pieces; paint the depth into the plate.
- **Don't** use the stencil face for anything but the wordmark, outcomes, and stamps.
- **Don't** paint text into the art, and don't make a static painting for a menu: rooms change with the road, the rider, and the time of night.
- **Don't** reach for retro low resolution, dithering, or blocky, toy-like stand-ins, and don't add coloured afterimages to turning riders. The user rejected all of them.
