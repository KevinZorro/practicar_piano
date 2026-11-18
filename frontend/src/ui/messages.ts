import type { LibrarySong, LevelName } from '../core/library/library';
/** User-facing texts (Spanish) for the API's stable error codes. */
const ERRORS: Record<string, string> = {
  invalid_url: 'Ese enlace no es un video de YouTube válido.',
  duration_limit: 'El video es demasiado largo: el máximo es de 10 minutos.',
  download_failed: 'No se pudo descargar el audio de ese video.',
  transcription_failed: 'No se pudo transcribir la canción.',
  queue_full: 'La cola está llena. Vuelve a intentarlo en un rato.',
  rate_limited: 'Has enviado demasiadas canciones seguidas. Espera un poco antes de enviar otra.',
  video_blocked:
    'Este video no se puede procesar en este servicio por una reclamación de derechos.',
  network: 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.',
  internal_error: 'Algo salió mal en el servidor. Inténtalo de nuevo.',
};

export function errorMessage(code: string, retryAfterS?: number): string {
  const base = ERRORS[code] ?? ERRORS['internal_error'] ?? '';
  return retryAfterS ? `${base} (reintenta en ${formatDuration(retryAfterS)})` : base;
}

/** "menos de 1 min", "8 min", "2 h 5 min": coarse on purpose, estimates are rough. */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${String(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}

export const LEVEL_LABEL: Record<LevelName, string> = {
  original: 'Original',
  playable: 'Jugable',
  easy: 'Fácil',
};

/** One line per practiced level, e.g. "Jugable: 3 intentos, mejor 92 % · dominada". */
export function progressLines(progress: LibrarySong['progress']): string[] {
  return (Object.keys(LEVEL_LABEL) as LevelName[]).flatMap((name) => {
    const p = progress[name];
    if (!p || p.plays === 0) return [];
    const tries = p.plays === 1 ? '1 intento' : `${String(p.plays)} intentos`;
    const mastered = p.mastered ? ' · dominada' : '';
    return [
      `${LEVEL_LABEL[name]}: ${tries}, mejor ${String(Math.round(p.bestAccuracy * 100))} %${mastered}`,
    ];
  });
}
