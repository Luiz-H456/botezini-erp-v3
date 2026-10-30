import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useEscFecha } from '@/hooks/useEscFecha';
import { X, User, Building2, Package, Check, AlertTriangle, ClipboardList } from 'lucide-react';
import { Client, Supplier, Product, Insumo, GlobalCategory } from '@/types';
import { candidatosDeApelido } from '@/utils/apelidosDeProduto';
import { storageService } from '@/services/storage';
import { idService } from '@/services/idService';
import SearchableSelect from '../common/SearchableSelect';
import { GlobalCategorySelect } from '@/components/masterdata/GlobalCategorySelect';
import { GlobalCategoryQuickAdd } from './GlobalCategoryQuickAdd';
import { InfoTooltip } from '@/components/common';

import { useSaidaProtegida } from '@/hooks/useSaidaProtegida';
type EntityType = 'client' | 'supplier' | 'product' | 'insumo';

interface Props {
    type: EntityType;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (newItem: any) => void;
    initialName?: string;
}

const QuickCreateModal: React.FC<Props> = ({ type, isOpen, onClose, onSuccess, initialName = '' }) => {
    const inputClasses = "w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-[11px] font-bold text-white outline-none focus:border-amber-500/30 transition-all placeholder:text-zinc-700";
    const [isLoading, setIsLoading] = useState(false);
    const [name, setName] = useState(initialName);
    const [phone, setPhone] = useState('');
    const [city, setCity] = useState(''); // Simple City/State string
    const [contact, setContact] = useState('');
    const [category, setCategory] = useState('');
    const [price, setPrice] = useState('');
    const [productType, setProductType] = useState('Produto');
    const [errorMsg, setErrorMsg] = useState('');
    const [globalCategories, setGlobalCategories] = useState<GlobalCategory[]>([]);
    const [globalCategoryId, setGlobalCategoryId] = useState('');
    const [showCategoryAdd, setShowCategoryAdd] = useState(false);
    // Ficha técnica semi-preenchida (produto): tecido principal + consumo por peça.
    const [insumos, setInsumos] = useState<Insumo[]>([]);
    const [fabricId, setFabricId] = useState('');
    const [fabricM, setFabricM] = useState('');
    // Campos que o cadastro completo exige e o rápido não pedia — o produto
    // nascia sem capacidade produtiva (obrigatória lá) e sem as faixas T2/T3,
    // que são a régua de toda a análise de desconto.
    const [capacidade, setCapacidade] = useState('');
    const [precoT2, setPrecoT2] = useState('');
    const [precoT3, setPrecoT3] = useState('');
    /** Catálogo, para avisar quando o nome digitado já existe. */
    const [produtos, setProdutos] = useState<Product[]>([]);

    // Só compara quando há nome: com o campo vazio tudo é "parecido".
    const duplicados = useMemo(
        () => (type === 'product' && name.trim().length >= 3
            ? candidatosDeApelido({ id: '__novo', name } as any, produtos as any)
            : []),
        [type, name, produtos]);

    const loadGlobalCategories = () => {
        const domain = (type === 'client' || type === 'supplier') ? 'crm' : 'inventory';
        storageService.getGlobalCategories(domain).then(setGlobalCategories);
    };

    useEffect(() => {
        if (isOpen) {
            setName(initialName);
            setPhone('');
            setCity('');
            setContact('');
            setCategory('');
            setPrice('');
            setProductType('Produto');
            setGlobalCategoryId('');
            setFabricId('');
            setFabricM('');
            setCapacidade('');
            setPrecoT2('');
            setPrecoT3('');
            loadGlobalCategories();
            if (type === 'product') {
                storageService.getInsumos().then(setInsumos).catch(() => setInsumos([]));
                storageService.getProducts().then(setProdutos).catch(() => setProdutos([]));
            }
        }
    }, [isOpen, initialName, type]);


    const handleSave = async () => {
        // Validação: nome é o único campo obrigatório em todos os tipos.
        // Demais são opcionais (marcados como tal na UI).
        if (!name.trim()) {
            setErrorMsg(type === 'client' || type === 'supplier'
                ? 'Informe o nome / empresa.'
                : 'Informe o nome.');
            return;
        }
        setErrorMsg('');
        setIsLoading(true);

        try {
            let newItem: any;
            const now = new Date().toISOString();
            // Intercomunicação: o `category` texto é derivado do catálogo global
            // escolhido (nada de categoria solta). Assim todo leitor de `.category`
            // (lista, orçamento, PDF, sugestão financeira) e todo leitor de
            // `global_category_id` ficam sincronizados.
            const globalCategoryName = globalCategories.find(g => g.id === globalCategoryId)?.name;

            if (type === 'client') {
                const client: Client = {
                    id: idService.generateUUID(),
                    company_name: name,
                    phone: phone,
                    address: city, // Mapping "City" input to "Address" column
                    contact_person: contact,
                    category: globalCategoryName || undefined,
                    global_category_id: globalCategoryId || undefined,
                    created_at: now,
                    updated_at: now,
                };
                await storageService.saveClient(client);
                newItem = client;
            } else if (type === 'supplier') {
                const supplier: Supplier = {
                    id: idService.generateUUID(),
                    company_name: name,
                    contact_person: contact,
                    category: globalCategoryName || undefined,
                    default_sub_category: category,
                    global_category_id: globalCategoryId || undefined,
                    created_at: now,
                    updated_at: now
                };
                await storageService.saveSupplier(supplier);
                newItem = supplier;
            } else if (type === 'product') {
                const product: Product = {
                    id: idService.generateUUID(),
                    name: name,
                    price_tier1: parseFloat(price) || 0,
                    price_tier2: parseFloat(precoT2) || 0,
                    price_tier3: parseFloat(precoT3) || 0,
                    // 50 é o mesmo palpite que a calculadora de custo usa quando
                    // o campo está vazio; deixar zero faria a conta de mão de
                    // obra dividir por zero mais adiante.
                    pieces_daily_capacity: parseInt(capacidade) || 50,
                    category: globalCategoryName || productType,
                    global_category_id: globalCategoryId || undefined,
                    created_at: now,
                    updated_at: now,
                };
                await storageService.saveProduct(product); // Assuming saveProduct exists
                // Ficha técnica semi-preenchida: cria a 1ª linha da BOM (tecido).
                if (fabricId && parseFloat(fabricM) > 0) {
                    try {
                        await storageService.saveProductInsumo({
                            product_id: product.id,
                            insumo_id: fabricId,
                            quantity: parseFloat(fabricM),
                        });
                    } catch (err) {
                        console.warn('Ficha técnica não pré-preenchida:', err);
                    }
                }
                newItem = product;
            } else if (type === 'insumo') {
                const insumo: Partial<Insumo> = {
                    id: idService.generateUUID(),
                    name: name,
                    category: category || 'Tecidos',
                    global_category_id: globalCategoryId || undefined,
                    unit: 'm',
                    min_stock: 0,
                    current_stock: 0,
                    average_unit_cost: parseFloat(price) || 0,
                };
                await storageService.saveInsumo(insumo);
                newItem = insumo;
            }

            onSuccess(newItem);
            onClose();
        } catch (error: any) {
            console.error("Quick Create Error:", error);
            setErrorMsg(error.message || "Erro ao salvar. Verifique o console.");
        } finally {
            setIsLoading(false);
        }
    };

    // Com o painel de categoria aberto, o Esc é dele (ele trata e fecha só ele).
    const saida = useSaidaProtegida(onClose);
    const { limpar } = saida;
    useEffect(() => { if (!isOpen) limpar(); }, [isOpen, limpar]);
    useEscFecha(isOpen && !showCategoryAdd, saida.pedirParaFechar);

    if (!isOpen) return null;

    const getTitle = () => {
        if (type === 'client') return 'Novo Cliente Rápido';
        if (type === 'supplier') return 'Novo Fornecedor Rápido';
        if (type === 'insumo') return 'Novo Insumo Rápido';
        return 'Novo Produto Rápido';
    };

    const getIcon = () => {
        if (type === 'client') return <User size={16} className="text-emerald-500" />;
        if (type === 'supplier') return <Building2 size={16} className="text-blue-500" />;
        return <Package size={16} className="text-amber-500" />;
    };

    return <>{saida.confirmacao}{createPortal(
        <div className="fixed inset-0 bg-zinc-950/80 flex items-center justify-center z-sobreposto p-4 backdrop-blur-md ease-out animate-in fade-in duration-200">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-sm max-h-full flex flex-col overflow-hidden transform transition-all scale-100 backdrop-blur-xl relative" {...saida.aoMexer}>
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
                {/* Header */}
                <div className="shrink-0 p-6 bg-zinc-950/50 border-b border-zinc-900 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-zinc-900 rounded-xl border border-zinc-800 shadow-inner">
                            {getIcon()}
                        </div>
                        <h3 className="font-black text-white text-[10px] uppercase tracking-[0.2em]">{getTitle()}</h3>
                    </div>
                    <button type="button" onClick={saida.pedirParaFechar} aria-label="Fechar" className="p-2 text-zinc-600 hover:text-white transition-colors hover:bg-zinc-800 rounded-lg">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-5">
                    {errorMsg && (
                        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3">
                            <AlertTriangle size={14} className="shrink-0" />
                            {errorMsg}
                        </div>
                    )}
                    {/* Client/Supplier Name Field */}
                    {(type === 'client' || type === 'supplier') && (
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Nome / Empresa <span className="text-amber-500">*</span></label>
                            <input
                                autoFocus
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-[11px] font-bold text-white outline-none focus:border-amber-500/30 transition-all placeholder:text-zinc-800"
                                placeholder="Ex: Nome ou Razão Social"
                            />
                        </div>
                    )}

                    {/* Client Specific */}
                    {type === 'client' && (
                        <>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Telefone / Whats</label>
                                    <input
                                        value={phone}
                                        onChange={e => setPhone(e.target.value)}
                                        className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-[11px] font-bold text-white outline-none focus:border-amber-500/30 transition-all font-mono"
                                        placeholder="(00) 00000-0000"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Cidade / Estado</label>
                                    <input
                                        value={city}
                                        onChange={e => setCity(e.target.value)}
                                        className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-[11px] font-bold text-white outline-none focus:border-amber-500/30 transition-all"
                                        placeholder="Ex: Formiga / MG"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                        Categoria CRM (Opcional)
                                        <InfoTooltip iconSize={11}>
                                            <p className="text-[11px] text-zinc-300 leading-relaxed mb-1.5">
                                                Agrupa clientes e fornecedores por tipo — <em>Hospitais</em>, <em>Escolas</em>,
                                                <em>Indústria</em>, <em>Aviamentos</em>.
                                            </p>
                                            <p className="text-[10px] text-zinc-400 leading-relaxed">
                                                Serve para filtrar listas e ver quanto cada segmento representa. É a MESMA lista
                                                usada em Cadastros — criar aqui vale para o app inteiro, não só para este registro.
                                            </p>
                                        </InfoTooltip>
                                    </label>
                                    <GlobalCategorySelect
                                        categories={globalCategories}
                                        domain="crm"
                                        value={globalCategoryId}
                                        onChange={(id) => setGlobalCategoryId(id)}
                                        incluirOutrosSetores
                                    onCreateNew={() => setShowCategoryAdd(true)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Pessoa de Contato</label>
                                    <input
                                        value={contact}
                                        onChange={e => setContact(e.target.value)}
                                        className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-[11px] font-bold text-white outline-none focus:border-amber-500/30 transition-all"
                                        placeholder="Ex: João da Silva"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {(type === 'product' || type === 'insumo') && (
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">
                                    Nome do {type === 'insumo' ? 'Tecido/Insumo' : 'Produto'} <span className="text-amber-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    autoFocus
                                    className={inputClasses}
                                    placeholder={type === 'insumo' ? 'Ex: Nome do Insumo' : 'Ex: Nome do Produto'}
                                    value={name}
                                    onChange={(e) => setName(e.target.value.toUpperCase())}
                                />
                            </div>
                            {/* Duplicata avisada na hora de criar, que é onde ela
                                nasce. Depois de criado, o mesmo produto com nome
                                ligeiramente diferente já repartiu o histórico em
                                dois — e aí só resta ligar por apelido. */}
                            {type === 'product' && duplicados.length > 0 && (
                                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1">
                                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                                        <AlertTriangle size={12} /> Já existe algo parecido
                                    </p>
                                    {duplicados.slice(0, 3).map((d: any) => (
                                        <p key={d.produto.id} className="text-[10px] text-zinc-300 font-bold truncate">
                                            {d.produto.name}
                                            {d.mesmoNomeNormalizado && (
                                                <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-amber-500/80">mesmo nome</span>
                                            )}
                                        </p>
                                    ))}
                                    <p className="text-[10px] text-zinc-500 leading-snug pt-0.5">
                                        Criar de novo divide o histórico de preço entre os dois cadastros.
                                    </p>
                                </div>
                            )}

                            <div className={type === 'product' ? 'grid grid-cols-3 gap-3' : 'space-y-2'}>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">
                                        {type === 'insumo' ? 'Custo unitário (R$)' : 'Preço T1 (R$)'}
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-[11px] font-black text-amber-500 outline-none focus:border-amber-500/30 transition-all font-mono"
                                        placeholder="0.00"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                    />
                                </div>
                                {type === 'product' && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">T2</label>
                                            <input type="number" step="0.01" className={inputClasses + ' font-mono'}
                                                placeholder="0.00" value={precoT2}
                                                onChange={(e) => setPrecoT2(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">T3</label>
                                            <input type="number" step="0.01" className={inputClasses + ' font-mono'}
                                                placeholder="0.00" value={precoT3}
                                                onChange={(e) => setPrecoT3(e.target.value)} />
                                        </div>
                                    </>
                                )}
                            </div>

                            {type === 'product' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">
                                        Capacidade produtiva (peças/dia)
                                    </label>
                                    <input type="number" min="1" className={inputClasses + ' text-emerald-400'}
                                        placeholder="50" value={capacidade}
                                        onChange={(e) => setCapacidade(e.target.value)} />
                                    <p className="text-[10px] text-zinc-600 leading-snug ml-1">
                                        Alimenta o custo de mão de obra por peça. Em branco, entra 50.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Supplier Specific */}
                    {type === 'supplier' && (
                        <>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                                    Categoria Padrão (Opcional)
                                    <InfoTooltip iconSize={11}>
                                        <p className="text-[11px] text-zinc-300 leading-relaxed mb-1.5">
                                            Classifica o insumo para o estoque e para o custo — <em>Tecidos</em>,
                                            <em>Aviamentos</em>, <em>Embalagem</em>.
                                        </p>
                                        <p className="text-[10px] text-zinc-400 leading-relaxed">
                                            É por ela que a lista de compras separa o que comprar de cada tipo, e é ela que
                                            distingue tecido do resto no seletor do orçamento.
                                        </p>
                                    </InfoTooltip>
                                </label>
                                <GlobalCategorySelect
                                    categories={globalCategories}
                                    domain="crm"
                                    value={globalCategoryId}
                                    onChange={(id, nome) => { setGlobalCategoryId(id); setCategory(nome); }}
                                    incluirOutrosSetores
                                    onCreateNew={() => setShowCategoryAdd(true)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Contato</label>
                                <input
                                    value={contact}
                                    onChange={e => setContact(e.target.value)}
                                    className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-[11px] font-bold text-white outline-none focus:border-amber-500/30 transition-all"
                                    placeholder="Vendedor / Representante"
                                />
                            </div>
                        </>
                    )}

                    {/* Product Specific — preço já está no bloco compartilhado acima */}
                    {type === 'product' && (
                        <>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Tipo / Categoria <span className="text-zinc-700">(opcional)</span></label>
                                    <GlobalCategorySelect
                                        categories={globalCategories}
                                        domain="inventory"
                                        value={globalCategoryId}
                                        onChange={(id, nome) => { setGlobalCategoryId(id); setProductType(nome); }}
                                        incluirOutrosSetores
                                    onCreateNew={() => setShowCategoryAdd(true)}
                                    />
                                </div>

                                {/* Ficha técnica semi-preenchida (opcional) — adianta o trabalho */}
                                <div className="bg-zinc-950/40 border border-zinc-800/60 rounded-xl p-3 space-y-3">
                                    <p className="text-[10px] font-black text-amber-500/70 uppercase tracking-[0.2em] flex items-center gap-1.5">
                                        <ClipboardList size={12} /> Ficha técnica (opcional) — já adianta
                                    </p>
                                    <div className="grid grid-cols-[1fr,auto] gap-2">
                                        <div>
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1 mb-1 block">Tecido principal</label>
                                            <SearchableSelect
                                                value={fabricId}
                                                onChange={setFabricId}
                                                options={insumos.map(i => ({ value: i.id, label: i.name }))}
                                                placeholder="SELECIONAR TECIDO..."
                                            />
                                        </div>
                                        <div className="w-24">
                                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1 mb-1 block">m/peça</label>
                                            <input
                                                type="number" step="0.01" min="0"
                                                value={fabricM}
                                                onChange={e => setFabricM(e.target.value)}
                                                placeholder="0,00"
                                                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl p-3 text-[11px] font-black text-white outline-none focus:border-amber-500/30 transition-all font-mono text-right"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-zinc-600 font-bold leading-relaxed">
                                        Cria a 1ª linha da ficha técnica (BOM). Você completa depois em Cadastros → Produtos.
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="shrink-0 p-6 bg-zinc-950/50 border-t border-zinc-900 flex justify-end">
                    <button type="button"
                        onClick={handleSave}
                        disabled={isLoading || !name.trim()}
                        className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-black uppercase text-[10px] tracking-[0.2em] px-8 py-4 rounded-xl shadow-xl shadow-amber-900/20 transition-all flex items-center gap-3 active:scale-95"
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                        ) : (
                            <><Check size={16} /> Salvar Rápido</>
                        )}
                    </button>
                </div>
            </div>
            
            {showCategoryAdd && (
                <GlobalCategoryQuickAdd
                    isOpen={showCategoryAdd}
                    domain={(type === 'client' || type === 'supplier') ? 'crm' : 'inventory'}
                    onClose={() => setShowCategoryAdd(false)}
                    onCreated={(newCat) => {
                        setGlobalCategoryId(newCat.id);
                        if (type === 'supplier') setCategory(newCat.name);
                        if (type === 'product') setProductType(newCat.name);
                        setShowCategoryAdd(false);
                        loadGlobalCategories();
                    }}
                />
            )}
        </div>,
        document.body,
    )}</>;
};

export default QuickCreateModal;
