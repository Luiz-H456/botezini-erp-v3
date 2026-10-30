import React, { useState } from 'react';
import { useInsumos, useInsumosPaginated, useInventoryMutations } from '@/hooks/useInventoryQueries';
import { MesclarInsumo } from '@/components/inventory/MesclarInsumo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { storageService } from '@/services/storage';
import { Insumo, OrderStatus } from '@/types';
import { formatCurrency } from '@/utils';
import { ITENS_POR_PAGINA } from '@/utils/constants';
import {
    Plus, Scale,
    Check, X, Package, AlertTriangle, Link2, Search,
    ChevronRight, ChevronDown, StickyNote, Brush, Boxes, Layers
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { AjustarContagemModal } from '@/components/modals/AjustarContagemModal';
import { DefinirPrecoModal } from '@/components/modals/DefinirPrecoModal';
import { UsarDoEstoqueModal } from '@/components/pcp/UsarDoEstoqueModal';
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal';
import { Pagination } from '@/components/common/Pagination';
import SearchableSelect from '@/components/common/SearchableSelect';
import { idService } from '@/services/idService';
import PersonalizacaoTab from '@/components/inventory/PersonalizacaoTab';
import InsumoDetalhe from '@/components/inventory/InsumoDetalhe';
import { TecidosPorFornecedor } from '@/components/tabelaVerdade/TecidosPorFornecedor';
import { SEM_CATEGORIA } from '@/repositories/inventoryRepository';
import { MenuMais } from '@/components/common/MenuMais';
import { CARTAO, CAMPO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SUAVE, BOTAO_SECUNDARIO, pilula } from '@/components/finance/ui/estilo';
import { ehCritico, filtrarCriticos } from '@/utils/fabrica/estoqueCritico';
import { numero } from '@/utils/numeros';
import { semCamposDoEstoque } from '@/utils/fabrica/semCamposDoEstoque';

import { mensagemDeErro } from '@/utils/errorHandling';
type AbaEstoque = 'insumos' | 'personalizacao';

const ABAS: { id: AbaEstoque; label: string; icon: React.ElementType }[] = [
    { id: 'insumos', label: 'Insumos', icon: Boxes },
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
     * Busca vinda de outra tela (a completude do cadastro manda o nome do
     * insumo). Chega como termo e não como id porque a lista é paginada no
     * servidor: um id levaria à página em que ele está, que ninguém sabe qual
     * é — o nome traz a linha para a primeira página.
     */
    initialSearch?: string;
    clearSearch?: () => void;
    /** Abre a página do fornecedor (tabela de preços, v3.1): é lá que tecido nasce e muda. */
    onAbrirFornecedor?: (fornecedorId: string) => void;
}

const Inventory: React.FC<Props> = ({ initialSearch, clearSearch, onAbrirFornecedor }) => {
    const [aba, setAba] = useState<AbaEstoque>('insumos');

    // ── Cadastro de tecido ────────────────────────────────────────────────
    // Desde a v3.1 o tecido nasce na tabela de preços do fornecedor: escolher o fornecedor leva lá.
    const [escolhendoFornecedor, setEscolhendoFornecedor] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoriaFiltro, setCategoriaFiltro] = useState('');
    const [soCriticos, setSoCriticos] = useState(false);
    const [expandido, setExpandido] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = ITENS_POR_PAGINA;

    const { data: paginatedData, isLoading: isPaginatedLoading } = useInsumosPaginated(currentPage, itemsPerPage, searchTerm, categoriaFiltro);
    const paginatedItems = paginatedData?.data || [];
    const totalItems = paginatedData?.count || 0;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    const { data: allItems = [], isLoading: isAllItemsLoading } = useInsumos();
    const isLoading = isPaginatedLoading || isAllItemsLoading;
    // "Só críticos" olha o cadastro inteiro (allItems) e mostra todos de uma vez;
    // desligado, volta à lista paginada no servidor como sempre foi.
    const lista: Insumo[] = soCriticos ? filtrarCriticos(allItems as Insumo[], searchTerm, categoriaFiltro, SEM_CATEGORIA) : paginatedItems;

    const { saveInsumoMutation, deleteInsumoMutation } = useInventoryMutations();
    const { showToast } = useToast();

    // Suppliers for FK link
    const { data: suppliers = [] } = useQuery({
        queryKey: ['suppliers'],
        queryFn: () => storageService.getSuppliers(),
        staleTime: 1000 * 60 * 5,
    });

    // Lookup units and categories from lookup_values
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


    // Modal state
    const [ajustando, setAjustando] = useState<Insumo | null>(null);
    const [definindoPreco, setDefinindoPreco] = useState<Insumo | null>(null);
    const [usando, setUsando] = useState<{ insumo: Insumo; pedidos: { id: string; order_number: string }[] } | null>(null);
    const queryClient = useQueryClient();
    const [itemToDelete, setItemToDelete] = useState<Insumo | null>(null);

    // Inline form state
    const [editingId, setEditingId] = useState<string | 'new' | null>(null);
    const [form, setForm] = useState<Partial<Insumo>>(emptyInsumo());
    const [isSaving, setIsSaving] = useState(false);

    // Reset page when searching
    React.useEffect(() => { setCurrentPage(1); }, [searchTerm, categoriaFiltro]);

    // Deep-link: quem chegou aqui com um insumo em mente já entra com ele na
    // busca. Limpa na origem para não repetir a busca ao voltar depois.
    React.useEffect(() => {
        if (!initialSearch) return;
        setAba('insumos');
        setSearchTerm(initialSearch);
        clearSearch?.();
    }, [initialSearch]);

    // Classificação real do cadastro, com quantos itens tem cada uma. A lista
    // de lookup diz quais categorias EXISTEM; esta diz quais estão em uso —
    // que é o que interessa para filtrar.
    const contagemPorCategoria = React.useMemo(() => {
        const m = new Map<string, number>();
        for (const i of allItems as Insumo[]) {
            const c = (i.category || '').trim() || SEM_CATEGORIA;
            m.set(c, (m.get(c) || 0) + 1);
        }
        return [...m.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([valor, qtd]) => ({
                valor,
                qtd,
                rotulo: valor === SEM_CATEGORIA ? 'Sem categoria' : valor,
            }));
    }, [allItems]);

    // Os pedidos ativos só são buscados quando alguém pede para usar do estoque.
    // Se a busca falhar, avisa e não abre a janela vazia.
    const abrirUsarNoPedido = async (item: Insumo) => {
        try {
            const orders = await storageService.getOrders();
            const pedidos = orders
                .filter(o => o.status === OrderStatus.PENDING || o.status === OrderStatus.IN_PRODUCTION)
                .map(o => ({ id: o.id, order_number: o.order_number }));
            setUsando({ insumo: item, pedidos });
        } catch (e: any) {
            showToast(mensagemDeErro(e, 'Não consegui carregar os pedidos.'), 'error');
        }
    };

    // Estoque e histórico mudaram no banco: a lista e o detalhe aberto precisam reler.
    const recarregarEstoque = () => {
        queryClient.invalidateQueries({ queryKey: ['inventory_insumos'] });
        queryClient.invalidateQueries({ queryKey: ['inventory_insumo_movements'] });
    };

    const startNew = () => {
        setForm(emptyInsumo());
        setEditingId('new');
    };

    const startEdit = (item: Insumo) => {
        setForm({ ...item });
        setEditingId(item.id);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(emptyInsumo());
    };

    // Verify table access on load
    React.useEffect(() => {
        storageService.verifyInventoryTable().catch(console.error);
    }, []);

    const handleSave = async () => {
        if (!form.name?.trim()) { 
            console.warn("SAVE ATTEMPT FAILED: Name is missing");
            showToast('Nome do insumo é obrigatório.', 'error'); 
            return; 
        }
        
        console.log("INITIATING INSUMO SAVE FROM UI...", {
            mode: editingId === 'new' ? 'CREATE' : 'UPDATE',
            payload: form
        });

        setIsSaving(true);
        try {
            // Editar não escreve saldo nem custo médio: o formulário guarda o valor de quando abriu.
            await saveInsumoMutation.mutateAsync({
                ...(editingId === 'new' ? form : semCamposDoEstoque(form)),
                id: editingId === 'new' ? idService.generateUUID() : editingId!,
            });
            console.log("SAVE SUCCESSFUL IN UI");
            showToast(editingId === 'new' ? 'Insumo criado!' : 'Insumo atualizado!', 'success');
            cancelEdit();
        } catch (e: any) {
            console.error("SAVE FAILED IN UI:", e);
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

    // Totals
    const totalStockValue = allItems.reduce((s: number, i: Insumo) => s + (i.current_stock * i.average_unit_cost), 0);
    const lowStockCount = allItems.filter(ehCritico).length;

    if (isLoading) {
        return <div className="p-12 text-center text-zinc-600 flex flex-col items-center justify-center gap-4">
            <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando Almoxarifado...</p>
        </div>;
    }

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

            {aba === 'insumos' && (<>
            {/* Header KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={`${CARTAO} p-4`}>
                    <p className={`${ROTULO_PEQUENO} mb-2`}>Insumos Cadastrados</p>
                    <p className="text-3xl font-black text-white">{allItems.length}</p>
                </div>
                <div className={`${CARTAO} p-4`}>
                    <p className={`${ROTULO_PEQUENO} mb-2`}>Valor em Estoque</p>
                    <p className="text-3xl font-black text-amber-500 tracking-tighter">{formatCurrency(totalStockValue)}</p>
                </div>
                <button
                    type="button"
                    disabled={lowStockCount === 0 && !soCriticos}
                    onClick={() => setSoCriticos(v => !v)}
                    aria-pressed={soCriticos}
                    title={soCriticos ? 'Voltar à lista completa' : 'Mostrar só os itens em estoque crítico'}
                    className={`${CARTAO} p-4 text-left transition-colors ${soCriticos ? 'border-rose-500/60!' : lowStockCount > 0 ? 'border-rose-900/50! hover:border-rose-500/50!' : 'hover:border-emerald-500/30!'}`}
                >
                    <p className={`${ROTULO_PEQUENO} mb-2`}>Estoque Crítico</p>
                    <p className={`text-3xl font-black tracking-tight ${lowStockCount > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {lowStockCount > 0 ? `${lowStockCount} ITENS` : 'ESTÁVEL'}
                    </p>
                </button>
            </div>

            {/* Toolbar */}
            <div className={`${CARTAO} flex flex-wrap justify-between items-center gap-3 p-4`}>
                <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <Package className="text-amber-500" size={20} />
                        Controle de Matérias-Primas
                    </h2>
                    <p className={`${ROTULO_PEQUENO} mt-1`}>Gerenciamento de estoque centralizado. CMV calculado via ERP.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Buscar insumo..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`${CAMPO} pl-10 w-64`}
                        />
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                    </div>
                    {editingId === null && (
                        <>
                            {/* Tecido tem porta própria: não é um insumo, são até seis (uma faixa
                                de preço por grupo de cor) mais a cartela. Desde a v3.1 ele nasce na
                                tabela de preços do fornecedor, com o preço por condição de pagamento. */}
                            {onAbrirFornecedor && (escolhendoFornecedor ? (
                                <div className="w-64">
                                    <SearchableSelect value="" placeholder="DE QUAL FORNECEDOR?"
                                        onChange={(id) => { setEscolhendoFornecedor(false); if (id) onAbrirFornecedor(id); }}
                                        options={[{ value: '', label: 'DE QUAL FORNECEDOR?' }, ...suppliers.map(s => ({ value: s.id, label: s.company_name }))]} />
                                </div>
                            ) : (
                                <button onClick={() => setEscolhendoFornecedor(true)} title="O tecido nasce na tabela de preços do fornecedor"
                                    className={BOTAO_SUAVE}>
                                    <Layers size={14} /> Novo tecido no fornecedor…
                                </button>
                            ))}
                            <button onClick={startNew} className={BOTAO_PRINCIPAL}>
                                <Plus size={14} /> Novo Insumo
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Classificação — quais categorias estão realmente em uso, e quantos itens em cada */}
            {(contagemPorCategoria.length > 1 || soCriticos) && (
                <div className="flex flex-wrap items-center gap-1">
                    {soCriticos && (
                        <button onClick={() => setSoCriticos(false)} className={pilula(true)}>
                            Só críticos <X size={14} />
                        </button>
                    )}
                    {contagemPorCategoria.length > 1 && (<>
                        <button onClick={() => setCategoriaFiltro('')} className={pilula(categoriaFiltro === '')}>
                            Todos <span className="opacity-60">{allItems.length}</span>
                        </button>
                        {contagemPorCategoria.map(c => (
                            <button
                                key={c.valor}
                                onClick={() => setCategoriaFiltro(categoriaFiltro === c.valor ? '' : c.valor)}
                                title={c.valor === SEM_CATEGORIA ? 'Itens que ainda não foram classificados' : undefined}
                                className={`${pilula(categoriaFiltro === c.valor)} ${c.valor === SEM_CATEGORIA && categoriaFiltro !== c.valor ? 'text-rose-400!' : ''}`}
                            >
                                {c.rotulo} <span className="opacity-60">{c.qtd}</span>
                            </button>
                        ))}
                    </>)}
                </div>
            )}

            {/* Inline create form */}
            {editingId === 'new' && (
                <div className={`${CARTAO} border-amber-500/20! p-4 space-y-4`}>
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                        <Plus size={16} className="text-amber-500" /> Cadastro Rápido de Insumo
                    </p>
                    <div className="grid grid-cols-6 gap-3">
                        <div className="col-span-2">
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Nome*</label>
                            <input className={inputCls} placeholder="Ex: Tecido Oxford" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
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
                                <p className="text-[9px] text-zinc-600 mt-0.5">m lineares por kg</p>
                            </div>
                        )}
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Mínimo</label>
                            <input type="number" step="0.001" className={inputCls} placeholder="0" value={form.min_stock || ''} onChange={e => setForm(f => ({ ...f, min_stock: Number(e.target.value) }))} />
                        </div>
                        <div>
                            <label className={`${ROTULO_PEQUENO} block mb-1`}>Categoria</label>
                            <SearchableSelect
                                options={insumoCategories.map(c => ({ value: c, label: c }))}
                                value={form.category || ''}
                                onChange={val => setForm(f => ({ ...f, category: val }))}
                                placeholder="Ex: Tecidos"
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

            <TecidosPorFornecedor insumos={allItems as Insumo[]} fornecedores={suppliers} onAbrirFornecedor={onAbrirFornecedor} />

            {/* Table */}
            <div className={`${CARTAO} overflow-hidden`}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className={`border-b border-zinc-800 bg-zinc-950/50 ${ROTULO_PEQUENO}`}>
                                <th className="p-4">Insumo</th>
                                <th className="p-4">Categoria</th>
                                <th className="p-4">Fornecedor</th>
                                <th className="p-4 text-center">Un.</th>
                                <th className="p-4 text-right">Estoque</th>
                                <th className="p-4 text-right">CMV/Un.</th>
                                <th className="p-4 text-right">Val. Total</th>
                                <th className="p-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {lista.length === 0 && editingId !== 'new' ? (
                                <tr>
                                    <td colSpan={8} className="p-16 text-center">
                                        <Package size={40} className="mx-auto text-zinc-700 mb-4" />
                                        <p className="text-zinc-400 font-medium mb-1">
                                            {soCriticos ? 'Nenhum insumo em estoque crítico.' : searchTerm ? 'Nenhum insumo encontrado para sua busca.' : 'Seu almoxarifado está vazio.'}
                                        </p>
                                        {!searchTerm && !soCriticos && <p className="text-zinc-600 text-xs">Comece cadastrando matérias-primas e insumos de embalagem.</p>}
                                    </td>
                                </tr>
                            ) : (
                                lista.map(item => (
                                    editingId === item.id ? (
                                        <React.Fragment key={item.id}>
                                            <tr className="bg-zinc-800/40">
                                                <td className="p-2"><input className={inputCls} value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome*" /></td>
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
                                                <td className="p-2"><input type="number" step="0.001" className={`${inputCls} text-right`} value={form.min_stock || ''} onChange={e => setForm(f => ({ ...f, min_stock: Number(e.target.value) }))} placeholder="Mín." /></td>
                                                <td className="p-2 text-zinc-500 text-sm text-right font-mono">{formatCurrency(item.average_unit_cost)}</td>
                                                <td className="p-2 text-zinc-500 text-sm text-right font-mono">{formatCurrency(item.current_stock * item.average_unit_cost)}</td>
                                                <td className="p-2">
                                                    <div className="flex justify-end gap-1">
                                                        <button onClick={handleSave} disabled={isSaving} aria-label="Salvar" title="Salvar" className={`${BOTAO_PRINCIPAL} w-10 px-0`}><Check size={18} /></button>
                                                        <button onClick={cancelEdit} aria-label="Cancelar" title="Cancelar" className={`${BOTAO_SECUNDARIO} w-10 px-0`}><X size={18} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {form.unit === 'kg' && (
                                                <tr className="bg-zinc-800/20">
                                                    <td colSpan={8} className="px-4 py-2 border-t border-zinc-700/50">
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
                                                    <div className="min-w-0">
                                                        <p className="font-black text-white group-hover:text-amber-500 transition-colors uppercase tracking-wide text-xs flex items-center gap-2">
                                                            {item.name}
                                                            {item.notes && <StickyNote size={12} className="text-amber-500/60 shrink-0" />}
                                                        </p>
                                                        {ehCritico(item) && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 font-bold mt-1 bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-900">
                                                                <AlertTriangle size={12} /> Estoque Baixo
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm">
                                                {item.category
                                                    ? <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-300 bg-zinc-800/60 border border-zinc-700/50 px-2.5 py-1 rounded-full whitespace-nowrap">{item.category}</span>
                                                    : <span className="text-[10px] uppercase font-bold tracking-wider text-rose-400/70 bg-rose-950/20 border border-rose-900/40 px-2.5 py-1 rounded-full whitespace-nowrap">sem categoria</span>
                                                }
                                            </td>
                                            <td className="p-4 text-zinc-400 text-sm">
                                                {item.supplier_name
                                                    ? <span className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs cursor-pointer">
                                                        <Link2 size={12} /> {item.supplier_name}
                                                    </span>
                                                    : <span className="text-zinc-600">—</span>
                                                }
                                            </td>
                                            <td className="p-4 text-center text-zinc-400 text-sm">{item.unit}</td>
                                            <td className="p-4 text-right">
                                                <span className={`font-bold font-mono text-base ${ehCritico(item) ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                    {numero(item.current_stock)}
                                                </span>
                                                {item.min_stock > 0 && <p className="text-[10px] text-zinc-500 mt-0.5 border-t border-zinc-800/50 pt-0.5 inline-block">Mín: {numero(item.min_stock)}</p>}
                                            </td>
                                            <td className="p-4 text-right font-mono text-zinc-300 text-sm">{formatCurrency(item.average_unit_cost)}</td>
                                            <td className="p-4 text-right font-mono font-black text-amber-500">{formatCurrency(item.current_stock * item.average_unit_cost)}</td>
                                            {/* A linha inteira abre o detalhe; os botões precisam
                                                deter o clique, senão dar entrada também expandiria. */}
                                            <td className="p-4" onClick={e => e.stopPropagation()}>
                                                <div className="flex justify-end gap-2">
                                                    <button type="button" onClick={() => setAjustando(item)} aria-label={`Ajustar contagem de ${item.name}`} title="Ajustar contagem" className={`${BOTAO_SECUNDARIO} w-10 px-0`}><Scale size={18} className="text-amber-500" /></button>
                                                    <MenuMais rotulo={`Mais ações de ${item.name}`} itens={[
                                                        { rotulo: 'Usar num pedido', onClick: () => abrirUsarNoPedido(item) },
                                                        // Sem saldo, o preço não vem do estoque: define-se aqui (com saldo, é o Ajustar contagem).
                                                        ...(Number(item.current_stock) === 0 ? [{ rotulo: 'Definir preço', onClick: () => setDefinindoPreco(item) }] : []),
                                                        { rotulo: 'Editar', onClick: () => startEdit(item) },
                                                        { rotulo: 'Excluir', onClick: () => setItemToDelete(item), perigo: true },
                                                    ]} />
                                                </div>
                                            </td>
                                        </tr>
                                        {expandido === item.id && (
                                            <tr>
                                                <td colSpan={8} className="p-0">
                                                    <InsumoDetalhe insumo={item} />
                                                </td>
                                            </tr>
                                        )}
                                        </React.Fragment>
                                    )
                                ))
                            )}
                        </tbody>
                        {lista.length > 0 && (
                            <tfoot>
                                <tr className="border-t-2 border-zinc-800 bg-zinc-950/80 text-sm">
                                    <td colSpan={6} className={`p-4 text-right ${ROTULO_PEQUENO}`}>Total Financeiro Imobilizado (Geral)</td>
                                    <td className="p-4 text-right font-black font-mono text-amber-500 text-xl tracking-tighter">{formatCurrency(totalStockValue)}</td>
                                    <td />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {!soCriticos && totalPages > 1 && (
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

            {ajustando && (
                <AjustarContagemModal
                    insumo={ajustando}
                    onClose={() => setAjustando(null)}
                    onDone={() => { setAjustando(null); recarregarEstoque(); showToast('Contagem ajustada.', 'success'); }}
                />
            )}
            {definindoPreco && (
                <DefinirPrecoModal
                    insumo={definindoPreco}
                    onClose={() => setDefinindoPreco(null)}
                    onDone={() => { setDefinindoPreco(null); recarregarEstoque(); showToast('Preço definido.', 'success'); }}
                />
            )}
            {usando && (
                <UsarDoEstoqueModal
                    insumo={usando.insumo}
                    pedidos={usando.pedidos}
                    onClose={() => setUsando(null)}
                    onDone={() => { setUsando(null); recarregarEstoque(); showToast('Tirado do estoque e vinculado ao pedido.', 'success'); }}
                />
            )}
            
            <DeleteConfirmModal
                isOpen={!!itemToDelete}
                itemName={itemToDelete?.name || ''}
                onConfirm={handleDelete}
                onClose={() => setItemToDelete(null)}
            />

            </>)}
        </div>
    );
};

export default Inventory;
