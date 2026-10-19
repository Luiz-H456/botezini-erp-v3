import React, { useState } from 'react';
import { useProductInsumos, useInsumos, useInventoryMutations } from '@/hooks/useInventoryQueries';
import { formatCurrency } from '@/utils';
import { Plus, Trash2, Package, AlertTriangle, Info, ArrowRight, CheckCircle2 } from 'lucide-react';
import { SearchableSelect } from '@/components/common';
import { percentual } from '@/utils/numeros';

interface Props {
    productId: string;
    productName?: string;
    price_tier1?: number;
    calculatorFabricId?: string;
    calculatorFabricQtd?: number;
    /** Quantos produtos sem ficha ainda esperam na fila (mutirão de cadastro). */
    fichasRestantes?: number;
    /** Avança para o próximo produto sem ficha, sem fechar o editor. */
    onProximaFicha?: () => void;
}

const ProductInsumosForm: React.FC<Props> = ({
    productId, productName, price_tier1, calculatorFabricId, calculatorFabricQtd,
    fichasRestantes, onProximaFicha,
}) => {
    const { data: materials = [], isLoading } = useProductInsumos(productId);
    const { data: stockItems = [] } = useInsumos();
    const { saveProductInsumoMutation, deleteProductInsumoMutation } = useInventoryMutations();

    const [selectedStockItemId, setSelectedStockItemId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    // Calculate estimated production cost from BOM
    const estimatedCost = materials.reduce((acc, mat) => {
        const stockItem = stockItems.find(s => s.id === mat.insumo_id);
        if (!stockItem) return acc;
        return acc + (stockItem.average_unit_cost * mat.quantity);
    }, 0);

    const marginPercent = price_tier1 && price_tier1 > 0
        ? ((price_tier1 - estimatedCost) / price_tier1) * 100
        : null;

    const hasMarginAlert = marginPercent !== null && marginPercent < 40;

    const handleAdd = async () => {
        if (!selectedStockItemId || !quantity || Number(quantity) <= 0) return;
        setIsAdding(true);
        try {
            await saveProductInsumoMutation.mutateAsync({
                product_id: productId,
                insumo_id: selectedStockItemId,
                quantity: Number(quantity),
            });
            setSelectedStockItemId('');
            setQuantity('');
        } finally {
            setIsAdding(false);
        }
    };

    const handleDelete = async (id: string) => {
        await deleteProductInsumoMutation.mutateAsync({ id, productId });
    };

    // Stock items not yet in BOM
    const availableStockItems = stockItems.filter(
        s => !materials.some(m => m.insumo_id === s.id)
    );

    if (isLoading) {
        return <div className="text-zinc-500 text-sm animate-pulse py-4">Carregando Ficha Técnica...</div>;
    }

    if (!productId) {
        const calculatorFabric = stockItems.find(s => s.id === calculatorFabricId);

        return (
            <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Package size={16} className="text-gold-500" />
                        Ficha Técnica (BOM)
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        Insumos que serão vinculados à produção deste produto.
                    </p>
                </div>

                <div className="space-y-2">
                    {calculatorFabric ? (
                        <div className="bg-zinc-900/50 border border-emerald-500/30 rounded-lg px-4 py-3 flex items-center justify-between border-dashed">
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <p className="font-bold text-white text-sm">
                                        {calculatorFabric.name}
                                    </p>
                                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                        Pendente
                                    </span>
                                </div>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                    {calculatorFabricQtd} {calculatorFabric.unit} (da calculadora)
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="font-mono font-bold text-emerald-500/70 text-sm">
                                    {formatCurrency(calculatorFabric.average_unit_cost * (calculatorFabricQtd || 0))}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 py-8 border-2 border-dashed border-zinc-800 rounded-xl text-center bg-zinc-900/30">
                            <Info size={20} className="text-zinc-600" />
                            <p className="text-zinc-400 text-sm font-bold">Resumo da Calculadora</p>
                            <p className="text-zinc-500 text-xs max-w-[280px]">
                                Aplique um tecido na calculadora acima para vê-lo aqui como insumo principal.
                            </p>
                        </div>
                    )}
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-center">
                    <p className="text-xs text-zinc-500 italic">
                        Após salvar o produto, você poderá adicionar outros insumos detalhados à ficha técnica.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Package size={16} className="text-gold-500" />
                        Ficha Técnica (BOM)
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                        Defina quais insumos são necessários para produzir {productName ? `"${productName}"` : 'este produto'}.
                    </p>
                </div>
            </div>

            {/* Cost Summary Card */}
            {materials.length > 0 && (
                <div className={`rounded-xl p-4 border flex items-center justify-between gap-4 ${hasMarginAlert
                    ? 'bg-rose-950/20 border-rose-900/40'
                    : 'bg-zinc-900 border-zinc-800'
                    }`}>
                    <div>
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-1">
                            Custo Total de Produção (CMV)
                        </p>
                        <p className="text-2xl font-bold font-mono text-white">
                            {formatCurrency(estimatedCost)}
                        </p>
                    </div>

                    {marginPercent !== null && (
                        <div className="text-right">
                            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-1">
                                Margem Bruta (Preço T1)
                            </p>
                            <p className={`text-2xl font-bold font-mono ${hasMarginAlert ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {percentual(marginPercent)}
                            </p>
                        </div>
                    )}

                    {hasMarginAlert && (
                        <div className="flex items-center gap-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg px-3 py-2 text-xs font-bold whitespace-nowrap">
                            <AlertTriangle size={14} />
                            Margem Crítica
                        </div>
                    )}
                </div>
            )}

            {/* Materials List */}
            <div className="space-y-2">
                {materials.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 border-2 border-dashed border-zinc-800 rounded-xl text-center">
                        <Info size={20} className="text-zinc-700" />
                        <p className="text-zinc-500 text-sm">Nenhum insumo vinculado.</p>
                        <p className="text-zinc-600 text-xs">Adicione os materiais necessários para fabricar este produto.</p>
                    </div>
                ) : (
                    materials.map((mat) => {
                        const stockItem = stockItems.find(s => s.id === mat.insumo_id);
                        const lineCost = stockItem ? stockItem.average_unit_cost * mat.quantity : 0;
                        return (
                            <div
                                key={mat.id}
                                className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 flex items-center gap-3"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-white text-sm truncate">
                                        {stockItem?.name ?? 'Insumo não encontrado'}
                                    </p>
                                    <p className="text-xs text-zinc-500 mt-0.5">
                                        {mat.quantity} {stockItem?.unit ?? ''} × {formatCurrency(stockItem?.average_unit_cost ?? 0)} CMV
                                    </p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="font-mono font-bold text-zinc-300 text-sm">
                                        {formatCurrency(lineCost)}
                                    </p>
                                    <p className="text-[10px] text-zinc-600 mt-0.5">por unidade</p>
                                </div>
                                <button
                                    onClick={() => handleDelete(mat.id)}
                                    disabled={deleteProductInsumoMutation.isPending}
                                    className="ml-2 text-zinc-600 hover:text-rose-500 transition-colors p-1 rounded"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Add New Row */}
            {availableStockItems.length > 0 ? (
                <div className="flex gap-2 items-end bg-zinc-900/50 border border-zinc-800 rounded-xl p-3">
                    <div className="flex-1 min-w-0">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block">
                            Insumo
                        </label>
                        <SearchableSelect
                            value={selectedStockItemId}
                            onChange={setSelectedStockItemId}
                            options={availableStockItems.map(s => ({ value: s.id, label: `${s.name} (${s.unit}) — ${formatCurrency(s.average_unit_cost)}/un` }))}
                            placeholder="SELECIONE O INSUMO..."
                        />
                    </div>

                    <div className="w-28 flex-shrink-0">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block">
                            Qtd por unid.
                        </label>
                        <input
                            type="number"
                            step="0.001"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-gold-500 font-mono text-sm"
                        />
                    </div>

                    <button
                        onClick={handleAdd}
                        disabled={isAdding || !selectedStockItemId || !quantity}
                        className="flex-shrink-0 bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-lg p-2.5 transition-colors"
                    >
                        {isAdding ? (
                            <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                        ) : (
                            <Plus size={20} />
                        )}
                    </button>
                </div>
            ) : stockItems.length === 0 ? (
                <div className="text-xs text-zinc-600 flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-3 rounded-lg">
                    <Info size={14} />
                    Cadastre insumos em <strong>Cadastros Gerais → Estoque & Insumos</strong> antes de vincular ao produto.
                </div>
            ) : (
                <p className="text-xs text-zinc-600 text-center py-2">
                    Todos os insumos disponíveis já estão vinculados a este produto.
                </p>
            )}

            {/* Mutirão de fichas: só aparece quando o usuário entrou por "Criar
                fichas" no painel de pendências. Avança sem fechar o editor —
                fechar e reabrir a cada produto é o que torna o cadastro em lote
                insuportável. */}
            {onProximaFicha && (
                <div className="flex items-center gap-3 bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3">
                    {materials.length > 0
                        ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                        : <AlertTriangle size={16} className="text-amber-500 shrink-0" />}
                    <p className="text-xs text-zinc-300 font-bold flex-1 min-w-0">
                        {materials.length > 0
                            ? <>Ficha de <span className="text-white">{productName || 'produto'}</span> preenchida.</>
                            : <>Vincule ao menos um insumo para esta ficha valer.</>}
                        {typeof fichasRestantes === 'number' && (
                            <span className="text-zinc-500 font-medium">
                                {' '}{fichasRestantes > 0
                                    ? `Faltam ${fichasRestantes} ${fichasRestantes === 1 ? 'produto' : 'produtos'} na fila.`
                                    : 'Este é o último da fila.'}
                            </span>
                        )}
                    </p>
                    <button
                        type="button"
                        onClick={onProximaFicha}
                        className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-amber-500 text-black hover:bg-amber-400 transition-colors"
                    >
                        {fichasRestantes && fichasRestantes > 0 ? <>Próxima ficha <ArrowRight size={14} /></> : <>Concluir</>}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ProductInsumosForm;
