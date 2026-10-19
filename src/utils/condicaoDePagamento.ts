/**
 * A condição de pagamento de um orçamento, lida do plano — e não adivinhada.
 *
 * O QUE ESTAVA ERRADO
 * O orçamento nasceu com um modelo simples de dois campos: `down_payment_value`
 * (entrada) e `delivery_payment_value` (saldo na entrega). Quando o plano de N
 * parcelas foi introduzido, o salvamento passou a reaproveitar esses dois
 * campos com um significado NOVO — `down_payment_value` virou "primeira
 * parcela" e `delivery_payment_value` virou "soma das demais".
 *
 * Só que tudo que lê esses campos continuou tratando-os pelo significado
 * ANTIGO. O resultado, medido nas cinco condições que o sistema oferece:
 *
 *   À vista        → down = 1400 (o total!) rotulado "Entrada (100%)"
 *   30 dias        → down = 1400 (o total!) rotulado "Entrada (100%)"
 *   50/50          → down = 700, saldo = 700                        (certo)
 *   30/60          → down = 700 rotulado "Entrada (50%)"            (não há entrada)
 *   30/60/90       → down = 466,67 rotulado "Entrada (33%)"         (não há entrada)
 *
 * E isso vazava para o cliente: a mensagem de cobrança dizia "falta a entrada
 * de R$ 1.400,00" para quem tinha combinado pagar em 30 dias sem nada na
 * frente. Cobrar o total como se fosse sinal é o tipo de erro que custa a
 * venda, não só a informação.
 *
 * A REGRA
 * Entrada é o que vence NA CONFIRMAÇÃO — não a primeira parcela, seja ela qual
 * for. A referência é a data do orçamento, não "hoje": assim a leitura de um
 * orçamento de dois meses atrás continua a mesma de quando foi feito.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export interface ParcelaDaCondicao {
    label?: string;
    amount?: number;
    due?: string;
    method?: string;
}

export interface OrcamentoParaLer {
    payment_plan?: ParcelaDaCondicao[] | null;
    total_amount?: number;
    /** aaaa-mm-dd — a emissão, referência do que é "na confirmação". */
    date?: string | null;
    down_payment_value?: number;
    delivery_payment_value?: number;
    down_payment_percent?: number;
}

export interface CondicaoDePagamento {
    parcelas: Array<{ label: string; valor: number; vencimento: string; meio?: string; naConfirmacao: boolean }>;
    total: number;
    /** Devido na confirmação. Zero quando não há entrada. */
    entrada: number;
    /** O que fica para depois da confirmação. */
    aPrazo: number;
    temEntrada: boolean;
    /** Frase de uma linha para a tela. */
    resumo: string;
    /** Uma linha por parcela, para a mensagem ao cliente. */
    linhas: string[];
    /** Veio de um plano de verdade, ou foi deduzida dos campos antigos. */
    origem: 'plano' | 'campos' | 'vazio';
}

/**
 * Folga entre a emissão e o vencimento para a parcela ainda contar como
 * entrada. Plano montado numa sexta e confirmado na segunda não deixa de ter
 * entrada por causa do fim de semana.
 */
export const DIAS_DE_FOLGA_DA_ENTRADA = 3;

const centavos = (n?: number | null) => Math.round((Number(n) || 0) * 100) / 100;
const soData = (s?: string | null) => (s || '').slice(0, 10);

