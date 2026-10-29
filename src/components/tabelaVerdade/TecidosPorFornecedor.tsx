import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, Layers } from 'lucide-react';
import { tabelaVerdadeRepository } from '@/repositories/tabelaVerdadeRepository';
import type { Catalogo } from '@/utils/tabelaVerdade';
import { numero } from '@/utils/numeros';
import { CARTAO, ROTULO, BOTAO_SUAVE } from '@/components/finance/ui/estilo';

interface InsumoComSaldo { id: string; current_stock?: number | null; unit?: string | null; canonical_insumo_id?: string | null; faixa_id?: string | null }

/**
 * Os tecidos no Estoque, como a tabela verdade os organiza: fornecedor › linha › tecido, com o
 * saldo de cada faixa (v3.1). Sem preço nenhum — a fábrica também vê o Estoque. O saldo de um
 * apelido soma no da faixa dele, como na conta do custo (apelidosDeInsumo).
 */
export function TecidosPorFornecedor({ insumos, fornecedores, onAbrirFornecedor }: {
    insumos: InsumoComSaldo[];
    fornecedores: { id: string; company_name: string }[];
    onAbrirFornecedor?: (id: string) => void;
}) {
    const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
    const [aberto, setAberto] = useState(false);
    useEffect(() => {
        let vivo = true;
        tabelaVerdadeRepository.catalogo().then(c => { if (vivo) setCatalogo(c); }).catch(() => { if (vivo) setCatalogo(null); });
        return () => { vivo = false; };
    }, []);

    const grupos = useMemo(() => {
        if (!catalogo) return [];
        const saldoDaFaixa = new Map<string, number>();
        for (const i of insumos) if (i.faixa_id) saldoDaFaixa.set(i.faixa_id, (saldoDaFaixa.get(i.faixa_id) ?? 0) + (Number(i.current_stock) || 0));
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
                            .map(f => ({ ...f, saldo: saldoDaFaixa.get(f.id) ?? 0 })),
                    })),
                })).filter(l => l.tipos.length > 0),
            }))
            .filter(g => g.linhas.length > 0)
            .sort((a, b) => a.nome.localeCompare(b.nome));
    }, [catalogo, insumos, fornecedores]);

    if (grupos.length === 0) return null;
    const tecidos = grupos.reduce((n, g) => n + g.linhas.reduce((m, l) => m + l.tipos.length, 0), 0);
    return (
        <section className={`${CARTAO} p-4 space-y-3`}>
            <button type="button" aria-expanded={aberto} onClick={() => setAberto(a => !a)} className="w-full min-h-11 flex items-center justify-between gap-2 text-left">
                <span className={`${ROTULO} flex items-center gap-2`}><Layers size={14} className="text-amber-500" /> Tecidos por fornecedor</span>
                <span className="flex items-center gap-2 text-xs text-zinc-500">{tecidos} tecido(s) · {grupos.length} fornecedor(es)
                    <ChevronDown size={16} className={`transition-transform ${aberto ? 'rotate-180' : ''}`} /></span>
            </button>
            {aberto && grupos.map(g => (
                <div key={g.id} className="space-y-2 border-t border-zinc-800 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold text-zinc-100">{g.nome}</p>
                        {onAbrirFornecedor && (
                            <button type="button" className={BOTAO_SUAVE} onClick={() => onAbrirFornecedor(g.id)}><ExternalLink size={12} /> Abrir na tabela</button>
                        )}
                    </div>
                    {g.linhas.map(l => (
                        <div key={l.id} className="pl-2 space-y-1.5">
                            <p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">{l.nome}</p>
                            {l.tipos.map(t => (
                                <div key={t.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                                    <span className="min-w-0 text-zinc-200">{t.nome}</span>
                                    {t.faixas.map(f => (
                                        <span key={f.id} className={`text-xs ${f.saldo > 0 ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                            {f.nome}: {numero(f.saldo)} {t.unidade}
                                        </span>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            ))}
        </section>
    );
}
