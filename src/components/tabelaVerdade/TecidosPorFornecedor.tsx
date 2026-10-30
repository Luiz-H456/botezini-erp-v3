import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, Layers } from 'lucide-react';
import { tabelaVerdadeRepository } from '@/repositories/tabelaVerdadeRepository';
import { custoDeReferencia, type Catalogo } from '@/utils/tabelaVerdade';
import { getTodayStr } from '@/utils/date';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { CARTAO, ROTULO, BOTAO_SUAVE } from '@/components/finance/ui/estilo';

/**
 * Os tecidos como a tabela verdade os organiza: fornecedor › linha › tecido, com o custo de
 * referência de cada faixa (preço na condição padrão + frete, o mesmo que o orçamento usa).
 * Estoque zero (30/10): aqui não há saldo — a sobra é só registro. O preço muda na tabela do
 * fornecedor; esta lista é a consulta e o atalho para lá.
 */
export function TecidosPorFornecedor({ fornecedores, onAbrirFornecedor }: {
    fornecedores: { id: string; company_name: string }[];
    onAbrirFornecedor?: (id: string) => void;
}) {
    // undefined = carregando; null = falhou
    const [catalogo, setCatalogo] = useState<Catalogo | null | undefined>(undefined);
    const { mostrar } = useMostrarValor();
    useEffect(() => {
        let vivo = true;
        tabelaVerdadeRepository.catalogo().then(c => { if (vivo) setCatalogo(c); }).catch(() => { if (vivo) setCatalogo(null); });
        return () => { vivo = false; };
    }, []);

    const grupos = useMemo(() => {
        if (!catalogo) return [];
        const hoje = getTodayStr();
        const nome = new Map(fornecedores.map(f => [f.id, f.company_name]));
        return [...new Set(catalogo.linhas.map(l => l.fornecedor_id))]
            .map(fid => ({
                id: fid,
                nome: nome.get(fid) ?? 'Fornecedor',
                linhas: catalogo.linhas.filter(l => l.fornecedor_id === fid).sort((a, b) => a.ordem - b.ordem).map(l => ({
                    ...l,
                    tipos: catalogo.tipos.filter(t => t.linha_id === l.id).sort((a, b) => a.ordem - b.ordem).map(t => ({
                        ...t,
                        faixas: catalogo.faixas.filter(f => f.tipo_id === t.id).sort((a, b) => a.ordem - b.ordem)
                            .map(f => ({ ...f, ref: custoDeReferencia(f, catalogo, hoje) })),
                    })),
                })).filter(l => l.tipos.length > 0),
            }))
            .filter(g => g.linhas.length > 0)
            .sort((a, b) => a.nome.localeCompare(b.nome));
    }, [catalogo, fornecedores]);

    if (catalogo === undefined) {
        return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" /></div>;
    }
    if (catalogo === null) {
        return <p className={`${CARTAO} p-4 text-sm text-rose-300`}>Não consegui ler a tabela de tecidos. Recarregue a página; se continuar, a tabela do fornecedor mostra o mesmo dado.</p>;
    }
    if (grupos.length === 0) {
        return (
            <div className={`${CARTAO} p-8 text-center space-y-1`}>
                <Layers size={32} className="mx-auto text-zinc-700" />
                <p className="text-zinc-300 font-medium">Nenhum tecido na tabela ainda.</p>
                <p className="text-zinc-500 text-xs">O tecido nasce na tabela de preços do fornecedor: use “Novo tecido no fornecedor…” acima.</p>
            </div>
        );
    }
    return (
        <div className="space-y-3">
            {grupos.map(g => (
                <section key={g.id} className={`${CARTAO} p-4 space-y-3`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold text-zinc-100">{g.nome}</p>
                        {onAbrirFornecedor && (
                            <button type="button" className={BOTAO_SUAVE} onClick={() => onAbrirFornecedor(g.id)}><ExternalLink size={12} /> Abrir na tabela</button>
                        )}
                    </div>
                    {g.linhas.map(l => (
                        <div key={l.id} className="pl-2 space-y-1.5">
                            <p className={ROTULO}>{l.nome}</p>
                            {l.tipos.map(t => (
                                <div key={t.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                                    <span className="min-w-0 text-zinc-200">{t.nome}</span>
                                    {t.faixas.map(f => (
                                        <span key={f.id} className="text-xs text-zinc-400" title={f.ref.pendencias.join(', ') || undefined}>
                                            {f.nome}:{' '}
                                            {f.ref.valor !== null
                                                ? <span className="text-zinc-200">{mostrar(f.ref.valor)}/{t.unidade}</span>
                                                : <span className="text-rose-400">sem preço</span>}
                                            {f.ref.valor !== null && f.ref.pendencias.length > 0 && <AlertTriangle size={11} className="inline ml-1 text-amber-400" />}
                                        </span>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ))}
                </section>
            ))}
        </div>
    );
}
