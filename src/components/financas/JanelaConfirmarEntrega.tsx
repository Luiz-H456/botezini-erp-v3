import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@/components/common';
import { storageService } from '@/services/storage';
import { productionRepository } from '@/repositories/productionRepository';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { getTodayStr } from '@/utils/date';
import type { ObligationSummary } from '@/types';
import { separarParcelas, planoInicial, conferirEntrega, planoMudou } from '@/utils/financas/entrega';
import type { ParcelaEditavel } from '@/utils/financas/entrega';
import { BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

const MEIOS = ['PIX', 'Boleto', 'Cartão', 'Dinheiro', 'TED', 'Cheque', 'Outro'];
/** O prazo do pedido, mas nunca no passado: parcela nova não nasce vencida. */
const prazoDaParcela = (prazoDoPedido: string | null | undefined, hoje: string) =>
    prazoDoPedido && prazoDoPedido > hoje ? prazoDoPedido : hoje;

const campo = 'w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-600';

interface Props {
    pedidoId: string;
    numero: string;
    cliente?: string;
    /** Chão de fábrica (papel factory ou tela cheia): sem valores e sem editar parcelas. */
    semFinanceiro: boolean;
    ocupado: boolean;
    onCancelar: () => void;
    /** Marca o pedido como entregue — é o confirmDelivery do kanban. */
    onConfirmar: () => Promise<void> | void;
    /** Atalho para a ficha de entrega (conferir o que sai antes de confirmar). Some no chão de fábrica. */
    onAbrirFicha?: () => void;
    /** A ficha está sendo lida: o botão desabilita e mostra "Abrindo…". */
    abrindoFicha?: boolean;
}

/**
 * Na entrega, as parcelas que esperavam por ela passam a valer: vencem e cobram.
 * A entrada já valia desde o pedido (entrada_vale_antes_da_entrega.sql).
 */
export function JanelaConfirmarEntrega({ pedidoId, numero, cliente, semFinanceiro, ocupado, onCancelar, onConfirmar, onAbrirFicha, abrindoFicha }: Props) {
    const { mostrar, oculto } = useMostrarValor();
    const [carregando, setCarregando] = useState(!semFinanceiro);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    /** Só vira true quando pedido e parcelas foram lidos: sem isso a conferência não vale. */
    const [leituraOk, setLeituraOk] = useState(false);
    const [total, setTotal] = useState(0);
    const [clienteId, setClienteId] = useState<string | null>(null);
    const [fixas, setFixas] = useState<ObligationSummary[]>([]);
    const [abertas, setAbertas] = useState<ObligationSummary[]>([]);
    const [editaveis, setEditaveis] = useState<ParcelaEditavel[]>([]);

    useEffect(() => {
        if (semFinanceiro) return;
        let vivo = true;
        (async () => {
            try {
                const [pedido, contas] = await Promise.all([
                    productionRepository.lerPedidoParaEntrega(pedidoId),
                    storageService.getObligations({ order_id: pedidoId, type: 'receivable' }),
                ]);
                if (!vivo) return;
                const s = separarParcelas(contas as ObligationSummary[]);
                setTotal(pedido.total_amount);
                setClienteId(pedido.client_id);
                setFixas(s.fixas);
                setAbertas(s.abertas);
                setEditaveis(planoInicial({
                    abertas: s.abertas, fixas: s.fixas, totalDoPedido: pedido.total_amount,
                    prazo: prazoDaParcela(pedido.deadline, getTodayStr()),
                }));
                setLeituraOk(true);
            } catch (e) {
                if (vivo) setErro(e instanceof Error ? e.message : 'Não consegui ler as parcelas do pedido.');
            } finally {
                if (vivo) setCarregando(false);
            }
        })();
        return () => { vivo = false; };
    }, [pedidoId, semFinanceiro]);

    const conferencia = useMemo(
        () => conferirEntrega({ totalDoPedido: total, fixas, editaveis }), [total, fixas, editaveis]);

    const mudar = (i: number, mudanca: Partial<ParcelaEditavel>) =>
        setEditaveis(lista => lista.map((p, j) => (j === i ? { ...p, ...mudanca } : p)));

    const confirmar = async () => {
        if (salvando) return;
        setSalvando(true);
        setErro('');
        try {
            if (!semFinanceiro) {
                if (!leituraOk || !conferencia.confere) return;
                if (editaveis.length > 0 && planoMudou(abertas, editaveis)) {
                    await storageService.reviseOrderPlan({
                        order_id: pedidoId, client_id: clienteId ?? undefined,
                        description: `Pedido #${numero}`, plan: editaveis,
                    });
                }
            }
            await onConfirmar();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não consegui confirmar a entrega.');
        } finally {
            setSalvando(false);
        }
    };

    // Gravando, a janela não fecha: sair no meio deixaria o pedido ser marcado Entregue depois do Voltar.
    const voltar = () => { if (!salvando) onCancelar(); };

    const podeTirar = !(editaveis.length <= 1 && abertas.length > 0);

    // Portal: o quadro do PCP contém filhos fixos e cortaria a janela.
    return createPortal(
        <Modal isOpen onClose={voltar} title={`Confirmar entrega · pedido ${numero}`} maxWidth="2xl">
            <div className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
                {cliente && <p className="text-sm text-zinc-400">{cliente}</p>}

                {semFinanceiro ? (
                    <p className="text-sm text-zinc-300">
                        O pedido sai do quadro e as parcelas que esperavam a entrega passam a valer como contas a receber.
                    </p>
                ) : carregando ? (
                    <p className="text-sm text-zinc-500">Lendo as parcelas…</p>
                ) : !leituraOk ? null : (
                    <>
                        <p className="text-xs text-zinc-500">
                            As parcelas que esperavam a entrega passam a valer agora. Confira valor, vencimento e meio.
                        </p>
                        <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl">
                            {fixas.map(c => (
                                <div key={c.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                                    <span className="text-zinc-400 truncate">{c.description}</span>
                                    <span className="tabular-nums text-emerald-400 shrink-0">
                                        {mostrar(c.original_amount)} · {c.remaining_amount > 0 ? `falta ${mostrar(c.remaining_amount)}` : 'recebida ✓'}
                                    </span>
                                </div>
                            ))}
                            {editaveis.map((p, i) => (
                                <div key={i} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_7rem_auto] gap-2 items-center px-4 py-2.5">
                                    <span className="col-span-2 sm:col-span-1 text-sm text-zinc-300 truncate">{p.label}</span>
                                    <input type="number" step="0.01" min="0" value={p.amount}
                                        onChange={e => mudar(i, { amount: Number(e.target.value) })}
                                        className={`${campo} text-right tabular-nums`} aria-label={`Valor da ${p.label}`} />
                                    <input type="date" value={p.due} onChange={e => mudar(i, { due: e.target.value })}
                                        className={campo} aria-label={`Vencimento da ${p.label}`} />
                                    <select value={p.method} onChange={e => mudar(i, { method: e.target.value })}
                                        className={campo} aria-label={`Meio da ${p.label}`}>
                                        {MEIOS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <button type="button" disabled={!podeTirar}
                                        onClick={() => setEditaveis(l => l.filter((_, j) => j !== i))}
                                        className="text-xs text-zinc-500 hover:text-zinc-200 disabled:opacity-30">tirar</button>
                                </div>
                            ))}
                        </div>
                        <button type="button"
                            onClick={() => setEditaveis(l => [...l, {
                                label: `Parcela ${fixas.length + l.length + 1}`,
                                amount: Math.max(0, conferencia.diferenca), due: getTodayStr(), method: 'PIX',
                            }])}
                            className="text-xs text-amber-400 hover:text-amber-300">+ parcela</button>
                        <div className="flex justify-between gap-3 text-sm border-t border-zinc-800 pt-3">
                            <span className="text-zinc-400">Total do pedido {mostrar(total)}</span>
                            <span className={conferencia.confere ? 'text-emerald-400' : 'text-amber-400'}>
                                {conferencia.confere ? 'fecha com o pedido ✓' : oculto ? 'não fecha com o pedido' : conferencia.problema}
                            </span>
                        </div>
                    </>
                )}

                {erro && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm font-bold text-rose-400">{erro}</p>}

                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={voltar} disabled={salvando}
                        className="inline-flex h-10 items-center justify-center px-4 rounded-xl border border-zinc-800 bg-zinc-950/50 text-zinc-400 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-zinc-700 disabled:opacity-40">Voltar</button>
                    {onAbrirFicha && !semFinanceiro && (
                        <button type="button" onClick={onAbrirFicha} disabled={salvando || abrindoFicha} className={BOTAO_SECUNDARIO}>{abrindoFicha ? 'Abrindo…' : 'Ficha de entrega'}</button>
                    )}
                    <button type="button" onClick={confirmar}
                        disabled={salvando || ocupado || (!semFinanceiro && (carregando || !leituraOk || !conferencia.confere))}
                        className="inline-flex h-10 items-center justify-center gap-2 px-4 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 disabled:opacity-40">
                        Confirmar entrega
                    </button>
                </div>
            </div>
        </Modal>,
        document.body,
    );
}
