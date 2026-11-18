import { CursorType, OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { stepIndexAt, stepStartsFromNotation } from '../../core/sheet/cursor';

/**
 * Draws a MusicXML score and moves OpenSheetMusicDisplay's cursor to the note under a given
 * video time. Layout needs a real browser, so this adapter is checked in the e2e tests.
 */
export class OsmdSheet {
  private readonly osmd: OpenSheetMusicDisplay;
  private stepStartsS: number[] = [];
  private shown = -1;

  constructor(container: HTMLElement) {
    this.osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: 'svg',
      drawTitle: false,
      followCursor: true,
      // First: the current measure as a soft band; second: a bright line at the current notes.
      cursorsOptions: [
        { type: CursorType.CurrentArea, color: '#7c5cff', alpha: 0.16, follow: true },
        { type: CursorType.ThinLeft, color: '#f72585', alpha: 1, follow: true },
      ],
    });
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
    }
    this.shown = index;
  }

  get stepCount(): number {
    return this.stepStartsS.length;
  }

  clear(): void {
    this.osmd.clear();
    this.stepStartsS = [];
    this.shown = -1;
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
