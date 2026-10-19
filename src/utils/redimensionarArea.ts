/**
 * Altura de um campo arrastado pela borda SUPERIOR.
 *
 * A caixa de observações vive no rodapé do editor, ancorada embaixo. Arrastar a
 * borda de cima é o gesto natural ali: o campo cresce para cima, em direção ao
 * espaço vazio, em vez de empurrar o rodapé para fora da tela.
 *
 * Isso inverte o sinal em relação ao redimensionamento comum — subir o ponteiro
 * (deltaY negativo) AUMENTA a altura. Errar esse sinal faz o campo encolher
 * quando se puxa para cima, que é o tipo de coisa que a pessoa sente como
 * "quebrado" sem saber explicar.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export interface LimitesDaAltura {
    /** Nunca abaixo disto — um campo de texto que vira um risco não serve. */
    minima: number;
    /** Nunca acima disto — normalmente o que a janela comporta. */
    maxima: number;
}

/**
 * Qual borda está sendo puxada.
 *
 * Não é preferência estética: no rodapé do editor a caixa está ancorada
 * embaixo e cresce para CIMA, então a alça de cima é o gesto natural. Dentro do
 * cartão de um item, na lista rolável, a caixa cresce para BAIXO em fluxo
 * normal — ali a alça de cima faria a pessoa puxar para cima e o campo descer,
 * que é o tipo de inversão que se sente como defeito sem saber nomear.
 */
export type BordaArrastada = 'topo' | 'base';

/** A altura resultante de arrastar uma das bordas por `deltaY` pixels. */
export function alturaAoArrastar(
    alturaInicial: number,
    deltaY: number,
    limites: LimitesDaAltura,
    borda: BordaArrastada = 'topo',
): number {
    const minima = Math.max(0, limites.minima);
    const maxima = Math.max(minima, limites.maxima);
    // Borda de cima inverte o sinal: ponteiro para cima, campo maior. Borda de
    // baixo acompanha o ponteiro, como qualquer redimensionamento comum.
    const bruta = borda === 'topo' ? alturaInicial - deltaY : alturaInicial + deltaY;
    return Math.round(Math.min(maxima, Math.max(minima, bruta)));
}

/**
 * Teto sensato para a altura, dado o espaço da janela.
 *
 * A caixa não pode crescer até engolir a tela: acima de uns 70% da altura útil
 * ela deixa de ser um campo e vira a página inteira, escondendo a tabela de
 * itens que é justamente o que a observação descreve.
 */
export function alturaMaximaNaJanela(alturaDaJanela: number, fracao = 0.7): number {
    return Math.max(120, Math.round((Number(alturaDaJanela) || 0) * fracao));
}
