import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Pencil, TrendingUp } from 'lucide-react';
import {
    condicoesDaLinha, custoDeReferencia, precoVigente, paraCampo, comparacaoComComprado, freteNaUnidade, freteDaLinha,
    type Catalogo, type TVTipo, type Comparacao,
} from '@/utils/tabelaVerdade';
import type { CompraDoInsumoTV } from '@/repositories/tabelaVerdadeRepository';
import { tabelaVerdadeRepository } from '@/repositories/tabelaVerdadeRepository';
import { getTodayStr } from '@/utils/date';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { CAMPO, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';
import { ComprasReais } from './ComprasReais';
import { ReajusteModal } from './ReajusteModal';

export function comparacoesDoTipo(tipo: TVTipo, cat: Catalogo, compras: CompraDoInsumoTV[], hoje: string): Map<string, Comparacao | null> {
    const linhaId = tipo.linha_id;
    const padrao = condicoesDaLinha(linhaId, cat.condicoes).find(c => c.padrao);
    const frete = freteNaUnidade(freteDaLinha(linhaId, cat.fretes), tipo).valor;
    const mapa = new Map<string, Comparacao | null>();
    for (const fx of cat.faixas.filter(f => f.tipo_id === tipo.id)) {
        const daFaixa = compras.filter(c => c.insumo_id === fx.insumo_id);
        const previsto = (d: string) => {
            const p = padrao ? precoVigente(cat.precos, fx.id, padrao.id, d) : null;
            return p ? p.valor + frete : null;
        };
        mapa.set(fx.id, comparacaoComComprado(daFaixa, previsto, hoje));
    }
    return mapa;
}

export function CartaoDoTipo({ tipo, catalogo, compras, aberto, onAlternar, onMudou, onEditar }: {
    tipo: TVTipo; catalogo: Catalogo; compras: CompraDoInsumoTV[]; aberto: boolean;
    onAlternar: () => void; onMudou: () => void; onEditar: () => void;
}) {
    const { mostrar } = useMostrarValor();
    const hoje = getTodayStr();
    const faixas = catalogo.faixas.filter(f => f.tipo_id === tipo.id).sort((a, b) => a.ordem - b.ordem);
    const condicoes = condicoesDaLinha(tipo.linha_id, catalogo.condicoes);
    const comparacoes = useMemo(() => comparacoesDoTipo(tipo, catalogo, compras, hoje), [tipo, catalogo, compras, hoje]);
    const acima = [...comparacoes.values()].filter(c => c?.acima).length;
    const refs = faixas.map(f => custoDeReferencia(f, catalogo, hoje).valor).filter((v): v is number => v !== null);
    const [expandida, setExpandida] = useState<string | null>(null);
    const [reajuste, setReajuste] = useState(false);
    const [erro, setErro] = useState('');
    const cores = (faixaId: string) => (catalogo.cores ?? []).filter(c => c.faixa_id === faixaId).length;

    // Corrige o preço vigente (mesmo vale_desde); célula vazia sem preço cria um hoje.
    const gravar = async (faixaNome: string, faixaId: string, condicaoId: string, texto: string) => {
        setErro('');
        const vigente = precoVigente(catalogo.precos, faixaId, condicaoId, hoje);
        const valor = texto.trim() === '' ? null : Number(texto.replace(',', '.'));
        if (valor !== null && !(valor > 0)) { setErro('Preço tem de ser maior que zero.'); return; }
        if (valor === (vigente?.valor ?? null)) return;
        try {
            await tabelaVerdadeRepository.salvarTipo({
                id: tipo.id, linha_id: tipo.linha_id, nome: tipo.nome, unidade: tipo.unidade,
                rendimento_m_por_kg: tipo.rendimento_m_por_kg, composicao: tipo.composicao,
                faixas: faixas.map(f => ({ id: f.id, nome: f.nome, ordem: f.ordem })),
                // A cartela vai inteira: salvar_tecido_tipo trata a lista como o conjunto do banco.
                cores: (catalogo.cores ?? [])
                    .filter(c => faixas.some(f => f.id === c.faixa_id))
                    .map(c => ({ nome: c.nome, hex: c.hex, faixa: faixas.find(f => f.id === c.faixa_id)!.nome })),
                precos: [{ faixa: faixaNome, condicao_id: condicaoId, vale_desde: vigente?.vale_desde, valor }],
            });
            onMudou();
        } catch (e) { setErro(e instanceof Error ? e.message : 'Não consegui salvar o preço.'); }
    };

    return (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40">
            <button type="button" onClick={onAlternar} aria-expanded={aberto} className="w-full flex flex-wrap items-center justify-between gap-2 p-4 text-left min-h-11">
                <span className="min-w-0"><span className="text-white font-bold">{tipo.nome}</span>
                    <span className="text-xs text-zinc-500"> · {tipo.unidade}{tipo.rendimento_m_por_kg ? ` · ${tipo.rendimento_m_por_kg} m/kg` : ''}{tipo.composicao ? ` · ${tipo.composicao}` : ''} · {faixas.length} faixa(s)</span></span>
                <span className="flex items-center gap-2 text-xs">
                    {acima > 0 && <span className="text-amber-400 flex items-center gap-1"><AlertTriangle size={14} /> {acima} acima</span>}
                    {!aberto && refs.length > 0 && <span className="text-zinc-400">ref. {mostrar(Math.min(...refs))}{refs.length > 1 ? ` a ${mostrar(Math.max(...refs))}` : ''}/{tipo.unidade}</span>}
                    <ChevronDown size={16} className={`text-zinc-500 transition-transform ${aberto ? 'rotate-180' : ''}`} />
                </span>
            </button>
            {aberto && (
                <div className="px-4 pb-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={BOTAO_SECUNDARIO} onClick={onEditar}><Pencil size={14} /> Editar tecido</button>
                        <button type="button" className={BOTAO_SECUNDARIO} disabled={condicoes.length === 0} onClick={() => setReajuste(true)}><TrendingUp size={14} /> Reajustar</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="text-zinc-500">
                                <th className="text-left font-bold p-2">Faixa</th>
                                {condicoes.map(c => <th key={c.id} className={`text-right font-bold p-2 ${c.padrao ? 'text-amber-400' : ''}`}>{c.nome}{c.padrao ? ' · padrão' : ''}</th>)}
                                <th className="text-right font-bold p-2">Ref. c/ frete</th><th className="text-right font-bold p-2">Compras</th>
                            </tr></thead>
                            <tbody>{faixas.map(f => {
                                const ref = custoDeReferencia(f, catalogo, hoje);
                                const comp = comparacoes.get(f.id) ?? null;
                                return (
                                    <tr key={f.id} className="border-t border-zinc-800 align-middle">
                                        <td className="p-2 text-zinc-200 whitespace-nowrap">{f.nome}<span className="text-zinc-500 text-xs"> · {cores(f.id)} cor(es)</span></td>
                                        {condicoes.map(c => (
                                            <td key={c.id} className="p-1 text-right">
                                                {/* A chave leva o preço vigente: depois de um reajuste ou de outra aba salvar,
                                                    a célula (não controlada) é refeita com o valor novo em vez de mostrar o velho. */}
                                                <input key={`${f.id}-${c.id}-${precoVigente(catalogo.precos, f.id, c.id, hoje)?.valor ?? ''}`} className={`${CAMPO} w-24 text-right ${c.padrao ? 'text-amber-300' : ''}`} inputMode="decimal"
                                                    aria-label={`Preço ${f.nome} ${c.nome}`} defaultValue={paraCampo(precoVigente(catalogo.precos, f.id, c.id, hoje)?.valor)}
                                                    onBlur={e => gravar(f.nome, f.id, c.id, e.target.value)} />
                                            </td>))}
                                        <td className="p-2 text-right text-white whitespace-nowrap" title={ref.pendencias.join(', ')}>
                                            {ref.valor !== null ? mostrar(ref.valor) : <span className="text-zinc-500">{ref.pendencias.includes('faixa sem preço') ? 'sem preço' : (ref.pendencias[0] ?? '—')}</span>}
                                            {ref.valor !== null && ref.pendencias.length > 0 && <AlertTriangle size={12} className="inline ml-1 text-amber-400" />}
                                        </td>
                                        <td className="p-2 text-right whitespace-nowrap">
                                            {comp === null ? <span className="text-zinc-500">sem compra</span> : (
                                                <button type="button" className={`underline-offset-2 hover:underline min-h-11 ${comp.acima ? 'text-amber-400' : 'text-zinc-300'}`}
                                                    aria-expanded={expandida === f.id} onClick={() => setExpandida(x => (x === f.id ? null : f.id))}>
                                                    {comp.acima ? `+${comp.diferencaPct?.toFixed(1).replace('.', ',')}%` : 'ok'} · ver
                                                </button>)}
                                        </td>
                                    </tr>);
                            })}</tbody>
                        </table>
                    </div>
                    {expandida && comparacoes.get(expandida) && (
                        <div><p className="text-xs text-zinc-500">Compras reais · {faixas.find(f => f.id === expandida)?.nome}</p><ComprasReais c={comparacoes.get(expandida)!} /></div>
                    )}
                    {erro && <p className="text-xs text-rose-400">{erro}</p>}
                </div>
            )}
            {reajuste && (
                <ReajusteModal nomeTipo={tipo.nome} faixas={faixas} condicoes={condicoes} precos={catalogo.precos}
                    onClose={() => setReajuste(false)} onFeito={() => { setReajuste(false); onMudou(); }} />
            )}
        </div>
    );
}
