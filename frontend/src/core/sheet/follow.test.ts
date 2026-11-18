import { FOLLOW_PAUSE_MS, followScrollTop, type FollowInput } from './follow';

const base: FollowInput = {
  lineTop: 40,
  lineBottom: 200,
  scrollTop: 0,
  viewHeight: 600,
  sinceUserScrollMs: Infinity,
};

describe('followScrollTop', () => {
  it('leaves the score alone while the current line is visible and high enough', () => {
    expect(followScrollTop(base)).toBeNull();
  });

  it('turns the page when the line moves below the middle of the box', () => {
    const next = followScrollTop({ ...base, lineTop: 420, lineBottom: 580 });
    expect(next).toBe(420 - 72); // the line lands at 12 % of the box height
  });

  it('brings back a line that went above the visible area', () => {
    expect(followScrollTop({ ...base, scrollTop: 900, lineTop: 300, lineBottom: 460 })).toBe(228);
  });

  it('never asks for a negative scroll', () => {
    expect(followScrollTop({ ...base, scrollTop: 500, lineTop: 20, lineBottom: 180 })).toBe(0);
  });

  it('waits after the player scrolled by hand', () => {
    const far = { ...base, lineTop: 2000, lineBottom: 2160 };
    expect(followScrollTop({ ...far, sinceUserScrollMs: FOLLOW_PAUSE_MS - 1 })).toBeNull();
    expect(followScrollTop({ ...far, sinceUserScrollMs: FOLLOW_PAUSE_MS })).toBe(1928);
  });

  it('does not repeat a scroll it already made, even for a line taller than the box', () => {
    expect(followScrollTop({ ...base, scrollTop: 348, lineTop: 420, lineBottom: 1100 })).toBeNull();
  });
});
