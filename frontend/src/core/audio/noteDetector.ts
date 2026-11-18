/**
 * Detects piano notes in the microphone spectrum, knowing which notes the song expects.
 *
 * Why not free transcription: the app knows what should sound now, so it asks "is this note
 * present?" (strict) and, separately, "is something else clearly present?" (stricter). Both
 * answers are conservative on purpose: a doubtful note is never accepted, because a false
 * hit is worse than asking the player to repeat (ADR 0020).
 *
 * Pure code: it takes dB spectra (what `AnalyserNode.getFloatFrequencyData` returns) and
 * knows nothing about the browser.
 */

export interface SpectrumFrame {
  /** Magnitude in dB per FFT bin (length fftSize / 2). */
  readonly db: Float32Array;
  readonly sampleRate: number;
  /** Seconds on any monotonic clock. */
  readonly timeS: number;
}

export interface DetectionEvent {
  /** `hit`: an expected note was played. `wrong`: a clear note that the song did not expect. */
  readonly kind: 'hit' | 'wrong';
  readonly pitch: number;
  /** When the detector decided (what the player waits for). */
  readonly timeS: number;
  /** When the note was first seen (what the judge should compare with the song). */
  readonly onsetS: number;
}

/** What the calibration learned about this keyboard, room and microphone. */
export interface DetectorTuning {
  /** Keyboard tuning relative to A=440, in cents. */
  readonly cents: number;
  /** Per partial (index 0 = fundamental): rise in dB above the floor that counts as present. */
  readonly partialRiseDb: readonly number[];
}

export interface DetectorOptions {
  lowPitch: number;
  highPitch: number;
  /** Time constant of the background estimate: sustained sounds fade into it after ~3 of these. */
  floorTauS: number;
  /** Upper limit of how fast the background may rise, in dB per second. */
  floorMaxRiseDbPerS: number;
  /** A partial must also be this much louder than it was `attackLagS` ago: notes start abruptly, voices and hum do not. */
  attackLagS: number;
  /** Largest drift of the pitch position, in cents, while a note is being confirmed. */
  maxPitchDriftCents: number;
  /** A partial counts as present when it rises this many dB over the background. */
  hitRiseDb: number;
  /** Same, for notes the song did not expect (stricter). */
  wrongRiseDb: number;
  /** Peaks under this level are ignored whatever the background says. */
  minAbsDb: number;
  /** Minimum dB the partial's peak must stand out from its surroundings. */
  prominenceDb: number;
  wrongProminenceDb: number;
  hitPersistS: number;
  wrongPersistS: number;
  /** Quiet time needed before the same pitch can fire again. */
  rearmS: number;
  maxPartialHz: number;
  centsTolerance: number;
  /** Highest partial looked at. */
  maxPartials: number;
}

export const DEFAULT_OPTIONS: DetectorOptions = {
  lowPitch: 36, // C2, lowest key of a 61-key keyboard
  highPitch: 96, // C7
  floorTauS: 0.5,
  floorMaxRiseDbPerS: 10,
  attackLagS: 0.25,
  maxPitchDriftCents: 20,
  hitRiseDb: 12,
  wrongRiseDb: 16,
  minAbsDb: -85,
  prominenceDb: 10,
  wrongProminenceDb: 14,
  hitPersistS: 0.04,
  wrongPersistS: 0.07,
  rearmS: 0.12,
  maxPartialHz: 4500,
  centsTolerance: 35,
  maxPartials: 8,
};

const MIN_DB = -120;

export function pitchToHz(pitch: number, cents = 0): number {
  return 440 * 2 ** ((pitch - 69) / 12 + cents / 1200);
}

export interface PartialReading {
  readonly hz: number;
  /** FFT bin of the loudest point near the partial (-1 when the partial is out of range). */
  readonly bin: number;
  /** dB over the background at that bin. */
  readonly riseDb: number;
  /** dB by which the peak stands out from the bins 4 away (loud notes leak into everything). */
  readonly prominenceDb: number;
  /** Where the peak really is, in cents from the nominal frequency. */
  readonly offsetCents: number;
  readonly present: boolean;
  readonly strict: boolean;
  /** Rise is there and the point is not on a skirt, but crowded chords can hide the peak. */
  readonly loose: boolean;
  readonly looseStrict: boolean;
}

export interface Reading {
  readonly pitch: number;
  readonly partials: readonly PartialReading[];
  /** Mean position of the present partials against their nominal frequency, in cents. */
  readonly meanOffsetCents: number;
  /** Taken by the note hypothesis that explains the most energy (see `explain`). */
  readonly present: boolean;
  readonly presentStrict: boolean;
}

