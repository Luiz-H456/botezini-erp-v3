import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, Settings2 } from 'lucide-react';
import type { Catalogo } from '@/utils/tabelaVerdade';
import { JANELA_DIAS, menosDias } from '@/utils/tabelaVerdade';
import { tabelaVerdadeRepository, type CompraDoInsumoTV } from '@/repositories/tabelaVerdadeRepository';
import { getTodayStr } from '@/utils/date';
import { CAMPO, BOTAO_SUAVE, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';
import { ConfigComercial } from './ConfigComercial';
import { CartaoDoTipo, comparacoesDoTipo } from './CartaoDoTipo';

export function TabelaDePrecos({ fornecedorId, catalogo, onMudou, onEditarTipo }: {
    fornecedorId: string; catalogo: Catalogo; onMudou: () => void; onEditarTipo: (linhaId: string, tipoId?: string) => void;
}) {
    const hoje = getTodayStr();
    const [linhaId, setLinhaId] = useState(catalogo.linhas[0]?.id ?? '');
    const [config, setConfig] = useState(false);
    const [aberto, setAberto] = useState<string | null>(null);
    const [novaLinha, setNovaLinha] = useState<string | null>(null);
    const [compras, setCompras] = useState<CompraDoInsumoTV[]>([]);
    const [erro, setErro] = useState('');
    useEffect(() => { if (!catalogo.linhas.some(l => l.id === linhaId)) setLinhaId(catalogo.linhas[0]?.id ?? ''); }, [catalogo, linhaId]);
    useEffect(() => {
        let vivo = true;
        tabelaVerdadeRepository.comprasDosInsumos(catalogo.faixas.map(f => f.insumo_id), menosDias(hoje, JANELA_DIAS))
            .then(c => { if (vivo) setCompras(c); }).catch(() => { if (vivo) setCompras([]); });
        return () => { vivo = false; };
    }, [catalogo, hoje]);

    const linha = catalogo.linhas.find(l => l.id === linhaId);
    const tipos = catalogo.tipos.filter(t => t.linha_id === linhaId).sort((a, b) => a.ordem - b.ordem);
    const faixasAcima = useMemo(() => catalogo.tipos.reduce((n, t) =>
        n + [...comparacoesDoTipo(t, catalogo, compras, hoje).values()].filter(c => c?.acima).length, 0), [catalogo, compras, hoje]);

    const criarLinha = async () => {
        if (!novaLinha?.trim()) return;
        setErro('');
        try { const id = await tabelaVerdadeRepository.salvarLinha({ fornecedor_id: fornecedorId, nome: novaLinha.trim() }); setNovaLinha(null); setLinhaId(id); onMudou(); }
        catch (e) { setErro(e instanceof Error ? e.message : 'Não consegui criar a linha.'); }
    };

    return (
        <div className="space-y-4">
            {faixasAcima > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                    <AlertTriangle size={16} /> {faixasAcima} faixa(s) comprando acima da tabela (média dos últimos {JANELA_DIAS} dias)
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                {catalogo.linhas.map(l => (
                    <button key={l.id} type="button" aria-pressed={l.id === linhaId} onClick={() => { setLinhaId(l.id); setConfig(false); }}
                        className={`h-11 px-4 rounded-full border text-sm ${l.id === linhaId ? 'border-amber-500 text-amber-300 bg-amber-500/10' : 'border-zinc-700 text-zinc-400'}`}>{l.nome}</button>
                ))}
                {novaLinha === null
                    ? <button type="button" className={BOTAO_SUAVE} onClick={() => setNovaLinha('')}><Plus size={14} /> Linha</button>
                    : <span className="flex gap-2"><input autoFocus className={CAMPO} placeholder="Ex.: Tricoline" value={novaLinha}
                        onChange={e => setNovaLinha(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') criarLinha(); if (e.key === 'Escape') setNovaLinha(null); }} />
                        <button type="button" className={BOTAO_SECUNDARIO} onClick={criarLinha}>Criar</button></span>}
            </div>
            {erro && <p className="text-xs text-rose-400">{erro}</p>}
            {!linha && <p className="text-sm text-zinc-500">Nenhuma linha ainda. Crie a primeira (ex.: Brim) para cadastrar os tecidos dela.</p>}
            {linha && (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-400">
                        <span>Frete e condições: {linha.usa_frete_do_fornecedor && linha.usa_condicoes_do_fornecedor ? 'os do fornecedor' : 'próprios desta linha'}</span>
                        <button type="button" className={BOTAO_SUAVE} aria-expanded={config} onClick={() => setConfig(c => !c)}><Settings2 size={14} /> Frete e condições da linha</button>
                    </div>
                    {config && <div className="rounded-2xl border border-zinc-800 p-4"><ConfigComercial fornecedorId={fornecedorId} linha={linha} catalogo={catalogo} onSalvou={onMudou} /></div>}
                    {tipos.map(t => (
                        <CartaoDoTipo key={t.id} tipo={t} catalogo={catalogo} compras={compras} aberto={aberto === t.id}
                            onAlternar={() => setAberto(a => (a === t.id ? null : t.id))} onMudou={onMudou} onEditar={() => onEditarTipo(linha.id, t.id)} />
                    ))}
                    <button type="button" className={BOTAO_SUAVE} onClick={() => onEditarTipo(linha.id)}><Plus size={14} /> Novo tecido em {linha.nome}</button>
                </>
            )}
        </div>
    );
}
