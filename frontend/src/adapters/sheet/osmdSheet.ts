import {
  ColoringModes,
  CursorType,
  FontStyles,
  OpenSheetMusicDisplay,
  type IOSMDOptions,
} from 'opensheetmusicdisplay';
import { LETTERS } from '../../core/notes/names';
import type { NamingStyle } from '../../core/practice/prefs';
import { stepIndexAt, stepStartsFromNotation } from '../../core/sheet/cursor';
import { followScrollTop } from '../../core/sheet/follow';
import { PAPER_COLORS } from '../../render/notePalette';
import { isNoteNameText, withNoteNames } from './noteNamesXml';

/** Reading aids for a beginner; each one can be switched off as reading improves. */
export interface SheetAids {
  /** Noteheads in the colour of their note, like the falling bars and the keys. */
  readonly colors: boolean;
  /** The name of every note under the staff. */
  readonly letters: boolean;
  readonly naming: NamingStyle;
  readonly zoom: number;
}

export const NO_AIDS: SheetAids = { colors: false, letters: false, naming: 'letters', zoom: 1 };

const INK = '#2b241f';
const HIGHLIGHTER = '#f4d248';
const REST_COLOR = '#000000';

/** Options shared by the practice score and the small examples of the reading guide. */
export const SHEET_OPTIONS: IOSMDOptions = {
  backend: 'svg',
  drawTitle: false,
  drawSubtitle: false,
  drawComposer: false,
  drawLyricist: false,
  drawCredits: false,
  drawPartNames: false,
  drawMetronomeMarks: false,
  followCursor: false,
  coloringMode: ColoringModes.CustomColorSet,
  coloringSetCustom: [...LETTERS.map((l) => PAPER_COLORS[l]), REST_COLOR],
};

const FONT_FAMILY = 'Atkinson Hyperlegible Next Variable';
const FONT_WAIT_MS = 1500;

/**
 * The renderer measures text with the font it is told to use, so the app's face must be loaded
 * before a score is laid out; after a short wait it goes ahead with a fallback face.
 */
export async function fontsReady(): Promise<void> {
  if (!('fonts' in document)) return;
  const loading = document.fonts.load(`700 16px "${FONT_FAMILY}"`).then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, FONT_WAIT_MS));
  await Promise.race([loading, timeout]).catch(() => undefined);
}

/** Note names (drawn as lyrics) in the app's face, bold, with room for a chord's stack. */
export function applyEngravingRules(osmd: OpenSheetMusicDisplay): void {
  const rules = osmd.EngravingRules;
  rules.DefaultFontFamily = FONT_FAMILY;
  rules.DefaultFontStyle = FontStyles.Bold;
  rules.LyricsHeight = 1.7;
  rules.VerticalBetweenLyricsDistance = 0.35;
  // No title is drawn, so the music can start near the top of the sheet.
  rules.PageTopMargin = 2;
  rules.PageTopMarginNarrow = 1;
  rules.PageBottomMargin = 2;
}

/** Paints the note names the renderer drew as lyrics in the colour of their note. */
export function colorNoteNames(root: ParentNode, colored: boolean): void {
  for (const text of Array.from(root.querySelectorAll('svg text'))) {
    const letter = isNoteNameText(text.textContent);
    if (!letter) continue;
    text.setAttribute('fill', colored ? PAPER_COLORS[letter] : INK);
    text.setAttribute('font-weight', '700');
  }
}

/**
 * Draws a MusicXML score and moves OpenSheetMusicDisplay's cursor to the note under a given
 * video time. Layout needs a real browser, so this adapter is checked in the e2e tests.
 *
 * The renderer's own "follow cursor" calls `scrollIntoView`, which scrolls every ancestor,
 * the window included: while a song played, the page kept jumping back to the score. Here
 * only `scroller` (the score's own box) is scrolled, and never right after a manual scroll.
 */
export class OsmdSheet {
  private readonly osmd: OpenSheetMusicDisplay;
  private stepStartsS: number[] = [];
  private shown = -1;
  private busy = false;
  private lastUserScrollMs = -Infinity;
  private source = { musicxml: '', tempoBpm: 120, firstMeasureStartS: 0 };
  private aids: SheetAids = NO_AIDS;
  private readonly stopListening: () => void;

