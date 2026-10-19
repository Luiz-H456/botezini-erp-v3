// Depois que o orçamento sai, o sistema para de acompanhar. Isto continua.
//
// DUAS PERGUNTAS, A MESMA LACUNA
//   1. Quais propostas estão paradas na mão do cliente, e há quanto tempo?
//   2. Quais clientes pararam de comprar sem ninguém notar?
//
// A segunda é a informação comercial mais barata que existe: o banco JÁ sabe a
// data do último pedido de cada cliente e o intervalo típico entre as compras
// dele. Ninguém pergunta. Quem comprava a cada 90 dias e está em 150 não aparece
// em lugar nenhum — some devagar, e quando alguém percebe já foi.
//
// A DEFINIÇÃO DE "SUMIU" É POR CLIENTE, NÃO POR CALENDÁRIO
// Um prazo fixo ("90 dias sem comprar") trata igual o hospital que compra todo
// mês e a escola que compra uma vez por ano — e acusa a escola de sumida em
// março, todo ano. O que denuncia de verdade é o cliente estar FORA DO PRÓPRIO
// ritmo.
//
// Sem imports do app, para ser testado direto com `node --test`.

// ── C1 — fila de follow-up ──────────────────────────────────────────────────

export interface OrcamentoEnviado {
    id: string;
    serial_number?: string | null;
    client_id?: string | null;
    /** Data do orçamento (ISO). Base da validade. */
    date?: string | null;
    /** Quando virou "Enviado". Ausente = a migração ainda não rodou. */
    sent_at?: string | null;
    validity_days?: number | null;
    status?: string | null;
    total_amount?: number | null;
}

export type UrgenciaDoFollowUp = 'vencido' | 'vence-hoje' | 'vencendo' | 'parado' | 'recente';

export const ROTULO_DA_URGENCIA: Record<UrgenciaDoFollowUp, string> = {
    'vencido': 'validade vencida',
    'vence-hoje': 'vence hoje',
    'vencendo': 'vence nos próximos dias',
    'parado': 'sem resposta',
    'recente': 'enviado há pouco',
};

export interface ItemDeFollowUp {
    orcamento: OrcamentoEnviado;
    /** Dias desde o envio. `null` quando não se sabe quando saiu. */
    diasParado: number | null;
    /** Dias até a validade acabar. Negativo = já venceu. `null` sem validade. */
    diasAteVencer: number | null;
    urgencia: UrgenciaDoFollowUp;
}

