// Rendimento do corte — quanto de tecido a ficha previu, quanto o enfesto gastou.
//
// POR QUE ESTE NÚMERO
// Tecido é a maior fatia do custo da peça. Melhorar o encaixe é a alavanca mais
// direta que existe sobre a margem — e hoje ninguém sabe dizer se ele está
// melhorando, piorando ou parado, porque o dado não é guardado em lugar nenhum.
//
// A razão gasto ÷ previsto é o que responde isso. É também o número que decide
// se vale a pena investir em software de encaixe: 1,02 diz que não há muito a
// ganhar; 1,25 diz que há um quarto do maior custo da peça no chão.
//
// NÃO É SÓ "METROS"
// Tecido comprado em quilo é contado em quilo, e chamar isso de metro seria
// errado de um jeito que ninguém perceberia. Cada registro carrega a unidade do
// próprio insumo. A razão é adimensional — e é por isso que ela, e não o total,
// é o que se compara entre tecidos diferentes.
//
// Sem imports do app, para ser testado direto com `node --test`.

export interface InsumoDeTecido {
    id: string;
    name?: string | null;
    unit?: string | null;
    /** Família do tecido no cadastro. Presente = é tecido, sem discussão. */
    fabric_family?: string | null;
    category?: string | null;
}

/**
 * Unidades em que tecido é comprado.
 *
 * Serve de segunda porta para o insumo que é tecido mas nunca ganhou família
 * cadastrada — o que é o caso comum, já que a família só passou a existir com
 * as faixas de cor.
 */
const UNIDADES_DE_TECIDO = new Set(['m', 'mt', 'metro', 'metros', 'kg', 'quilo', 'kilo']);

/**
 * Este insumo é tecido?
 *
 * A família cadastrada decide sozinha. Sem ela, cai na unidade — e a unidade
 * erra para o lado de INCLUIR: um insumo em metros que não é tecido (elástico,
 * viés) entra na lista e alguém deixa o campo em branco, o que não estraga
 * nada. O erro caro seria o contrário — deixar o tecido principal de fora e o
 * número mais importante nunca aparecer.
 */
export function ehTecido(insumo: InsumoDeTecido | null | undefined): boolean {
    if (!insumo) return false;
    if ((insumo.fabric_family || '').trim()) return true;
    const unidade = (insumo.unit || '').trim().toLowerCase();
    if (UNIDADES_DE_TECIDO.has(unidade)) return true;
    return (insumo.category || '').trim().toLowerCase().includes('tecido');
}

/** Quanto a ficha previu de cada tecido, para um pedido. */
export interface PrevistoDeTecido {
    insumo_id: string;
    nome: string;
    unidade: string;
    previsto: number;
}

/**
 * Filtra a baixa planejada, ficando só com os tecidos.
 *
 * Reaproveita a MESMA conta que desconta o estoque (utils/baixaDeProducao). Se
 * o previsto do rendimento saísse de outro cálculo, os dois números divergiriam
 * na primeira mudança de ficha — e o rendimento passaria a medir a diferença
 * entre duas contas em vez do desempenho do corte.
 */
export function previstoDeTecidos(
    baixas: { insumo_id: string; quantidade: number }[] | null | undefined,
    insumos: InsumoDeTecido[] | null | undefined,
): PrevistoDeTecido[] {
    const porId = new Map((insumos || []).map(i => [i.id, i]));
    return (baixas || [])
        .filter(b => ehTecido(porId.get(b.insumo_id)))
        .map(b => {
            const i = porId.get(b.insumo_id);
            return {
                insumo_id: b.insumo_id,
                nome: i?.name || '(sem nome)',
                unidade: (i?.unit || 'un').trim().toLowerCase(),
                previsto: b.quantidade,
            };
        })
        .sort((a, b) => b.previsto - a.previsto);
}

export interface RegistroDeCorte {
    insumo_id: string;
    insumo_name?: string | null;
    previsto: number;
    /** O que o corte de fato consumiu. Ausente = ainda não informado. */
    gasto?: number | null;
    /** Para a tendência. ISO (aaaa-mm-dd). */
    data?: string | null;
}

export type Veredito = 'economia' | 'dentro' | 'desperdicio';

/**
 * Folga em que previsto e realizado são considerados iguais.
 *
 * Cinco por cento não é generosidade: é a largura da variação normal entre uma
 * peça de tecido e outra, do encolhimento e da própria medição no enfesto.
 * Apertar mais faria todo corte parecer desperdício e o alerta viraria ruído.
 */
export const TOLERANCIA = 0.05;

/** gasto ÷ previsto. `null` quando falta um dos dois. */
export function razaoDoCorte(r: RegistroDeCorte | null | undefined): number | null {
    if (!r) return null;
    const previsto = Number(r.previsto);
    const gasto = Number(r.gasto);
    if (!Number.isFinite(previsto) || previsto <= 0) return null;
    if (!Number.isFinite(gasto) || gasto <= 0) return null;
    return gasto / previsto;
}

