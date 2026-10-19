import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Lock, AlertTriangle, CheckCircle } from 'lucide-react';
import { formatCurrency, getTodayStr } from '@/utils';
import { PlanInstallment, seedPlanFromTerms, planTotal, termoDoPlano } from '@/utils/paymentPlan';
import { PAYMENT_TERMS_OPTIONS } from '@/types/finance';
import { storageService } from '@/services/storage';
import { SearchableSelect } from '@/components/common';

interface LockedRow { label: string; amount: number; status: string; }

interface Props {
    mode: 'create' | 'revise' | 'budget';   // 'budget' = montar plano no orçamento (sem tocar no banco)
    orderId: string;
    orderNumber: string;
    clientId?: string;
    description: string;
    total: number;              // total do pedido (referência do aviso)
    deliveryDate: string;       // vencimento combinado padrão (deadline)
    downPayment?: number;       // sinal do orçamento (só no create/budget)
    defaultTerms?: string;      // condição do cliente, se conhecida
    initialPlan?: PlanInstallment[]; // plano já existente (edição no orçamento)
    /**
     * Por que o plano gravado no orçamento não serve mais (valor mudou,
     * parcela nascendo vencida). Quando vem preenchido, `initialPlan` já é a
     * versão corrigida — o texto existe para a pessoa entender o que mudou
     * antes de confirmar, em vez de ver números diferentes sem explicação.
     */
    aviso?: string;
    /** Data de referência da entrada (no orçamento, a emissão — R11). Padrão: hoje. */
    hoje?: string;
    onConfirm: (plan: PlanInstallment[]) => Promise<void>;
    onClose: () => void;
}

const PAYMENT_METHODS = ['PIX', 'Boleto', 'TED', 'DOC', 'Cartão', 'Dinheiro', 'Cheque', 'Outro'];

