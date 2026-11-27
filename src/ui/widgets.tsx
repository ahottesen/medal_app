import { useEffect, useState, type ReactNode } from 'react';
import type { ColorSlot } from '../model/types';

export function Section({
  title,
  children,
  defaultOpen = true,
  right,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  right?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={'section' + (open ? ' open' : '')}>
      <header onClick={() => setOpen(!open)}>
        <span className="chev">{open ? '▾' : '▸'}</span>
        <h3>{title}</h3>
        {right && (
          <span className="section-right" onClick={(e) => e.stopPropagation()}>
            {right}
          </span>
        )}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

function decimals(step: number) {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

export function NumField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 0.1,
  unit = 'mm',
  hint,
  slider = true,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  hint?: string;
  slider?: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(+value.toFixed(decimals(step) + 1)));
  }, [value, focused, step]);
  const commit = (s: string) => {
    const v = parseFloat(s.replace(',', '.'));
    if (!isNaN(v)) onChange(v);
  };
  return (
    <label className={'field num' + (disabled ? ' disabled' : '')} title={hint}>
      <span className="field-label">
        {label}
        {hint && <span className="hint-dot">?</span>}
      </span>
      <div className="num-row">
        {slider && (
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={Math.min(max, Math.max(min, value))}
            disabled={disabled}
            onChange={(e) => onChange(parseFloat(e.target.value))}
          />
        )}
        <input
          type="text"
          inputMode="decimal"
          className="num-input"
          value={text}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
          }}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
              onChange(+(value + d).toFixed(decimals(step)));
            }
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </div>
    </label>
  );
}

export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  return (
    <label className="field" title={hint}>
      <span className="field-label">{label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const opt = options.find((o) => String(o.value) === raw);
          if (opt) onChange(opt.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="field toggle" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" />
      <span className="field-label">{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      {label && <span className="field-label">{label}</span>}
      <div className="segmented">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.title}
            className={o.value === value ? 'active' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ColorPick({
  label,
  value,
  colors,
  onChange,
}: {
  label: string;
  value: string;
  colors: ColorSlot[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="swatches">
        {colors.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.name}
            className={'swatch' + (c.id === value ? ' active' : '') + ' finish-' + c.finish}
            style={{ background: c.hex }}
            onClick={() => onChange(c.id)}
          />
        ))}
        <span className="swatch-name">{colors.find((c) => c.id === value)?.name ?? '–'}</span>
      </div>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Lukk">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
