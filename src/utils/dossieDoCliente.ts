/**
 * O que a casa sabe sobre um cliente, reunido num lugar só.
 *
 * A informação existia toda, espalhada: orçamento em Orçamentos, pedido em
 * Pedidos, conta em Financeiro, entrega no log do PCP. Para responder "como
 * está esse cliente?" era preciso abrir quatro telas e cruzar de cabeça — e
 * ninguém faz isso no meio de uma ligação.
 *
 * Aqui só se JUNTA e se CONTA. Nada é buscado: quem chama passa as listas que
 * a tela já carregou, o que mantém esta função pura e testável, e evita quatro
 * requisições novas para dados que já estavam na memória.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

import { situacaoDaConta } from './financas/situacao.ts';

export interface ItemDoOrcamento {
    product_id?: string;
    product_name?: string;
    quantity?: number;
    unit_price?: number;
}

export interface OrcamentoDoCliente {
    id: string;
    client_id?: string;
    serial_number?: string;
    date?: string;
    total_amount?: number;
    status?: string;
    generated_order_number?: string;
    items?: ItemDoOrcamento[];
    reference_photos?: string[];
}

export interface PedidoDoCliente {
    id: string;
    client_id?: string;
    order_number?: string;
    created_at?: string;
    deadline?: string;
    total_amount?: number;
    amount_paid?: number;
    status?: string;
}

export interface ContaDoCliente {
    id: string;
    client_id?: string;
    type?: string;
    description?: string;
    due_date?: string;
    original_amount?: number;
    paid_amount?: number;
    remaining_amount?: number;
    derived_status?: string;
    cancelled_at?: string | null;
    awaiting_delivery?: boolean | null;
}

const soma = (ns: (number | undefined)[]) =>
    Math.round(ns.reduce<number>((s, n) => s + (Number(n) || 0), 0) * 100) / 100;

const porDataDesc = (a?: string, b?: string) => (b || '').localeCompare(a || '');

/** Orçamento que virou pedido, ou foi aprovado — o que de fato fechou. */
export const ORCAMENTO_FECHADO = ['Approved', 'Converted'];

export interface PecaDoCliente {
    produto: string;
    /** Quantas peças já foram ORÇADAS, somando todos os orçamentos. */
    quantidadeOrcada: number;
    /** Quantas peças em orçamento que FECHOU. */
    quantidadeFechada: number;
    /** Em quantos orçamentos distintos ela apareceu. */
    aparicoes: number;
    /** Média ponderada pela quantidade — 500 peças a R$ 40 pesam mais que 2 a R$ 90. */
    precoMedio: number;
    ultimoPreco: number;
    ultimaData: string;
}

/**
 * O que este cliente compra, e por quanto.
 *
 * Ponderado pela quantidade e não pela média simples: o pedido grande é que
 * define o preço que a relação pratica, e uma amostra de 2 peças a preço cheio
 * puxaria a média para um valor que nunca se repete.
 *
 * Conta o ORÇADO, não só o fechado, porque a pergunta na hora de orçar de novo
 * é "por quanto eu costumo oferecer isto para ele" — e o que não fechou também
 * ensina, contanto que a coluna do fechado esteja ao lado para comparação.
 */
