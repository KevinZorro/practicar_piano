---
version: 1
slug: "frontend-src-ui-practicescreen-tsx"
primary_target: "frontend/src/ui/PracticeScreen.tsx"
related_targets: ["frontend/src/ui/App.tsx","frontend/terminos.html"]
---

## Scope

Practice screen (primary) plus the home, library, queue, reading guide and terms page of
Notacaida. Mode: Operate. Visitor: a self-taught beginner at a digital keyboard, screen on the
music rest 60–80 cm away, hands on the keys. Job: play a transcribed cover and learn to read the
staff from the letters they already know. Proof is the song itself (synthetic fixture in
screenshots). Constraints: Spanish, WCAG AA, Chrome/Edge first, YouTube player at least
200x200 and never hidden while it plays, no invented claims.

## Direction contract

THESIS: The practice screen is an instrument, not a page: one fixed workspace where the
falling bar, the lit key and the notehead are the same note in the same colour, and the learner
picks Notas, Partitura or Ambas without the app ever moving them. It refuses the settings form
stacked above a canvas that scrolls, the card dashboard, and the dark SaaS with one accent.

OWN-WORLD: A warm lacquered case (near-black browns, hairlines a step lighter) with cream ink.
Colour belongs only to notes: seven calibrated metallophone hues, a bright set on the case and a
deep set on the paper score. Primary actions are ivory keys with a key edge and 1px travel;
secondary actions are black keys; segmented choices are a row of keys. One face, Atkinson
Hyperlegible Next, tabular numerals. The score is a paper sheet on the stand.

STORY: The learner sees that colour, letter, key and staff position name one note; trusts that
the view stays where they put it and that the song waits for them; plays, then turns colours and
letters off as reading improves.

FIRST VIEWPORT: Desktop 1440x900: 56px header (back to library, song title with the
transcription note, Notas/Partitura/Ambas key row, Guía). Stage about 1080px wide: paper score
on top (46%), falling notes over a keyboard fitted to the song below (54%); a 64px transport
under the stage with the ivory Play key first, timeline, time, measure, and the wait-mode note
chips. A 360px inspector on the right: video, Práctica, Tu teclado, Lectura. Mobile stacks the
same order with the transport sticky at the bottom.

FORM: Instrument panel for an operated tool, first on my ordered list (fixed workspace over a
scrolling page). Seed key 629074b4, degraded roll, assigned direction 3 "Metalófono".

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

Turning on "Nombre de cada nota" writes the coloured letter under every notehead while the same
colour lights the key: the translation Kevin asked for, live.

## Unresolved

- OFL font licence needs Kevin's acceptance (ADR 0021, proposed).
- Real YouTube and microphone behaviour verified only on Kevin's machine.
