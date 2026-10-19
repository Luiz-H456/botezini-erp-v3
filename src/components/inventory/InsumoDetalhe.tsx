import React, { useMemo } from 'react';
import {
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { StickyNote, TrendingUp, TrendingDown, Minus, PackageSearch } from 'lucide-react';
import { Insumo } from '@/types';
import { formatCurrency } from '@/utils';
import { useInsumoMovements } from '@/hooks/useInventoryQueries';
import { historicoDeInsumo, serieDePrecos } from '@/utils/historicoDePrecos';
import { ITEM, ROTULO, ROTULO_PEQUENO } from '@/components/finance/ui/estilo';
import { numero, percentual } from '@/utils/numeros';
import { rotuloDaOrigem } from '@/utils/fabrica/origemDoMovimento';

const COR_GRADE = '#27272a';
const COR_EIXO = '#71717a';

interface Props { insumo: Insumo; }

const MAX_MOVIMENTOS = 30;

/**
 * Linha expandida do insumo: observações, histórico de compras e preço no tempo.
 *
 * As observações viviam gravadas no cadastro e não apareciam em tela nenhuma —
 * campo que só recebe e nunca devolve. Aqui é onde elas aparecem.
 *
 * As movimentações só são buscadas quando a linha abre: carregar o histórico de
 * todos os insumos junto com a lista seria uma consulta por item para um dado
 * que quase sempre ninguém olha.
 */
const InsumoDetalhe: React.FC<Props> = ({ insumo }) => {
    const { data: movimentos = [], isLoading } = useInsumoMovements(insumo.id);

    const historico = useMemo(
        () => historicoDeInsumo(movimentos as any, insumo.id),
        [movimentos, insumo.id]);

    const serie = useMemo(
        () => historico ? serieDePrecos(historico.compras) : [],
        [historico]);

    return (
        <div className="bg-zinc-950/60 border-t border-zinc-800/50 p-5 space-y-4 ease-out animate-in fade-in duration-200">
            {insumo.notes && (
                <div className={`flex items-start gap-3 ${ITEM} p-4`}>
                    <StickyNote size={15} className="text-amber-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                        <p className={`${ROTULO_PEQUENO} mb-1`}>Observações</p>
                        <p className="text-zinc-300 text-sm whitespace-pre-wrap break-words">{insumo.notes}</p>
                    </div>
                </div>
            )}

            {isLoading ? (
                <p className={`${ROTULO} py-6 text-center`}>Carregando histórico...</p>
            ) : !historico ? (
                <div className="text-center py-8">
                    <PackageSearch size={32} className="mx-auto text-zinc-700 mb-3" />
                    <p className="text-zinc-500 text-sm">Nenhuma compra com custo lançada para este insumo.</p>
                    <p className="text-zinc-600 text-xs mt-1">Registre entradas com valor unitário para o histórico de preço aparecer aqui.</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <Indicador label="Preço médio" valor={formatCurrency(historico.precoMedio)}
                            sub="ponderado pela quantidade" destaque />
                        <Indicador label="Último preço" valor={formatCurrency(historico.ultimoPreco)}
                            sub={historico.desvioDoMedioPct !== null
                                ? `${percentual(historico.desvioDoMedioPct, 1, true)} vs. médio`
                                : undefined}
                            tom={historico.desvioDoMedioPct === null ? 'zinc'
                                : historico.desvioDoMedioPct > 5 ? 'rose'
                                    : historico.desvioDoMedioPct < -5 ? 'emerald' : 'zinc'} />
                        <Indicador label="Faixa" valor={`${formatCurrency(historico.menorPreco)} – ${formatCurrency(historico.maiorPreco)}`} />
                        <Indicador label="Variação"
                            valor={historico.variacaoPct === null ? '—' : percentual(historico.variacaoPct, 1, true)}
                            sub={historico.variacaoPct === null ? 'compra única' : 'da 1ª à última compra'}
                            tom={historico.variacaoPct === null ? 'zinc' : historico.variacaoPct > 0 ? 'rose' : 'emerald'}
                            icone={historico.variacaoPct === null ? Minus : historico.variacaoPct > 0 ? TrendingUp : TrendingDown} />
                        <Indicador label="Comprado" valor={`${historico.quantidadeTotal.toLocaleString('pt-BR')} ${insumo.unit}`}
                            sub={`${historico.compras.length} compra${historico.compras.length > 1 ? 's' : ''} · ${formatCurrency(historico.valorTotal)}`} />
                    </div>

                    {serie.length > 1 && (
                        <div className={`${ITEM} p-4`}>
                            <p className={`${ROTULO_PEQUENO} mb-4`}>
                                Preço pago no tempo — linha cheia é o preço da compra, tracejada é a média acumulada até ali
                            </p>
                            <div className="h-56">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={serie} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} vertical={false} />
                                        <XAxis dataKey="rotulo" stroke={COR_EIXO} tick={{ fontSize: 10 }} />
                                        <YAxis stroke={COR_EIXO} tick={{ fontSize: 10 }} width={60}
                                            tickFormatter={(v: number) => formatCurrency(v)} />
                                        <Tooltip
                                            contentStyle={{ background: '#09090b', border: '1px solid #27272a', borderRadius: 12, fontSize: 12 }}
                                            labelStyle={{ color: '#a1a1aa', fontWeight: 700 }}
                                            formatter={(v: any, nome?: string) => [
                                                formatCurrency(Number(v)),
                                                nome === 'preco' ? 'Preço pago' : 'Média até aqui',
                                            ]}
                                        />
                                        <ReferenceLine y={historico.precoMedio} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.4} />
                                        <Line type="monotone" dataKey="preco" stroke="#f59e0b" strokeWidth={2}
                                            dot={{ r: 3, fill: '#f59e0b' }} activeDot={{ r: 5 }} />
                                        <Line type="monotone" dataKey="medioAcumulado" stroke="#71717a" strokeWidth={1.5}
                                            strokeDasharray="5 4" dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    <div className={`${ITEM} overflow-hidden`}>
                        <p className={`${ROTULO_PEQUENO} px-4 py-3 border-b border-zinc-800`}>
                            Lançamentos de entrada
                        </p>
                        <table className="w-full text-left">
                            <tbody className="divide-y divide-zinc-800/50">
                                {historico.compras.slice().reverse().map((c, i) => (
                                    <tr key={c.id || i} className="hover:bg-zinc-800/20 transition-all">
                                        <td className="px-4 py-2.5 text-zinc-400 text-xs font-mono whitespace-nowrap">
                                            {c.data ? new Date(c.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                                        </td>
                                        <td className="px-4 py-2.5 text-zinc-400 text-xs font-mono text-right whitespace-nowrap">
                                            {c.quantidade.toLocaleString('pt-BR')} {insumo.unit}
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-mono text-sm whitespace-nowrap">
                                            <span className={c.valorUnitario > historico.precoMedio ? 'text-rose-400' : 'text-emerald-400'}>
                                                {formatCurrency(c.valorUnitario)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-mono text-zinc-300 text-xs whitespace-nowrap">{formatCurrency(c.valorTotal)}</td>
                                        <td className="px-4 py-2.5 text-zinc-600 text-[10px] italic">{c.notas || ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Toda entrada e saída, com a origem de cada uma. Sem valores: custo está no bloco acima. */}
            {!isLoading && movimentos.length > 0 && (
                <div className={`${ITEM} overflow-hidden`}>
                    <p className={`${ROTULO_PEQUENO} px-4 py-3 border-b border-zinc-800`}>
                        Movimentações{movimentos.length > MAX_MOVIMENTOS && ` (últimas ${MAX_MOVIMENTOS})`}
                    </p>
                    <table className="w-full text-left">
                        <tbody className="divide-y divide-zinc-800/50">
                            {movimentos.slice(0, MAX_MOVIMENTOS).map((m, i) => (
                                <tr key={m.id || i}>
                                    <td className="px-4 py-2.5 text-zinc-400 text-xs font-mono whitespace-nowrap">
                                        {m.created_at ? new Date(m.created_at).toLocaleDateString('pt-BR') : '—'}
                                    </td>
                                    <td className={`px-4 py-2.5 text-xs font-mono text-right whitespace-nowrap ${m.type === 'IN' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {m.type === 'IN' ? '+' : '−'}{numero(Number(m.quantity))} {insumo.unit}
                                    </td>
                                    <td className="px-4 py-2.5 text-zinc-300 text-xs">{rotuloDaOrigem(m.source)}</td>
                                    <td className="px-4 py-2.5 text-zinc-600 text-[10px] italic">{m.notes || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

function Indicador({ label, valor, sub, tom = 'zinc', destaque, icone: Icone }: {
    label: string; valor: string; sub?: string;
    tom?: 'zinc' | 'emerald' | 'rose'; destaque?: boolean; icone?: React.ElementType;
}) {
    const cor = destaque ? 'text-amber-500'
        : tom === 'emerald' ? 'text-emerald-400'
            : tom === 'rose' ? 'text-rose-400' : 'text-white';
    return (
        <div className={`${ITEM} p-3`}>
            <p className={`${ROTULO_PEQUENO} mb-1 flex items-center gap-2`}>
                {Icone && <Icone size={12} />} {label}
            </p>
            <p className={`text-base font-black font-mono tracking-tighter ${cor}`}>{valor}</p>
            {sub && <p className="text-[9px] text-zinc-600 font-bold mt-0.5">{sub}</p>}
        </div>
    );
}

export default InsumoDetalhe;
