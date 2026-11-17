import { expect, test } from '@playwright/test';

const queued = {
  job_id: 'abc',
  status: 'queued',
  duration_s: 200,
  position: 1,
  estimated_wait_s: 420,
};

test('a pending job survives reloading the page and finishes', async ({ page }) => {
  let status: 'queued' | 'done' = 'queued';
  await page.route('**/api/v1/jobs', (route) => route.fulfill({ status: 202, json: queued }));
  await page.route('**/api/v1/jobs/abc', (route) =>
    route.fulfill({ json: { ...queued, status, position: status === 'done' ? null : 1 } }),
  );

  await page.goto('/');
  await page.getByLabel('Enlace de YouTube').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Procesar canción' }).click();
  await expect(page.getByText(/posición 1/)).toBeVisible();

  status = 'done';
  await page.reload();
  await expect(page.getByText('¡Lista!')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Practicar' })).toBeVisible();
});

test('shows a clear message when the queue is full', async ({ page }) => {
  await page.route('**/api/v1/jobs', (route) =>
    route.fulfill({
      status: 503,
      headers: { 'retry-after': '300' },
      json: { error: { code: 'queue_full', message: 'full' } },
    }),
  );
  await page.goto('/');
  await page.getByLabel('Enlace de YouTube').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Procesar canción' }).click();
  await expect(page.getByRole('alert')).toContainText('cola está llena');
});
