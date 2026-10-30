import React, { useState } from 'react';
import { useInsumos, useInsumosPaginated, useInventoryMutations } from '@/hooks/useInventoryQueries';
import { MesclarInsumo } from '@/components/inventory/MesclarInsumo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { storageService } from '@/services/storage';
import { CompanyProfile, Insumo } from '@/types';
import { ITENS_POR_PAGINA } from '@/utils/constants';
import {
    Plus, Check, X, Package, Link2, Search,
    ChevronRight, ChevronDown, StickyNote, Brush, Boxes, Layers, Shirt, PaintBucket, Printer, Scissors
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { DefinirPrecoModal } from '@/components/modals/DefinirPrecoModal';
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal';
import { Pagination } from '@/components/common/Pagination';
import SearchableSelect from '@/components/common/SearchableSelect';
import { idService } from '@/services/idService';
import PersonalizacaoTab from '@/components/inventory/PersonalizacaoTab';
import InsumoDetalhe from '@/components/inventory/InsumoDetalhe';
import { TecidosPorFornecedor } from '@/components/tabelaVerdade/TecidosPorFornecedor';
import { PlanilhaDeProdutos } from '@/components/tabelas/PlanilhaDeProdutos';
import { CustoSilk, CustoDtf, CustoBordado } from '@/components/tabelas/CustosDePersonalizacao';
import { SEM_CATEGORIA } from '@/repositories/inventoryRepository';
import { MenuMais } from '@/components/common/MenuMais';
import { CARTAO, CAMPO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SUAVE, BOTAO_SECUNDARIO, pilula } from '@/components/finance/ui/estilo';
import { semCamposDoEstoque } from '@/utils/fabrica/semCamposDoEstoque';
import { insumosSemPreco } from '@/utils/fabrica/insumosSemPreco';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { useCustoDeReferencia } from '@/hooks/useTabelaVerdade';
import { useLembrado } from '@/hooks/useLembrado';
import { useAtalho } from '@/hooks/useAtalho';

/**
 * Tabelas de custo (estoque zero, 30/10). Substitui o Estoque em "Planejar a semana".
 *
 * A fábrica trabalha sem estoque: todo pedido compra tudo o que a ficha pede, e a sobra da compra
 * fica gravada só como registro — não aparece como saldo e nunca abate um pedido. O que sobra do
 * antigo Estoque é o que alimenta o custo: o preço de referência de cada tecido (na tabela do
 * fornecedor), de cada insumo, e a tabela de personalização.
 */
type Aba = 'tecidos' | 'produtos' | 'insumos' | 'silk' | 'dtf' | 'bordado' | 'personalizacao';

const ABAS: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'tecidos', label: 'Tecidos', icon: Layers },
    { id: 'produtos', label: 'Produtos', icon: Shirt },
    { id: 'insumos', label: 'Insumos', icon: Boxes },
    { id: 'silk', label: 'Silk', icon: PaintBucket },
    { id: 'dtf', label: 'DTF', icon: Printer },
    { id: 'bordado', label: 'Bordado', icon: Scissors },
    { id: 'personalizacao', label: 'Personalização', icon: Brush },
];

const emptyInsumo = (): Partial<Insumo> => ({
    name: '',
    unit: 'un',
    min_stock: 0,
    current_stock: 0,
    average_unit_cost: 0,
    category: '',
    supplier_id: undefined,
    notes: '',
});

interface Props {
    /**
     * Busca vinda de outra tela (a completude do cadastro manda o nome do insumo; o Início manda
     * "tecido"). Chega como termo e não como id porque a lista é paginada no servidor: o nome traz
     * a linha para a primeira página.
     */
    initialSearch?: string;
    clearSearch?: () => void;
    /** Entra no recorte "Sem preço" (a linha do Início). Limpo na origem, como a busca. */
    semPrecoInicial?: boolean;
    limparSemPreco?: () => void;
    /** Abre a página do fornecedor (tabela de preços, v3.1): é lá que tecido nasce e muda. */
    onAbrirFornecedor?: (fornecedorId: string) => void;
    /** Abre o cadastro do produto (aviamentos da ficha, calculadora, fotos). */
    onAbrirProduto?: (produtoId: string) => void;
    /** Alíquota e custo/hora da casa, para o custo da peça na planilha de produtos. */
    companyProfile?: CompanyProfile | null;
}

