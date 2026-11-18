import { CursorType, OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { stepIndexAt, stepStartsFromNotation } from '../../core/sheet/cursor';
import { followScrollTop } from '../../core/sheet/follow';

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
  private lastUserScrollMs = -Infinity;
  private readonly stopListening: () => void;

  constructor(
    container: HTMLElement,
    private readonly scroller: HTMLElement | null = null,
  ) {
    this.osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: 'svg',
      drawTitle: false,
      followCursor: false,
      // First: the current measure as a soft band; second: a bright line at the current notes.
      cursorsOptions: [
        { type: CursorType.CurrentArea, color: '#7c5cff', alpha: 0.16, follow: false },
        { type: CursorType.ThinLeft, color: '#f72585', alpha: 1, follow: false },
      ],
    });
    const markUserScroll = () => {
      this.lastUserScrollMs = performance.now();
    };
    const events = ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const;
    for (const name of events) scroller?.addEventListener(name, markUserScroll, { passive: true });
    this.stopListening = () => {
      for (const name of events) scroller?.removeEventListener(name, markUserScroll);
    };
  }

  async load(musicxml: string, tempoBpm: number, firstMeasureStartS: number): Promise<void> {
    await this.osmd.load(musicxml);
    this.osmd.render();
    this.stepStartsS = stepStartsFromNotation(this.collectSteps(), tempoBpm, firstMeasureStartS);
    this.shown = -1;
  }

  /** Puts the cursor on the step that sounds at `timeS`; hides it before the first note. */
  seek(timeS: number): void {
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

  /** Scrolls the score box (never the page) so the current line stays readable. */
  private follow(): void {
    const box = this.scroller;
    // Undefined until the renderer has drawn the cursor once, whatever its types say.
    const line: HTMLElement | undefined = this.osmd.cursors[1]?.cursorElement;
    if (!box || !line) return;
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
