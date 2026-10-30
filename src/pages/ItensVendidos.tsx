import { useState } from 'react';
import {
    RefreshCw, Search, X, ShoppingBag, Layers, AlertTriangle, TrendingUp, ListFilter,
} from 'lucide-react';
import { formatCurrency } from '@/utils';
import { useItensVendidos, OrdenacaoItens } from '@/hooks/useItensVendidos';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { serieMensal, ranking } from '@/utils/itensVendidos';
import type { Metrica as MetricaGrafico, LinhaVendida } from '@/utils/itensVendidos';
import type { ResultadoDeMargem } from '@/utils/lucratividade';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { SearchableSelect, InfoTooltip } from '@/components/common';
import { QuadranteDeProdutos } from '@/components/vendas/QuadranteDeProdutos';
import { ProdutosEMercado } from '@/components/vendas/ProdutosEMercado';
import { CARTAO, ITEM, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_SECUNDARIO, pilula } from '@/components/finance/ui/estilo';
import { IndicadorRecarga } from '@/components/common/IndicadorRecarga';
import { ParecerDoMes } from '@/components/vendas/ParecerDoMes';
import { LucroPorPedido } from '@/components/vendas/LucroPorPedido';

const th = `text-left px-4 py-2.5 whitespace-nowrap ${ROTULO_PEQUENO}`;
const td = 'px-4 py-2.5 text-xs text-zinc-300';
const tdMono = 'px-4 py-2.5 text-xs font-mono font-bold text-right whitespace-nowrap';

const fmtDia = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—');

const ORDENS: { v: OrdenacaoItens; l: string }[] = [
    { v: 'data', l: 'Mais recente' },
    { v: 'valor', l: 'Maior valor' },
    { v: 'quantidade', l: 'Maior quantidade' },
    { v: 'empresa', l: 'Empresa (A-Z)' },
    { v: 'produto', l: 'Produto (A-Z)' },
];

