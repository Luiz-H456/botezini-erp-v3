import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { storageService } from '@/services/storage';
import { vendasDoProduto, linhasNormalizadas, curvaDeDesconto } from '@/utils/historicoDeProduto';
import type { VendaDoProduto, FaixaDeDesconto } from '@/utils/historicoDeProduto';
import { mapaDeCanonicos, canonico } from '@/utils/apelidosDeProduto';
import type { Product } from '@/types';

/**
 * Monta o índice produto → T1. É a régua que põe orçadas de peças diferentes
 * na mesma escala; produto sem T1 simplesmente não entra na curva.
 */
export function listaPorProduto(produtos: Product[] | undefined): Map<string, number> {
    return new Map(
        (produtos || [])
            .filter(p => (Number(p.price_tier1) || 0) > 0)
            .map(p => [p.id, Number(p.price_tier1)]),
    );
}

/**
 * A curva de resposta ao desconto da CASA — não de um produto.
 *
 * É o ponto da coisa: dentro de um produto, preço÷tabela é só o preço numa
 * outra escala e não acrescenta informação. Entre produtos, o T1 absorve a
 * especificação (tecido, cor, bordado, volume) e as orçadas passam a ser
 * comparáveis, o que dá amostra para a taxa de fechamento significar algo.
 */
export function useCurvaDeDesconto(excluirOrcamentoId?: string): FaixaDeDesconto[] | null {
    const { data: orcamentos } = useQuery({
        queryKey: ['budgets'],
        queryFn: () => storageService.getBudgets(),
        staleTime: 1000 * 60 * 5,
    });
    const { data: produtos } = useQuery({
        queryKey: ['products'],
        queryFn: () => storageService.getProducts(),
        staleTime: 1000 * 60 * 10,
    });

    return useMemo(() => curvaDeDesconto(
        linhasNormalizadas((orcamentos || []) as any, listaPorProduto(produtos), excluirOrcamentoId),
    ), [orcamentos, produtos, excluirOrcamentoId]);
}

/**
 * Histórico de preço de UM produto, pronto para a tela.
 *
 * Existe para as telas que só olham um produto por vez — o cadastro, por
 * exemplo. O editor de orçamento não usa isto: lá a tabela tem uma linha por
 * peça e vale mais montar o índice inteiro de uma vez (historicoPorProduto) do
 * que varrer todos os orçamentos uma vez por linha.
 *
 * As duas consultas ficam com a chave que o resto do app já usa, então a lista
 * costuma vir do cache em vez de gerar ida nova ao banco.
 */
export function useHistoricoDeProduto(
    productId?: string,
    excluirOrcamentoId?: string,
): { vendas: VendaDoProduto[]; carregando: boolean } {
    const { data: orcamentos, isLoading: carregandoOrcamentos } = useQuery({
        queryKey: ['budgets'],
        queryFn: () => storageService.getBudgets(),
        staleTime: 1000 * 60 * 5,
        enabled: !!productId,
    });

    const { data: clientes, isLoading: carregandoClientes } = useQuery({
        queryKey: ['clients'],
        queryFn: () => storageService.getClients(),
        staleTime: 1000 * 60 * 10,
        enabled: !!productId,
    });

    // Os cadastros que são a mesma peça somam o histórico: sem isto a análise
    // de preço trabalha com três amostras rasas em vez de uma utilizável.
    const { data: produtos } = useQuery({
        queryKey: ['products'],
        queryFn: () => storageService.getProducts(),
        staleTime: 1000 * 60 * 10,
        enabled: !!productId,
    });

    const vendas = useMemo(() => {
        if (!productId) return [];
        const nomePorId = new Map((clientes || []).map(c => [c.id, c.company_name]));
        const mapa = mapaDeCanonicos(produtos);
        return vendasDoProduto(
            (orcamentos || []) as any,
            productId,
            (id?: string) => (id && nomePorId.get(id)) || '—',
            excluirOrcamentoId,
            (id: string) => canonico(id, mapa),
        );
    }, [orcamentos, clientes, produtos, productId, excluirOrcamentoId]);

    return { vendas, carregando: carregandoOrcamentos || carregandoClientes };
}
