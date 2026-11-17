import { useState, type SyntheticEvent } from 'react';
import { ApiError } from '../adapters/api/jobsApi';
import { errorMessage } from './messages';

interface Props {
  onSubmit: (url: string) => Promise<void>;
}

export function LinkForm({ onSubmit }: Props) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(url.trim());
      setUrl('');
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? errorMessage(caught.code, caught.retryAfterS)
          : errorMessage('internal_error'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)}>
      <label htmlFor="video-link">Enlace de YouTube</label>
      <input
        id="video-link"
        type="url"
        inputMode="url"
        autoComplete="off"
        placeholder="https://www.youtube.com/watch?v=…"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
        }}
        required
      />
      <button type="submit" disabled={busy || url.trim() === ''}>
        {busy ? 'Enviando…' : 'Procesar canción'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
