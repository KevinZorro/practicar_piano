import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MicInput } from '../adapters/audio/micInput';
import type { Calibration, CalibrationPhase } from '../core/audio/calibration';
import type { InputStatus } from '../core/input/noteInput';
import { describePhase, MicPanel } from './MicPanel';

const calibration: Calibration = {
  tuningCents: 6.4,
  latencyS: 0.118,
  latencySpreadS: 0.02,
  noiseDb: -98,
  signalOverNoiseDb: 40,
  partialRiseDb: [30],
  beatsHeard: 5,
};

function fakeMic(saved: Calibration | null = null): MicInput {
  return {
    status: 'ready',
    calibration: saved,
    start: () => Promise.resolve('ready'),
    onNote: () => () => undefined,
    onStatusChange: () => () => undefined,
    stop: () => undefined,
    setExpected: () => undefined,
    setCalibration: () => undefined,
    calibrate: (onPhase) => {
      onPhase({ kind: 'quiet', remainingS: 1 });
      onPhase({ kind: 'beat', index: 1, total: 5, heard: 1 });
      return Promise.resolve({ kind: 'done', result: { calibration, warnings: [] } });
    },
  };
}

function setup(status: InputStatus, mic: MicInput | null, headphones = false) {
  const props = {
    mic,
    status,
    headphones,
    onHeadphones: vi.fn(),
    onConnect: vi.fn(),
    onBeforeCalibrate: vi.fn(),
  };
  render(<MicPanel {...props} />);
  return props;
}

describe('MicPanel', () => {
  it('offers to switch the microphone on and says nothing is uploaded once it is', async () => {
    const props = setup('idle', null);
    expect(screen.getByText('Micrófono apagado.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Usar micrófono' }));
    expect(props.onConnect).toHaveBeenCalled();
  });

  it.each([
    ['denied', /Permiso denegado/],
    ['no-device', /ningún micrófono/],
    ['unsupported', /no permite usar el micrófono/],
  ] as const)('explains the %s state', (status, text) => {
    setup(status, fakeMic());
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Calibrar con Do central' })).toBeNull();
  });

  it('warns that the app goes silent without headphones, and lets the player choose headphones', async () => {
    const props = setup('ready', fakeMic());
    expect(screen.getByText(/Micrófono activo/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Sin audífonos la app no suena');
    await userEvent.click(screen.getByRole('checkbox', { name: /Uso audífonos/ }));
    expect(props.onHeadphones).toHaveBeenCalledWith(true);
  });

  it('runs the calibration, stops the song first and shows the result', async () => {
    const props = setup('ready', fakeMic());
    expect(screen.getByLabelText('Calibración')).toHaveTextContent('Sin calibrar');
    await userEvent.click(screen.getByRole('button', { name: 'Calibrar con Do central' }));
    expect(props.onBeforeCalibrate).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByLabelText('Calibración')).toHaveTextContent(
        'Calibrado con 5 golpes: retraso 118 ms, afinación +6 cents.',
      );
    });
  });

  it('shows the saved calibration from a previous visit', () => {
    setup('ready', fakeMic(calibration));
    expect(screen.getByLabelText('Calibración')).toHaveTextContent('retraso 118 ms');
  });
});

describe('describePhase', () => {
  it('guides the player through the beats and explains a failed run', () => {
    expect(describePhase({ kind: 'quiet', remainingS: 1 })).toContain('No toques todavía');
    const beat: CalibrationPhase = { kind: 'beat', index: 2, total: 5, heard: 2 };
    expect(describePhase(beat)).toContain('3 de 5');
    expect(
      describePhase({ kind: 'done', result: { calibration: null, warnings: ['noisy-room'] } }),
    ).toMatch(/No se oyeron suficientes golpes.*ruido de fondo/);
  });
});
