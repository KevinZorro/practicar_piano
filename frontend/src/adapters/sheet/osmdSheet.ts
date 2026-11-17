import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
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
    const cursor = this.osmd.cursor;
    if (index < 0) {
      cursor.hide();
    } else {
      // Moving forward costs one step each; going back restarts from the beginning.
      if (index < this.shown || this.shown < 0) {
        cursor.reset();
        this.shown = 0;
      }
      while (this.shown < index) {
        cursor.next();
        this.shown += 1;
      }
      cursor.show();
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
    cursor.reset();
    cursor.hide();
    return steps;
  }
}
