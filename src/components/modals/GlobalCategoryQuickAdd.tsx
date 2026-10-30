import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useEscFecha } from '@/hooks/useEscFecha';
import { X, Plus, Trash2, AlertTriangle, Loader2, Lock } from 'lucide-react';
import { GlobalCategory } from '@/types';
import { globalCategoryRepository } from '@/repositories/globalCategoryRepository';
import SearchableSelect from '../common/SearchableSelect';
import { LinhaDeChips } from '@/components/common/LinhaDeChips';
import { SETOR } from '@/components/masterdata/setoresDeCategoria';
import {
    MarcasDaCategoria, MarcaCompacta, EXEMPLOS_FIXO, EXEMPLOS_CPV,
} from '@/components/masterdata/MarcaDeCategoria';

interface Props {
    domain: 'finance' | 'inventory' | 'crm';
    isOpen: boolean;
    onClose: () => void;
    onCreated: (category: GlobalCategory) => void;
}

type Natureza = 'fixo' | 'variavel';

/** Os exemplos do setor são clicáveis: quase sempre a categoria que falta é uma
 *  dessas, e digitar de novo só cria variação de grafia da mesma coisa. */

export const GlobalCategoryQuickAdd: React.FC<Props> = ({ domain, isOpen, onClose, onCreated }) => {
    const [name, setName] = useState('');
    const [parentId, setParentId] = useState<string | null>(null);
    const [custoFixo, setCustoFixo] = useState(false);
    const [custoDoProduto, setCustoDoProduto] = useState(false);
    const [categories, setCategories] = useState<GlobalCategory[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreatingParent, setIsCreatingParent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [classificando, setClassificando] = useState<string | null>(null);

    const setor = SETOR[domain];
    const ehFinanceiro = domain === 'finance';

    // Esc fecha só este painel (ele abre por cima de outro modal); com a lista aberta, fecha só a lista.
    useEscFecha(isOpen, onClose);

    const loadCategories = async () => {
        try {
            setCategories(await globalCategoryRepository.getByDomain(domain));
        } catch (e) {
            console.error('Failed to load global categories', e);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadCategories();
            setName('');
            setParentId(null);
            setCustoFixo(false);
            setCustoDoProduto(false);
            setIsCreatingParent(false);
            setError(null);
        }
    }, [isOpen, domain]);

    /**
     * Categoria já existente com o mesmo nome — o erro mais caro deste modal.
     * Duplicar não quebra nada na hora; quebra o relatório depois, com o mesmo
     * gasto repartido em dois nomes e nenhum dos dois com o valor certo.
     */
    const jaExiste = useMemo(() => {
        const alvo = name.trim().toLowerCase();
        if (!alvo) return null;
        return categories.find(c => (c.name || '').trim().toLowerCase() === alvo) || null;
    }, [name, categories]);

    /**
     * Categorias que ninguém abriu ainda para dizer se são fixas.
     *
     * Elas contam como variáveis no ponto de equilíbrio — é o padrão —, mas
     * "nunca revisada" e "revisada e é variável" não são a mesma coisa, e quem
     * está conferindo o número precisa saber quanto ainda não foi olhado.
     */
    const naoRevisadas = useMemo(
        () => (ehFinanceiro ? categories.filter(c => c.parent_id && !c.natureza).length : 0),
        [categories, ehFinanceiro]);

    /** Grupos do setor — o nível de cima, que não recebe lançamento. */
    const grupos = useMemo(
        () => categories.filter(c => !c.parent_id)
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR')),
        [categories]);

    const handleSave = async () => {
        if (!name.trim() || jaExiste) return;
        // Categoria não existe solta: sem grupo ela não aparece em dropdown
        // nenhum, e quem acabou de criá-la não a encontraria em seguida.
        if (!isCreatingParent && !parentId) return;
        setIsLoading(true);
        setError(null);
        try {
            const newCat = await globalCategoryRepository.save({
                name: name.trim(),
                domain,
                parent_id: isCreatingParent ? null : parentId,
                // Grava sempre os dois lados, nunca nulo: a caixa desmarcada é
                // uma resposta ("é variável"), não uma ausência de resposta.
                // Categoria pai é agrupador e não recebe lançamento.
                ...(ehFinanceiro && !isCreatingParent
                    ? {
                        natureza: (custoFixo ? 'fixo' : 'variavel') as Natureza,
                        custo_do_produto: custoDoProduto,
                    }
                    : {}),
            });

            await loadCategories();

            if (isCreatingParent) {
                setIsCreatingParent(false);
                setName('');
                setParentId(newCat.id);
                return;
            }

            onCreated(newCat);
            onClose();
        } catch (e: any) {
            console.error('Error saving global category', e);
            setError(e.message || 'Erro ao salvar categoria');
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Marca ou desmarca "custo fixo" numa categoria que já existe.
     *
     * Está aqui porque o painel de Saúde do Caixa só lista as categorias que
     * TIVERAM despesa no mês — uma categoria sem movimento no período não
     * aparece lá e não tinha onde ser marcada.
     */
    const alternarMarca = async (c: GlobalCategory, patch: Partial<GlobalCategory>) => {
        setClassificando(c.id);
        setError(null);
        try {
            await globalCategoryRepository.save({ ...c, ...patch });
            await loadCategories();
        } catch (e: any) {
            setError(e.message || 'Erro ao salvar');
        } finally {
            setClassificando(null);
        }
    };

    const alternarFixo = (c: GlobalCategory) =>
        alternarMarca(c, { natureza: c.natureza === 'fixo' ? 'variavel' : 'fixo' });

    const alternarCpv = (c: GlobalCategory) =>
        alternarMarca(c, { custo_do_produto: !c.custo_do_produto });

    const handleDelete = async (id: string) => {
        try {
            await globalCategoryRepository.delete(id);
            setCategories(categories.filter(c => c.id !== id));
        } catch (e: any) {
            setError('Não foi possível excluir: ' + e.message);
        }
    };

    if (!isOpen) return null;

    const InputCls = 'w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-sm text-white outline-none focus:border-amber-500/30 transition-all font-medium placeholder:text-zinc-700';
    const RotuloCls = 'text-[10px] font-black text-zinc-600 uppercase tracking-widest block mb-2 ml-1';
    const { Icone } = setor;

    // Portal no body: aberto de dentro de um modal (z-modal, também no body) ou de uma página com
    // contexto de empilhamento próprio, ficava ATRÁS dele.
    return createPortal(
        <div className="fixed inset-0 z-sobreposto flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4 ease-out animate-in fade-in duration-200">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative">

                {/* ── Cabeçalho: diz o que está sendo classificado, não "categoria" ── */}
                <div className="p-6 border-b border-zinc-900 bg-zinc-950/30">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800 shrink-0">
                                <Icone className="text-amber-500" size={16} />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em] truncate">
                                    {isCreatingParent ? 'Novo grupo' : setor.titulo}
                                </h2>
                                <p className="text-[10px] text-zinc-500 font-bold mt-0.5 truncate">{setor.oQue}</p>
                            </div>
                        </div>
                        <button type="button" onClick={onClose} aria-label="Fechar" className="p-2 text-zinc-600 hover:text-white transition-colors hover:bg-zinc-800 rounded-lg shrink-0">
                            <X size={18} />
                        </button>
                    </div>
                    <p className="text-[10px] text-zinc-600 font-bold leading-relaxed mt-3">{setor.paraQue}</p>
                </div>

                <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
                    <div className="space-y-4">

                        {/* ── Grupo primeiro: a categoria nasce dentro de um ── */}
                        {!isCreatingParent && (
                            <div>
                                <div className="flex items-center justify-between mb-2 ml-1">
                                    <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                                        Dentro do grupo
                                    </label>
                                    <button onClick={() => setIsCreatingParent(true)}
                                        className="text-[10px] font-black text-amber-500 hover:text-amber-400 uppercase flex items-center gap-1 transition-colors">
                                        <Plus size={14} /> Novo grupo
                                    </button>
                                </div>
                                <SearchableSelect
                                    options={grupos.map(c => ({ value: c.id, label: (c.name || '').toUpperCase() }))}
                                    value={parentId || ''}
                                    onChange={val => setParentId(val || null)}
                                    placeholder={grupos.length ? 'ESCOLHER GRUPO...' : 'NENHUM GRUPO AINDA'}
                                />
                                {grupos.length === 0 && (
                                    <p className="text-[10px] text-zinc-600 font-bold mt-2 ml-1 leading-relaxed">
                                        Este setor ainda não tem grupo. Crie um em “Novo grupo” — toda categoria
                                        mora dentro de um.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* ── Nome ─────────────────────────────────────────── */}
                        <div>
                            <label className={RotuloCls}>
                                {isCreatingParent ? 'Nome do grupo' : 'Nome da categoria'}
                            </label>
                            <input
                                autoFocus
                                className={InputCls}
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder={isCreatingParent ? 'Ex: Despesas fixas' : setor.placeholder}
                                onKeyDown={e => e.key === 'Enter' && handleSave()}
                            />

                            {jaExiste ? (
                                <p className="text-[10px] font-bold text-amber-500 mt-2 ml-1 leading-relaxed">
                                    <AlertTriangle size={12} className="inline mb-0.5 mr-1" />
                                    “{jaExiste.name}” já existe. Use a que existe — duas categorias com o
                                    mesmo nome repartem o mesmo valor em duas linhas do relatório.
                                </p>
                            ) : !isCreatingParent && (
                                <div className="mt-2.5">
                                    <LinhaDeChips
                                        itens={setor.exemplos
                                            .filter(ex => !categories.some(c => (c.name || '').toLowerCase() === ex.toLowerCase()))
                                            .map(ex => ({ chave: ex, rotulo: ex }))}
                                        onEscolher={setName}
                                    />
                                </div>
                            )}
                        </div>

                        {/* ── Marcas: só no financeiro, e só na categoria filha ── */}
                        {ehFinanceiro && !isCreatingParent && (
                            <MarcasDaCategoria
                                custoFixo={custoFixo} onCustoFixo={() => setCustoFixo(v => !v)}
                                custoDoProduto={custoDoProduto} onCustoDoProduto={() => setCustoDoProduto(v => !v)}
                            />
                        )}

                        {isCreatingParent && (
                            <p className="text-[10px] text-zinc-600 font-bold ml-1 leading-relaxed">
                                Grupo é só hierarquia: vira título na lista e não pode ser escolhido num
                                cadastro ou lançamento. Depois de criar, você volta para nomear a categoria.
                            </p>
                        )}

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                                <AlertTriangle size={14} /> {error}
                            </div>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={isLoading || !name.trim() || !!jaExiste || (!isCreatingParent && !parentId)}
                            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-xl shadow-lg transition-all disabled:opacity-40 disabled:bg-zinc-800 disabled:text-zinc-500 text-[10px] uppercase tracking-widest active:scale-95"
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                            {isLoading ? 'Salvando...' : isCreatingParent ? 'Criar grupo e voltar' : 'Criar categoria'}
                        </button>

                        {isCreatingParent && (
                            <button onClick={() => setIsCreatingParent(false)}
                                className="w-full text-center py-2 text-[10px] font-black uppercase text-zinc-500 hover:text-zinc-300 transition-colors">
                                Cancelar
                            </button>
                        )}
                    </div>

                    {/* ── Já cadastradas ──────────────────────────────────── */}
                    <div className="pt-6 border-t border-zinc-900/50">
                        <div className="flex items-baseline justify-between gap-3 mb-3">
                            <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                                Já cadastradas
                            </h3>
                            {naoRevisadas > 0 && (
                                <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                                    {naoRevisadas} nunca revisada{naoRevisadas > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>

                        {/* Mesma hierarquia da lista de verdade: grupo como título,
                            categorias recuadas embaixo. Uma lista plana aqui
                            ensinaria o contrário do que o dropdown mostra. */}
                        <div className="max-h-56 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                            {categories.length === 0 && (
                                <p className="text-[10px] text-zinc-600 font-bold">Nenhuma ainda — crie a primeira acima.</p>
                            )}

                            {grupos.map(g => {
                                const filhas = categories
                                    .filter(c => c.parent_id === g.id)
                                    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
                                return (
                                    <div key={g.id}>
                                        <div className="flex items-center justify-between gap-2 px-1 mb-1">
                                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.15em] truncate">
                                                {g.name}
                                            </span>
                                            <button onClick={() => handleDelete(g.id)} title="Excluir grupo" aria-label="Excluir grupo"
                                                className="text-zinc-800 hover:text-red-500 transition-colors inline-flex h-8 w-8 items-center justify-center shrink-0">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>

                                        {filhas.length === 0 ? (
                                            <p className="text-[10px] text-amber-500/70 font-bold ml-3 mb-1">
                                                vazio — não aparece em nenhum cadastro
                                            </p>
                                        ) : filhas.map(c => (
                                            <div key={c.id}
                                                className="flex justify-between items-center gap-2 bg-zinc-900/50 px-3 py-2 rounded-lg border border-zinc-800/50 ml-3 mb-1">
                                                <span className="font-medium text-xs text-zinc-300 truncate min-w-0">{c.name}</span>

                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {/* Marcar aqui é o único caminho para a categoria que
                                                        não teve despesa no mês — o painel de Saúde do
                                                        Caixa só mostra as que tiveram. */}
                                                    {ehFinanceiro && (
                                                        <>
                                                            <MarcaCompacta
                                                                marcado={c.natureza === 'fixo'}
                                                                ocupado={classificando === c.id}
                                                                rotulo="Fixo"
                                                                onToggle={() => alternarFixo(c)}
                                                                titulo={c.natureza === 'fixo'
                                                                    ? 'Custo fixo — clique para tornar variável'
                                                                    : `Marcar como custo fixo (${EXEMPLOS_FIXO})`}
                                                            />
                                                            <MarcaCompacta
                                                                marcado={!!c.custo_do_produto}
                                                                ocupado={classificando === c.id}
                                                                rotulo="CPV"
                                                                onToggle={() => alternarCpv(c)}
                                                                titulo={c.custo_do_produto
                                                                    ? 'Entra no custo do produto — clique para tirar'
                                                                    : `Marcar como custo do produto (${EXEMPLOS_CPV})`}
                                                            />
                                                        </>
                                                    )}

                                                    {ehFinanceiro && !c.natureza && (
                                                        <span title="Ainda não revisada — está contando como variável"
                                                            className="text-[10px] font-black uppercase tracking-widest text-amber-500/70">
                                                            novo
                                                        </span>
                                                    )}

                                                    <button onClick={() => handleDelete(c.id)}
                                                        title="Excluir categoria"
                                                        className="text-zinc-700 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-500/10">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>

                        <p className="text-[10px] text-zinc-600 font-bold mt-3 leading-relaxed">
                            {ehFinanceiro && (
                                <><Lock size={12} className="inline mb-0.5 mr-1" />
                                Sem a marca, a categoria conta como <b className="text-zinc-500">variável</b>. </>
                            )}
                            Para reorganizar grupos, mover ou renomear, use <b className="text-zinc-500">Cadastros › Categorias</b>.
                        </p>
                    </div>
                </div>
            </div>
        </div>
        , document.body);
};
