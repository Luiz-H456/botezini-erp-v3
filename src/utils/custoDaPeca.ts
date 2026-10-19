// Custo de produção de UMA peça, e o preço abaixo do qual ela dá prejuízo.
//
// POR QUE EXISTE
// Esta conta morava solta dentro do formulário de produto, sem teste, e por
// isso não conseguia sair de lá. O resultado é que a tela onde o preço é
// DECIDIDO — o orçamento — nunca soube quanto a peça custa. Vender abaixo do
// custo é, hoje, silencioso.
//
// O QUE ENTRA NA CONTA
//   tecido      consumo por peça × custo do metro
//   overhead    percentual sobre o tecido, que representa os demais insumos
//               (linha, botão, etiqueta) e a energia
//   mão de obra horas por peça × custo da hora
//
// A ficha técnica NÃO é somada aqui, de propósito: é justamente o overhead que
// está no lugar dela. Somar os dois cobraria os mesmos insumos duas vezes.
//
// AUSÊNCIA É INFORMAÇÃO
// Nada aqui devolve zero por não saber. Cada parte que falta entra em `faltas`
// e a soma vira um PISO do custo, não o custo. Um custo zero exibido como se
// fosse real é pior que a ausência declarada — e é exatamente o que faz o
// alerta de margem nunca disparar.
//
// Sem imports do app, para ser testado direto com `node --test`.

export interface InsumoDeCusto {
    average_unit_cost?: number | null;
    unit?: string | null;
    /** Metros por kg. Só faz sentido para o que é comprado em peso. */
    rendimento?: number | null;
}

export type FaltaNoCusto =
    | 'tecido-nao-escolhido'
    | 'tecido-sem-custo'
    | 'tecido-sem-rendimento'
    | 'consumo-nao-cadastrado'
    | 'mao-de-obra-nao-cadastrada';

export const ROTULO_DA_FALTA: Record<FaltaNoCusto, string> = {
    'tecido-nao-escolhido': 'tecido não escolhido',
    'tecido-sem-custo': 'tecido sem custo',
    'tecido-sem-rendimento': 'tecido em kg sem rendimento',
    'consumo-nao-cadastrado': 'consumo de tecido não cadastrado',
    'mao-de-obra-nao-cadastrada': 'mão de obra não cadastrada',
};

/**
 * Percentual padrão de overhead.
 *
 * Diferente das outras entradas, este é uma CONVENÇÃO da casa e não uma medida
 * do produto — por isso um padrão aqui não é inventar dado, é aplicar a regra
 * combinada. Um valor explícito, inclusive zero, sempre vence o padrão.
 */
export const OVERHEAD_PADRAO = 40;

/** Jornada considerada ao repartir a hora do costureiro entre as peças do dia. */
export const HORAS_POR_DIA = 8;

export interface ParametrosDoCusto {
    /** Metros de tecido por peça — do cadastro do produto. */
    consumoM?: number | null;
    /**
     * O tecido escolhido NA LINHA do orçamento, não o padrão do produto.
     *
     * É a razão de esta conta valer a pena no orçamento: trocar o tecido muda o
     * custo da peça, e é ali que a troca acontece.
     */
    tecido?: InsumoDeCusto | null;
    /** Percentual sobre o tecido. Ausente cai no padrão; zero é zero. */
    overheadPercent?: number | null;
    operarios?: number | null;
    pecasPorDia?: number | null;
    custoHora?: number | null;
    /** Alíquota sobre a VENDA, 0..1. */
    aliquota?: number | null;
    horasPorDia?: number | null;
}

export interface CustoDaPeca {
    /** `null` quando não se sabe — nunca zero por ignorância. */
    tecido: number | null;
    overhead: number | null;
    maoDeObra: number | null;
    /**
     * Soma do que se sabe.
     *
     * Quando há faltas, isto é um PISO do custo real: o que se sabe já custa
     * isto, e o resto só aumenta. Um preço abaixo daqui é prejuízo certo, e é
     * por isso que o número parcial ainda vale a pena mostrar.
     */
    producao: number;
    /**
     * Preço em que a receita cobre o custo mais o imposto que ela mesma gera.
     *
     * O imposto incide sobre a venda, não sobre o custo — por isso se divide
     * por (1 − alíquota) em vez de multiplicar por (1 + alíquota). A segunda
     * forma provisiona imposto a menos e o piso sai baixo demais.
     */
    piso: number;
    aliquota: number;
    faltas: FaltaNoCusto[];
    /** Verdadeiro só quando nada falta. */
    completo: boolean;
    /** Falso quando não há número nenhum a mostrar. */
    temAlgo: boolean;
}

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const positivo = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Custo de um METRO do tecido.
 *
 * O que é comprado em quilo precisa do rendimento (metros por kg) para virar
 * preço por metro. Sem ele a conversão é impossível — e usar o preço do quilo
 * como se fosse o do metro erra por um fator que costuma passar de três. Por
 * isso devolve `null` em vez de chutar.
 */
