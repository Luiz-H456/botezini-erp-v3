import { parseBRL } from '../currency.ts';
import { numero } from '../numeros.ts';

export interface AjusteDeContagem {
    /** Diferença contado − sistema, em 3 casas; 0 enquanto não há contagem válida. */
    diferenca: number;
    /** "Vai lançar +Y", "Vai lançar −Y" ou "Sem diferença"; vazio sem contagem válida. */
    texto: string;
    /** Entrada sem custo médio no cadastro: o custo da sobra precisa ser informado. */
    pedeCusto: boolean;
    /** Custo a mandar ao banco: só quando o campo é pedido. */
    custo?: number;
    podeAjustar: boolean;
}

/** O que a tela "Ajustar contagem" mostra e exige, a partir do que foi digitado. */
export function ajusteDeContagem(saldoSistema: number, contadoTexto: string, custoTexto: string, custoMedio: number): AjusteDeContagem {
    const contado = parseBRL(contadoTexto);
    // parseBRL devolve 0 para texto sem dígito ("abc", "-", ","): sem dígito não há contagem.
    if (!/[0-9]/.test(contadoTexto) || contado < 0) return { diferenca: 0, texto: '', pedeCusto: false, podeAjustar: false };

    const diferenca = Math.round((contado - saldoSistema) * 1000) / 1000;
    const pedeCusto = diferenca > 0 && !(custoMedio > 0);
    const custo = parseBRL(custoTexto);
    const texto = diferenca === 0 ? 'Sem diferença'
        : `Vai lançar ${diferenca > 0 ? '+' : '−'}${numero(Math.abs(diferenca))}`;
    return {
        diferenca, texto, pedeCusto,
        custo: pedeCusto ? custo : undefined,
        podeAjustar: diferenca !== 0 && (!pedeCusto || custo > 0),
    };
}
