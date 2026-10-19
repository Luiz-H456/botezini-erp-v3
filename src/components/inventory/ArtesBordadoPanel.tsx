import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Check, X, Pencil, Trash2, Palette, Search, FolderOpen, Clock, Info } from 'lucide-react';
import { ArteBordado, PersonalizacaoNotas } from '@/types';
import { formatCurrency } from '@/utils';
import { storageService } from '@/services/storage';
import { coresDaArte, ritmoDeBordado, estimarTempo, sugerirPrecoBordado } from '@/utils/personalizacao';
import { usePersonalizacaoMutations } from '@/hooks/usePersonalizacao';
import { useToast } from '@/hooks/useToast';
import { Toast } from '@/components/common/Toast';
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal';
import SearchableSelect from '@/components/common/SearchableSelect';
import { CARTAO, ITEM, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO, BOTAO_PERIGO } from '@/components/finance/ui/estilo';

const inputCls = `${CAMPO} w-full`;

const vazia = (): Partial<ArteBordado> => ({
    nome: '', cliente_id: null, pontos: null, cores_linha: '', tempo_minutos: null,
    local_do_arquivo: '', largura_mm: null, altura_mm: null, observacoes: '',
    feita_em: new Date().toISOString().slice(0, 10), is_active: true,
});

interface Props { artes: ArteBordado[]; notas: PersonalizacaoNotas[]; }

