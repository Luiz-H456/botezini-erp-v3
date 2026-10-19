import React, { useState } from 'react';
import { Plus, Check, X, Pencil, Trash2, Table2, EyeOff, Eye } from 'lucide-react';
import { PersonalizacaoPreco, TecnicaPersonalizacao } from '@/types';
import { formatCurrency } from '@/utils';
import { TECNICAS, ROTULO_TECNICA } from '@/utils/personalizacao';
import { usePersonalizacaoMutations } from '@/hooks/usePersonalizacao';
import { useToast } from '@/hooks/useToast';
import { Toast } from '@/components/common/Toast';
import SearchableSelect from '@/components/common/SearchableSelect';
import { CARTAO, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO, BOTAO_PERIGO } from '@/components/finance/ui/estilo';

const inputCls = `${CAMPO} w-full`;

const vazio = (): Partial<PersonalizacaoPreco> => ({
    tecnica: 'bordado', descricao: '', unidade: 'peça', valor: 0,
    faixa_min: null, faixa_max: null, is_active: true,
});

interface Props { precos: PersonalizacaoPreco[]; }

const TabelaDePrecos: React.FC<Props> = ({ precos }) => {
    const { savePreco, deletePreco } = usePersonalizacaoMutations();
    const { toast, showToast } = useToast();
    const [editando, setEditando] = useState<string | 'novo' | null>(null);
    const [form, setForm] = useState<Partial<PersonalizacaoPreco>>(vazio());

    const salvar = async () => {
        if (!form.descricao?.trim()) { showToast('Descreva o que é este preço.', 'error'); return; }
        try {
            await savePreco.mutateAsync({ ...form, id: editando === 'novo' ? undefined : editando! });
            showToast('Preço salvo.', 'success');
            setEditando(null); setForm(vazio());
        } catch (e: any) { showToast(e.message || 'Erro ao salvar', 'error'); }
    };

    const excluir = async (id: string) => {
        try { await deletePreco.mutateAsync(id); showToast('Linha removida.', 'success'); }
        catch (e: any) { showToast(e.message || 'Erro ao excluir', 'error'); }
    };

    const alternarAtivo = async (p: PersonalizacaoPreco) => {
        try { await savePreco.mutateAsync({ ...p, is_active: !(p.is_active !== false) }); }
        catch (e: any) { showToast(e.message || 'Erro', 'error'); }
    };

    const faixaTexto = (p: PersonalizacaoPreco) => {
        const min = p.faixa_min ?? null, max = p.faixa_max ?? null;
        if (min === null && max === null) return 'qualquer qtd.';
        if (min !== null && max !== null) return `${min} a ${max}`;
        if (min !== null) return `a partir de ${min}`;
        return `até ${max}`;
    };

    const editor = (
        <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-5 space-y-4 ease-out animate-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
                    <input className={inputCls} placeholder="Ex: Bordado peito esquerdo até 8 mil pontos"
                        value={form.descricao || ''} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
                </div>
                <div>
                    <label className={`${ROTULO_PEQUENO} block mb-1`}>Unidade</label>
                    <input className={inputCls} placeholder="peça / metro"
                        value={form.unidade || ''} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} />
                </div>
                <div>
                    <label className={`${ROTULO_PEQUENO} block mb-1`}>Valor (R$)*</label>
                    <input type="number" step="0.01" className={`${inputCls} text-right font-mono`}
                        value={form.valor ?? ''} onChange={e => setForm(f => ({ ...f, valor: Number(e.target.value) }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className={`${ROTULO_PEQUENO} block mb-1`} title="Deixe em branco para o preço valer em qualquer quantidade">Qtd. min</label>
                        <input type="number" className={`${inputCls} text-right font-mono`} placeholder="—"
                            value={form.faixa_min ?? ''} onChange={e => setForm(f => ({ ...f, faixa_min: e.target.value === '' ? null : Number(e.target.value) }))} />
                    </div>
                    <div>
                        <label className={`${ROTULO_PEQUENO} block mb-1`}>Qtd. máx</label>
                        <input type="number" className={`${inputCls} text-right font-mono`} placeholder="—"
                            value={form.faixa_max ?? ''} onChange={e => setForm(f => ({ ...f, faixa_max: e.target.value === '' ? null : Number(e.target.value) }))} />
                    </div>
                </div>
            </div>
            <div>
                <label className={`${ROTULO_PEQUENO} block mb-1`}>Observação</label>
                <input className={inputCls} placeholder="Condições, exceções, o que está incluso..."
                    value={form.observacao || ''} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} />
            </div>
            <div className="flex gap-3 justify-end pt-3 border-t border-zinc-800/50">
                <button onClick={() => { setEditando(null); setForm(vazio()); }}
                    className={BOTAO_SECUNDARIO}><X size={14} /> Cancelar</button>
                <button onClick={salvar} disabled={savePreco.isPending}
                    className={BOTAO_PRINCIPAL}>
                    <Check size={14} /> Salvar
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className={`flex justify-between items-start ${CARTAO} p-5`}>
                <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] flex items-center gap-3">
                        <Table2 className="text-amber-500" size={18} /> Tabela de Referência
                    </h3>
                    <p className={`${ROTULO} mt-2`}>
                        O que você pretende cobrar. Consulte antes de orçar em vez de arbitrar valor.
                    </p>
                </div>
                {editando === null && (
                    <button onClick={() => { setForm(vazio()); setEditando('novo'); }}
                        className={BOTAO_PRINCIPAL}>
                        <Plus size={14} /> Nova Linha
                    </button>
                )}
            </div>

            {editando !== null && editor}

            {TECNICAS.map(tecnica => {
                const linhas = precos.filter(p => p.tecnica === tecnica);
                if (linhas.length === 0) return null;
                return (
                    <div key={tecnica} className={`${CARTAO} overflow-hidden`}>
                        <div className="px-5 py-3 bg-zinc-950/50 border-b border-zinc-800">
                            <span className={ROTULO}>{ROTULO_TECNICA[tecnica]}</span>
                        </div>
                        <table className="w-full text-left">
                            <tbody className="divide-y divide-zinc-800/50">
                                {linhas.map(p => (
                                    <tr key={p.id} className={`group hover:bg-zinc-800/20 transition-all ${p.is_active === false ? 'opacity-40' : ''}`}>
                                        <td className="p-4">
                                            <p className="text-white text-xs font-bold">{p.descricao}</p>
                                            {p.observacao && <p className="text-[10px] text-zinc-500 mt-0.5">{p.observacao}</p>}
                                        </td>
                                        <td className="p-4 text-zinc-500 text-[10px] uppercase tracking-wider whitespace-nowrap">{faixaTexto(p)}</td>
                                        <td className="p-4 text-zinc-400 text-xs whitespace-nowrap">por {p.unidade || 'peça'}</td>
                                        <td className="p-4 text-right font-mono font-black text-amber-500 whitespace-nowrap">{formatCurrency(p.valor)}</td>
                                        <td className="p-4">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                <button onClick={() => alternarAtivo(p)} title={p.is_active === false ? 'Reativar' : 'Desativar'}
                                                    aria-label={p.is_active === false ? 'Reativar' : 'Desativar'}
                                                    className={`${BOTAO_SECUNDARIO} w-10 px-0`}>
                                                    {p.is_active === false ? <Eye size={18} /> : <EyeOff size={18} />}
                                                </button>
                                                <button onClick={() => { setForm({ ...p }); setEditando(p.id); }} title="Editar" aria-label="Editar"
                                                    className={`${BOTAO_SECUNDARIO} w-10 px-0`}><Pencil size={18} /></button>
                                                <button onClick={() => excluir(p.id)} title="Excluir" aria-label="Excluir"
                                                    className={`${BOTAO_PERIGO} w-10 px-0`}><Trash2 size={18} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            })}

            {precos.length === 0 && editando === null && (
                <div className={`p-16 text-center ${CARTAO}`}>
                    <Table2 size={40} className="mx-auto text-zinc-700 mb-4" />
                    <p className="text-zinc-400 font-medium mb-1">Nenhum preço tabelado ainda.</p>
                    <p className="text-zinc-600 text-xs">Comece pelo que você mais cobra: bordado de peito e DTF por metro.</p>
                </div>
            )}

            <Toast visible={toast.visible} message={toast.message} type={toast.type} title={toast.title} />
        </div>
    );
};

export default TabelaDePrecos;
