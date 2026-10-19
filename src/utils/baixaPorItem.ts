// PCP — saldo de produção POR ITEM do pedido. Sem imports, testado direto.
//
// O saldo por pedido responde "faltam 40 peças", mas não "de quê". Numa
// entrega parcial isso não basta: do hospital saem algumas polos azul claro,
// poucas azul escuro e nenhuma calça — e quem recebe precisa saber exatamente
// o que já foi e o que ficou.
//
// Como o item é identificado: os itens do pedido são JSON dentro do pedido, sem
// id próprio. A identidade usada é produto + cor + tamanho, que é o que
// distingue uma linha da outra na prática. Índice seria mais simples e mais
// errado: basta alguém reordenar os itens para as baixas passadas apontarem
// para a peça errada — e o log é imutável, então o erro seria permanente.

export interface ItemDoPedido {
    product_id?: string;
    product_name?: string;
    color?: string;
    size?: string;
    quantity?: number;
}

export interface LogDeItem {
    item_key?: string | null;
    qty_done?: number;
    qty_expedited?: number;
}

export interface SaldoItem {
    chave: string;
    produto: string;
    cor: string;
    tamanho: string;
    total: number;
    feito: number;
    expedido: number;
    resta: number;
    pct: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Identidade da linha do pedido. Cor e tamanho entram em caixa alta porque
 * "Azul Claro" e "AZUL CLARO" são a mesma peça na prateleira.
 */
export function chaveDoItem(it: ItemDoPedido): string {
    return [
        it.product_id || '',
        (it.color || '').trim().toUpperCase(),
        (it.size || '').trim().toUpperCase(),
    ].join('|');
}

/**
 * Saldo de cada item do pedido, cruzando com as baixas já lançadas.
 *
 * Itens com a mesma chave (mesma peça repetida em duas linhas do pedido) são
 * somados numa só: para o chão de fábrica são a mesma coisa, e separá-los
 * obrigaria a escolher arbitrariamente em qual das duas lançar a baixa.
 *
 * Baixas antigas, lançadas antes de existir baixa por item, têm `item_key`
 * vazia. Elas contam no total do pedido mas não são atribuídas a nenhuma
 * linha — ver `feitoSemItem`.
 */
export function saldoPorItem(itens: ItemDoPedido[], logs: LogDeItem[]): SaldoItem[] {
    const feitoPorChave = new Map<string, number>();
    const expPorChave = new Map<string, number>();
    for (const l of logs) {
        if (!l.item_key) continue;
        feitoPorChave.set(l.item_key, (feitoPorChave.get(l.item_key) || 0) + (Number(l.qty_done) || 0));
        expPorChave.set(l.item_key, (expPorChave.get(l.item_key) || 0) + (Number(l.qty_expedited) || 0));
    }

    const agregado = new Map<string, SaldoItem>();
    for (const it of itens || []) {
        const chave = chaveDoItem(it);
        const existente = agregado.get(chave);
        if (existente) {
            existente.total += Number(it.quantity) || 0;
            continue;
        }
        agregado.set(chave, {
            chave,
            produto: it.product_name || '—',
            cor: it.color || '',
            tamanho: it.size || '',
            total: Number(it.quantity) || 0,
            feito: 0, expedido: 0, resta: 0, pct: 0,
        });
    }

    for (const s of agregado.values()) {
        s.feito = feitoPorChave.get(s.chave) || 0;
        s.expedido = expPorChave.get(s.chave) || 0;
        s.resta = Math.max(0, round1(s.total - s.feito));
        s.pct = s.total > 0 ? round1((s.feito / s.total) * 100) : 0;
    }
    return [...agregado.values()];
}

/**
 * Quanto já foi baixado sem dizer de qual item.
 *
 * São as baixas anteriores a esta funcionalidade. Mostrar isso separado evita a
 * conta não fechar na tela sem explicação: o pedido pode ter 30 peças prontas
 * enquanto a soma por item dá 10, e a diferença tem nome.
 */
export function feitoSemItem(logs: LogDeItem[]): number {
    return round1(logs
        .filter(l => !l.item_key)
        .reduce((s, l) => s + (Number(l.qty_done) || 0), 0));
}
