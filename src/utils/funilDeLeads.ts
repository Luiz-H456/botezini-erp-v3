// O funil de prospecção — seis etapas, e o que fazer hoje.
//
// O QUE DEFINE CADA ETAPA É QUEM TEM A BOLA
// Não é o quanto o negócio "avançou" — é se a próxima jogada é sua ou do
// cliente. Um funil organizado por sentimento ("morno", "quente") não responde
// nada às oito da manhã; organizado por posse, ele vira uma lista de ligações.
//
// A FILA É O PRODUTO, A LISTA É O SUBPRODUTO
// Sem uma fila do dia, um cadastro de leads é a mesma planilha de antes, só que
// mais difícil de ordenar. Por isso a ordenação padrão é por PORTE: com tempo
// limitado, liga-se primeiro para quem compra mais peças.
//
// Sem imports do app, para ser testado direto com `node --test`.

export type EtapaDoLead =
    | 'novo' | 'contatado' | 'qualificado' | 'orcando' | 'cliente' | 'descartado';

export interface Etapa {
    id: EtapaDoLead;
    rotulo: string;
    /** Quem deve a próxima jogada. */
    bola: 'nossa' | 'deles' | 'ninguem';
    /** Frase curta do que a etapa significa — vira o subtítulo da coluna. */
    descricao: string;
}

export const ETAPAS: Etapa[] = [
    { id: 'novo', rotulo: 'Novo', bola: 'nossa',
      descricao: 'Importado, ninguém tocou' },
    { id: 'contatado', rotulo: 'Contatado', bola: 'deles',
      descricao: 'Abordagem feita, sem resposta' },
    { id: 'qualificado', rotulo: 'Qualificado', bola: 'nossa',
      descricao: 'Respondeu e tem perfil' },
    { id: 'orcando', rotulo: 'Orçando', bola: 'deles',
      descricao: 'Pediu proposta' },
    { id: 'cliente', rotulo: 'Cliente', bola: 'ninguem',
      descricao: 'Fechou' },
    { id: 'descartado', rotulo: 'Descartado', bola: 'ninguem',
      descricao: 'Com motivo registrado' },
];

const POR_ID = new Map(ETAPAS.map(e => [e.id, e]));

export const etapaPorId = (id: EtapaDoLead | string | null | undefined): Etapa | null =>
    (id && POR_ID.get(id as EtapaDoLead)) || null;

export const ROTULO_DA_ETAPA: Record<EtapaDoLead, string> =
    ETAPAS.reduce((m, e) => { m[e.id] = e.rotulo; return m; }, {} as Record<EtapaDoLead, string>);

/** Etapas em que o lead ainda está vivo — nem fechou, nem morreu. */
export const ETAPAS_ATIVAS: EtapaDoLead[] = ['novo', 'contatado', 'qualificado', 'orcando'];

export const estaVivo = (status: string | null | undefined): boolean =>
    ETAPAS_ATIVAS.includes(status as EtapaDoLead);

/** As etapas por onde um lead PASSA a caminho de fechar. Descarte não é passo. */
export const CAMINHO: EtapaDoLead[] = ['novo', 'contatado', 'qualificado', 'orcando', 'cliente'];

/**
 * A etapa seguinte no caminho natural.
 *
 * `null` no fim e no descarte: avançar dali não significa nada, e oferecer o
 * botão faria a tela prometer uma ação que não existe.
 */
export function proximaEtapa(atual: EtapaDoLead | string): EtapaDoLead | null {
    const i = CAMINHO.indexOf(atual as EtapaDoLead);
    if (i < 0 || i >= CAMINHO.length - 1) return null;
    return CAMINHO[i + 1];
}

