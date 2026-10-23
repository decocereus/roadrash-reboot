---
name: Rushline
description: Race. Fight. Pay for it.
colors:
  ink: "#0e0f12"
  panel: "#17191f"
  raised: "#22252d"
  line: "#2e323c"
  text: "#f2eee6"
  muted: "#9a9aa3"
  orange: "#ff6a1a"
  yellow: "#ffc531"
  red: "#e5312b"
  green: "#5bd06a"
  blue: "#2f6bff"
  cork: "#8a6a45"
  paper: "#ede4d0"
  polaroid: "#f7f3ea"
  neon-yellow: "#fff04a"
  neon-cyan: "#19e6ff"
  neon-red: "#ff2e3d"
  neon-ink: "#0a0810"
typography:
  outcome:
    fontFamily: "Big Shoulders Stencil Display, Saira Extra Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(3.5rem, 16.67vmin, 11rem)"
    fontWeight: 800
    lineHeight: 0.85
    letterSpacing: "0.02em"
  display:
    fontFamily: "Saira Extra Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "clamp(2.5rem, 8.89vmin, 6rem)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "0.02em"
  headline:
    fontFamily: "Saira Extra Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "clamp(2.25rem, 7.78vmin, 5rem)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "0.02em"
  title:
    fontFamily: "Saira Extra Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "clamp(1.375rem, 3.89vmin, 2.5rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.02em"
  quote:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 3.06vmin, 2rem)"
    fontWeight: 600
    lineHeight: 1.3
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
  md: "3.2px"
  lg: "4px"
spacing:
  panel: "clamp(0.75rem, 2.2vmin, 1.5rem)"
  gutter: "clamp(1rem, 4.4vmin, 3rem)"
  strip: "clamp(3rem, 8.9vmin, 5.5rem)"
components:
  menu-item:
    textColor: "{colors.text}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    padding: "2px 8px 2px 0"
  menu-item-selected:
    textColor: "{colors.yellow}"
    typography: "{typography.title}"
  menu-item-disabled:
    textColor: "{colors.muted}"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    padding: "{spacing.panel}"
  panel-raised:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    padding: "{spacing.panel}"
  paper-note:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "16px"
  polaroid:
    backgroundColor: "{colors.polaroid}"
    textColor: "{colors.ink}"
    padding: "16px"
  toast:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    padding: "8px 16px"
---

# Design System: Rushline

## Overview

**Creative North Star: "The Lowside Wall"**

Between races the player stands in the Lowside, the bar where the career lives, and every screen is something pinned to its wall: a cork board of Polaroids and marker notes, a police citation, a repair invoice, a stencilled verdict stamped across the frame. The interface is a set of physical objects on an ink-black room, not a settings app. Condensed capitals name things, Inter carries what people say and what things cost, and paper, cork, and tape give the grit. The race view stays clean: the road is the brightest idea on screen and the only interface on it is one small speedometer.

The system has two palettes, and DESIGN.md records both as they stand. The menu kit (ink, orange, yellow, cork, paper) was drawn on October 10, 2026, before the race view moved to cel-shaded cyberpunk anime on October 13. The speedometer and the 3D world already use the newer neon palette (yellow, cyan, red on near-black). `docs/architecture.md` lists restyling the menus to match the cyberpunk world as the next art step. That restyle is pending and not decided here: until it is designed, new menu work extends the kit below, and new race-view work uses the neon palette.

Density is low. A screen has one orange heading, one primary action bottom right on Enter, and Back bottom left on Escape. Text scales with the shorter side of the screen, designed at 1280 × 720.

**Key Characteristics:**

- Ink-black screens with paper, cork, and Polaroid objects that carry the grit.
- Condensed capitals for names and actions, Inter for speech and money, stencil only for outcomes.
- Yellow means "where you are", orange means "what this is called".
- Flat panels with 2 px borders; depth comes from paper lifting off the wall, not from cards floating.
- Keyboard first: a ▸ pointer and yellow text mark the selection, never a filled button.
- In the race, one speedometer and nothing else that persists.

## Colors

Warm white on near-black, one hot accent per screen, a selection yellow, and money and law in green, red, and police blue. Paper and cork are surfaces, not accents.

### Primary

