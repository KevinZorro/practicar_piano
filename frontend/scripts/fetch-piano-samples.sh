#!/usr/bin/env bash
# Downloads recorded piano notes (C2..C7) to measure the microphone detector with real
# timbres instead of the additive model alone. Local use only: the files are not versioned
# (.gitignore blocks them) and are not part of the app.
#
#   FluidR3_GM and MusyngKite pianos: rendered by gleitz/midi-js-soundfonts (soundfonts under
#   Creative Commons licences, see that repository); Salamander Grand Piano V3 (CC BY 3.0,
#   Alexander Holm) as hosted by Tonejs/audio, one note every three semitones.
#
# Usage: scripts/fetch-piano-samples.sh [destination]   (default: .piano-samples)
# Then:  MIC_SAMPLES=.piano-samples npx vitest run src/core/audio/samplesEval.test.ts
set -euo pipefail

dest="${1:-.piano-samples}"
command -v ffmpeg >/dev/null || { echo "ffmpeg is required" >&2; exit 1; }
mkdir -p "$dest"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

flats=(C Db D Eb E F Gb G Ab A Bb B)
sharps=(C x x Ds x x Fs x x A x x)
gleitz="https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages"
tonejs="https://raw.githubusercontent.com/Tonejs/audio/master/salamander"

fetch() { # set midi url
  local set="$1" midi="$2" url="$3"
  mkdir -p "$dest/$set"
  [ -s "$dest/$set/$midi.f32" ] && return 0
  curl -fsS --retry 3 -o "$tmp/$set-$midi.mp3" "$url"
  ffmpeg -v error -y -i "$tmp/$set-$midi.mp3" -ac 1 -ar 48000 -f f32le "$dest/$set/$midi.f32"
}

for midi in $(seq 36 96); do
  octave=$((midi / 12 - 1))
  name="${flats[$((midi % 12))]}$octave"
  fetch fluid "$midi" "$gleitz/FluidR3_GM/acoustic_grand_piano-mp3/$name.mp3"
  fetch musyng "$midi" "$gleitz/MusyngKite/acoustic_grand_piano-mp3/$name.mp3"
  sharp="${sharps[$((midi % 12))]}"
  if [ "$sharp" != x ]; then
    fetch salamander "$midi" "$tonejs/$sharp$octave.mp3"
  fi
done
echo "Samples in $dest: $(find "$dest" -name '*.f32' | wc -l) notes"