const TabelasDeCusto: React.FC<Props> = ({ initialSearch, clearSearch, semPrecoInicial, limparSemPreco, onAbrirFornecedor, onAbrirProduto, companyProfile }) => {
    const [aba, setAba] = useLembrado<Aba>('tabelas.aba', 'tecidos');
    const { mostrar } = useMostrarValor();
    const referencia = useCustoDeReferencia();

    // Desde a v3.1 o tecido nasce na tabela de preços do fornecedor: escolher o fornecedor leva lá.
    const [escolhendoFornecedor, setEscolhendoFornecedor] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoriaFiltro, setCategoriaFiltro] = useLembrado('tabelas.categoria', '');
    const [expandido, setExpandido] = useState<string | null>(null);
    const [soSemPreco, setSoSemPreco] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = ITENS_POR_PAGINA;

    const { data: paginatedData, isLoading: isPaginatedLoading } = useInsumosPaginated(currentPage, itemsPerPage, searchTerm, categoriaFiltro);
    const totalItems = paginatedData?.count || 0;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    const { data: allItems = [], isLoading: isAllItemsLoading } = useInsumos();
    const isLoading = isPaginatedLoading || isAllItemsLoading;
    // "Sem preço" olha o cadastro inteiro e mostra todos de uma vez (é a lista do que falta, e o
    // Início manda para cá); desligado, volta à lista paginada no servidor.
    const semPreco = React.useMemo(
        () => insumosSemPreco(allItems as Insumo[], referencia, searchTerm, categoriaFiltro, SEM_CATEGORIA),
        [allItems, referencia, searchTerm, categoriaFiltro]);
    const lista: Insumo[] = soSemPreco ? semPreco : paginatedData?.data || [];

    const { saveInsumoMutation, deleteInsumoMutation } = useInventoryMutations();
    const { showToast } = useToast();

    const { data: suppliers = [] } = useQuery({
        queryKey: ['suppliers'],
        queryFn: () => storageService.getSuppliers(),
        staleTime: 1000 * 60 * 5,
    });

    const { data: unitLookups = [] } = useQuery({
        queryKey: ['lookup_values', 'unit'],
        queryFn: () => storageService.getLookupValues('unit'),
        staleTime: Infinity,
    });

    const { data: categoryLookups = [] } = useQuery({
        queryKey: ['lookup_values', 'insumo_category'],
        queryFn: () => storageService.getLookupValues('insumo_category'),
        staleTime: 1000 * 60 * 10,
    });

    const FALLBACK_UNITS = ['un', 'kg', 'g', 'm', 'm2', 'l', 'ml', 'cx', 'pc', 'rolo'];
    const units: string[] = unitLookups.length > 0
        ? [...new Set(unitLookups.map((l: { value: string }) => l.value))]
        : FALLBACK_UNITS;

    const insumoCategories: string[] = categoryLookups.length > 0
        ? [...new Set(categoryLookups.map((l: { value: string }) => l.value))]
        : ['Tecidos', 'Acessórios', 'Embalagens', 'Linhas', 'Botões', 'Outros'];

    const [definindoPreco, setDefinindoPreco] = useState<Insumo | null>(null);
    const queryClient = useQueryClient();
    const [itemToDelete, setItemToDelete] = useState<Insumo | null>(null);

    const [editingId, setEditingId] = useState<string | 'new' | null>(null);
    const [form, setForm] = useState<Partial<Insumo>>(emptyInsumo());
    const [isSaving, setIsSaving] = useState(false);

    React.useEffect(() => { setCurrentPage(1); }, [searchTerm, categoriaFiltro]);

    // Deep-link: quem chegou aqui com um insumo em mente já entra com ele na busca. Limpa na
    // origem para não repetir a busca ao voltar depois; a categoria lembrada sai para não esconder o alvo.
    React.useEffect(() => {
        if (!initialSearch) return;
        setAba('insumos');
        setCategoriaFiltro('');
        setSearchTerm(initialSearch);
        setSoSemPreco(!!semPrecoInicial);
        clearSearch?.();
        limparSemPreco?.();
    }, [initialSearch]);

    // Quais categorias estão em uso, com quantos itens cada uma — é o que interessa para filtrar.
    const contagemPorCategoria = React.useMemo(() => {
        const m = new Map<string, number>();
        for (const i of allItems as Insumo[]) {
            const c = (i.category || '').trim() || SEM_CATEGORIA;
            m.set(c, (m.get(c) || 0) + 1);
        }
        return [...m.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([valor, qtd]) => ({ valor, qtd, rotulo: valor === SEM_CATEGORIA ? 'Sem categoria' : valor }));
    }, [allItems]);

    const startNew = () => { setForm(emptyInsumo()); setEditingId('new'); };
    const startEdit = (item: Insumo) => { setForm({ ...item }); setEditingId(item.id); };
    const cancelEdit = () => { setEditingId(null); setForm(emptyInsumo()); };

    const handleSave = async () => {
        if (!form.name?.trim()) { showToast('Nome do insumo é obrigatório.', 'error'); return; }
        setIsSaving(true);
        try {
            // Editar não escreve saldo nem custo médio: o formulário guarda o valor de quando abriu.
            await saveInsumoMutation.mutateAsync({
                ...(editingId === 'new' ? form : semCamposDoEstoque(form)),
                id: editingId === 'new' ? idService.generateUUID() : editingId!,
            });
            showToast(editingId === 'new' ? 'Insumo criado!' : 'Insumo atualizado!', 'success');
            cancelEdit();
        } catch (e: any) {
            showToast(e.message || 'Erro ao salvar', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!itemToDelete) return;
        try {
            await deleteInsumoMutation.mutateAsync(itemToDelete.id);
            showToast('Insumo removido.', 'success');
            setItemToDelete(null);
        } catch (e: any) {
            showToast(e.message || 'Erro ao excluir', 'error');
        }
    };

    const inputCls = `${CAMPO} w-full`;

    // N abre um insumo novo (auditoria N2). Antes do retorno de carregando: hook nunca depois de um return.
    useAtalho({ novo: () => { if (aba === 'insumos' && editingId === null) startNew(); } });

    const novoTecido = onAbrirFornecedor && (escolhendoFornecedor ? (
        <div className="w-64 max-w-full">
            <SearchableSelect value="" placeholder="DE QUAL FORNECEDOR?"
                onChange={(id) => { setEscolhendoFornecedor(false); if (id) onAbrirFornecedor(id); }}
                options={[{ value: '', label: 'DE QUAL FORNECEDOR?' }, ...suppliers.map(s => ({ value: s.id, label: s.company_name }))]} />
        </div>
    ) : (
        <button onClick={() => setEscolhendoFornecedor(true)} title="O tecido nasce na tabela de preços do fornecedor" className={BOTAO_SUAVE}>
            <Layers size={14} /> Novo tecido no fornecedor…
        </button>
    ));

    /**
     * O preço que o custo do pedido usa, na mesma ordem do lucro por pedido: a referência da tabela do
     * fornecedor (tecido com faixa) vem antes do custo médio — mostrar o médio aqui daria dois preços
     * para o mesmo tecido, um em cada aba.
     */
    const doFornecedor = (item: Insumo) => referencia.get(item.id) ?? null;
    const preco = (item: Insumo) => {
        const ref = doFornecedor(item);
        const v = ref ?? (Number(item.average_unit_cost) > 0 ? Number(item.average_unit_cost) : null);
        if (v === null) return <span className="text-[11px] font-bold text-rose-400" title={item.faixa_id ? 'Defina na tabela do fornecedor (aba Tecidos)' : undefined}>sem preço</span>;
        return (
            <span className="font-mono text-zinc-200" title={ref !== null ? 'Da tabela do fornecedor: condição padrão + frete' : 'Custo médio das compras, ou o definido à mão'}>
                {mostrar(v)}<span className="text-zinc-500">/{item.unit}</span>
                {ref !== null && <span className="block text-[10px] font-sans font-bold uppercase tracking-widest text-zinc-500">tabela</span>}
            </span>
        );
    };

    return (
        <div className="space-y-4 w-full">
            <div className="flex flex-wrap items-center gap-1">
                {ABAS.map(a => (
                    <button key={a.id} onClick={() => setAba(a.id)} className={pilula(aba === a.id)}>
                        <a.icon size={14} strokeWidth={aba === a.id ? 2.5 : 2} /> {a.label}
                    </button>
                ))}
            </div>

            {aba === 'personalizacao' && <PersonalizacaoTab />}

            {aba === 'produtos' && <PlanilhaDeProdutos companyProfile={companyProfile} onAbrirProduto={onAbrirProduto} />}
            {aba === 'silk' && <CustoSilk />}
            {aba === 'dtf' && <CustoDtf />}
            {aba === 'bordado' && <CustoBordado />}

            {aba === 'tecidos' && (<>
                <div className={`${CARTAO} flex flex-wrap justify-between items-center gap-3 p-4`}>
                    <div className="min-w-0">
                        <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <Layers className="text-amber-500" size={20} /> Tecidos e preço de referência
                        </h2>
                        <p className={`${ROTULO_PEQUENO} mt-1`}>Preço na condição padrão, com frete. Muda na tabela do fornecedor.</p>
                    </div>
                    {novoTecido}
                </div>
                <TecidosPorFornecedor fornecedores={suppliers} onAbrirFornecedor={onAbrirFornecedor} />
            </>)}

            {aba === 'insumos' && (isLoading ? (
                <div className="p-12 flex justify-center"><div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (<>
            <div className={`${CARTAO} flex flex-wrap justify-between items-center gap-3 p-4`}>
                <div className="min-w-0">
                    <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <Package className="text-amber-500" size={20} /> Insumos e preço de referência
                    </h2>
                    <p className={`${ROTULO_PEQUENO} mt-1`}>Linha, botão, etiqueta, embalagem… O preço entra no custo de cada pedido.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Buscar insumo..."
                            aria-label="Buscar insumo"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`${CAMPO} pl-10 w-64 max-w-full`}
                        />
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                    </div>
                    {editingId === null && (
                        <button onClick={startNew} className={BOTAO_PRINCIPAL}>
                            <Plus size={14} /> Novo Insumo
                        </button>
                    )}
                </div>
            </div>

            {(contagemPorCategoria.length > 1 || semPreco.length > 0 || soSemPreco) && (
                <div className="flex flex-wrap items-center gap-1">
                    <button type="button" onClick={() => setSoSemPreco(v => !v)} aria-pressed={soSemPreco}
                        disabled={semPreco.length === 0 && !soSemPreco}
                        title={soSemPreco ? 'Voltar à lista completa' : 'Só os que entram no custo com valor zero'}
                        className={`${pilula(soSemPreco)} ${!soSemPreco && semPreco.length > 0 ? 'text-rose-400!' : ''}`}>
                        Sem preço <span className="opacity-60">{semPreco.length}</span>{soSemPreco && <X size={14} />}
                    </button>
                    {contagemPorCategoria.length > 1 && <span className="w-px h-6 bg-zinc-800 mx-1" aria-hidden />}
                    {contagemPorCategoria.length > 1 && (
                        <button onClick={() => setCategoriaFiltro('')} className={pilula(categoriaFiltro === '')}>
                            Todos <span className="opacity-60">{allItems.length}</span>
                        </button>
                    )}
                    {contagemPorCategoria.length > 1 && contagemPorCategoria.map(c => (
                        <button
                            key={c.valor}
                            onClick={() => setCategoriaFiltro(categoriaFiltro === c.valor ? '' : c.valor)}
                            title={c.valor === SEM_CATEGORIA ? 'Itens que ainda não foram classificados' : undefined}
                            className={`${pilula(categoriaFiltro === c.valor)} ${c.valor === SEM_CATEGORIA && categoriaFiltro !== c.valor ? 'text-rose-400!' : ''}`}
                        >
                            {c.rotulo} <span className="opacity-60">{c.qtd}</span>
                        </button>
                    ))}
                </div>
            )}

            {editingId === 'new' && (
                <div className={`${CARTAO} border-amber-500/20! p-4 space-y-4`}>
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                        <Plus size={16} className="text-amber-500" /> Cadastro Rápido de Insumo
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                        <div className="sm:col-span-2">
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Nome*</label>
                            <input className={inputCls} placeholder="Ex: Linha 120 preta" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Unidade*</label>
                            <SearchableSelect
                                options={units.map(u => ({ value: u, label: u }))}
                                value={form.unit || 'un'}
                                onChange={val => setForm(f => ({ ...f, unit: val }))}
                                placeholder="Un."
                            />
                        </div>
                        {form.unit === 'kg' && (
                            <div>
                                <label className={`${ROTULO_PEQUENO} block mb-1`}>Rendimento (m/kg)</label>
                                <input
                                    type="number" step="0.01" min="0.01" className={inputCls} placeholder="1.00"
                                    value={form.rendimento ?? ''}
                                    onChange={e => setForm(f => ({ ...f, rendimento: parseFloat(e.target.value) || 1 }))}
                                    title="Quantos metros existem em 1 kg"
                                />
                                <p className="text-[10px] text-zinc-600 mt-0.5">m lineares por kg</p>
                            </div>
                        )}
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Categoria</label>
                            <SearchableSelect
                                options={insumoCategories.map(c => ({ value: c, label: c }))}
                                value={form.category || ''}
                                onChange={val => setForm(f => ({ ...f, category: val }))}
                                placeholder="Ex: Linhas"
                            />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Fornecedor Padrão</label>
                            <SearchableSelect
                                options={suppliers.map(s => ({ value: s.id, label: s.company_name }))}
                                value={form.supplier_id || ''}
                                onChange={val => setForm(f => ({ ...f, supplier_id: val || undefined }))}
                                placeholder="— Nenhum —"
                            />
                        </div>
                    </div>
                    <div>
                        <label className={`${ROTULO_PEQUENO} block mb-1`}>Observações</label>
                        <input className={inputCls} placeholder="Observações opcionais..." value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                    <p className="text-[11px] text-zinc-500">O preço se define depois de salvar, em “Definir preço”, ou vem sozinho da primeira compra lançada.</p>

                    <MesclarInsumo
                        data={form}
                        onChange={(patch) => setForm(f => ({ ...f, ...patch }))}
                        insumos={allItems}
                    />
                    <div className="flex gap-3 justify-end pt-4 border-t border-zinc-800/50">
                        <button onClick={cancelEdit} className={BOTAO_SECUNDARIO}><X size={14} /> Cancelar</button>
                        <button onClick={handleSave} disabled={isSaving} className={BOTAO_PRINCIPAL}>
                            {isSaving ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Check size={14} />} Salvar Insumo
                        </button>
                    </div>
                </div>
            )}

            <div className={`${CARTAO} overflow-hidden`}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className={`border-b border-zinc-800 bg-zinc-950/50 ${ROTULO_PEQUENO}`}>
                                <th className="p-4">Insumo</th>
                                <th className="p-4">Categoria</th>
                                <th className="p-4">Fornecedor</th>
                                <th className="p-4 text-center">Un.</th>
                                <th className="p-4 text-right">Preço de referência</th>
                                <th className="p-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {lista.length === 0 && editingId !== 'new' ? (
                                <tr>
                                    <td colSpan={6} className="p-16 text-center">
                                        <Package size={40} className="mx-auto text-zinc-700 mb-4" />
                                        <p className="text-zinc-400 font-medium mb-1">
                                            {soSemPreco ? 'Todos têm preço.' : searchTerm ? 'Nenhum insumo encontrado para sua busca.' : 'Nenhum insumo cadastrado.'}
                                        </p>
                                        {!searchTerm && <p className="text-zinc-600 text-xs">Cadastre linha, botão, etiqueta e embalagem para o custo do pedido sair completo.</p>}
                                    </td>
                                </tr>
                            ) : (
                                lista.map(item => (
                                    editingId === item.id ? (
                                        <React.Fragment key={item.id}>
                                            <tr className="bg-zinc-800/40">
                                                <td className="p-2"><input className={inputCls} aria-label="Nome do insumo" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome*" /></td>
                                                <td className="p-2">
                                                    <SearchableSelect
                                                        options={insumoCategories.map(c => ({ value: c, label: c }))}
                                                        value={form.category || ''}
                                                        onChange={val => setForm(f => ({ ...f, category: val }))}
                                                        placeholder="Cat."
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <SearchableSelect
                                                        options={suppliers.map(s => ({ value: s.id, label: s.company_name }))}
                                                        value={form.supplier_id || ''}
                                                        onChange={val => setForm(f => ({ ...f, supplier_id: val || undefined }))}
                                                        placeholder="—"
                                                    />
                                                </td>
                                                <td className="p-2">
                                                    <SearchableSelect
                                                        options={units.map(u => ({ value: u, label: u }))}
                                                        value={form.unit || 'un'}
                                                        onChange={val => setForm(f => ({ ...f, unit: val }))}
                                                        placeholder="Un."
                                                    />
                                                </td>
                                                <td className="p-2 text-right text-sm">{preco(item)}</td>
                                                <td className="p-2">
                                                    <div className="flex justify-end gap-1">
                                                        <button onClick={handleSave} disabled={isSaving} aria-label="Salvar" title="Salvar" className={`${BOTAO_PRINCIPAL} w-10 px-0`}><Check size={18} /></button>
                                                        <button onClick={cancelEdit} aria-label="Cancelar" title="Cancelar" className={`${BOTAO_SECUNDARIO} w-10 px-0`}><X size={18} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {form.unit === 'kg' && (
                                                <tr className="bg-zinc-800/20">
                                                    <td colSpan={6} className="px-4 py-2 border-t border-zinc-700/50">
                                                        <div className="flex items-center gap-3">
                                                            <label className="text-[10px] text-amber-500 font-black uppercase tracking-widest">Rendimento (m/kg)</label>
                                                            <input type="number" step="0.01" min="0.01" className={`${CAMPO} w-24 font-mono`} value={form.rendimento ?? ''} onChange={e => setForm(f => ({ ...f, rendimento: parseFloat(e.target.value) || 1 }))} />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ) : (
                                        <React.Fragment key={item.id}>
                                        <tr
                                            className="hover:bg-zinc-800/20 transition-colors group cursor-pointer"
                                            onClick={() => setExpandido(e => e === item.id ? null : item.id)}
                                            title="Clique para ver observações e histórico de preço"
                                        >
                                            <td className="p-4">
                                                <div className="flex items-start gap-2">
                                                    <span className="text-zinc-600 group-hover:text-amber-500 transition-colors mt-0.5 shrink-0">
                                                        {expandido === item.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                    </span>
                                                    <p className="font-black text-white group-hover:text-amber-500 transition-colors uppercase tracking-wide text-xs flex items-center gap-2 min-w-0">
                                                        {item.name}
                                                        {item.notes && <StickyNote size={12} className="text-amber-500/60 shrink-0" />}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm">
                                                {item.category
                                                    ? <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-300 bg-zinc-800/60 border border-zinc-700/50 px-2.5 py-1 rounded-full whitespace-nowrap">{item.category}</span>
                                                    : <span className="text-[10px] uppercase font-bold tracking-wider text-rose-400/70 bg-rose-950/20 border border-rose-900/40 px-2.5 py-1 rounded-full whitespace-nowrap">sem categoria</span>
                                                }
                                            </td>
                                            <td className="p-4 text-zinc-400 text-sm" onClick={e => item.supplier_id && onAbrirFornecedor && e.stopPropagation()}>
                                                {item.supplier_name
                                                    ? (item.supplier_id && onAbrirFornecedor
                                                        ? <button type="button" onClick={() => onAbrirFornecedor(item.supplier_id!)} title="Abrir a página do fornecedor"
                                                            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs min-h-11">
                                                            <Link2 size={12} /> {item.supplier_name}
                                                        </button>
                                                        : <span className="text-xs">{item.supplier_name}</span>)
                                                    : <span className="text-zinc-600">—</span>
                                                }
                                            </td>
                                            <td className="p-4 text-center text-zinc-400 text-sm">{item.unit}</td>
                                            <td className="p-4 text-right text-sm">{preco(item)}</td>
                                            {/* A linha inteira abre o detalhe; o menu precisa deter o clique. */}
                                            <td className="p-4" onClick={e => e.stopPropagation()}>
                                                <div className="flex justify-end gap-2">
                                                    <MenuMais rotulo={`Mais ações de ${item.name}`} itens={[
                                                        // Com sobra registrada, o preço é o custo médio das compras e não se digita;
                                                        // com preço na tabela do fornecedor, é lá que ele muda.
                                                        ...(Number(item.current_stock) === 0 && doFornecedor(item) === null ? [{ rotulo: 'Definir preço', onClick: () => setDefinindoPreco(item) }] : []),
                                                        { rotulo: 'Editar', onClick: () => startEdit(item) },
                                                        { rotulo: 'Excluir', onClick: () => setItemToDelete(item), perigo: true },
                                                    ]} />
                                                </div>
                                            </td>
                                        </tr>
                                        {expandido === item.id && (
                                            <tr>
                                                <td colSpan={6} className="p-0">
                                                    <InsumoDetalhe insumo={item} />
                                                </td>
                                            </tr>
                                        )}
                                        </React.Fragment>
                                    )
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {!soSemPreco && totalPages > 1 && (
                <div className="mt-4">
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setCurrentPage}
                    />
                </div>
            )}

            {definindoPreco && (
                <DefinirPrecoModal
                    insumo={definindoPreco}
                    onClose={() => setDefinindoPreco(null)}
                    onDone={() => {
                        setDefinindoPreco(null);
                        queryClient.invalidateQueries({ queryKey: ['inventory_insumos'] });
                        showToast('Preço definido.', 'success');
                    }}
                />
            )}

            <DeleteConfirmModal
                isOpen={!!itemToDelete}
                itemName={itemToDelete?.name || ''}
                onConfirm={handleDelete}
                onClose={() => setItemToDelete(null)}
            />
            </>))}
        </div>
    );
};

export default TabelasDeCusto;
