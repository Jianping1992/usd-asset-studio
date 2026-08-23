import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useEffect } from 'react';
import { useStudioStore } from '../../state/studioStore';

export function Toast() {
  const notice = useStudioStore((state) => state.notice);
  const clearNotice = useStudioStore((state) => state.clearNotice);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(clearNotice, 4200);
    return () => window.clearTimeout(timeout);
  }, [notice, clearNotice]);

  if (!notice) return null;
  const Icon = notice.tone === 'success' ? CheckCircle2 : notice.tone === 'error' ? TriangleAlert : Info;

  return (
    <div className={`toast toast-${notice.tone}`} role="status">
      <Icon size={18} />
      <span>{notice.message}</span>
      <button aria-label="关闭通知" onClick={clearNotice}><X size={16} /></button>
    </div>
  );
}
