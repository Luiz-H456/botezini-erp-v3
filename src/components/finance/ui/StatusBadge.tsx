import { ObligationStatus } from '@/types';
import { STATUS_CONFIG } from '@/utils/constants';

interface StatusBadgeProps {
    status: ObligationStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
    return (
        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-lg border shadow-lg shadow-black/20 tracking-widest ${cfg.color} ${cfg.bg} ${cfg.border}`}>
            {cfg.label}
        </span>
    );
}