export function classificar(razao: number | null | undefined): Veredito | null {
    if (razao === null || razao === undefined || !Number.isFinite(razao)) return null;
    if (razao > 1 + TOLERANCIA) return 'desperdicio';
    if (razao < 1 - TOLERANCIA) return 'economia';
    return 'dentro';
}

export const ROTULO_DO_VEREDITO: Record<Veredito, string> = {
    economia: 'gastou menos que o previsto',
    dentro: 'dentro do previsto',
    desperdicio: 'gastou mais que o previsto',
};

export interface ResumoDeTecido {
    insumo_id: string;
    nome: string;
    previsto: number;
    gasto: number;
    razao: number;
    amostras: number;
    veredito: Veredito;
}

export interface ResumoDoRendimento {
    /** Só dos registros com gasto informado. */
    previsto: number;
    gasto: number;
    /** A razão da CASA: soma dos gastos ÷ soma dos previstos. */
    razao: number | null;
    amostras: number;
    /** Registros ainda sem o gasto informado. */
    pendentes: number;
    veredito: Veredito | null;
    /** Quanto se gastou a mais (ou a menos) que o previsto, na unidade de cada. */
    excedente: number;
    porTecido: ResumoDeTecido[];
}

/**
 * O panorama.
 *
 * A razão da casa é ponderada pelo volume — soma dos gastos sobre soma dos
 * previstos — e não a média das razões. Uma média simples deixaria um corte de
 * três metros pesar igual a um de trezentos, e o número diria mais sobre os
 * pedidos pequenos do que sobre o tecido que a fábrica realmente gasta.
 *
 * Só tecidos com a MESMA unidade podem ser somados; como a razão é
 * adimensional, o total por tecido soma sem problema dentro de cada linha, e a
 * razão geral sai da soma das razões ponderadas pelo previsto de cada um.
 */
export function resumirRendimento(
    registros: RegistroDeCorte[] | null | undefined,
): ResumoDoRendimento {
    const lista = registros || [];
    const porTecido = new Map<string, { nome: string; previsto: number; gasto: number; amostras: number }>();

    let previsto = 0;
    let gasto = 0;
    let amostras = 0;
    let pendentes = 0;

    for (const r of lista) {
        const razao = razaoDoCorte(r);
        if (razao === null) { pendentes++; continue; }

        const p = Number(r.previsto);
        const g = Number(r.gasto);
        previsto += p;
        gasto += g;
        amostras++;

        const atual = porTecido.get(r.insumo_id)
            || { nome: r.insumo_name || '(sem nome)', previsto: 0, gasto: 0, amostras: 0 };
        atual.previsto += p;
        atual.gasto += g;
        atual.amostras++;
        porTecido.set(r.insumo_id, atual);
    }

    const razao = previsto > 0 ? gasto / previsto : null;

    return {
        previsto,
        gasto,
        razao,
        amostras,
        pendentes,
        veredito: classificar(razao),
        excedente: gasto - previsto,
        porTecido: [...porTecido.entries()]
            .map(([insumo_id, t]) => ({
                insumo_id,
                nome: t.nome,
                previsto: t.previsto,
                gasto: t.gasto,
                razao: t.gasto / t.previsto,
                amostras: t.amostras,
                veredito: classificar(t.gasto / t.previsto)!,
            }))
            // Pelo excedente absoluto: o tecido em que mais material foi
            // embora, não o de pior percentual num corte de dois metros.
            .sort((a, b) => (b.gasto - b.previsto) - (a.gasto - a.previsto)),
    };
}

export interface Tendencia {
    /** Razão da metade mais antiga e da mais recente. */
    antes: number;
    depois: number;
    /** Negativo = melhorou (gasta-se menos por peça prevista). */
    variacao: number;
    melhorou: boolean;
    amostras: number;
}

/**
 * Está melhorando?
 *
 * Compara as duas metades da série no tempo. Não é sofisticado de propósito:
 * com poucas dezenas de cortes por ano, qualquer regressão daria uma reta
 * confiante em cima de ruído. Duas metades e a diferença entre elas é o que a
 * amostra sustenta.
 *
 * `null` abaixo do mínimo — dizer "piorou 8%" com três cortes seria inventar
 * uma certeza que o dado não tem.
 */
export const MINIMO_PARA_TENDENCIA = 6;

export function tendenciaDoCorte(
    registros: RegistroDeCorte[] | null | undefined,
): Tendencia | null {
    const validos = (registros || [])
        .filter(r => razaoDoCorte(r) !== null)
        .sort((a, b) => (a.data || '').localeCompare(b.data || ''));

    if (validos.length < MINIMO_PARA_TENDENCIA) return null;

    const meio = Math.floor(validos.length / 2);
    const razaoDe = (parte: RegistroDeCorte[]) => {
        const p = parte.reduce((s, r) => s + Number(r.previsto), 0);
        const g = parte.reduce((s, r) => s + Number(r.gasto), 0);
        return p > 0 ? g / p : 0;
    };

    const antes = razaoDe(validos.slice(0, meio));
    const depois = razaoDe(validos.slice(meio));

    return {
        antes,
        depois,
        variacao: depois - antes,
        melhorou: depois < antes,
        amostras: validos.length,
    };
}
