import { useState } from 'react';
import type { MicInput } from '../adapters/audio/micInput';
import type { Calibration, CalibrationPhase, CalibrationWarning } from '../core/audio/calibration';
import type { InputStatus } from '../core/input/noteInput';

const MIC_MESSAGE: Record<InputStatus, string> = {
  idle: 'Micrófono apagado.',
  unsupported: 'Este navegador no permite usar el micrófono.',
  denied: 'Permiso denegado. Permite el micrófono en el candado de la barra de direcciones.',
  'no-device': 'No se encuentra ningún micrófono.',
  ready: 'Micrófono activo. El audio se analiza aquí y no se sube a ningún sitio.',
};

const WARNING: Record<CalibrationWarning, string> = {
  'noisy-room':
    'Hay bastante ruido de fondo: acerca el micrófono al teclado o busca un sitio más tranquilo.',
  'quiet-signal':
    'El Do se oyó bajito frente al ruido: sube el volumen del teclado o acerca el micrófono.',
  'uneven-timing':
    'Los golpes no cayeron parejos con los clics, así que se usa un retraso estándar.',
};

export function describePhase(phase: CalibrationPhase): string {
  if (phase.kind === 'quiet') return 'No toques todavía: se mide el ruido de fondo…';
  if (phase.kind === 'beat') {
    return `Toca el Do central (C4) justo al oír cada clic: ${String(phase.index + 1)} de ${String(phase.total)} (oídos: ${String(phase.heard)}).`;
  }
  const { calibration, warnings } = phase.result;
  if (!calibration) {
    return `No se oyeron suficientes golpes de Do central. ${warnings.map((w) => WARNING[w]).join(' ')} Inténtalo otra vez.`;
  }
  return [summary(calibration), ...warnings.map((w) => WARNING[w])].join(' ');
}

function summary(c: Calibration): string {
  const cents = Math.round(c.tuningCents);
  return `Calibrado con ${String(c.beatsHeard)} golpes: retraso ${String(Math.round(c.latencyS * 1000))} ms, afinación ${cents > 0 ? '+' : ''}${String(cents)} cents.`;
}

interface Props {
  mic: MicInput | null;
  status: InputStatus;
  headphones: boolean;
  onHeadphones: (value: boolean) => void;
  onConnect: () => void;
  /** Called before a calibration starts (stops the song, so its sound is not heard). */
  onBeforeCalibrate: () => void;
}

/** Microphone controls: switch on, calibrate with C4, and say whether headphones are used. */
export function MicPanel({
  mic,
  status,
  headphones,
  onHeadphones,
  onConnect,
  onBeforeCalibrate,
}: Props) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = mic !== null && status === 'ready';

  async function calibrate() {
    if (!mic) return;
    onBeforeCalibrate();
    setBusy(true);
    const done = await mic.calibrate((phase) => {
      setText(describePhase(phase));
    });
    setText(describePhase(done));
    setBusy(false);
  }

  return (
    <div className="mic-panel">
      <button type="button" onClick={onConnect}>
        Usar micrófono
      </button>
      <span role="status">{MIC_MESSAGE[mic ? status : 'idle']}</span>
      {ready && (
        <>
          <label>
            <input
              type="checkbox"
              checked={headphones}
              onChange={(e) => {
                onHeadphones(e.target.checked);
              }}
            />{' '}
            Uso audífonos (el sonido de la app se queda encendido)
          </label>
          {!headphones && (
            <small role="note" className="fine-print">
              Sin audífonos la app no suena para que el micrófono no la oiga: escucharás solo tu
              teclado.
            </small>
          )}
          <button type="button" disabled={busy} onClick={() => void calibrate()}>
            Calibrar con Do central
          </button>
          <span role="status" aria-label="Calibración">
            {text ??
              (mic.calibration
                ? summary(mic.calibration)
                : 'Sin calibrar: se usan valores estándar.')}
          </span>
        </>
      )}
    </div>
  );
}
