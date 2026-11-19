import { expect, test } from '@playwright/test';
import { openPractice } from './support';

test('a saved song can be renamed and deleted, and both last after a reload', async ({ page }) => {
  await openPractice(page);
  await page.getByRole('button', { name: 'Volver' }).click();
  const library = page.getByRole('region', { name: 'Mi biblioteca' });

  await library.getByRole('button', { name: /^Renombrar/ }).click();
  const field = library.getByRole('textbox', { name: 'Nombre de la canción' });
  await field.fill('Oda a la alegría');
  await field.press('Enter');
  await expect(library.getByRole('heading', { name: 'Oda a la alegría' })).toBeVisible();

  await page.reload();
  await expect(library.getByRole('heading', { name: 'Oda a la alegría' })).toBeVisible();
  await library.getByRole('button', { name: 'Borrar «Oda a la alegría»' }).click();
  await library.getByRole('button', { name: 'Sí, borrar' }).click();
  await expect(library).toBeHidden();

  await page.reload();
  await expect(page.getByRole('region', { name: 'Mi biblioteca' })).toBeHidden();
});
