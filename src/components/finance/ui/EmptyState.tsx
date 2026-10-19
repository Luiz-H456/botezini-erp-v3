import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface EmptyStateProps {
    type: 'receivable' | 'payable';
}

export function EmptyState({ type }: EmptyStateProps) {
    const isReceivable = type === 'receivable';
    return (
        <div className="flex flex-col items-center justify-center py-20 px-6 rounded-3xl bg-zinc-900/20 border-2 border-dashed border-zinc-800/50 text-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-2xl ${isReceivable ? 'bg-emerald-500/10 text-emerald-500 shadow-emerald-900/20' : 'bg-rose-500/10 text-rose-500 shadow-rose-900/20'}`}>
                {isReceivable ? <ArrowUpRight size={32} strokeWidth={3} /> : <ArrowDownRight size={32} strokeWidth={3} />}
            </div>
            <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-2">FLUXO LIMPO</h3>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest max-w-[200px] leading-relaxed">
                NÃO HÁ {isReceivable ? 'RECEBIMENTOS' : 'PAGAMENTOS'} PENDENTES PARA ESTA VISÃO
            </p>
        </div>
    );
}
