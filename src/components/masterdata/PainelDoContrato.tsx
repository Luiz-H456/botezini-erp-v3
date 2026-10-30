import React, { useState, useMemo } from 'react';
import { Repeat, Sparkles, Plus, Trash2, CalendarDays, Info } from 'lucide-react';
import { formatCurrency, formatDate, getTodayStr } from '@/utils';
import { InfoTooltip } from '@/components/common';
import {
    agendaDoContrato, resumirContrato, sugerirContrato,
    ROTULO_PERIODICIDADE, MESES_DA_PERIODICIDADE,
} from '@/utils/contratoRecorrente';
import type { ContratoRecorrente, Periodicidade } from '@/utils/contratoRecorrente';
import type { PecaDoCliente } from '@/utils/dossieDoCliente';

interface Props {
    clientId: string;
    pecas: PecaDoCliente[];
    intervaloMedioDias: number | null;
}

const InputCls = 'w-full bg-zinc-950/60 border border-zinc-800 rounded-xl px-3 py-2 text-[12px] text-zinc-200 outline-none focus:border-amber-500/30 transition-all';
const RotuloCls = 'text-[10px] font-black text-zinc-600 uppercase tracking-widest block mb-1.5';

/**
 * Simulador de contrato recorrente — v1.
 *
 * NÃO PERSISTE NADA ainda, e isso é deliberado: antes de gravar contrato no
 * banco é preciso saber se o formato serve, e um esquema criado sobre um
 * desenho não validado vira migração para desfazer. Aqui a pessoa monta,
 * enxerga o total e a agenda, e leva a proposta para o cliente — o que já é o
 * suficiente para descobrir se a ideia fecha.
 *
 * A entrada padrão vem do histórico: o melhor argumento de contrato é mostrar
 * ao cliente o que ele já pede, no ritmo em que já pede, com o preço travado.
 */