interface PitchState {
  satisfiedSinceS: number | null;
  /** Since when the pitch has been continuously unsatisfied (null while satisfied). */
  quietSinceS: number | null;
  armed: boolean;
  kind: 'hit' | 'wrong' | null;
  /** Range of the pitch position while the note stays satisfied. */
  minCents: number;
  maxCents: number;
}

function needed(count: number): number {
  return Math.min(count, Math.max(3, Math.ceil(count / 2)));
}

interface Evaluation {
  present: boolean;
  strict: boolean;
  score: number;
}

/** How many partials of a hypothesis count, given the bins already explained by other notes. */
export function evaluate(
  partials: readonly PartialReading[],
  consumed: Uint8Array,
  binHz: number,
): Evaluation {
  const count = partials.length;
  let present = 0;
  let strict = 0;
  let odd = 0;
  let oddStrict = 0;
  let disc = 0;
  let discStrict = 0;
  let score = 0;
  for (const [i, p] of partials.entries()) {
    if (p.bin < 0 || consumed[p.bin]) continue;
    const resolves = p.hz >= 50 * binHz; // a semitone is >= 3 bins apart only from here up
    const isOdd = (i + 1) % 2 === 1; // the octave below has no partial at odd positions
    // The octave below has no energy at odd positions; there a crowded chord may hide the
    // sharp peak, so the looser test is enough.
    if (isOdd && p.loose) odd++;
    if (isOdd && p.looseStrict) oddStrict++;
    if (p.present) {
      present++;
      score += Math.min(p.riseDb, 40);
      if (resolves) disc++;
    }
    if (p.strict) {
      strict++;
      if (resolves) discStrict++;
    }
  }
  const need = needed(count);
  const needDisc = Math.min(2, count);
  const needOdd = Math.ceil(need / 3);
  return {
    present: present >= need && disc >= needDisc && odd >= needOdd,
    strict: strict >= need && discStrict >= needDisc && oddStrict >= needOdd,
    score,
  };
}

export class NoteDetector {
  private readonly options: DetectorOptions;
  private floor: Float64Array | null = null;
  private lastTimeS: number | null = null;
  private expected = new Set<number>();
  private readonly state = new Map<number, PitchState>();
  private tuning: DetectorTuning = { cents: 0, partialRiseDb: [] };
  private lastReadings = new Map<number, Reading>();
  private history: { timeS: number; db: Float32Array }[] = [];
  private lagged: Float32Array | null = null;

