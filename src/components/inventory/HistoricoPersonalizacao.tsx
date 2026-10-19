import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Check, X, Trash2, History, Info } from 'lucide-react';
import {
    PersonalizacaoHistorico, PersonalizacaoPreco, ArteBordado, TecnicaPersonalizacao,
} from '@/types';
import { formatCurrency } from '@/utils';
import { storageService } from '@/services/storage';
import {
    TECNICAS, ROTULO_TECNICA, resumirHistorico, precoDaTabela,
} from '@/utils/personalizacao';
import { usePersonalizacaoMutations } from '@/hooks/usePersonalizacao';
import { useToast } from '@/hooks/useToast';
import { Toast } from '@/components/common/Toast';
import { Pagination } from '@/components/common/Pagination';
import { ITENS_POR_PAGINA } from '@/utils/constants';
import SearchableSelect from '@/components/common/SearchableSelect';
import { CARTAO, ITEM, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO, BOTAO_PERIGO } from '@/components/finance/ui/estilo';

const inputCls = `${CAMPO} w-full`;

const vazio = (): Partial<PersonalizacaoHistorico> => ({
    tecnica: 'bordado', descricao: '', arte_id: null, cliente_id: null,
    quantidade: 0, valor_unitario: 0, data: new Date().toISOString().slice(0, 10),
});

interface Props {
    historico: PersonalizacaoHistorico[];
    artes: ArteBordado[];
    precos: PersonalizacaoPreco[];
}

