import { ObligationStatus, PaymentMethod } from '../types';

/**
 * Itens por página em TODA listagem paginada do app.
 *
 * Era um número solto em cada tela (10 em Orçamentos e Pedidos, 8 em Cadastros,
 * 20 em Estoque) — e em Cadastros o mesmo 8 estava escrito em dois lugares que
 * precisavam concordar entre si: o que fatia a lista e o que escreve "exibindo
 * X a Y". Se um mudasse sem o outro, a tela mentiria a contagem. Uma constante
 * só elimina essa classe de erro.
 */
export const ITENS_POR_PAGINA = 15;

export const STATUS_CONFIG: Record<ObligationStatus, { label: string; color: string; bg: string; border: string }> = {
    open: { label: 'Em Aberto', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    partial: { label: 'Parcial', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
    paid: { label: 'Liquidado', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    overdue: { label: 'Vencido', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
    cancelled: { label: 'Cancelado', color: 'text-zinc-500', bg: 'bg-zinc-800/50', border: 'border-zinc-700' },
};

export const PAYMENT_METHODS: PaymentMethod[] = ['PIX', 'TED', 'DOC', 'Boleto', 'Cartão', 'Dinheiro', 'Cheque', 'Outro'];

export const INCOME_CATEGORIES = ['Vendas de Produtos', 'Serviços Prestados', 'Outras Receitas'];
export const EXPENSE_CATEGORIES = [
    'Matéria Prima', 'Mão de Obra', 'Aluguel', 'Energia Elétrica',
    'Impostos e Taxas', 'Tarifas Bancárias', 'Marketing', 'Salários',
    'Logística', 'Manutenção', 'Outras Despesas'
];

export const CATEGORY_ICONS: Record<string, string> = {
    'Vendas de Produtos': '🛍️', 'Serviços Prestados': '⚙️', 'Outras Receitas': '💰',
    'Matéria Prima': '🪵', 'Mão de Obra': '👷', 'Aluguel': '🏢',
    'Energia Elétrica': '⚡', 'Impostos e Taxas': '🏛️', 'Tarifas Bancárias': '🏦',
    'Marketing': '📣', 'Salários': '👥', 'Logística': '🚚',
    'Manutenção': '🔧', 'Outras Despesas': '📋',
};
