import React, { useState, useMemo, useRef } from 'react';
import {
    Plus, Trash2, Lock, Check, Loader2, AlertTriangle, Pencil, X,
    FolderTree, CornerDownRight, Unlink, FolderPlus,
} from 'lucide-react';
import type { GlobalCategory } from '@/types';
import { globalCategoryRepository } from '@/repositories/globalCategoryRepository';
import SearchableSelect from '@/components/common/SearchableSelect';
import {
    CARTAO, ITEM, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SUAVE,
    BOTAO_SECUNDARIO, BOTAO_PERIGO, pilula,
} from '@/components/finance/ui/estilo';
import { LinhaDeChips } from '@/components/common/LinhaDeChips';
import { SETOR, DominioDeCategoria } from '@/components/masterdata/setoresDeCategoria';
import {
    MarcasDaCategoria, MarcaCompacta, EXEMPLOS_FIXO, EXEMPLOS_CPV,
} from '@/components/masterdata/MarcaDeCategoria';

interface Props {
    /** Todas as categorias, dos três domínios — a página já as carrega juntas. */
    categories: GlobalCategory[];
    /** Recarrega os dados da página depois de qualquer gravação. */
    onChanged: () => void;
}

const DOMINIOS: DominioDeCategoria[] = ['crm', 'inventory', 'finance'];

const InputCls = `${CAMPO} w-full`;
const RotuloCls = `${ROTULO_PEQUENO} block mb-2 ml-1`;

const porNome = (a: GlobalCategory, b: GlobalCategory) =>
    (a.name || '').localeCompare(b.name || '', 'pt-BR');

/**
 * Gerência das categorias, um setor por vez.
 *
 * A estrutura tem DOIS níveis e só dois: grupo e categoria. O grupo existe para
 * dar hierarquia à lista e nunca recebe lançamento; a categoria é o que se
 * escolhe no cadastro e no lançamento, e nasce sempre dentro de um grupo. Sem
 * essa regra a lista virava um monte plano onde grupo e categoria disputavam a
 * mesma seleção, e o relatório repartia o mesmo gasto entre os dois níveis.
 */
