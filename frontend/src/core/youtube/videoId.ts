const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);

/**
 * Extracts the video id from a YouTube link, or null. Only the id is kept, in this browser:
 * the link itself is never stored.
 */
export function extractVideoId(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  let candidate: string | null = null;
  if (url.hostname === 'youtu.be') {
    candidate = url.pathname.split('/')[1] ?? null;
  } else if (HOSTS.has(url.hostname)) {
    const [, kind, id] = url.pathname.split('/');
    if (url.pathname === '/watch') candidate = url.searchParams.get('v');
    else if (kind === 'shorts' || kind === 'embed' || kind === 'live') candidate = id ?? null;
  }
  return candidate !== null && ID.test(candidate) ? candidate : null;
}
