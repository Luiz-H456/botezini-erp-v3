import { RefreshCw, Gauge, AlertTriangle, Clock, Factory, TrendingUp } from 'lucide-react';
import { usePcpDashboard } from '@/hooks/pcp/usePcpDashboard';
import { CARTAO, ITEM, ROTULO, ROTULO_PEQUENO, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';
import { numero, percentual } from '@/utils/numeros';

const STATUS_BAR: Record<string, string> = { ok: '#10b981', sobrecarga: '#f43f5e', ocioso: '#71717a' };

export function DashboardPanel() {
    const { data, loading, error, reload } = usePcpDashboard();

    if (loading) {
        return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" /></div>;
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2">
                <p className={ROTULO}>Visão geral da fábrica</p>
                <button type="button" onClick={reload} className={`${BOTAO_SECUNDARIO} ml-auto w-10 px-0`} title="Atualizar" aria-label="Atualizar painel"><RefreshCw size={18} /></button>
            </div>

            {error && <div className="text-center p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl"><p className="text-xs text-rose-400 font-bold">{error}</p></div>}

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label="Ocupação da fábrica" value={percentual(data.factory_occupancy_pct)} sub={`${numero(data.total_active_pieces)}/${numero(data.total_capacity)} pç`} tone={data.factory_occupancy_pct > 100 ? 'rose' : 'amber'} icon={Gauge} />
                <Kpi label="Gargalo atual" value={data.bottleneck?.name || '—'} sub={data.bottleneck ? percentual(data.bottleneck.occupancy_pct) : ''} tone="violet" icon={TrendingUp} />
                <Kpi label="Pedidos atrasados" value={String(data.late.length)} tone={data.late.length > 0 ? 'rose' : 'emerald'} icon={AlertTriangle} />
                <Kpi label="Em produção" value={String(data.in_production_count)} sub={`${data.pending_count} aguardando`} tone="zinc" icon={Factory} />
            </div>

            {/* Carga por setor */}
            <div>
                <h3 className={`${ROTULO} mb-3 flex items-center gap-2`}><Gauge size={14} /> Carga por setor</h3>
                {data.sector_loads.length === 0 ? (
                    <p className="text-[11px] text-zinc-600 font-bold">Cadastre os setores em Cadastros › Setores.</p>
                ) : (
                    <div className="space-y-2">
                        {data.sector_loads.map(l => (
                            <div key={l.sector.id} className={`${ITEM} p-3`}>
                                <div className="flex items-center justify-between mb-1 text-[11px]">
                                    <span className="font-black text-white">{l.sector.name}</span>
                                    <span className="font-mono text-zinc-500">{numero(l.current_pieces)}/{numero(l.sector.weekly_capacity_pieces)} · {percentual(l.occupancy_pct)}</span>
                                </div>
                                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, l.occupancy_pct)}%`, background: STATUS_BAR[l.status] }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Atrasados + Próximos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <OrderList title="Atrasados" icon={AlertTriangle} tone="rose" orders={data.late} empty="Nenhum pedido atrasado 🎉" />
                <OrderList title="Próximos do vencimento (7 dias)" icon={Clock} tone="amber" orders={data.upcoming} empty="Nada vencendo nos próximos 7 dias" />
            </div>
        </div>
    );
}

function Kpi({ label, value, sub, tone, icon: Icon }: { label: string; value: string; sub?: string; tone: 'zinc' | 'amber' | 'violet' | 'rose' | 'emerald'; icon: typeof Gauge }) {
    const color = { zinc: 'text-zinc-200', amber: 'text-amber-400', violet: 'text-violet-400', rose: 'text-rose-400', emerald: 'text-emerald-400' }[tone];
    return (
        <div className={`${CARTAO} p-4`}>
            <div className="flex items-center gap-2 mb-1"><Icon size={12} className="text-zinc-600" /><p className={ROTULO_PEQUENO}>{label}</p></div>
            <p className={`text-lg font-black tracking-tighter truncate ${color}`}>{value}</p>
            {sub && <p className="text-[9px] text-zinc-600 font-bold font-mono">{sub}</p>}
        </div>
    );
}

function OrderList({ title, icon: Icon, tone, orders, empty }: {
    title: string; icon: typeof Clock; tone: 'rose' | 'amber';
    orders: { order_id: string; order_number: string; client_name?: string; client_contact?: string; days: number; pieces: number }[]; empty: string;
}) {
    const color = tone === 'rose' ? 'text-rose-400' : 'text-amber-400';
    return (
        <div className={`${CARTAO} p-4`}>
            <h3 className={`text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2 ${color}`}><Icon size={14} /> {title}</h3>
            {orders.length === 0 ? (
                <p className="text-[11px] text-zinc-600 font-bold">{empty}</p>
            ) : (
                <div className="space-y-2">
                    {orders.slice(0, 8).map(o => (
                        <div key={o.order_id} className="flex items-center justify-between gap-2 text-xs">
                            <div className="min-w-0">
                                <span className="font-bold text-zinc-200">#{o.order_number}</span>
                                <span className="text-zinc-400"> · {o.client_name || 'Cliente'}</span>
                                <span className="text-zinc-600"> · {o.pieces} pç</span>
                                {o.client_contact && <span className="block text-[10px] text-zinc-600 truncate">{o.client_contact}</span>}
                            </div>
                            <span className={`font-mono font-bold shrink-0 ${color}`}>
                                {o.days < 0 ? `${Math.abs(o.days)}d atrás` : o.days === 0 ? 'hoje' : `${o.days}d`}
                            </span>
                        </div>
                    ))}
                    {orders.length > 8 && <p className="text-[9px] text-zinc-600 font-bold pt-1">+{orders.length - 8} pedido(s)</p>}
                </div>
            )}
        </div>
    );
}
