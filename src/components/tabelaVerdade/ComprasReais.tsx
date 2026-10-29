import type { Comparacao } from '@/utils/tabelaVerdade';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { diaEMes } from '@/utils/financas/base';

/** Menor, média e maior pagos na janela, com datas e o previsto (pedido do Luiz, 29/10). */
export function ComprasReais({ c }: { c: Comparacao }) {
    const { mostrar } = useMostrarValor();
    const caixa = 'flex-1 min-w-[8rem] rounded-xl border border-zinc-800 p-3';
    return (
        <div className="flex flex-wrap gap-2 mt-2">
            <div className={caixa}><p className="text-xs text-zinc-500">Menor</p><p className="text-white font-bold">{mostrar(c.menor.valor)}</p><p className="text-xs text-zinc-500">{diaEMes(c.menor.data)}</p></div>
            <div className={`${caixa} ${c.acima ? 'border-amber-500/50' : ''}`}>
                <p className="text-xs text-zinc-500">Média (90 dias)</p>
                <p className={`font-bold ${c.acima ? 'text-amber-400' : 'text-white'}`}>{mostrar(c.media)}</p>
                <p className="text-xs text-zinc-500">{c.previstoMedio !== null ? `previsto ${mostrar(c.previstoMedio)} · ` : ''}{c.compras} compra(s)</p>
            </div>
            <div className={caixa}><p className="text-xs text-zinc-500">Maior</p><p className="text-white font-bold">{mostrar(c.maior.valor)}</p><p className="text-xs text-zinc-500">{diaEMes(c.maior.data)}</p></div>
        </div>
    );
}
