/**
 * Cadência de contato — quem esfriou e precisa ser cobrado.
 *
 * ESTE ARQUIVO ERA MAIOR, E ENCOLHEU DE PROPÓSITO. Ele nasceu com uma fila do
 * dia própria, pontuando porte, etapa e frieza. Só que `filaDeHoje`, em
 * funilDeLeads, JÁ MONTA essa fila — e melhor: a taxonomia de motivos dela
 * (`nunca-tocado`, `esquecido`, `ação-vencida`) já codifica de quem é a bola e
 * há quanto tempo o lead está parado, com a vantagem de dizer isso em palavras
 * em vez de num número.
 *
 * A tentativa de misturar as duas foi barrada por um teste que já existia: o
 * peso do meio que eu dava ao porte desconhecido invertia a ordem que
 * `filaDeHoje` tinha decidido a sério — porte desconhecido por último. Duas
 * decisões deliberadas em conflito, e a que estava lá primeiro tinha razão,
 * porque naquele contexto o lead nunca aberto já sobe pelo motivo.
 *
 * O que sobrou aqui é a régua de esfriamento, que não existia em lugar
 * nenhum, e os pesos — que a fase 4 já usa: `pesoDoCapital` entrou quando a
 * coluna passou a existir, exatamente onde o plano dizia que entraria.
 *
 * Sem imports do app além de outro util puro, para ser testado direto.
 */

import type { EtapaDoLead } from './funilDeLeads.ts';

export interface LeadDaFila {
    id: string;
    razao_social?: string | null;
    nome_fantasia?: string | null;
    segmento?: string | null;
    porte_funcionarios?: number | null;
    cidade?: string | null;
    uf?: string | null;
    telefone?: string | null;
    status?: string | null;
    ultimo_contato_em?: string | null;
    proxima_acao_em?: string | null;
    /** Entra na conta quando a fase 4 preencher a coluna. */
    capital_social?: number | null;
}

// ── os pesos ────────────────────────────────────────────────────────────────

/**
 * Quanto cada porte vale.
 *
 * A curva não é linear porque a realidade não é: dobrar de 20 para 40
 * funcionários muda pouco a conversa; passar de 200 muda o tipo de negócio —
 * vira concorrência, prazo longo e provavelmente licitação. Empresa grande vale
 * mais na fila mesmo demorando mais para fechar, porque o pedido paga a espera.
 */
export const PESO_DO_PORTE: Array<{ min: number; peso: number }> = [
    { min: 500, peso: 30 },
    { min: 200, peso: 24 },
    { min: 100, peso: 18 },
    { min: 50, peso: 12 },
    { min: 20, peso: 7 },
    { min: 1, peso: 3 },
];

/**
 * Porte desconhecido não vale zero, vale o MEIO da tabela.
 *
 * Zero empurraria para o fim da fila justamente os leads que ninguém abriu
 * ainda — e um lead nunca aberto é um lead sobre o qual não se sabe nada, não
 * um lead ruim. A fila deixaria de mostrar o que mais precisa ser olhado.
 */
export const PESO_PORTE_DESCONHECIDO = 10;

/**
 * De quem é a bola. Sai da etapa do funil, que já sabe disso.
 *
 * Lead esperando VOCÊ sobe na frente de todos: é dívida sua, e é a única coisa
 * na fila que não depende de mais ninguém para andar.
 */
export const PESO_DA_BOLA: Record<'nossa' | 'deles' | 'ninguem', number> = {
    nossa: 25,
    deles: 8,
    ninguem: 0,
};

/** Dias sem contato até o lead ser considerado frio. */
export const DIAS_PARA_ESFRIAR = 21;

/**
 * O esfriamento cresce e depois PARA de crescer.
 *
 * Sem o teto, um lead esquecido há dois anos venceria para sempre qualquer lead
 * bom de hoje — a fila viraria um museu ordenado por abandono.
 *
 * O NÚMERO SAIU DE UM TESTE QUE FALHOU, e não de intuição. Com teto 30, uma
 * empresa de 60 funcionários apenas fria (12 + 8 + 30 = 50) passava na frente
 * de uma de 300 que estava esperando resposta SUA (24 + 25 + 0 = 49). O teto
 * era maior que o peso da bola, e o resultado é que esfriar sozinho vencia
 * qualquer outra coisa — o oposto do que a fila promete.
 *
 * Em 20, a frieza continua fazendo o lead esquecido subir e ser resolvido, mas
 * deixa de decidir a fila sozinha: grande + esperando você (49) ganha de médio
 * + frio (40), e grande + frio (52) ganha dos dois, que é a ordem certa.
 */
export const PESO_MAXIMO_DE_FRIEZA = 20;

