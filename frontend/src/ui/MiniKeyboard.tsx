import { displayName, letterOf } from '../core/notes/names';
import type { NamingStyle } from '../core/practice/prefs';
import { isBlackKey } from '../render/keyboardLayout';
import { INK, STAGE_COLORS } from '../render/notePalette';

interface Props {
  low: number;
  high: number;
  naming: NamingStyle;
  /** Also writes the other naming style under each key: "C" and "Do". */
  dual?: boolean;
  /** A key to point at with a caption, such as middle C. */
  mark?: { pitch: number; caption: string };
  label: string;
}

const KEY_W = 40;
const KEY_H = 132;
const BLACK_W = 24;
const BLACK_H = 80;
const CAPTION_H = 30;

/** A small drawn keyboard: each white key carries its note's colour and name. */
export function MiniKeyboard({ low, high, naming, dual = false, mark, label }: Props) {
  const whites: number[] = [];
  for (let p = low; p <= high; p++) if (!isBlackKey(p)) whites.push(p);
  const width = whites.length * KEY_W;
  const height = KEY_H + (mark ? CAPTION_H : 2);
  const other: NamingStyle = naming === 'letters' ? 'solfege' : 'letters';
  const blacks = whites.flatMap((p, i) =>
    p + 1 <= high && isBlackKey(p + 1) ? [{ pitch: p + 1, x: (i + 1) * KEY_W - BLACK_W / 2 }] : [],
  );
  const markIndex = mark ? whites.indexOf(mark.pitch) : -1;

  return (
    <svg
      className="mini-keys"
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role="img"
      aria-label={label}
    >
      {whites.map((pitch, i) => {
        const x = i * KEY_W;
        const name = displayName(pitch, naming);
        return (
          <g key={pitch}>
            <rect
              x={x + 1}
              y={1}
              width={KEY_W - 2}
              height={KEY_H - 2}
              rx={4}
              fill="#f4f0e7"
              stroke="#2b241f"
              strokeWidth={1.5}
            />
            <rect
              x={x + 5}
              y={KEY_H - (dual ? 54 : 38)}
              width={KEY_W - 10}
              height={26}
              rx={5}
              fill={STAGE_COLORS[letterOf(pitch)]}
            />
            <text
              x={x + KEY_W / 2}
              y={KEY_H - (dual ? 36 : 20)}
              textAnchor="middle"
              fontSize={name.length > 2 ? 14 : 17}
              fill={INK}
            >
              {name}
            </text>
            {dual && (
              <text
                x={x + KEY_W / 2}
                y={KEY_H - 12}
                textAnchor="middle"
                fontSize={13}
                fill="#49403b"
              >
                {displayName(pitch, other)}
              </text>
            )}
          </g>
        );
      })}
      {blacks.map(({ pitch, x }) => (
        <rect key={pitch} x={x} y={1} width={BLACK_W} height={BLACK_H} rx={3} fill="#2b241f" />
      ))}
      {mark && markIndex >= 0 && (
        <g>
          <path
            d={`M${String(markIndex * KEY_W + KEY_W / 2 - 6)} ${String(KEY_H + 9)} l6 -7 l6 7 Z`}
            fill="currentColor"
          />
          <text
            x={markIndex * KEY_W + KEY_W / 2}
            y={KEY_H + 27}
            textAnchor="middle"
            fontSize={16}
            fill="currentColor"
          >
            {mark.caption}
          </text>
        </g>
      )}
    </svg>
  );
}