export default function ItensVendidos() {
    const v = useItensVendidos();
    const [aba, setAba] = useState<'lista' | 'grafico' | 'produto' | 'margem' | 'quadrante'>('lista');
    // Faturamento e peças têm escalas diferentes: alternam no mesmo eixo em vez
    // de dividir um gráfico de dois eixos, que é o erro clássico de leitura.
    const [metrica, setMetrica] = useState<MetricaGrafico>('valor');

    const temFiltro = !!(v.busca || v.empresa || v.de || v.ate);

    if (v.loading) {
        return (
            <div className="space-y-5 pb-20">
                <ParecerDoMes />
                {/* Mesma raiz e mesma posição do retorno principal: o parecer não remonta (nem recarrega) quando os itens chegam. */}
                <div className="text-center p-16 text-zinc-600 flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    <span className={ROTULO}>Levantando o que foi vendido...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5 pb-20 ease-out animate-in fade-in duration-200">
            <ParecerDoMes />
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <ShoppingBag size={18} className="text-amber-500" />
                    <h1 className="text-sm font-black uppercase tracking-widest text-white">Itens vendidos</h1>
                    <InfoTooltip>
                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Uma linha por peça vendida</p>
                        <p className="text-[11px] text-zinc-300 leading-relaxed">
                            Vem dos <strong className="text-zinc-200">pedidos</strong> (a venda de fato), não dos orçamentos.
                            O preço é reencontrado no orçamento que originou cada pedido — quando não é possível achar,
                            a linha aparece marcada em vez de mostrar zero como se fosse valor real.
                        </p>
                    </InfoTooltip>
                </div>
                <IndicadorRecarga ativo={v.recarregando} />
                <button type="button" onClick={v.reload} className={`${BOTAO_SECUNDARIO} ml-auto w-10 px-0`} title="Atualizar" aria-label="Atualizar itens vendidos">
                    <RefreshCw size={18} className={v.recarregando ? 'animate-spin' : ''} />
                </button>
            </div>

            {v.error && (
                <div className="text-center p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <p className="text-xs text-rose-400 font-bold">{v.error}</p>
                </div>
            )}

            {/* Totais do recorte atual */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metrica label="Peças" valor={String(v.totais.pecas)} tom="zinc" icone={Layers} />
                <Metrica label="Faturamento" valor={formatCurrency(v.totais.valor)} tom="emerald" icone={TrendingUp} />
                <Metrica label="Linhas" valor={String(v.totais.linhas)} tom="zinc" icone={ListFilter} />
                <Metrica
                    label="Sem preço" valor={String(v.totais.semPreco)}
                    tom={v.totais.semPreco > 0 ? 'amber' : 'zinc'} icone={AlertTriangle}
                    dica="Itens em que não se achou a linha de orçamento correspondente. Entram na contagem de peças, mas não no faturamento."
                />
            </div>

            {/* Filtros */}
            <div className={`${CARTAO} p-4 flex items-end gap-3 flex-wrap`}>
                <div className="flex-1 min-w-[180px]">
                    <label className={`block mb-2 ${ROTULO_PEQUENO}`}>Buscar</label>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                        <input
                            value={v.busca} onChange={e => v.setBusca(e.target.value)}
                            placeholder="produto, cor, tecido, pedido..."
                            className={`${CAMPO} w-full pl-9`}
                        />
                    </div>
                </div>
                <div className="min-w-[180px]">
                    <label className={`block mb-2 ${ROTULO_PEQUENO}`}>Empresa</label>
                    <SearchableSelect
                        value={v.empresa} onChange={v.setEmpresa}
                        options={[{ value: '', label: 'TODAS' }, ...v.empresas.map(e => ({ value: e, label: e }))]}
                        placeholder="TODAS"
                    />
                </div>
                <div>
                    <label className={`block mb-2 ${ROTULO_PEQUENO}`}>De</label>
                    <input type="date" value={v.de} onChange={e => v.setDe(e.target.value)}
                        className={CAMPO} />
                </div>
                <div>
                    <label className={`block mb-2 ${ROTULO_PEQUENO}`}>Até</label>
                    <input type="date" value={v.ate} onChange={e => v.setAte(e.target.value)}
                        className={CAMPO} />
                </div>
                <div className="min-w-[160px]">
                    <label className={`block mb-2 ${ROTULO_PEQUENO}`}>Ordenar por</label>
                    <SearchableSelect
                        value={v.ordem} onChange={val => v.setOrdem(val as OrdenacaoItens)}
                        options={ORDENS.map(o => ({ value: o.v, label: o.l }))}
                        placeholder="ORDEM"
                    />
                </div>
                {temFiltro && (
                    <button type="button" onClick={v.limparFiltros} className={BOTAO_SECUNDARIO}>
                        <X size={14} /> Limpar
                    </button>
                )}
            </div>

            {/* Abas */}
            <div className="flex items-center gap-2 flex-wrap">
                {([['lista', 'Item a item'], ['grafico', 'Gráficos'], ['margem', 'Lucratividade'], ['quadrante', 'Volume × margem'], ['produto', 'Por produto · variações de preço']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setAba(k)}
                        className={pilula(aba === k)}>
                        {l}
                    </button>
                ))}
            </div>

            {v.filtradas.length === 0 ? (
                <div className="text-center py-16 text-[11px] font-black text-zinc-600 uppercase tracking-widest">
                    {temFiltro ? 'Nada encontrado com estes filtros' : 'Nenhum item vendido ainda'}
                </div>
            ) : aba === 'lista' ? (
                <div className={`${CARTAO} overflow-hidden`}>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-zinc-900/60 border-b border-zinc-800">
                                <tr>
                                    <th className={th}>Data</th>
                                    <th className={th}>Pedido</th>
                                    <th className={th}>Empresa</th>
                                    <th className={th}>Produto</th>
                                    <th className={th}>Cor</th>
                                    <th className={th}>Tecido</th>
                                    <th className={th}>Tam</th>
                                    <th className={th}>Características</th>
                                    <th className={`${th} text-right`}>Qtd</th>
                                    <th className={`${th} text-right`}>Unit.</th>
                                    <th className={`${th} text-right`}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {v.filtradas.map((l, i) => (
                                    <tr key={`${l.order_id}-${i}`} className="border-b border-zinc-800/50 hover:bg-zinc-900/40">
                                        <td className={`${td} font-mono text-zinc-500 whitespace-nowrap`}>{fmtDia(l.data)}</td>
                                        <td className={`${td} font-black whitespace-nowrap`}>#{l.pedido}</td>
                                        <td className={td}>{l.empresa}</td>
                                        <td className={`${td} font-bold text-white`}>{l.produto}</td>
                                        <td className={td}>{l.cor || <span className="text-zinc-700">—</span>}</td>
                                        <td className={`${td} text-zinc-400`}>{l.tecido || <span className="text-zinc-700">—</span>}</td>
                                        <td className={`${td} font-mono`}>{l.tamanho || '—'}</td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex flex-wrap gap-1">
                                                {l.caracteristicas.length === 0
                                                    ? <span className="text-zinc-700 text-xs">—</span>
                                                    : l.caracteristicas.map(c => (
                                                        <span key={c} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">{c}</span>
                                                    ))}
                                            </div>
                                        </td>
                                        <td className={`${tdMono} text-zinc-300`}>{l.quantidade}</td>
                                        <td className={`${tdMono} ${l.precoConhecido ? 'text-zinc-400' : 'text-amber-500/60'}`}>
                                            {l.precoConhecido ? formatCurrency(l.valorUnit) : '—'}
                                        </td>
                                        <td className={`${tdMono} ${l.precoConhecido ? 'text-emerald-400' : 'text-zinc-700'}`}>
                                            {l.precoConhecido ? formatCurrency(l.valorTotal) : 'sem preço'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : aba === 'margem' ? (
                <div className="space-y-5">
                    <LucroPorPedido />
                    <PainelDeMargem margens={v.margens} />
                </div>
            ) : aba === 'quadrante' ? (
                <QuadranteDeProdutos margens={v.margens.comCusto} />
            ) : aba === 'grafico' ? (
                <PainelDeGraficos linhas={v.filtradas} metrica={metrica} setMetrica={setMetrica} semPreco={v.totais.semPreco} />
            ) : (
                <div className="space-y-3">
                    {v.porProduto.map(r => (
                        <div key={r.produto} className={`${CARTAO} p-4`}>
                            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                                <p className="text-sm font-black text-white">{r.produto}</p>
                                <p className="text-[11px] font-mono font-bold text-zinc-500">
                                    {r.quantidade} pç · <span className="text-emerald-400">{formatCurrency(r.valorTotal)}</span>
                                </p>
                            </div>
                            {r.variacoes.length === 0 ? (
                                <p className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">Sem preço registrado</p>
                            ) : (
                                <>
                                    <div className="flex flex-wrap gap-2">
                                        {r.variacoes.map(va => (
                                            <span key={va.valorUnit}
                                                className={`${ITEM} px-2 py-1 text-[10px] font-mono font-bold text-zinc-300`}>
                                                {formatCurrency(va.valorUnit)}
                                                <span className="text-zinc-600"> · {va.quantidade} pç</span>
                                            </span>
                                        ))}
                                    </div>
                                    {r.variacoes.length > 1 && (
                                        <p className="text-[10px] text-amber-500/70 font-bold mt-2">
                                            {r.variacoes.length} preços diferentes para a mesma peça — de{' '}
                                            {formatCurrency(r.variacoes[r.variacoes.length - 1].valorUnit)} a {formatCurrency(r.variacoes[0].valorUnit)}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <section className="space-y-3 pt-4">
                <h2 className={ROTULO}>Produtos &amp; mercado</h2>
                <ProdutosEMercado />
            </section>
        </div>
    );
}

function Metrica({ label, valor, sub, tom, icone: Icone, dica }: {
    label: string; valor: string; sub?: string;
    tom: 'zinc' | 'emerald' | 'amber'; icone: typeof Layers; dica?: string;
}) {
    const cor = { zinc: 'text-zinc-200', emerald: 'text-emerald-400', amber: 'text-amber-400' }[tom];
    return (
        <div className={`${CARTAO} p-4`}>
            <div className="flex items-center gap-2 mb-1">
                <Icone size={12} className="text-zinc-600" />
                <p className={ROTULO_PEQUENO}>{label}</p>
                {dica && <InfoTooltip><p className="text-[11px] text-zinc-300 leading-relaxed">{dica}</p></InfoTooltip>}
            </div>
            <p className={`text-xl font-black font-mono tracking-tighter ${cor}`}>{valor}</p>
            {sub && <p className="text-[10px] text-zinc-600 font-bold font-mono">{sub}</p>}
        </div>
    );
}

// ── Gráficos ────────────────────────────────────────────────────────────────

// Série única em todos os gráficos, então uma cor só — a de destaque do app.
// Paleta categórica não se aplica aqui: não há identidades a distinguir, só
// magnitude, e nesse caso cor extra vira ruído em vez de informação.
const COR_BARRA = '#f59e0b';
const COR_DESTAQUE = '#fbbf24';
const COR_GRADE = '#27272a';
const COR_EIXO = '#71717a';

const cortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function DicaDoGrafico({ active, payload, label, metrica }: any) {
    if (!active || !payload?.length) return null;
    const v = payload[0].value as number;
    return (
        <div className="bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">{label}</p>
            <p className="text-sm font-mono font-black text-amber-400">
                {metrica === 'valor' ? formatCurrency(v) : `${v} pç`}
            </p>
        </div>
    );
}

function Cartao({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
    return (
        <div className={`${CARTAO} p-5 min-w-0`}>
            <h3 className={ROTULO}>{titulo}</h3>
            {subtitulo && <p className="text-[10px] text-zinc-600 font-bold mt-0.5 mb-3">{subtitulo}</p>}
            {children}
        </div>
    );
}

function PainelDeGraficos({ linhas, metrica, setMetrica, semPreco }: {
    linhas: LinhaVendida[];
    metrica: MetricaGrafico;
    setMetrica: (m: MetricaGrafico) => void;
    semPreco: number;
}) {
    const serie = serieMensal(linhas, metrica);
    const porProduto = ranking(linhas, 'produto', metrica);
    const porEmpresa = ranking(linhas, 'empresa', metrica);
    const { oculto } = useMostrarValor();
    const eixo = (n: number) => (metrica === 'valor' ? (oculto ? '' : `${Math.round(n / 1000)}k`) : String(n));

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
                <div className="flex gap-2">
                    {([['valor', 'Faturamento'], ['pecas', 'Peças']] as const).map(([k, l]) => (
                        <button key={k} onClick={() => setMetrica(k)}
                            className={pilula(metrica === k)}>
                            {l}
                        </button>
                    ))}
                </div>
                <p className="text-[10px] text-zinc-600 font-bold">
                    Os gráficos seguem os filtros acima — filtre por empresa para ver o perfil de compra dela.
                </p>
            </div>

            {metrica === 'valor' && semPreco > 0 && (
                <p className="text-[10px] text-amber-500/80 font-bold bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
                    {semPreco} {semPreco === 1 ? 'item está' : 'itens estão'} sem preço encontrado e não {semPreco === 1 ? 'entra' : 'entram'} neste
                    total. Em "Peças" {semPreco === 1 ? 'ele aparece' : 'eles aparecem'} normalmente.
                </p>
            )}

            {serie.length === 0 ? (
                <div className="text-center py-16 text-[11px] font-black text-zinc-600 uppercase tracking-widest">
                    Sem dados com data para montar os gráficos
                </div>
            ) : (
                <>
                    <Cartao titulo="Evolução mensal"
                        subtitulo={metrica === 'valor' ? 'Faturamento por mês' : 'Peças vendidas por mês'}>
                        <div className="w-full h-[260px] min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} vertical={false} />
                                    <XAxis dataKey="rotulo" stroke={COR_EIXO} fontSize={10} axisLine={false} tickLine={false} />
                                    <YAxis stroke={COR_EIXO} fontSize={10} axisLine={false} tickLine={false} tickFormatter={eixo} width={44} />
                                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                        content={<DicaDoGrafico metrica={metrica} />} />
                                    <Bar dataKey="valor" fill={COR_BARRA} radius={[4, 4, 0, 0]} maxBarSize={44}>
                                        {/* Último mês em tom mais claro: ainda está em curso, e sem
                                            isso a barra menor é lida como queda de vendas. */}
                                        {serie.map((p, i) => (
                                            <Cell key={p.chave} fill={i === serie.length - 1 ? COR_DESTAQUE : COR_BARRA} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Cartao>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {([[porProduto, 'Produtos que mais vendem'], [porEmpresa, 'Empresas que mais compram']] as const).map(([dados, titulo]) => (
                            <Cartao key={titulo} titulo={titulo} subtitulo={`Top ${dados.length} do recorte atual`}>
                                {dados.length === 0 ? (
                                    <p className="text-[11px] font-black text-zinc-700 uppercase tracking-widest py-10 text-center">Sem dados</p>
                                ) : (
                                    <div className="w-full min-w-0" style={{ height: Math.max(160, dados.length * 34) }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} horizontal={false} />
                                                <XAxis type="number" stroke={COR_EIXO} fontSize={10} axisLine={false} tickLine={false} tickFormatter={eixo} />
                                                <YAxis dataKey="nome" type="category" stroke="#a1a1aa" fontSize={10}
                                                    width={130} axisLine={false} tickLine={false}
                                                    tickFormatter={(t: string) => cortar(t, 20)} />
                                                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                                    content={<DicaDoGrafico metrica={metrica} />} />
                                                <Bar dataKey="valor" fill={COR_BARRA} radius={[0, 4, 4, 0]} barSize={16} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </Cartao>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ── Lucratividade ───────────────────────────────────────────────────────────

function PainelDeMargem({ margens }: { margens: ResultadoDeMargem }) {
    const { comCusto, semCusto, pecasSemPreco } = margens;
    if (comCusto.length === 0 && semCusto.length === 0) {
        return (
            <div className="text-center py-16 text-[11px] font-black text-zinc-600 uppercase tracking-widest">
                Sem dados para calcular margem
            </div>
        );
    }

    // Lista curta: os extremos é que interessam. No meio a diferença entre
    // vizinhos é pequena demais para virar decisão.
    const melhores = comCusto.slice(0, 5);
    const piores = [...comCusto].reverse().slice(0, 5);
    const noVermelho = comCusto.filter(p => p.margemUnitaria < 0);

    return (
        <div className="space-y-4">
            <p className={`${ITEM} text-[10px] text-zinc-600 font-bold leading-relaxed px-3 py-2`}>
                Margem = preço médio praticado − custo médio atual da peça. O custo vem da ficha e é o de
                <strong className="text-zinc-400"> hoje</strong>, não o da época da venda — serve para decidir o que
                vale produzir agora, não para apurar o lucro de um período passado.
            </p>

            {noVermelho.length > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <AlertTriangle size={12} /> {noVermelho.length} {noVermelho.length === 1 ? 'peça sai' : 'peças saem'} abaixo do custo
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {noVermelho.map(p => (
                            <span key={p.produto} className="px-2 py-1 rounded-lg bg-zinc-950 border border-rose-500/20 text-[10px] font-bold text-rose-300">
                                {p.produto} <span className="font-mono">{formatCurrency(p.margemUnitaria)}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {([[melhores, 'Mais lucrativas', 'emerald'], [piores, 'Menos lucrativas', 'rose']] as const).map(([lista, titulo, tom]) => (
                    <div key={titulo} className={`${CARTAO} p-5`}>
                        <h3 className={`${ROTULO} mb-1`}>{titulo}</h3>
                        <p className="text-[10px] text-zinc-600 font-bold mb-3">Por margem da peça, não por volume vendido</p>
                        <div className="space-y-2">
                            {lista.map(p => (
                                <div key={p.produto} className={`${ITEM} px-3 py-2`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-bold text-zinc-200 truncate">{p.produto}</p>
                                        <span className={`shrink-0 text-xs font-mono font-black ${
                                            p.margemUnitaria < 0 ? 'text-rose-400' : tom === 'emerald' ? 'text-emerald-400' : 'text-amber-400'
                                        }`}>
                                            {formatCurrency(p.margemUnitaria)}
                                            <span className="text-zinc-600 text-[10px]"> /pç</span>
                                        </span>
                                    </div>
                                    <p className="text-[10px] font-mono text-zinc-600 mt-0.5">
                                        {formatCurrency(p.precoMedio)} − {formatCurrency(p.custoUnitario)} ·{' '}
                                        <span className={p.margemPct < 0 ? 'text-rose-400' : 'text-zinc-500'}>{p.margemPct}%</span> ·{' '}
                                        {p.pecas} pç · total {formatCurrency(p.contribuicaoTotal)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {(semCusto.length > 0 || pecasSemPreco > 0) && (
                <div className={`${CARTAO} p-4 space-y-2`}>
                    <p className={ROTULO}>Fora desta conta</p>
                    {semCusto.length > 0 && (
                        <>
                            <p className="text-[11px] text-zinc-500 font-bold leading-relaxed">
                                {semCusto.length} {semCusto.length === 1 ? 'produto vendido não tem' : 'produtos vendidos não têm'} custo
                                na ficha técnica. Calcular contra custo zero daria margem de 100% e {semCusto.length === 1 ? 'ele' : 'eles'} lideraria
                                {semCusto.length === 1 ? '' : 'm'} o ranking — justamente por estar mal cadastrado.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {semCusto.slice(0, 12).map(p => (
                                    <span key={p.produto} className="px-2 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-[10px] font-bold text-zinc-500">
                                        {p.produto} <span className="font-mono text-zinc-700">{p.pecas} pç</span>
                                    </span>
                                ))}
                            </div>
                        </>
                    )}
                    {pecasSemPreco > 0 && (
                        <p className="text-[11px] text-zinc-500 font-bold">
                            {pecasSemPreco} peças sem preço encontrado também ficaram de fora.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
