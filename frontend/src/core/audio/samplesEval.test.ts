import { writeFileSync } from 'node:fs';
import type { DetectorOptions } from './noteDetector';
import { CHAINS } from './testing/chain';
import { runRecorded, SAMPLE_SETS, type RecordedTrial } from './testing/recorded';

// Measurement with recorded piano notes (a few minutes):
//   scripts/fetch-piano-samples.sh .piano-samples
//   MIC_SAMPLES=.piano-samples MIC_SAMPLES_OUT=/tmp/informe.md npx vitest run src/core/audio/samplesEval.test.ts
// Optional: MIC_LEVELS=0.15,0.04 (peak of C4), MIC_CHAINS='cable;altavoz + micro',
// MIC_OPTIONS='{"hitRiseDb":10}' (detector options as JSON), MIC_DETAIL=1 (list the failures).
const dir = process.env['MIC_SAMPLES'];
const outPath = process.env['MIC_SAMPLES_OUT'];
const options = process.env['MIC_OPTIONS']
  ? (JSON.parse(process.env['MIC_OPTIONS']) as Partial<DetectorOptions>)
  : undefined;
const levels = (process.env['MIC_LEVELS'] ?? '0.15,0.04,0.015').split(',').map(Number);
const chainNames = (process.env['MIC_CHAINS'] ?? Object.keys(CHAINS).join(';')).split(';');
const detail = process.env['MIC_DETAIL'] === '1';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nameOf = (p: number): string => `${NAMES[p % 12] ?? '?'}${String(Math.floor(p / 12) - 1)}`;
const BANDS: [string, number, number][] = [
  ['C2–B2', 36, 47],
  ['C3–B3', 48, 59],
  ['C4–F#5', 60, 78],
  ['G5–B5', 79, 83],
  ['C6–C7', 84, 96],
];

interface Tally {
  ok: number;
  total: number;
  falseWrong: number;
  notes: string[];
}
const tally = (): Tally => ({ ok: 0, total: 0, falseWrong: 0, notes: [] });
const rate = (t: Tally): string => `${String(t.ok)}/${String(t.total)}`;
const listed = (t: Tally): string => (detail ? t.notes.join(' ') : '');

function trial(rest: Omit<RecordedTrial, 'dir' | 'options' | 'seed'>, seed: number) {
  return runRecorded({ ...rest, dir: dir ?? '', seed, ...(options ? { options } : {}) });
}

function singles(lines: string[]): void {
  for (const name of chainNames) {
    const chain = CHAINS[name];
    if (!chain) continue;
    for (const level of levels) {
      lines.push(`\n### Nota sola: ${name}, nivel ${String(level)}\n`);
      lines.push(
        '| Registro | Oídas | Con nota incorrecta inventada | Detalle |',
        '|---|---|---|---|',
      );
      for (const [band, lo, hi] of BANDS) {
        const t = tally();
        for (let p = lo; p <= hi; p++) {
          for (const set of SAMPLE_SETS) {
            const r = trial({ set, played: [p], expected: [p], chain, level }, p * 13 + 7);
            if (!r) continue;
            t.total++;
            if (r.hits.has(p)) t.ok++;
            else t.notes.push(`${nameOf(p)}·${set[0] ?? ''}`);
            if (r.wrong.size > 0) {
              t.falseWrong++;
              t.notes.push(`(${nameOf(p)}·${set[0] ?? ''}→${[...r.wrong].map(nameOf).join('+')})`);
            }
          }
        }
        lines.push(`| ${band} | ${rate(t)} | ${String(t.falseWrong)} | ${listed(t)} |`);
      }
    }
  }
}

/** The player presses another key: the expected one must not be accepted. */
function substitutions(lines: string[], name: string, level: number): void {
  const chain = CHAINS[name];
  if (!chain) return;
  lines.push(`\n### Otra tecla en lugar de la esperada: ${name}, nivel ${String(level)}\n`);
  lines.push(
    '| Intervalo tocado | Se acepta la esperada (error grave) | Se marca la incorrecta | Detalle |',
    '|---|---|---|---|',
  );
  for (const d of [-19, -12, -7, -5, -2, -1, 1, 2, 5, 7, 12, 19]) {
    const accepted = tally();
    const flagged = tally();
    for (let p = 36; p <= 96; p += 4) {
      const played = p + d;
      if (played < 36 || played > 96) continue;
      for (const set of SAMPLE_SETS) {
        const r = trial({ set, played: [played], expected: [p], chain, level }, p * 31 + d);
        if (!r) continue;
        accepted.total++;
        flagged.total++;
        if (r.hits.has(p)) {
          accepted.ok++;
          accepted.notes.push(`${nameOf(p)}←${nameOf(played)}·${set[0] ?? ''}`);
        }
        if (r.wrong.has(played)) flagged.ok++;
      }
    }
    lines.push(
      `| ${d > 0 ? '+' : ''}${String(d)} | ${rate(accepted)} | ${rate(flagged)} | ${listed(accepted)} |`,
    );
  }
}

