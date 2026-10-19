// Métricas de entrega, atraso e tempo de fábrica. Sem imports, testado direto.
//
// LIMITE DO DADO — leia antes de confiar em qualquer número daqui.
//
// O pedido NÃO guarda data de entrega real. Tem `deadline` (o prometido) e
// `status`, mas nada que diga em que dia a peça saiu. `updated_at` não serve:
// muda a cada edição do pedido, então um pedido entregue em março e corrigido
// em julho pareceria entregue em julho.
//
// A única data confiável de saída é o log de expedição (`qty_expedited` com
// `logged_at`). Por isso pedido sem expedição lançada NÃO entra no cálculo de
// pontualidade — fica de fora e é contado à parte. A alternativa seria supor
// que saiu no prazo, o que inventaria uma pontualidade melhor que a real; um
// indicador de pontualidade que mente para cima é pior que não ter indicador.

export interface LogDeProducao {
    order_id: string;
    qty_done?: number;
    qty_expedited?: number;
    logged_at?: string;
    item_key?: string | null;
}

export interface PedidoParaMetrica {
    id: string;
    order_number: string;
    client_id?: string;
    created_at?: string;
    deadline?: string;
    status?: string;
    items?: { product_name?: string; quantity?: number }[];
}

const DIA_MS = 86_400_000;

/** Diferença em dias corridos entre duas datas ISO. Null se faltar alguma. */
export function diasEntre(inicio?: string, fim?: string): number | null {
    if (!inicio || !fim) return null;
    const a = Date.parse(inicio);
    const b = Date.parse(fim);
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.round((b - a) / DIA_MS);
}

export interface EntregaDoPedido {
    order_id: string;
    pedido: string;
    /** Data em que a última peça foi expedida. */
    entregueEm: string;
    prazo?: string;
    /** Positivo = atrasou; negativo = adiantou; 0 = no dia. */
    diasDeAtraso: number | null;
    /** Dias entre a abertura do pedido e a saída da última peça. */
    diasNaFabrica: number | null;
    pecas: number;
}

const totalDePecas = (p: PedidoParaMetrica) =>
    (p.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);

/**
 * Pedidos que têm expedição lançada, com atraso e tempo de fábrica.
 *
 * A data de entrega é a do ÚLTIMO log com expedição — a peça final saindo é o
 * que fecha o pedido. Entregas parciais anteriores não contam como entrega:
 * o cliente só recebeu tudo no último dia.
 */
export function entregasApuradas(
    pedidos: PedidoParaMetrica[],
    logs: LogDeProducao[],
): EntregaDoPedido[] {
    const ultimaExpedicao = new Map<string, string>();
    for (const l of logs) {
        if (!l.logged_at || !(Number(l.qty_expedited) > 0)) continue;
        const atual = ultimaExpedicao.get(l.order_id);
        if (!atual || l.logged_at > atual) ultimaExpedicao.set(l.order_id, l.logged_at);
    }

    const saida: EntregaDoPedido[] = [];
    for (const p of pedidos) {
        const entregueEm = ultimaExpedicao.get(p.id);
        if (!entregueEm) continue;
        saida.push({
            order_id: p.id,
            pedido: p.order_number,
            entregueEm,
            prazo: p.deadline,
            // O prazo é uma data sem hora; comparar com o instante do log daria
            // "1 dia de atraso" para quem saiu às 14h do próprio dia prometido.
            diasDeAtraso: p.deadline ? diasEntre(p.deadline, entregueEm.slice(0, 10)) : null,
            diasNaFabrica: diasEntre(p.created_at, entregueEm),
            pecas: totalDePecas(p),
        });
    }
    return saida;
}

export interface ResumoDePontualidade {
    /** Pedidos com expedição lançada — a base do cálculo. */
    apurados: number;
    /** Pedidos sem expedição: não dá para dizer se atrasaram. */
    semDadoDeEntrega: number;
    noPrazo: number;
    atrasados: number;
    /** % no prazo sobre os APURADOS, não sobre o total. */
    pctNoPrazo: number;
    /** Média de dias de atraso, contando só quem atrasou. */
    atrasoMedioDias: number;
    piorAtrasoDias: number;
    /** Dias entre abrir o pedido e a última peça sair. */
    tempoMedioNaFabricaDias: number;
}

const media = (ns: number[]) =>
    ns.length === 0 ? 0 : Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 10) / 10;

export function resumirPontualidade(
    pedidos: PedidoParaMetrica[],
    logs: LogDeProducao[],
): ResumoDePontualidade {
    const entregas = entregasApuradas(pedidos, logs);
    const comPrazo = entregas.filter(e => e.diasDeAtraso !== null);
    const atrasos = comPrazo.filter(e => (e.diasDeAtraso as number) > 0);
    const naFabrica = entregas.map(e => e.diasNaFabrica).filter((d): d is number => d !== null);

    return {
        apurados: comPrazo.length,
        semDadoDeEntrega: pedidos.length - entregas.length,
        noPrazo: comPrazo.length - atrasos.length,
        atrasados: atrasos.length,
        pctNoPrazo: comPrazo.length === 0 ? 0
            : Math.round(((comPrazo.length - atrasos.length) / comPrazo.length) * 1000) / 10,
        atrasoMedioDias: media(atrasos.map(e => e.diasDeAtraso as number)),
        piorAtrasoDias: atrasos.reduce((m, e) => Math.max(m, e.diasDeAtraso as number), 0),
        tempoMedioNaFabricaDias: media(naFabrica),
    };
}

export interface RitmoDeProducao {
    /** Peças baixadas no período. */
    pecas: number;
    /** Dias corridos entre o primeiro e o último lançamento. */
    dias: number;
    /** Peças por dia. */
    pecasPorDia: number;
    /** Dias que uma peça leva, em média (o inverso). */
    diasPorPeca: number;
}

