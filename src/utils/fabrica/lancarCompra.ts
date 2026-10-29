/**
 * Janela "Lançar compra" e lista "Compras desta semana": a conta do formulário
 * (itens divididos em partes por destino) e o agrupamento de uma compra gravada.
 * Puro: sem tela, sem banco.
 */
import { sugerirDivisao } from './compras.ts';
import { parseBRL } from '../currency.ts';
import { numero } from '../numeros.ts';

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** `destino` é o id do pedido; '' = estoque. Os números ficam como texto, como a pessoa digita. */
export interface ParteForm { destino: string; quantidade: string }
export interface ItemForm { insumoId: string; quantidade: string; custo: string; partes: ParteForm[] }

/** Divisão sugerida (pedidos na ordem da Lista, o resto para o estoque) já em texto de campo. */
export function partesSugeridas(quantidade: number, pedidos: { order_id: string; falta: number }[]): ParteForm[] {
    return sugerirDivisao(quantidade, pedidos.map(p => ({ pedidoId: p.order_id, falta: p.falta })))
        .map(p => ({ destino: p.pedidoId ?? '', quantidade: numero(p.quantidade) }));
}

export function somaDasPartes(it: ItemForm): number {
    return r3(it.partes.reduce((s, p) => s + parseBRL(p.quantidade), 0));
}

/** Primeiro problema do item, ou null se pode lançar. */
export function erroDoItem(it: ItemForm): string | null {
    const q = r3(parseBRL(it.quantidade));
    if (!it.insumoId) return 'Escolha o insumo';
    if (!(q > 0)) return 'Informe a quantidade';
    if (!(parseBRL(it.custo) > 0)) return 'Informe o custo unitário';
    if (it.partes.some(p => !(parseBRL(p.quantidade) > 0))) return 'Cada parte precisa de quantidade';
    if (somaDasPartes(it) !== q) return `As partes somam ${numero(somaDasPartes(it))}, a compra tem ${numero(q)}`;
    return null;
}

/** Uma linha de compra_itens por parte. */
export function itensParaLancar(itens: ItemForm[]): { insumo_id: string; quantidade: number; custo_unitario: number; pedido_id: string | null }[] {
    return itens.flatMap(it => it.partes.map(p => ({
        insumo_id: it.insumoId,
        quantidade: r3(parseBRL(p.quantidade)),
        custo_unitario: parseBRL(it.custo),
        pedido_id: p.destino || null,
    })));
}

/** Total da compra: quantidade × custo, somado e arredondado a centavo. */
export function totalDaCompra(itens: { quantidade: number | string; custo_unitario: number | string }[]): number {
    return round2(itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.custo_unitario), 0));
}

export interface InsumoDaCompra { insumo_id: string; destinos: { pedido_id: string | null; quantidade: number }[]; total: number }

/** Itens gravados agrupados por insumo (na ordem em que aparecem), cada destino somado: pedido ou estoque (null). */
export function agruparItensDaCompra(
    itens: { insumo_id: string; quantidade: number | string; pedido_id?: string | null }[],
): InsumoDaCompra[] {
    const grupos = new Map<string, InsumoDaCompra>();
    for (const i of itens) {
        const q = Number(i.quantidade);
        const g = grupos.get(i.insumo_id) ?? { insumo_id: i.insumo_id, destinos: [], total: 0 };
        const destino = g.destinos.find(d => d.pedido_id === (i.pedido_id ?? null));
        if (destino) destino.quantidade = r3(destino.quantidade + q);
        else g.destinos.push({ pedido_id: i.pedido_id ?? null, quantidade: r3(q) });
        g.total = r3(g.total + q);
        grupos.set(i.insumo_id, g);
    }
    return [...grupos.values()];
}

/** AAAA-MM-DD no relógio local (toISOString viraria o dia à noite no Brasil). */
export function diaLocal(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Segunda e domingo da semana de `ref`, como AAAA-MM-DD. */
export function semanaDe(ref: Date): { de: string; ate: string } {
    const seg = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - ((ref.getDay() + 6) % 7));
    const dom = new Date(seg.getFullYear(), seg.getMonth(), seg.getDate() + 6);
    return { de: diaLocal(seg), ate: diaLocal(dom) };
}

/** Mudar a quantidade só refaz a divisão se a pessoa ainda não mexeu nas partes; trocar o insumo sempre refaz. */
export function deveResugerir(mudou: 'insumo' | 'quantidade', partesEditadas: boolean): boolean {
    return mudou === 'insumo' || !partesEditadas;
}

/** Custo sugerido ao escolher o insumo: o médio dele ou vazio (nunca o custo do insumo anterior). */
/** O primeiro candidato positivo, na ordem dada (a tela passa: tabela verdade, custo médio). */
export function custoSugerido(...candidatos: (number | null | undefined)[]): string {
    const v = candidatos.find(c => c != null && c > 0);
    return v ? numero(v, 4) : '';
}