const ArtesBordadoPanel: React.FC<Props> = ({ artes, notas }) => {
    const { saveArte, deleteArte } = usePersonalizacaoMutations();
    const { toast, showToast } = useToast();
    const [editando, setEditando] = useState<string | 'nova' | null>(null);
    const [form, setForm] = useState<Partial<ArteBordado>>(vazia());
    const [busca, setBusca] = useState('');
    const [paraExcluir, setParaExcluir] = useState<ArteBordado | null>(null);

    const { data: clients = [] } = useQuery({
        queryKey: ['clients'],
        queryFn: () => storageService.getClients(),
        staleTime: 1000 * 60 * 5,
    });

    const notasBordado = notas.find(n => n.tecnica === 'bordado') || { tecnica: 'bordado' as const };
    const ritmo = useMemo(() => ritmoDeBordado(artes as any), [artes]);

    const filtradas = useMemo(() => {
        const q = busca.trim().toLowerCase();
        if (!q) return artes;
        return artes.filter(a =>
            a.nome?.toLowerCase().includes(q) ||
            a.cliente_nome?.toLowerCase().includes(q) ||
            a.cores_linha?.toLowerCase().includes(q) ||
            a.local_do_arquivo?.toLowerCase().includes(q));
    }, [artes, busca]);

    const sugestaoDoForm = sugerirPrecoBordado(form.pontos, notasBordado);
    const tempoEstimado = estimarTempo(form.pontos, ritmo);

    const salvar = async () => {
        if (!form.nome?.trim()) { showToast('Dê um nome para a arte.', 'error'); return; }
        try {
            await saveArte.mutateAsync({ ...form, id: editando === 'nova' ? undefined : editando! });
            showToast('Arte salva.', 'success');
            setEditando(null); setForm(vazia());
        } catch (e: any) { showToast(e.message || 'Erro ao salvar', 'error'); }
    };

    const excluir = async () => {
        if (!paraExcluir) return;
        try { await deleteArte.mutateAsync(paraExcluir.id); showToast('Arte removida.', 'success'); setParaExcluir(null); }
        catch (e: any) { showToast(e.message || 'Erro ao excluir', 'error'); }
    };

    return (
        <div className="space-y-4">
            <div className={`flex flex-wrap gap-4 justify-between items-start ${CARTAO} p-5`}>
                <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-[0.2em] flex items-center gap-3">
                        <Palette className="text-amber-500" size={18} /> Artes de Bordado
                    </h3>
                    <p className={`${ROTULO} mt-2`}>
                        Cadastro próprio: o mesmo logo serve vários pedidos por anos. Pontos, cores e tempo ficam guardados.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {ritmo !== null && (
                        <span className={`text-[10px] text-zinc-500 uppercase tracking-widest font-bold ${ITEM} px-3 py-2 flex items-center gap-2`}
                            title="Média das artes que têm pontos E tempo cronometrado">
                            <Clock size={13} className="text-amber-500" /> {ritmo} min / mil pontos
                        </span>
                    )}
                    <div className="relative">
                        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar arte..."
                            className={`${CAMPO} pl-9 w-52`} />
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    </div>
                    {editando === null && (
                        <button onClick={() => { setForm(vazia()); setEditando('nova'); }}
                            className={BOTAO_PRINCIPAL}>
                            <Plus size={14} /> Nova Arte
                        </button>
                    )}
                </div>
            </div>

            {editando !== null && (
                <div className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-5 space-y-4 ease-out animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="col-span-2">
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Nome da arte*</label>
                            <input className={inputCls} placeholder="Ex: Logo Transportadora Silva — peito"
                                value={form.nome || ''} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`} title="Em branco = arte genérica, não pertence a ninguém">Cliente</label>
                            <SearchableSelect
                                options={[{ value: '', label: '— Genérica —' }, ...clients.map(c => ({ value: c.id, label: c.company_name }))]}
                                value={form.cliente_id || ''}
                                onChange={v => setForm(f => ({ ...f, cliente_id: v || null }))}
                                placeholder="— Genérica —"
                            />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Feita em</label>
                            <input type="date" className={inputCls}
                                value={form.feita_em || ''} onChange={e => setForm(f => ({ ...f, feita_em: e.target.value || null }))} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Pontos</label>
                            <input type="number" className={`${inputCls} text-right font-mono`} placeholder="0"
                                value={form.pontos ?? ''} onChange={e => setForm(f => ({ ...f, pontos: e.target.value === '' ? null : Number(e.target.value) }))} />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Tempo (min)</label>
                            <input type="number" className={`${inputCls} text-right font-mono`}
                                placeholder={tempoEstimado !== null ? `~${tempoEstimado}` : '—'}
                                value={form.tempo_minutos ?? ''} onChange={e => setForm(f => ({ ...f, tempo_minutos: e.target.value === '' ? null : Number(e.target.value) }))} />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Largura (mm)</label>
                            <input type="number" className={`${inputCls} text-right font-mono`}
                                value={form.largura_mm ?? ''} onChange={e => setForm(f => ({ ...f, largura_mm: e.target.value === '' ? null : Number(e.target.value) }))} />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Altura (mm)</label>
                            <input type="number" className={`${inputCls} text-right font-mono`}
                                value={form.altura_mm ?? ''} onChange={e => setForm(f => ({ ...f, altura_mm: e.target.value === '' ? null : Number(e.target.value) }))} />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Cores de linha</label>
                            <input className={inputCls} placeholder="Branco, Azul Marinho, Dourado"
                                value={form.cores_linha || ''} onChange={e => setForm(f => ({ ...f, cores_linha: e.target.value }))} />
                        </div>
                    </div>

                    <div>
                        <label className={`${ROTULO_PEQUENO} block mb-1`} title="Texto livre: caminho de rede, pendrive, gaveta, link">Onde está a arte</label>
                        <input className={inputCls} placeholder="Ex: PC da bordadeira \\Artes\\Silva\\logo.dst  —  ou: pendrive azul, gaveta 2"
                            value={form.local_do_arquivo || ''} onChange={e => setForm(f => ({ ...f, local_do_arquivo: e.target.value }))} />
                    </div>

                    <div>
                        <label className={`${ROTULO_PEQUENO} block mb-1`}>Observações</label>
                        <input className={inputCls} placeholder="Cuidados, ajustes na máquina, o que deu errado da última vez..."
                            value={form.observacoes || ''} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
                    </div>

                    <p className={`text-[10px] text-zinc-500 ${ITEM} px-3 py-2 flex items-start gap-2`}>
                        <Info size={12} className="text-amber-500 mt-0.5 shrink-0" />
                        <span>
                            <b className="text-zinc-400">Sugestão de preço:</b>{' '}
                            {sugestaoDoForm.valor !== null && <span className="text-amber-500 font-mono font-black">{formatCurrency(sugestaoDoForm.valor)}</span>}{' '}
                            <span className="text-zinc-600">{sugestaoDoForm.memoria}</span>
                            {' '}É só uma referência — o preço final é sempre seu.
                        </span>
                    </p>

                    <div className="flex gap-3 justify-end pt-3 border-t border-zinc-800/50">
                        <button onClick={() => { setEditando(null); setForm(vazia()); }}
                            className={BOTAO_SECUNDARIO}><X size={14} /> Cancelar</button>
                        <button onClick={salvar} disabled={saveArte.isPending}
                            className={BOTAO_PRINCIPAL}>
                            <Check size={14} /> Salvar Arte
                        </button>
                    </div>
                </div>
            )}

            {filtradas.length === 0 && editando === null ? (
                <div className={`p-16 text-center ${CARTAO}`}>
                    <Palette size={40} className="mx-auto text-zinc-700 mb-4" />
                    <p className="text-zinc-400 font-medium mb-1">{busca ? 'Nenhuma arte encontrada.' : 'Nenhuma arte cadastrada ainda.'}</p>
                    {!busca && <p className="text-zinc-600 text-xs">Cadastre as artes que você mais repete — é o que evita redescobrir os pontos toda vez.</p>}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filtradas.map(a => {
                        const sug = sugerirPrecoBordado(a.pontos, notasBordado);
                        const cores = coresDaArte(a.cores_linha);
                        return (
                            <div key={a.id} className={`${CARTAO} p-5 space-y-3 group hover:border-zinc-700 transition-all`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-black text-white uppercase tracking-wide text-xs truncate">{a.nome}</p>
                                        <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{a.cliente_nome || 'Arte genérica'}</p>
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                                        <button onClick={() => { setForm({ ...a }); setEditando(a.id); }} title="Editar" aria-label="Editar"
                                            className={`${BOTAO_SECUNDARIO} w-10 px-0`}><Pencil size={18} /></button>
                                        <button onClick={() => setParaExcluir(a)} title="Excluir" aria-label="Excluir"
                                            className={`${BOTAO_PERIGO} w-10 px-0`}><Trash2 size={18} /></button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="bg-zinc-950/50 rounded-xl py-2">
                                        <p className={ROTULO_PEQUENO}>Pontos</p>
                                        <p className="font-mono font-black text-white text-sm">{a.pontos ? a.pontos.toLocaleString('pt-BR') : '—'}</p>
                                    </div>
                                    <div className="bg-zinc-950/50 rounded-xl py-2">
                                        <p className={ROTULO_PEQUENO}>Tempo</p>
                                        <p className="font-mono font-black text-white text-sm">
                                            {a.tempo_minutos ? `${a.tempo_minutos} min` : (
                                                estimarTempo(a.pontos, ritmo) !== null
                                                    ? <span className="text-zinc-500" title="Estimado pelo ritmo das artes cronometradas">~{estimarTempo(a.pontos, ritmo)} min</span>
                                                    : '—'
                                            )}
                                        </p>
                                    </div>
                                    <div className="bg-zinc-950/50 rounded-xl py-2">
                                        <p className={ROTULO_PEQUENO} title="Sugestão pelo preço por mil pontos — não é preço fechado">Sugerido</p>
                                        <p className="font-mono font-black text-amber-500 text-sm">{sug.valor !== null ? formatCurrency(sug.valor) : '—'}</p>
                                    </div>
                                </div>

                                {(a.largura_mm || a.altura_mm) && (
                                    <p className="text-[10px] text-zinc-500">
                                        Tamanho: {a.largura_mm || '?'} × {a.altura_mm || '?'} mm
                                    </p>
                                )}

                                {cores.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {cores.map((c, i) => (
                                            <span key={i} className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 bg-zinc-800/60 border border-zinc-700/50 px-2 py-0.5 rounded-full">{c}</span>
                                        ))}
                                    </div>
                                )}

                                {a.local_do_arquivo && (
                                    <p className="text-[10px] text-zinc-400 flex items-start gap-1.5 break-all">
                                        <FolderOpen size={12} className="text-zinc-600 mt-0.5 shrink-0" /> {a.local_do_arquivo}
                                    </p>
                                )}

                                {a.observacoes && <p className="text-[10px] text-zinc-500 italic border-t border-zinc-800/50 pt-2">{a.observacoes}</p>}

                                {a.feita_em && (
                                    <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">
                                        Feita em {new Date(a.feita_em + 'T12:00:00').toLocaleDateString('pt-BR')}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <DeleteConfirmModal isOpen={!!paraExcluir} itemName={paraExcluir?.nome || ''} onConfirm={excluir} onClose={() => setParaExcluir(null)} />
            <Toast visible={toast.visible} message={toast.message} type={toast.type} title={toast.title} />
        </div>
    );
};

export default ArtesBordadoPanel;
