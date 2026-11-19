import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LibrarySong } from '../core/library/library';
import { LibraryList } from './LibraryList';

function song(overrides: Partial<LibrarySong> = {}): LibrarySong {
  return {
    id: 's1',
    title: 'Primera',
    savedAt: Date.UTC(2026, 10, 18, 12),
    result: {
      meta: { duration_s: 125, tempo_bpm: 120, tempo_confidence: 'high' },
      levels: [
        {
          name: 'playable',
          max_polyphony_before: 2,
          max_polyphony_after: 2,
          notes_dropped_ratio: 0,
          notes: [
            { pitch: 60, start_s: 0, end_s: 0.5, velocity: 80 },
            { pitch: 64, start_s: 0.5, end_s: 1, velocity: 80 },
            { pitch: 67, start_s: 1, end_s: 2, velocity: 80 },
          ],
        },
      ],
    },
    progress: {},
    ...overrides,
  };
}

function setup(songs: LibrarySong[]) {
  const handlers = { onPractice: vi.fn(), onRename: vi.fn(), onRemove: vi.fn() };
  const view = render(<LibraryList songs={songs} {...handlers} />);
  return { ...handlers, view, user: userEvent.setup() };
}

describe('LibraryList', () => {
  it('lists the newest song first, with its length, progress and a miniature of its opening', () => {
    const older = song({ id: 'old', title: 'Antigua', savedAt: 1 });
    const practised = song({
      id: 'new',
      title: 'Nueva',
      progress: {
        playable: { plays: 1, bestAccuracy: 0.8, bestSpeed: 0, mastered: false },
      },
    });
    const { view } = setup([older, practised]);

    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(['Nueva', 'Antigua']);
    const [first, second] = screen.getAllByRole('listitem');
    expect(first).toHaveTextContent('2:05');
    expect(first).toHaveTextContent(/1 intento, mejor 80 %/);
    expect(second).toHaveTextContent('Aún sin practicar');
    expect(view.container.querySelectorAll('.song-print rect')).toHaveLength(6);
  });

  it('opens a song to practise', async () => {
    const target = song();
    const { user, onPractice } = setup([target]);
    await user.click(screen.getByRole('button', { name: 'Practicar' }));
    expect(onPractice).toHaveBeenCalledWith(target);
  });

  it('renames a song, ignoring an empty or unchanged name', async () => {
    const target = song();
    const { user, onRename } = setup([target]);

    await user.click(screen.getByRole('button', { name: 'Renombrar «Primera»' }));
    const field = screen.getByRole('textbox', { name: 'Nombre de la canción' });
    expect(field).toHaveFocus();
    expect(field).toHaveValue('Primera');
    await user.clear(field);
    await user.type(field, '   ');
    await user.click(screen.getByRole('button', { name: 'Guardar nombre' }));
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Primera' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Renombrar «Primera»' }));
    await user.clear(screen.getByRole('textbox', { name: 'Nombre de la canción' }));
    await user.type(screen.getByRole('textbox', { name: 'Nombre de la canción' }), ' Oda {Enter}');
    expect(onRename).toHaveBeenCalledWith(target, 'Oda');
  });

  it('discards a new name with Escape', async () => {
    const { user, onRename } = setup([song()]);
    await user.click(screen.getByRole('button', { name: 'Renombrar «Primera»' }));
    await user.type(screen.getByRole('textbox', { name: 'Nombre de la canción' }), ' bis{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('asks before deleting a song', async () => {
    const target = song();
    const { user, onRemove } = setup([target]);

    await user.click(screen.getByRole('button', { name: 'Borrar «Primera»' }));
    const confirm = screen.getByRole('group', { name: 'Confirmar el borrado' });
    expect(confirm).toHaveTextContent('¿Borrar «Primera» de este navegador?');
    await user.click(within(confirm).getByRole('button', { name: 'No' }));
    expect(screen.queryByRole('group', { name: 'Confirmar el borrado' })).not.toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Borrar «Primera»' }));
    await user.click(screen.getByRole('button', { name: 'Sí, borrar' }));
    expect(onRemove).toHaveBeenCalledWith(target);
  });
});