export function custoDoTecidoPorMetro(
    insumo: InsumoDeCusto | null | undefined,
): { valor: number | null; falta?: FaltaNoCusto } {
    if (!insumo) return { valor: null, falta: 'tecido-nao-escolhido' };

    const custo = positivo(insumo.average_unit_cost);
    if (custo === null) return { valor: null, falta: 'tecido-sem-custo' };

    const emPeso = (insumo.unit || '').trim().toLowerCase() === 'kg';
    if (!emPeso) return { valor: custo };

    const rendimento = positivo(insumo.rendimento);
    if (rendimento === null) return { valor: null, falta: 'tecido-sem-rendimento' };

    return { valor: custo / rendimento };
}

/**
 * Horas de costura embutidas em uma peça.
 *
 * A jornada da equipe dividida pelo que ela entrega no dia. Precisa das duas
 * pontas: sem a capacidade diária não há por onde repartir.
 */
export function horasPorPeca(
    operarios: number | null | undefined,
    pecasPorDia: number | null | undefined,
    horasDeJornada: number | null | undefined = HORAS_POR_DIA,
): number | null {
    const gente = positivo(operarios);
    const pecas = positivo(pecasPorDia);
    const jornada = positivo(horasDeJornada) ?? HORAS_POR_DIA;
    if (gente === null || pecas === null) return null;
    return (gente * jornada) / pecas;
}

/** A conta inteira. */
export function custoDaPeca(p: ParametrosDoCusto): CustoDaPeca {
    const faltas: FaltaNoCusto[] = [];

    // ── Tecido ──────────────────────────────────────────────────────────────
    const porMetro = custoDoTecidoPorMetro(p.tecido);
    if (porMetro.falta) faltas.push(porMetro.falta);

    const consumo = positivo(p.consumoM);
    if (consumo === null) faltas.push('consumo-nao-cadastrado');

    const tecido = porMetro.valor !== null && consumo !== null
        ? porMetro.valor * consumo
        : null;

    // ── Overhead ────────────────────────────────────────────────────────────
    // Percentual sobre o tecido: sem saber o tecido, não há sobre o que incidir.
    const percentual = p.overheadPercent === null || p.overheadPercent === undefined
        ? OVERHEAD_PADRAO
        : Math.max(0, num(p.overheadPercent));
    const overhead = tecido !== null ? tecido * (percentual / 100) : null;

    // ── Mão de obra ─────────────────────────────────────────────────────────
    const horas = horasPorPeca(p.operarios, p.pecasPorDia, p.horasPorDia);
    const valorHora = positivo(p.custoHora);
    const maoDeObra = horas !== null && valorHora !== null ? horas * valorHora : null;
    if (maoDeObra === null) faltas.push('mao-de-obra-nao-cadastrada');

    // ── Fecho ───────────────────────────────────────────────────────────────
    const producao = num(tecido) + num(overhead) + num(maoDeObra);
    // Teto em 0.9: uma alíquota de 100% faria o piso ir ao infinito, e o
    // resultado na tela seria um número sem sentido em vez de um aviso.
    const aliquota = Math.min(0.9, Math.max(0, num(p.aliquota)));

    return {
        tecido,
        overhead,
        maoDeObra,
        producao,
        piso: producao / (1 - aliquota),
        aliquota,
        faltas,
        completo: faltas.length === 0,
        temAlgo: producao > 0,
    };
}

/**
 * Margem do preço digitado, já descontado o imposto que a venda recolhe.
 *
 * `null` quando não há custo conhecido — porque uma margem calculada sobre
 * custo zero daria 100% e seria a mentira mais cara da tela.
 *
 * Com faltas no custo, a margem sai OTIMISTA: é o teto do que se pode esperar,
 * já que o que falta só tem como reduzi-la. Quem exibe precisa dizer isso.
 */
export function margemDoPreco(preco: number | null | undefined, custo: CustoDaPeca): number | null {
    const p = positivo(preco);
    if (p === null || !custo.temAlgo) return null;
    return (p - p * custo.aliquota - custo.producao) / p;
}

/**
 * Verdadeiro quando o preço não cobre nem o custo conhecido.
 *
 * Com custo parcial isto continua valendo, e vale MAIS: se o preço já não cobre
 * o pedaço que se conhece, o prejuízo é certo, não estimado.
 */
export function abaixoDoPiso(preco: number | null | undefined, custo: CustoDaPeca): boolean {
    const p = positivo(preco);
    if (p === null || !custo.temAlgo) return false;
    return p < custo.piso;
}

/** As faltas em uma frase, para caber num badge. */
export function descreverFaltas(faltas: FaltaNoCusto[]): string {
    const nomes = faltas.map(f => ROTULO_DA_FALTA[f]);
    if (nomes.length === 0) return '';
    if (nomes.length === 1) return nomes[0];
    return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}
