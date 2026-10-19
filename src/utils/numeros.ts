/**
 * Número e porcentagem no padrão pt-BR, sem depender do ICU do ambiente.
 *
 * Vírgula decimal, ponto de milhar, e sem zeros sobrando: 1 vira "1", 2,4 vira "2,4".
 * Regra do Luiz: "1.000" é MIL — nunca mostrar 1.000 para a quantidade 1 (era o `toFixed(3)`).
 */
export function numero(n: number, maxCasas = 3): string {
    const v = Number.isFinite(n) ? n : 0;
    const fator = 10 ** maxCasas;
    const arredondado = Math.round(Math.abs(v) * fator) / fator;
    const [inteiro, decimal = ''] = arredondado.toFixed(maxCasas).split('.');
    const casas = decimal.replace(/0+$/, '');
    const negativo = v < 0 && arredondado !== 0;
    return `${negativo ? '-' : ''}${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${casas ? `,${casas}` : ''}`;
}

/** Porcentagem já em pontos (3.4 → "3,4%"); `comSinal` põe "+" nos positivos. */
export function percentual(n: number, casas = 1, comSinal = false): string {
    const texto = numero(n, casas);
    return `${comSinal && n > 0 ? '+' : ''}${texto}%`;
}
