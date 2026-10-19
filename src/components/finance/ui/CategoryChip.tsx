import { LayoutList, LayoutGrid, Zap, Paperclip, Users, Truck, ShieldCheck, ArrowUpRight } from 'lucide-react';

const CATEGORY_ICONS_COMP: Record<string, any> = {
    'Vendas de Produtos': LayoutGrid, 'Serviços Prestados': Zap, 'Outras Receitas': ArrowUpRight,
    'Matéria Prima': Paperclip, 'Mão de Obra': Users, 'Aluguel': LayoutList,
    'Energia Elétrica': Zap, 'Impostos e Taxas': ShieldCheck, 'Tarifas Bancárias': ShieldCheck,
    'Marketing': Zap, 'Salários': Users, 'Logística': Truck,
    'Manutenção': Zap, 'Outras Despesas': LayoutList,
};

interface CategoryChipProps {
    category?: string | null;
}

export function CategoryChip({ category }: CategoryChipProps) {
    if (!category) return null;
    const Icon = CATEGORY_ICONS_COMP[category] || LayoutList;
    return (
        <span className="inline-flex items-center gap-1.5 text-[8px] font-bold text-zinc-500 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-md">
            <Icon size={12} className="text-zinc-600" />
            <span className="truncate max-w-[80px]">{category}</span>
        </span>
    );
}
