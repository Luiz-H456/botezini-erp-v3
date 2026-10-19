// Padrão de nome e SKU das peças. Sem imports, para ser testado direto.
//
// Por que existe: o nome do produto era texto livre, então a mesma peça entrava
// no catálogo como "Polo M/C masc", "CAMISA POLO MANGA CURTA MASCULINO" ou
// "polo piquê m curta". Isso quebra a busca, duplica cadastro e faz a mesma
// peça aparecer duas vezes no orçamento. Aqui existe UMA ordem e UM formato.
//
// O que NÃO entra no nome, de propósito:
//   cor    — varia por pedido, e a faixa de preço da cor já é tratada à parte
//   tamanho— varia por item do pedido
// O que entra: só o que muda a FICHA TÉCNICA, ou seja, o que faz a peça
// consumir tecido diferente e virar outro produto (manga, gênero, modelagem).

export type Manga = 'manga_curta' | 'manga_longa' | 'sem_manga';
export type Genero = 'masculino' | 'feminino' | 'infantil' | 'unissex';
export type Modelagem = 'slim' | 'regular' | 'oversized' | 'babylook' | 'plus_size';

export interface PartesDoNome {
    tipo?: string;
    manga?: Manga | '';
    genero?: Genero | '';
    modelagem?: Modelagem | '';
    tecido?: string;
    faixaRefletiva?: boolean;
}

/** A ORDEM é o padrão. Mudar isto renomeia o catálogo inteiro. */
const MANGA_NOME: Record<Manga, string> = {
    manga_curta: 'MANGA CURTA',
    manga_longa: 'MANGA LONGA',
    sem_manga: 'SEM MANGA',
};

// Abreviado de propósito: "MASCULINA/MASCULINO" concordaria com o gênero
// gramatical da peça (camisa masculinA, jaleco masculinO) e daria nome errado
// na metade dos casos. MASC/FEM não tem concordância para errar.
const GENERO_NOME: Record<Genero, string> = {
    masculino: 'MASC',
    feminino: 'FEM',
    infantil: 'INF',
    unissex: 'UNISSEX',
};

const MODELAGEM_NOME: Record<Modelagem, string> = {
    slim: 'SLIM',
    regular: 'REGULAR',
    oversized: 'OVERSIZED',
    babylook: 'BABYLOOK',
    plus_size: 'PLUS SIZE',
};

const MANGA_SKU: Record<Manga, string> = { manga_curta: 'MC', manga_longa: 'ML', sem_manga: 'SM' };
const GENERO_SKU: Record<Genero, string> = { masculino: 'M', feminino: 'F', infantil: 'I', unissex: 'U' };
const MODELAGEM_SKU: Record<Modelagem, string> = {
    slim: 'SLIM', regular: 'REG', oversized: 'OVER', babylook: 'BABY', plus_size: 'PLUS',
};

/** Espaços repetidos e sobras nas pontas viram um espaço só. */
function limpar(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}

/** Tira acento e tudo que não é letra/número — só para o SKU. */
function semAcento(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '');
}

/**
 * Monta o nome no padrão:
 *
 *   TIPO · MANGA · GÊNERO · MODELAGEM · TECIDO · C/ FAIXA REFLETIVA
 *
 * Campo vazio simplesmente não aparece — sem placeholder, sem valor implícito.
 * Deixar a modelagem em branco significa "não especificado", nunca "regular":
 * um padrão com valor subentendido é um padrão que ninguém consegue conferir.
 */
export function montarNomeProduto(p: PartesDoNome): string {
    const partes = [
        limpar(p.tipo || '').toUpperCase(),
        p.manga ? MANGA_NOME[p.manga] : '',
        p.genero ? GENERO_NOME[p.genero] : '',
        p.modelagem ? MODELAGEM_NOME[p.modelagem] : '',
        limpar(p.tecido || '').toUpperCase(),
        // Escrito por extenso: é atributo de segurança (NR), e abreviar
        // atributo de segurança é como se cadastra a peça errada.
        p.faixaRefletiva ? 'C/ FAIXA REFLETIVA' : '',
    ];
    return limpar(partes.filter(Boolean).join(' '));
}

/** Iniciais do tipo para o SKU: 3 letras de cada uma das 2 primeiras palavras. */
function abreviarTipo(tipo: string): string {
    const palavras = semAcento(limpar(tipo)).split(' ').filter(Boolean).slice(0, 2);
    return palavras.map(w => w.slice(0, 3)).join('').toUpperCase();
}

/**
 * Monta o SKU no mesmo padrão do nome, em blocos separados por hífen:
 *
 *   CAMPOL-MC-M-SLIM-PIQ-FX
 *
 * Mesma ordem do nome de propósito — quem lê o SKU consegue reconstruir a peça
 * sem consultar tabela nenhuma.
 */
