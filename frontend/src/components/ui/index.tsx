// Közös UI komponensek

import { type ReactNode } from 'react';

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-xl p-6 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-[var(--color-text)]">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled = false }: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const base = 'px-4 py-2 rounded-lg font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent-dim)]',
    secondary: 'bg-[var(--color-border)] text-[var(--color-text)] hover:bg-opacity-80',
    danger: 'bg-[var(--color-bear)] text-white hover:opacity-80',
    ghost: 'bg-transparent text-[var(--color-text)] hover:bg-[var(--color-border)]',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]}`}>
      {children}
    </button>
  );
}

export function Input({ label, type = 'text', value, onChange, placeholder, min, max, step }: {
  label: string;
  type?: 'text' | 'number' | 'email';
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm text-[var(--color-muted)] mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
      />
    </label>
  );
}

export function Select<T extends string>({ label, value, onChange, options }: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-sm text-[var(--color-muted)] mb-1 block">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
}

export function Badge({ children, color = 'accent' }: { children: ReactNode; color?: 'accent' | 'bull' | 'bear' | 'warn' | 'muted' }) {
  const colors = {
    accent: 'bg-[var(--color-accent)] text-black',
    bull: 'bg-[var(--color-bull)] text-black',
    bear: 'bg-[var(--color-bear)] text-white',
    warn: 'bg-[var(--color-warn)] text-black',
    muted: 'bg-[var(--color-border)] text-[var(--color-text)]',
  };
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}
