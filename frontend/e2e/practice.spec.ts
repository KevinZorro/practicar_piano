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
