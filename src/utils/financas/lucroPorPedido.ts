/**
 * Lucro por pedido (plano: docs/superpowers/plans/2026-10-17-lucro-por-pedido.md).
 *
 *   lucro = valor do pedido − material − mão de obra − imposto
 *
 *   Imposto      valor × alíquota do perfil da empresa (a mesma do custo da peça no orçamento). Não é o
 *                imposto PAGO no mês (esse é do mês da guia e o Resultado mostra); aqui a pergunta é quanto
 *                cada pedido deixou. Sem alíquota cadastrada: zero, e o resumo avisa.
 *
 *   Pedidos      os ENTREGUES no período (delivered_at): o mesmo critério do "Vendido" do Resultado.
 *   Mão de obra  folha do período ÷ peças entregues no período, × peças do pedido (rateio por peça,
 *                decisão do Luiz em 17/10). Folha por competência: contas a pagar não canceladas das
 *                categorias de folha com VENCIMENTO no período, pelo valor da conta. Pró-labore fica fora:
 *                é retirada dos sócios, não mão de obra da fábrica.
 *   Material     ficha técnica × peças × custo médio do insumo, com o tecido escolhido no item no lugar
 *                do tecido da ficha. No modelo de compras por pedido o que sobra volta ao estoque, então o
 *                consumido é o da ficha — para pedido novo e para o antigo.
 *                Preço, nesta ordem: o que ESTE pedido pagou (compras e usos do estoque vinculados a ele),
 *                o custo de referência da tabela verdade (v3.1: tabela para prever, pago para apurar),
 *                o último preço pago pelo insumo, o custo médio. Compra vinculada não passa pelo estoque e
 *                não atualiza o custo médio: sem as duas primeiras, tecido comprado só para pedido nunca
 *                teria preço. Produto sem ficha com algo vinculado: o vinculado inteiro conta como gasto,
 *                como na apuração da sobra (resposta 6 do desenho de compras).
 *
 * Ausência é informação (como em custoDaPeca): produto sem ficha ou insumo sem custo deixam o material
 * incompleto e o lucro vira um TETO; nunca um zero que finge ser custo.
 * Sem imports do app, para testar direto com `node --test`.
 */
import { centavos } from './base.ts';
import type { ContaResumo } from './base.ts';
import { previstoDoPedido } from '../fabrica/compras.ts';
import type { PLBomLine, PLInsumo, PLOrder } from '../purchaseList.ts';
import type { CustoVinculado } from '../fabrica/vinculado.ts';

/** De onde veio o preço do material: o que o pedido pagou, a tabela verdade (v3.1), a última compra, o custo médio. */
export type OrigemDoPreco = 'compra do pedido' | 'tabela' | 'última compra' | 'custo médio';

/** Sem acento, minúsculo, espaços simples: "Folha - 13º" e "folha - 13o" são a mesma categoria. */
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/º/g, 'o')
    .toLowerCase().replace(/\s+/g, ' ').trim();

/** Árvore nova (limpeza de 15/10) e os nomes antigos que ainda podem existir. */
const CATEGORIAS_DE_FOLHA = new Set([
    'salarios', 'inss', 'fgts', '13o salario',
    'folha - salarios', 'folha - inss', 'folha - fgts', 'folha - 13o', 'folha de pagamento',
].map(normalizar));

export function ehCategoriaDeFolha(categoria: string | null | undefined): boolean {
    return !!categoria && CATEGORIAS_DE_FOLHA.has(normalizar(categoria));
}

/** Folha por competência: a pagar, não cancelada, categoria de folha, vencimento nos meses dados. */
export function folhaDoPeriodo(contas: ContaResumo[], meses: string[]): number {
    const noPeriodo = new Set(meses);
    return centavos(contas
        .filter(c => c.type === 'payable' && c.derived_status !== 'cancelled'
            && ehCategoriaDeFolha(c.category) && noPeriodo.has((c.due_date ?? '').slice(0, 7)))
        .reduce((s, c) => s + (Number(c.original_amount) || 0), 0));
}

export interface PedidoParaLucro extends PLOrder {
    client_id?: string | null;
    status: string;
    delivered_at?: string | null;
    total_amount: number;
}

export interface LinhaDeLucro {
    id: string;
    numero: string;
    clienteId: string | null;
    entregueEm: string;
    pecas: number;
    valor: number;
    material: number;
    maoDeObra: number;
    imposto: number;
    lucro: number;
    /** % sobre o valor do pedido; null quando o pedido não tem valor. */
    margem: number | null;
    /** Vazio = conta completa. Com algo, material está incompleto e o lucro é um teto. */
    faltas: string[];
    /** De onde vieram os preços do material, na ordem da fila. */
    origens: OrigemDoPreco[];
    completo: boolean;
}

export interface ResumoDoLucro {
    folha: number;
    pecas: number;
    /** null quando não houve peça entregue: não há por onde repartir. */
    maoDeObraPorPeca: number | null;
    /** Houve entrega no período e nenhuma conta de folha: o lucro sai sem mão de obra. */
    semFolha: boolean;
    /** Sem alíquota no perfil: o lucro sai sem imposto. */
    semAliquota: boolean;
    valor: number;
    material: number;
    maoDeObra: number;
    imposto: number;
    lucro: number;
    pedidosIncompletos: number;
}

