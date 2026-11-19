import { expect, test, type Page } from '@playwright/test';
import {
  clickVideo,
  fakeKeyboard,
  fakeYouTube,
  openPractice,
  pressKey,
  videoCalls,
} from './support';

const cursorLeft = (page: Page) =>
  page
    .locator('img[id^="cursorImg"]')
    .last()
    .evaluate((el) => parseFloat((el as HTMLElement).style.left));

test('the score cursor follows playback and the song is kept in the library', async ({ page }) => {
  await openPractice(page);
  await expect(page.locator('.sheet svg')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Reproducir' }).click();
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
  await expect(page.locator('img[id^="cursorImg"]').last()).toBeVisible();
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

test('the timeline jumps to any moment of the song', async ({ page }) => {
  await openPractice(page);
  // The exercise has 2 s bars at 120 BPM: 6 s is where bar 4 starts.
  await page.getByLabel('Posición en la canción').fill('6');
  await expect(page.locator('.timeline-now')).toHaveText('0:06');
  await expect(page.locator('.transport-measure')).toContainText('Compás 4 de');
  await expect(page.getByLabel('Posición en la canción')).toHaveAttribute(
    'aria-valuetext',
    '0:06 de 0:14',
  );
});

test('wait mode stops the song until the right key arrives from the keyboard', async ({ page }) => {
  await fakeKeyboard(page);
  await openPractice(page);
  const progress = page.getByLabel('Progreso del modo espera');

  await page.getByLabel('Modo espera').check();
  await page.getByRole('button', { name: 'Conectar teclado' }).click();
  await expect(page.getByText('Teclado conectado.')).toBeVisible();
  await page.getByRole('button', { name: 'Reproducir' }).click();

  // The first chord is at t=0 (C3, G3 and C4): the song waits for all three, shown as chips.
  await expect(progress).toContainText('Toca las notas indicadas');
  const chips = progress.locator('.chip');
  await expect(chips).toHaveText(['C', 'G', 'C']);
  await pressKey(page, 48);
  await pressKey(page, 55);
  await expect(chips.first()).toHaveAttribute('data-done', 'true');
  await expect(progress).toContainText('Toca las notas indicadas');
  await pressKey(page, 60);
  await expect(progress).toContainText('Acordes acertados: 1');

  // A wrong key while waiting for D4 counts as a mistake and rewinds.
  await expect(progress).toContainText('Toca las notas indicadas');
  await pressKey(page, 100);
  await expect(progress).toContainText('Fallos: 1');
});

test('the video is shown and follows play and pause', async ({ page }) => {
  await fakeYouTube(page);
  await openPractice(page);
  await expect(page.getByRole('region', { name: 'Vídeo' })).toBeVisible();
  await expect(page.locator('[data-video="dQw4w9WgXcQ"]')).toHaveCount(1);
  // With the video the song's own sound plays, so the synth starts off.
  await expect(page.getByLabel('Sonido')).not.toBeChecked();

  await page.getByRole('button', { name: 'Reproducir' }).click();
  await page.getByRole('button', { name: 'Pausar' }).click();
  expect(await videoCalls(page)).toEqual(expect.arrayContaining(['play', 'pause']));
});

test('hiding the video keeps the practice on screen with the app piano', async ({ page }) => {
  await fakeYouTube(page);
  await openPractice(page);
  const video = page.getByRole('region', { name: 'Vídeo' });
  await expect(video).toBeVisible();

  await page.getByLabel('Mostrar el video').uncheck();
  await expect(video).toBeHidden();
  await expect(page.getByLabel('Sonido')).toBeChecked();
  await expect(page.getByRole('region', { name: 'Práctica' })).toBeVisible();
  await page.getByRole('button', { name: 'Reproducir' }).click();
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
  expect(await videoCalls(page)).not.toContain('play');
  await page.getByRole('button', { name: 'Pausar' }).click();

  await page.getByLabel('Mostrar el video').check();
  await expect(video).toBeVisible();
  await expect(page.getByLabel('Sonido')).not.toBeChecked();
});

test('a click on the video itself starts and stops the practice', async ({ page }) => {
  await fakeYouTube(page);
  await openPractice(page);
  await expect(page.locator('[data-video="dQw4w9WgXcQ"]')).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Vídeo' })).toBeVisible();

  await clickVideo(page, 1); // YT.PlayerState.PLAYING, not asked for by the app
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
  await clickVideo(page, 2); // PAUSED
  await expect(page.getByRole('button', { name: 'Reproducir' })).toBeVisible();
});

test('playing never scrolls the page away from where the player is looking', async ({ page }) => {
  await openPractice(page);
  await expect(page.locator('.sheet svg')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.getByRole('button', { name: 'Reproducir' }).click();
  // The cursor moves through several notes in this time; the page must not follow it.
  await page.waitForTimeout(2_500);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('a finished run played on the keyboard is kept as progress in the library', async ({
  page,
}) => {
  await fakeKeyboard(page);
  await openPractice(page);
  await page.getByLabel('Velocidad libre').fill('150');
  await page.getByRole('button', { name: 'Conectar teclado' }).click();
  await expect(page.getByText('Teclado conectado.')).toBeVisible();
  await page.getByRole('button', { name: 'Reproducir' }).click();
  await pressKey(page, 60);
  // The 14 s exercise ends by itself (about 10 s at 150 %).
  await expect(page.getByRole('button', { name: 'Reproducir' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByText(/Jugable: 1 intento, mejor \d+ %/)).toBeVisible();
});

test('automatic rewind goes back the chosen seconds on a wrong key, without waiting', async ({
  page,
}) => {
  await fakeKeyboard(page);
  await openPractice(page);
  const progress = page.getByLabel('Progreso del retroceso automático');

  await page.getByLabel('Retroceso automático').check();
  // The two practice modes exclude each other.
  await expect(page.getByLabel('Modo espera')).not.toBeChecked();
  await page.getByLabel('Segundos que retrocede').fill('2');
  await expect(page.getByText('2 s', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Conectar teclado' }).click();
  await expect(page.getByText('Teclado conectado.')).toBeVisible();
  await page.getByRole('button', { name: 'Reproducir' }).click();

  // The song keeps going on its own: it is past the first seconds without any key.
  await expect(page.locator('.timeline-now')).not.toHaveText('0:00');
  await expect(page.locator('.timeline-now')).toHaveText(/0:0[3-9]/, { timeout: 8_000 });
  await pressKey(page, 100); // no such note in the song
  await expect(progress).toContainText('Fallos: 1');
  await expect(progress).toContainText('Retrocesos: 1');
  await expect(page.locator('.timeline-now')).toHaveText(/0:0[0-3]/);
});
