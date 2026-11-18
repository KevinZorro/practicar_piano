import { NoteDetector, type DetectionEvent, type DetectorOptions } from '../noteDetector';
import { afterStrike, runTrial, type Trial } from './evaluate';
import { analyserFrames, renderRoom, rng, SAMPLE_RATE, type RoomOptions } from './simulate';

export interface Condition {
  name: string;
  room: RoomOptions;
  amplitude: number;
}

export const CONDITIONS: Condition[] = [
  { name: 'sala silenciosa', room: { noiseRms: 0.001 }, amplitude: 0.2 },
  { name: 'sala con ruido', room: { noiseRms: 0.005, hum: 0.003 }, amplitude: 0.1 },
  {
    name: 'altavoz pequeño (sin graves)',
    room: { noiseRms: 0.002, speakerCornerHz: 250 },
    amplitude: 0.15,
  },
  {
    name: 'teclado desafinado +25 cents',
    room: { noiseRms: 0.002, detuneCents: 25 },
    amplitude: 0.2,
  },
];

export interface Rate {
  ok: number;
  total: number;
}
const pct = (r: Rate): string =>
  r.total === 0
    ? '-'
    : `${((100 * r.ok) / r.total).toFixed(1)} % (${String(r.ok)}/${String(r.total)})`;

export interface Report {
  recallSingle: Record<string, Rate>;
  recallChords: Record<string, Rate>;
  latencyHitS: number[];
  latencyOnsetS: number[];
  falseWrongOnCorrectPlay: Rate;
  substitution: Record<string, { hitOfExpected: Rate; wrongFlagged: Rate }>;
  noisePerMinute: Record<string, number>;
  octaveDyad: Record<string, { hits: Rate }>;
}

const STEP = 3;
const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? NaN;
};

function hitsOf(events: DetectionEvent[]): Set<number> {
  return new Set(events.filter((e) => e.kind === 'hit').map((e) => e.pitch));
}

function noiseOnly(
  durationS: number,
  expected: number[],
  options: Partial<DetectorOptions> | undefined,
  fftSize: number,
) {
  const room: RoomOptions = { noiseRms: 0.005, hum: 0.004 };
  const signal = renderRoom(durationS, [], room, 99);
  // Door thumps and a voice that glides, the usual things around a keyboard.
  const rand = rng(5);
  for (let t = 3; t < durationS - 1; t += 4 + rand() * 3) {
    const at = Math.floor(t * SAMPLE_RATE);
    for (let i = 0; i < 0.05 * SAMPLE_RATE; i++) {
      signal[at + i] =
        (signal[at + i] ?? 0) +
        0.05 * Math.sin((2 * Math.PI * 70 * i) / SAMPLE_RATE) * (1 - i / (0.05 * SAMPLE_RATE));
    }
  }
  // A voice: harmonics of a slowly gliding pitch, vibrato included, starting in 20 ms.
  let phase = 0;
  for (let i = 0; i < signal.length; i++) {
    const t = i / SAMPLE_RATE;
    if (t < 5 || t > 15) continue;
    const f0 = 130 + 40 * Math.sin(t * 1.3) + 3 * Math.sin(2 * Math.PI * 5.5 * t);
    phase += (2 * Math.PI * f0) / SAMPLE_RATE;
    let v = 0;
    for (let h = 1; h <= 12; h++) v += Math.sin(phase * h) / h;
    signal[i] = (signal[i] ?? 0) + 0.03 * v * Math.min(1, (t - 5) / 0.02);
  }
  const detector = new NoteDetector(options);
  detector.setExpected(expected);
  let hits = 0;
  let wrongs = 0;
  for (const frame of analyserFrames(signal, fftSize, 0.02)) {
    for (const e of detector.process(frame)) {
      if (e.kind === 'hit') hits++;
      else wrongs++;
    }
  }
  return { hits, wrongs };
}

