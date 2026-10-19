import { ObligationStatus } from '@/types';

interface ProgressBarProps {
    pct: number;
    status: ObligationStatus;
}

export function ProgressBar({ pct, status }: ProgressBarProps) {
    const color = status === 'paid'
        ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
        : status === 'overdue'
        ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.4)]'
        : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]';

    return (
        <div className="w-full bg-zinc-800/50 rounded-full h-1.5 overflow-hidden shadow-inner border border-zinc-800/30">
            <div
                className={`h-full rounded-full transition-all duration-1000 ease-out ${color}`}
                style={{ width: `${Math.min(100, pct)}%` }}
            />
        </div>
    );
}
