import type { Instrument } from '../api';

interface Props {
  instruments: Instrument[];
  value: number | null;
  onChange: (id: number | null) => void;
  className?: string;
  /** Label for "no instrument"; defaults to the long, explanatory one. */
  emptyLabel?: string;
}

export function InstrumentSelect({ instruments, value, onChange, className, emptyLabel }: Props) {
  // An instrument that was deleted shouldn't leave the select in a weird state.
  const known = value !== null && instruments.some((i) => i.id === value);
  return (
    <select
      className={className}
      value={known ? String(value) : ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      aria-label="My instrument"
    >
      <option value="">{emptyLabel ?? 'No instrument (shared sheets)'}</option>
      {instruments.map((i) => (
        <option key={i.id} value={i.id}>
          {i.name}
        </option>
      ))}
    </select>
  );
}