  constructor(
    private readonly container: HTMLElement,
    private readonly scroller: HTMLElement | null = null,
  ) {
    this.osmd = new OpenSheetMusicDisplay(container, {
      ...SHEET_OPTIONS,
      autoResize: true,
      // First: the current measure as a highlighter band; second: a line at the current notes.
      cursorsOptions: [
        { type: CursorType.CurrentArea, color: HIGHLIGHTER, alpha: 0.28, follow: false },
        { type: CursorType.ThinLeft, color: INK, alpha: 0.9, follow: false },
      ],
    });
    applyEngravingRules(this.osmd);
    const markUserScroll = () => {
      this.lastUserScrollMs = performance.now();
    };
    const events = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const;
    for (const name of events) scroller?.addEventListener(name, markUserScroll, { passive: true });
    this.stopListening = () => {
      for (const name of events) scroller?.removeEventListener(name, markUserScroll);
    };
  }

  async load(
    musicxml: string,
    tempoBpm: number,
    firstMeasureStartS: number,
    aids: SheetAids = NO_AIDS,
  ): Promise<void> {
    this.source = { musicxml, tempoBpm, firstMeasureStartS };
    this.aids = aids;
    await this.redraw(true);
  }

  /** Applies new reading aids: names need a reload, colours and size only a new drawing. */
  async setAids(aids: SheetAids): Promise<void> {
    const before = this.aids;
    this.aids = aids;
    const reload =
      aids.letters !== before.letters || (aids.letters && aids.naming !== before.naming);
    const redraw = reload || aids.colors !== before.colors || aids.zoom !== before.zoom;
    if (redraw) await this.redraw(reload);
  }

  /** Puts the cursor on the step that sounds at `timeS`; hides it before the first note. */
  seek(timeS: number): void {
    if (this.busy) return;
    const index = stepIndexAt(this.stepStartsS, timeS);
    if (index === this.shown) return;
    const cursors = this.osmd.cursors;
    if (index < 0) {
      for (const cursor of cursors) cursor.hide();
    } else {
      // Moving forward costs one step each; going back restarts from the beginning.
      if (index < this.shown || this.shown < 0) {
        for (const cursor of cursors) cursor.reset();
        this.shown = 0;
      }
      while (this.shown < index) {
        for (const cursor of cursors) cursor.next();
        this.shown += 1;
      }
      for (const cursor of cursors) cursor.show();
      this.follow();
    }
    this.shown = index;
  }

  get stepCount(): number {
    return this.stepStartsS.length;
  }

  clear(): void {
    this.stopListening();
    this.osmd.clear();
    this.stepStartsS = [];
    this.shown = -1;
  }

  private async redraw(reload: boolean): Promise<void> {
    this.busy = true;
    try {
      const { musicxml, tempoBpm, firstMeasureStartS } = this.source;
      await fontsReady();
      if (reload) {
        const xml = this.aids.letters ? withNoteNames(musicxml, this.aids.naming) : musicxml;
        await this.osmd.load(xml);
      }
      this.osmd.setOptions({ coloringEnabled: this.aids.colors });
      this.osmd.zoom = this.aids.zoom;
      this.osmd.render();
      colorNoteNames(this.container, this.aids.colors);
      this.stepStartsS = stepStartsFromNotation(this.collectSteps(), tempoBpm, firstMeasureStartS);
      this.shown = -1;
    } finally {
      this.busy = false;
    }
  }

  /** Scrolls the score box (never the page) so the current line stays readable. */
  private follow(): void {
    const box = this.scroller;
    // Undefined until the renderer has drawn the cursor once, whatever its types say.
    const line: HTMLElement | undefined = this.osmd.cursors[1]?.cursorElement;
    // A hidden score (falling-notes view) keeps its cursor in place but scrolls nothing.
    if (!box || !line || box.clientHeight === 0) return;
    const boxRect = box.getBoundingClientRect();
    const lineRect = line.getBoundingClientRect();
    const top = lineRect.top - boxRect.top + box.scrollTop;
    const target = followScrollTop({
      lineTop: top,
      lineBottom: top + lineRect.height,
      scrollTop: box.scrollTop,
      viewHeight: box.clientHeight,
      sinceUserScrollMs: performance.now() - this.lastUserScrollMs,
    });
    if (target !== null) box.scrollTo({ top: target, behavior: 'smooth' });
  }

  /** One pass over the whole piece to learn where every cursor step sits in whole notes. */
  private collectSteps(): number[] {
    const cursor = this.osmd.cursor;
    cursor.reset();
    const steps: number[] = [];
    while (!cursor.Iterator.EndReached) {
      steps.push(cursor.Iterator.currentTimeStamp.RealValue);
      cursor.next();
    }
    for (const each of this.osmd.cursors) {
      each.reset();
      each.hide();
    }
    return steps;
  }
}