export const CategoriasTab: React.FC<Props> = ({ categories, onChanged }) => {
    const [dominio, setDominio] = useState<DominioDeCategoria>('crm');
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null);

    // Criar categoria (sempre dentro de um grupo).
    const [nome, setNome] = useState('');
    const [paiEscolhido, setPaiEscolhido] = useState('');
    const [custoFixo, setCustoFixo] = useState(false);
    const [custoDoProduto, setCustoDoProduto] = useState(false);
    const campoNome = useRef<HTMLInputElement>(null);

    // Criar grupo — fica atrás de um botão porque é o evento raro.
    const [criandoGrupo, setCriandoGrupo] = useState(false);
    const [nomeDoGrupo, setNomeDoGrupo] = useState('');

    // Edição de uma linha.
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [edNome, setEdNome] = useState('');
    const [edDominio, setEdDominio] = useState<DominioDeCategoria>('crm');
    const [edPai, setEdPai] = useState<string>('');

    const setor = SETOR[dominio];
    const ehFinanceiro = dominio === 'finance';

    const doDominio = useMemo(
        () => categories.filter(c => c.domain === dominio),
        [categories, dominio]);

    /** Grupos (nível de cima) com as suas categorias dentro, e o que ficou solto. */
    const { grupos, orfas } = useMemo(() => {
        const ids = new Set(doDominio.map(c => c.id));
        const filhasPorPai = new Map<string, GlobalCategory[]>();
        const raiz: GlobalCategory[] = [];
        const orfas: GlobalCategory[] = [];

        for (const c of doDominio) {
            if (!c.parent_id) { raiz.push(c); continue; }
            // Pai apagado ou noutro setor: precisa aparecer, senão some da tela
            // sem ter sido excluída.
            if (!ids.has(c.parent_id)) { orfas.push(c); continue; }
            const lista = filhasPorPai.get(c.parent_id) || [];
            lista.push(c);
            filhasPorPai.set(c.parent_id, lista);
        }

        return {
            grupos: raiz.sort(porNome).map(pai => ({
                pai,
                filhas: (filhasPorPai.get(pai.id) || []).sort(porNome),
            })),
            orfas: orfas.sort(porNome),
        };
    }, [doDominio]);

    /** Grupo sem nada dentro não pode ser escolhido em lugar nenhum — é um beco. */
    const gruposVazios = useMemo(() => grupos.filter(g => g.filhas.length === 0), [grupos]);

    const naoRevisadas = useMemo(
        () => (ehFinanceiro ? doDominio.filter(c => c.parent_id && !c.natureza).length : 0),
        [doDominio, ehFinanceiro]);

    const jaExiste = useMemo(() => {
        const alvo = nome.trim().toLowerCase();
        if (!alvo) return null;
        return doDominio.find(c => (c.name || '').trim().toLowerCase() === alvo) || null;
    }, [nome, doDominio]);

    const gravar = async (id: string, patch: Partial<GlobalCategory>) => {
        const atual = categories.find(c => c.id === id);
        if (!atual) return;
        setOcupado(id);
        setErro(null);
        try {
            await globalCategoryRepository.save({ ...atual, ...patch });
            // Mudar o setor de um grupo leva as filhas junto: deixá-las para trás
            // as tornaria órfãs num setor onde o pai não existe mais.
            if (patch.domain && patch.domain !== atual.domain) {
                for (const f of categories.filter(c => c.parent_id === id)) {
                    await globalCategoryRepository.save({ ...f, domain: patch.domain });
                }
            }
            onChanged();
        } catch (e: any) {
            setErro(e.message || 'Erro ao salvar');
        } finally {
            setOcupado(null);
        }
    };

    const criarCategoria = async () => {
        if (!nome.trim() || !paiEscolhido || jaExiste) return;
        setOcupado('novo');
        setErro(null);
        try {
            await globalCategoryRepository.save({
                name: nome.trim(),
                domain: dominio,
                parent_id: paiEscolhido,
                // Sempre um dos dois lados, nunca nulo: a caixa desmarcada é uma
                // resposta ("é variável"), não ausência de resposta.
                ...(ehFinanceiro ? {
                    natureza: custoFixo ? 'fixo' as const : 'variavel' as const,
                    custo_do_produto: custoDoProduto,
                } : {}),
            });
            setNome('');
            setCustoFixo(false);
            setCustoDoProduto(false);
            onChanged();
        } catch (e: any) {
            setErro(e.message || 'Erro ao criar categoria');
        } finally {
            setOcupado(null);
        }
    };

    const criarGrupo = async () => {
        const n = nomeDoGrupo.trim();
        if (!n) return;
        setOcupado('grupo');
        setErro(null);
        try {
            const novo = await globalCategoryRepository.save({
                name: n, domain: dominio, parent_id: null,
            });
            setNomeDoGrupo('');
            setCriandoGrupo(false);
            // Já deixa o grupo novo escolhido: quem acabou de criá-lo quer pôr
            // alguma coisa dentro.
            setPaiEscolhido(novo.id);
            onChanged();
            setTimeout(() => campoNome.current?.focus(), 50);
        } catch (e: any) {
            setErro(e.message || 'Erro ao criar grupo');
        } finally {
            setOcupado(null);
        }
    };

    const excluir = async (id: string) => {
        setOcupado(id);
        setErro(null);
        try {
            await globalCategoryRepository.delete(id);
            setConfirmandoExclusao(null);
            onChanged();
        } catch (e: any) {
            setErro('Não foi possível excluir: ' + e.message);
        } finally {
            setOcupado(null);
        }
    };

    const abrirEdicao = (c: GlobalCategory) => {
        setEditandoId(c.id);
        setEdNome(c.name || '');
        setEdDominio(c.domain as DominioDeCategoria);
        setEdPai(c.parent_id || '');
        setConfirmandoExclusao(null);
    };

    const salvarEdicao = async (c: GlobalCategory) => {
        const novo = edNome.trim();
        if (!novo) return;
        const ehGrupo = !c.parent_id;
        // Categoria tem que continuar dentro de um grupo; grupo continua no topo.
        if (!ehGrupo && !edPai) { setErro('Escolha o grupo desta categoria.'); return; }
        setEditandoId(null);
        const patch: Partial<GlobalCategory> = {};
        if (novo !== c.name) patch.name = novo;
        if (edDominio !== c.domain) patch.domain = edDominio;
        if (!ehGrupo && edPai !== c.parent_id) patch.parent_id = edPai;
        if (Object.keys(patch).length === 0) return;
        await gravar(c.id, patch);
    };

    const escolherGrupoENomear = (paiId: string) => {
        setPaiEscolhido(paiId);
        setTimeout(() => campoNome.current?.focus(), 50);
    };

    /** As marcas — só em categoria, nunca em grupo: grupo não recebe lançamento,
     *  então classificá-lo não muda conta nenhuma. */
    const MarcaFixo: React.FC<{ c: GlobalCategory }> = ({ c }) => {
        if (!ehFinanceiro || !c.parent_id) return null;
        const fixo = c.natureza === 'fixo';
        const cpv = !!c.custo_do_produto;
        return (
            <>
                <MarcaCompacta
                    marcado={fixo} ocupado={ocupado === c.id} rotulo="Fixo"
                    onToggle={() => gravar(c.id, { natureza: fixo ? 'variavel' : 'fixo' })}
                    titulo={fixo ? 'Custo fixo — clique para tornar variável'
                        : `Marcar como custo fixo (${EXEMPLOS_FIXO})`}
                />
                <MarcaCompacta
                    marcado={cpv} ocupado={ocupado === c.id} rotulo="CPV"
                    onToggle={() => gravar(c.id, { custo_do_produto: !cpv })}
                    titulo={cpv ? 'Entra no custo do produto — clique para tirar'
                        : `Marcar como custo do produto (${EXEMPLOS_CPV})`}
                />
                {!c.natureza && (
                    <span title="Ainda não revisada — está contando como variável"
                        className="text-[9px] font-black uppercase tracking-widest text-amber-500/70">
                        novo
                    </span>
                )}
            </>
        );
    };

    const Acoes: React.FC<{ c: GlobalCategory }> = ({ c }) => (
        <div className="flex items-center gap-1.5 shrink-0">
            <MarcaFixo c={c} />
            <button onClick={() => abrirEdicao(c)} title={c.parent_id ? 'Renomear ou mover' : 'Renomear grupo'} aria-label={c.parent_id ? 'Renomear ou mover' : 'Renomear grupo'}
                className="inline-flex h-8 w-8 items-center justify-center text-zinc-700 hover:text-amber-500 transition-colors rounded hover:bg-amber-500/10">
                <Pencil size={16} />
            </button>
            {confirmandoExclusao === c.id ? (
                <div className="flex items-center gap-1">
                    <button onClick={() => excluir(c.id)} disabled={ocupado === c.id}
                        className={BOTAO_PERIGO}>
                        {ocupado === c.id ? '...' : 'Excluir'}
                    </button>
                    <button onClick={() => setConfirmandoExclusao(null)}
                        className={BOTAO_SECUNDARIO}>
                        Não
                    </button>
                </div>
            ) : (
                <button onClick={() => setConfirmandoExclusao(c.id)}
                    title={c.parent_id ? 'Excluir categoria' : 'Excluir grupo'} aria-label={c.parent_id ? 'Excluir categoria' : 'Excluir grupo'}
                    className="inline-flex h-8 w-8 items-center justify-center text-zinc-700 hover:text-red-500 transition-colors rounded hover:bg-red-500/10">
                    <Trash2 size={16} />
                </button>
            )}
        </div>
    );

    const Edicao: React.FC<{ c: GlobalCategory }> = ({ c }) => {
        const ehGrupo = !c.parent_id;
        const possiveisPais = categories
            .filter(p => p.domain === edDominio && !p.parent_id && p.id !== c.id)
            .sort(porNome);
        return (
            <div className="p-3 space-y-3 bg-zinc-950/80 border border-amber-500/20 rounded-xl">
                <input autoFocus className={InputCls} value={edNome}
                    onChange={e => setEdNome(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') salvarEdicao(c);
                        if (e.key === 'Escape') setEditandoId(null);
                    }} />
                <div className={`grid grid-cols-1 ${ehGrupo ? '' : 'sm:grid-cols-2'} gap-2`}>
                    <div>
                        <label className={`${ROTULO_PEQUENO} block mb-1.5 ml-1`}>Setor</label>
                        <SearchableSelect
                            options={DOMINIOS.map(d => ({ value: d, label: SETOR[d].curto }))}
                            value={edDominio}
                            onChange={val => { setEdDominio((val || 'crm') as DominioDeCategoria); setEdPai(''); }}
                        />
                    </div>
                    {!ehGrupo && (
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1.5 ml-1`}>Grupo</label>
                            <SearchableSelect
                                options={possiveisPais.map(p => ({ value: p.id, label: (p.name || '').toUpperCase() }))}
                                value={edPai}
                                onChange={val => setEdPai(val || '')}
                                placeholder="ESCOLHER GRUPO..."
                            />
                        </div>
                    )}
                </div>
                {ehGrupo && (
                    <p className="text-[10px] text-zinc-600 font-bold leading-relaxed ml-1">
                        Grupo fica sempre no topo — ele organiza a lista e não é escolhido em lançamento.
                    </p>
                )}
                <div className="flex gap-2">
                    <button onClick={() => salvarEdicao(c)} disabled={!edNome.trim() || (!ehGrupo && !edPai)}
                        className={`${BOTAO_PRINCIPAL} flex-1`}>
                        <Check size={13} strokeWidth={3} /> Salvar
                    </button>
                    <button onClick={() => setEditandoId(null)} aria-label="Cancelar"
                        className={`${BOTAO_SECUNDARIO} w-10 px-0`}>
                        <X size={18} />
                    </button>
                </div>
            </div>
        );
    };

    const NomeDaLinha: React.FC<{ c: GlobalCategory; forte?: boolean }> = ({ c, forte }) => (
        <button onClick={() => abrirEdicao(c)} title="Editar"
            className="flex items-center gap-2 min-w-0 flex-1 text-left group">
            <span className={`truncate ${forte
                ? 'text-xs font-black text-white uppercase tracking-wider'
                : 'text-xs font-bold text-zinc-300'}`}>
                {c.name}
            </span>
            <Pencil size={12} className="text-zinc-800 group-hover:text-amber-500 shrink-0 transition-colors" />
        </button>
    );

    return (
        <div className="space-y-6">

            {/* ── Setor ─────────────────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2">
                {DOMINIOS.map(d => {
                    const s = SETOR[d];
                    const ativo = dominio === d;
                    const quantas = categories.filter(c => c.domain === d && c.parent_id).length;
                    return (
                        <button key={d}
                            onClick={() => {
                                setDominio(d); setNome(''); setErro(null);
                                setEditandoId(null); setPaiEscolhido(''); setCriandoGrupo(false);
                            }}
                            className={pilula(ativo)}>
                            <s.Icone size={14} />
                            {s.curto}
                            <span className={`font-mono ${ativo ? 'text-amber-400/70' : 'text-zinc-600'}`}>{quantas}</span>
                        </button>
                    );
                })}
            </div>

            <div className={`${CARTAO} p-5`}>
                <div className="flex items-start gap-3 mb-5">
                    <div className="p-2 bg-zinc-950/60 rounded-lg border border-zinc-800 shrink-0">
                        <setor.Icone className="text-amber-500" size={16} />
                    </div>
                    <div className="min-w-0">
                        <h3 className={ROTULO}>{setor.titulo}</h3>
                        <p className="text-[10px] text-zinc-500 font-bold mt-0.5">{setor.oQue}</p>
                        <p className="text-[10px] text-zinc-600 font-bold mt-1.5 leading-relaxed">{setor.paraQue}</p>
                    </div>
                </div>

                {/* ── Criar ─────────────────────────────────────────────────── */}
                <div className={`${ITEM} p-4 space-y-3`}>

                    {grupos.length === 0 && !criandoGrupo ? (
                        <div className="text-center py-2">
                            <p className="text-[11px] font-bold text-zinc-400 mb-1">Nenhum grupo neste setor ainda.</p>
                            <p className="text-[10px] text-zinc-600 font-bold leading-relaxed mb-3">
                                Toda categoria mora dentro de um grupo — comece criando o grupo.
                            </p>
                            <button onClick={() => setCriandoGrupo(true)}
                                className={BOTAO_PRINCIPAL}>
                                <FolderPlus size={14} /> Criar primeiro grupo
                            </button>
                        </div>
                    ) : criandoGrupo ? (
                        <div>
                            <label className={RotuloCls}>Novo grupo</label>
                            <div className="flex gap-2">
                                <input autoFocus className={InputCls} value={nomeDoGrupo}
                                    placeholder="Ex: Despesas mensais"
                                    onChange={e => setNomeDoGrupo(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') criarGrupo();
                                        if (e.key === 'Escape') { setCriandoGrupo(false); setNomeDoGrupo(''); }
                                    }} />
                                <button onClick={criarGrupo} disabled={!nomeDoGrupo.trim() || ocupado === 'grupo'}
                                    className={`${BOTAO_PRINCIPAL} shrink-0`}>
                                    {ocupado === 'grupo' ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={16} />}
                                    Criar
                                </button>
                                <button onClick={() => { setCriandoGrupo(false); setNomeDoGrupo(''); }} aria-label="Cancelar"
                                    className={`${BOTAO_SECUNDARIO} w-10 px-0 shrink-0`}>
                                    <X size={18} />
                                </button>
                            </div>
                            <p className="text-[10px] text-zinc-600 font-bold mt-2 ml-1 leading-relaxed">
                                Grupo é só hierarquia: aparece como título na lista e não pode ser escolhido
                                num cadastro ou lançamento.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div>
                                <div className="flex items-center justify-between mb-2 ml-1">
                                    <label className={ROTULO_PEQUENO}>
                                        Dentro do grupo
                                    </label>
                                    <button onClick={() => setCriandoGrupo(true)}
                                        className="text-[8px] font-black text-amber-500 hover:text-amber-400 uppercase flex items-center gap-1 transition-colors">
                                        <FolderPlus size={14} /> Novo grupo
                                    </button>
                                </div>
                                <SearchableSelect
                                    options={grupos.map(g => ({ value: g.pai.id, label: (g.pai.name || '').toUpperCase() }))}
                                    value={paiEscolhido}
                                    onChange={val => setPaiEscolhido(val || '')}
                                    placeholder="ESCOLHER GRUPO..."
                                />
                            </div>

                            <div>
                                <label className={RotuloCls}>Nova categoria</label>
                                <div className="flex gap-2">
                                    <input ref={campoNome} className={InputCls} value={nome} placeholder={setor.placeholder}
                                        onChange={e => setNome(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && criarCategoria()} />
                                    <button onClick={criarCategoria}
                                        disabled={!nome.trim() || !paiEscolhido || !!jaExiste || ocupado === 'novo'}
                                        className={`${BOTAO_PRINCIPAL} shrink-0`}>
                                        {ocupado === 'novo' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
                                        Criar
                                    </button>
                                </div>

                                {jaExiste ? (
                                    <p className="text-[10px] font-bold text-amber-500 mt-2 ml-1 leading-relaxed">
                                        <AlertTriangle size={12} className="inline mb-0.5 mr-1" />
                                        “{jaExiste.name}” já existe neste setor. Duas com o mesmo nome repartem
                                        o mesmo valor em duas linhas do relatório.
                                    </p>
                                ) : !paiEscolhido ? (
                                    <p className="text-[10px] text-zinc-600 font-bold mt-2 ml-1">
                                        Escolha o grupo acima — categoria não existe solta.
                                    </p>
                                ) : (
                                    <div className="mt-2.5">
                                        <LinhaDeChips
                                            itens={setor.exemplos
                                                .filter(ex => !doDominio.some(c => (c.name || '').toLowerCase() === ex.toLowerCase()))
                                                .map(ex => ({ chave: ex, rotulo: ex }))}
                                            onEscolher={setNome}
                                        />
                                    </div>
                                )}
                            </div>

                            {ehFinanceiro && (
                                <MarcasDaCategoria
                                    custoFixo={custoFixo} onCustoFixo={() => setCustoFixo(v => !v)}
                                    custoDoProduto={custoDoProduto} onCustoDoProduto={() => setCustoDoProduto(v => !v)}
                                />
                            )}
                        </>
                    )}
                </div>

                {erro && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 mt-4">
                        <AlertTriangle size={14} /> {erro}
                    </div>
                )}

                {(gruposVazios.length > 0 || orfas.length > 0) && (
                    <div className="mt-4 bg-amber-500/[0.06] border border-amber-500/30 rounded-xl p-3">
                        <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">
                            <AlertTriangle size={12} className="inline mb-0.5 mr-1" />
                            {gruposVazios.length + orfas.length} para arrumar
                        </p>
                        <p className="text-[10px] text-zinc-400 font-bold leading-relaxed">
                            {gruposVazios.length > 0 && <>Grupo vazio não aparece em lugar nenhum — ponha uma categoria dentro ou apague. </>}
                            {orfas.length > 0 && <>Categoria sem grupo válido também não: abra e escolha um grupo.</>}
                        </p>
                    </div>
                )}

                {/* ── Árvore ────────────────────────────────────────────────── */}
                <div className="flex items-baseline justify-between gap-3 mt-6 mb-3">
                    <h4 className={ROTULO}>
                        {grupos.length} grupo{grupos.length === 1 ? '' : 's'} ·{' '}
                        {doDominio.filter(c => c.parent_id).length} categoria{doDominio.filter(c => c.parent_id).length === 1 ? '' : 's'}
                    </h4>
                    {naoRevisadas > 0 && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">
                            {naoRevisadas} nunca revisada{naoRevisadas > 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                <div className="space-y-2">
                    {doDominio.length === 0 && (
                        <p className="text-[10px] text-zinc-600 font-bold">Nada ainda — crie o primeiro grupo acima.</p>
                    )}

                    {grupos.map(({ pai, filhas }) => (
                        <div key={pai.id}
                            className={`rounded-xl border overflow-hidden ${filhas.length === 0
                                ? 'border-amber-500/25 bg-amber-500/[0.02]'
                                : 'border-zinc-700/70 bg-zinc-950/40'}`}>

                            {editandoId === pai.id ? (
                                <div className="p-2"><Edicao c={pai} /></div>
                            ) : (
                                <div className="flex items-center justify-between gap-3 px-3 py-2.5 flex-wrap bg-zinc-900/50 border-b border-zinc-800">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <FolderTree size={13} className="text-amber-500/70 shrink-0" />
                                        <NomeDaLinha c={pai} forte />
                                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600 shrink-0">
                                            {filhas.length > 0
                                                ? `${filhas.length} dentro`
                                                : <span className="text-amber-500/80">vazio</span>}
                                        </span>
                                    </div>
                                    <Acoes c={pai} />
                                </div>
                            )}

                            {filhas.length > 0 ? (
                                <div className="pl-4 pr-2 py-2 space-y-1">
                                    {filhas.map(f => (
                                        <div key={f.id} className="border-l-2 border-zinc-800 pl-3">
                                            {editandoId === f.id ? <Edicao c={f} /> : (
                                                <div className="flex items-center justify-between gap-3 px-2 py-1.5 flex-wrap rounded-lg hover:bg-zinc-900/40 transition-colors">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <CornerDownRight size={12} className="text-zinc-700 shrink-0" />
                                                        <NomeDaLinha c={f} />
                                                    </div>
                                                    <Acoes c={f} />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : editandoId !== pai.id && (
                                <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                                    <p className="text-[10px] text-zinc-500 font-bold leading-relaxed min-w-0">
                                        Sem categoria dentro, este grupo não aparece em nenhum cadastro.
                                    </p>
                                    <button onClick={() => escolherGrupoENomear(pai.id)}
                                        className={`${BOTAO_SUAVE} shrink-0`}>
                                        Criar categoria aqui
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}

                    {orfas.length > 0 && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-500/5 border-b border-amber-500/20 flex-wrap">
                                <Unlink size={13} className="text-amber-500 shrink-0" />
                                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">
                                    Sem grupo válido
                                </span>
                                <span className="text-[9px] font-bold text-zinc-500">
                                    o grupo delas foi apagado ou está noutro setor — abra e escolha um
                                </span>
                            </div>
                            <div className="p-2 space-y-1">
                                {orfas.map(o => (
                                    editandoId === o.id ? <Edicao key={o.id} c={o} /> : (
                                        <div key={o.id} className="flex items-center justify-between gap-3 px-2 py-1.5 flex-wrap rounded-lg hover:bg-zinc-900/40 transition-colors">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <NomeDaLinha c={o} />
                                            </div>
                                            <Acoes c={o} />
                                        </div>
                                    )
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {ehFinanceiro && doDominio.length > 0 && (
                    <p className="text-[10px] text-zinc-600 font-bold mt-4 leading-relaxed">
                        <Lock size={12} className="inline mb-0.5 mr-1" />
                        Sem a marca, a categoria conta como <b className="text-zinc-500">variável</b>. O grupo não
                        recebe lançamento, então não tem marca.
                    </p>
                )}
            </div>
        </div>
    );
};

export default CategoriasTab;
