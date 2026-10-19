import { comprasRepository, type PedidoParaSobra } from '../../repositories/comprasRepository';
import { previstoDoPedido, calcularSobras } from '../../utils/fabrica/compras';
import { apuracaoSeSemBanco } from '../../utils/fabrica/avisoDaEntrega';
import type { Apuracao } from '../../utils/fabrica/avisoDaEntrega';

/**
 * Calcula e grava a sobra de um pedido JÁ ENTREGUE (a RPC recusa o que não está 'Entregue').
 * Usado pelo Quadro (na entrega e no "Tentar de novo") e pela recuperação da Lista de compras.
 *
 * Toda leitura é à risca e acontece ANTES da RPC: se algo falhar, lança e a RPC não roda (ela
 * toma a trava do pedido; chamá-la com sobra vazia por causa de leitura falha o travaria em zero).
 */
export async function apurarSobrasDoPedido(order: PedidoParaSobra): Promise<Apuracao> {
    const itens = order.items || [];
    const [vinculado, fichas, insumos] = await Promise.all([
        comprasRepository.vinculadoAoPedido(order.id),
        comprasRepository.fichasDoPedidoEstrito(itens.map(i => i.product_id)),
        comprasRepository.insumosParaSobra(),   // só id, nome, unidade e categoria (sem custo: roda na sessão da fábrica)
    ]);
    // Sem a função no banco (SQL não rodado): o mesmo desfecho de faltar apurar_sobras_do_pedido, sem tentar de novo.
    const semBanco = apuracaoSeSemBanco(vinculado);
    if (semBanco) return semBanco;
    const ins = new Map(insumos.map(i => [i.id, { id: i.id, name: i.name, unit: i.unit, current_stock: 0, average_unit_cost: 0, category: i.category }]));
    const previsto = previstoDoPedido({
        id: order.id, order_number: order.order_number, deadline: order.deadline,
        items: itens.map(i => ({ product_id: i.product_id, quantity: Number(i.quantity) || 0, fabric_insumo_id: i.fabric_insumo_id })),
    }, fichas, ins);
    const sobras = calcularSobras(vinculado!, previsto);
    const r = await comprasRepository.apurarSobras(order.id, sobras);
    if (r === null) return { semBanco: true };
    return {
        jaFeita: r.jaFeita,
        sobras: sobras.map(x => ({ nome: ins.get(x.insumo_id)?.name ?? 'insumo', unidade: ins.get(x.insumo_id)?.unit ?? '', quantidade: x.quantidade })),
    };
}
