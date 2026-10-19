/**
 * Filtrar a prospecção por segmento, porte, capital social e origem.
 *
 * A tela não tinha filtro NENHUM: a lista inteira, todo dia, na mesma ordem.
 * Enquanto são trinta leads dá para varrer com o olho. Passando disso, quem
 * quer ligar para as escolas hoje precisa procurar as escolas no meio dos
 * hospitais — e desiste, ou liga para quem estiver mais perto do topo, que não
 * é a mesma coisa que ligar para quem interessa.
 *
 * SEGMENTO É LISTA FECHADA, e isso não foi acidente: a importação obriga a IA a
 * escolher entre nove valores, porque IA solta inventa categoria nova a cada
 * arquivo — "Saúde", "saude", "Área da saúde" e "Hospitalar" nunca se agrupam,
 * e é o agrupamento que faz o filtro valer alguma coisa.
 *
 * PORTE É FAIXA, não número exato. Ninguém procura "empresa com 47
 * funcionários"; procura "empresa média para cima", porque é o porte que diz
 * quantos uniformes cabem no pedido.
 *
 * CAPITAL SOCIAL entrou na fase 4, e separa o que o porte sozinho não separa:
 * oitenta funcionários numa indústria e oitenta numa prestadora são negócios de
 * tamanhos diferentes, e a conversa de venda também.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export interface LeadFiltravel {
    id: string;
    razao_social?: string | null;
    nome_fantasia?: string | null;
    segmento?: string | null;
    porte_funcionarios?: number | null;
    cidade?: string | null;
    uf?: string | null;
    origem?: string | null;
    status?: string | null;
    capital_social?: number | null;
}

/**
 * As faixas de porte, na linguagem de quem vende uniforme.
 *
 * Os cortes seguem o que muda a conversa comercial, não a classificação do
 * SEBRAE: até 20 é um pedido pequeno que fecha rápido; acima de 200 é
 * concorrência, prazo longo e provavelmente licitação.
 */
export const FAIXAS_DE_PORTE = [
    { id: 'micro', rotulo: 'Até 20', min: 1, max: 20 },
    { id: 'pequena', rotulo: '21 a 100', min: 21, max: 100 },
    { id: 'media', rotulo: '101 a 200', min: 101, max: 200 },
    { id: 'grande', rotulo: 'Mais de 200', min: 201, max: Infinity },
    // Sem porte informado é uma categoria de verdade, e não um resto: na
    // importação de CNPJ esse campo vem vazio com frequência, e esconder esses
    // leads faria a maior parte da base sumir ao primeiro filtro.
    { id: 'sem-porte', rotulo: 'Sem porte informado', min: 0, max: 0 },
] as const;

export type FaixaDePorte = typeof FAIXAS_DE_PORTE[number]['id'];

/**
 * Faixas de capital social, em reais.
 *
 * Os cortes seguem o que muda a conversa, e não uma tabela oficial: até 50 mil
 * costuma ser empresa que compra uniforme uma vez e some; acima de um milhão
 * há orçamento anual, e o pedido se repete.
 *
 * "Sem capital informado" é categoria, não resto — a maior parte da base não
 * tem esse dado enquanto as planilhas antigas não forem reimportadas, e
 * escondê-la faria o filtro apagar quase tudo no dia em que fosse usado.
 */
export const FAIXAS_DE_CAPITAL = [
    { id: 'ate-50k', rotulo: 'Até R$ 50 mil', min: 0.01, max: 50_000 },
    { id: '50k-500k', rotulo: 'R$ 50 mil a 500 mil', min: 50_000.01, max: 500_000 },
    { id: '500k-1m', rotulo: 'R$ 500 mil a 1 mi', min: 500_000.01, max: 1_000_000 },
    { id: 'acima-1m', rotulo: 'Acima de R$ 1 mi', min: 1_000_000.01, max: Infinity },
    { id: 'sem-capital', rotulo: 'Sem capital informado', min: 0, max: 0 },
] as const;

