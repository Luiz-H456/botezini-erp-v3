import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, PackageCheck, AlertTriangle, Loader2 } from 'lucide-react';
import { storageService } from '@/services/storage';
import { formatCurrency } from '@/utils';
import { parseBRL } from '@/utils/currency';
import {
    montarFichaDeEntrega, totalDoAditivo, problemasDoAditivo, aditivoEstaValido,
    type ItemDoAditivo, type ItemEntregue,
} from '@/utils/aditivoDePedido';
import type { Order, OrderAddendum, Client } from '@/types';

import { mensagemDeErro } from '@/utils/errorHandling';
import { useSaidaProtegida } from '@/hooks/useSaidaProtegida';
interface Props {
    order: Order;
    client?: Client | null;
    onClose: () => void;
    onSaved: () => void;
}

const Campo = 'bg-zinc-950/60 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-500/40 transition-colors placeholder:text-zinc-700';

/** Linha do aditivo na tela: guarda também o texto do preço como foi digitado. */
type LinhaDoAditivo = ItemDoAditivo & { preco_texto: string };

/**
 * A ficha que vai junto com a mercadoria.
 *
 * Junta numa tela as três perguntas que se faz na porta do cliente e que hoje
 * moram em lugares diferentes: o que estou entregando, quanto ficou no total, e
 * quanto falta receber.
 *
 * A CONFERÊNCIA VEM PRIMEIRO, o aditivo depois. Quem confere não abre a tela
 * pensando "vou lançar um aditivo" — abre pensando "vamos ver se está tudo
 * aqui". A quantidade entregue começa igual à pedida, e só quando alguém mexe
 * num número é que a diferença aparece e o aditivo é oferecido, já com as
 * peças que sobraram preenchidas.
 *
 * Renderizada em portal porque `fixed` perde a viewport quando qualquer
 * ancestral tem transform, filter ou backdrop-filter — e a tela de pedidos tem.
 */