export const PainelDoContrato: React.FC<Props> = ({ clientId, pecas, intervaloMedioDias }) => {
    const sugerido = useMemo(
        () => sugerirContrato(clientId, intervaloMedioDias, pecas, getTodayStr()),
        [clientId, intervaloMedioDias, pecas]);

    const [contrato, setContrato] = useState<ContratoRecorrente | null>(null);

    const agenda = useMemo(() => (contrato ? agendaDoContrato(contrato) : []), [contrato]);
    const resumo = useMemo(() => (contrato ? resumirContrato(contrato) : null), [contrato]);

    if (!contrato) {
        return (
            <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800 shrink-0">
                        <Repeat className="text-amber-500" size={16} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
                            Contrato recorrente
                        </h3>
                        <p className="text-[10px] text-zinc-500 font-bold mt-1 leading-relaxed">
                            Entrega fixa por período, com preço travado. Para o cliente vale o preço
                            protegido; para a fábrica, saber com meses de antecedência que aquelas
                            peças entram — o que muda a compra de tecido e a fila do PCP.
                        </p>
                    </div>
                </div>

                <div className="bg-amber-500/[0.06] border border-amber-500/25 rounded-xl p-3">
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">
                        <Info size={12} className="inline mb-0.5 mr-1" /> Primeira versão
                    </p>
                    <p className="text-[10px] text-zinc-400 font-bold leading-relaxed">
                        Simula e imprime a proposta, mas ainda <b className="text-zinc-300">não grava
                        nem gera pedido sozinho</b>. É de propósito: contrato que emite pedido sem
                        alguém olhar entrega lote que ninguém conferiu. Depois de rodar com um
                        cliente real, a gente decide o que vale persistir.
                    </p>
                </div>

                {sugerido ? (
                    <button
                        onClick={() => setContrato(sugerido)}
                        className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black uppercase tracking-widest transition-colors">
                        <Sparkles size={14} /> Montar a partir do histórico
                    </button>
                ) : (
                    <p className="text-[10px] text-zinc-600 font-bold">
                        Sem histórico de peças com preço, não há o que propor ainda. Faça ao menos um
                        orçamento para este cliente.
                    </p>
                )}
            </div>
        );
    }

    const atualizarItem = (i: number, patch: Partial<ContratoRecorrente['itens'][0]>) =>
        setContrato({
            ...contrato,
            itens: contrato.itens.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
        });

    return (
        <div className="space-y-4">
            <div className="bg-zinc-950/40 border border-zinc-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                        <Repeat size={14} className="text-amber-500" /> Contrato recorrente
                        <InfoTooltip width={320}>
                            <p className="text-[11px] font-black text-white mb-1">Simulação, não compromisso</p>
                            <p className="text-[10px] text-zinc-400 leading-relaxed">
                                Nada é gravado nem vira pedido automaticamente. Serve para montar a
                                proposta e ver o total antes de falar com o cliente.
                            </p>
                        </InfoTooltip>
                    </h3>
                    <button onClick={() => setContrato(null)}
                        className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-300">
                        Recomeçar
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <label className={RotuloCls}>Periodicidade</label>
                        <select
                            className={InputCls}
                            value={contrato.periodicidade}
                            onChange={e => setContrato({ ...contrato, periodicidade: e.target.value as Periodicidade })}
                        >
                            {Object.keys(MESES_DA_PERIODICIDADE).map(p => (
                                <option key={p} value={p}>{ROTULO_PERIODICIDADE[p as Periodicidade]}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={RotuloCls}>Primeira entrega</label>
                        <input type="date" className={InputCls} value={contrato.inicio}
                            onChange={e => setContrato({ ...contrato, inicio: e.target.value })} />
                    </div>
                    <div>
                        <label className={RotuloCls}>Nº de entregas</label>
                        <input type="number" min={1} className={InputCls} value={contrato.ciclos}
                            onChange={e => setContrato({ ...contrato, ciclos: parseInt(e.target.value) || 0 })} />
                    </div>
                </div>

                <div>
                    <label className={RotuloCls}>Reajuste anual (%) — opcional</label>
                    <input type="number" step="0.1" className={`${InputCls} max-w-[160px]`}
                        placeholder="Ex: 8"
                        value={contrato.reajusteAnualPct ?? ''}
                        onChange={e => setContrato({
                            ...contrato,
                            reajusteAnualPct: e.target.value === '' ? undefined : parseFloat(e.target.value),
                        })} />
                    <p className="text-[10px] text-zinc-600 font-bold mt-1.5">
                        Aplicado a cada 12 meses contados do início, e composto — não somado.
                    </p>
                </div>

                {/* ── Itens ─────────────────────────────────────────────── */}
                <div className="space-y-2">
                    <label className={RotuloCls}>Peças por entrega</label>
                    {contrato.itens.map((it, i) => (
                        <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-center">
                            <input className={InputCls} value={it.produto}
                                onChange={e => atualizarItem(i, { produto: e.target.value })} />
                            <input type="number" className={InputCls} value={it.quantidade}
                                onChange={e => atualizarItem(i, { quantidade: parseInt(e.target.value) || 0 })} />
                            <input type="number" step="0.01" className={InputCls} value={it.precoUnitario}
                                onChange={e => atualizarItem(i, { precoUnitario: parseFloat(e.target.value) || 0 })} />
                            <button
                                onClick={() => setContrato({ ...contrato, itens: contrato.itens.filter((_, x) => x !== i) })}
                                className="p-2 text-zinc-600 hover:text-rose-400 transition-colors">
                                <Trash2 size={13} />
                            </button>
                        </div>
                    ))}
                    <button
                        onClick={() => setContrato({ ...contrato, itens: [...contrato.itens, { produto: '', quantidade: 1, precoUnitario: 0 }] })}
                        className="w-full py-2 border border-dashed border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-400 hover:border-zinc-700 transition-colors">
                        <Plus size={12} className="inline mb-0.5 mr-1" /> Adicionar peça
                    </button>
                </div>
            </div>

            {/* ── Resumo ────────────────────────────────────────────────── */}
            {resumo && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-zinc-950/50 border border-zinc-800 rounded-2xl p-4">
                        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Por entrega</p>
                        <p className="text-lg font-black font-mono text-white mt-1">{formatCurrency(resumo.valorDoCiclo)}</p>
                        <p className="text-[10px] text-zinc-600 font-bold">{resumo.pecasPorCiclo} peças</p>
                    </div>
                    <div className="bg-zinc-950/50 border border-amber-500/30 rounded-2xl p-4">
                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Total do contrato</p>
                        <p className="text-lg font-black font-mono text-amber-500 mt-1">{formatCurrency(resumo.valorTotal)}</p>
                        <p className="text-[10px] text-zinc-600 font-bold">{resumo.pecasTotais} peças no total</p>
                    </div>
                    <div className="bg-zinc-950/50 border border-zinc-800 rounded-2xl p-4">
                        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Duração</p>
                        <p className="text-lg font-black font-mono text-white mt-1">{resumo.duracaoMeses} meses</p>
                        <p className="text-[10px] text-zinc-600 font-bold">{contrato.ciclos} entregas</p>
                    </div>
                    <div className="bg-zinc-950/50 border border-zinc-800 rounded-2xl p-4">
                        <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Período</p>
                        <p className="text-[11px] font-bold text-zinc-300 mt-2 font-mono">
                            {resumo.primeiraEntrega ? formatDate(resumo.primeiraEntrega) : '—'}
                        </p>
                        <p className="text-[11px] font-bold text-zinc-300 font-mono">
                            até {resumo.ultimaEntrega ? formatDate(resumo.ultimaEntrega) : '—'}
                        </p>
                    </div>
                </div>
            )}

            {/* ── Agenda ────────────────────────────────────────────────── */}
            {agenda.length > 0 && (
                <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                            <CalendarDays size={12} className="inline mb-0.5 mr-1.5" />
                            Agenda de entregas — é ela que o PCP usa para reservar capacidade
                        </p>
                    </div>
                    <div className="max-h-72 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left text-[11px]">
                            <tbody className="divide-y divide-zinc-900">
                                {agenda.map(e => (
                                    <tr key={e.ciclo} className="hover:bg-zinc-800/40 transition-colors">
                                        <td className="px-4 py-2.5 font-mono text-zinc-600 w-12">{e.ciclo}</td>
                                        <td className="px-4 py-2.5 text-zinc-300 font-bold">{formatDate(e.data)}</td>
                                        <td className="px-4 py-2.5 font-mono text-zinc-500">{e.pecas} peças</td>
                                        <td className="px-4 py-2.5 font-mono text-zinc-300 text-right">
                                            {formatCurrency(e.valor)}
                                            {e.reajustado && (
                                                <span className="ml-2 text-[10px] font-black uppercase text-amber-500/80">reajustado</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
