/**
 * Contrato recorrente — v1.
 *
 * A CASA NÃO TRABALHA COM ISSO AINDA. Esta primeira versão existe para dar uma
 * forma concreta à ideia e permitir discutir em cima de algo, não para fechar o
 * desenho. O que está aqui é o mínimo que responde às perguntas que aparecem
 * primeiro numa conversa de contrato:
 *
 *   "quantas peças por mês?"  → grade fixa por período
 *   "por quanto?"             → preço travado, que é o que o cliente compra
 *   "por quanto tempo?"       → número de ciclos
 *   "quanto isso vale?"       → total do contrato, à vista na proposta
 *
 * O QUE ELE AINDA NÃO FAZ, de propósito:
 *
 *  - não gera pedido sozinho. Um contrato que emite pedido sem alguém olhar
 *    entrega peça que ninguém conferiu, e o primeiro erro custa um lote.
 *  - não reajusta por índice. IGPM/IPCA exige série externa e uma política que
 *    a casa ainda não tem; o campo de reajuste anual em % cobre o combinado
 *    típico ("sobe 8% na renovação") sem inventar integração.
 *  - não controla saldo entregue contra contratado. Isso depende de amarrar
 *    pedido a contrato, e amarrar antes de saber se o formato serve produziria
 *    dado órfão.
 *
 * A proposta de valor para o cliente é o preço travado; para a casa, é a
 * previsibilidade de carga na fábrica — saber que 300 peças entram em março
 * muda a compra de tecido e o planejamento do PCP.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export type Periodicidade = 'mensal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';

/** Quantos meses cada periodicidade avança. */
export const MESES_DA_PERIODICIDADE: Record<Periodicidade, number> = {
    mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12,
};

export const ROTULO_PERIODICIDADE: Record<Periodicidade, string> = {
    mensal: 'Mensal', bimestral: 'A cada 2 meses', trimestral: 'Trimestral',
    semestral: 'Semestral', anual: 'Anual',
};

export interface ItemDoContrato {
    produto: string;
    /** Peças por ciclo — não no contrato inteiro. */
    quantidade: number;
    precoUnitario: number;
}

export interface ContratoRecorrente {
    id?: string;
    client_id: string;
    descricao?: string;
    periodicidade: Periodicidade;
    /** aaaa-mm-dd da primeira entrega. */
    inicio: string;
    /** Quantas entregas no total. */
    ciclos: number;
    itens: ItemDoContrato[];
    /** % aplicado a cada 12 meses, quando combinado. */
    reajusteAnualPct?: number;
    observacoes?: string;
}

const centavos = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Soma de um ciclo — o que o cliente paga por entrega. */
export function valorDoCiclo(itens: ItemDoContrato[]): number {
    return centavos((itens || []).reduce(
        (s, i) => s + (Number(i.quantidade) || 0) * (Number(i.precoUnitario) || 0), 0));
}

/** Peças por ciclo — o que a fábrica precisa reservar de capacidade. */
export function pecasDoCiclo(itens: ItemDoContrato[]): number {
    return (itens || []).reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
}

