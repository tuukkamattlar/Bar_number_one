import { useState } from 'react';
import { Trash2 } from 'lucide-react';

interface Props {
  /** What is being deleted, e.g. "gig" or "song". */
  what: string;
  /** The name the user has to type to unlock the delete button. */
  name: string;
  /** Extra line explaining what happens, e.g. what is kept. */
  detail?: string;
  onDelete: () => Promise<void> | void;
}

const normalize = (s: string) => s.trim().toLowerCase();

/**
 * Deleting is a two-step affair kept away from everyday buttons:
 * open the section, then type the exact name before the button unlocks.
 */
export function DangerZone({ what, name, detail, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const matches = normalize(typed) === normalize(name);

  if (!open) {
    return (
      <div className="danger-zone">
        <button type="button" className="btn ghost danger small" onClick={() => setOpen(true)}>
          <Trash2 size={14} /> Delete {what}…
        </button>
      </div>
    );
  }

  return (
    <form
      className="danger-zone open"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!matches || busy) return;
        setBusy(true);
        try {
          await onDelete();
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        <strong>
          Delete {what} “{name}”?
        </strong>{' '}
        This can’t be undone.{detail && <> {detail}</>}
      </p>
      <label className="field">
        <span>Type the {what} name to confirm</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoFocus />
      </label>
      <div className="danger-zone-actions">
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setOpen(false);
            setTyped('');
          }}
        >
          Cancel
        </button>
        <button className="btn danger-solid" disabled={!matches || busy}>
          <Trash2 size={16} /> Delete {what}
        </button>
      </div>
    </form>
  );
}