- **Lowside Orange** (`orange`): screen headings, one per screen. It names the place or the thing: GARAGE, ROUTE BOARD, THE LOWSIDE.
- **Selection Yellow** (`yellow`): the current menu item and its ▸ pointer, the 2 px outline on a selected panel or Polaroid, the focus ring, the player's row in a results table, the slider mark on a bike stat, and `QUALIFIED`.

### Secondary

- **Money-In Green** (`green`): prize money and any amount coming in, shown with a leading `+`. Also `FINISHED`.
- **Debt Red** (`red`): money going out, debt, warnings that cost the player, `WRECKED`, grudges ("HOLDS A GRUDGE").
- **Police Blue** (`blue`): the citation header and rule, `BUSTED` (with a red offset shadow), and, alternating with red, the cop warning on the HUD.

### Tertiary: race view

These live in the speedometer (`packages/ui/src/components/dial.tsx`) and match the cyberpunk 3D world. They are hard-coded in the dial today rather than exposed as CSS custom properties.

- **Neon Yellow** (`neon-yellow`): lit speed ticks, the gear numeral, the place plate under the dial.
- **Neon Cyan** (`neon-cyan`): the progress arc along the road and the left half of the speed number's split.
- **Neon Red** (`neon-red`): the redline ticks and the right half of the speed number's split.
- **Neon Ink** (`neon-ink`): the dial's soft backing and the stroke under its numerals.

### Neutral

- **Ink** (`ink`): every screen's background and the outline under HUD text.
- **Panel** (`panel`): panels, top and bottom strips, toasts, the rival plate.
- **Raised** (`raised`): a selected panel, bar tracks, the confirm dialog.
- **Line** (`line`): panel borders and dividers.
- **Warm White** (`text`): body text and unselected menu items.
- **Muted** (`muted`): secondary lines under menu items, locked or `SOON` entries, `$0`.
- **Cork** (`cork`): the Clubhouse board, with a speckled texture and an inner shadow.
- **Paper** (`paper`): notes, invoices, citations.
- **Polaroid** (`polaroid`): photo frames for roads and riders.

Each of the five regions also has a sky, horizon, far, ground, verge, and asphalt colour, and the road has its own asphalt, line, shoulder, and verge colours. They live in `packages/ui/src/styles/globals.css` and are selected with `data-region`; the region scene in Polaroids and postcards draws from them.

**The Name and Place Rule.** Orange is for what a thing is called; yellow is for where you are. Never swap them, and never use either for decoration.

**The Dark Ground Rule.** Orange and yellow never sit on a light background. On paper and Polaroids, text is ink, money out is red, and the citation is blue.

**The Ledger Colour Rule.** Money coming in is green with `+`, money going out is red with `−`, a zero is muted, and a balance is warm white unless it is negative.

## Typography

**Display Font:** Saira Extra Condensed 700 and 800 (with Arial Narrow, Roboto Condensed) **Body Font:** Inter 400 and 600 (with the system UI sans) **Outcome Font:** Big Shoulders Stencil Display 800 (with Saira Extra Condensed)

**Character:** A tall, tight condensed face in capitals reads like race numbers and garage signage. Inter is the voice of people and receipts: what a rival says and what the bill comes to. The stencil is sprayed on only when a race ends.

All three are self-hosted through Fontsource; the page requests no font from another origin.

### Hierarchy

- **Outcome** (stencil 800, 3.5 to 11 rem by screen size, line height 0.85): only `WRECKED`, `BUSTED`, `BROKE`, `WINNER`, `FINISHED`, `QUALIFIED`, and the wordmark. Often tilted a few degrees and sometimes framed by a border in its own colour.
- **Display** (Saira 800, 2.5 to 6 rem, line height 0.9): HUD numerals such as place, and the big Notice word.
- **Headline** (Saira 800, 2.25 to 5 rem, line height 0.9): the one orange heading on each screen.
- **Title** (Saira 700, 1.375 to 2.5 rem, line height 1): menu items, rider and bike names, ledger totals.
- **Quote** (Inter 600, 1.0625 to 2 rem, line height 1.3): rival lines, set inside quotation marks and never italic; confirm questions.
- **Body** (Inter 400, 0.9375 to 1.5 rem, line height 1.444): descriptions and notes.
- **Label** (Inter 600, 0.6875 to 1.125 rem, tracking 0.08 em, capitals): stat names, ledger rows, strip captions, menu details in sentence case.

