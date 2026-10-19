/**
 * Conferência do plano de pagamento na hora de virar pedido.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 * O plano fica gravado no orçamento como uma FOTOGRAFIA: valores em reais e
 * datas absolutas, congelados no dia em que alguém abriu o modal de plano.
 * Nada nesse retrato se atualiza sozinho.
 *
 * Só que o orçamento continua vivo depois disso. O valor muda (400 vira 1400),
 * o pedido é revertido e reconvertido dias depois, o prazo de entrega é outro.
 * E a conversão, ao encontrar um plano já definido, convertia DIRETO — sem
 * abrir o modal, sem conferir. O resultado é conta a receber com o valor de
 * ontem e vencimento que já nasce vencido, e ninguém vê acontecer.
 *
 * A regra aqui: plano que não bate com o pedido de hoje não converte calado.
 * Estas funções só DIAGNOSTICAM e SUGEREM — quem decide é a pessoa, no modal.
 * Reescalar valor e remarcar data são decisões de dinheiro; um palpite
 * automático seria trocar um erro silencioso por outro.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export interface ParcelaDoPlano {
    label: string;
    amount: number;
    due: string; // aaaa-mm-dd
    method?: string;
}

const centavos = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const soData = (iso: string) => (iso || '').slice(0, 10);

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** Soma dias a uma data ISO, em UTC, para não escorregar por fuso. */
export function somarDias(iso: string, dias: number): string {
    const [a, m, d] = soData(iso).split('-').map(Number);
    if (!a || !m || !d) return iso;
    const t = new Date(Date.UTC(a, m - 1, d));
    t.setUTCDate(t.getUTCDate() + Math.trunc(dias));
    return `${t.getUTCFullYear()}-${doisDigitos(t.getUTCMonth() + 1)}-${doisDigitos(t.getUTCDate())}`;
}

/** Dias entre duas datas ISO (negativo quando a segunda é anterior). */
export function diferencaEmDias(de: string, para: string): number {
    const [aa, am, ad] = soData(de).split('-').map(Number);
    const [ba, bm, bd] = soData(para).split('-').map(Number);
    if (!aa || !ba) return 0;
    return Math.round((Date.UTC(ba, bm - 1, bd) - Date.UTC(aa, am - 1, ad)) / 86400000);
}

/** Soma das parcelas, em centavos exatos. */
export const totalDoPlano = (plano: ParcelaDoPlano[] | null | undefined): number =>
    centavos((plano || []).reduce((s, p) => s + (Number(p.amount) || 0), 0));

export interface Conferencia {
    /** Soma das parcelas. */
    total: number;
    /** total do plano menos total do pedido. Positivo = plano cobra a mais. */
    diferenca: number;
    confere: boolean;
}

/** O plano fecha com o valor do pedido? */
export function conferirPlano(
    plano: ParcelaDoPlano[] | null | undefined,
    totalDoPedido: number,
): Conferencia {
    const total = totalDoPlano(plano);
    const diferenca = centavos(total - (Number(totalDoPedido) || 0));
    // Um centavo de folga: arredondamento de divisão não é divergência.
    return { total, diferenca, confere: Math.abs(diferenca) < 0.01 };
}

export type MotivoDeRevisao = 'vazio' | 'valor' | 'data';

export interface Revisao {
    precisa: boolean;
    motivos: MotivoDeRevisao[];
    /** Frase pronta para a tela, já explicando o que está errado. */
    texto: string;
    conferencia: Conferencia;
    /** Quantas parcelas já nascem vencidas. */
    vencidas: number;
}

/**
 * O plano pode ser usado como está, ou precisa passar pela pessoa?
 *
 * Duas coisas o invalidam:
 *
 *   VALOR — a soma das parcelas não é mais o valor do pedido. O orçamento foi
 *   editado depois que o plano foi montado.
 *
 *   DATA — alguma parcela vence antes de hoje. Isso acontece quando o plano
 *   foi montado semanas atrás, ou quando o pedido foi revertido e reconvertido:
 *   a "entrada com vencimento hoje" continua marcada para aquele dia, e a conta
 *   nasce vencida — atrasando o cliente por uma data que nunca foi combinada
 *   com ele.
 */
