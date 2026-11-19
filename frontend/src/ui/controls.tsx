import { useId, type ReactNode } from 'react';

interface KeyRowProps<T extends string | number> {
  legend: string;
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

/** A choice between a few options, drawn as a row of keys (radio buttons underneath). */
export function KeyRow<T extends string | number>({
  legend,
  name,
  value,
  options,
  onChange,
  disabled = false,
  className = '',
}: KeyRowProps<T>) {
  return (
    <fieldset className={`key-row ${className}`} disabled={disabled}>
      <legend>{legend}</legend>
      <div className="key-row-keys">
        {options.map(([option, label]) => (
          <label key={String(option)}>
            <input
              type="radio"
              name={name}
              checked={value === option}
              onChange={() => {
                onChange(option);
              }}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}

/** An on/off setting: a checkbox drawn as a toggle, with an optional explanation under it. */
export function Switch({ label, checked, onChange, hint, disabled = false }: SwitchProps) {
  const hintId = useId();
  return (
    <div className="switch-field">
      <label className="switch">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => {
            onChange(e.target.checked);
          }}
        />
        <span>{label}</span>
      </label>
      {hint && (
        <p id={hintId} className="switch-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
