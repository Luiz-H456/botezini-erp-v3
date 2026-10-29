/**
 * Composição do nome de uma família de tecido.
 *
 * O nome do tecido é a chave de tudo: o insumo, a cartela de cores e a busca do
 * orçamento se encontram por ele. Quando cada cadastro escreve de um jeito
 * ("Malha PV Guimatex", "MALHA PV ANTI PILLING GUIMATEX 167", "pv guimatex"),
 * a mesma peça vira três tecidos diferentes e a cartela de cores não acha o seu.
 *
 * Puro de propósito — sem imports — para poder ser testado direto.
 */

export interface PartesDoTecido {
    /** Construção: MALHA, BRIM, GABARDINE, OXFORD, PIQUET. */
    tipo?: string;
    /** Composição ou acabamento: PV, 100% ALGODÃO, ANTI PILLING. */
    composicao?: string;
    /** Fabricante: GUIMATEX, SANTANENSE. */
    marca?: string;
    /** Referência do fabricante: 167, 2/1. */
    referencia?: string;
}

const limpa = (v?: string) =>
    (v || '').replace(/\s+/g, ' ').trim();

/**
 * Monta "MALHA PV ANTI PILLING (GUIMATEX 167)".
 *
 * Marca e referência entram entre parênteses no fim porque é assim que a
 * cartela do fornecedor chega e é assim que o pessoal do corte fala. Sem marca,
 * não há parênteses — parênteses vazios num nome impresso na ficha parecem erro
 * de sistema.
 */
export function montarNomeDeTecido(p: PartesDoTecido): string {
    const inicio = [limpa(p.tipo), limpa(p.composicao)].filter(Boolean).join(' ');
    const fim = [limpa(p.marca), limpa(p.referencia)].filter(Boolean).join(' ');
    const nome = fim ? `${inicio} (${fim})`.trim() : inicio;
    return nome.toUpperCase();
}

/**
 * Faz o caminho de volta: de um nome já cadastrado para as suas partes.
 *
 * Serve para abrir um tecido existente na mesma tela em que ele foi criado, em
 * vez de obrigar a redigitar. O que estiver fora do padrão cai inteiro em
 * `tipo`, que é o campo livre — melhor que perder texto tentando adivinhar.
 */
export function separarNomeDeTecido(nome: string): PartesDoTecido {
    const bruto = limpa(nome).toUpperCase();
    if (!bruto) return {};

    const m = bruto.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    if (!m) return { tipo: bruto };

    const inicio = limpa(m[1]);
    const dentro = limpa(m[2]).split(' ');
    // A referência é o último pedaço quando ele tem número; senão tudo é marca.
    const temNumero = dentro.length > 1 && /\d/.test(dentro[dentro.length - 1]);
    return {
        tipo: inicio,
        marca: temNumero ? dentro.slice(0, -1).join(' ') : dentro.join(' '),
        referencia: temNumero ? dentro[dentro.length - 1] : undefined,
    };
}

/** Faixas de cor de um tecido, na ordem em que aparecem na cartela. */
export const FAIXAS_DE_COR = ['Branco', 'Padrão', 'Especial'] as const;
export type FaixaDeCor = (typeof FAIXAS_DE_COR)[number];

/** O nome do insumo de cada faixa: a família mais o sufixo da faixa. */
export function nomeDoInsumoDaFaixa(familia: string, faixa: string): string {
    return `${limpa(familia).toUpperCase()} ${faixa.toUpperCase()}`.trim();
}

export interface CorDaCartela {
    nome: string;
    hex: string;
    /** Nome da faixa do tecido (até 6 por tecido, livres desde a v3.1). */
    faixa: string;
}

/**
 * Descarta linha em branco e cor repetida, mantendo a primeira ocorrência.
 *
 * A cartela é digitada olhando o mostruário do fornecedor, e repetir uma cor
 * ali é fácil. Duas linhas com o mesmo nome fariam o orçamento oferecer a mesma
 * cor duas vezes, em faixas de preço possivelmente diferentes.
 */
export function limparCartela(cores: CorDaCartela[]): CorDaCartela[] {
    const vistas = new Set<string>();
    const saida: CorDaCartela[] = [];
    for (const c of cores || []) {
        const nome = limpa(c?.nome).toUpperCase();
        if (!nome || vistas.has(nome)) continue;
        vistas.add(nome);
        saida.push({ nome, hex: c.hex || '#CCCCCC', faixa: c.faixa || 'Padrão' });
    }
    return saida;
}

