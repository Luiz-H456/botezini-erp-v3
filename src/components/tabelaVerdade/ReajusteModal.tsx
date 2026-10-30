import { useState } from 'react';
import { createPortal } from 'react-dom';
import { tabelaVerdadeRepository } from '@/repositories/tabelaVerdadeRepository';
import { precoVigente, paraCampo, type TVCondicao, type TVFaixa, type TVPreco } from '@/utils/tabelaVerdade';
import { getTodayStr } from '@/utils/date';
import { CAMPO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

import { useSaidaProtegida } from '@/hooks/useSaidaProtegida';
/** Reajuste: grade nova com data de vigência; a anterior fica no histórico. */
export function ReajusteModal({ nomeTipo, faixas, condicoes, precos, onClose, onFeito }: {
    nomeTipo: string; faixas: TVFaixa[]; condicoes: TVCondicao[]; precos: TVPreco[]; onClose: () => void; onFeito: () => void;
}) {
    // Fechar com algo digitado pergunta antes (passada de celular e fábrica: as janelas que faltavam).
    const saida = useSaidaProtegida(onClose);
    const hoje = getTodayStr();
    const [data, setData] = useState(hoje);
    const [grade, setGrade] = useState<Record<string, string>>(() => Object.fromEntries(faixas.flatMap(f => condicoes.map(c => [
        `${f.id}|${c.id}`, paraCampo(precoVigente(precos, f.id, c.id, hoje)?.valor)]))));
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    const salvar = async () => {
        setErro(''); setSalvando(true);
        try {
            await tabelaVerdadeRepository.reajustar({
                vale_desde: data,
                precos: Object.entries(grade).filter(([, v]) => Number(v.replace(',', '.')) > 0).map(([k, v]) => {
                    const [faixa_id, condicao_id] = k.split('|');
                    return { faixa_id, condicao_id, valor: Number(v.replace(',', '.')) };
                }),
            });
            onFeito();
        } catch (e) { setErro(e instanceof Error ? e.message : 'Não consegui reajustar.'); } finally { setSalvando(false); }
    };
    return <>{saida.confirmacao}{createPortal(
        <div className="fixed inset-0 z-sobreposto bg-zinc-950/85 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 space-y-4" {...saida.aoMexer}>
                <h3 className="text-white font-black">Reajustar {nomeTipo}</h3>
                <label className="block"><span className={ROTULO_PEQUENO}>Passa a valer em</span>
                    <input type="date" className={`${CAMPO} mt-1`} value={data} onChange={e => setData(e.target.value)} /></label>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead><tr><th className="text-left text-zinc-500 font-bold p-2">Faixa</th>{condicoes.map(c => <th key={c.id} className="text-right text-zinc-500 font-bold p-2">{c.nome}</th>)}</tr></thead>
                        <tbody>{faixas.map(f => (
                            <tr key={f.id} className="border-t border-zinc-800"><td className="p-2 text-zinc-300">{f.nome}</td>
                                {condicoes.map(c => (<td key={c.id} className="p-1"><input className={`${CAMPO} w-24 text-right`} inputMode="decimal"
                                    aria-label={`${f.nome} ${c.nome}`} value={grade[`${f.id}|${c.id}`] ?? ''}
                                    onChange={e => setGrade(g => ({ ...g, [`${f.id}|${c.id}`]: e.target.value }))} /></td>))}
                            </tr>))}</tbody>
                    </table>
                </div>
                <p className="text-xs text-zinc-500">Os preços de antes continuam guardados; compras antigas seguem comparadas com o preço da data delas.</p>
                {erro && <p className="text-xs text-rose-400">{erro}</p>}
                <div className="flex justify-end gap-2">
                    <button type="button" className={BOTAO_SECUNDARIO} onClick={saida.pedirParaFechar}>Cancelar</button>
                    <button type="button" className={BOTAO_PRINCIPAL} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Aplicar reajuste'}</button>
                </div>
            </div>
        </div>, document.body,
    )}</>;
}
