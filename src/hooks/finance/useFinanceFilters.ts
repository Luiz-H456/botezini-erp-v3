import { useMemo } from 'react';
import type { ObligationSummary, Client, Supplier, GlobalCategory } from '../../types';
import { getTodayStr } from '@/utils/date';
import { filtrarContas, agruparParaLista } from '@/utils/financas/lista';
import type { ContextoDaLista, FiltrosDaLista } from '@/utils/financas/lista';
import { numerosDaVisaoGeral } from '@/utils/financas/numeros';
import { projecaoDoMes } from '@/utils/financas/projecao';
import { nomeDaCategoria as nomeDaCategoriaV3 } from '@/utils/financas/caixa';

/** A lista e os números da aba Contas — casca sobre as contas puras de utils/financas. */
export function useFinanceFilters(
    obligations: ObligationSummary[],
    clients: Client[],
    suppliers: Supplier[],
    globalCategories: GlobalCategory[],
    filtros: FiltrosDaLista,
    contasPorObrigacao: Record<string, string[]>,
    totais: { nosBancos: number; nasCaixinhas: number },
) {
    const hoje = getTodayStr();
    const ctx: ContextoDaLista = useMemo(() => {
        const cli = new Map(clients.map(c => [c.id, c.company_name]));
        const forn = new Map(suppliers.map(f => [f.id, f.company_name]));
        const cats = new Map(globalCategories.map(c => [c.id, c]));
        return {
            hoje, contasPorObrigacao,
            nomeDaParte: c => (c.client_id ? cli.get(c.client_id) : c.supplier_id ? forn.get(c.supplier_id) : '') ?? '',
            nomeDaCategoria: c => nomeDaCategoriaV3(c, cats, ''),
        };
    }, [clients, suppliers, globalCategories, contasPorObrigacao, hoje]);

    const lista = useMemo(() => filtrarContas(obligations, filtros, ctx), [obligations, filtros, ctx]);
    const porAtraso = filtros.recorte?.endsWith('vencido')
        || (!filtros.recorte && (filtros.rapido === 'vencidas' || filtros.rapido === 'agora'));
    const grupos = useMemo(() => agruparParaLista(lista, hoje, !!porAtraso), [lista, hoje, porAtraso]);
    const numeros = useMemo(() => numerosDaVisaoGeral({ contas: obligations, ...totais, hoje }),
        [obligations, totais.nosBancos, totais.nasCaixinhas, hoje]);
    const projecao = useMemo(() => projecaoDoMes({ contas: obligations, livreHoje: numeros.livre, hoje }),
        [obligations, numeros.livre, hoje]);

    return { lista, grupos, numeros, projecao, nomeDaParte: ctx.nomeDaParte, nomeDaCategoria: ctx.nomeDaCategoria };
}