export function pecasDoCliente(orcamentos: OrcamentoDoCliente[]): PecaDoCliente[] {
    const porProduto = new Map<string, {
        qtdOrcada: number; qtdFechada: number; aparicoes: number;
        somaValor: number; somaQtd: number; ultimoPreco: number; ultimaData: string;
    }>();

    // Do mais antigo para o mais novo, para "último preço" acabar sendo o último.
    const emOrdem = [...orcamentos].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    for (const o of emOrdem) {
        const fechado = ORCAMENTO_FECHADO.includes(o.status || '');
        for (const it of o.items || []) {
            const nome = (it.product_name || '').trim();
            if (!nome) continue;
            const qtd = Number(it.quantity) || 0;
            const preco = Number(it.unit_price) || 0;

            const atual = porProduto.get(nome) || {
                qtdOrcada: 0, qtdFechada: 0, aparicoes: 0,
                somaValor: 0, somaQtd: 0, ultimoPreco: 0, ultimaData: '',
            };
            atual.qtdOrcada += qtd;
            if (fechado) atual.qtdFechada += qtd;
            atual.aparicoes += 1;
            // Linha sem preço não entra na média: entraria como "vendi por
            // zero" e derrubaria o preço médio do produto.
            if (preco > 0) {
                atual.somaValor += preco * (qtd || 1);
                atual.somaQtd += (qtd || 1);
                atual.ultimoPreco = preco;
                atual.ultimaData = o.date || atual.ultimaData;
            }
            porProduto.set(nome, atual);
        }
    }

    return [...porProduto.entries()]
        .map(([produto, x]) => ({
            produto,
            quantidadeOrcada: x.qtdOrcada,
            quantidadeFechada: x.qtdFechada,
            aparicoes: x.aparicoes,
            precoMedio: x.somaQtd > 0 ? Math.round((x.somaValor / x.somaQtd) * 100) / 100 : 0,
            ultimoPreco: x.ultimoPreco,
            ultimaData: x.ultimaData,
        }))
        // Mais pedido primeiro: é o que define a relação com este cliente.
        .sort((a, b) => b.quantidadeOrcada - a.quantidadeOrcada || a.produto.localeCompare(b.produto, 'pt-BR'));
}

export interface MesDoCliente {
    /** aaaa-mm */
    mes: string;
    pedidos: number;
    valor: number;
}

/** Pedidos por mês, do mais antigo ao mais recente — a série do gráfico. */
export function pedidosPorMes(pedidos: PedidoDoCliente[]): MesDoCliente[] {
    const porMes = new Map<string, { pedidos: number; valor: number }>();
    for (const p of pedidos) {
        const mes = (p.created_at || '').slice(0, 7);
        if (!mes) continue;
        const atual = porMes.get(mes) || { pedidos: 0, valor: 0 };
        atual.pedidos += 1;
        atual.valor += Number(p.total_amount) || 0;
        porMes.set(mes, atual);
    }
    return [...porMes.entries()]
        .map(([mes, x]) => ({ mes, pedidos: x.pedidos, valor: Math.round(x.valor * 100) / 100 }))
        .sort((a, b) => a.mes.localeCompare(b.mes));
}

export interface PadraoDePedidos {
    /** Dias entre um pedido e o seguinte, na média. */
    intervaloMedioDias: number | null;
    /** O maior e o menor intervalo — a régua da confiança da previsão. */
    menorIntervalo: number | null;
    maiorIntervalo: number | null;
    /** aaaa-mm-dd estimado do próximo pedido. */
    proximoPedidoEstimado: string | null;
    /** Dias desde o último pedido. Acima do intervalo médio, está atrasado. */
    diasDesdeUltimo: number | null;
    /** true quando já passou do intervalo típico — hora de procurar o cliente. */
    atrasado: boolean;
    /** Quantos intervalos sustentam a estimativa. */
    baseDeCalculo: number;
}

const DIA_MS = 86_400_000;
const soDia = (iso?: string) => (iso || '').slice(0, 10);

/**
 * O ritmo de compra deste cliente, e quando ele deveria voltar.
 *
 * Média simples dos intervalos, e a faixa (menor/maior) ao lado: com dois ou
 * três pedidos a média sozinha sugere uma precisão que não existe, e mostrar a
 * dispersão é o que impede alguém de tratar a estimativa como compromisso.
 *
 * Menos de dois pedidos não gera previsão — um pedido não é um padrão, é um
 * evento, e chutar a partir dele daria uma data com cara de informação.
 */
