import { useEffect, useState } from 'react';
import { StickyNote as NoteIcon, Trash2, X } from 'lucide-react';
import type { StickyNote } from '../api';

/** What's open on this page: an existing note, or a new one being written at x/y. */
export type ActiveSticky = { kind: 'note'; id: number } | { kind: 'new'; fileId: number; page: number; x: number; y: number };

interface Props {
  notes: StickyNote[];
  active: ActiveSticky | null;
  /** Practice mode: notes can be written, edited and deleted. In a gig they are read-only. */
  editable: boolean;
  onOpen: (note: StickyNote) => void;
  onClose: () => void;
  onSave: (text: string) => Promise<void>;
  onDelete: (note: StickyNote) => Promise<void>;
}

const short = (text: string) => (text.length > 22 ? `${text.slice(0, 21).trimEnd()}…` : text);

/** Sticky notes drawn over one PDF page, positioned in % so they stay put at any size. */
export function StickyLayer({ notes, active, editable, onOpen, onClose, onSave, onDelete }: Props) {
  const openNote = active?.kind === 'note' ? notes.find((n) => n.id === active.id) : undefined;
  const bubbleAt = openNote ?? (active?.kind === 'new' ? active : undefined);

  return (
    <div className="sticky-layer">
      {notes.map((n) => (
        <button
          key={n.id}
          type="button"
          className={`sticky-tag ${openNote?.id === n.id ? 'open' : ''}`}
          style={{ left: `${n.x * 100}%`, top: `${n.y * 100}%` }}
          onClick={(e) => {
            e.stopPropagation();
            if (openNote?.id === n.id) onClose();
            else onOpen(n);
          }}
          title={n.text}
        >
          <NoteIcon size={12} /> {short(n.text)}
        </button>
      ))}

      {bubbleAt && (
        <StickyBubble
          key={openNote ? `n${openNote.id}` : 'new'}
          x={bubbleAt.x}
          y={bubbleAt.y}
          note={openNote}
          editable={editable}
          onClose={onClose}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

function StickyBubble({
  x,
  y,
  note,
  editable,
  onClose,
  onSave,
  onDelete,
}: {
  x: number;
  y: number;
  note?: StickyNote;
  editable: boolean;
  onClose: () => void;
  onSave: (text: string) => Promise<void>;
  onDelete: (note: StickyNote) => Promise<void>;
}) {
  const [text, setText] = useState(note?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(note?.text ?? ''), [note?.text]);

  // Open towards the middle of the page so the bubble doesn't fall off the edge.
  const style = {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    transform: `translate(${x > 0.6 ? 'calc(-100% + 8px)' : '-8px'}, ${y > 0.6 ? 'calc(-100% - 22px)' : '22px'})`,
  };

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sticky-bubble" style={style} onClick={(e) => e.stopPropagation()}>
      {editable ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) run(() => onSave(text.trim()));
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) run(() => onSave(text.trim()));
              if (e.key === 'Escape') onClose();
            }}
            placeholder="e.g. Watch the break here"
            maxLength={500}
            rows={3}
            autoFocus
          />
          {error && <p className="error">{error}</p>}
          <div className="sticky-actions">
            {note && (
              <button type="button" className="btn ghost icon danger" title="Delete note" disabled={busy} onClick={() => run(() => onDelete(note))}>
                <Trash2 size={15} />
              </button>
            )}
            <button type="button" className="btn ghost small-btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary small-btn" disabled={busy || !text.trim()}>
              Save
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="sticky-text">{note?.text}</p>
          <button type="button" className="btn ghost icon sticky-close" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </>
      )}
    </div>
  );
}
