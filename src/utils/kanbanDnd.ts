// Kanban — geometria do arrastar-e-soltar. Sem imports, para ser testado direto.
//
// Por que Pointer Events e não a API nativa de drag-and-drop do HTML: a nativa
// não dispara em toque, e o quadro roda no monitor do chão de fábrica, que é
// touchscreen. Pointer Events cobre mouse, toque e caneta com o mesmo código.

export interface AreaColuna {
    id: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/**
 * Qual coluna está sob o ponto (x, y). Devolve null se nenhuma estiver.
 *
 * As bordas contam como dentro (>=/<=): soltar exatamente na linha divisória
 * tem que cair em alguma coluna, não sumir no vazio. Colunas do quadro não se
 * sobrepõem, então empatar na fronteira é indiferente — a primeira ganha.
 */
export function colunaSobPonto(areas: AreaColuna[], x: number, y: number): string | null {
    for (const a of areas) {
        if (x >= a.left && x <= a.right && y >= a.top && y <= a.bottom) return a.id;
    }
    return null;
}

/**
 * O gesto já virou arraste, ou ainda é um clique?
 *
 * Sem essa folga, encostar o dedo no cartão para clicar num botão já seria
 * interpretado como arrastar — nenhum toque humano é imóvel. Só passa a ser
 * arraste depois de percorrer a distância mínima.
 */
export function passouLimiteDeArraste(dx: number, dy: number, limite = 6): boolean {
    return Math.hypot(dx, dy) >= limite;
}

/**
 * Direção do rolamento automático quando o cartão é arrastado até a beirada.
 * -1 rola para a esquerda, 1 para a direita, 0 fica parado.
 *
 * Sem isto não dá para mover um cartão para uma coluna que está fora da tela:
 * o usuário chega na borda e trava, porque a mão que arrasta é a mesma que
 * precisaria rolar o quadro.
 */
export function direcaoAutoScroll(
    x: number,
    area: { left: number; right: number },
    margem = 60,
): -1 | 0 | 1 {
    if (x < area.left + margem) return -1;
    if (x > area.right - margem) return 1;
    return 0;
}