export function padraoDePedidos(pedidos: PedidoDoCliente[], hoje: string): PadraoDePedidos {
    const datas = pedidos
        .map(p => soDia(p.created_at))
        .filter(Boolean)
        .sort();

    const vazio: PadraoDePedidos = {
        intervaloMedioDias: null, menorIntervalo: null, maiorIntervalo: null,
        proximoPedidoEstimado: null, diasDesdeUltimo: null, atrasado: false, baseDeCalculo: 0,
    };
    if (datas.length < 2) {
        if (datas.length === 1) {
            const dias = Math.round((Date.parse(hoje) - Date.parse(datas[0])) / DIA_MS);
            return { ...vazio, diasDesdeUltimo: Number.isNaN(dias) ? null : dias };
        }
        return vazio;
    }

    const intervalos: number[] = [];
    for (let i = 1; i < datas.length; i++) {
        const d = Math.round((Date.parse(datas[i]) - Date.parse(datas[i - 1])) / DIA_MS);
        if (!Number.isNaN(d) && d >= 0) intervalos.push(d);
    }
    if (intervalos.length === 0) return vazio;

    const media = Math.round(intervalos.reduce((s, n) => s + n, 0) / intervalos.length);
    const ultimo = datas[datas.length - 1];
    const diasDesdeUltimo = Math.round((Date.parse(hoje) - Date.parse(ultimo)) / DIA_MS);

    const proximo = new Date(Date.parse(ultimo) + media * DIA_MS);
    const proximoIso = Number.isNaN(proximo.getTime()) ? null : proximo.toISOString().slice(0, 10);

    return {
        intervaloMedioDias: media,
        menorIntervalo: Math.min(...intervalos),
        maiorIntervalo: Math.max(...intervalos),
        proximoPedidoEstimado: proximoIso,
        diasDesdeUltimo,
        atrasado: media > 0 && diasDesdeUltimo > media,
        baseDeCalculo: intervalos.length,
    };
}

export interface DossieDoCliente {
    orcamentos: OrcamentoDoCliente[];
    /** Só os que fecharam, mais recentes primeiro. */
    orcamentosFechados: OrcamentoDoCliente[];
    pedidos: PedidoDoCliente[];
    contas: ContaDoCliente[];

    /** Quanto o cliente já gerou em pedidos — o tamanho da relação. */
    totalEmPedidos: number;
    /** Quanto já entrou de verdade. */
    totalRecebido: number;
    /** O que ainda falta receber, só de conta viva. */
    aReceber: number;
    /** Parte do "a receber" que já passou do vencimento. */
    vencido: number;
    /** Parcelas de pedido ainda não entregue: não são cobrança (regra da Finanças). */
    emProducao: number;

    /**
     * Fechados ÷ enviados. Rascunho fica de fora: nunca chegou ao cliente,
     * então contá-lo como proposta perdida seria punir o vendedor por um
     * orçamento que ele mesmo abandonou antes de mandar.
     */
    taxaDeFechamento: number | null;
    orcamentosConsiderados: number;

    ultimoPedidoEm?: string;
    ultimoOrcamentoEm?: string;
    ticketMedio: number | null;

    /** O que este cliente compra, ordenado pelo mais pedido. */
    pecas: PecaDoCliente[];
    /** Série mensal de pedidos, para o gráfico. */
    porMes: MesDoCliente[];
    /** Ritmo de compra e estimativa do próximo pedido. */
    padrao: PadraoDePedidos;
    /** Fotos anexadas aos orçamentos dele — candidatas a virar foto do cliente. */
    fotosDosOrcamentos: string[];
}

/**
 * Monta o dossie de UM cliente ou de VARIOS somados.
 *
 * Aceitar uma lista e o que faz o grupo economico funcionar sem duplicar
 * calculo: a pagina do grupo passa os ids das filiais e recebe exatamente o
 * mesmo objeto que a pagina do cliente recebe — mesmas abas, mesmos numeros,
 * mesma logica. Somar por fora produziria dois calculos de "quanto isto vale"
 * que divergiriam na primeira mudanca.
 */