/**
 * Ritmo da fábrica: quantas peças saem por dia.
 *
 * Conta dias CORRIDOS entre o primeiro e o último lançamento, não dias úteis
 * nem só os dias com registro. Contar só os dias trabalhados daria um ritmo
 * inflado, que não serve para prometer prazo — o cliente espera em dias de
 * calendário, incluindo os dias em que a fábrica não produziu.
 */
export function ritmoDeProducao(logs: LogDeProducao[]): RitmoDeProducao {
    const comData = logs.filter(l => l.logged_at && (Number(l.qty_done) || 0) > 0);
    const pecas = comData.reduce((s, l) => s + (Number(l.qty_done) || 0), 0);
    if (comData.length === 0) return { pecas: 0, dias: 0, pecasPorDia: 0, diasPorPeca: 0 };

    const datas = comData.map(l => l.logged_at as string).sort();
    // +1 porque um único dia de produção é um dia, não zero.
    const dias = (diasEntre(datas[0].slice(0, 10), datas[datas.length - 1].slice(0, 10)) || 0) + 1;
    const pecasPorDia = Math.round((pecas / dias) * 10) / 10;

    return {
        pecas, dias, pecasPorDia,
        diasPorPeca: pecas > 0 ? Math.round((dias / pecas) * 100) / 100 : 0,
    };
}

export interface TempoPorTipoDePeca {
    /** produto|COR|TAMANHO, como gravado na baixa. */
    chave: string;
    rotulo: string;
    pecas: number;
    /** Dias entre a primeira e a última baixa daquela peça. */
    diasMedios: number;
    pedidos: number;
}

/**
 * Quanto tempo cada tipo de peça leva, a partir das baixas por item.
 *
 * Só enxerga baixas com `item_key` — as anteriores à Fase 3 não dizem de qual
 * peça eram. Enquanto o histórico novo não se acumula, esta lista vem curta ou
 * vazia, e isso é o certo: melhor vazia do que preenchida com estimativa.
 */
export function tempoPorTipoDePeca(logs: LogDeProducao[]): TempoPorTipoDePeca[] {
    const porChave = new Map<string, { pecas: number; pedidos: Set<string>; diasPorPedido: Map<string, string[]> }>();

    for (const l of logs) {
        if (!l.item_key || !l.logged_at) continue;
        let e = porChave.get(l.item_key);
        if (!e) { e = { pecas: 0, pedidos: new Set(), diasPorPedido: new Map() }; porChave.set(l.item_key, e); }
        e.pecas += Number(l.qty_done) || 0;
        e.pedidos.add(l.order_id);
        const datas = e.diasPorPedido.get(l.order_id) || [];
        datas.push(l.logged_at);
        e.diasPorPedido.set(l.order_id, datas);
    }

    const saida: TempoPorTipoDePeca[] = [];
    for (const [chave, e] of porChave) {
        const duracoes: number[] = [];
        for (const datas of e.diasPorPedido.values()) {
            const ord = [...datas].sort();
            duracoes.push((diasEntre(ord[0].slice(0, 10), ord[ord.length - 1].slice(0, 10)) || 0) + 1);
        }
        const [produto, cor, tamanho] = chave.split('|');
        saida.push({
            chave,
            rotulo: [produto, cor, tamanho].filter(Boolean).join(' · ') || chave,
            pecas: e.pecas,
            diasMedios: media(duracoes),
            pedidos: e.pedidos.size,
        });
    }
    return saida.sort((a, b) => b.pecas - a.pecas);
}

export interface AtrasoNoMes {
    /** aaaa-mm */
    chave: string;
    rotulo: string;
    /** Contagem de PEDIDOS. */
    noPrazo: number;
    atrasados: number;
    pctNoPrazo: number;
    /** Contagem de PEÇAS — o que a fábrica de fato entregou. Um pedido de 500
     *  peças e um de 3 pesam igual na contagem de pedidos, e muito diferente
     *  aqui; sem os dois números o mês parece bom ou ruim pelo motivo errado. */
    pecasNoPrazo: number;
    pecasAtrasadas: number;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Pontualidade mês a mês, pelo mês da ENTREGA (é quando o atraso acontece). */
export function pontualidadePorMes(
    pedidos: PedidoParaMetrica[],
    logs: LogDeProducao[],
): AtrasoNoMes[] {
    const porMes = new Map<string, { noPrazo: number; atrasados: number; pecasNoPrazo: number; pecasAtrasadas: number }>();
    for (const e of entregasApuradas(pedidos, logs)) {
        if (e.diasDeAtraso === null) continue;
        const mes = e.entregueEm.slice(0, 7);
        const m = porMes.get(mes) || { noPrazo: 0, atrasados: 0, pecasNoPrazo: 0, pecasAtrasadas: 0 };
        if (e.diasDeAtraso > 0) { m.atrasados++; m.pecasAtrasadas += e.pecas; }
        else { m.noPrazo++; m.pecasNoPrazo += e.pecas; }
        porMes.set(mes, m);
    }

    return [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([chave, m]) => {
        const total = m.noPrazo + m.atrasados;
        const [ano, mes] = chave.split('-');
        return {
            chave,
            rotulo: `${MESES[Number(mes) - 1]}/${ano.slice(2)}`,
            noPrazo: m.noPrazo,
            atrasados: m.atrasados,
            pctNoPrazo: total === 0 ? 0 : Math.round((m.noPrazo / total) * 1000) / 10,
            pecasNoPrazo: m.pecasNoPrazo,
            pecasAtrasadas: m.pecasAtrasadas,
        };
    });
}