export interface Lead {
    id: string;
    user_id?: string | null;
    razao_social: string;
    nome_fantasia?: string | null;
    cnpj?: string | null;
    cnpj_raiz?: string | null;
    segmento?: string | null;
    porte_funcionarios?: number | null;
    /** Fase 4 da Prospecção 2.0. NULL = não informado, e não zero. */
    capital_social?: number | null;
    cnae_principal?: string | null;
    data_abertura?: string | null;
    cidade?: string | null;
    uf?: string | null;
    contato_nome?: string | null;
    contato_cargo?: string | null;
    telefone?: string | null;
    email?: string | null;
    site?: string | null;
    status: EtapaDoLead;
    origem?: string | null;
    proxima_acao?: string | null;
    proxima_acao_em?: string | null;
    ultimo_contato_em?: string | null;
    client_id?: string | null;
    motivo_perda?: string | null;
    notas?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
}

/** Nome pelo qual a empresa é reconhecida — fantasia quando existe. */
export const nomeDoLead = (l: Lead): string =>
    (l.nome_fantasia || '').trim() || (l.razao_social || '').trim() || '(sem nome)';

export type MotivoNaFila = 'nunca-tocado' | 'acao-vencida' | 'acao-de-hoje' | 'esquecido';

export const ROTULO_DO_MOTIVO_NA_FILA: Record<MotivoNaFila, string> = {
    'nunca-tocado': 'nunca foi abordado',
    'acao-vencida': 'ação atrasada',
    'acao-de-hoje': 'ação marcada para hoje',
    'esquecido': 'sem próxima ação marcada',
};

export interface ItemDaFila {
    lead: Lead;
    motivo: MotivoNaFila;
    /** Dias de atraso da ação. 0 quando é hoje; ausente quando não há data. */
    diasDeAtraso: number;
}

