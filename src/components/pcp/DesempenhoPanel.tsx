import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { RefreshCw, Target, Clock, Gauge, AlertTriangle, Timer } from 'lucide-react';
import { usePcpDesempenho } from '@/hooks/pcp/usePcpDesempenho';
import { InfoTooltip } from '@/components/common';
import { CARTAO, ITEM, ROTULO, ROTULO_PEQUENO, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

const COR_OK = '#10b981';
const COR_ATRASO = '#f43f5e';
const COR_GRADE = '#27272a';
const COR_EIXO = '#71717a';

const cortar = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function Kpi({ label, valor, sub, tom, icone: Icone, dica }: {
    label: string; valor: string; sub?: string;
    tom: 'zinc' | 'emerald' | 'rose' | 'amber'; icone: typeof Clock; dica?: string;
}) {
    const cor = {
        zinc: 'text-zinc-200', emerald: 'text-emerald-400',
        rose: 'text-rose-400', amber: 'text-amber-400',
    }[tom];
    return (
        <div className={`${CARTAO} p-4`}>
            <div className="flex items-center gap-2 mb-1">
                <Icone size={12} className="text-zinc-600" />
                <p className={ROTULO_PEQUENO}>{label}</p>
                {dica && <InfoTooltip><p className="text-[11px] text-zinc-300 leading-relaxed">{dica}</p></InfoTooltip>}
            </div>
            <p className={`text-xl font-black font-mono tracking-tighter ${cor}`}>{valor}</p>
            {sub && <p className="text-[9px] text-zinc-600 font-bold font-mono mt-0.5">{sub}</p>}
        </div>
    );
}

/**
 * Tooltip com pedidos E peças.
 *
 * A barra conta PEDIDOS; sozinho esse número engana. Um mês com 1 pedido de 500
 * peças atrasado e 1 de 3 no prazo mostra "50% no prazo", mas quase toda a
 * produção do mês atrasou. As duas contagens juntas é que dizem o que houve.
 */
function DicaDePontualidade({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const pedidos = d.noPrazo + d.atrasados;
    const pecas = d.pecasNoPrazo + d.pecasAtrasadas;
    return (
        <div className="bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 min-w-[190px]">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">{label}</p>
            <div className="space-y-1">
                <Linha cor={COR_OK} rotulo="No prazo" pedidos={d.noPrazo} pecas={d.pecasNoPrazo} />
                <Linha cor={COR_ATRASO} rotulo="Atrasados" pedidos={d.atrasados} pecas={d.pecasAtrasadas} />
            </div>
            <div className="border-t border-zinc-800 mt-1.5 pt-1.5 flex items-center justify-between gap-3">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Total</span>
                <span className="text-[10px] font-mono font-bold text-zinc-300">
                    {pedidos} {pedidos === 1 ? 'pedido' : 'pedidos'} · <span className="text-amber-400">{pecas} pç</span>
                </span>
            </div>
        </div>
    );
}

function Linha({ cor, rotulo, pedidos, pecas }: { cor: string; rotulo: string; pedidos: number; pecas: number }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: cor }} /> {rotulo}
            </span>
            <span className="text-[10px] font-mono font-bold text-zinc-300">
                {pedidos} · <span className="text-amber-400">{pecas} pç</span>
            </span>
        </div>
    );
}