/** Avança meses preservando o fim de mês (31/01 + 1 mês = 28/02, não 03/03). */
function somarMeses(iso: string, meses: number): string {
    const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
    if (!a || !m || !d) return iso;
    const total = a * 12 + (m - 1) + meses;
    const novoA = Math.floor(total / 12);
    const novoM = (total % 12) + 1;
    const diasNoMes = new Date(novoA, novoM, 0).getDate();
    const dia = Math.min(d, diasNoMes);
    return `${novoA}-${String(novoM).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export interface EntregaPrevista {
    /** 1-based: a primeira entrega é o ciclo 1. */
    ciclo: number;
    data: string;
    pecas: number;
    valor: number;
    /** true quando o reajuste anual já entrou neste ciclo. */
    reajustado: boolean;
}

/**
 * O calendário do contrato, ciclo a ciclo.
 *
 * Devolver a agenda inteira em vez de só o total é o que torna o contrato útil
 * para o PCP: dá para ver que em março entram 300 peças e comprar o tecido
 * antes, que é metade do valor da recorrência para a casa.
 *
 * O reajuste entra a cada 12 meses contados do início, e não "todo ano-calendário":
 * um contrato que começa em setembro reajusta em setembro.
 */
export function agendaDoContrato(contrato: ContratoRecorrente): EntregaPrevista[] {
    const passo = MESES_DA_PERIODICIDADE[contrato.periodicidade] || 1;
    const base = valorDoCiclo(contrato.itens);
    const pecas = pecasDoCiclo(contrato.itens);
    const reajuste = Number(contrato.reajusteAnualPct) || 0;

    const agenda: EntregaPrevista[] = [];
    for (let i = 0; i < Math.max(0, contrato.ciclos); i++) {
        const mesesDecorridos = i * passo;
        const anos = Math.floor(mesesDecorridos / 12);
        const fator = reajuste ? Math.pow(1 + reajuste / 100, anos) : 1;
        agenda.push({
            ciclo: i + 1,
            data: somarMeses(contrato.inicio, mesesDecorridos),
            pecas,
            valor: centavos(base * fator),
            reajustado: anos > 0,
        });
    }
    return agenda;
}

export interface ResumoDoContrato {
    valorDoCiclo: number;
    pecasPorCiclo: number;
    /** Soma de todos os ciclos, já com reajuste — o tamanho do compromisso. */
    valorTotal: number;
    pecasTotais: number;
    primeiraEntrega?: string;
    ultimaEntrega?: string;
    /** Duração em meses, do primeiro ao último ciclo. */
    duracaoMeses: number;
}

export function resumirContrato(contrato: ContratoRecorrente): ResumoDoContrato {
    const agenda = agendaDoContrato(contrato);
    const passo = MESES_DA_PERIODICIDADE[contrato.periodicidade] || 1;
    return {
        valorDoCiclo: valorDoCiclo(contrato.itens),
        pecasPorCiclo: pecasDoCiclo(contrato.itens),
        valorTotal: centavos(agenda.reduce((s, e) => s + e.valor, 0)),
        pecasTotais: agenda.reduce((s, e) => s + e.pecas, 0),
        primeiraEntrega: agenda[0]?.data,
        ultimaEntrega: agenda[agenda.length - 1]?.data,
        duracaoMeses: Math.max(0, agenda.length - 1) * passo,
    };
}

/**
 * Sugere um contrato a partir do que o cliente já compra.
 *
 * O melhor argumento de contrato não é uma proposta genérica: é mostrar ao
 * cliente o que ele JÁ pede, no ritmo em que já pede, com o preço travado. Por
 * isso a sugestão sai do histórico e não de um formulário em branco.
 *
 * A periodicidade vem do intervalo médio entre pedidos, arredondada para a
 * régua comercial mais próxima — ninguém assina "a cada 47 dias".
 */
export function sugerirContrato(
    clientId: string,
    intervaloMedioDias: number | null,
    pecas: { produto: string; quantidadeOrcada: number; aparicoes: number; precoMedio: number }[],
    inicio: string,
): ContratoRecorrente | null {
    const candidatas = (pecas || []).filter(p => p.precoMedio > 0 && p.quantidadeOrcada > 0);
    if (candidatas.length === 0) return null;

    let periodicidade: Periodicidade = 'mensal';
    if (intervaloMedioDias !== null) {
        if (intervaloMedioDias > 270) periodicidade = 'anual';
        else if (intervaloMedioDias > 135) periodicidade = 'semestral';
        else if (intervaloMedioDias > 75) periodicidade = 'trimestral';
        else if (intervaloMedioDias > 45) periodicidade = 'bimestral';
    }

    return {
        client_id: clientId,
        descricao: 'Contrato sugerido pelo histórico',
        periodicidade,
        inicio,
        ciclos: 12,
        // Quantidade por ciclo = média por aparição, não o total histórico: o
        // total somaria anos de compra num único ciclo e proporia um contrato
        // impossível de cumprir.
        itens: candidatas.slice(0, 5).map(p => ({
            produto: p.produto,
            quantidade: Math.max(1, Math.round(p.quantidadeOrcada / Math.max(1, p.aparicoes))),
            precoUnitario: p.precoMedio,
        })),
    };
}
