import React from 'react';
import { createPortal } from 'react-dom';
import { useEscFecha } from '@/hooks/useEscFecha';
import { X, CheckCircle, Clock, AlertTriangle, CreditCard } from 'lucide-react';
import { ObligationSummary } from '@/types';
import { formatCurrency, formatDate } from '@/utils';

interface Props {
    obligation: ObligationSummary;
    client_name: string;
    order_number: string;
    onClose: () => void;
    onGoToFinance?: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    open: { label: 'Em Aberto', color: 'text-amber-500 border-amber-500/20 bg-amber-500/5', icon: <Clock size={12} /> },
    partial: { label: 'Parcial', color: 'text-blue-500 border-blue-500/20 bg-blue-500/5', icon: <CreditCard size={12} /> },
    paid: { label: 'Liquidado', color: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5', icon: <CheckCircle size={12} /> },
    overdue: { label: 'Vencida', color: 'text-rose-500 border-rose-500/20 bg-rose-500/5', icon: <AlertTriangle size={12} /> },
    cancelled: { label: 'Cancelada', color: 'text-zinc-500 border-zinc-500/20 bg-zinc-500/5', icon: <X size={12} /> }
};

const InvoiceModal: React.FC<Props> = ({ obligation, client_name, order_number, onClose, onGoToFinance }) => {
    useEscFecha(true, onClose);
    const totalNum = Number(obligation.original_amount);
    const paidNum = Number(obligation.paid_amount || 0);
    const remaining = totalNum - paidNum;
    const progress = Math.min((totalNum > 0 ? (paidNum / totalNum) * 100 : 0), 100);
    const statusMeta = STATUS_LABELS[obligation.status || obligation.derived_status || 'open'] || STATUS_LABELS['open'];

    return createPortal(
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md flex items-center justify-center z-modal p-4 ease-out animate-in fade-in duration-200">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-full flex flex-col overflow-hidden backdrop-blur-xl relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>

                {/* Header */}
                <div className="shrink-0 bg-zinc-950/30 border-b border-zinc-900 p-8 flex justify-between items-start">
                    <div className="space-y-1">
                        <p className="text-[10px] text-zinc-600 uppercase font-black tracking-[0.3em]">Situação Financeira — Pedido #{order_number}</p>
                        <h2 className="text-white font-black text-xl uppercase tracking-tight">{client_name}</h2>
                        <div className="flex items-center gap-2 mt-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-800"></div>
                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                                Vencimento: <span className="text-white">{formatDate(obligation.due_date)}</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border shadow-inner ${statusMeta.color}`}>
                            {statusMeta.icon} {statusMeta.label}
                        </span>
                        <button type="button" onClick={onClose} aria-label="Fechar" className="p-2 text-zinc-600 hover:text-white transition-colors hover:bg-zinc-800 rounded-lg"><X size={20} /></button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 p-8 space-y-8 overflow-y-auto">

                    {/* Progress */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-end">
                            <div className="space-y-1">
                                <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">Recebido</p>
                                <p className="text-2xl font-black text-emerald-500">{formatCurrency(paidNum)}</p>
                            </div>
                            <div className="text-right space-y-1">
                                <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">Total do Pedido</p>
                                <p className="text-lg font-black text-white">{formatCurrency(totalNum)}</p>
                            </div>
                        </div>
                        <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-900 p-0.5">
                            <div
                                className={`h-full transition-all duration-150 rounded-full ${(obligation.status === 'paid' || paidNum >= totalNum) ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : obligation.status === 'overdue' ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)]' : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]'}`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                            <span className="text-zinc-500">{progress.toFixed(0)}% liquidado</span>
                            {remaining > 0 && <span className="text-amber-500">Saldo Restante: {formatCurrency(remaining)}</span>}
                        </div>
                    </div>

                    {/* Button to navigate to finance */}
                    {onGoToFinance && (
                        <div className="mt-8">
                            <button
                                type="button"
                                onClick={onGoToFinance}
                                className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-4 rounded-xl text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl shadow-emerald-900/10"
                            >
                                <span className="flex items-center gap-2"><CreditCard size={18} /> Acessar Módulo Financeiro</span>
                            </button>
                            <p className="text-[10px] text-zinc-500 text-center mt-3 uppercase tracking-widest font-bold">
                                Você será redirecionado para gerir este recebimento no módulo completo
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default InvoiceModal;
