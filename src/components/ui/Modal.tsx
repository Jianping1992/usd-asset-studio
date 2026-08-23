import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  title: string;
  eyebrow?: string;
  description?: string;
  wide?: boolean;
  full?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}

export function Modal({
  open,
  title,
  eyebrow,
  description,
  wide = false,
  full = false,
  children,
  footer,
  onClose,
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-layer" role="presentation">
      <button className="modal-backdrop" aria-label="关闭弹窗" onClick={onClose} />
      <section
        className={`modal-card ${wide ? 'modal-wide' : ''} ${full ? 'modal-full' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal-header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}><X size={19} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