// ─── atalhos para montar a cartela ───────────────────────────────────────────

/**
 * Cartela base do uniforme profissional.
 *
 * Digitar cor por cor é o passo mais chato do cadastro — uma cartela de
 * fornecedor tem dezenas — e quase todo tecido de uniforme repete o mesmo
 * núcleo. Esta lista é o ponto de partida: quem cadastra apaga o que não tem e
 * acrescenta o que é específico, em vez de começar da folha em branco.
 *
 * A faixa segue a lógica da casa: branco à parte, cores escuras e neutras no
 * padrão, e as saturadas — que custam mais para tingir — no especial.
 */
export const CARTELA_PADRAO: CorDaCartela[] = [
    { nome: 'BRANCO', hex: '#FFFFFF', faixa: 'Branco' },

    { nome: 'PRETO', hex: '#1A1A1A', faixa: 'Padrão' },
    { nome: 'AZUL MARINHO', hex: '#1E3A5F', faixa: 'Padrão' },
    { nome: 'CINZA', hex: '#808080', faixa: 'Padrão' },
    { nome: 'CINZA MESCLA', hex: '#9CA3AF', faixa: 'Padrão' },
    { nome: 'BEGE', hex: '#D9C9A8', faixa: 'Padrão' },
    { nome: 'MARROM', hex: '#5C4033', faixa: 'Padrão' },
    { nome: 'VERDE MUSGO', hex: '#4A5D23', faixa: 'Padrão' },

    { nome: 'AZUL ROYAL', hex: '#1E40AF', faixa: 'Especial' },
    { nome: 'VERDE BANDEIRA', hex: '#006B3F', faixa: 'Especial' },
    { nome: 'VERMELHO', hex: '#C41E3A', faixa: 'Especial' },
    { nome: 'LARANJA', hex: '#E8590C', faixa: 'Especial' },
    { nome: 'AMARELO', hex: '#F2C200', faixa: 'Especial' },
    { nome: 'VINHO', hex: '#6B1F2E', faixa: 'Especial' },
];

const FAIXA_POR_TEXTO: Record<string, FaixaDeCor> = {
    'BRANCO': 'Branco', 'BRANCA': 'Branco',
    'PADRAO': 'Padrão', 'PADRÃO': 'Padrão', 'NORMAL': 'Padrão',
    'ESPECIAL': 'Especial',
};

/**
 * Lê uma lista colada do mostruário: uma cor por linha.
 *
 * Aceita `NOME`, `NOME #1E3A5F` e `NOME ; ESPECIAL` em qualquer combinação. A
 * faixa só é reconhecida DEPOIS de um separador explícito (`;` ou `|`), nunca
 * pela última palavra solta — senão a cor chamada "BRANCO" viraria uma linha
 * sem nome, com o nome interpretado como faixa.
 */
export function interpretarListaDeCores(
    texto: string,
    faixaPadrao: string = 'Padrão',
    /** As faixas do tecido (v3.1). Sem elas, as três antigas. */
    faixas: readonly string[] = FAIXAS_DE_COR,
): CorDaCartela[] {
    const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
    const porTexto = new Map(faixas.map(f => [semAcento(f), f]));
    for (const [k, v] of Object.entries(FAIXA_POR_TEXTO)) if (faixas.includes(v)) porTexto.set(semAcento(k), v);
    const saida: CorDaCartela[] = [];
    for (const bruta of (texto || '').split(/\r?\n/)) {
        let linha = bruta.trim();
        if (!linha) continue;

        let faixa = faixaPadrao;
        const corte = linha.search(/[;|]/);
        if (corte >= 0) {
            const depois = linha.slice(corte + 1).trim().toUpperCase();
            const achada = porTexto.get(semAcento(depois));
            if (achada) {
                faixa = achada;
                linha = linha.slice(0, corte).trim();
            }
        }

        let hex = '';
        const m = linha.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/);
        if (m) {
            hex = m[0].toUpperCase();
            linha = linha.replace(m[0], '').trim();
        }

        const nome = linha.replace(/[\s,;|-]+$/, '').trim();
        if (!nome) continue;
        saida.push({ nome: nome.toUpperCase(), hex: hex || '#CCCCCC', faixa });
    }
    return limparCartela(saida);
}