export type FaixaDeCapital = typeof FAIXAS_DE_CAPITAL[number]['id'];

export interface FiltroDeProspeccao {
    /** Vazio = todos. */
    segmento: string;
    faixaDePorte: FaixaDePorte | '';
    faixaDeCapital: FaixaDeCapital | '';
    uf: string;
    origem: string;
    busca: string;
}

export const FILTRO_VAZIO: FiltroDeProspeccao = {
    segmento: '', faixaDePorte: '', faixaDeCapital: '', uf: '', origem: '', busca: '',
};

const normalizar = (t: string | null | undefined) =>
    (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function porteNaFaixa(porte: number | null | undefined, faixa: FaixaDePorte | ''): boolean {
    if (!faixa) return true;
    const n = Number(porte);
    const temPorte = Number.isFinite(n) && n > 0;
    if (faixa === 'sem-porte') return !temPorte;
    if (!temPorte) return false;
    const f = FAIXAS_DE_PORTE.find(x => x.id === faixa);
    return !!f && n >= f.min && n <= f.max;
}

export function capitalNaFaixa(capital: number | null | undefined, faixa: FaixaDeCapital | ''): boolean {
    if (!faixa) return true;
    const n = Number(capital);
    const tem = Number.isFinite(n) && n > 0;
    if (faixa === 'sem-capital') return !tem;
    if (!tem) return false;
    const f = FAIXAS_DE_CAPITAL.find(x => x.id === faixa);
    return !!f && n >= f.min && n <= f.max;
}

export function leadCasa(lead: LeadFiltravel, filtro: FiltroDeProspeccao): boolean {
    if (filtro.segmento && normalizar(lead.segmento) !== normalizar(filtro.segmento)) return false;
    if (!porteNaFaixa(lead.porte_funcionarios, filtro.faixaDePorte)) return false;
    if (!capitalNaFaixa(lead.capital_social, filtro.faixaDeCapital)) return false;
    if (filtro.uf && normalizar(lead.uf) !== normalizar(filtro.uf)) return false;
    if (filtro.origem && normalizar(lead.origem) !== normalizar(filtro.origem)) return false;

    const t = normalizar(filtro.busca);
    if (t) {
        const alvo = [lead.razao_social, lead.nome_fantasia, lead.cidade].map(normalizar).join(' ');
        if (!alvo.includes(t)) return false;
    }
    return true;
}

export const filtrarLeads = <T extends LeadFiltravel>(leads: T[], filtro: FiltroDeProspeccao): T[] =>
    (leads || []).filter(l => leadCasa(l, filtro));

export const filtroEstaAtivo = (f: FiltroDeProspeccao): boolean =>
    !!(f.segmento || f.faixaDePorte || f.faixaDeCapital || f.uf || f.origem || f.busca.trim());

/**
 * Os valores que existem DE VERDADE na base, para o seletor não oferecer
 * escolha vazia.
 *
 * Um filtro que lista as 27 UFs quando a carteira só tem clientes em três
 * obriga a pessoa a procurar dentro do próprio filtro — o problema que o filtro
 * deveria resolver, um nível acima.
 */
export function valoresDisponiveis(leads: LeadFiltravel[]): {
    segmentos: string[]; ufs: string[]; origens: string[];
} {
    const seg = new Set<string>();
    const ufs = new Set<string>();
    const org = new Set<string>();
    for (const l of leads || []) {
        if (l.segmento) seg.add(l.segmento);
        if (l.uf) ufs.add(l.uf);
        if (l.origem) org.add(l.origem);
    }
    const ordenar = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return { segmentos: ordenar(seg), ufs: ordenar(ufs), origens: ordenar(org) };
}

/** Quantos leads em cada segmento — o número ao lado do rótulo no seletor. */
export function contarPorSegmento(leads: LeadFiltravel[]): Record<string, number> {
    const contas: Record<string, number> = {};
    for (const l of leads || []) {
        const k = l.segmento || 'sem segmento';
        contas[k] = (contas[k] || 0) + 1;
    }
    return contas;
}
