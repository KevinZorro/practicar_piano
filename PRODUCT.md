# Product

<!-- impeccable:product-schema 1 -->

Facts below come from the project brief, `docs/` and the code. Kevin delegated the design
process on 2026-11-18 ("hazlo bien, lo normal estandarizado"), so lines marked *(inferred)* were
derived from that evidence and not confirmed one by one.

## Platform

web

## Users

- Spanish-speaking people who teach themselves piano at home on a digital keyboard and want to
  play songs they found as piano covers on YouTube.
- The first user is the author, Kevin: a beginner who already reads letter names (C, D, E…) and
  is now learning to read sheet music. His keyboard (Vangoa VGK6101, 61 keys) has no USB MIDI,
  so he plays by ear through the microphone.
- Phase 2 tests the product with five piano learners (gate 2).

## Product Purpose

Paste the link of a YouTube piano cover; the server transcribes it (ByteDance piano model),
reduces it to at most 10 simultaneous notes keeping the harmony, finds the beat, writes the
score, delivers it to the browser and forgets it. The learner then practices it with falling
notes, a synchronized score, the original video, adjustable speed and level, and wait mode
(the song stops until the right keys are played and rewinds after a mistake). Success: the
learner can play the song they wanted, and reads a bit more notation each time.

## Positioning

Any piano cover on YouTube becomes a practice session, free, without an account, and the
server keeps nothing. Falling notes and real notation sit side by side, so the letters a
beginner already knows lead into reading the staff.

## Operating Context

- The learner sits at the instrument with both hands on the keys; the screen stands on the music
  rest or a table 60–80 cm away and is read at a glance between notes *(inferred)*.
- Settings are touched before a run and between runs, rarely while playing *(inferred)*.
- Chrome or Edge on a laptop or desktop is the main setup (Web MIDI); phones and tablets are
  secondary. Input is a USB MIDI keyboard or the microphone.
- Processing takes minutes (about 6 for a 3-minute song); the learner leaves and is told by a
  browser notification.

## Capabilities and Constraints

- Levels: playable and easy (the original transcription is kept only for reference).
- Speed 25–150 %; wait mode by hand (both, right, left); rewind on a mistake; sound from the
  video, or from a Tone.js piano when the video cannot be embedded.
- Library and progress live in the browser (IndexedDB): attempts and best accuracy per level,
  "mastered" at 90 % or more at full speed without wait mode. No accounts.
- Songs up to 10 minutes; one song is processed at a time; the queue holds a few more.
- The transcription is automatic and can be wrong: say so plainly.
- Stack: React, TypeScript, Vite, Canvas 2D, OpenSheetMusicDisplay, Tone.js, Web MIDI, Web Audio.
- Only permissive licenses (MIT, BSD, Apache, Unlicense; SIL OFL 1.1 for fonts only, ADR 0021); no GPL. Never ship copyrighted audio
  or MIDI.

## Brand Commitments

- Name: **Notacaida** (nota + caída), final since 2026-11-18. Domain: `notacaida.duckdns.org`.
- Interface language: Spanish, addressing the learner as «tú».
- The author asked for an interface that is clearly a practice tool, not a landing page, and
  that does not look generated.

## Evidence on Hand

- A synthetic exercise built by the real pipeline (`frontend/e2e/fixtures/result.json`) and a
  public-domain melody («Oda a la alegría») for end-to-end tests.
- No testimonials, user numbers or real songs may be shown; screenshots use synthetic material.

## Product Principles

1. The instrument comes first: everything needed while playing is readable from the bench, and
   nothing on screen competes with the notes.
2. The learner chooses how to read: falling notes, the score, both, or the original video in
   place of the falling notes, and the app never moves them away from their choice.
3. Teach reading while playing: letters, keys and staff positions are always shown as the same
   note.
4. Honest about the machine: automatic transcription, simplified notes and waiting times are
   stated, not hidden.
5. Private by default: the song lives in the learner's browser.

## Accessibility & Inclusion

- WCAG 2.1 AA contrast, visible keyboard focus, 44 px touch targets, reduced motion respected.
- Colour never carries meaning alone: hands are also told apart by position and labels.