const reais = (n?: number | null) =>
    (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dataBR = (iso?: string | null) => {
    const [a, m, d] = soData(iso).split('-');
    return a && m && d ? `${d}/${m}/${a}` : '';
};

const diasEntre = (de: string, para: string): number => {
    const [aa, am, ad] = soData(de).split('-').map(Number);
    const [ba, bm, bd] = soData(para).split('-').map(Number);
    if (!aa || !ba) return 0;
    return Math.round((Date.UTC(ba, bm - 1, bd) - Date.UTC(aa, am - 1, ad)) / 86400000);
};

/**
 * A parcela vence na confirmação?
 *
 * Comparar com a data do ORÇAMENTO, e não com hoje, é o que mantém a resposta
 * estável: senão um "30 dias" de dois meses atrás passaria a ser lido como
 * entrada só porque a data já venceu.
 */
export function venceNaConfirmacao(
    vencimento: string | undefined | null,
    referencia: string,
): boolean {
    const v = soData(vencimento);
    if (!v) return true;               // sem data, é para agora
    if (!soData(referencia)) return false;
    return diasEntre(referencia, v) <= DIAS_DE_FOLGA_DA_ENTRADA;
}

/** Lê a condição a partir do que o orçamento realmente tem. */
export function descreverCondicao(
    orcamento: OrcamentoParaLer,
    hoje: string,
): CondicaoDePagamento {
    const referencia = soData(orcamento.date) || soData(hoje);
    const total = centavos(orcamento.total_amount);
    const plano = (orcamento.payment_plan || []).filter(p => centavos(p.amount) > 0);

    if (plano.length > 0) {
        return montar(plano, total, referencia, 'plano');
    }

    // Sem plano: os campos antigos ainda descrevem entrada + saldo, e ali o
    // significado deles É o original — foi só o plano que os sequestrou.
    const entrada = centavos(orcamento.down_payment_value);
    // O saldo costumava ser IMPLÍCITO: muita tela gravava só a entrada e
    // deixava o resto subentendido como "total menos entrada". Derivar aqui é
    // o que impede a condição de anunciar entrada sem dizer o que falta.
    const saldoGravado = centavos(orcamento.delivery_payment_value);
    // Só deriva quando HÁ entrada. Sem entrada e sem saldo gravado, não existe
    // condição nenhuma — transformar o total num "saldo" inventaria um acordo
    // a partir da ausência de informação.
    const saldo = saldoGravado > 0
        ? saldoGravado
        : (entrada > 0 && total > entrada ? centavos(total - entrada) : 0);
    if (entrada <= 0 && saldo <= 0) {
        return {
            parcelas: [], total, entrada: 0, aPrazo: 0, temEntrada: false,
            resumo: 'Pagamento a combinar', linhas: [], origem: 'vazio',
        };
    }

    // No modelo antigo a entrada É entrada por definição — não depende de
    // comparar datas. Marcá-la explicitamente evita que um orçamento sem data
    // de emissão perca a entrada só porque não há referência para comparar.
    const deCampos: ParcelaComMarca[] = [];
    if (entrada > 0) {
        deCampos.push({ label: 'Entrada', amount: entrada, due: referencia, naConfirmacao: true });
    }
    if (saldo > 0) deCampos.push({ label: 'Saldo na entrega', amount: saldo, naConfirmacao: false });
    return montar(deCampos, total || centavos(entrada + saldo), referencia, 'campos');
}

/** Parcela que já sabe se vence na confirmação, sem precisar deduzir da data. */
type ParcelaComMarca = ParcelaDaCondicao & { naConfirmacao?: boolean };

function montar(
    plano: ParcelaComMarca[],
    total: number,
    referencia: string,
    origem: 'plano' | 'campos',
): CondicaoDePagamento {
    const parcelas = plano.map(p => ({
        label: (p.label || '').trim() || 'Parcela',
        valor: centavos(p.amount),
        vencimento: soData(p.due),
        meio: p.method,
        // A parcela sem data no modelo antigo é o "saldo na entrega": não vence
        // na confirmação, vence quando a peça sai.
        naConfirmacao: p.naConfirmacao !== undefined
            ? p.naConfirmacao
            : (!!soData(p.due) && venceNaConfirmacao(p.due, referencia)),
    }));

    const entrada = centavos(parcelas.filter(p => p.naConfirmacao).reduce((s, p) => s + p.valor, 0));
    const soma = centavos(parcelas.reduce((s, p) => s + p.valor, 0));
    const aPrazo = centavos(soma - entrada);

    return {
        parcelas,
        total: total || soma,
        entrada,
        aPrazo,
        temEntrada: entrada > 0,
        resumo: resumir(parcelas, entrada, aPrazo),
        linhas: parcelas.map(p => {
            const quando = p.naConfirmacao
                ? 'na confirmação'
                : (p.vencimento ? `até ${dataBR(p.vencimento)}` : 'na entrega');
            return `${reais(p.valor)} ${quando}`;
        }),
        origem,
    };
}

/**
 * A frase curta. Descreve o que existe, sem forçar tudo em entrada + saldo:
 * um 30/60/90 não tem entrada e não tem saldo na entrega, e chamar a primeira
 * parcela de entrada era o que fazia a cobrança sair errada.
 */
function resumir(
    parcelas: CondicaoDePagamento['parcelas'],
    entrada: number,
    aPrazo: number,
): string {
    if (parcelas.length === 0) return 'Pagamento a combinar';

    if (parcelas.length === 1) {
        const p = parcelas[0];
        if (p.naConfirmacao) return `${reais(p.valor)} na confirmação`;
        return p.vencimento
            ? `${reais(p.valor)} à vista, até ${dataBR(p.vencimento)}`
            : `${reais(p.valor)} à vista na entrega`;
    }

    if (entrada > 0 && parcelas.filter(p => p.naConfirmacao).length === 1) {
        const restantes = parcelas.filter(p => !p.naConfirmacao);
        return restantes.length === 1
            ? `${reais(entrada)} de entrada + ${reais(aPrazo)} ${restantes[0].vencimento ? `até ${dataBR(restantes[0].vencimento)}` : 'na entrega'}`
            : `${reais(entrada)} de entrada + ${restantes.length}x até ${dataBR(restantes[restantes.length - 1].vencimento)}`;
    }

    // Sem entrada: parcelado puro. Diz o número de parcelas e a última data,
    // que é a informação que o cliente usa para se organizar.
    const iguais = parcelas.every(p => Math.abs(p.valor - parcelas[0].valor) < 0.02);
    const ultima = parcelas[parcelas.length - 1].vencimento;
    return iguais
        ? `${parcelas.length}x de ${reais(parcelas[0].valor)}${ultima ? `, última até ${dataBR(ultima)}` : ''}`
        : `${parcelas.length} parcelas${ultima ? `, última até ${dataBR(ultima)}` : ''}`;
}

// ─── Task 4: Condição de pagamento num bloco só ─────────────────────────────

import { reescalarPlano } from './planoDoPedido.ts';
import type { PlanInstallment } from './paymentPlan.ts';

const centavosT4 = (n: number) => Math.round(n * 100) / 100;

/**
 * Refaz o plano a partir da entrada %.
 *
 * `hoje` é a data de REFERÊNCIA = a emissão do orçamento, não o dia de hoje:
 * é contra ela que `descreverCondicao` decide o que é entrada. Datar a entrada
 * de um orçamento antigo com o dia da edição a jogaria para fora da folga, e o
 * PDF passaria a dizer "2x de" em vez de "entrada + saldo".
 *
 * A 1ª parcela só é tratada como entrada quando de fato vence na confirmação;
 * num 30/60 ou num à vista na entrega, a entrada entra NA FRENTE e o plano de
 * antes é reescalado no que sobra.
 */
export function aplicarEntrada(o: {
    plano?: PlanInstallment[] | null; total: number; entradaPct: number;
    hoje: string; entrega: string; metodo?: string;
}): PlanInstallment[] {
    const pct = Math.min(99, Math.max(1, Math.round(Number(o.entradaPct) || 0)));
    const entrada = centavosT4(o.total * pct / 100);
    const resto = centavosT4(o.total - entrada);
    const atual = o.plano || [];
    const m = o.metodo || 'PIX';
    const ehEntrada = atual.length > 0 && venceNaConfirmacao(atual[0].due, o.hoje);
    const saldoBase = ehEntrada ? atual.slice(1) : atual;
    const primeira: PlanInstallment = ehEntrada
        ? { ...atual[0], label: `Entrada (${pct}%)`, amount: entrada }
        : { label: `Entrada (${pct}%)`, amount: entrada, due: o.hoje, method: m };
    const saldo = saldoBase.length > 0
        ? reescalarPlano(saldoBase as any, resto) as PlanInstallment[]
        : [{ label: 'Saldo na entrega', amount: resto, due: o.entrega, method: m }];
    return [primeira, ...saldo];
}

/** O plano que o bloco mostra ao abrir. Orçamento antigo só com entrada % ganha o plano equivalente — sem gravar. */
export function planoParaMostrar(
    o: { payment_plan?: PlanInstallment[] | null; down_payment_percent?: number | null; payment_method?: string | null },
    total: number, hoje: string, entrega: string,
): PlanInstallment[] | null {
    if (o.payment_plan && o.payment_plan.length > 0) return o.payment_plan;
    const pct = Number(o.down_payment_percent) || 0;
    if (pct > 0 && pct < 100 && total > 0) return aplicarEntrada({ total, entradaPct: pct, hoje, entrega, metodo: o.payment_method || undefined });
    return null;
}

/**
 * Entrada % do plano = 1ª parcela ÷ total (a mesma conta que handleSave grava
 * em down_payment_percent). Com `referencia` (a emissão), a 1ª parcela só
 * conta se vencer na confirmação — um 30/60 não tem entrada.
 */
export const entradaPctDoPlano = (
    plano: PlanInstallment[] | null | undefined, total: number, referencia?: string,
): number => {
    if (!plano || plano.length === 0 || total <= 0) return 0;
    if (referencia && !venceNaConfirmacao(plano[0].due, referencia)) return 0;
    return Math.round(((Number(plano[0].amount) || 0) / total) * 100);
};