const pecasDo = (p: PLOrder) => (p.items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);

export function lucroPorPedido(e: {
    pedidos: PedidoParaLucro[];
    contas: ContaResumo[];
    fichas: Map<string, PLBomLine[]>;
    insumos: Map<string, PLInsumo>;
    meses: string[];
    /** Por pedido e insumo: quanto foi vinculado e quanto custou (somarCustoVinculado). */
    vinculado?: Map<string, Map<string, CustoVinculado>>;
    /** Por insumo: o último preço pago em compra (ultimoPrecoPorInsumo). */
    ultimoPreco?: Map<string, number>;
    /** Por insumo: custo de referência da tabela verdade (mapaDeReferencia). Vem antes da última compra. */
    referencia?: Map<string, number>;
    /** Alíquota sobre a venda, 0..1 (o perfil guarda em %: dividir por 100 antes). */
    aliquota?: number | null;
}): { resumo: ResumoDoLucro; linhas: LinhaDeLucro[] } {
    const ORDEM: OrigemDoPreco[] = ['compra do pedido', 'tabela', 'última compra', 'custo médio'];
    const noPeriodo = new Set(e.meses);
    const entregues = e.pedidos.filter(p => p.status === 'Entregue' && noPeriodo.has((p.delivered_at ?? '').slice(0, 7)));
    const folha = folhaDoPeriodo(e.contas, e.meses);
    const pecas = entregues.reduce((s, p) => s + pecasDo(p), 0);
    const porPeca = pecas > 0 ? folha / pecas : null;
    const taxa = Number(e.aliquota) > 0 ? Number(e.aliquota) : 0;

    const linhas: LinhaDeLucro[] = entregues.map(p => {
        const previsto = previstoDoPedido(p, e.fichas, e.insumos);
        const vinc = e.vinculado?.get(p.id) ?? new Map<string, CustoVinculado>();
        const faltas: string[] = [];
        const origens = new Set<OrigemDoPreco>();
        // Sem ficha e com vínculo, não houve sobra: tudo o que foi vinculado foi gasto.
        const gastoIntegral = previsto.semFicha && vinc.size > 0;
        if (previsto.semFicha && !gastoIntegral) faltas.push('produto sem ficha técnica');
        const consumo = new Map(previsto.porInsumo);
        if (gastoIntegral) for (const [id, v] of vinc) consumo.set(id, Math.max(consumo.get(id) ?? 0, v.quantidade));

        let material = 0;
        for (const [insumoId, quantidade] of consumo) {
            const ins = e.insumos.get(insumoId);
            let resta = quantidade;
            const v = vinc.get(insumoId);
            if (v && v.quantidade > 0 && v.valor > 0) {
                const q = Math.min(resta, v.quantidade);
                material += q * (v.valor / v.quantidade);
                resta -= q;
                origens.add('compra do pedido');
            }
            if (resta <= 0) continue;
            const tabela = e.referencia?.get(insumoId) ?? 0;
            if (tabela > 0) { material += resta * tabela; origens.add('tabela'); continue; }
            const ultimo = e.ultimoPreco?.get(insumoId) ?? 0;
            const medio = Number(ins?.average_unit_cost) || 0;
            if (ultimo > 0) { material += resta * ultimo; origens.add('última compra'); continue; }
            if (medio > 0) { material += resta * medio; origens.add('custo médio'); continue; }
            const falta = ins ? `insumo sem custo: ${ins.name}` : 'insumo sem cadastro';
            if (!faltas.includes(falta)) faltas.push(falta);
        }
        const n = pecasDo(p);
        const valor = centavos(Number(p.total_amount) || 0);
        const maoDeObra = centavos(porPeca === null ? 0 : n * porPeca);
        const imposto = centavos(valor * taxa);
        const lucro = centavos(valor - centavos(material) - maoDeObra - imposto);
        return {
            id: p.id,
            numero: p.order_number,
            clienteId: p.client_id ?? null,
            entregueEm: (p.delivered_at ?? '').slice(0, 10),
            pecas: n,
            valor,
            material: centavos(material),
            maoDeObra,
            imposto,
            lucro,
            margem: valor > 0 ? centavos((lucro / valor) * 100) : null,
            faltas,
            origens: ORDEM.filter(o => origens.has(o)),
            completo: faltas.length === 0,
        };
    });

    // Pior margem primeiro: a lista existe para mostrar o pedido que não se pagou.
    linhas.sort((a, b) => (a.margem ?? Infinity) - (b.margem ?? Infinity) || a.lucro - b.lucro);

    const soma = (k: 'valor' | 'material' | 'maoDeObra' | 'imposto' | 'lucro') => centavos(linhas.reduce((s, l) => s + l[k], 0));
    return {
        resumo: {
            folha,
            pecas,
            maoDeObraPorPeca: porPeca === null ? null : centavos(porPeca),
            semFolha: entregues.length > 0 && folha === 0,
            semAliquota: taxa === 0,
            valor: soma('valor'),
            material: soma('material'),
            maoDeObra: soma('maoDeObra'),
            imposto: soma('imposto'),
            lucro: soma('lucro'),
            pedidosIncompletos: linhas.filter(l => !l.completo).length,
        },
        linhas,
    };
}
