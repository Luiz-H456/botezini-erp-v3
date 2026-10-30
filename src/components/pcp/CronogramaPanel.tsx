import { useState } from 'react';
import { RefreshCw, CalendarClock, Scissors, AlertTriangle, Clock, X, Lock } from 'lucide-react';
import { usePcpSchedule } from '@/hooks/pcp/usePcpSchedule';
import { RegistrarAtrasoModal } from '@/components/modals/RegistrarAtrasoModal';
import { ProximoPasso } from '@/components/common/ProximoPasso';
import { InfoTooltip } from '@/components/common';
import { usePurchaseList } from '@/hooks/pcp/usePurchaseList';
import { avisoDeCompras } from '@/utils/fabrica/avisoDeCompras';
import { CARTAO, ITEM, BOTAO_PRINCIPAL } from '@/components/finance/ui/estilo';
import type { View } from '@/utils/navegacao';
import { numero, percentual } from '@/utils/numeros';

function fmtWeek(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    const end = new Date(d); end.setDate(d.getDate() + 6);
    const f = (x: Date) => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`;
    return `${f(d)} – ${f(end)}`;
}

const fmtDia = (iso: string) => iso.split('-').reverse().join('/');
const fmtHora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function CronogramaPanel({ onIrPara }: { onIrPara?: (v: View) => void }) {
    const {
        result, weeklyCapacity, delays, loading, busy, error,
        recalcular, recalculadoEm, registrarAtraso, removerAtraso,
    } = usePcpSchedule();

    // Pedido escolhido para registrar atraso (abre o modal).
    const [alvo, setAlvo] = useState<{ id: string; order_number: string; client_name?: string } | null>(null);
    const [avisoFechado, setAvisoFechado] = useState(false);
    const compras = usePurchaseList();
    // Leitura carregando ou falha = sem número; o aviso nunca diz "faltam 0".
    const faltas = compras.loading || compras.error || compras.avisoVinculo ? null : compras.result.lines.filter(l => l.is_shortage).length;
    const aviso = avisoDeCompras(faltas);

    if (loading) {
        return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" /></div>;
    }

    const motivoPorPedido = new Map(delays.map(d => [d.order_id, d]));

    return (
        <div className="space-y-5">
            {aviso && !avisoFechado && (
                <ProximoPasso titulo={aviso}
                    principal={{ rotulo: 'Ver compras', onClick: onIrPara && (() => onIrPara('compras')) }}
                    onFechar={() => setAvisoFechado(true)} />
            )}
            <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                    Cronograma automático · capacidade {weeklyCapacity} pç/semana (gargalo)
                </p>
                <InfoTooltip>
                    <p>
                        Motor: prioriza por prazo → agrupa por tecido/cor/tipo (minimiza regulagem) → empacota por capacidade,
                        empurrando o excedente para a próxima semana. Pedido com atraso registrado só volta a ser planejado na
                        data de liberação — e a vaga dele na semana é ocupada por quem vem depois. Tudo determinístico:
                        recalcular quantas vezes quiser devolve o mesmo plano.
                    </p>
                    <p className="mt-2">
                        Trocas evitadas pelo agrupamento: {result.setup_saved} ({result.setup_changes} trocas contra {result.setup_changes_ungrouped} sem agrupar).
                    </p>
                </InfoTooltip>
                {recalculadoEm && (
                    <span className="text-[10px] font-bold text-zinc-600 font-mono">
                        recalculado {fmtHora(recalculadoEm)}
                    </span>
                )}
                <button onClick={recalcular} disabled={busy}
                    className={`ml-auto ${BOTAO_PRINCIPAL}`}>
                    <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Recalcular
                </button>
            </div>

            {error && <div className="text-center p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl"><p className="text-xs text-rose-400 font-bold">{error}</p></div>}

            {/* Métricas do motor */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Metric label="Semanas planejadas" value={String(result.weeks.length)} tone="zinc" icon={CalendarClock} />
                <Metric label="Atrasos previstos" value={String(result.late_count)} tone={result.late_count > 0 ? 'rose' : 'emerald'} icon={AlertTriangle} />
                <Metric label="Pedidos travados" value={String(delays.length)} sub={delays.length > 0 ? 'com justificativa' : undefined} tone={delays.length > 0 ? 'amber' : 'zinc'} icon={Lock} />
            </div>

            {/* Atrasos registrados — o histórico que explica o plano atual */}
            {delays.length > 0 && (
                <div className={`${ITEM} overflow-hidden`}>
                    <p className="px-4 py-2.5 text-[10px] font-black text-amber-400 uppercase tracking-widest border-b border-amber-500/20 flex items-center gap-1.5">
                        <Clock size={12} /> Atrasos registrados
                    </p>
                    <div className="divide-y divide-amber-500/10">
                        {delays.map(d => (
                            <div key={d.id} className="flex items-start gap-3 px-4 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs">
                                        <span className="font-black text-zinc-200">#{numeroDoPedido(result, d.order_id)}</span>
                                        <span className="text-zinc-500"> · {d.dias} {d.dias === 1 ? 'dia' : 'dias'} · liberado em </span>
                                        <span className="font-mono font-bold text-amber-400">{fmtDia(d.liberado_em)}</span>
                                    </p>
                                    <p className="text-[11px] text-zinc-400 leading-snug">{d.motivo}</p>
                                </div>
                                <button onClick={() => removerAtraso(d.id)} disabled={busy}
                                    title="Remover este atraso e replanejar" aria-label="Remover este atraso e replanejar"
                                    className="p-1.5 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 shrink-0">
                                    <X size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {result.weeks.length === 0 ? (
                <div className="text-center py-16 text-[11px] font-black text-zinc-600 uppercase tracking-widest">Nenhum pedido ativo para planejar</div>
            ) : (
                <div className="space-y-3">
                    {result.weeks.map(w => (
                        <div key={w.week_index} className={`${CARTAO} overflow-hidden`}>
                            <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-800">
                                <div className="flex items-center gap-2">
                                    <CalendarClock size={14} className="text-amber-500" />
                                    <span className="text-xs font-black text-white">Semana {w.week_index + 1}</span>
                                    <span className="text-[10px] text-zinc-500 font-bold">{fmtWeek(w.week_start)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[11px] font-mono font-bold ${w.overloaded ? 'text-rose-400' : 'text-zinc-400'}`}>
                                        {numero(w.used_pieces)}/{numero(w.capacity)} pç · {percentual(w.occupancy_pct)}
                                    </span>
                                    {w.overloaded && <AlertTriangle size={12} className="text-rose-400" />}
                                </div>
                            </div>
                            <div className="h-1 bg-zinc-800">
                                <div className={`h-full ${w.overloaded ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, w.occupancy_pct)}%` }} />
                            </div>
                            <div className="divide-y divide-zinc-800/50">
                                {w.orders.map(o => {
                                    const atraso = motivoPorPedido.get(o.id);
                                    return (
                                        <div key={o.id} className="flex items-center justify-between px-4 py-2 text-xs gap-3">
                                            <div className="flex items-start gap-2 min-w-0">
                                                <span className="text-[10px] font-mono text-zinc-600 w-5 text-right mt-0.5">{o.sequence_index + 1}.</span>
                                                <div className="min-w-0">
                                                    <span className="font-black text-zinc-200">#{o.order_number}</span>
                                                    <span className="text-zinc-400"> · {o.client_name || 'Cliente'}</span>
                                                    {o.client_contact && <span className="text-zinc-600"> · {o.client_contact}</span>}
                                                    <span className="block text-[10px] text-zinc-600 truncate flex items-center gap-1">
                                                        <Scissors size={12} /> {[o.fabric, o.color, o.product_type].filter(Boolean).join(' · ') || 'sem specs'}
                                                    </span>
                                                    {atraso && (
                                                        <span className="block text-[10px] text-amber-400/80 font-bold truncate flex items-center gap-1">
                                                            <Lock size={12} /> travado até {fmtDia(atraso.liberado_em)} · {atraso.motivo}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className="font-mono text-zinc-500">{o.pieces} pç</span>
                                                {o.late && <span className="text-[10px] font-black text-rose-400 uppercase">Atraso</span>}
                                                <button
                                                    onClick={() => setAlvo({ id: o.id, order_number: o.order_number, client_name: o.client_name })}
                                                    title="Registrar atraso neste pedido" aria-label="Registrar atraso neste pedido"
                                                    className="p-1.5 rounded-lg text-zinc-600 hover:text-amber-400 hover:bg-amber-500/10">
                                                    <Clock size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {alvo && (
                <RegistrarAtrasoModal
                    orderNumber={alvo.order_number}
                    clientName={alvo.client_name}
                    onClose={() => setAlvo(null)}
                    onConfirm={async (dias, motivo) => {
                        await registrarAtraso({ order_id: alvo.id, dias, motivo });
                        setAlvo(null);
                    }}
                />
            )}
        </div>
    );
}

/** O atraso guarda só o id do pedido; o número vem do plano recém-calculado. */
function numeroDoPedido(result: { weeks: { orders: { id: string; order_number: string }[] }[] }, orderId: string): string {
    for (const w of result.weeks) {
        const achado = w.orders.find(o => o.id === orderId);
        if (achado) return achado.order_number;
    }
    return '—';
}

function Metric({ label, value, sub, tone, icon: Icon }: { label: string; value: string; sub?: string; tone: 'zinc' | 'emerald' | 'rose' | 'amber'; icon: typeof CalendarClock }) {
    const color = { zinc: 'text-zinc-200', emerald: 'text-emerald-400', rose: 'text-rose-400', amber: 'text-amber-400' }[tone];
    return (
        <div className={`${CARTAO} p-4`}>
            <div className="flex items-center gap-1.5 mb-1"><Icon size={12} className="text-zinc-600" /><p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{label}</p></div>
            <p className={`text-xl font-black font-mono tracking-tighter ${color}`}>{value}</p>
            {sub && <p className="text-[10px] text-zinc-600 font-bold font-mono">{sub}</p>}
        </div>
    );
}