export const PESO_POR_DIA_FRIO = 1;

/**
 * Capital social — a fase 4, agora que a coluna existe.
 *
 * Pesa MENOS que o porte, de propósito. O número de funcionários diz quantos
 * uniformes o pedido tem; o capital diz se a empresa aguenta pagar. O primeiro
 * é o tamanho do negócio, o segundo é o risco — e quem prospecta vai atrás do
 * tamanho.
 *
 * Capital desconhecido vale ZERO, e não o meio como o porte. A diferença tem
 * razão: porte desconhecido é comum e não diz nada; capital desconhecido
 * também não diz nada, mas o porte já está lá cumprindo o papel de tamanho.
 * Dar peso do meio aos dois somaria duas vezes a mesma ignorância.
 */
export const PESO_DO_CAPITAL: Array<{ min: number; peso: number }> = [
    { min: 1_000_000, peso: 12 },
    { min: 500_000, peso: 8 },
    { min: 50_000, peso: 4 },
    { min: 0.01, peso: 1 },
];

export function pesoDoCapital(capital: number | null | undefined): number {
    const n = Number(capital);
    if (!Number.isFinite(n) || n <= 0) return 0;
    for (const faixa of PESO_DO_CAPITAL) if (n >= faixa.min) return faixa.peso;
    return 0;
}

export interface Pontuacao {
    total: number;
    porte: number;
    capital: number;
    bola: number;
    frieza: number;
    /** Dias desde o último contato. `null` quando nunca houve contato. */
    diasSemContato: number | null;
    /** O lead passou do prazo de cadência. */
    esfriou: boolean;
    /** Falta dado que mudaria a posição — a tela avisa em vez de esconder. */
    faltaPorte: boolean;
}

export function diasEntre(de: string | null | undefined, ate: string): number | null {
    if (!de) return null;
    const a = Date.parse(de.length <= 10 ? `${de}T12:00:00` : de);
    const b = Date.parse(ate.length <= 10 ? `${ate}T12:00:00` : ate);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.floor((b - a) / 86400000);
}

export function pesoDoPorte(porte: number | null | undefined): { peso: number; falta: boolean } {
    const n = Number(porte);
    if (!Number.isFinite(n) || n <= 0) return { peso: PESO_PORTE_DESCONHECIDO, falta: true };
    for (const faixa of PESO_DO_PORTE) {
        if (n >= faixa.min) return { peso: faixa.peso, falta: false };
    }
    return { peso: PESO_PORTE_DESCONHECIDO, falta: true };
}

/**
 * @param bolaDaEtapa  de quem é a vez, vindo de ETAPAS do funil.
 * @param hoje         data em ISO. Entra por parâmetro para o teste não
 *                     depender do relógio.
 */
export function pontuar(
    lead: LeadDaFila,
    bolaDaEtapa: 'nossa' | 'deles' | 'ninguem',
    hoje: string,
): Pontuacao {
    const { peso: porte, falta: faltaPorte } = pesoDoPorte(lead.porte_funcionarios);
    const capital = pesoDoCapital(lead.capital_social);
    const bola = PESO_DA_BOLA[bolaDaEtapa] ?? 0;

    const dias = diasEntre(lead.ultimo_contato_em, hoje);

    // Nunca contatado conta como recém-chegado, e não como frio há mil dias.
    // Ele já ganha prioridade pela bola ser nossa na etapa "novo"; somar
    // frieza por cima o colocaria acima de gente que está esperando resposta.
    const diasFrio = dias === null ? 0 : Math.max(0, dias - DIAS_PARA_ESFRIAR);
    const frieza = Math.min(diasFrio * PESO_POR_DIA_FRIO, PESO_MAXIMO_DE_FRIEZA);

    return {
        total: porte + capital + bola + frieza,
        porte, capital, bola, frieza,
        diasSemContato: dias,
        esfriou: dias !== null && dias >= DIAS_PARA_ESFRIAR,
        faltaPorte,
    };
}

/** Os que passaram do prazo de cadência — a fase 2 do plano. */
export function leadsQueEsfriaram<T extends LeadDaFila>(
    leads: T[],
    estaVivo: (status: string | null | undefined) => boolean,
    hoje: string,
): Array<{ lead: T; dias: number }> {
    return (leads || [])
        .filter(l => estaVivo(l.status))
        .map(l => ({ lead: l, dias: diasEntre(l.ultimo_contato_em, hoje) ?? -1 }))
        .filter(x => x.dias >= DIAS_PARA_ESFRIAR)
        .sort((a, b) => b.dias - a.dias) as Array<{ lead: T; dias: number }>;
}

export type { EtapaDoLead };