const HistoricoPersonalizacao: React.FC<Props> = ({ historico, artes, precos }) => {
    const { saveHistorico, deleteHistorico } = usePersonalizacaoMutations();
    const { toast, showToast } = useToast();
    const [lancando, setLancando] = useState(false);
    const [form, setForm] = useState<Partial<PersonalizacaoHistorico>>(vazio());
    const [filtro, setFiltro] = useState<TecnicaPersonalizacao | 'todas'>('todas');
    const [pagina, setPagina] = useState(1);

    const { data: clients = [] } = useQuery({
        queryKey: ['clients'],
        queryFn: () => storageService.getClients(),
        staleTime: 1000 * 60 * 5,
    });
    const nomeCliente = useMemo(() => {
        const m = new Map<string, string>();
        for (const c of clients) m.set(c.id, c.company_name);
        return m;
    }, [clients]);
    const nomeArte = useMemo(() => {
        const m = new Map<string, string>();
        for (const a of artes) m.set(a.id, a.nome);
        return m;
    }, [artes]);

    const filtrado = useMemo(
        () => filtro === 'todas' ? historico : historico.filter(h => h.tecnica === filtro),
        [historico, filtro]);

    React.useEffect(() => { setPagina(1); }, [filtro]);

    const totalPaginas = Math.ceil(filtrado.length / ITENS_POR_PAGINA);
    const daPagina = filtrado.slice((pagina - 1) * ITENS_POR_PAGINA, pagina * ITENS_POR_PAGINA);

    // Referência ao vivo enquanto se digita: o que a tabela diria para esta
    // técnica nesta quantidade. Aparece ao lado do campo, sem preencher nada —
    // preencher sozinho apagaria o dado real, que é o ponto do histórico.
    const referencia = form.tecnica
        ? precoDaTabela(precos as any, form.tecnica, Number(form.quantidade) || 1)
        : null;

    const lancar = async () => {
        if (!form.descricao?.trim()) { showToast('Descreva o que foi feito.', 'error'); return; }
        if (!(Number(form.valor_unitario) > 0)) { showToast('Informe o valor unitário cobrado.', 'error'); return; }
        try {
            await saveHistorico.mutateAsync(form);
            showToast('Lançamento registrado.', 'success');
            setForm(vazio()); setLancando(false);
        } catch (e: any) { showToast(e.message || 'Erro ao lançar', 'error'); }
    };

    const excluir = async (id: string) => {
        try { await deleteHistorico.mutateAsync(id); showToast('Lançamento removido.', 'success'); }
        catch (e: any) { showToast(e.message || 'Erro ao excluir', 'error'); }
    };

    return (
        <div className="space-y-4">
            {/* Resumo por técnica */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {TECNICAS.map(t => {
                    const r = resumirHistorico(historico as any, t);
                    return (
                        <div key={t} className={`${CARTAO} p-4`}>
                            <p className={`${ROTULO_PEQUENO} mb-2`}>{ROTULO_TECNICA[t]}</p>
                            {r ? (
                                <>
                                    <p className="text-2xl font-black text-amber-500 font-mono tracking-tighter" title="Média ponderada pela quantidade">{formatCurrency(r.valorMedio)}</p>
                                    <p className="text-[10px] text-zinc-500 mt-1">
                                        {r.lancamentos} lanç. · {r.quantidadeTotal.toLocaleString('pt-BR')} un ·{' '}
                                        <span title="Mediana — resiste a um lançamento fora da curva">med. {formatCurrency(r.valorMediano)}</span>
                                    </p>
                                    <p className="text-[10px] text-zinc-600 mt-0.5">de {formatCurrency(r.menorValor)} a {formatCurrency(r.maiorValor)}</p>
                                </>
                            ) : (
                                <p className="text-zinc-700 text-sm font-bold">sem lançamentos</p>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className={`flex flex-wrap gap-4 justify-between items-start ${CARTAO} p-5`}>
                <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] flex items-center gap-3">
                        <History className="text-amber-500" size={18} /> O que foi cobrado de verdade
                    </h3>
                    <p className={`${ROTULO} mt-2`}>
                        Lance quantidade e valor de cada bordado, DTF ou silk feito. A distância para a tabela é o que interessa.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-44">
                        <SearchableSelect
                            options={[{ value: 'todas', label: 'Todas as técnicas' }, ...TECNICAS.map(t => ({ value: t, label: ROTULO_TECNICA[t] }))]}
                            value={filtro}
                            onChange={v => setFiltro(v as any)}
                        />
                    </div>
                    {!lancando && (
                        <button onClick={() => { setForm(vazio()); setLancando(true); }}
                            className={BOTAO_PRINCIPAL}>
                            <Plus size={14} /> Lançar
                        </button>
                    )}
                </div>
            </div>

            {lancando && (
                <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-5 space-y-4 ease-out animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Técnica*</label>
                            <SearchableSelect
                                options={TECNICAS.map(t => ({ value: t, label: ROTULO_TECNICA[t] }))}
                                value={form.tecnica || 'bordado'}
                                onChange={v => setForm(f => ({ ...f, tecnica: v as TecnicaPersonalizacao }))}
                            />
                        </div>
                        <div className="col-span-2">
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Descrição*</label>
                            <input className={inputCls} placeholder="Ex: Bordado peito camisa social"
                                value={form.descricao || ''} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Cliente</label>
                            <SearchableSelect
                                options={[{ value: '', label: '—' }, ...clients.map(c => ({ value: c.id, label: c.company_name }))]}
                                value={form.cliente_id || ''}
                                onChange={v => setForm(f => ({ ...f, cliente_id: v || null }))}
                                placeholder="—"
                            />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Arte</label>
                            <SearchableSelect
                                options={[{ value: '', label: '—' }, ...artes.map(a => ({ value: a.id, label: a.nome }))]}
                                value={form.arte_id || ''}
                                onChange={v => {
                                    const arte = artes.find(a => a.id === v);
                                    setForm(f => ({
                                        ...f,
                                        arte_id: v || null,
                                        // A arte sabe o nome; repetir a digitação só cria
                                        // divergência entre a mesma coisa escrita duas vezes.
                                        descricao: f.descricao?.trim() ? f.descricao : (arte?.nome || ''),
                                    }));
                                }}
                                placeholder="—"
                            />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Quantidade</label>
                            <input type="number" step="0.01" className={`${inputCls} text-right font-mono`}
                                value={form.quantidade ?? ''} onChange={e => setForm(f => ({ ...f, quantidade: Number(e.target.value) }))} />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Valor unit. (R$)*</label>
                            <input type="number" step="0.01" className={`${inputCls} text-right font-mono`}
                                value={form.valor_unitario ?? ''} onChange={e => setForm(f => ({ ...f, valor_unitario: Number(e.target.value) }))} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Data</label>
                            <input type="date" className={inputCls}
                                value={form.data || ''} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
                        </div>
                        <div className="col-span-3">
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Observação</label>
                            <input className={inputCls} placeholder="Desconto combinado, urgência, retrabalho..."
                                value={form.observacao || ''} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} />
                        </div>
                    </div>

                    {referencia && (
                        <p className={`text-[10px] text-zinc-500 ${ITEM} px-3 py-2 flex items-start gap-2`}>
                            <Info size={12} className="text-amber-500 mt-0.5 shrink-0" />
                            <span>
                                Sua tabela para {ROTULO_TECNICA[form.tecnica!]} nesta quantidade:{' '}
                                <b className="text-amber-500 font-mono">{formatCurrency(referencia.valor)}</b> — {referencia.descricao}.
                                {' '}Lance o que foi <b className="text-zinc-400">realmente cobrado</b>, mesmo que diferente.
                            </span>
                        </p>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-zinc-800/50">
                        <span className={ROTULO}>
                            Total: <span className="text-amber-500 font-mono text-sm">{formatCurrency((Number(form.quantidade) || 0) * (Number(form.valor_unitario) || 0))}</span>
                        </span>
                        <div className="flex gap-3">
                            <button onClick={() => { setLancando(false); setForm(vazio()); }}
                                className={BOTAO_SECUNDARIO}><X size={14} /> Cancelar</button>
                            <button onClick={lancar} disabled={saveHistorico.isPending}
                                className={BOTAO_PRINCIPAL}>
                                <Check size={14} /> Lançar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className={`${CARTAO} overflow-hidden`}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className={`border-b border-zinc-800 bg-zinc-950/50 ${ROTULO}`}>
                                <th className="p-4">Data</th>
                                <th className="p-4">Técnica</th>
                                <th className="p-4">Descrição</th>
                                <th className="p-4">Cliente</th>
                                <th className="p-4 text-right">Qtd.</th>
                                <th className="p-4 text-right">Valor un.</th>
                                <th className="p-4 text-right">Total</th>
                                <th className="p-4" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {daPagina.length === 0 ? (
                                <tr><td colSpan={8} className="p-16 text-center">
                                    <History size={40} className="mx-auto text-zinc-700 mb-4" />
                                    <p className="text-zinc-400 font-medium">Nenhum lançamento registrado.</p>
                                </td></tr>
                            ) : daPagina.map(h => (
                                <tr key={h.id} className="group hover:bg-zinc-800/20 transition-all">
                                    <td className="p-4 text-zinc-400 text-xs font-mono whitespace-nowrap">
                                        {h.data ? new Date(h.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                                    </td>
                                    <td className="p-4">
                                        <span className="text-[9px] uppercase font-black tracking-widest text-amber-500 bg-amber-950/30 border border-amber-900/40 px-2 py-1 rounded-full">
                                            {ROTULO_TECNICA[h.tecnica]}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <p className="text-white text-xs font-bold">{h.descricao}</p>
                                        {h.arte_id && nomeArte.get(h.arte_id) && (
                                            <p className="text-[10px] text-zinc-600">arte: {nomeArte.get(h.arte_id)}</p>
                                        )}
                                        {h.observacao && <p className="text-[10px] text-zinc-500 italic">{h.observacao}</p>}
                                    </td>
                                    <td className="p-4 text-zinc-400 text-xs">{h.cliente_id ? (nomeCliente.get(h.cliente_id) || '—') : '—'}</td>
                                    <td className="p-4 text-right font-mono text-zinc-300 text-sm">{h.quantidade.toLocaleString('pt-BR')}</td>
                                    <td className="p-4 text-right font-mono text-zinc-300 text-sm">{formatCurrency(h.valor_unitario)}</td>
                                    <td className="p-4 text-right font-mono font-black text-amber-500">{formatCurrency(h.quantidade * h.valor_unitario)}</td>
                                    <td className="p-4">
                                        <button onClick={() => excluir(h.id)} title="Excluir" aria-label="Excluir"
                                            className={`${BOTAO_PERIGO} w-10 px-0 opacity-0 group-hover:opacity-100`}><Trash2 size={18} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {totalPaginas > 1 && (
                <Pagination currentPage={pagina} totalPages={totalPaginas} totalItems={filtrado.length}
                    itemsPerPage={ITENS_POR_PAGINA} onPageChange={setPagina} />
            )}

            <Toast visible={toast.visible} message={toast.message} type={toast.type} title={toast.title} />
        </div>
    );
};

export default HistoricoPersonalizacao;