function chords(lines: string[], name: string, level: number): void {
  const chain = CHAINS[name];
  if (!chain) return;
  lines.push(`\n### Acordes: ${name}, nivel ${String(level)}\n`);
  lines.push(
    '| Acorde | Completos | Con nota incorrecta inventada | Detalle |',
    '|---|---|---|---|',
  );
  const shapes: [string, number[]][] = [
    ['tríada mayor', [0, 4, 7]],
    ['tríada menor', [0, 3, 7]],
    ['quinta y octava', [0, 7, 12]],
    ['octava', [0, 12]],
    ['cuatríada abierta', [0, 7, 12, 16]],
  ];
  for (const [label, shape] of shapes) {
    const t = tally();
    for (const root of [36, 40, 43, 48, 52, 55, 60, 64, 67, 72, 76, 79, 84]) {
      const notes = shape.map((d) => root + d);
      if (notes.some((n) => n > 96)) continue;
      for (const set of SAMPLE_SETS) {
        const r = trial({ set, played: notes, expected: notes, chain, level }, root * 7);
        if (!r) continue;
        t.total++;
        if (notes.every((n) => r.hits.has(n))) t.ok++;
        else
          t.notes.push(
            `${nameOf(root)}·${set[0] ?? ''}:-${notes
              .filter((n) => !r.hits.has(n))
              .map(nameOf)
              .join(',')}`,
          );
        if (r.wrong.size > 0) {
          t.falseWrong++;
          t.notes.push(`(${nameOf(root)}·${set[0] ?? ''}→${[...r.wrong].map(nameOf).join('+')})`);
        }
      }
    }
    lines.push(`| ${label} | ${rate(t)} | ${String(t.falseWrong)} | ${listed(t)} |`);
  }
}

/** A new note while the previous one still rings: left-hand bass lines and fast melodies. */
function lines_(lines: string[], name: string, level: number): void {
  const chain = CHAINS[name];
  if (!chain) return;
  lines.push(`\n### Nota nueva con la anterior sonando: ${name}, nivel ${String(level)}\n`);
  lines.push('| Paso | Oídas | Con nota incorrecta inventada | Detalle |', '|---|---|---|---|');
  const steps: [string, [number, number][]][] = [
    [
      'bajo (C2–B2)',
      [
        [36, 43],
        [43, 36],
        [40, 45],
        [45, 40],
        [38, 43],
        [41, 36],
        [36, 48],
        [43, 47],
      ],
    ],
    [
      'agudos (C6–C7)',
      [
        [84, 86],
        [86, 88],
        [88, 91],
        [91, 89],
        [89, 84],
        [93, 96],
      ],
    ],
  ];
  for (const [label, pairs] of steps) {
    const t = tally();
    for (const [before, after] of pairs) {
      for (const set of SAMPLE_SETS) {
        const r = trial(
          { set, previous: [before], played: [after], expected: [after], chain, level },
          before * 5 + after,
        );
        if (!r) continue;
        t.total++;
        if (r.hits.has(after)) t.ok++;
        else t.notes.push(`${nameOf(before)}→${nameOf(after)}·${set[0] ?? ''}`);
        if (r.wrong.size > 0) {
          t.falseWrong++;
          t.notes.push(`(${nameOf(after)}·${set[0] ?? ''}→${[...r.wrong].map(nameOf).join('+')})`);
        }
      }
    }
    lines.push(`| ${label} | ${rate(t)} | ${String(t.falseWrong)} | ${listed(t)} |`);
  }
}

/** Another key while the previous bass note rings: what it shares with the expected one is masked. */
function lineSubstitutions(lines: string[], name: string, level: number): void {
  const chain = CHAINS[name];
  if (!chain) return;
  lines.push(`\n### Otra tecla con la anterior sonando: ${name}, nivel ${String(level)}\n`);
  lines.push(
    '| Intervalo tocado | Se acepta la esperada (error grave) | Se marca la incorrecta | Detalle |',
    '|---|---|---|---|',
  );
  const pairs: [number, number][] = [
    [36, 43],
    [43, 36],
    [40, 45],
    [45, 40],
    [38, 43],
    [41, 36],
    [36, 48],
    [43, 47],
    [48, 55],
    [55, 52],
  ];
  for (const d of [-12, -7, -5, -2, -1, 1, 2, 5, 7, 12]) {
    const accepted = tally();
    const flagged = tally();
    for (const [before, after] of pairs) {
      const played = after + d;
      if (played < 36 || played > 96 || played === before) continue;
      for (const set of SAMPLE_SETS) {
        const r = trial(
          { set, previous: [before], played: [played], expected: [after], chain, level },
          before * 5 + after + d,
        );
        if (!r) continue;
        accepted.total++;
        flagged.total++;
        if (r.hits.has(after)) {
          accepted.ok++;
          accepted.notes.push(
            `${nameOf(before)}→${nameOf(after)}←${nameOf(played)}·${set[0] ?? ''}`,
          );
        }
        if (r.wrong.has(played)) flagged.ok++;
      }
    }
    lines.push(
      `| ${d > 0 ? '+' : ''}${String(d)} | ${rate(accepted)} | ${rate(flagged)} | ${listed(accepted)} |`,
    );
  }
}

describe.skipIf(!dir)('microphone detector with recorded piano notes', () => {
  it('writes the report', () => {
    const lines: string[] = [];
    const sections = (process.env['MIC_SECTIONS'] ?? 'singles,subst,chords,lines,linesubst').split(
      ',',
    );
    if (sections.includes('singles')) singles(lines);
    for (const [name, level] of [
      ['altavoz + micro', 0.04],
      ['cable', 0.04],
    ] as const) {
      if (sections.includes('subst')) substitutions(lines, name, level);
      if (sections.includes('chords')) chords(lines, name, level);
      if (sections.includes('lines')) lines_(lines, name, level);
      if (sections.includes('linesubst')) lineSubstitutions(lines, name, level);
    }
    writeFileSync(outPath ?? '/dev/stdout', lines.join('\n') + '\n');
  }, 3_600_000);
});
