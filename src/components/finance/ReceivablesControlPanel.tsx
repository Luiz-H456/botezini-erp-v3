import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, AlertTriangle, Clock, Factory, MessageCircle } from 'lucide-react';
import { Indicador } from '@/components/finance/ui/Indicador';
import { CARTAO, ITEM, ROTULO, ROTULO_PEQUENO, BOTAO_SUAVE, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';
import { getTodayStr } from '@/utils/date';
import { ConfirmDialog, MenuMais } from '@/components/common';
import { linkDoWhatsApp, msgCobrancaVencida } from '@/utils/mensagensCliente';
import { OrderReconciliationRow } from '@/types/finance';
import { useReceivablesControl } from '@/hooks/finance/useReceivablesControl';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { PaymentPlanModal } from '@/components/finance/PaymentPlanModal';
import { AlertToast } from '@/components/finance/AlertToast';
import type { PlanInstallment } from '@/utils/paymentPlan';
import { storageService } from '@/services/storage';
import { clientesQueDevem, parcelasParaReceber } from '@/utils/financas/clientes';
import { bancoSugerido } from '@/utils/financas/caixinhas';
import { JanelaDeBaixa } from '@/components/financas/JanelaDeBaixa';
import { formatDate } from '@/utils';
import type { BankAccount, ObligationPayment, ObligationSummary } from '@/types';
import type { CashEnvelope } from '@/types/finance';
import { centavos } from '@/utils/financas/base';
import type { FiltrosDaLista } from '@/utils/financas/lista';

interface EditPlanCtx {
    orderId: string;
    orderNumber: string;
    clientId?: string;
    total: number;
    deliveryDate: string;
}

/** Quem eu cobro, e quanto cada um ainda vai pagar? */
interface Props {
    abrirContas: (f: Partial<FiltrosDaLista>) => void;
    /** Cliente a abrir já na chegada ("Ver o que receber" do Quadro). Sai da lista quem não deve nada. */
    clienteInicial?: string | null;
    limparClienteInicial?: () => void;
}

export function ReceivablesControlPanel({ abrirContas, clienteInicial, limparClienteInicial }: Props) {
    const ctl = useReceivablesControl();
    const { mostrar } = useMostrarValor();
    const hoje = getTodayStr();
    const [editPlan, setEditPlan] = useState<EditPlanCtx | null>(null);
    const [aberto, setAberto] = useState<string | null>(null);
    const [rolarPara, setRolarPara] = useState<string | null>(null);
    const [verDivergencias, setVerDivergencias] = useState(false);
    /** Recebi na própria linha: a mesma JanelaDeBaixa da aba Contas, com o apoio (bancos, caixinhas, pagamentos) lido na primeira vez. */
    const [baixa, setBaixa] = useState<ObligationSummary | null>(null);
    const [apoio, setApoio] = useState<{ bancos: BankAccount[]; caixinhas: CashEnvelope[]; pagamentos: ObligationPayment[] } | null>(null);
    const [erroBaixa, setErroBaixa] = useState('');
    const linhas = useMemo(() => clientesQueDevem(ctl.contas, hoje), [ctl.contas, hoje]);
    const clientes = useMemo(() => new Map(ctl.clientes.map(c => [c.id, c])), [ctl.clientes]);

    // Abre o cliente pedido assim que a lista chega e leva a linha à vista; consome o pedido para não reabrir.
    useEffect(() => {
        if (!clienteInicial || ctl.loading) return;
        if (linhas.some(l => l.clienteId === clienteInicial)) {
            setAberto(clienteInicial);
            setRolarPara(clienteInicial);
        }
        limparClienteInicial?.();
    }, [clienteInicial, ctl.loading, linhas, limparClienteInicial]);

    // Só depois que a linha expandiu: rolar antes mirava a altura de antes de abrir.
    useEffect(() => {
        if (!rolarPara) return;
        document.querySelector(`[data-cliente="${CSS.escape(rolarPara)}"]`)?.scrollIntoView({ block: 'center' });
        setRolarPara(null);
    }, [rolarPara]);

    const handleRevise = async (plan: PlanInstallment[]) => {
        if (!editPlan) return;
        await storageService.reviseOrderPlan({
            order_id: editPlan.orderId,
            client_id: editPlan.clientId,
            description: `Pedido #${editPlan.orderNumber}`,
            plan,
        });
        setEditPlan(null);
        await ctl.reload();
    };

    const abrirBaixa = async (conta: ObligationSummary) => {
        setErroBaixa('');
        try {
            if (!apoio) {
                const [bancos, caixinhas, pag] = await Promise.all([
                    storageService.getBankAccounts(true), storageService.getEnvelopes(), storageService.getAllPaymentsComTeto(),
                ]);
                setApoio({ bancos, caixinhas, pagamentos: pag.pagamentos });
            }
            setBaixa(conta);
        } catch (e) {
            setErroBaixa(e instanceof Error ? e.message : 'Não consegui abrir a baixa.');
        }
    };

    if (ctl.loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
            </div>
        );
    }

    const totais = linhas.reduce((t, l) => ({ vencido: t.vencido + l.vencido, aVencer: t.aVencer + l.aVencer, emProducao: t.emProducao + l.emProducao }),
        { vencido: 0, aVencer: 0, emProducao: 0 });
    const COLUNAS = 'sm:grid-cols-[minmax(0,1fr)_repeat(4,7.5rem)_7rem]';

    return (
        <div className="space-y-6">
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Indicador icone={AlertTriangle} rotulo="Vencido" valor={mostrar(centavos(totais.vencido))} tom={totais.vencido > 0 ? 'rose' : 'zinc'}
                    sub={`${linhas.filter(l => l.vencido > 0).length} cliente(s) para cobrar`} />
                <Indicador icone={Clock} rotulo="A vencer" valor={mostrar(centavos(totais.aVencer))} tom="emerald" sub="pedidos já entregues" />
                <Indicador icone={Factory} rotulo="Em produção" valor={mostrar(centavos(totais.emProducao))} tom="violet" sub="informativo · entra na entrega" />
            </section>

            {ctl.error && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-bold text-rose-400">{ctl.error}</p>}

            {ctl.reconciliation.length > 0 && (
                <section className="space-y-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <button type="button" onClick={() => setVerDivergencias(v => !v)} aria-expanded={verDivergencias}
                        className="flex w-full items-center gap-2 text-left text-[10px] font-black uppercase tracking-widest text-amber-400">
                        <AlertTriangle size={13} /> {ctl.reconciliation.length} pedido(s) com parcelas que não fecham com o total
                        <span className="ml-auto text-zinc-500">{verDivergencias ? 'esconder' : 'ver e ajustar'}</span>
                    </button>
                    {verDivergencias && <ReconcileTable ctl={ctl} mostrar={mostrar} />}
                </section>
            )}

            <section className={`${CARTAO} p-4 space-y-3`}>
                <div className="flex items-center justify-between gap-3">
                    <h2 className={ROTULO}>Clientes · do vencido mais antigo para o mais novo</h2>
                    <MenuMais rotulo="Mais ações" itens={[{ rotulo: ctl.recalculando ? 'Recalculando…' : 'Recalcular scores dos clientes', onClick: () => { if (!ctl.recalculando) void ctl.refreshScores(); } }]} />
                </div>
                {linhas.length === 0 ? (ctl.error ? null : <p className="py-10 text-center text-sm text-zinc-500">Ninguém devendo.</p>) : (
                    <>
                        <div className={`hidden sm:grid ${COLUNAS} gap-3 px-4 ${ROTULO_PEQUENO}`}>
                            <span>Cliente</span>
                            <span className="text-right">Em aberto</span>
                            <span className="text-right">Vencido</span>
                            <span className="text-right">A vencer</span>
                            <span className="text-right">Em produção</span>
                            <span />
                        </div>
                        <ul className="space-y-2">
                            {linhas.map(l => {
                                const cliente = clientes.get(l.clienteId);
                                const nome = cliente?.company_name ?? 'Cliente';
                                const maisAntiga = [...l.vencidas].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
                                const link = maisAntiga && cliente ? linkDoWhatsApp(cliente.phone, msgCobrancaVencida(cliente,
                                    { description: l.vencidas.length > 1 ? `${l.vencidas.length} parcelas` : maisAntiga.description, remaining_amount: l.vencido, due_date: maisAntiga.due_date },
                                    l.diasDoMaisAntigo ?? undefined)) : null;
                                const pedidos = ctl.delivered.filter(d => d.client_id === l.clienteId);
                                return (
                                    <li key={l.clienteId} data-cliente={l.clienteId} className={`${ITEM} relative overflow-hidden p-4 space-y-3`}>
                                        {l.vencido > 0 && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-rose-500" />}
                                        <div className={`grid gap-3 ${COLUNAS} sm:items-center`}>
                                            <button type="button" onClick={() => setAberto(aberto === l.clienteId ? null : l.clienteId)} className="min-w-0 text-left" aria-expanded={aberto === l.clienteId}>
                                                <span className="block truncate text-sm font-bold text-zinc-100">{nome}</span>
                                                <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                                                    {l.diasDoMaisAntigo === null ? 'nada vencido' : <span className="text-rose-400">{l.diasDoMaisAntigo} dia(s) de atraso</span>} · {l.quantidade} parcela(s)
                                                </span>
                                            </button>
                                            <Valor rotulo="Em aberto" valor={centavos(l.vencido + l.aVencer)} tom="text-zinc-100" mostrar={mostrar} />
                                            <Valor rotulo="Vencido" valor={l.vencido} tom={l.vencido > 0 ? 'text-rose-400' : 'text-zinc-600'} mostrar={mostrar} />
                                            <Valor rotulo="A vencer" valor={l.aVencer} tom="text-emerald-400" mostrar={mostrar} />
                                            <Valor rotulo="Em produção" valor={l.emProducao} tom="text-violet-400/70" mostrar={mostrar} />
                                            <div className="sm:text-right">
                                                {l.vencido > 0 && (link
                                                    ? <a href={link} target="_blank" rel="noopener noreferrer" aria-label={`Cobrar ${nome} pelo WhatsApp`} className={`${BOTAO_SUAVE} w-full sm:w-auto`}><MessageCircle size={13} /> Cobrar</a>
                                                    : <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600" title="Cliente sem telefone cadastrado">sem telefone</span>)}
                                            </div>
                                        </div>
                                        {aberto === l.clienteId && (
                                            <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                                                {pedidos.length === 0 ? <p className="text-xs text-zinc-500">Nenhum pedido entregue com saldo.</p> : pedidos.map(p => (
                                                    <div key={p.order_id} className="flex flex-wrap items-center justify-between gap-3">
                                                        <span className="text-sm font-bold text-zinc-200">
                                                            #{p.order_number}
                                                            {p.has_overdue && <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-rose-400">vencido</span>}
                                                        </span>
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">entrou {mostrar(Number(p.received))} · falta {mostrar(Number(p.to_receive))}</span>
                                                        <EditPlanButton onClick={() => setEditPlan({
                                                            orderId: p.order_id, orderNumber: p.order_number, clientId: p.client_id ?? undefined,
                                                            total: Number(p.total), deliveryDate: p.next_due_date || p.deadline || hoje,
                                                        })} />
                                                    </div>
                                                ))}
                                                {parcelasParaReceber(ctl.contas, l.clienteId, hoje).map(c => (
                                                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/70 pt-2">
                                                        <span className="min-w-0 truncate text-sm text-zinc-300">{c.description}</span>
                                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${c.due_date < hoje ? 'text-rose-400' : 'text-zinc-500'}`}>
                                                            {c.due_date < hoje ? 'venceu' : 'vence'} {formatDate(c.due_date)}
                                                        </span>
                                                        <span className="ml-auto font-mono text-sm font-black tabular-nums text-zinc-100">{mostrar(c.remaining_amount)}</span>
                                                        <button type="button" onClick={() => void abrirBaixa(c)} aria-label={`Recebi ${c.description}`} className={BOTAO_SUAVE}>Recebi</button>
                                                    </div>
                                                ))}
                                                {erroBaixa && <p role="alert" className="text-xs font-bold text-rose-400">{erroBaixa}</p>}
                                                <button type="button" onClick={() => abrirContas({ clienteId: l.clienteId, rapido: 'abertas' })}
                                                    className="text-[10px] font-black uppercase tracking-widest text-amber-400 hover:text-amber-300">ver as contas deste cliente →</button>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
                <p className="text-[10px] font-bold text-zinc-600">"Em produção" é informativo: não é cobrança nem atraso. Vira "a vencer" quando o pedido for entregue.</p>
            </section>

            {editPlan && (
                <PaymentPlanModal
                    mode="revise"
                    orderId={editPlan.orderId}
                    orderNumber={editPlan.orderNumber}
                    clientId={editPlan.clientId}
                    description={`Pedido #${editPlan.orderNumber}`}
                    total={editPlan.total}
                    deliveryDate={editPlan.deliveryDate}
                    onConfirm={handleRevise}
                    onClose={() => setEditPlan(null)}
                />
            )}

            {baixa && apoio && (
                <JanelaDeBaixa conta={baixa} bancos={apoio.bancos} caixinhas={apoio.caixinhas}
                    bancoInicial={bancoSugerido({ pagamentos: apoio.pagamentos, contas: ctl.contas, tipo: baixa.type, bancosAtivos: apoio.bancos.filter(b => b.is_active) })}
                    onMaisOpcoes={() => { const c = baixa; setBaixa(null); abrirContas({ clienteId: c.client_id ?? undefined, rapido: 'abertas' }); }}
                    onFechar={() => setBaixa(null)}
                    onConcluido={() => { setBaixa(null); setApoio(null); void ctl.reload(); }} />
            )}

            {ctl.avisoDosScores && createPortal(<AlertToast msg={ctl.avisoDosScores.msg} type={ctl.avisoDosScores.type} />, document.body)}
        </div>
    );
}

function Valor({ rotulo, valor, tom, mostrar }: { rotulo: string; valor: number; tom: string; mostrar: (n: number) => string }) {
    return (
        <span className="flex justify-between gap-2 sm:block sm:text-right">
            <span className={`${ROTULO_PEQUENO} sm:hidden`}>{rotulo}</span>
            <span className={`text-sm font-black font-mono tabular-nums ${tom}`}>{valor > 0 ? mostrar(valor) : '—'}</span>
        </span>
    );
}

function EditPlanButton({ onClick }: { onClick: () => void }) {
    return (
        <button type="button" onClick={onClick}
            className={BOTAO_SECUNDARIO}
            title="Renegociar as parcelas ainda em aberto deste pedido">
            <SlidersHorizontal size={14} /> Plano
        </button>
    );
}

/** Pedidos cujo total não bate com a soma das parcelas. O ajuste nunca altera as parcelas originais. */
function ReconcileTable({ ctl, mostrar }: { ctl: ReturnType<typeof useReceivablesControl>; mostrar: (n: number) => string }) {
    const [confirmAdj, setConfirmAdj] = useState<OrderReconciliationRow | null>(null);
    const adjKind = confirmAdj ? (Number(confirmAdj.delta) > 0 ? 'recebível complementar' : 'crédito ao cliente') : '';
    return (
        <div className="space-y-4">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className={`text-left ${ROTULO_PEQUENO}`}>
                            <th className="py-2 pr-3 font-black">Pedido</th>
                            <th className="py-2 pr-3 font-black">Cliente</th>
                            <th className="py-2 pr-3 font-black text-right">Total do pedido</th>
                            <th className="py-2 pr-3 font-black text-right">Soma das parcelas</th>
                            <th className="py-2 pr-3 font-black text-right">Diferença</th>
                            <th className="py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {ctl.reconciliation.map(r => {
                            const delta = Number(r.delta);
                            return (
                                <tr key={r.order_id} className="border-t border-zinc-900 text-zinc-200">
                                    <td className="py-2 pr-3">#{r.order_number}</td>
                                    <td className="py-2 pr-3">{r.client_name || '—'}</td>
                                    <td className="py-2 pr-3 text-right tabular-nums text-zinc-400">{mostrar(Number(r.order_total))}</td>
                                    <td className="py-2 pr-3 text-right tabular-nums text-zinc-400">{mostrar(Number(r.obligations_total))}</td>
                                    <td className={`py-2 pr-3 text-right tabular-nums ${delta > 0 ? 'text-emerald-400' : 'text-zinc-300'}`}>
                                        {delta > 0 ? '+' : '−'}{mostrar(Math.abs(delta))}
                                    </td>
                                    <td className="py-2 text-right">
                                        <button type="button" onClick={() => setConfirmAdj(r)} disabled={ctl.busy}
                                            className={BOTAO_SUAVE}>
                                            Ajustar
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="text-[10px] font-bold text-zinc-500">
                Diferença positiva: falta cobrar, o ajuste cria um recebível complementar. Negativa: cobrou demais, o ajuste vira crédito ao cliente. As parcelas originais nunca são alteradas.
            </p>

            <ConfirmDialog
                isOpen={!!confirmAdj}
                title="Aplicar ajuste"
                message={confirmAdj
                    ? `Criar ${adjKind} de ${mostrar(Math.abs(Number(confirmAdj.delta)))} para o pedido #${confirmAdj.order_number}? O valor original das obrigações não será alterado.`
                    : ''}
                variant="info"
                confirmLabel="Aplicar"
                isLoading={ctl.busy}
                onConfirm={async () => { if (confirmAdj) { await ctl.applyAdjustment(confirmAdj.order_id, Number(confirmAdj.delta)); setConfirmAdj(null); } }}
                onCancel={() => setConfirmAdj(null)}
            />
        </div>
    );
}
