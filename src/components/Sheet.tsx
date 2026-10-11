import { useEffect, type ReactNode } from 'react';
import { Check } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Small extra next to the title, e.g. "+2 added". */
  badge?: ReactNode;
  /** Let the sheet body scroll (for forms). Lists that scroll themselves leave it off. */
  scroll?: boolean;
}

/** Full-screen panel on phones (a centred dialog on wider screens), closed with Done or Esc. */
export function Sheet({ title, onClose, children, badge, scroll }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc inside a text field belongs to the field (e.g. clearing a search).
      if (e.key === 'Escape' && !(e.target instanceof Element && e.target.closest('input, textarea, select'))) onClose();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          {badge}
          <button type="button" className="btn primary" onClick={onClose}>
            <Check size={16} /> Done
          </button>
        </div>
        <div className={scroll ? 'sheet-body scroll' : 'sheet-body'}>{children}</div>
      </div>
    </div>
  );
}