export function PaymentPlanModal(props: Props) {
    const today = props.hoje || getTodayStr();
    const [plan, setPlan] = useState<PlanInstallment[]>(() =>
        props.initialPlan && props.initialPlan.length > 0
            ? props.initialPlan
            : seedPlanFromTerms({ terms: props.defaultTerms, total: props.total, downPayment: props.downPayment, today, deliveryDate: props.deliveryDate }));
    const [locked, setLocked] = useState<LockedRow[]>([]);
    const [loading, setLoading] = useState(props.mode === 'revise');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Revisão: carrega as parcelas do pedido — pagas/parciais travam, abertas viram editáveis.
    useEffect(() => {
        if (props.mode !== 'revise') return;
        let alive = true;
        (async () => {
            try {
                const obs = await storageService.getObligations({ type: 'receivable', order_id: props.orderId });
                if (!alive) return;
                const active = obs.filter((o: any) => o.derived_status !== 'cancelled');
                const lockedRows = active
                    .filter((o: any) => Number(o.paid_amount) > 0)
                    .map((o: any) => ({ label: o.description, amount: Number(o.original_amount), status: o.derived_status }));
                const openRows = active
                    .filter((o: any) => Number(o.paid_amount) <= 0)
                    .map((o: any) => ({ label: o.description, amount: Number(o.original_amount), due: o.due_date }));
                setLocked(lockedRows);
                setPlan(openRows.length ? openRows : [{ label: 'Parcela 1', amount: 0, due: props.deliveryDate }]);
            } catch (e: any) {
                setError(e?.message || 'Falha ao carregar parcelas');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [props.mode, props.orderId, props.deliveryDate]);

    const lockedTotal = locked.reduce((s, r) => s + r.amount, 0);
    const editableTotal = planTotal(plan);
    const grandTotal = lockedTotal + editableTotal;
    // A condição mostrada é a que o plano de fato é: bate com um modelo, mostra o modelo; editou à mão, vira Personalizado.
    // Com parcela já paga, o que sobra é um pedaço do plano: o saldo sozinho bateria com "À vista" sem ser.
    const terms = lockedTotal > 0 ? '' : termoDoPlano(plan, { total: props.total - lockedTotal, downPayment: props.downPayment, today, deliveryDate: props.deliveryDate },
        PAYMENT_TERMS_OPTIONS.map(o => o.value));
    const diff = Math.round((grandTotal - props.total) * 100) / 100;
    const balanced = Math.abs(diff) < 0.01;

    const applySeed = (t: string) => {
        setPlan(seedPlanFromTerms({ terms: t, total: props.total - lockedTotal, downPayment: props.downPayment, today, deliveryDate: props.deliveryDate }));
    };

    const updateRow = (i: number, patch: Partial<PlanInstallment>) =>
        setPlan(plan.map((p, idx) => idx === i ? { ...p, ...patch } : p));
    const removeRow = (i: number) => setPlan(plan.filter((_, idx) => idx !== i));
    const addRow = () => setPlan([...plan, { label: `Parcela ${plan.length + 1}`, amount: 0, due: props.deliveryDate }]);

    const canConfirm = plan.length > 0 && plan.every(p => Number(p.amount) > 0 && p.due) && !saving;

    const handleConfirm = async () => {
        if (!canConfirm) return;
        setSaving(true);
        setError('');
        try {
            await props.onConfirm(plan.map(p => ({ label: p.label, amount: Number(p.amount), due: p.due, method: p.method })));
        } catch (e: any) {
            setError(e?.message || 'Falha ao salvar plano');
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-xl z-sobreposto flex items-center justify-center p-4 ease-out animate-in fade-in duration-200" onClick={props.onClose}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col ease-out animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                    <div>
                        <h3 className="text-white font-black uppercase tracking-tight">
                            {props.mode === 'revise' ? 'Editar Plano' : 'Plano de Pagamento'}
                            {/* Sem orderId o pedido ainda não existe: o número é o do ORÇAMENTO que o está gerando. */}
                            {props.mode === 'budget' || !props.orderId ? ` — orçamento ${props.orderNumber}` : ` — pedido #${props.orderNumber}`}
                        </h3>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">
                            Total: {formatCurrency(props.total)}
                        </p>
                    </div>
                    <button type="button" onClick={props.onClose} aria-label="Fechar" className="p-2 text-zinc-500 hover:text-white"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {props.aviso && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                            <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <p className="text-[11px] font-black text-amber-500 uppercase tracking-widest">
                                    Plano corrigido antes de gerar o pedido
                                </p>
                                <p className="text-[11px] font-bold text-zinc-300 mt-1.5 leading-relaxed">
                                    {props.aviso}
                                </p>
                                <p className="text-[10px] font-bold text-zinc-500 mt-2 leading-relaxed">
                                    Os valores e datas abaixo já vêm ajustados ao pedido de hoje, mantendo
                                    a proporção e o intervalo combinados. Confira antes de confirmar.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Seed por condição */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest shrink-0">Condição</span>
                        <div className="w-56">
                            <SearchableSelect
                                value={terms}
                                onChange={v => { if (v) applySeed(v); }}
                                options={[{ value: '', label: 'Personalizado' }, ...PAYMENT_TERMS_OPTIONS]}
                                placeholder="CONDIÇÃO..."
                            />
                        </div>
                        <span className="text-[9px] text-zinc-600 font-bold">— aplica um modelo; ajuste livremente abaixo</span>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-10">
                            <div className="w-6 h-6 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                        </div>
                    ) : (
                        <>
                            {/* Parcelas travadas (pagas) na revisão */}
                            {locked.map((r, i) => (
                                <div key={`lock-${i}`} className="flex items-center gap-2 bg-zinc-950/40 border border-zinc-800 rounded-xl px-3 py-2 opacity-70">
                                    <Lock size={13} className="text-emerald-500 shrink-0" />
                                    <span className="flex-1 text-xs text-zinc-400 truncate">{r.label}</span>
                                    <span className="text-[9px] font-black text-emerald-500 uppercase">{r.status}</span>
                                    <span className="text-xs font-mono font-bold text-zinc-300 w-24 text-right">{formatCurrency(r.amount)}</span>
                                </div>
                            ))}

                            {/* Parcelas editáveis */}
                            {plan.map((p, i) => (
                                <div key={i} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                    <input value={p.label} onChange={e => updateRow(i, { label: e.target.value })} placeholder="Descrição"
                                        className="flex-1 min-w-[120px] bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white" />
                                    <div className="w-32 shrink-0">
                                        <SearchableSelect
                                            value={p.method || ''}
                                            onChange={(v) => updateRow(i, { method: v || undefined })}
                                            options={PAYMENT_METHODS.map(m => ({ value: m, label: m }))}
                                            placeholder="MEIO…"
                                        />
                                    </div>
                                    <input type="date" value={p.due} onChange={e => updateRow(i, { due: e.target.value })}
                                        className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-2 text-xs text-white" />
                                    <input type="number" min={0} step="0.01" value={p.amount || ''} onChange={e => updateRow(i, { amount: Number(e.target.value) })} placeholder="0,00"
                                        className="w-24 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-2 text-xs text-white text-right font-mono" />
                                    <button onClick={() => removeRow(i)} disabled={plan.length <= 1}
                                        className="p-2 text-zinc-600 hover:text-rose-500 disabled:opacity-30"><Trash2 size={14} /></button>
                                </div>
                            ))}

                            <button onClick={addRow}
                                className="flex items-center gap-1.5 text-[10px] font-black text-amber-400 uppercase tracking-widest hover:text-amber-300">
                                <Plus size={13} /> Adicionar parcela
                            </button>

                            {/* Aviso de soma */}
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${balanced ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
                                {balanced ? <CheckCircle size={14} className="text-emerald-500" /> : <AlertTriangle size={14} className="text-amber-500" />}
                                <span className="text-[10px] font-bold text-zinc-400">
                                    Soma das parcelas: <span className="font-mono text-zinc-200">{formatCurrency(grandTotal)}</span>
                                    {!balanced && <span className="text-amber-400"> · {diff > 0 ? 'excede' : 'falta'} {formatCurrency(Math.abs(diff))} vs total do pedido (a reconciliação da Fase 4 sinaliza)</span>}
                                </span>
                            </div>
                        </>
                    )}

                    {error && <p className="text-xs text-rose-400 font-bold">{error}</p>}
                </div>

                <div className="flex items-center gap-3 px-5 py-4 border-t border-zinc-800">
                    <button onClick={props.onClose} className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-zinc-800 text-zinc-400 hover:bg-zinc-700">Cancelar</button>
                    <button onClick={handleConfirm} disabled={!canConfirm}
                        className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40">
                        {saving ? 'Salvando...' : props.mode === 'create' ? 'Gerar Pedido' : props.mode === 'budget' ? 'Salvar no Orçamento' : 'Salvar Plano'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
