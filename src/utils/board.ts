// Quadro de notas — geometria pura do board (posicionamento e tamanho do
// canvas). Sem imports de propósito, para poder ser testado direto.

export interface NotaPos {
    pos_x: number;
    pos_y: number;
    width: number;
    height: number;
}

/**
 * Posição para uma nota nova, em cascata a partir do canto visível da tela.
 *
 * Cada nota nasce um pouco deslocada da anterior (efeito de post-it empilhado
 * na mesa) até um limite, depois volta para o início do deslocamento — senão a
 * décima nota nasceria fora da tela.
 */
export function proximaPosicaoCascata(
    quantidadeExistente: number,
    scrollX: number,
    scrollY: number,
    passo = 28,
    maxDeslocamento = 224, // 8 passos antes de repetir
): { pos_x: number; pos_y: number } {
    const deslocamento = (quantidadeExistente * passo) % maxDeslocamento;
    return {
        pos_x: scrollX + 48 + deslocamento,
        pos_y: scrollY + 48 + deslocamento,
    };
}

/**
 * Tamanho do canvas: cresce para sempre caber a nota mais distante, com uma
 * margem para continuar arrastando/criando além da borda atual. Nunca menor
 * que o tamanho mínimo (a área visível inicial).
 *
 * É isto que dá a sensação de "sem limite": não existe um canto fixo do
 * quadro — ele se expande conforme o usuário usa o espaço.
 */
export function tamanhoCanvas(
    notas: NotaPos[],
    larguraMinima: number,
    alturaMinima: number,
    margem = 600,
): { largura: number; altura: number } {
    let largura = larguraMinima;
    let altura = alturaMinima;
    for (const n of notas) {
        largura = Math.max(largura, n.pos_x + n.width + margem);
        altura = Math.max(altura, n.pos_y + n.height + margem);
    }
    return { largura, altura };
}

/**
 * Verdadeiro se o segundo aperto da tecla veio dentro da janela de tempo do
 * primeiro — é o que substitui o modal de confirmação para traços: apertar
 * Delete uma vez "arma", apertar de novo rápido confirma. Apertar e esperar
 * não apaga nada.
 */
export function duploPressionamento(ultimoMs: number, agoraMs: number, janelaMs = 500): boolean {
    return agoraMs - ultimoMs < janelaMs;
}

/** Escolhe um item ao acaso — usado para a cor de uma nota nova. */
export function corAleatoria<T>(opcoes: readonly T[]): T {
    return opcoes[Math.floor(Math.random() * opcoes.length)];
}

/** Próximo z-index para "trazer para frente" — maior existente + 1, mínimo 1. */
export function proximoZIndex(notas: { z_index: number }[]): number {
    if (notas.length === 0) return 1;
    return Math.max(...notas.map(n => n.z_index)) + 1;
}

/** Posição/tamanho não pode ir a negativo nem a zero — nota some da tela. */
export function clamp(valor: number, minimo: number): number {
    return Math.max(minimo, valor);
}

export type Canto = 'nw' | 'ne' | 'sw' | 'se';

/**
 * Redimensiona a partir de QUALQUER canto, não só o inferior-direito.
 *
 * Arrastar o canto oposto ao que está fixo precisa mover pos_x/pos_y junto —
 * "nw" (superior-esquerdo) empurra a borda esquerda E a de cima, então tanto
 * a posição quanto o tamanho mudam. Se só ajustasse o tamanho, a nota
 * "deslizaria" para a direita/baixo enquanto o usuário arrasta a borda
 * esquerda/topo — pareceria quicar.
 *
 * Quando o tamanho bate no mínimo, a posição acompanha o tamanho REAL (não o
 * delta bruto do mouse) — senão a borda oposta continuaria andando mesmo com
 * a caixa impedida de encolher mais, descolando do cursor.
 */