export function montarDossie(
    clientId: string | string[],
    orcamentos: OrcamentoDoCliente[] | undefined,
    pedidos: PedidoDoCliente[] | undefined,
    contas: ContaDoCliente[] | undefined,
    hoje: string,
): DossieDoCliente {
    const ids = new Set(Array.isArray(clientId) ? clientId : [clientId]);
    const meu = (id?: string) => !!id && ids.has(id);

    const meusOrcamentos = (orcamentos || [])
        .filter(o => meu(o.client_id))
        .sort((a, b) => porDataDesc(a.date, b.date));

    const meusPedidos = (pedidos || [])
        .filter(p => meu(p.client_id))
        .sort((a, b) => porDataDesc(a.created_at, b.created_at));

    // Conta cancelada não é dívida nem receita: some das somas, mas continua
    // na lista para quem quiser auditar o histórico.
    const minhasContas = (contas || [])
        .filter(c => meu(c.client_id))
        .sort((a, b) => porDataDesc(a.due_date, b.due_date));
    const contasVivas = minhasContas.filter(
        c => !c.cancelled_at && c.derived_status !== 'cancelled' && c.type === 'receivable');

    // A mesma classificação de Dinheiro › Clientes que devem: parcela de pedido não
    // entregue não vence nem é cobrança. Sem isto a página do cliente acusava atraso
    // que a Finanças já não acusa — os dois números tinham de bater.
    const situacao = (c: ContaDoCliente) => situacaoDaConta({
        id: c.id,
        type: c.type === 'payable' ? 'payable' : 'receivable',
        description: c.description || '',
        due_date: c.due_date || '',
        original_amount: Number(c.original_amount) || 0,
        remaining_amount: Number(c.remaining_amount) || 0,
        derived_status: c.cancelled_at ? 'cancelled' : (c.derived_status || ''),
        awaiting_delivery: c.awaiting_delivery,
    }, hoje);
    const naSituacao = (...ss: string[]) => contasVivas.filter(c => ss.includes(situacao(c)));

    const orcamentosFechados = meusOrcamentos.filter(o => ORCAMENTO_FECHADO.includes(o.status || ''));
    const enviados = meusOrcamentos.filter(o => (o.status || '') !== 'Draft');

    const totalEmPedidos = soma(meusPedidos.map(p => p.total_amount));

    return {
        orcamentos: meusOrcamentos,
        orcamentosFechados,
        pedidos: meusPedidos,
        contas: minhasContas,

        totalEmPedidos,
        totalRecebido: soma(contasVivas.map(c => c.paid_amount)),
        aReceber: soma(naSituacao('vencida', 'a_vencer').map(c => c.remaining_amount)),
        vencido: soma(naSituacao('vencida').map(c => c.remaining_amount)),
        emProducao: soma(naSituacao('aguardando_entrega').map(c => c.remaining_amount)),

        taxaDeFechamento: enviados.length > 0
            ? Math.round((orcamentosFechados.length / enviados.length) * 100) / 100
            : null,
        orcamentosConsiderados: enviados.length,

        ultimoPedidoEm: meusPedidos[0]?.created_at,
        ultimoOrcamentoEm: meusOrcamentos[0]?.date,
        ticketMedio: meusPedidos.length > 0
            ? Math.round((totalEmPedidos / meusPedidos.length) * 100) / 100
            : null,

        pecas: pecasDoCliente(meusOrcamentos),
        porMes: pedidosPorMes(meusPedidos),
        padrao: padraoDePedidos(meusPedidos, hoje),
        // Sem repetidas: a mesma arte anexada em três orçamentos é uma foto só
        // para quem está escolhendo o que guardar no cadastro do cliente.
        fotosDosOrcamentos: [...new Set(
            meusOrcamentos.flatMap(o => o.reference_photos || []).filter(Boolean))],
    };
}
