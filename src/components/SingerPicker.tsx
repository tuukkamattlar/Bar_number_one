import type { Singer } from '../api';
import { hasSinger, toggleSinger } from '../lib/singers';

interface Props {
  value: string;
  singers: Singer[];
  onChange: (value: string) => void;
  /** Called when the value should be saved: on blur, or right after a name is clicked. */
  onCommit: (value: string) => void;
  placeholder?: string;
}

/** Free-text singers field with the band's singers as one-click chips underneath. */
export function SingerPicker({ value, singers, onChange, onCommit, placeholder }: Props) {
  return (
    <span className="singer-picker">
      <input
        value={value}
        maxLength={200}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit(value)}
        placeholder={placeholder}
      />
      {singers.length > 0 && (
        <span className="singer-chips">
          {singers.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`chip ${hasSinger(value, s.name) ? 'on' : ''}`}
              // Keep focus where it is so the text field doesn't save half-typed text first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const next = toggleSinger(value, s.name);
                onChange(next);
                onCommit(next);
              }}
            >
              {s.name}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
