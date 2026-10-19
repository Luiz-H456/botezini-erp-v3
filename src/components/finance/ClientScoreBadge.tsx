import { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { storageService } from '@/services/storage';
import { ClientScore } from '@/types/finance';

/**
 * Badge de score do cliente (0–100), derivado do histórico de pagamentos.
 * Busca sob demanda pelo id. Mostra "sem histórico" quando null.
 */
export function ClientScoreBadge({ clientId }: { clientId: string }) {
    const [score, setScore] = useState<ClientScore | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        storageService.getClientScore(clientId)
            .then(s => { if (alive) setScore(s); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [clientId]);

    if (loading) {
        return <div className="h-6 w-24 bg-zinc-800/60 rounded-lg animate-pulse" />;
    }

    const value = score?.score;
    const known = value !== null && value !== undefined;
    const tone = !known ? 'zinc'
        : value >= 75 ? 'emerald'
        : value >= 50 ? 'amber'
        : 'rose';
    const color = {
        zinc: 'text-zinc-500 border-zinc-700 bg-zinc-800/40',
        emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
        amber: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
        rose: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
    }[tone];

    // `on_time_pct` nulo significa "nenhum pagamento julgável ainda" — conta de
    // pedido não entregue fica de fora do julgamento (ver
    // score_ignora_pedido_nao_entregue.sql). Mostrar 0% ali seria acusar de
    // impontual justamente quem ainda não teve prazo para pagar.
    const semJulgamento = score?.on_time_pct === null || score?.on_time_pct === undefined;
    const tip = !known
        ? 'Sem histórico de pagamentos ainda'
        : semJulgamento
            ? `Nenhum pagamento julgado ainda — pedidos não entregues não contam · ${score?.order_count ?? 0} pedidos`
            : `Pontualidade ${score?.on_time_pct}% · atraso médio ${score?.avg_delay_days ?? 0}d · ${score?.order_count ?? 0} pedidos`;

    return (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${color}`} title={tip}>
            <ShieldCheck size={12} />
            <span className="text-[10px] font-black uppercase tracking-widest">
                Score {known ? value : '—'}
            </span>
        </div>
    );
}
