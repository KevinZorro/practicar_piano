import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { NamingStyle } from '../../core/practice/prefs';
import { withNoteNames } from './noteNamesXml';
import { applyEngravingRules, colorNoteNames, fontsReady, SHEET_OPTIONS } from './osmdSheet';

export interface SnippetOptions {
  readonly naming: NamingStyle;
  readonly showTime: boolean;
  readonly zoom: number;
}

/**
 * Draws a small example of the reading guide exactly like the practice score: coloured noteheads
 * and the name of every note under it. Returns a function that removes the drawing.
 */
export async function drawSnippet(
  container: HTMLElement,
  musicxml: string,
  options: SnippetOptions,
): Promise<() => void> {
  const osmd = new OpenSheetMusicDisplay(container, {
    ...SHEET_OPTIONS,
    autoResize: false,
    coloringEnabled: true,
    drawMeasureNumbers: false,
    drawTimeSignatures: options.showTime,
    // The rests example must show each rest, not one "2 bars of rest" sign.
    autoGenerateMultipleRestMeasuresFromRestMeasures: false,
  });
  applyEngravingRules(osmd);
  await fontsReady();
  await osmd.load(withNoteNames(musicxml, options.naming));
  osmd.zoom = options.zoom;
  osmd.render();
  colorNoteNames(container, true);
  return () => {
    osmd.clear();
  };
}
