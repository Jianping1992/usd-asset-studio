import { Check, Clock3, X } from 'lucide-react';
import { STATUS_LABELS, type AssetStatus } from '../../domain/models';

export function StatusBadge({ status }: { status: AssetStatus }) {
  const Icon = status === 'approved' ? Check : status === 'rejected' ? X : Clock3;
  return (
    <span className={`status-badge status-${status}`}>
      <Icon size={12} strokeWidth={2.4} />
      {STATUS_LABELS[status]}
    </span>
  );
}
