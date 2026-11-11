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
  night: "#150c26"
  night-raised: "#1a0f2e"
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
  hud:
    fontFamily: "Saira Extra Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "clamp(2.5rem, 8.89vmin, 6rem)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "0.02em"
  panel-title:
    fontFamily: "Saira Extra Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "2.9rem"
    fontWeight: 800
    lineHeight: 1
  button:
    fontFamily: "Saira Extra Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.25
  line:
    fontFamily: "Saira Extra Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.375
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
  panel:
    backgroundColor: "{colors.night-raised}"
    textColor: "{colors.paper}"
    padding: "1.25rem 1.25rem 1.5rem"
  card:
    backgroundColor: "{colors.night-raised}"
    textColor: "{colors.paper}"
    padding: "1.5rem 1.75rem 1.75rem"
  panel-title:
    textColor: "{colors.neon-yellow}"
    typography: "{typography.panel-title}"
  skew-button-primary:
    backgroundColor: "{colors.neon-yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    padding: "0.5rem 1rem"
  skew-button:
    backgroundColor: "{colors.night}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    padding: "0.5rem 1rem"
  text-field:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    padding: "0.5rem 0.75rem"
  place-plate:
    backgroundColor: "{colors.neon-yellow}"
    textColor: "{colors.ink}"
    typography: "{typography.hud}"
---

# Design System: Rushline

## Overview

**Creative North Star: "The Lowside at Night"**

Between races the player is in the Lowside, a walkable 3D bar, and the interface is a small set of night-violet panels and cards with neon edges set over it. The bar is the room; the kit only holds the words, the numbers and the choices. Over a race, the same cards dim the road behind them. The race view stays clean. The road is the brightest thing on screen, and the only interface that stays on it is one speedometer.

Every piece comes from one kit in `packages/ui`: a tab strip across the top, one panel on the right, a hint strip along the bottom, and a card in the middle when something needs an answer before play goes on. Choices are skewed buttons; the primary one is filled neon yellow.

Density is low. A panel has one title, one rule, a few lines and its buttons. Keyboard first: Tab and the arrows move, Enter presses, Escape closes the topmost layer.

**Key Characteristics:**

- The 3D bar is the backdrop; panels and cards are live text over it.
- Night-violet panels with a neon-yellow edge, a yellow italic title over a magenta rule.
- Neon yellow marks the primary choice and where you are.
- Saira Extra Condensed capitals for anything set; the stencil for the wordmark and verdicts only.
- No health bars. In the race, one speedometer and nothing else that persists.

## Colors

Night violet surfaces, cream text, and four neon inks from the 3D world. The older warm set (yellow, red, green, blue) survives only where money and the cop siren need it.

### Primary

- **Highlighter Yellow** (`neon-yellow`): the primary button's fill, a panel's or card's edge, the panel title, the selected tab and option chip, lit stat cells, the place plate under the dial, lit speed ticks.

### Secondary