/** Dias inteiros entre duas datas ISO. Negativo quando `ate` já passou. */
export function diasEntre(de: string, ate: string): number {
    if (!de || !ate) return 0;
    const a = Date.parse(`${de.slice(0, 10)}T00:00:00Z`);
    const b = Date.parse(`${ate.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.round((b - a) / 86400000);
}

/**
 * Peso do motivo na fila.
 *
 * Ação atrasada vem antes de tudo porque foi você que marcou e não cumpriu — é
 * a única dívida da lista. Lead esquecido (vivo, sem próxima ação) vem por
 * último: não é urgente, mas se nunca aparecer some do funil para sempre.
 */
const PESO: Record<MotivoNaFila, number> = {
    'acao-vencida': 40,
    'acao-de-hoje': 30,
    'nunca-tocado': 20,
    'esquecido': 10,
};

/**
 * A fila do dia.
 *
 * Entram: ação vencida ou de hoje, leads novos nunca tocados, e vivos sem
 * próxima ação marcada. Ficam de fora os que estão esperando uma data futura —
 * puxá-los para hoje transformaria a fila na lista inteira, que é exatamente o
 * problema que ela resolve.
 *
 * A ordem final é motivo, depois PORTE decrescente. Com tempo limitado, liga-se
 * primeiro para quem compra mais peças.
 */
export function filaDeHoje(leads: Lead[] | null | undefined, hoje: string): ItemDaFila[] {
    const itens: ItemDaFila[] = [];

    for (const lead of leads || []) {
        if (!estaVivo(lead.status)) continue;

        const quando = (lead.proxima_acao_em || '').slice(0, 10);
        if (quando) {
            const dias = diasEntre(hoje, quando);
            if (dias > 0) continue;   // marcada para depois: hoje não é o dia
            itens.push({
                lead,
                motivo: dias < 0 ? 'acao-vencida' : 'acao-de-hoje',
                diasDeAtraso: -dias,
            });
            continue;
        }

        // Sem data marcada. Novo nunca tocado é a fila de entrada; os demais
        // vivos sem ação são o buraco por onde o funil vaza.
        itens.push({
            lead,
            motivo: lead.status === 'novo' && !lead.ultimo_contato_em ? 'nunca-tocado' : 'esquecido',
            diasDeAtraso: 0,
        });
    }

    return itens.sort((a, b) => {
        if (PESO[b.motivo] !== PESO[a.motivo]) return PESO[b.motivo] - PESO[a.motivo];
        if (b.diasDeAtraso !== a.diasDeAtraso) return b.diasDeAtraso - a.diasDeAtraso;
        const porteA = Number(a.lead.porte_funcionarios) || 0;
        const porteB = Number(b.lead.porte_funcionarios) || 0;
        if (porteB !== porteA) return porteB - porteA;
        return nomeDoLead(a.lead).localeCompare(nomeDoLead(b.lead), 'pt-BR');
    });
}

export interface ColunaDoFunil {
    etapa: Etapa;
    leads: Lead[];
}

/** O quadro: uma coluna por etapa, cada uma ordenada por porte. */
export function colunasDoFunil(leads: Lead[] | null | undefined): ColunaDoFunil[] {
    const colunas: ColunaDoFunil[] = ETAPAS.map(etapa => ({ etapa, leads: [] }));
    const porEtapa = new Map(colunas.map(c => [c.etapa.id, c]));

    for (const l of leads || []) {
        porEtapa.get(l.status)?.leads.push(l);
    }
    for (const c of colunas) {
        c.leads.sort((a, b) => {
            const pa = Number(a.porte_funcionarios) || 0;
            const pb = Number(b.porte_funcionarios) || 0;
            if (pb !== pa) return pb - pa;
            return nomeDoLead(a).localeCompare(nomeDoLead(b), 'pt-BR');
        });
    }
    return colunas;
}

// ── B5: a conversão ─────────────────────────────────────────────────────────

export interface PassoDaConversao {
    de: EtapaDoLead;
    para: EtapaDoLead;
    /** Quantos chegaram PELO MENOS até `de`. */
    entraram: number;
    /** Quantos chegaram pelo menos até `para`. */
    seguiram: number;
    /** seguiram ÷ entraram. `null` quando ninguém entrou. */
    taxa: number | null;
}

/**
 * Até onde este lead chegou, no caminho.
 *
 * Descartado guarda o ponto em que morreu — mas o status já não diz qual era.
 * Sem histórico de transições, o melhor que se pode afirmar de um descartado é
 * que ele existiu; contá-lo como se tivesse chegado só à primeira etapa
 * inventaria uma queda que talvez não tenha acontecido ali.
 *
 * Por isso o descartado entra apenas no denominador do primeiro passo — e a
 * função diz isso devolvendo -1, que quem chama trata como "só existiu".
 */
export function alcance(status: EtapaDoLead | string): number {
    if (status === 'descartado') return -1;
    return CAMINHO.indexOf(status as EtapaDoLead);
}

export interface Conversao {
    passos: PassoDaConversao[];
    total: number;
    /** Quantos viraram cliente, sobre o total. */
    taxaFinal: number | null;
    clientes: number;
    descartados: number;
}

/**
 * Conversão etapa a etapa.
 *
 * É acumulada, não instantânea: "quantos dos que entraram passaram daqui",
 * lendo a posição atual de cada lead. Uma leitura por foto — quantos estão AGORA
 * em cada coluna — mediria a fila parada, não a passagem.
 */
export function conversaoPorEtapa(leads: Lead[] | null | undefined): Conversao {
    const lista = leads || [];
    const total = lista.length;

    // Quantos alcançaram cada posição do caminho.
    const alcancaram = CAMINHO.map((_, i) =>
        lista.filter(l => alcance(l.status) >= i).length);

    const passos: PassoDaConversao[] = [];
    for (let i = 0; i < CAMINHO.length - 1; i++) {
        // O primeiro passo tem o total como denominador: todo lead, inclusive o
        // descartado, um dia esteve em 'novo'.
        const entraram = i === 0 ? total : alcancaram[i];
        const seguiram = alcancaram[i + 1];
        passos.push({
            de: CAMINHO[i],
            para: CAMINHO[i + 1],
            entraram,
            seguiram,
            taxa: entraram > 0 ? seguiram / entraram : null,
        });
    }

    const clientes = lista.filter(l => l.status === 'cliente').length;

    return {
        passos,
        total,
        clientes,
        descartados: lista.filter(l => l.status === 'descartado').length,
        taxaFinal: total > 0 ? clientes / total : null,
    };
}

export interface RecorteDaConversao {
    chave: string;
    total: number;
    clientes: number;
    taxa: number;
}

/**
 * Conversão por origem, segmento — ou qualquer outro campo.
 *
 * É o que diz se o problema é a LISTA (uma origem converte, outra não) ou a
 * abordagem (todas convertem igual e mal).
 *
 * Ordena por taxa, mas quem tem menos de `minimo` leads vai para o fim: uma
 * origem com um lead e uma conversão mostra 100% e não significa nada.
 */
export const MINIMO_PARA_COMPARAR = 5;

export function conversaoPor(
    leads: Lead[] | null | undefined,
    campo: 'origem' | 'segmento' | 'uf',
    minimo = MINIMO_PARA_COMPARAR,
): RecorteDaConversao[] {
    const mapa = new Map<string, { total: number; clientes: number }>();

    for (const l of leads || []) {
        const chave = ((l[campo] as string) || '').trim() || '(não informado)';
        const atual = mapa.get(chave) || { total: 0, clientes: 0 };
        atual.total++;
        if (l.status === 'cliente') atual.clientes++;
        mapa.set(chave, atual);
    }

    return [...mapa.entries()]
        .map(([chave, v]) => ({ chave, ...v, taxa: v.total > 0 ? v.clientes / v.total : 0 }))
        .sort((a, b) => {
            const aConta = a.total >= minimo;
            const bConta = b.total >= minimo;
            if (aConta !== bConta) return aConta ? -1 : 1;
            if (b.taxa !== a.taxa) return b.taxa - a.taxa;
            return b.total - a.total;
        });
}

export interface MotivoAgrupado {
    motivo: string;
    quantidade: number;
    fatia: number;
}

/**
 * Motivos de perda, agrupados.
 *
 * Perder por preço e perder por prazo pedem decisões opostas — uma mexe na
 * margem, a outra na fábrica. Sem agrupar, os dois viram "não fechou".
 */
export function motivosDePerda(leads: Lead[] | null | undefined): MotivoAgrupado[] {
    const mapa = new Map<string, number>();
    let total = 0;

    for (const l of leads || []) {
        if (l.status !== 'descartado') continue;
        const m = (l.motivo_perda || '').trim().toLowerCase() || '(sem motivo)';
        mapa.set(m, (mapa.get(m) || 0) + 1);
        total++;
    }

    return [...mapa.entries()]
        .map(([motivo, quantidade]) => ({
            motivo,
            quantidade,
            fatia: total > 0 ? quantidade / total : 0,
        }))
        .sort((a, b) => b.quantidade - a.quantidade);
}

/**
 * Dias entre a entrada do lead e o fechamento.
 *
 * O ciclo de venda, que só existe porque o lead sobrevive a virar cliente.
 * `null` para quem ainda não fechou.
 */
export function cicloDeVenda(lead: Lead): number | null {
    if (lead.status !== 'cliente' || !lead.created_at || !lead.updated_at) return null;
    const dias = diasEntre(lead.created_at, lead.updated_at);
    return dias >= 0 ? dias : null;
}

/** Mediana do ciclo — mediana, não média: um lead de dois anos distorce a média. */
export function cicloTipico(leads: Lead[] | null | undefined): number | null {
    const dias = (leads || []).map(cicloDeVenda).filter((d): d is number => d !== null).sort((a, b) => a - b);
    if (dias.length === 0) return null;
    const meio = Math.floor(dias.length / 2);
    return dias.length % 2 ? dias[meio] : Math.round((dias[meio - 1] + dias[meio]) / 2);
}
