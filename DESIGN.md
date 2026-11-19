---
name: Notacaida
description: Piano practice instrument for the browser; one colour per note, a warm dark case, and the score on paper.
colors:
  case-bg: "#110c0a"
  case-surface: "#1a1411"
  case-raised: "#241c18"
  case-hover: "#2e241f"
  case-line: "#3a2f29"
  case-line-strong: "#85766a"
  cream-ink: "#f3ece0"
  cream-ink-soft: "#cdc2b4"
  cream-ink-faint: "#a89c8f"
  highlighter: "#f4d248"
  coral-alert: "#ff9b8c"
  ivory-key: "#f2ece1"
  ivory-key-edge: "#b9ab95"
  ivory-key-ink: "#1c1613"
  black-key: "#2b221e"
  black-key-edge: "#0b0807"
  linen-bg: "#f4efe6"
  linen-surface: "#fbf8f2"
  linen-raised: "#ffffff"
  linen-line: "#dcd2c3"
  linen-line-strong: "#887965"
  sepia-ink: "#1e1814"
  sepia-ink-soft: "#4a4038"
  sepia-ink-faint: "#63584e"
  highlighter-deep: "#8a6500"
  brick-alert: "#b42318"
  sepia-key: "#231b17"
  sepia-key-ink: "#f7f1e6"
  score-paper: "#fffdf8"
  score-ink: "#2b241f"
  stage: "#18120f"
  note-c: "#f56056"
  note-d: "#f89845"
  note-e: "#f3d146"
  note-f: "#71d268"
  note-g: "#3fc8c4"
  note-a: "#5aa6f2"
  note-b: "#c184e5"
  note-c-paper: "#d02c2a"
  note-d-paper: "#b85801"
  note-e-paper: "#926e06"
  note-f-paper: "#168629"
  note-g-paper: "#058181"
  note-a-paper: "#226bc0"
  note-b-paper: "#8c42aa"
  note-ink: "#1a1511"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 2.4vw, 2rem)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.3
  numeric:
    fontFamily: "Atkinson Hyperlegible Next Variable, Atkinson Hyperlegible Next, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    fontFeature: "tnum"
rounded:
  key-top: "4px"
  sm: "6px"
  md: "10px"
  lg: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ivory-key}"
    textColor: "{colors.ivory-key-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px 2px"
    height: "44px"
  button-primary-light:
    backgroundColor: "{colors.sepia-key}"
    textColor: "{colors.sepia-key-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px 2px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.black-key}"
    textColor: "{colors.cream-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px 2px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.case-hover}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.cream-ink}"
    rounded: "{rounded.md}"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.black-key}"
    textColor: "{colors.coral-alert}"
    rounded: "{rounded.md}"
    height: "44px"
  key-row-option:
    backgroundColor: "{colors.black-key}"
    textColor: "{colors.cream-ink-soft}"
    height: "40px"
    padding: "0 14px 2px"
  key-row-option-selected:
    backgroundColor: "{colors.ivory-key}"
    textColor: "{colors.ivory-key-ink}"
  input-link:
    backgroundColor: "{colors.case-raised}"
    textColor: "{colors.cream-ink}"
    rounded: "{rounded.sm}"
    height: "48px"
    padding: "0 14px"
  chip-note:
    backgroundColor: "{colors.note-c}"
    textColor: "{colors.note-ink}"
    height: "30px"
    padding: "0 8px 2px"
  panel:
    backgroundColor: "{colors.case-surface}"
    padding: "18px 20px 20px"
  song-card:
    backgroundColor: "{colors.case-surface}"
    rounded: "{rounded.md}"
---

# Design System: Notacaida

## Overview

**Creative North Star: "The Metallophone in Its Case"**

Notacaida is an instrument, not a page. The learner sits at a digital keyboard with both hands busy and reads the screen from the music rest, 60 to 80 cm away. The system is built for that glance: one fixed workspace on desktop, large type, tabular numbers, and nothing on screen that competes with the notes.

The world is a school metallophone: every note owns one colour, and that colour is the same on the key sticker, the falling bar, the notehead on the staff, the note's written name and the reading guide. Colour is how the app teaches reading. Everything that is not a note is the instrument's case: lacquered near-black browns with hairlines a step lighter and cream ink. Primary actions are ivory keys, secondary actions are black keys, and short choices are rows of keys. The score is a sheet of paper on the stand and never follows the theme.

It rejects the settings form stacked over a canvas, the card dashboard, and the dark SaaS look with a single accent colour.