export function calcularRedimensionamento(
    canto: Canto,
    inicial: NotaPos,
    dx: number,
    dy: number,
    larguraMinima = 140,
    alturaMinima = 100,
): NotaPos {
    const bordaDireita = canto === 'se' || canto === 'ne';
    const bordaInferior = canto === 'se' || canto === 'sw';

    const largura = clamp(bordaDireita ? inicial.width + dx : inicial.width - dx, larguraMinima);
    const pos_x = bordaDireita ? inicial.pos_x : inicial.pos_x + (inicial.width - largura);

    const altura = clamp(bordaInferior ? inicial.height + dy : inicial.height - dy, alturaMinima);
    const pos_y = bordaInferior ? inicial.pos_y : inicial.pos_y + (inicial.height - altura);

    return { pos_x, pos_y, width: largura, height: altura };
}

/** Canvas cresce também para caber os pontos de um traço de caneta/seta. */
export function tamanhoCanvasComPontos(
    largura: number,
    altura: number,
    pontos: { x: number; y: number }[],
    margem = 600,
): { largura: number; altura: number } {
    let l = largura;
    let a = altura;
    for (const p of pontos) {
        l = Math.max(l, p.x + margem);
        a = Math.max(a, p.y + margem);
    }
    return { largura: l, altura: a };
}

/**
 * Verdadeiro se o ponto novo está longe o bastante do último para valer a
 * pena guardar. `pointermove` dispara dezenas de vezes por segundo — sem essa
 * peneira, um traço de 2 segundos vira uma lista de milhares de pontos quase
 * idênticos, pesando no banco e no SVG sem ganhar nada de suavidade visível.
 */
export function deveAdicionarPonto(
    ultimo: { x: number; y: number },
    novo: { x: number; y: number },
    distanciaMinima = 3,
): boolean {
    return Math.hypot(novo.x - ultimo.x, novo.y - ultimo.y) >= distanciaMinima;
}

export interface Retangulo {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Normaliza um arraste de seleção: o usuário pode arrastar em qualquer
 * direção (de baixo pra cima, da direita pra esquerda...), mas um retângulo
 * sempre precisa de x,y no canto SUPERIOR-ESQUERDO e largura/altura positivas.
 */
export function normalizarRetangulo(x1: number, y1: number, x2: number, y2: number): Retangulo {
    return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
    };
}

/**
 * Verdadeiro só quando a caixa está TOTALMENTE dentro do retângulo — tocar a
 * borda sem ultrapassar ainda conta (por isso os limites são >=/<=, não >/<),
 * mas uma caixa que atravessa a borda do retângulo NÃO é selecionada, mesmo
 * que a maior parte dela esteja dentro. É a regra pedida: seleção por
 * contenção total, não por sobreposição parcial.
 */
export function totalmenteDentro(caixa: NotaPos, retangulo: Retangulo): boolean {
    return caixa.pos_x >= retangulo.x
        && caixa.pos_y >= retangulo.y
        && caixa.pos_x + caixa.width <= retangulo.x + retangulo.width
        && caixa.pos_y + caixa.height <= retangulo.y + retangulo.height;
}

/** Caixa envolvente de uma lista de pontos — para testar se um traço de caneta/seta cabe inteiro no retângulo de seleção. */
export function caixaDosPontos(pontos: { x: number; y: number }[]): NotaPos {
    if (pontos.length === 0) return { pos_x: 0, pos_y: 0, width: 0, height: 0 };
    const xs = pontos.map(p => p.x);
    const ys = pontos.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return { pos_x: minX, pos_y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Ponto onde uma linha do CENTRO da caixa até (alvoX, alvoY) cruza a borda.
 *
 * É o que faz uma ligação entre duas notas nascer na BORDA de cada uma, não
 * atravessar por cima do texto — a linha para exatamente onde o retângulo
 * termina, na direção de quem está do outro lado.
 */
export function pontoNaBorda(caixa: NotaPos, alvoX: number, alvoY: number): { x: number; y: number } {
    const cx = caixa.pos_x + caixa.width / 2;
    const cy = caixa.pos_y + caixa.height / 2;
    const dx = alvoX - cx;
    const dy = alvoY - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };

    const tX = dx !== 0 ? (caixa.width / 2) / Math.abs(dx) : Infinity;
    const tY = dy !== 0 ? (caixa.height / 2) / Math.abs(dy) : Infinity;
    const t = Math.min(tX, tY);

    return { x: cx + t * dx, y: cy + t * dy };
}
