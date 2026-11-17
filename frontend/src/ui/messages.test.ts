import { progressLines } from './messages';

describe('progressLines', () => {
  it('lists only the practiced levels, with attempts, best accuracy and mastery', () => {
    expect(
      progressLines({
        playable: { plays: 3, bestAccuracy: 0.924, bestSpeed: 1, mastered: true },
        easy: { plays: 1, bestAccuracy: 0.5, bestSpeed: 0, mastered: false },
        original: { plays: 0, bestAccuracy: 0, bestSpeed: 0, mastered: false },
      }),
    ).toEqual(['Jugable: 3 intentos, mejor 92 % · dominada', 'Fácil: 1 intento, mejor 50 %']);
  });

  it('is empty for a song never practiced', () => {
    expect(progressLines({})).toEqual([]);
  });
});