export function planoPrecisaRevisao(
    plano: ParcelaDoPlano[] | null | undefined,
    totalDoPedido: number,
    hoje: string,
): Revisao {
    const conferencia = conferirPlano(plano, totalDoPedido);
    const motivos: MotivoDeRevisao[] = [];
    const partes: string[] = [];

    if (!plano || plano.length === 0) {
        return {
            precisa: true,
            motivos: ['vazio'],
            texto: 'O orçamento não tem plano de pagamento definido.',
            conferencia,
            vencidas: 0,
        };
    }

    if (!conferencia.confere) {
        motivos.push('valor');
        const verbo = conferencia.diferenca > 0 ? 'a mais' : 'a menos';
        partes.push(
            `as parcelas somam ${conferencia.total.toFixed(2)}, `
            + `${Math.abs(conferencia.diferenca).toFixed(2)} ${verbo} que o pedido `
            + `(${(Number(totalDoPedido) || 0).toFixed(2)})`);
    }

    const corte = soData(hoje);
    const vencidas = plano.filter(p => soData(p.due) < corte).length;
    if (vencidas > 0) {
        motivos.push('data');
        partes.push(vencidas === 1
            ? 'uma parcela já nasce vencida'
            : `${vencidas} parcelas já nascem vencidas`);
    }

    return {
        precisa: motivos.length > 0,
        motivos,
        texto: partes.length ? `Plano desatualizado: ${partes.join(' e ')}.` : '',
        conferencia,
        vencidas,
    };
}

/**
 * Reescala as parcelas para o novo total, preservando a proporção.
 *
 * Um plano 50/50 continua 50/50; entrada de 30% continua 30%. A última parcela
 * absorve a sobra do arredondamento, para a soma bater no centavo.
 *
 * Plano cuja soma é zero não tem proporção a preservar — aí divide igual, que é
 * o único palpite honesto.
 */
export function reescalarPlano(
    plano: ParcelaDoPlano[],
    novoTotal: number,
): ParcelaDoPlano[] {
    const parcelas = plano || [];
    if (parcelas.length === 0) return [];

    const alvo = centavos(novoTotal);
    const atual = totalDoPlano(parcelas);

    const brutos = atual > 0
        ? parcelas.map(p => centavos(((Number(p.amount) || 0) / atual) * alvo))
        : parcelas.map(() => centavos(alvo / parcelas.length));

    // A última fecha a conta: somar valores arredondados quase nunca dá o total.
    const somaMenosUltima = centavos(brutos.slice(0, -1).reduce((s, v) => s + v, 0));
    brutos[brutos.length - 1] = centavos(alvo - somaMenosUltima);

    return parcelas.map((p, i) => ({ ...p, amount: brutos[i] }));
}

/**
 * Empurra o plano para frente até nenhuma parcela nascer vencida.
 *
 * O deslocamento é o MESMO para todas, preservando o intervalo entre elas: um
 * 30/60/90 continua 30/60/90, só que contado a partir de agora. Mexer em cada
 * data por conta própria mudaria a condição negociada com o cliente.
 *
 * Plano já todo no futuro volta intacto.
 */
export function reancorarPlano(
    plano: ParcelaDoPlano[],
    hoje: string,
): ParcelaDoPlano[] {
    const parcelas = plano || [];
    if (parcelas.length === 0) return [];

    const primeira = parcelas
        .map(p => soData(p.due))
        .filter(Boolean)
        .sort()[0];
    if (!primeira) return parcelas;

    const atraso = diferencaEmDias(primeira, soData(hoje));
    if (atraso <= 0) return parcelas;

    return parcelas.map(p => ({ ...p, due: somarDias(soData(p.due), atraso) }));
}

/**
 * A sugestão completa para o modal: valor corrigido e datas para frente.
 *
 * É sugestão, não aplicação. A tela mostra, a pessoa confirma — plano de
 * pagamento é acordo com cliente, e corrigir sozinho seria inventar acordo.
 */
export function sugerirPlanoAtualizado(
    plano: ParcelaDoPlano[] | null | undefined,
    totalDoPedido: number,
    hoje: string,
): ParcelaDoPlano[] {
    if (!plano || plano.length === 0) return [];
    return reancorarPlano(reescalarPlano(plano, totalDoPedido), hoje);
}
