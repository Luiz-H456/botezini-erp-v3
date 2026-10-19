import { useState, useMemo } from 'react';
import { ShoppingCart, Gauge, PackageCheck, Scissors, LayoutDashboard, CalendarClock, KanbanSquare, Target } from 'lucide-react';
import { DashboardPanel } from '@/components/pcp/DashboardPanel';
import { CronogramaPanel } from '@/components/pcp/CronogramaPanel';
import { KanbanPanel } from '@/components/pcp/KanbanPanel';
import { PurchaseListPanel } from '@/components/pcp/PurchaseListPanel';
import { CapacityPanel } from '@/components/pcp/CapacityPanel';
import { ProductionControlPanel } from '@/components/pcp/ProductionControlPanel';
import { DesempenhoPanel } from '@/components/pcp/DesempenhoPanel';
import { RendimentoDoCortePanel } from '@/components/pcp/RendimentoDoCortePanel';
import { pilula } from '@/components/finance/ui/estilo';
import type { PcpTab } from '@/utils/pcpAbas';
import type { View } from '@/utils/navegacao';
import type { WeekFilter } from '@/hooks/pcp/usePurchaseList';

const TABS: { key: PcpTab; label: string; icon: typeof ShoppingCart }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'kanban', label: 'Kanban', icon: KanbanSquare },
    { key: 'schedule', label: 'Cronograma', icon: CalendarClock },
    { key: 'purchases', label: 'Lista de Compras', icon: ShoppingCart },
    { key: 'capacity', label: 'Capacidade & Setores', icon: Gauge },
    { key: 'control', label: 'Controle Parcial', icon: PackageCheck },
    { key: 'rendimento', label: 'Rendimento do Corte', icon: Scissors },
    { key: 'desempenho', label: 'Desempenho', icon: Target },
];


interface Props {
    /** As abas que esta tela mostra, na ordem. Com uma só, não há barra interna. */
    abas: PcpTab[];
    /** Papel `factory`: o quadro esconde valores. */
    semFinanceiro?: boolean;
    /** Destaque pedido pela fila do Início; só o Kanban usa. */
    destaque?: 'atrasados' | 'ultimo-setor';
    /** Próximos passos que levam a outra tela (Kanban, Cronograma, Compras). */
    onIrPara?: (v: View) => void;
    /** "Ver o que receber" do Quadro: abre as Contas a receber já no cliente do pedido. */
    onVerReceber?: (clienteId: string) => void;
    /** Filtro da Lista de compras ao abrir (a linha do Início conta só a semana). */
    filtroDeCompras?: WeekFilter;
}

export function PCP({ abas, semFinanceiro = false, destaque, onIrPara, onVerReceber, filtroDeCompras }: Props) {
    const visiveis = useMemo(() => abas.map(k => TABS.find(t => t.key === k)).filter((t): t is typeof TABS[number] => Boolean(t)), [abas]);
    const [tab, setTab] = useState<PcpTab>(abas[0]);

    // Se o tab atual não está em abas, renderiza com abas[0]
    const ativa = abas.includes(tab) ? tab : abas[0];

    return (
        <div className="space-y-5">
            {visiveis.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
                    {visiveis.map(t => {
                        const Icon = t.icon;
                        return (
                            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={pilula(ativa === t.key)}>
                                <Icon size={14} /> {t.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {ativa === 'kanban' && <KanbanPanel semFinanceiro={semFinanceiro} destaque={destaque} onIrPara={onIrPara} onVerReceber={onVerReceber} />}
            {ativa === 'control' && <ProductionControlPanel semFinanceiro={semFinanceiro} />}
            {ativa === 'desempenho' && <DesempenhoPanel />}
            {ativa === 'rendimento' && <RendimentoDoCortePanel />}
            {ativa === 'dashboard' && <DashboardPanel />}
            {ativa === 'schedule' && <CronogramaPanel onIrPara={onIrPara} />}
            {ativa === 'purchases' && <PurchaseListPanel onIrPara={onIrPara} filtroInicial={filtroDeCompras} />}
            {ativa === 'capacity' && <CapacityPanel />}
        </div>
    );
}
