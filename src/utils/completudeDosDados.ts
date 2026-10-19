/**
 * A completude a partir dos dados crus: pedidos, orçamentos, produtos, insumos e fichas.
 *
 * Painel de Produtos, fichário e fila do Início chamam ESTA função. Cada um montando a
 * sua versão daria três "N sem ficha" diferentes para a mesma pergunta.
 */
import { montarItensVendidos } from './itensVendidos.ts';
import type { PedidoVendido, OrcamentoRef } from './itensVendidos.ts';
import { mapaDeCanonicos as canonicosDeProduto } from './apelidosDeProduto.ts';
import type { ProdutoComApelido } from './apelidosDeProduto.ts';
import { mapaDeCanonicos as canonicosDeInsumo } from './apelidosDeInsumo.ts';
import type { InsumoComApelido } from './apelidosDeInsumo.ts';
import { apurarCompletude } from './completudeDoCadastro.ts';
import type { Completude, CadastroPesavel } from './completudeDoCadastro.ts';

export interface DadosDaCompletude {
    pedidos: PedidoVendido[];
    orcamentos: OrcamentoRef[];
    produtos: (CadastroPesavel & ProdutoComApelido)[];
    insumos: (CadastroPesavel & InsumoComApelido)[];
    fichaPorProduto: Map<string, string[]>;
}

export function completudeDosDados(d: DadosDaCompletude): Completude {
    // O nome do cliente não entra na completude: função fixa em vez de carregar clientes.
    const vendas = montarItensVendidos(d.pedidos, d.orcamentos, () => '—');
    return apurarCompletude({
        vendas: vendas.map(v => ({
            produtoId: v.produtoId,
            produtoNome: v.produto,
            tecidoId: v.tecidoId,
            quantidade: v.quantidade,
            faturamento: v.valorTotal,
            faturamentoConhecido: v.precoConhecido,
            order_id: v.order_id,
        })),
        produtos: d.produtos,
        insumos: d.insumos,
        fichaPorProduto: d.fichaPorProduto,
        canonicoDeInsumo: canonicosDeInsumo(d.insumos),
        canonicoDeProduto: canonicosDeProduto(d.produtos),
    });
}

/** Produtos sem ficha que já venderam: o N da linha "Cadastrar ficha técnica" do Início. */
export const produtosSemFichaQueVenderam = (c: Completude): number =>
    c.produtosSemFicha.filter(l => l.pecas > 0).length;
