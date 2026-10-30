/**
 * Custo das personalizações (parte E, 30/10): o que a estamparia cobra, não o que se cobra do cliente
 * (isso é a tabela de preços da Personalização). Puro, sem import do app.
 *
 *   DTF     — rolo de largura fixa cobrado por metro linear: o custo é quantos metros o lote gasta.
 *   Silk    — grade da estamparia: tamanho × número de cores → valor por peça.
 *   Bordado — a arte (programação) uma vez, mais pontos/1000 × valor do milheiro por peça.
 */

const c2 = (v: number) => Math.round(v * 100) / 100;
const c4 = (v: number) => Math.round(v * 10000) / 10000;

// ── DTF ───────────────────────────────────────────────────────────────────────────────────────

export interface EncaixeDtf {
    /** A arte entrou deitada (largura e altura trocadas) porque gasta menos rolo assim. */
    girada: boolean;
    porLinha: number;
    linhas: number;
    /** Comprimento de rolo gasto, em cm: linhas de arte mais os espaços entre elas. */
    comprimentoCm: number;
    /** Área de arte ÷ área de rolo gasta (0..1): quanto do filme vira estampa. */
    aproveitamento: number;
    /** Medidas da arte como entrou no rolo (largura no sentido da largura do rolo). */
    larguraNoRoloCm: number;
    alturaNoRoloCm: number;
}

/**
 * O mapa mais curto entre as duas orientações. Todas as peças na mesma orientação, em linhas iguais:
 * é como a estamparia monta o filme e é o que dá para conferir no olho.
 * ponytail: não mistura orientações na mesma folha (sobras de largura); ganharia uns cm em artes
 * estreitas, e a conta deixaria de ser conferível. Acrescentar se a diferença aparecer na nota.
 */
export function encaixeDtf(e: { larguraUtilCm: number; espacoCm: number; larguraCm: number; alturaCm: number; quantidade: number }): EncaixeDtf | null {
    const L = Number(e.larguraUtilCm), g = Math.max(0, Number(e.espacoCm) || 0), q = Math.floor(Number(e.quantidade));
    if (!(L > 0) || !(q > 0) || !(e.larguraCm > 0) || !(e.alturaCm > 0)) return null;
    const montar = (w: number, h: number, girada: boolean): EncaixeDtf | null => {
        const porLinha = Math.floor((L + g) / (w + g));
        if (porLinha < 1) return null;
        const linhas = Math.ceil(q / porLinha);
        const comprimentoCm = c2(linhas * h + (linhas - 1) * g);
        return { girada, porLinha, linhas, comprimentoCm, aproveitamento: c4((q * w * h) / (L * comprimentoCm)), larguraNoRoloCm: w, alturaNoRoloCm: h };
    };
    const opcoes = [montar(e.larguraCm, e.alturaCm, false), montar(e.alturaCm, e.larguraCm, true)].filter((x): x is EncaixeDtf => !!x);
    if (opcoes.length === 0) return null;
    // Empate: fica a orientação da arte como veio (não gira à toa).
    return opcoes.sort((a, b) => a.comprimentoCm - b.comprimentoCm || Number(a.girada) - Number(b.girada))[0];
}

export function custoDtf(enc: EncaixeDtf, estamparia: { valorMetroLinear: number; frete: number }, quantidade: number) {
    const metros = c2(enc.comprimentoCm / 100);
    const total = c2(metros * (Number(estamparia.valorMetroLinear) || 0) + (Number(estamparia.frete) || 0));
    return { metros, total, porPeca: quantidade > 0 ? c2(total / quantidade) : 0 };
}

// ── Silk ──────────────────────────────────────────────────────────────────────────────────────

export interface LinhaDeSilk { fornecedor_id: string; tamanho: string; cores: number; valor: number }

/** Cada estamparia que tem esse tamanho e esse número de cores, da mais barata para a mais cara. */
export function custoSilk(grade: LinhaDeSilk[], tamanho: string, cores: number, quantidade: number) {
    const t = tamanho.trim().toLowerCase();
    return grade
        .filter(l => l.tamanho.trim().toLowerCase() === t && Number(l.cores) === Number(cores))
        .map(l => ({ fornecedor_id: l.fornecedor_id, porPeca: Number(l.valor), total: c2(Number(l.valor) * quantidade) }))
        .sort((a, b) => a.porPeca - b.porPeca);
}

// ── Bordado ───────────────────────────────────────────────────────────────────────────────────

export function custoBordado(e: { pontos: number | null | undefined; quantidade: number; precoPorMil: number | null | undefined; valorMinimo: number | null | undefined; valorDaArte: number | null | undefined }) {
    const pontos = Number(e.pontos) > 0 ? Number(e.pontos) : null;
    const porMil = Number(e.precoPorMil) > 0 ? Number(e.precoPorMil) : null;
    const minimo = Number(e.valorMinimo) > 0 ? Number(e.valorMinimo) : null;
    const pelosPontos = pontos !== null && porMil !== null ? (pontos / 1000) * porMil : null;
    if (pelosPontos === null && minimo === null) return null;
    const porPeca = c2(Math.max(pelosPontos ?? 0, minimo ?? 0));
    const arte = c2(Number(e.valorDaArte) > 0 ? Number(e.valorDaArte) : 0);
    const q = Math.max(0, Math.floor(e.quantidade));
    const total = c2(arte + q * porPeca);
    return { porPeca, arte, total, porPecaComArte: q > 0 ? c2(total / q) : porPeca, aplicouMinimo: minimo !== null && (pelosPontos ?? 0) < minimo };
}
