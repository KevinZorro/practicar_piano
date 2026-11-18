import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const ORIGIN = 'https://teclario.duckdns.org';

describe('search engine basics', () => {
  const html = read('index.html');

  it('has a title, description and canonical URL on the real domain', () => {
    expect(html).toMatch(/<title>[^<]{20,70}<\/title>/);
    expect(html).toMatch(/<meta\s+name="description"\s+content="[^"]{80,170}"/);
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/" />`);
    expect(html).not.toMatch(/noindex/i);
  });

  it('has Open Graph tags with an image that exists', () => {
    for (const tag of ['og:title', 'og:description', 'og:url', 'og:image']) {
      expect(html).toContain(`property="${tag}"`);
    }
    expect(read('public/og-image.png').length).toBeGreaterThan(1000);
  });

  it('has valid structured data', () => {
    const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    expect(match).not.toBeNull();
    const data = JSON.parse(match?.[1] ?? '') as { '@type': string; url: string };
    expect(data['@type']).toBe('WebApplication');
    expect(data.url).toBe(`${ORIGIN}/`);
  });

  it('ships crawlable content inside the root element', () => {
    expect(html).toMatch(/<div id="root">[\s\S]*<h1>Teclario<\/h1>[\s\S]*<\/div>/);
  });

  it('lists the pages in robots.txt and the sitemap, and blocks the API', () => {
    const robots = read('public/robots.txt');
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(robots).toContain('Disallow: /api/');
    const sitemap = read('public/sitemap.xml');
    expect(sitemap).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(sitemap).toContain(`<loc>${ORIGIN}/terminos.html</loc>`);
  });
});