export function FichaDeEntrega({ order, client, onClose, onSaved }: Props) {
    // Fechar com algo digitado pergunta antes (passada de celular e fábrica: as janelas que faltavam).
    const saida = useSaidaProtegida(onClose);
    const [aditivos, setAditivos] = useState<OrderAddendum[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    /** A conferência: quantas peças de cada linha estão realmente saindo. */
    const [entregue, setEntregue] = useState<Record<number, number>>({});

    const [linhasDoAditivo, setLinhasDoAditivo] = useState<LinhaDoAditivo[]>([]);
    const [motivo, setMotivo] = useState('');
    const [vencimento, setVencimento] = useState('');

    useEffect(() => {
        let vivo = true;
        storageService.getOrderAddendums(order.id)
            .then(a => { if (vivo) setAditivos(a); })
            .catch(() => { /* lista vazia é degradação aceitável aqui */ })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [order.id]);

    const itensConferidos: ItemEntregue[] = useMemo(
        () => (order.items || []).map((it, i) => ({
            product_name: it.product_name || it.model || 'Peça',
            size: it.size,
            quantidadePedida: Number(it.quantity) || 0,
            quantidadeEntregue: entregue[i] ?? (Number(it.quantity) || 0),
        })),
        [order.items, entregue]);

    const valorDosAditivos = useMemo(
        () => aditivos.reduce((s, a) => s + (Number(a.amount) || 0), 0), [aditivos]);

    const ficha = useMemo(() => montarFichaDeEntrega({
        itens: itensConferidos,
        // `total_amount` já vem somado dos aditivos gravados — quem soma é o
        // banco, na hora de gravar. Passar os aditivos de novo aqui contaria
        // cada um duas vezes.
        valorDoPedido: (Number(order.total_amount) || 0) - valorDosAditivos,
        valorDosAditivos,
        valorPago: Number(order.amount_paid) || 0,
    }), [itensConferidos, order.total_amount, order.amount_paid, valorDosAditivos]);

    const sobrando = ficha.divergencias.filter(d => d.diferenca > 0);
    const totalNovo = totalDoAditivo(linhasDoAditivo);
    const problemas = problemasDoAditivo(linhasDoAditivo);

    /** Traz para o aditivo o que a conferência apontou a mais. */
    const puxarDaConferencia = () => {
        setLinhasDoAditivo(sobrando.map(d => ({
            product_name: d.product_name,
            size: d.size ?? null,
            quantity: d.diferenca,
            // Sem preço: o pedido não guarda preço por item, e chutar aqui
            // seria inventar dinheiro. A validação barra o zero.
            unit_price: 0,
            preco_texto: '',
        })));
    };

    const gravar = async () => {
        if (!aditivoEstaValido(linhasDoAditivo)) return;
        setSalvando(true);
        setErro(null);
        try {
            await storageService.addOrderAddendum({
                order_id: order.id,
                items: linhasDoAditivo.map(({ preco_texto: _, ...item }) => item),
                reason: motivo || undefined,
                due_date: vencimento || null,
            });
            onSaved();
        } catch (e: any) {
            setErro(mensagemDeErro(e, 'Falha ao gravar o aditivo'));
            setSalvando(false);
        }
    };

    const alterarLinha = (i: number, campo: keyof ItemDoAditivo, valor: string) => {
        setLinhasDoAditivo(l => l.map((item, j) => j !== i ? item : {
            ...item,
            [campo]: campo === 'quantity' ? (Number(valor.replace(/\D/g, '')) || 0)
                : campo === 'unit_price' ? parseBRL(valor)
                : valor,
            // O que foi digitado fica como está ("12,5" não vira "125"); só o número segue o parse.
            ...(campo === 'unit_price' ? { preco_texto: valor } : {}),
        }));
    };

    return <>{saida.confirmacao}{createPortal(
        <div className="fixed inset-0 z-modal bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" {...saida.aoMexer}>

                <header className="flex items-center justify-between gap-3 p-5 border-b border-zinc-800 shrink-0">
                    <div className="min-w-0">
                        <h2 className="flex items-center gap-2 text-sm font-black text-white uppercase tracking-widest">
                            <PackageCheck size={16} className="text-amber-500" /> Ficha de entrega
                        </h2>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide mt-1 truncate">
                            Pedido {order.order_number}{client?.company_name ? ` · ${client.company_name}` : ''}
                        </p>
                    </div>
                    <button onClick={saida.pedirParaFechar} className="p-2 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors shrink-0">
                        <X size={18} />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-5 space-y-5 min-h-0">

                    {/* ── Conferência ─────────────────────────────────────── */}
                    <section className="space-y-2">
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            Conferência · {ficha.pecasEntregues} de {ficha.pecasPedidas} peças
                        </p>
                        <div className="space-y-1">
                            {itensConferidos.map((it, i) => {
                                const dif = it.quantidadeEntregue - it.quantidadePedida;
                                return (
                                    <div key={i} className="flex items-center gap-2.5 rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-3 py-2">
                                        <span className="flex-1 min-w-0 text-[11px] font-bold text-zinc-200 truncate">
                                            {it.product_name}
                                            {it.size && <span className="text-zinc-600 font-medium"> · {it.size}</span>}
                                        </span>
                                        <span className="text-[10px] text-zinc-600 font-mono shrink-0">
                                            pedido {it.quantidadePedida}
                                        </span>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={it.quantidadeEntregue}
                                            onChange={e => setEntregue(q => ({ ...q, [i]: Number(e.target.value.replace(/\D/g, '')) || 0 }))}
                                            className={`${Campo} w-16 text-center font-mono shrink-0`}
                                            title="Quantas peças estão saindo de verdade"
                                        />
                                        {dif !== 0 && (
                                            <span className={`text-[10px] font-black shrink-0 w-10 text-right ${dif > 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                                                {dif > 0 ? `+${dif}` : dif}
                                            </span>
                                        )}
                                        {dif === 0 && <span className="w-10 shrink-0" />}
                                    </div>
                                );
                            })}
                        </div>

                        {sobrando.length > 0 && linhasDoAditivo.length === 0 && (
                            <button
                                onClick={puxarDaConferencia}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-400 text-[10px] font-black uppercase tracking-widest hover:bg-amber-500/20 transition-colors"
                            >
                                <Plus size={13} />
                                Lançar aditivo das {sobrando.reduce((s, d) => s + d.diferenca, 0)} peças a mais
                            </button>
                        )}

                        {ficha.divergencias.some(d => d.diferenca < 0) && (
                            <p className="flex items-start gap-2 text-[10px] text-rose-300/90 bg-rose-500/[0.07] border border-rose-500/20 rounded-xl px-3 py-2.5 leading-snug">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                {/* Entregar a menos NÃO vira aditivo negativo: abater do
                                    pedido por baixa entrega mexeria no contrato sem que
                                    ninguém tivesse combinado isso. */}
                                <span>
                                    Saiu peça a menos. Isso não abate do pedido automaticamente — o valor
                                    combinado continua valendo até alguém decidir o contrário.
                                </span>
                            </p>
                        )}
                    </section>

                    {/* ── Aditivos já gravados ────────────────────────────── */}
                    {!carregando && aditivos.length > 0 && (
                        <section className="space-y-2">
                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                Aditivos deste pedido
                            </p>
                            {aditivos.map(a => (
                                <div key={a.id} className="flex items-center gap-3 rounded-xl border border-zinc-800/70 bg-zinc-950/50 px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-bold text-zinc-200 truncate">
                                            {a.items.map(i => `${i.quantity}× ${i.product_name}`).join(', ')}
                                        </p>
                                        <p className="text-[10px] text-zinc-600 font-bold">
                                            {new Date(a.created_at).toLocaleDateString('pt-BR')}
                                            {a.reason ? ` · ${a.reason}` : ''}
                                            {a.obligation_id ? ' · cobrança gerada' : ' · sem cobrança à parte'}
                                        </p>
                                    </div>
                                    <span className="text-[11px] font-black text-amber-400 shrink-0">
                                        {formatCurrency(a.amount)}
                                    </span>
                                </div>
                            ))}
                        </section>
                    )}

                    {/* ── Aditivo novo ────────────────────────────────────── */}
                    {linhasDoAditivo.length > 0 && (
                        <section className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3">
                            <p className="text-[10px] font-black text-amber-500/90 uppercase tracking-widest">
                                Aditivo novo
                            </p>

                            {linhasDoAditivo.map((linha, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <input value={linha.product_name}
                                        onChange={e => alterarLinha(i, 'product_name', e.target.value)}
                                        placeholder="Peça" className={`${Campo} flex-1 min-w-0`} />
                                    <input value={linha.size || ''}
                                        onChange={e => alterarLinha(i, 'size', e.target.value)}
                                        placeholder="Tam." className={`${Campo} w-16 shrink-0`} />
                                    <input value={linha.quantity || ''}
                                        onChange={e => alterarLinha(i, 'quantity', e.target.value)}
                                        inputMode="numeric" placeholder="Qtd"
                                        className={`${Campo} w-14 text-center font-mono shrink-0`} />
                                    <input
                                        value={linha.preco_texto}
                                        onChange={e => alterarLinha(i, 'unit_price', e.target.value)}
                                        inputMode="decimal" placeholder="Preço un."
                                        className={`${Campo} w-24 text-right font-mono shrink-0`} />
                                    <button type="button" onClick={() => setLinhasDoAditivo(l => l.filter((_, j) => j !== i))}
                                        aria-label="Remover linha do aditivo"
                                        className="inline-flex h-8 w-8 items-center justify-center text-zinc-700 hover:text-rose-400 transition-colors shrink-0">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}

                            <button
                                onClick={() => setLinhasDoAditivo(l => [...l, { product_name: '', quantity: 1, unit_price: 0, preco_texto: '' }])}
                                className="text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-widest transition-colors"
                            >
                                + outra peça
                            </button>

                            <input value={motivo} onChange={e => setMotivo(e.target.value)}
                                placeholder="Por que foi acrescentado (fica gravado)"
                                className={`${Campo} w-full`} />

                            <div className="space-y-1">
                                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                    Vencimento da cobrança à parte
                                </label>
                                <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)}
                                    className={`${Campo} w-full`} />
                                <p className="text-[10px] text-zinc-600 font-bold leading-snug">
                                    {/* Deixar em branco é uma escolha legítima, não um campo
                                        esquecido — o cliente que paga tudo no ato não precisa
                                        de um recebível separado. */}
                                    Em branco: o total do pedido sobe e não nasce cobrança separada.
                                    Use quando o cliente vai pagar tudo junto.
                                </p>
                            </div>

                            {problemas.length > 0 && (
                                <p className="text-[10px] text-rose-400 font-bold leading-snug">
                                    {problemas[0].mensagem}
                                </p>
                            )}
                        </section>
                    )}

                    {/* ── O dinheiro ──────────────────────────────────────── */}
                    <section className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 space-y-1.5">
                        {[
                            ['Pedido', ficha.valorDoPedido],
                            ...(ficha.valorDosAditivos ? [['Aditivos', ficha.valorDosAditivos] as const] : []),
                            ...(totalNovo ? [['Aditivo novo', totalNovo] as const] : []),
                        ].map(([rotulo, valor]) => (
                            <div key={rotulo as string} className="flex justify-between text-[11px]">
                                <span className="text-zinc-500 font-bold">{rotulo}</span>
                                <span className="text-zinc-300 font-mono">{formatCurrency(Number(valor))}</span>
                            </div>
                        ))}
                        <div className="flex justify-between text-[12px] pt-1.5 border-t border-zinc-800">
                            <span className="text-white font-black uppercase tracking-widest">Total</span>
                            <span className="text-white font-black font-mono">
                                {formatCurrency(ficha.valorTotal + totalNovo)}
                            </span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                            <span className="text-zinc-500 font-bold">Já pago</span>
                            <span className="text-emerald-400 font-mono">{formatCurrency(ficha.valorPago)}</span>
                        </div>
                        <div className="flex justify-between text-[12px] pt-1.5 border-t border-zinc-800">
                            <span className="text-white font-black uppercase tracking-widest">
                                {/* Saldo negativo é crédito do cliente, e a ficha diz isso
                                    em vez de mostrar um zero que esconde dinheiro dele. */}
                                {ficha.saldoAPagar + totalNovo < 0 ? 'Crédito do cliente' : 'Falta receber'}
                            </span>
                            <span className={`font-black font-mono ${
                                ficha.saldoAPagar + totalNovo <= 0.005 ? 'text-emerald-400' : 'text-amber-400'
                            }`}>
                                {formatCurrency(Math.abs(ficha.saldoAPagar + totalNovo))}
                            </span>
                        </div>
                    </section>

                    {erro && (
                        <p className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-[10px] font-bold leading-relaxed">
                            <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {erro}
                        </p>
                    )}
                </div>

                {linhasDoAditivo.length > 0 && (
                    <div className="p-5 border-t border-zinc-800 bg-zinc-950/40 flex gap-2 shrink-0">
                        <button onClick={() => { setLinhasDoAditivo([]); setErro(null); }}
                            className="px-5 py-3 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors">
                            Descartar aditivo
                        </button>
                        <button onClick={gravar} disabled={salvando || !aditivoEstaValido(linhasDoAditivo)}
                            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-40 disabled:bg-zinc-800 disabled:text-zinc-500">
                            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} strokeWidth={3} />}
                            {salvando ? 'Gravando...' : `Gravar aditivo de ${formatCurrency(totalNovo)}`}
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    )}</>;
}

export default FichaDeEntrega;
