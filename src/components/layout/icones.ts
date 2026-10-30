import {
    LayoutDashboard, FileText, ShoppingBag, KanbanSquare, PackageCheck, CalendarClock,
    ShoppingCart, Package, Table2, DollarSign, Wallet, PiggyBank, BarChart3, Gauge, Database, Settings2,
    NotebookPen, Radar, Factory, Users, Truck, Shirt, Landmark, Building2, Tags, MessageCircle, HeartPulse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SecaoId, View } from '@/utils/navegacao';

/** Fora do `navegacao.ts` para aquele arquivo seguir sem React (testado com node --test). */
export const ICONE_DA_VIEW: Record<View, LucideIcon> = {
    dashboard: LayoutDashboard,
    budgets: FileText,
    orders: ShoppingBag,
    quadro: KanbanSquare,
    'controle-parcial': PackageCheck,
    cronograma: CalendarClock,
    compras: ShoppingCart,
    tabelas: Table2,
    inventory: Package,
    finance: DollarSign,
    receivables: Wallet,
    envelopes: PiggyBank,
    'saude-caixa': HeartPulse,
    resultado: BarChart3,
    'itens-vendidos': ShoppingBag,
    indicadores: Gauge,
    masterdata: Database,
    capacidade: Settings2,
    cadastros: Database,
    clientes: Users,
    fornecedores: Truck,
    produtos: Shirt,
    bancos: Landmark,
    setores: Settings2,
    empresa: Building2,
    categorias: Tags,
    mensagens: MessageCircle,
    board: NotebookPen,
    leads: Radar,
    pcp: KanbanSquare,
    production: KanbanSquare,
    login: LayoutDashboard,
};

export const ICONE_DA_SECAO: Record<SecaoId, LucideIcon> = {
    inicio: LayoutDashboard,
    vender: ShoppingBag,
    producao: Factory,
    planejar: CalendarClock,
    dinheiro: DollarSign,
    resultados: BarChart3,
    cadastros: Database,
    notas: NotebookPen,
};