Every display face is set in capitals with 0.02 em tracking. Money, times, speeds, and places use tabular numerals (the `numeric` utility).

**The Stencil Is a Verdict Rule.** The stencil face appears only when the game hands down an outcome, plus the wordmark. A heading, a label, or a button never uses it.

**The Fixed Digits Rule.** A number that changes while the player watches uses tabular numerals, so a rising speed or a counting ledger never shifts the layout.

## Layout

Every screen fills the viewport. A screen can draw a scene behind its content (the attract race or a region scene) with a soft diagonal scrim from the lower left, or a heavy flat one. Content sits between an optional top strip and an optional bottom strip: each strip is at least the strip height, ink at 80% opacity, with a 2 px line border on the side that faces the body. The top strip carries status (level, roads qualified, cash); the bottom strip carries navigation and the Enter hint. Body content sits inside the gutter.

The title screen keeps the centre clear so the road stays visible: the wordmark and tagline at the top left, the menu as a vertical list at the bottom left, one line of small print at the bottom right.

Spacing is the Tailwind 4 px step plus three fluid tokens that scale with the shorter side of the screen: panel padding, the screen gutter, and the strip height. There are no breakpoints; type and spacing scale with `vmin` from a 1280 × 720 design size. The game targets desktop browsers.

In the race, the HUD is drawn over the canvas: place at the top left, the speedometer at the bottom centre at a quarter of the screen height, notices centred at 30% of the height, the cop warning at the top centre.

## Elevation & Depth

Panels are flat: a 2 px border on ink, no shadow, and selection shown by a yellow outline rather than a lift. Depth belongs to physical objects. Paper and Polaroids lift off the wall with a soft drop shadow, carry a small rotation, and are held by a round pin with its own highlight and shadow. The cork board is sunk into the wall with an inner shadow. Toasts carry a small shadow so they read over the road. Text over the 3D road gets an ink outline instead of a box.

### Shadow Vocabulary

- **Paper lift** (`drop-shadow(0 6px 10px rgb(0 0 0 / 45%))`): notes, invoices, citations, Polaroids.
- **Pin** (`0 2px 2px rgb(0 0 0 / 45%)`, plus an inner highlight and inner shade): the pin holding paper to cork.
- **Board recess** (`inset 0 0 40px rgb(0 0 0 / 35%)`): the cork board.
- **Toast** (`0 6px 14px rgb(0 0 0 / 40%)`): toasts over the race.
- **HUD ink** (a 2 px ink text outline in four directions plus `0 4px 10px rgb(0 0 0 / 45%)`): HUD text over sky and asphalt.

**The Paper Lifts, Panels Don't Rule.** Only objects that exist in the bar (paper, Polaroids, pins) cast shadows. A panel that gains a shadow has become a floating card; give it a border instead.

## Shapes

Corners are nearly square: 4 px at most, 2.4 px on menu items, and none on panels, paper, bars, or stat pips. Borders are 2 px. A rival or player card carries a 4 px left edge in that rider's bike colour. Paper can have a torn top edge, a zigzag cut by a mask. Objects on the board sit at small angles, between about −2° and 2°, never straight in a row. Bars have square ends and an ink ring. Only the pins are round.

## Components

### Menu items

The actions on every screen. There are no filled buttons on game screens.

- **Shape:** text only, with a 2.4 px corner for the focus outline.
- **Default:** Saira 700 capitals in warm white, at title size (or body size in a small list), with an optional muted detail line in Inter beneath.
- **Selected:** yellow text with a ▸ pointer in front. Focus follows the pointer: hovering an item focuses it.
- **Focus-visible:** a 2 px yellow outline 2 px out, which frames the item as a box (as on KEEP RACING in the confirm dialog).
- **Disabled:** muted, unselectable, with `SOON` as the second line when the screen has not shipped.
- **Stepper:** a label in Inter, then ◄ value ►, where the arrows turn yellow when the row is selected. Left and right step the value.
- **Navigation:** arrows or WASD move, Home and End jump, Enter confirms, Escape goes back. A list can run vertically (the title menu) or horizontally (the bottom strip, the confirm dialog).
- **Motion:** colour changes over 100 ms. Nothing slides.

### Panels