**Key Characteristics:**
- One colour per note, calibrated in OKLCH to an even weight, with a bright set for the dark stage and a deep set for paper.
- A warm, accent-free chrome: browns and creams only; colour belongs to music.
- Buttons drawn as piano keys with a bottom edge and 1px of travel.
- One typeface, Atkinson Hyperlegible Next, chosen for legibility at distance.
- The practice screen is always the dark case; home, library and terms follow the system theme.

## Colors

A warm brown-black case and cream ink, a linen version of the same for light mode, and seven note colours that are the only hues in the product.

### Primary
- **Ivory Key** (`ivory-key`, with its edge `ivory-key-edge` and ink `ivory-key-ink`): the primary action on the dark case (Practicar, Reproducir, Procesar canción) and the selected key in a key row.
- **Sepia Key** (`sepia-key` / `sepia-key-ink`): the primary action in light mode, a black key on linen.

### Secondary
- **The Seven Notes** (`note-c` to `note-b` on the stage, `note-c-paper` to `note-b-paper` on the score): C coral red, D orange, E yellow, F green, G teal, A blue, B violet. A sharp or flat keeps the colour of the letter it is written on (C sharp is red). Used for falling bars, key stickers, lit keys, wait-mode chips, the library fingerprint, noteheads and note names on the score, and the logo. Text on a note colour is always `note-ink`.

### Neutral
- **Case Black** (`case-bg`): the page ground in dark mode and on the practice screen.
- **Case Surface** (`case-surface`) and **Case Raised** (`case-raised`): panels and the top bar; cards, fields and the wait-mode bar.
- **Case Hairline** (`case-line`) and **Case Edge** (`case-line-strong`): dividers; borders of controls (3:1 or more).
- **Cream Ink** (`cream-ink`, `cream-ink-soft`, `cream-ink-faint`): text, secondary text, captions and metadata (16.5, 11.1 and 7.2 to 1 on the case).
- **Linen** (`linen-bg`, `linen-surface`, `linen-raised`, `linen-line`, `linen-line-strong`) with **Sepia Ink** (`sepia-ink`, `sepia-ink-soft`, `sepia-ink-faint`): the light-mode counterparts.
- **Score Paper** (`score-paper`) with **Score Ink** (`score-ink`): the sheet music, in every theme.
- **Stage** (`stage`): the falling-notes area and the library fingerprints, dark in every theme.
- **Highlighter** (`highlighter`, `highlighter-deep` in light mode): the focus ring and the current-measure band on the score.
- **Coral Alert** / **Brick Alert** (`coral-alert`, `brick-alert`): errors and destructive actions.

### Named Rules
**The Notes Own Colour Rule.** No hue appears in the interface unless it names a note. Chrome, states and emphasis use browns, creams and the highlighter only.

**The Never Alone Rule.** A note colour always travels with the note's name (letter or solfège), so the system works for colour-blind players and on poor screens.

**The Paper Stays Paper Rule.** The score is always `score-paper`, and the practice screen is always the dark case, whatever the system theme.

## Typography

**Display Font:** Atkinson Hyperlegible Next Variable (with Atkinson Hyperlegible Next, system-ui, sans-serif)
**Body Font:** the same face
**Label/Mono Font:** the same face with tabular numerals

**Character:** One humanist sans designed for low vision: unmistakable I, l and 1, open apertures, clear Spanish accents. It carries the interface and the note names inside the score, where it is set bold.

### Hierarchy
- **Display** (800, clamp(1.5rem, 2.4vw, 2rem), 1.2, -0.02em): the home headline only. The wordmark uses the same weight at 1.375rem.
- **Headline** (800, 1.25rem, 1.2): section titles such as Mi biblioteca and En proceso.
- **Title** (700, 1.0625rem, 1.2): the song title in the practice bar and on library cards; panel titles use 800 at 1rem.
- **Body** (400, 1rem, 1.5): text and explanations, at most about 52 to 65ch.
- **Label** (600, 0.875rem): legends of key rows and field labels; switch hints use 0.8125rem at regular weight.
- **Numeric** (600, 0.9375rem, tabular): time, measure, speed, percentages and durations.

### Named Rules
**The Steady Numbers Rule.** Every number that changes while the song plays uses tabular figures, so nothing shifts under the player's eye.

## Layout

