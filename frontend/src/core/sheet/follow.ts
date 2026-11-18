/**
 * Keeps the score's current line readable inside its own scroll box, like a page turner:
 * the line under the cursor sits near the top so the next lines are visible below it.
 * Only the score box scrolls; the page never moves (the renderer's own follow scrolled the
 * whole window and pulled the player away from the falling notes).
 */
export interface FollowInput {
  /** Top and bottom of the cursor's line, in the scroll box's content coordinates (px). */
  readonly lineTop: number;
  readonly lineBottom: number;
  /** Current scroll position and visible height of the box (px). */
  readonly scrollTop: number;
  readonly viewHeight: number;
  /** Milliseconds since the player last scrolled the score by hand. */
  readonly sinceUserScrollMs: number;
}

/** After a manual scroll the score stays where the player left it for this long. */
export const FOLLOW_PAUSE_MS = 4000;
/** Where the current line is placed, as a share of the box height from its top. */
const LINE_POSITION = 0.12;
/** The line may drift down to this share of the box before the score turns the page. */
const TURN_AT = 0.55;

/** The scroll position to move to, or null to leave the score where it is. */
export function followScrollTop(input: FollowInput): number | null {
  if (input.sinceUserScrollMs < FOLLOW_PAUSE_MS) return null;
  const { lineTop, lineBottom, scrollTop, viewHeight } = input;
  const visible = lineTop >= scrollTop && lineBottom <= scrollTop + viewHeight;
  const highEnough = lineTop <= scrollTop + viewHeight * TURN_AT;
  if (visible && highEnough) return null;
  const target = Math.max(0, Math.round(lineTop - viewHeight * LINE_POSITION));
  return target === Math.round(scrollTop) ? null : target;
}
