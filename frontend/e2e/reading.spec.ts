import { expect, test } from '@playwright/test';
import { openPractice } from './support';

test('the chosen view is kept for the next visit', async ({ page }) => {
  await openPractice(page);
  const stage = page.locator('.stage');
  await expect(stage).toHaveAttribute('data-view', 'both');

  await page.getByRole('radio', { name: 'Notas', exact: true }).check();
  await expect(stage).toHaveAttribute('data-view', 'falling');
  await expect(page.locator('.stage-sheet')).toBeHidden();
  await expect(page.getByRole('img', { name: 'Notas que caen' })).toBeVisible();

  await page.reload();
  await page
    .getByRole('region', { name: 'Mi biblioteca' })
    .getByRole('button', { name: 'Practicar' })
    .click();
  await expect(page.getByRole('radio', { name: 'Notas', exact: true })).toBeChecked();
  await expect(stage).toHaveAttribute('data-view', 'falling');

  await page.getByRole('radio', { name: 'Partitura', exact: true }).check();
  await expect(page.locator('.sheet svg')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('img', { name: 'Teclado' })).toBeVisible();
});

test('the score writes the name of every note, in letters or in solfège', async ({ page }) => {
  await openPractice(page);
  await expect(page.locator('.sheet svg')).toBeVisible({ timeout: 20_000 });
  const names = page.locator('.sheet svg text');
  await expect(names.filter({ hasText: /^C$/ }).first()).toBeVisible();

  await page.getByRole('radio', { name: 'Do Re Mi' }).check();
  await expect(names.filter({ hasText: /^Do$/ }).first()).toBeVisible();
  await expect(names.filter({ hasText: /^C$/ })).toHaveCount(0);

  await page.getByLabel('Nombre de cada nota').uncheck();
  await expect(names.filter({ hasText: /^Do$/ })).toHaveCount(0);
});

test('the reading guide draws its examples and closes with Escape', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Guía de lectura' });
  await opener.click();
  const guide = page.getByRole('dialog', { name: 'Guía de lectura' });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole('button', { name: 'Cerrar la guía' })).toBeFocused();
  await expect(guide.getByRole('img', { name: /C central marcado/ })).toBeVisible();
  await expect(guide.locator('.snippet svg').first()).toBeVisible({ timeout: 20_000 });

  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await expect(opener).toBeFocused();
});
