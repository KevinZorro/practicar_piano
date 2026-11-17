import { extractVideoId } from './videoId';

describe('extractVideoId', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?t=10',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    '  https://m.youtube.com/watch?v=dQw4w9WgXcQ  ',
  ])('finds the id in %s', (link) => {
    expect(extractVideoId(link)).toBe('dQw4w9WgXcQ');
  });

  it.each([
    'not a link',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/playlist?list=abc',
    'https://youtu.be/',
  ])('returns null for %s', (link) => {
    expect(extractVideoId(link)).toBeNull();
  });
});