export function runReport(
  options?: Partial<DetectorOptions>,
  quick = false,
  fftSize = 8192,
): Report {
  const report: Report = {
    recallSingle: {},
    recallChords: {},
    latencyHitS: [],
    latencyOnsetS: [],
    falseWrongOnCorrectPlay: { ok: 0, total: 0 },
    substitution: {},
    noisePerMinute: {},
    octaveDyad: {},
  };
  const step = quick ? 12 : STEP;
  const base = (c: Condition, expected: number[], played: number[], seed: number): Trial => ({
    expected,
    played,
    amplitude: c.amplitude,
    room: c.room,
    seed,
    fftSize,
    ...(options ? { options } : {}),
  });
  const conditions = quick ? CONDITIONS.slice(0, 2) : CONDITIONS;
  for (const c of conditions) {
    const single: Rate = { ok: 0, total: 0 };
    for (let p = 36; p <= 96; p += step) {
      const r = runTrial(base(c, [p], [p], p));
      single.total++;
      const hit = afterStrike(r, 'hit').find((e) => e.pitch === p);
      if (hit) {
        single.ok++;
        report.latencyHitS.push(hit.timeS - r.strikeS);
        report.latencyOnsetS.push(hit.onsetS - r.strikeS);
      }
      report.falseWrongOnCorrectPlay.total++;
      if (afterStrike(r, 'wrong').length === 0) report.falseWrongOnCorrectPlay.ok++;
    }
    report.recallSingle[c.name] = single;
    const chords: Rate = { ok: 0, total: 0 };
    const shapes: number[][] = [
      [0, 4, 7],
      [0, 3, 7],
      [0, 4, 7, 12, 16],
      [0, 7, 12],
    ];
    for (const root of quick ? [48, 60] : [40, 48, 55, 60, 67]) {
      for (const shape of shapes) {
        const notes = shape.map((d) => root + d);
        const r = runTrial(base(c, notes, notes, root * 7 + shape.length));
        chords.total++;
        const got = hitsOf(afterStrike(r, 'hit'));
        if (notes.every((n) => got.has(n))) chords.ok++;
        report.falseWrongOnCorrectPlay.total++;
        if (afterStrike(r, 'wrong').length === 0) report.falseWrongOnCorrectPlay.ok++;
      }
    }
    report.recallChords[c.name] = chords;
  }
  const mid = CONDITIONS[1] as Condition;
  const intervals = quick
    ? [-12, -1, 1, 7, 12]
    : [-19, -12, -7, -5, -3, -2, -1, 1, 2, 3, 5, 7, 12, 19];
  for (const d of intervals) {
    const row = { hitOfExpected: { ok: 0, total: 0 }, wrongFlagged: { ok: 0, total: 0 } };
    for (const p of quick ? [48, 64] : [43, 52, 60, 67, 76]) {
      const r = runTrial(base(mid, [p], [p + d], p * 3 + d + 100));
      row.hitOfExpected.total++;
      // Not accepting the expected note is the right answer here, so `ok` counts the mistakes.
      if (afterStrike(r, 'hit').some((e) => e.pitch === p)) row.hitOfExpected.ok++;
      row.wrongFlagged.total++;
      if (afterStrike(r, 'wrong').some((e) => e.pitch === p + d)) row.wrongFlagged.ok++;
    }
    report.substitution[(d > 0 ? '+' : '') + String(d)] = row;
  }
  for (const b of quick ? [43] : [36, 43, 48, 55]) {
    for (const [label, played] of [
      ['ambas', [b, b + 12]],
      ['solo la grave', [b]],
      ['solo la aguda', [b + 12]],
    ] as const) {
      const r = runTrial(base(mid, [b, b + 12], [...played], b * 11 + played.length));
      const got = hitsOf(afterStrike(r, 'hit'));
      const row = (report.octaveDyad[label] ??= { hits: { ok: 0, total: 0 } });
      row.hits.total += 2;
      row.hits.ok += [b, b + 12].filter((n) => got.has(n)).length;
    }
  }
  const seconds = quick ? 20 : 60;
  for (const [label, expected] of [
    ['esperando una nota', [60]],
    ['esperando un acorde', [48, 55, 60, 64]],
    ['esperando graves', [36, 43]],
  ] as const) {
    const { hits, wrongs } = noiseOnly(seconds, [...expected], options, fftSize);
    report.noisePerMinute[`${label}: aciertos falsos`] = (hits * 60) / seconds;
    report.noisePerMinute[`${label}: notas incorrectas falsas`] = (wrongs * 60) / seconds;
  }
  return report;
}

export function formatReport(r: Report): string {
  const lines: string[] = [];
  lines.push('| Prueba | Resultado |', '|---|---|');
  for (const [k, v] of Object.entries(r.recallSingle))
    lines.push(`| Nota esperada sola, ${k} | ${pct(v)} oídas |`);
  for (const [k, v] of Object.entries(r.recallChords))
    lines.push(`| Acordes completos, ${k} | ${pct(v)} |`);
  lines.push(
    `| Latencia del detector (golpe a decisión), mediana / p95 | ${(quantile(r.latencyHitS, 0.5) * 1000).toFixed(0)} ms / ${(quantile(r.latencyHitS, 0.95) * 1000).toFixed(0)} ms |`,
  );
  lines.push(
    `| Notas incorrectas inventadas al tocar bien | ${String(r.falseWrongOnCorrectPlay.total - r.falseWrongOnCorrectPlay.ok)} de ${String(r.falseWrongOnCorrectPlay.total)} pasadas |`,
  );
  lines.push(
    '',
    '| Se toca otra nota (intervalo en semitonos) | Se acepta la esperada (error grave) | Se detecta la incorrecta |',
    '|---|---|---|',
  );
  for (const [k, v] of Object.entries(r.substitution))
    lines.push(`| ${k} | ${pct(v.hitOfExpected)} | ${pct(v.wrongFlagged)} |`);
  lines.push(
    '',
    '| Dueto en octava (esperadas la grave y la aguda) | Notas confirmadas |',
    '|---|---|',
  );
  for (const [k, v] of Object.entries(r.octaveDyad)) lines.push(`| ${k} | ${pct(v.hits)} |`);
  lines.push('', '| Ruido sin tocar (puerta, voz, zumbido) | Eventos por minuto |', '|---|---|');
  for (const [k, v] of Object.entries(r.noisePerMinute)) lines.push(`| ${k} | ${v.toFixed(2)} |`);
  return lines.join('\n');
}
