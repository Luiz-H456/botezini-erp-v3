import { useEffect, useMemo, useState } from 'react';
import { tabelaVerdadeRepository, type CompraDoInsumoTV } from '@/repositories/tabelaVerdadeRepository';
import type { Catalogo } from '@/utils/tabelaVerdade';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { diaEMes } from '@/utils/financas/base';

/** Compras lançadas com este fornecedor, da mais recente para a mais antiga (só leitura). */
export function ComprasDoFornecedor({ fornecedorId, catalogo }: { fornecedorId: string; catalogo: Catalogo }) {
    const { mostrar } = useMostrarValor();
    const [compras, setCompras] = useState<CompraDoInsumoTV[] | null>(null);
    const [erro, setErro] = useState('');
    useEffect(() => {
        let vivo = true;
        tabelaVerdadeRepository.comprasDoFornecedor(fornecedorId).then(c => { if (vivo) setCompras(c); })
            .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Não consegui ler as compras.'); });
        return () => { vivo = false; };
    }, [fornecedorId]);
    const nome = useMemo(() => {
        const m = new Map<string, string>();
        for (const f of catalogo.faixas) m.set(f.insumo_id, `${catalogo.tipos.find(t => t.id === f.tipo_id)?.nome ?? ''} · ${f.nome}`);
        return m;
    }, [catalogo]);
    if (erro) return <p className="text-sm text-rose-400">{erro}</p>;
    if (!compras) return <p className="text-sm text-zinc-500">Carregando…</p>;
    if (compras.length === 0) return <p className="text-sm text-zinc-500">Nenhuma compra lançada com este fornecedor.</p>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead><tr className="text-zinc-500"><th className="text-left p-2 font-bold">Data</th><th className="text-left p-2 font-bold">Item</th>
                    <th className="text-right p-2 font-bold">Qtd</th><th className="text-right p-2 font-bold">Preço</th><th className="text-right p-2 font-bold">Total</th></tr></thead>
                <tbody>{compras.map((c, i) => (
                    <tr key={`${c.compra_id}-${c.insumo_id}-${i}`} className="border-t border-zinc-800">
                        <td className="p-2 whitespace-nowrap">{diaEMes(c.data)}/{c.data.slice(2, 4)}</td>
                        <td className="p-2">{nome.get(c.insumo_id) ?? 'aviamento / outro'}</td>
                        <td className="p-2 text-right">{c.quantidade.toLocaleString('pt-BR')}</td>
                        <td className="p-2 text-right">{mostrar(c.custo_unitario)}</td>
                        <td className="p-2 text-right">{mostrar(c.quantidade * c.custo_unitario)}</td>
                    </tr>))}</tbody>
            </table>
        </div>
    );
}