export function montarSkuProduto(p: PartesDoNome): string {
    const blocos = [
        abreviarTipo(p.tipo || ''),
        p.manga ? MANGA_SKU[p.manga] : '',
        p.genero ? GENERO_SKU[p.genero] : '',
        p.modelagem ? MODELAGEM_SKU[p.modelagem] : '',
        semAcento(limpar(p.tecido || '')).split(' ')[0].slice(0, 3).toUpperCase(),
        p.faixaRefletiva ? 'FX' : '',
    ];
    return blocos.filter(Boolean).join('-');
}

// ── Caminho de volta: ler o nome e recuperar os atributos ───────────────────

/** O que dá para afirmar lendo um nome de produto. */
export interface AtributosDoNome {
    manga?: Manga;
    genero?: Genero;
    modelagem?: Modelagem;
    faixaRefletiva?: boolean;
}

type Campo = 'manga' | 'genero' | 'modelagem' | 'faixa';

interface Termo { campo: Campo; palavras: string[]; valor?: string }

/**
 * Vocabulário de leitura — UMA tabela para as duas operações.
 *
 * É o mesmo dado que diz "isto é manga curta" e "estas palavras saem do nome
 * principal". Se fossem duas listas, uma sairia do lugar e o orçamento
 * mostraria a característica duas vezes: no nome e no campo.
 *
 * O padrão ESCREVE só uma forma, mas o catálogo antigo foi digitado à mão —
 * reconhecer as variações faz isto valer para os produtos que já existem.
 *
 * Frases mais longas vêm primeiro: "SLIM FIT" antes de "SLIM" (senão sobra um
 * "FIT" solto no nome), "PLUS SIZE" antes de "PLUS", e "C FAIXA REFLETIVA"
 * antes de "FAIXA REFLETIVA" (senão sobra o "C").
 */
const VOCABULARIO: Termo[] = [
    { campo: 'faixa', palavras: ['C', 'FAIXA', 'REFLETIVA'] },
    { campo: 'faixa', palavras: ['FAIXA', 'REFLETIVA'] },
    { campo: 'faixa', palavras: ['C', 'FAIXA'] },
    { campo: 'faixa', palavras: ['REFLETIVA'] },
    { campo: 'faixa', palavras: ['REFLETIVO'] },

    { campo: 'manga', palavras: ['MANGA', 'CURTA'], valor: 'manga_curta' },
    { campo: 'manga', palavras: ['M', 'CURTA'], valor: 'manga_curta' },
    // "M/C" e "M/L" — a abreviação que a fábrica usa no dia a dia. Vêm como
    // duas palavras porque a barra virou espaço. Sem estas duas entradas, o
    // "M" e o "C" sobravam soltos no nome principal.
    { campo: 'manga', palavras: ['M', 'C'], valor: 'manga_curta' },
    { campo: 'manga', palavras: ['MANGA', 'LONGA'], valor: 'manga_longa' },
    { campo: 'manga', palavras: ['M', 'LONGA'], valor: 'manga_longa' },
    { campo: 'manga', palavras: ['M', 'L'], valor: 'manga_longa' },
    { campo: 'manga', palavras: ['SEM', 'MANGA'], valor: 'sem_manga' },
    { campo: 'manga', palavras: ['S', 'MANGA'], valor: 'sem_manga' },

    { campo: 'genero', palavras: ['MASCULINO'], valor: 'masculino' },
    { campo: 'genero', palavras: ['MASCULINA'], valor: 'masculino' },
    { campo: 'genero', palavras: ['MASC'], valor: 'masculino' },
    { campo: 'genero', palavras: ['FEMININO'], valor: 'feminino' },
    { campo: 'genero', palavras: ['FEMININA'], valor: 'feminino' },
    { campo: 'genero', palavras: ['FEM'], valor: 'feminino' },
    { campo: 'genero', palavras: ['INFANTIL'], valor: 'infantil' },
    { campo: 'genero', palavras: ['INF'], valor: 'infantil' },
    { campo: 'genero', palavras: ['UNISSEX'], valor: 'unissex' },
    { campo: 'genero', palavras: ['UNISEX'], valor: 'unissex' },

    { campo: 'modelagem', palavras: ['SLIM', 'FIT'], valor: 'slim' },
    { campo: 'modelagem', palavras: ['SLIM'], valor: 'slim' },
    { campo: 'modelagem', palavras: ['REGULAR'], valor: 'regular' },
    { campo: 'modelagem', palavras: ['OVER', 'SIZED'], valor: 'oversized' },
    { campo: 'modelagem', palavras: ['OVER', 'SIZE'], valor: 'oversized' },
    { campo: 'modelagem', palavras: ['OVERSIZED'], valor: 'oversized' },
    { campo: 'modelagem', palavras: ['OVERSIZE'], valor: 'oversized' },
    { campo: 'modelagem', palavras: ['BABY', 'LOOK'], valor: 'babylook' },
    { campo: 'modelagem', palavras: ['BABYLOOK'], valor: 'babylook' },
    { campo: 'modelagem', palavras: ['PLUS', 'SIZE'], valor: 'plus_size' },
    { campo: 'modelagem', palavras: ['PLUS'], valor: 'plus_size' },
];

