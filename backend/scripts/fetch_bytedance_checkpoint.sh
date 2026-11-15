#!/usr/bin/env bash
# Downloads the ByteDance piano transcription checkpoint and verifies its integrity.
# The upstream package does this with `wget` and no checksum (see docs/adr/0013-*.md).
#
# Usage: backend/scripts/fetch_bytedance_checkpoint.sh
# Env:   PIANOLA_BYTEDANCE_CHECKPOINT  destination file (default: the package's own path)
set -euo pipefail

URL='https://zenodo.org/record/4034264/files/CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1'
DEST="${PIANOLA_BYTEDANCE_CHECKPOINT:-$HOME/piano_transcription_inference_data/note_F1=0.9677_pedal_F1=0.9186.pth}"
HASH_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/bytedance_checkpoint.sha256"
MIN_BYTES=160000000

expected=""
if [ -f "$HASH_FILE" ]; then
  expected="$(grep -Eo '^[0-9a-f]{64}' "$HASH_FILE" | head -n 1 || true)"
fi

mkdir -p "$(dirname "$DEST")"
if [ ! -f "$DEST" ] || [ "$(stat -c %s "$DEST")" -lt "$MIN_BYTES" ]; then
  echo "Downloading checkpoint to $DEST ..."
  curl -fL --retry 3 --retry-delay 5 -o "$DEST.part" "$URL"
  mv "$DEST.part" "$DEST"
fi

size="$(stat -c %s "$DEST")"
if [ "$size" -lt "$MIN_BYTES" ]; then
  echo "ERROR: file is only $size bytes; download looks incomplete." >&2
  exit 1
fi

actual="$(sha256sum "$DEST" | cut -d' ' -f1)"
if [ -z "$expected" ]; then
  echo "WARNING: no pinned hash in $HASH_FILE (first use)."
  echo "sha256: $actual"
  echo "Compare the file with the checksum Zenodo shows for the record, then commit this"
  echo "hash to $HASH_FILE so later downloads are verified."
  exit 0
fi
if [ "$actual" != "$expected" ]; then
  echo "ERROR: sha256 mismatch (expected $expected, got $actual). Deleting file." >&2
  rm -f "$DEST"
  exit 1
fi
echo "OK: checkpoint verified ($actual)."