/** Tempo por peça: o número de peças e de pedidos dá o peso da média. */
function DicaDeTempo({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <div className="bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2">
            <p className="text-[10px] font-black text-zinc-300 mb-1">{d.rotulo}</p>
            <p className="text-sm font-mono font-black text-amber-400">{d.diasMedios} dias</p>
            <p className="text-[10px] font-mono font-bold text-zinc-500 mt-0.5">
                <span className="text-zinc-300">{d.pecas} pç</span> em {d.pedidos} {d.pedidos === 1 ? 'pedido' : 'pedidos'}
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

export function DesempenhoPanel() {
    const d = usePcpDesempenho();

    if (d.loading) {
        return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" /></div>;
    }

    const p = d.pontualidade;
    const semDado = p.semDadoDeEntrega;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
                <p className={ROTULO}>Desempenho de entrega</p>
                <InfoTooltip>
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">De onde vêm estes números</p>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                        O pedido não guarda data de entrega real — só o prazo prometido. A data de saída
                        usada aqui é a do <strong className="text-zinc-200">último lançamento de expedição</strong> na
                        aba Controle Parcial. Pedido sem expedição lançada fica de fora do cálculo,
                        nunca é contado como no prazo.
                    </p>
                </InfoTooltip>
                <button type="button" onClick={d.reload} className={`${BOTAO_SECUNDARIO} ml-auto w-10 px-0`} title="Atualizar" aria-label="Atualizar desempenho">
                    <RefreshCw size={18} className={d.recarregando ? 'animate-spin' : ''} />
                </button>
            </div>

            {d.error && (
                <div className="text-center p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <p className="text-xs text-rose-400 font-bold">{d.error}</p>
                </div>
            )}

            {p.apurados === 0 ? (
                <div className={`${CARTAO} p-6 text-center space-y-2`}>
                    <AlertTriangle size={22} className="text-amber-500 mx-auto" />
                    <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Ainda não dá para medir pontualidade</p>
                    <p className="text-[11px] text-zinc-500 font-bold max-w-lg mx-auto leading-relaxed">
                        Nenhum dos {d.totalDePedidos} pedidos tem expedição lançada, e é ela que marca a data de
                        saída. Conforme a fábrica for registrando as baixas com quantidade expedida na aba
                        <strong className="text-zinc-300"> Controle Parcial</strong>, estes indicadores se preenchem sozinhos.
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Kpi label="No prazo" valor={`${p.pctNoPrazo}%`} sub={`${p.noPrazo} de ${p.apurados} pedidos`}
                            tom={p.pctNoPrazo >= 90 ? 'emerald' : p.pctNoPrazo >= 70 ? 'amber' : 'rose'} icone={Target}
                            dica="Percentual sobre os pedidos com expedição lançada — não sobre todos os pedidos." />
                        <Kpi label="Atraso médio" valor={`${p.atrasoMedioDias} d`} sub={`pior: ${p.piorAtrasoDias} dias`}
                            tom={p.atrasoMedioDias > 0 ? 'rose' : 'zinc'} icone={AlertTriangle}
                            dica="Média contando apenas os pedidos que atrasaram. Quem saiu no prazo não dilui o número." />
                        <Kpi label="Tempo na fábrica" valor={`${p.tempoMedioNaFabricaDias} d`} sub="da abertura à última saída"
                            tom="zinc" icone={Clock} />
                        <Kpi label="Ritmo" valor={`${d.ritmo.pecasPorDia} pç/dia`}
                            sub={`${d.ritmo.pecas} pç em ${d.ritmo.dias} dias`} tom="zinc" icone={Gauge}
                            dica="Dias corridos, não dias úteis — é assim que o cliente conta o prazo." />
                    </div>

                    {semDado > 0 && (
                        <p className="text-[10px] text-amber-500/80 font-bold bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
                            {semDado} {semDado === 1 ? 'pedido está' : 'pedidos estão'} fora desta conta por não {semDado === 1 ? 'ter' : 'terem'} expedição
                            lançada. {semDado === 1 ? 'Ele' : 'Eles'} não {semDado === 1 ? 'foi contado' : 'foram contados'} como no prazo — contar seria
                            inventar uma pontualidade melhor que a real.
                        </p>
                    )}

                    {d.porMes.length > 0 && (
                        <Cartao titulo="Pontualidade mês a mês" subtitulo="Pelo mês da entrega — é quando o atraso acontece">
                            <div className="w-full h-[240px] min-w-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={d.porMes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} vertical={false} />
                                        <XAxis dataKey="rotulo" stroke={COR_EIXO} fontSize={10} axisLine={false} tickLine={false} />
                                        <YAxis stroke={COR_EIXO} fontSize={10} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                                        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<DicaDePontualidade />} />
                                        {/* Empilhado com 2px de folga entre os blocos: a leitura é
                                            "quantos entregamos e quanto disso atrasou". */}
                                        <Bar dataKey="noPrazo" stackId="e" fill={COR_OK} name="No prazo" maxBarSize={44} />
                                        <Bar dataKey="atrasados" stackId="e" fill={COR_ATRASO} name="Atrasados" radius={[4, 4, 0, 0]} maxBarSize={44} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex items-center gap-4 mt-3">
                                {[[COR_OK, 'No prazo'], [COR_ATRASO, 'Atrasados']].map(([c, l]) => (
                                    <span key={l} className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500">
                                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} /> {l}
                                    </span>
                                ))}
                            </div>
                        </Cartao>
                    )}

                    {d.pioresEntregas.length > 0 && (
                        <Cartao titulo="Maiores atrasos" subtitulo="Onde olhar primeiro">
                            <div className="space-y-2">
                                {d.pioresEntregas.map(e => (
                                    <div key={e.order_id} className={`${ITEM} flex items-center justify-between gap-3 px-3 py-2`}>
                                        <div className="min-w-0">
                                            <p className="text-xs font-black text-white">#{e.pedido}</p>
                                            <p className="text-[10px] font-mono text-zinc-600">
                                                prazo {e.prazo?.split('-').reverse().join('/')} · saiu {e.entregueEm.slice(0, 10).split('-').reverse().join('/')} · {e.pecas} pç
                                            </p>
                                        </div>
                                        <span className="shrink-0 px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-mono font-black">
                                            +{e.diasDeAtraso} d
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Cartao>
                    )}
                </>
            )}

            <Cartao titulo="Tempo por tipo de peça"
                subtitulo="Dias entre a primeira e a última baixa daquela peça, por pedido">
                {d.porTipoDePeca.length === 0 ? (
                    <div className="py-8 text-center space-y-2">
                        <Timer size={20} className="text-zinc-700 mx-auto" />
                        <p className="text-[11px] text-zinc-500 font-bold max-w-md mx-auto leading-relaxed">
                            Este quadro só enxerga baixas lançadas <strong className="text-zinc-300">por peça</strong> (com produto,
                            cor e tamanho). As baixas antigas registravam só a quantidade do pedido, sem dizer de qual peça
                            eram — então ele começa vazio e se preenche com as próximas baixas.
                        </p>
                    </div>
                ) : (
                    <div className="w-full min-w-0" style={{ height: Math.max(160, d.porTipoDePeca.slice(0, 10).length * 34) }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={d.porTipoDePeca.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} horizontal={false} />
                                <XAxis type="number" stroke={COR_EIXO} fontSize={10} axisLine={false} tickLine={false}
                                    tickFormatter={(n: number) => `${n}d`} />
                                <YAxis dataKey="rotulo" type="category" stroke="#a1a1aa" fontSize={10}
                                    width={170} axisLine={false} tickLine={false}
                                    tickFormatter={(t: string) => cortar(t, 26)} />
                                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<DicaDeTempo />} />
                                <Bar dataKey="diasMedios" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={16}>
                                    {d.porTipoDePeca.slice(0, 10).map(t => <Cell key={t.chave} fill="#f59e0b" />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </Cartao>
        </div>
    );
}