/**
 * Quebra o nome em palavras, guardando o original e a versão comparável.
 *
 * Ponto e barra viram espaço para "M. CURTA", "M.CURTA" e "S/ MANGA" caírem
 * todos na mesma sequência de palavras — sem isso cada variação de pontuação
 * precisaria da sua própria entrada no vocabulário.
 */
function emPalavras(nome: string): { original: string[]; comparavel: string[] } {
    const original = limpar((nome || '').replace(/[./]/g, ' ')).split(' ').filter(Boolean);
    return { original, comparavel: original.map(w => semAcento(w).toUpperCase()) };
}

/** Índices das palavras consumidas por cada termo reconhecido. */
function casar(comparavel: string[]): { achados: Map<Campo, string>; consumidas: Set<number> } {
    const achados = new Map<Campo, string>();
    const consumidas = new Set<number>();
    for (const termo of VOCABULARIO) {
        // Um campo só é preenchido uma vez: a primeira (mais longa) forma vence.
        if (achados.has(termo.campo)) continue;
        const n = termo.palavras.length;
        for (let i = 0; i + n <= comparavel.length; i++) {
            if (consumidas.has(i)) continue;
            let bate = true;
            for (let k = 0; k < n; k++) {
                if (comparavel[i + k] !== termo.palavras[k]) { bate = false; break; }
            }
            if (!bate) continue;
            achados.set(termo.campo, termo.valor ?? 'sim');
            for (let k = 0; k < n; k++) consumidas.add(i + k);
            break;
        }
    }
    return { achados, consumidas };
}

/**
 * Lê um nome de produto e devolve os atributos que ele declara.
 *
 * Extrai SÓ o vocabulário fechado (manga, gênero, modelagem, faixa). Tipo de
 * peça e tecido ficam de fora de propósito: são texto livre de tamanho
 * variável, e sem separador não existe como saber onde um termina e o outro
 * começa — "JALECO OXFORD" tanto pode ser a peça "Jaleco" no tecido "Oxford"
 * quanto uma peça chamada "Jaleco Oxford". Chutar ali encheria o orçamento de
 * dado errado; o tecido, aliás, vem da ficha técnica, que é fonte melhor.
 *
 * Atributo não reconhecido volta `undefined` — nunca um palpite.
 */
export function interpretarNomeProduto(nome: string): AtributosDoNome {
    const { comparavel } = emPalavras(nome);
    const { achados } = casar(comparavel);
    return {
        manga: achados.get('manga') as Manga | undefined,
        genero: achados.get('genero') as Genero | undefined,
        modelagem: achados.get('modelagem') as Modelagem | undefined,
        faixaRefletiva: achados.has('faixa') || undefined,
    };
}

/**
 * O nome sem as características que viram campo próprio no orçamento.
 *
 *   "CAMISA POLO MANGA CURTA MASC SLIM PIQUÊ"  →  "CAMISA POLO PIQUÊ"
 *
 * Existe para o orçamento não dizer a mesma coisa duas vezes: se o nome do item
 * já traz "MANGA CURTA" e o campo Manga também, a linha fica repetitiva e, pior,
 * as duas podem divergir quando alguém troca só uma delas.
 *
 * `termosExtras` remove também o tecido, quando a ficha técnica já disse qual é
 * — é a única forma segura de tirá-lo, já que sozinho no texto ele não se
 * distingue do nome da peça.
 */
export function nomePrincipal(nome: string, termosExtras: string[] = []): string {
    const { original, comparavel } = emPalavras(nome);
    const { consumidas } = casar(comparavel);

    for (const termo of termosExtras) {
        const alvo = emPalavras(termo).comparavel;
        if (alvo.length === 0) continue;
        for (let i = 0; i + alvo.length <= comparavel.length; i++) {
            if (alvo.every((w, k) => comparavel[i + k] === w)) {
                for (let k = 0; k < alvo.length; k++) consumidas.add(i + k);
            }
        }
    }

    return original.filter((_, i) => !consumidas.has(i)).join(' ');
}
