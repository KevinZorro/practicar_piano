import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// A synthetic exercise built by the real backend pipeline, not a song.
const result: unknown = JSON.parse(readFileSync('e2e/fixtures/result.json', 'utf-8'));

const done = { job_id: 'abc', status: 'done', duration_s: 14, position: null };

async function openPractice(page: Page): Promise<void> {
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
  await page.getByRole('button', { name: 'Practicar' }).first().click();
  await expect(page.getByRole('region', { name: 'Práctica' })).toBeVisible();
}

const cursorLeft = (page: Page) =>
  page.locator('img[id^="cursorImg"]').evaluate((el) => parseFloat((el as HTMLElement).style.left));

test('the score cursor follows playback and the song is kept in the library', async ({ page }) => {
  await openPractice(page);
  await expect(page.locator('.sheet svg')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Reproducir' }).click();
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
  await expect(page.locator('img[id^="cursorImg"]')).toBeVisible();
  const first = await cursorLeft(page);
  await expect.poll(() => cursorLeft(page), { timeout: 8_000 }).toBeGreaterThan(first);

  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByRole('region', { name: 'Mi biblioteca' })).toBeVisible();
});

test('level and speed can be changed while practicing', async ({ page }) => {
  await openPractice(page);
  await page.getByLabel('Fácil').check();
  await expect(page.getByLabel('Fácil')).toBeChecked();
  await page.getByLabel('50 %').check();
  await expect(page.getByLabel('50 %')).toBeChecked();
  await page.getByLabel('Velocidad libre').fill('125');
  await expect(page.getByLabel('Velocidad libre')).toHaveValue('125');
  await expect(page.getByLabel('50 %')).not.toBeChecked();
});

test('wait mode stops the song until the right key arrives from the keyboard', async ({ page }) => {
  // A fake Web MIDI keyboard the test can press from the page.
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
  await openPractice(page);
  const press = (pitch: number) =>
    page.evaluate((p) => {
      (window as unknown as { press: (n: number) => void }).press(p);
    }, pitch);
  const progress = page.getByLabel('Progreso del modo espera');

  await page.getByLabel('Modo espera').check();
  await page.getByRole('button', { name: 'Conectar teclado' }).click();
  await expect(page.getByText('Teclado conectado.')).toBeVisible();
  await page.getByRole('button', { name: 'Reproducir' }).click();

  // The first chord is at t=0 (C3, G3 and C4): the song waits for all three.
  await expect(progress).toContainText('Toca las notas indicadas');
  await press(48);
  await press(55);
  await expect(progress).toContainText('Toca las notas indicadas');
  await press(60);
  await expect(progress).toContainText('Acordes acertados: 1');

  // A wrong key while waiting for D4 counts as a mistake and rewinds.
  await expect(progress).toContainText('Toca las notas indicadas');
  await press(100);
  await expect(progress).toContainText('Fallos: 1');
});

test('the video is shown and follows play and pause', async ({ page }) => {
  // The real IFrame API needs the network: a fake one records what the app asks of it.
  await page.route('https://www.youtube.com/iframe_api', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        window.calls = [];
        window.YT = { Player: class {
          constructor(el, o) {
            el.setAttribute('data-video', o.videoId);
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
  await openPractice(page);
  await expect(page.getByRole('region', { name: 'Vídeo' })).toBeVisible();
  await expect(page.locator('[data-video="dQw4w9WgXcQ"]')).toHaveCount(1);
  // With the video the song's own sound plays, so the synth starts off.
  await expect(page.getByLabel('Sonido')).not.toBeChecked();

  await page.getByRole('button', { name: 'Reproducir' }).click();
  await page.getByRole('button', { name: 'Pausar' }).click();
  const calls = await page.evaluate(() => (window as unknown as { calls: string[] }).calls);
  expect(calls).toEqual(expect.arrayContaining(['play', 'pause']));
});

test('a finished run played on the keyboard is kept as progress in the library', async ({
  page,
}) => {
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
  await openPractice(page);
  await page.getByLabel('Velocidad libre').fill('150');
  await page.getByRole('button', { name: 'Conectar teclado' }).click();
  await expect(page.getByText('Teclado conectado.')).toBeVisible();
  await page.getByRole('button', { name: 'Reproducir' }).click();
  await page.evaluate(() => {
    (window as unknown as { press: (n: number) => void }).press(60);
  });
  // The 14 s exercise ends by itself (about 10 s at 150 %).
  await expect(page.getByRole('button', { name: 'Reproducir' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByText(/Jugable: 1 intento, mejor \d+ %/)).toBeVisible();
});