- **Practice, desktop:** a fixed full-height workspace with no page scroll. Top bar (back to the library, song title with the transcription note, Notas / Partitura / Ambas, Guía), the stage on the left, a 360px inspector on the right. The stage stacks the paper score (46%) over the falling notes and keyboard (54%); either view can take it all, and Partitura keeps a keyboard strip of 72 to 116px. The transport sits under the stage: Play first, Restart, timeline, time, measure, and the wait-mode bar on its own row.
- **Practice, narrow screens (1023px and below):** one column in the same order. The transport is sticky at the bottom, and the stage height is the viewport minus the measured top bar and transport, so the transport never covers the keyboard.
- **Home:** a two-column grid (1.6fr and at least 18rem): link form, jobs in progress and the library on the left; How it works and the colour legend on the right, sticky. One column at 1023px and below.
- **Breakpoints:** 1023px (single column) and 560px (back and guide buttons become icon-only, the link form stacks).
- **Rhythm:** 8px inside the stage, 12px between top-bar items, 16px gutters, 18 to 24px panel padding, up to 32px in the home intake.

## Elevation & Depth

Mostly flat, with depth by tone: case, surface and raised are steps of the same brown. Real shadows are rare and soft: cards on the home page carry a long, faint drop (`0 18px 40px -24px`), and the reading guide drawer casts one to its left. Keys get their depth from an inset bottom edge, not from a shadow under them.

### Named Rules
**The Key Edge Rule.** Pressable things show a 3px inset bottom edge in their edge colour and move down 1px when pressed, losing 2px of edge. Nothing else uses that edge.

## Shapes

Keys have small top corners and rounder bottom corners (`rounded.key-top` over `rounded.md`), like the front of a piano key; key-row options and note chips follow the same profile at a smaller size. Fields and notices use `rounded.sm`, cards `rounded.md`, large panels `rounded.lg`. Borders are 1px hairlines. The logo is three rounded bars falling onto a cream hit line, inside a rounded square.

## Components

### Buttons
- **Shape:** piano-key profile (4px top, 10px bottom corners), at least 44px tall, 600 weight.
- **Primary:** ivory key on the dark case, sepia key on linen; 3px inset edge in `ivory-key-edge`.
- **Secondary:** black key (`black-key`, edge `black-key-edge`), cream ink; hover lifts to `case-hover`.
- **Quiet:** no fill or edge, for the top bar and icon actions; hover shows `case-hover`.
- **Danger:** a secondary key with `coral-alert` text and a red-brown border, used only in delete confirmations.
- **Focus:** 2px `highlighter` outline with a 2px offset on every interactive element.

### Key row
- **Style:** options sit in a dark tray (`black-key-edge`) as a row of black keys; the selected one becomes an ivory key. Native radios underneath, so arrows move the choice.
- **Use:** view, level, speed, hands, and note naming (C D E or Do Re Mi).

### Switch
- **Style:** a 40 by 24px track, cream when on; the explanation sits under the label, outside it, and is linked with `aria-describedby`.

### Chips
- **Style:** one chip per note the song is waiting for, filled with that note's colour and its name in `note-ink`; a played note turns into an outline with a line through its name.

### Cards / Containers
- **Song card:** a stage-dark fingerprint of the song's first 12 seconds drawn in note colours, then title, length, save date and progress, then Practicar plus rename and delete icon keys. Deleting asks inside the card.
- **Panel:** inspector sections on `case-surface`, separated by hairlines, each with one short 800-weight title.

### Inputs / Fields
- **Style:** `case-raised` field, 1px `case-line-strong` border, 48px tall, `rounded.sm`.
- **Focus:** highlighter outline. **Error:** a notice with an alert icon and `role="alert"`.

### Navigation
- **Style:** a top bar on `case-surface` with the wordmark (home) or the back key and song title (practice); the reading guide opens as a non-modal drawer from the right, closes with Escape and returns focus.

### Stage and keyboard
The canvas draws black-key lanes, a line at every C (middle C stronger, with left and right hand captions), falling bars in note colours with their names, a cream hit line, and a keyboard whose white keys carry a coloured sticker and name. Captions sit on a dark backing above the bars.

## Do's and Don'ts

### Do:
- **Do** take every hue from the seven note colours, and pair each with its name.
- **Do** use the deep paper set (4.5:1 or more on `score-paper`) for anything on the score.
- **Do** make the primary action an ivory key on the case and a sepia key on linen.
- **Do** keep the practice screen in the dark case and the score on paper in every theme.
- **Do** use tabular figures for anything that counts or changes during playback.

### Don't:
- **Don't** add an accent colour to the chrome; states use tone, the highlighter or the key edge.
- **Don't** colour a note without its letter or solfège name.
- **Don't** move the learner away from the view they chose, or scroll the page while a song plays.
- **Don't** use stacked cards of icon, heading and text as a page structure, or a label above a heading.
- **Don't** imitate wood, lacquer or ivory with textures or gradients; the case is flat tone.