  constructor(options: Partial<DetectorOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  setExpected(pitches: Iterable<number>): void {
    this.expected = new Set(pitches);
  }

  setTuning(tuning: DetectorTuning): void {
    this.tuning = tuning;
  }

  /** Forgets background and pending notes (new session, or the microphone changed). */
  reset(): void {
    this.floor = null;
    this.lastTimeS = null;
    this.state.clear();
    this.history = [];
    this.lagged = null;
    this.lastReadings = new Map();
  }

  /** The readings computed for the last frame (calibration uses them). */
  reading(pitch: number): Reading | undefined {
    return this.lastReadings.get(pitch);
  }

  /** Mean background level in dB over the useful band (calibration reports it). */
  backgroundDb(sampleRate: number): number {
    if (!this.floor) return MIN_DB;
    const binHz = sampleRate / (this.floor.length * 2);
    const lo = Math.floor(100 / binHz);
    const hi = Math.min(this.floor.length - 1, Math.floor(this.options.maxPartialHz / binHz));
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += this.floor[k] ?? 0;
    return 10 * Math.log10(sum / (hi - lo + 1) + 1e-12);
  }

  process(frame: SpectrumFrame): DetectionEvent[] {
    const { db, timeS } = frame;
    if (!this.floor || this.floor.length !== db.length) {
      this.floor = new Float64Array(db.length);
      for (let k = 0; k < db.length; k++)
        this.floor[k] = 10 ** (Math.max(db[k] ?? MIN_DB, MIN_DB) / 10);
      this.lastTimeS = timeS;
      return [];
    }
    this.lagged = this.laggedAt(timeS - this.options.attackLagS);
    const readings = this.readAll(frame);
    this.lastReadings = readings;
    const events = this.decide(readings, timeS);
    this.updateFloor(db, timeS);
    this.remember(frame);
    return events;
  }

  /** Keeps a short history of spectra; the oldest ones are recycled to avoid allocations. */
  private remember(frame: SpectrumFrame): void {
    const keepS = this.options.attackLagS + 0.1;
    let copy: Float32Array | undefined;
    while (this.history.length > 0 && frame.timeS - (this.history[0]?.timeS ?? 0) > keepS) {
      copy = this.history.shift()?.db;
    }
    if (!copy || copy.length !== frame.db.length) copy = new Float32Array(frame.db.length);
    copy.set(frame.db);
    this.history.push({ timeS: frame.timeS, db: copy });
  }

  /** The newest remembered spectrum at or before `timeS`, or null when the history is too short. */
  private laggedAt(timeS: number): Float32Array | null {
    let found: Float32Array | null = null;
    for (const entry of this.history) {
      if (entry.timeS <= timeS) found = entry.db;
      else break;
    }
    return found;
  }

  private updateFloor(db: Float32Array, timeS: number): void {
    const floor = this.floor;
    if (!floor) return;
    const dt = Math.max(0, timeS - (this.lastTimeS ?? timeS));
    const alpha = 1 - Math.exp(-dt / this.options.floorTauS);
    // The background follows the mean power, but climbs at most `floorMaxRiseDbPerS`: a note
    // that starts 40 dB above the room must not be absorbed into the background at once.
    const maxStep = 10 ** ((this.options.floorMaxRiseDbPerS * dt) / 10);
    for (let k = 0; k < db.length; k++) {
      const power = 10 ** (Math.max(db[k] ?? MIN_DB, MIN_DB) / 10);
      const current = floor[k] ?? power;
      const next = current + (power - current) * alpha;
      floor[k] = Math.min(next, current * maxStep);
    }
    this.lastTimeS = timeS;
  }

  private candidates(): number[] {
    const out = new Set<number>(this.expected);
    for (let p = this.options.lowPitch; p <= this.options.highPitch; p++) out.add(p);
    return [...out].sort((a, b) => a - b);
  }

  /**
   * Decides which pitches are really sounding, in three steps (this is where the false
   * positives found while measuring were removed):
   *  1. Expected notes are checked on their own partials. Notes of one chord may share
   *     partials, so they are not taken away from each other.
   *  2. The combs of the expected notes that passed are set aside; among the remaining
   *     pitches, the one that explains the most energy takes its partials, and so on
   *     (greedy cancellation). Overtones and coincidences cannot pass for other notes.
   *  3. An expected note is withdrawn when most of what made it present is explained by an
   *     unexpected note (the player pressed another key and its overtones coincide).
   *
   * Known limit: when the song expects an octave (C3 and C4 together) the upper note adds
   * no energy of its own, so it is credited whenever the lower one is. Playing only the
   * lower key passes both (measured in docs/phase-1/microfono-mediciones.md).
   */
  private readAll(frame: SpectrumFrame): Map<number, Reading> {
    const binHz = frame.sampleRate / (frame.db.length * 2);
    const raw = new Map<number, PartialReading[]>();
    for (const pitch of this.candidates()) raw.set(pitch, this.readPartials(frame, pitch));
    const none = new Uint8Array(frame.db.length);
    const out = new Map<number, Reading>();
    const mark = (pitch: number, present: boolean, strict: boolean) => {
      const partials = raw.get(pitch) ?? [];
      const heard = partials.filter((p) => p.present);
      const meanOffsetCents =
        heard.length === 0 ? 0 : heard.reduce((a, p) => a + p.offsetCents, 0) / heard.length;
      out.set(pitch, { pitch, partials, meanOffsetCents, present, presentStrict: strict });
    };

    const accepted = new Map<number, Evaluation>();
    for (const pitch of this.expected) {
      const ev = evaluate(raw.get(pitch) ?? [], none, binHz);
      if (ev.present) accepted.set(pitch, ev);
    }
    const consumed = new Uint8Array(frame.db.length);
    for (const pitch of accepted.keys()) this.consumeComb(consumed, pitch, binHz);

    const unexpected = new Map<number, { ev: Evaluation; comb: Uint8Array }>();
    const remaining = new Set([...raw.keys()].filter((p) => !this.expected.has(p)));
    for (;;) {
      let best: { pitch: number; ev: Evaluation } | null = null;
      for (const pitch of remaining) {
        const ev = evaluate(raw.get(pitch) ?? [], consumed, binHz);
        if (ev.present && (!best || ev.score > best.ev.score)) best = { pitch, ev };
      }
      if (!best) break;
      remaining.delete(best.pitch);
      const comb = new Uint8Array(frame.db.length);
      this.consumeComb(comb, best.pitch, binHz);
      for (let k = 0; k < comb.length; k++) if (comb[k]) consumed[k] = 1;
      unexpected.set(best.pitch, { ev: best.ev, comb });
    }

    const combs = new Map<number, Uint8Array>();
    for (const pitch of accepted.keys()) {
      const comb = new Uint8Array(frame.db.length);
      this.consumeComb(comb, pitch, binHz);
      combs.set(pitch, comb);
    }
    const rivals = [...raw.keys()].filter((p) => !this.expected.has(p));
    const winners = new Map<number, Evaluation>();
    for (const [pitch, ev] of accepted) {
      const own = (raw.get(pitch) ?? []).filter((p) => p.present && p.bin >= 0);
      const shares = (comb: Uint8Array): boolean =>
        own.filter((p) => comb[p.bin]).length * 2 > own.length;
      let contested = [...unexpected.values()].some(({ comb }) => shares(comb));
      if (!contested) {
        // Would another key, judged without this note's claim, explain it better? The other
        // expected notes keep their claims, so a real chord is not mistaken for rivals.
        const others = new Uint8Array(frame.db.length);
        for (const [q, comb] of combs) {
          if (q === pitch) continue;
          for (let k = 0; k < comb.length; k++) if (comb[k]) others[k] = 1;
        }
        const mine = evaluate(raw.get(pitch) ?? [], others, binHz);
        contested = rivals.some((u) => {
          const theirs = evaluate(raw.get(u) ?? [], others, binHz);
          if (!theirs.present || theirs.score < mine.score) return false;
          const comb = new Uint8Array(frame.db.length);
          this.consumeComb(comb, u, binHz);
          if (!shares(comb)) return false;
          winners.set(u, theirs);
          return true;
        });
      }
      mark(pitch, !contested, ev.strict);
    }
    for (const pitch of this.expected) if (!out.has(pitch)) mark(pitch, false, false);
    for (const pitch of remaining) mark(pitch, false, false);
    // The key that took an expected note's place is the wrong note the player pressed.
    for (const [pitch, ev] of winners) mark(pitch, true, ev.strict);
    for (const [pitch, { ev }] of unexpected) mark(pitch, true, ev.strict);
    return out;
  }

  /** Marks every partial position of a note (not only the evaluated ones) as explained. */
  private consumeComb(consumed: Uint8Array, pitch: number, binHz: number): void {
    const f0 = pitchToHz(pitch, this.tuning.cents);
    for (let h = 1; h * f0 <= this.options.maxPartialHz * 1.5; h++) {
      const center = Math.round((h * f0) / binHz);
      // As wide as the search window of a partial, so a detuned keyboard is still covered.
      const reach =
        3 + Math.ceil((h * f0 * (2 ** (this.options.centsTolerance / 1200) - 1)) / binHz);
      for (let k = center - reach; k <= center + reach; k++)
        if (k >= 0 && k < consumed.length) consumed[k] = 1;
    }
  }

  private readPartials(frame: SpectrumFrame, pitch: number): PartialReading[] {
    const { db, sampleRate } = frame;
    const o = this.options;
    const binHz = sampleRate / (db.length * 2);
    const f0 = pitchToHz(pitch, this.tuning.cents);
    const count = Math.max(1, Math.min(o.maxPartials, Math.floor(o.maxPartialHz / f0)));
    const partials: PartialReading[] = [];
    for (let h = 1; h <= count; h++) {
      const hz = f0 * h;
      const p = this.readPartial(db, binHz, hz, h);
      const base = this.tuning.partialRiseDb[h - 1];
      // Calibration may lower the bar for partials this keyboard plays weakly, never below 9 dB.
      const normal = base === undefined ? o.hitRiseDb : Math.min(o.hitRiseDb, Math.max(9, base));
      const loud = p.peakDb >= o.minAbsDb;
      partials.push({
        hz,
        bin: p.bin,
        riseDb: p.riseDb,
        prominenceDb: p.prominenceDb,
        offsetCents: p.offsetCents,
        present: loud && p.riseDb >= normal && p.prominenceDb >= o.prominenceDb,
        strict: loud && p.riseDb >= o.wrongRiseDb && p.prominenceDb >= o.wrongProminenceDb,
        loose: loud && p.riseDb >= normal && p.prominenceDb >= 0,
        looseStrict: loud && p.riseDb >= o.wrongRiseDb && p.prominenceDb >= 0,
      });
    }
    return partials;
  }

  private readPartial(
    db: Float32Array,
    binHz: number,
    hz: number,
    h: number,
  ): { bin: number; riseDb: number; peakDb: number; prominenceDb: number; offsetCents: number } {
    const floor = this.floor;
    const tol = this.options.centsTolerance + 2 * h; // partials of a real string are slightly sharp
    const lo = Math.max(1, Math.floor((hz * 2 ** (-tol / 1200)) / binHz));
    const hi = Math.min(db.length - 2, Math.ceil((hz * 2 ** (tol / 1200)) / binHz));
    let best = -1;
    let bestDb = MIN_DB;
    for (let k = lo; k <= hi; k++) {
      const v = db[k] ?? MIN_DB;
      if (v > bestDb) {
        bestDb = v;
        best = k;
      }
    }
    if (best < 0 || !floor)
      return { bin: -1, riseDb: -Infinity, peakDb: MIN_DB, prominenceDb: 0, offsetCents: 0 };
    // Parabolic interpolation on the dB values gives the peak position below bin size.
    const a = db[best - 1] ?? bestDb;
    const c = db[best + 1] ?? bestDb;
    const denom = a - 2 * bestDb + c;
    const shift = denom < 0 ? (0.5 * (a - c)) / denom : 0;
    const peakHz = (best + Math.max(-0.5, Math.min(0.5, shift))) * binHz;
    const floorDb = 10 * Math.log10((floor[best] ?? 1e-12) + 1e-12);
    let before = MIN_DB;
    const lagged = this.lagged;
    if (lagged) {
      // The partial may have glided a little since: look at the whole neighbourhood.
      for (let k = Math.max(0, best - 3); k <= Math.min(lagged.length - 1, best + 3); k++) {
        before = Math.max(before, lagged[k] ?? MIN_DB);
      }
    }
    const side = Math.max(
      db[Math.max(0, best - 4)] ?? MIN_DB,
      db[Math.min(db.length - 1, best + 4)] ?? MIN_DB,
    );
    return {
      bin: best,
      prominenceDb: bestDb - side,
      riseDb: lagged
        ? Math.min(bestDb - Math.max(floorDb, MIN_DB), bestDb - before)
        : bestDb - Math.max(floorDb, MIN_DB),
      peakDb: bestDb,
      offsetCents: 1200 * Math.log2(peakHz / hz),
    };
  }

  private decide(readings: Map<number, Reading>, timeS: number): DetectionEvent[] {
    const events: DetectionEvent[] = [];
    const o = this.options;
    for (const [pitch, reading] of readings) {
      const expected = this.expected.has(pitch);
      let kind: 'hit' | 'wrong' | null = null;
      if (expected && reading.present) {
        kind = 'hit';
      } else if (
        !expected &&
        pitch >= o.lowPitch &&
        pitch <= o.highPitch &&
        reading.presentStrict
      ) {
        const near = [-1, 1].some(
          (d) => this.expected.has(pitch + d) && readings.get(pitch + d)?.present,
        );
        if (!near) kind = 'wrong';
      }
      const st = this.pitchState(pitch, timeS);
      if (kind === null) {
        st.satisfiedSinceS = null;
        st.kind = null;
        st.quietSinceS ??= timeS;
        if (timeS - st.quietSinceS >= o.rearmS) st.armed = true;
        continue;
      }
      if (st.kind !== kind) st.satisfiedSinceS = null;
      st.kind = kind;
      st.quietSinceS = null;
      if (st.satisfiedSinceS === null) {
        st.satisfiedSinceS = timeS;
        st.minCents = st.maxCents = reading.meanOffsetCents;
      }
      st.minCents = Math.min(st.minCents, reading.meanOffsetCents);
      st.maxCents = Math.max(st.maxCents, reading.meanOffsetCents);
      // A string holds its pitch; a voice or a siren glides. Gliding sounds are not notes.
      if (st.maxCents - st.minCents > o.maxPitchDriftCents) {
        st.satisfiedSinceS = timeS;
        st.minCents = st.maxCents = reading.meanOffsetCents;
      }
      const persist = kind === 'hit' ? o.hitPersistS : o.wrongPersistS;
      if (st.armed && timeS - st.satisfiedSinceS >= persist) {
        events.push({ kind, pitch, timeS, onsetS: st.satisfiedSinceS });
        st.armed = false;
      }
    }
    return events;
  }

  private pitchState(pitch: number, timeS: number): PitchState {
    let st = this.state.get(pitch);
    if (!st) {
      st = {
        satisfiedSinceS: null,
        quietSinceS: timeS,
        armed: true,
        kind: null,
        minCents: 0,
        maxCents: 0,
      };
      this.state.set(pitch, st);
    }
    return st;
  }
}
