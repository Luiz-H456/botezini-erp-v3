import { Repeat, Ban, ShieldCheck, Undo2, Paperclip, Pencil } from 'lucide-react';
import { ObligationSummary } from '@/types';
import { formatCurrency } from '@/utils';
import { getTodayStr } from '@/utils/date';
import { situacaoDaConta, diasDeAtraso } from '@/utils/financas/situacao';
import { diaEMes, diasEntre } from '@/utils/financas/base';
import { valorDaLinha } from '@/utils/financas/lista';
import { ProgressBar } from './ui';
import { ITEM, BOTAO_SUAVE, corDoTipo } from './ui/estilo';

interface ObligationCardProps {
    ob: ObligationSummary;
    partyName?: string | null;
    categoryLabel?: string | null;
    isPrivacy: boolean;
    onBaixa: (ob: ObligationSummary) => void;
    onDetail: (ob: ObligationSummary) => void;
    onCancel: (ob: ObligationSummary) => void;
    onReconcile?: (ob: ObligationSummary) => void;
    onUndoReconcile?: (ob: ObligationSummary) => void;
    /** Corrigir valor/vencimento. Só aparece enquanto nada foi pago. */
    onEdit?: (ob: ObligationSummary) => void;
}

const icone = 'h-10 w-10 inline-flex items-center justify-center rounded-xl text-zinc-600 hover:text-white hover:bg-zinc-800';

export function ObligationCard({ ob, partyName, categoryLabel, isPrivacy, onBaixa, onDetail, onCancel, onReconcile, onUndoReconcile, onEdit }: ObligationCardProps) {
    const hoje = getTodayStr();
    const s = situacaoDaConta(ob, hoje);
    const entra = ob.type === 'receivable';
    const conferida = !!ob.is_reconciled;
    const aberta = s === 'vencida' || s === 'a_vencer' || s === 'aguardando_entrega';
    const naoConferida = !!ob.unreconciled_reason && !conferida;
    const valor = (n: number) => (isPrivacy ? '••••' : formatCurrency(n));
    const faltam = diasEntre(hoje, ob.due_date);
    const quando = s === 'vencida' ? `${diasDeAtraso(ob, hoje)} dia(s) de atraso`
        : faltam === 0 ? 'hoje' : faltam > 0 && faltam <= 7 ? `em ${faltam} dia(s)` : diaEMes(ob.due_date);

    return (
        <div className={`${ITEM} group relative grid gap-2 overflow-hidden py-3 pl-4 pr-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 hover:border-zinc-700 ${s === 'cancelada' ? 'opacity-50' : ''}`}>
            {/* Faixa de urgência à esquerda, como nos cartões do resto do app. */}
            {(s === 'vencida' || (aberta && faltam === 0)) && <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${s === 'vencida' ? 'bg-rose-500' : 'bg-amber-400'}`} />}
            <div className="min-w-0">
            <button type="button" onClick={() => onDetail(ob)} className="block w-full min-w-0 text-left">
                <span className={`flex items-center gap-1.5 text-sm font-bold text-zinc-100 ${s === 'cancelada' ? 'line-through' : ''}`}>
                    <span className="truncate">{ob.description}</span>
                    {ob.is_recurring && <Repeat size={12} className="shrink-0 text-zinc-500" aria-label="Recorrente" />}
                    {ob.attachments && ob.attachments.length > 0 && <Paperclip size={12} className="shrink-0 text-zinc-500" aria-label="Tem anexo" />}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {partyName && <span className="truncate">{partyName}</span>}
                    <span className={s === 'vencida' ? 'text-rose-400' : faltam === 0 && aberta ? 'text-amber-400' : ''}>{quando}</span>
                    {ob.total_installments && ob.total_installments > 1 && <span>parcela {ob.installment_no}/{ob.total_installments}</span>}
                    {categoryLabel && <span>{categoryLabel}</span>}
                    {s === 'aguardando_entrega' && <span>aguardando entrega</span>}
                    {naoConferida && <span className="text-amber-400 normal-case" title={ob.unreconciled_reason ?? ''}>{ob.unreconciled_reason}</span>}
                </span>
            </button>
            {ob.derived_status === 'partial' && ob.paid_pct > 0 && (
                <div className="mt-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    <div className="w-24"><ProgressBar pct={ob.paid_pct} status={ob.derived_status} /></div>
                    falta {valor(ob.remaining_amount)}
                </div>
            )}
            </div>
            <div className="flex items-center justify-end gap-1">
                {/* Só somem onde há mouse (hover real); em toque, tablet e celular ficam sempre à vista. */}
                <div className="flex items-center [@media(hover:hover)]:md:opacity-0 [@media(hover:hover)]:md:group-hover:opacity-100 [@media(hover:hover)]:md:focus-within:opacity-100">
                    {onEdit && ob.paid_amount <= 0 && s !== 'cancelada' && (
                        <button type="button" onClick={() => onEdit(ob)} className={icone} aria-label="Corrigir valor ou vencimento" title="Corrigir valor ou vencimento"><Pencil size={15} /></button>
                    )}
                    {onReconcile && ob.remaining_amount <= 0 && s !== 'cancelada' && !conferida && (
                        <button type="button" onClick={() => onReconcile(ob)} className={icone} aria-label="Conferir com o extrato" title="Conferir com o extrato"><ShieldCheck size={15} /></button>
                    )}
                    {onUndoReconcile && conferida && (
                        <button type="button" onClick={() => onUndoReconcile(ob)} className={icone} aria-label="Desfazer conferência" title="Desfazer conferência"><Undo2 size={15} /></button>
                    )}
                    {aberta && !conferida && (
                        <button type="button" onClick={() => onCancel(ob)} className={`${icone} hover:text-rose-400`} aria-label="Cancelar conta" title="Cancelar conta"><Ban size={15} /></button>
                    )}
                </div>
                <span className={`min-w-24 text-right text-sm font-black font-mono tabular-nums ${corDoTipo(ob.type)}`}>
                    {entra ? '+' : '−'} {valor(valorDaLinha(ob))}
                </span>
                {aberta && !conferida ? (
                    <button type="button" onClick={() => onBaixa(ob)}
                        className={`${BOTAO_SUAVE} w-24 px-0`}>
                        {entra ? 'Recebi' : 'Paguei'}
                    </button>
                ) : conferida ? (
                    <span className="w-24 text-center text-[10px] font-black uppercase tracking-widest text-emerald-500" title="Conferida com o extrato">conferida</span>
                ) : s === 'paga' ? (
                    <span className="w-24 text-center text-[10px] font-black uppercase tracking-widest text-zinc-500">paga</span>
                ) : <span className="w-24" />}
            </div>
        </div>
    );
}
