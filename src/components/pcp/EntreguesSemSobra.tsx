import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { comprasRepository, type PedidoParaSobra } from '@/repositories/comprasRepository';
import { apurarSobrasDoPedido } from '@/hooks/pcp/apurarSobrasDoPedido';
import { avisoDaEntrega } from '@/utils/fabrica/avisoDaEntrega';
import { CARTAO, ROTULO, BOTAO_SUAVE } from '@/components/finance/ui/estilo';

/**
 * Recuperação da sobra: entregues (últimos 90 dias) com compra ou uso do estoque vinculado e
 * sem sobra apurada. Cobre falha no Quadro, recarga da página e pedido entregue pelo menu de
 * Pedidos (que nunca calcula a sobra). Só aparece quando há o que apurar.
 */
export function EntreguesSemSobra({ onApurado }: { onApurado: (msg: string) => void }) {
    const [pedidos, setPedidos] = useState<PedidoParaSobra[]>([]);
    // Resultado por pedido que não deu certo (a linha fica, com o motivo).
    const [falhas, setFalhas] = useState<Map<string, string>>(new Map());
    const [ocupado, setOcupado] = useState<Set<string>>(new Set());
    const [erroLeitura, setErroLeitura] = useState('');

    const carregar = useCallback(async () => {
        try { setPedidos(await comprasRepository.entreguesSemSobra()); setErroLeitura(''); }
        catch (e: any) { setErroLeitura(`Não consegui ler os pedidos entregues sem sobra apurada: ${e?.message || 'falha'}`); }
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    // Devolve a mensagem de sucesso, ou null se falhou (a falha já ficou na linha).
    const apurarUm = async (p: PedidoParaSobra): Promise<string | null> => {
        setOcupado(prev => new Set(prev).add(p.id));
        try {
            const r = await apurarSobrasDoPedido(p);
            if ('semBanco' in r && r.semBanco) throw new Error('o banco ainda não tem compras por pedido');
            setFalhas(prev => { const n = new Map(prev); n.delete(p.id); return n; });
            return `Pedido ${p.order_number}: ${avisoDaEntrega(r) ?? 'sem sobra para o estoque.'}`;
        } catch (e: any) {
            setFalhas(prev => new Map(prev).set(p.id, e?.message || 'erro'));
            return null;
        } finally {
            setOcupado(prev => { const n = new Set(prev); n.delete(p.id); return n; });
        }
    };

    const apurar = async (lista: PedidoParaSobra[]) => {
        const ok: string[] = [];
        for (const p of lista) { const m = await apurarUm(p); if (m) ok.push(m); }
        if (ok.length) onApurado(ok.join(' '));
        await carregar();
    };

    if (pedidos.length === 0 && !erroLeitura) return null;
    const algumOcupado = ocupado.size > 0;

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3">
                <p className={ROTULO}>Entregues sem sobra apurada</p>
                {pedidos.length > 1 && (
                    <button type="button" onClick={() => apurar(pedidos)} disabled={algumOcupado} className={`${BOTAO_SUAVE} ml-auto`}>
                        Apurar todas
                    </button>
                )}
            </div>
            {erroLeitura && (
                <div className="flex items-start gap-2 px-4 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] font-bold text-rose-300 flex-1">{erroLeitura}</span>
                </div>
            )}
            {pedidos.map(p => (
                <div key={p.id} className={`${CARTAO} p-4`}>
                    <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-zinc-200 truncate">Pedido {p.order_number}</p>
                            {falhas.has(p.id) && (
                                <p className="text-[11px] font-bold text-rose-300 mt-0.5">A sobra não foi para o estoque: {falhas.get(p.id)}.</p>
                            )}
                        </div>
                        <button type="button" onClick={() => apurar([p])} disabled={algumOcupado} className={BOTAO_SUAVE}>
                            {ocupado.has(p.id) ? 'Apurando…' : 'Apurar sobra'}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