/** Dias inteiros entre duas datas ISO. Negativo quando `ate` já passou. */
export function diasEntre(de: string, ate: string): number {
    if (!de || !ate) return 0;
    const a = Date.parse(`${de.slice(0, 10)}T00:00:00Z`);
    const b = Date.parse(`${ate.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.round((b - a) / 86400000);
}

const somarDias = (iso: string, dias: number): string => {
    const base = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(base)) return '';
    return new Date(base + dias * 86400000).toISOString().slice(0, 10);
};

/** A partir de quantos dias sem resposta a proposta vira ligação. */
export const DIAS_PARA_COBRAR = 3;
/** Faltando isto ou menos para vencer, a validade passa à frente da espera. */
export const DIAS_DE_ALERTA_DE_VALIDADE = 3;

/**
 * Peso da urgência.
 *
 * Validade vem antes de tempo parado, e é a razão de a fila existir: um
 * orçamento que vence amanhã é ligação de HOJE, mesmo tendo saído ontem —
 * depois de vencer, refazer a proposta custa mais que cobrá-la.
 */
const PESO: Record<UrgenciaDoFollowUp, number> = {
    'vence-hoje': 50,
    'vencendo': 40,
    'vencido': 30,
    'parado': 20,
    'recente': 10,
};

/**
 * A fila de cobrança de orçamentos.
 *
 * Só entra o que está em 'Sent': rascunho não foi para lugar nenhum, aprovado e
 * convertido já responderam. Orçamento enviado sem `sent_at` (migração
 * pendente) ENTRA mesmo assim, com dias desconhecidos — deixá-lo de fora
 * esconderia propostas reais por causa de uma coluna que falta.
 */
export function filaDeFollowUp(
    orcamentos: OrcamentoEnviado[] | null | undefined,
    hoje: string,
): ItemDeFollowUp[] {
    const itens: ItemDeFollowUp[] = [];

    for (const o of orcamentos || []) {
        if ((o.status || '').trim() !== 'Sent') continue;

        const enviado = (o.sent_at || '').slice(0, 10);
        const diasParado = enviado ? Math.max(0, -diasEntre(hoje, enviado)) : null;

        const validade = Number(o.validity_days) || 0;
        const vence = validade > 0 && o.date ? somarDias(o.date, validade) : '';
        const diasAteVencer = vence ? diasEntre(hoje, vence) : null;

        let urgencia: UrgenciaDoFollowUp;
        if (diasAteVencer !== null && diasAteVencer < 0) urgencia = 'vencido';
        else if (diasAteVencer === 0) urgencia = 'vence-hoje';
        else if (diasAteVencer !== null && diasAteVencer <= DIAS_DE_ALERTA_DE_VALIDADE) urgencia = 'vencendo';
        else if (diasParado === null || diasParado >= DIAS_PARA_COBRAR) urgencia = 'parado';
        else urgencia = 'recente';

        itens.push({ orcamento: o, diasParado, diasAteVencer, urgencia });
    }

    return itens.sort((a, b) => {
        if (PESO[b.urgencia] !== PESO[a.urgencia]) return PESO[b.urgencia] - PESO[a.urgencia];
        // Dentro da mesma urgência, o mais antigo primeiro. Desconhecido vai ao
        // fim: sem a data não dá para afirmar que é o mais urgente.
        const pa = a.diasParado ?? -1;
        const pb = b.diasParado ?? -1;
        if (pb !== pa) return pb - pa;
        return (Number(b.orcamento.total_amount) || 0) - (Number(a.orcamento.total_amount) || 0);
    });
}

// ── C3 — cliente que parou de comprar ───────────────────────────────────────

export interface CompraDoCliente {
    client_id?: string | null;
    /** ISO. */
    data?: string | null;
    valor?: number | null;
}

export interface ClienteParaDossie {
    id: string;
    company_name?: string | null;
    phone?: string | null;
    contact_person?: string | null;
}

export interface ClienteDormente {
    cliente: ClienteParaDossie;
    /** Dias desde a última compra. */
    diasSemComprar: number;
    /** Intervalo típico entre as compras dele, em dias. */
    ritmoTipico: number;
    /** diasSemComprar ÷ ritmoTipico. 2 = está com o dobro do atraso normal. */
    atraso: number;
    compras: number;
    ultimaCompra: string;
    /** Faturamento total — diz se vale a pena a ligação. */
    valorHistorico: number;
}

/**
 * Mínimo de compras para haver ritmo.
 *
 * Com uma compra não existe intervalo; com duas existe UM intervalo, que é
 * indistinguível de acaso. Três dão dois intervalos e uma mediana com algum
 * sentido. Abaixo disso o cliente simplesmente não entra na lista — dizer que
 * ele "sumiu" seria inventar um padrão que nunca houve.
 */
export const MINIMO_DE_COMPRAS = 3;

/** Quanto acima do próprio ritmo já merece atenção. */
export const ATRASO_MINIMO = 1.5;

/** Mediana dos intervalos — mediana porque uma compra atípica não pode mandar. */
export function ritmoDeCompra(datas: string[]): number | null {
    const ordenadas = [...datas].filter(Boolean).map(d => d.slice(0, 10)).sort();
    if (ordenadas.length < 2) return null;

    const intervalos: number[] = [];
    for (let i = 1; i < ordenadas.length; i++) {
        const dias = diasEntre(ordenadas[i - 1], ordenadas[i]);
        if (dias > 0) intervalos.push(dias);
    }
    if (intervalos.length === 0) return null;

    intervalos.sort((a, b) => a - b);
    const meio = Math.floor(intervalos.length / 2);
    return intervalos.length % 2
        ? intervalos[meio]
        : Math.round((intervalos[meio - 1] + intervalos[meio]) / 2);
}

/**
 * Clientes fora do próprio ritmo de compra.
 *
 * Ordenados pelo produto atraso × valor histórico: um cliente grande com atraso
 * moderado vale mais uma ligação que um pequeno muito atrasado. A lista é para
 * o telefone, e o telefone tem hora limitada.
 */
export function clientesDormentes(
    clientes: ClienteParaDossie[] | null | undefined,
    compras: CompraDoCliente[] | null | undefined,
    hoje: string,
    atrasoMinimo = ATRASO_MINIMO,
): ClienteDormente[] {
    const porCliente = new Map<string, CompraDoCliente[]>();
    for (const c of compras || []) {
        if (!c.client_id || !c.data) continue;
        const lista = porCliente.get(c.client_id) || [];
        lista.push(c);
        porCliente.set(c.client_id, lista);
    }

    const dormentes: ClienteDormente[] = [];

    for (const cliente of clientes || []) {
        const doCliente = porCliente.get(cliente.id) || [];
        if (doCliente.length < MINIMO_DE_COMPRAS) continue;

        const datas = doCliente.map(c => (c.data || '').slice(0, 10)).filter(Boolean).sort();
        const ritmo = ritmoDeCompra(datas);
        if (ritmo === null || ritmo <= 0) continue;

        const ultima = datas[datas.length - 1];
        const diasSemComprar = -diasEntre(hoje, ultima);
        if (diasSemComprar <= 0) continue;

        const atraso = diasSemComprar / ritmo;
        if (atraso < atrasoMinimo) continue;

        dormentes.push({
            cliente,
            diasSemComprar,
            ritmoTipico: ritmo,
            atraso,
            compras: doCliente.length,
            ultimaCompra: ultima,
            valorHistorico: doCliente.reduce((s, c) => s + (Number(c.valor) || 0), 0),
        });
    }

    return dormentes.sort((a, b) => {
        const pesoA = a.atraso * Math.max(1, a.valorHistorico);
        const pesoB = b.atraso * Math.max(1, b.valorHistorico);
        if (pesoB !== pesoA) return pesoB - pesoA;
        return b.diasSemComprar - a.diasSemComprar;
    });
}

/** Uma frase que explica o atraso sem obrigar ninguém a fazer a divisão. */
export function descreverAtraso(d: ClienteDormente): string {
    const vezes = d.atraso.toFixed(1).replace('.', ',');
    return `compra a cada ${d.ritmoTipico} dias; está há ${d.diasSemComprar} (${vezes}× o normal)`;
}