- **Corner Style:** square.
- **Background:** panel, or raised for the selected or the more important panel. The plate variant is panel at 85% with a light backdrop blur, used over the race.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 2 px line. Selected adds a 2 px yellow outline 2 px out. An optional 4 px left edge carries a rider's colour.
- **Internal Padding:** the panel token.

### Paper, notes, and Polaroids

The signature of the system. A sheet of paper or a Polaroid frame with ink text, a drop shadow, a tilt, and an optional coloured pin (red, yellow, green, blue). A note is written in marker (Saira capitals) or typed (Inter 600) and can be signed. Polaroids frame a region scene or a rider portrait, and can carry a stamped verdict across the photo.

### Ticket and invoice

Paperwork for consequences. The citation has a torn top, a blue `CITATION` header over a 4 px blue rule, a serial number, the offence in capitals, and dotted leader lines to the amounts. The invoice is pinned, states the original price struck through when a sponsor halves it, and turns the amount owed and any warning red.

### Ledger and results

The post-race money table, on a panel: label rows in capitals with amounts aligned right in tabular numerals and coloured by the Ledger Colour Rule, then a dotted divider and the cash total in Saira. The results table lists place in Saira, a square swatch of the rider's bike colour, the name in Saira, the bike in muted Inter, then time or gap, then prize. The player's row is yellow.

### Stencil verdicts

`WRECKED` in red, `BUSTED` in blue with a red offset, `QUALIFIED` framed in yellow, `FINISHED` framed in green, `WINNER` in warm white. Set slightly rotated, like spray paint on the wall. The consequence screens (Wrecked, Busted) cut in hard with no fade.

### Speedometer

The whole race HUD in one dial. A 240° ring of 48 ticks that light neon yellow with speed and turn neon red past the redline, a major tick and number every quarter, a cyan arc that fills with progress along the road, the gear as a small yellow numeral at the top, the speed as a large skewed numeral split into cyan and red with a white face and ink stroke, the unit in small capitals, and the place as ink on a yellow plate with a clipped corner. It dims to 60% while the rider is off the bike.

### HUD text, notices, and toasts

- **Place:** Saira 800 numerals with the HUD ink outline at the top left; it turns yellow for half a second when it changes, then holds warm white.
- **Notice:** one or two words in Saira 800 yellow, centred at 30% of the height, entering over 180 ms from 8 px lower and 96% scale.
- **Cop warning:** the only blinking element in the interface, alternating police blue and red twice a second on an ink plate.
- **Toast:** a panel-coloured strip at 85% with a 4 px left edge in green, red, yellow, or blue, Inter 600, and a small shadow.

### Confirm

A raised panel 34 rem wide in the centre of a dimmed screen: the question in quote size, any consequence as a red label in capitals, and a horizontal menu with the safe choice first and selected.

## Do's and Don'ts

### Do:

- **Do** give each screen exactly one orange heading, one primary action bottom right on Enter, and Back bottom left on Escape.
- **Do** mark the current choice with yellow text and the ▸ pointer, and make everything reachable from the keyboard.
- **Do** make screens outside the race into objects in the bar: the board, a Polaroid, a ticket, an invoice. Options live in the back room, not a generic settings page.
- **Do** colour every amount by the Ledger Colour Rule and set it in tabular numerals with `+` or `−`.
- **Do** set rival lines in Inter 600 inside quotation marks.
- **Do** cross-fade menu screens in 180 ms and cut hard into Wrecked and Busted.
- **Do** honour reduced motion: transitions and animations collapse to nothing, and the notice entrance is removed.
- **Do** use the neon palette for anything drawn over the race, and the menu kit for anything between races, until the menu restyle is designed.

### Don't:

- **Don't** add health, stamina, or bike condition bars to the race HUD. The speedometer carries speed, gear, place, and progress; the rider and the bike show damage themselves.
- **Don't** make a second element blink. The cop warning is the only one; every other change of state changes colour and holds it.
- **Don't** put orange or yellow on paper, polaroid, or any light background.
- **Don't** use the stencil face for anything but outcomes and the wordmark.
- **Don't** use the shadcn filled button on game screens; actions are menu items.
- **Don't** give panels shadows or rounded corners above 4 px.
- **Don't** set rival lines in italics.
- **Don't** reach for retro low resolution, dithering, or blocky, toy-like stand-ins, and don't add coloured afterimages to turning riders. The user rejected all of them.