- **Night Cyan** (`neon-cyan`): the text field's edge and caret, a picked button's edge, the dial's progress arc and the left half of the speed split.
- **Siren Red** (`neon-red`): warning lines (the line under a Confirm question, a late signal-lost card's edge), the redline ticks and the right half of the speed split.
- **Sign Magenta** (`neon-magenta`): the rule under every title.

### Tertiary

- **Ledger Green** (`green`) and **Ledger Red** (`red`): money in and money out on the results, with `+` or `−`.
- **Siren Blue** (`blue`) and **Ledger Red** (`red`): the cop warning blinks between them.

### Neutral

- **Night** (`night`) and **Night Raised** (`night-raised`): button grounds, and panel and card grounds. Night at 50 to 70% dims what sits behind a card.
- **Ink** (`ink`): the text field's ground, text on yellow, the outline under HUD text.
- **Paper** (`paper`): body text in the kit, at 70% for quiet lines.
- **Warm White** (`text`): HUD numerals.
- **Muted** (`muted`): a zero on the ledger.
- **Dial Ink** (`neon-ink`): the speedometer's soft backing and the stroke under its numerals.

**The Highlighter Rule.** Neon yellow means "press this" or "you are here". Never use it to decorate.

**The Ledger Colour Rule.** Money coming in is green with `+`, money going out is red with `−`, a zero is muted, and a balance is warm white unless it is negative. Amounts use tabular numerals.

## Typography

**Display Font:** Saira Extra Condensed 700 and 800 (with Arial Narrow, Roboto Condensed) **Body Font:** Inter 400 and 600 (with the system UI sans) **Stamp Font:** Big Shoulders Stencil Display 800 (with Saira Extra Condensed)

**Character:** Tall, tight condensed capitals read like marker on a sign-up sheet and numbers on a race bib. The stencil is sprayed paint: the wordmark and a verdict. Inter is for long reading on the dev pages.

All three are self-hosted through Fontsource. The page asks no other origin for fonts.

### Hierarchy

Kit sizes are rems. HUD sizes scale with the shorter side of the window.

- **Outcome** (stencil 800, 3.5 to 11 rem, line height 0.85): `WINNER`, `FINISHED`, and the boot wordmark.
- **HUD** (Saira 800, 2.5 to 6 rem, line height 0.9): place, countdown, notices, all with the HUD ink outline.
- **Panel title** (Saira 800 italic, 2.9 rem): the title of a panel or card, in neon yellow over the magenta rule.
- **Button** (Saira 800 italic, 1.75 rem, or 1.3 rem slim): a skewed button's title, with a detail under it in normal case at 1 rem.
- **Line** (Saira 700, 1.125 rem, normal case): a panel's sentences, lit, quiet at 70%, or a warning in neon red.
- **Name** (Saira 700, 1.375 to 2.5 rem): the cop warning and HUD sub-lines.
- **Body** and **Label** (Inter): the dev pages.

Every display face is set in capitals except a line and a button's detail. Money, times, speeds, and places use tabular numerals (the `numeric` utility).

**The Stencil Is Paint Rule.** The stencil face is for the wordmark and outcomes. A list line, a title, or a button never uses it, apart from the `stencil` face of a panel title.

**The Fixed Digits Rule.** A number that changes while the player watches uses tabular numerals, so a rising speed or a counting ledger never shifts the layout.

## Layout

In the bar, the tab strip runs across the top with the rider's colour chip and name at its right, the hint strip runs along the bottom with the moves and the camera, and one panel sits on the right between them. A card sits in the centre over a dimmed bar or race. Panels are 25 rem wide and cards 30 rem, both held to the window less 2 rem, so the layout holds at 1280 × 720.

In the race, the HUD is drawn over the canvas: place at the top left, the speedometer at the bottom centre at a quarter of the screen height, notices and the countdown centred at 30% of the height, the cop warning at the top centre, and a rival's taunt above the rival.

## Elevation & Depth

The kit is flat. A card lifts off what is behind it by dimming it, never by a shadow. Text over the 3D road gets the HUD ink outline instead of a box.

### Shadow Vocabulary

- **HUD ink** (`text-shadow: -2px 0 ink, 2px 0 ink, 0 -2px ink, 0 2px ink, 0 4px 10px rgb(0 0 0 / 45%)`): every HUD number and word, and the Finish banner.

**The Flat Kit Rule.** A panel, card or button has no box shadow. Dim what is behind it instead.

## Shapes

Cut corners and a skew. A panel clips its lower right corner by 1.4 rem and has no top edge, so it hangs from the tab strip. A card clips its upper right and lower left corners by 1.4 rem. Buttons, tabs and stat cells lean −10° to −14°, with the text set straight inside. Nothing is rounded.

## Components

All of them live in `packages/ui/src/components`, and `/kit` (development only) shows each.

### Panel and card

`kit-panel.tsx`. `Panel` is the bar's right-hand panel; `Card` is the centred card for a question, a name or a menu over the race. `PanelTitle` writes the title, `PanelRule` the magenta rule under it, `PanelLine` a sentence (`lit`, `quiet` or `warn`), and `TextField` a cyan-edged field on ink.

### Buttons and links

`skew-button.tsx`. `SkewButton` is a skewed button with a title and an optional detail line: `primary` is filled neon yellow with ink text, `plain` has a paper edge at 50% on night, `picked` has a cyan edge. `slim` buttons sit two to a row. `TextButton` and `TextLinks` are underlined text actions at the foot of a panel or card, such as Back, Not now or Privacy.

### Tabs, hints and rows

`tab-strip.tsx` holds the bar's Race, Garage and Settings tabs, `hint-strip.tsx` the footer of moves with `Key` caps, `kit-rows.tsx` the setting rows, option chips, chip buttons and lobby member rows, `stat-bar.tsx` an eight-cell bar in yellow, cyan or magenta, `pager.tsx` the Garage's bike stepper and `money.tsx` an amount by the Ledger Colour Rule.

### Cards over the bar and the race

- **First visit** (`screens/name-card.tsx`): the name field, the data notice, Walk in and the Privacy link, once, over the dimmed bar.
- **Race menu** (`screens/pause.tsx`): the title, whether the race is paused or keeps going, the yellow back button with `Esc`, Sound and Settings side by side, and the way out with its cost.
- **Confirm** (`screens/confirm.tsx`): the question as the title, the body, any consequence in neon red, and the choices side by side with the safe one first, yellow and focused. Escape takes the safe way out, and focus returns to whatever opened it.
- **Signal lost and rejoin** (`screens/rejoin.tsx`): a small coloured label, the title, the hold timer and Back to the bar; a late card has a red edge.

### Speedometer

The whole race HUD in one dial. A 240° ring of 48 ticks that light neon yellow with speed and turn neon red past the redline, a major tick and number every quarter, a cyan arc that fills with progress along the road, the gear as a small yellow numeral at the top, the speed as a large skewed numeral split into cyan and red with a white face and ink stroke, the unit in small capitals, and the place as ink on a yellow plate with a clipped corner. It dims to 60% while the rider is off the bike.

### HUD text

- **Place and countdown:** HUD numerals in warm white with the HUD ink outline.
- **Notice:** one or two words, centred at 30% of the height, entering over 180 ms from 8 px lower and 96% scale.
- **Cop warning:** the only blinking element in the interface, alternating siren blue and red twice a second on an ink plate.
- **Finish banner:** `WINNER` or `FINISHED` in the outcome stencil, the place beneath with `, QUALIFIED` in neon yellow, then the yellow Continue button after 1.5 s.

### Motion

Notices and the Confirm card enter in 180 ms on a quint ease-out. The Garage camera eases to the stand. Reduced motion collapses all of it.

## Do's and Don'ts

### Do:

- **Do** build every menu piece from the kit in `packages/ui`, and add a missing piece there rather than in a screen.
- **Do** keep one primary button per panel or card, filled neon yellow, and make everything reachable from the keyboard.
- **Do** show new character art to the user before wiring it in.
- **Do** colour every amount by the Ledger Colour Rule and set it in tabular numerals.
- **Do** honour reduced motion.
- **Do** check new pieces on `/kit` (development only), which lays out the kit.

### Don't:

- **Don't** add health, stamina, or bike condition bars to the race HUD. The speedometer carries speed, gear, place, and progress; the rider and the bike show damage themselves.
- **Don't** make a second element blink. The cop warning is the only one.
- **Don't** add box shadows or rounded corners to the kit; cut a corner or dim the background.
- **Don't** use the stencil face for anything but the wordmark and outcomes.
- **Don't** paint menus into static art: the bar is live 3D and changes with the road, the rider, and the time of night.
- **Don't** reach for retro low resolution, dithering, or blocky, toy-like stand-ins, and don't add coloured afterimages to turning riders. The user rejected all of them.
