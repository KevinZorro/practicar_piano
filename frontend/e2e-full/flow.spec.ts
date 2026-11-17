import { expect, test } from '@playwright/test';

// What the offline server plays instead of YouTube: "Ode to Joy" (public domain), 15 notes.
const ODE_TO_JOY = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62];

test('paste a link, close and reopen, practice with the keyboard and keep the song', async ({
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

  // 1. Paste the link: the job enters the queue.
  await page.goto('/');
  await page.getByLabel('Enlace de YouTube').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Procesar canción' }).click();
  await expect(page.getByRole('list', { name: 'Tus canciones' })).toBeVisible();

  // 2. Close and reopen the page while it is processing: the job is remembered.
  await page.reload();
  await expect(page.getByRole('list', { name: 'Tus canciones' }).getByRole('listitem')).toHaveCount(
    1,
  );

  // 3. The real pipeline finishes (download stand-in, Basic Pitch, quantization, score).
  await expect(page.getByText('¡Lista!')).toBeVisible({ timeout: 150_000 });

  // 4. Practice in wait mode, playing every note of the song with the simulated keyboard.
  await page.getByRole('button', { name: 'Practicar' }).first().click();
  await expect(page.getByRole('region', { name: 'Práctica' })).toBeVisible();
  await expect(page.locator('.sheet svg')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Modo espera').check();
  await page.getByRole('button', { name: 'Conectar teclado' }).click();
  await expect(page.getByText('Teclado conectado.')).toBeVisible();
  await page.getByRole('button', { name: 'Reproducir' }).click();

  const progress = page.getByLabel('Progreso del modo espera');
  for (const [index, pitch] of ODE_TO_JOY.entries()) {
    await expect(progress).toHaveText(
      new RegExp(`Toca las notas indicadas.*Acordes acertados: ${String(index)} `),
    );
    await page.evaluate((p) => {
      (window as unknown as { press: (n: number) => void }).press(p);
    }, pitch);
  }
  await expect(progress).toContainText('¡Terminaste!');
  await expect(progress).toContainText('Fallos: 0');

  // 5. The song and the attempt are kept in the library.
  await page.getByRole('button', { name: 'Volver' }).click();
  const library = page.getByRole('region', { name: 'Mi biblioteca' });
  await expect(library).toBeVisible();
  await expect(library).toContainText('Jugable: 1 intento, mejor 100 %');

  // 6. After a reload the song is still there (IndexedDB), with no job left to follow.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Mi biblioteca' })).toContainText(
    'Jugable: 1 intento',
  );
});
