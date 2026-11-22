import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

// A synthetic exercise built by the real backend pipeline, not a song.
const result: unknown = JSON.parse(readFileSync('e2e/fixtures/result.json', 'utf-8'));

const done = { job_id: 'abc', status: 'done', duration_s: 14, position: null };

const YOUTUBE_API = 'https://www.youtube.com/iframe_api';
// Pages given the fake YouTube player; every other page never reaches the real one.
const fakedYouTube = new WeakSet<Page>();

/** Sends a link to a backend that has already finished it, and opens the song to practise. */
export async function openPractice(page: Page): Promise<void> {
  // Where the network allows it (CI), the real embed would set the clock by a video that may
  // never start; without the fake, the embed fails and the app counts the time itself.
  await page.route(YOUTUBE_API, (route) =>
    fakedYouTube.has(page) ? route.fallback() : route.abort(),
  );
  await page.route('**/api/v1/jobs', (route) => route.fulfill({ status: 202, json: done }));
  await page.route('**/api/v1/jobs/abc', (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 204 })
      : route.fulfill({ json: done }),
  );
  await page.route('**/api/v1/jobs/abc/result', (route) => route.fulfill({ json: result }));
  await page.goto('/');
  await page.getByLabel('Enlace de YouTube').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Procesar canción' }).click();
  await page.getByRole('button', { name: 'Practicar' }).last().click();
  await expect(page.getByRole('region', { name: 'Práctica' })).toBeVisible();
}

/** A fake Web MIDI keyboard; `pressKey` plays one of its keys. Call before opening the page. */
export async function fakeKeyboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const port = {
      id: 'k',
      name: 'Test keyboard',
      state: 'connected',
      onmidimessage: null as unknown,
    };
    const access = { inputs: new Map([['k', port]]), onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: () => Promise.resolve(access) });
    (window as unknown as { press: (pitch: number) => void }).press = (pitch) => {
      (port.onmidimessage as (e: { data: Uint8Array }) => void)({
        data: new Uint8Array([0x90, pitch, 90]),
      });
    };
  });
}

export const pressKey = (page: Page, pitch: number) =>
  page.evaluate((p) => {
    (window as unknown as { press: (n: number) => void }).press(p);
  }, pitch);

// The real IFrame API needs the network: a fake one records what the app asks of it and lets
// the test click the video itself (`ytEmit` sends a YT.PlayerState to the app).
export async function fakeYouTube(page: Page): Promise<void> {
  fakedYouTube.add(page);
  await page.route(YOUTUBE_API, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.calls = [];
        window.YT = { Player: class {
          constructor(el, o) {
            el.setAttribute('data-video', o.videoId);
            const frame = document.createElement('iframe');
            frame.srcdoc = '<body style="margin:0;height:100vh"></body>';
            el.appendChild(frame);
            window.ytEmit = (state) => o.events.onStateChange && o.events.onStateChange({ data: state });
            setTimeout(() => o.events.onReady(), 0);
          }
          getCurrentTime() { return 0; }
          playVideo() { window.calls.push('play'); }
          pauseVideo() { window.calls.push('pause'); }
          seekTo() {}
          setPlaybackRate() {}
        } };
        window.onYouTubeIframeAPIReady();`,
    }),
  );
}

/** What the app has asked of the fake video player so far. */
export const videoCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { calls: string[] }).calls);

export const clickVideo = (page: Page, state: number) =>
  page.evaluate((s) => {
    (window as unknown as { ytEmit: (n: number) => void }).ytEmit(s);
  }, state);
