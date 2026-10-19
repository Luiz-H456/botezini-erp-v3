/**
 * Conversão de capacidade produtiva entre semana e mês.
 *
 * O PCP mede capacidade por SEMANA (weekly_capacity_pieces de cada setor);
 * a Capacidade mostra ocupação por MÊS. Este módulo é a ponte entre os dois.
 *
 * Puro de propósito — sem imports — para poder ser testado direto.
 */

/** Padrão do PCP quando não há setor com capacidade cadastrada. */
export const CAPACIDADE_SEMANAL_PADRAO = 350;

/** Semanas corridas do mês 'YYYY-MM' (fev/28 → 4; jul/31 → ~4,43). */
export function semanasNoMes(yearMonth?: string): number {
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) return 30.44 / 7; // mês médio
    const [ano, mes] = yearMonth.split('-').map(Number);
    // Dia 0 do mês seguinte é o último dia deste — cobre bissexto sem tabela.
    return new Date(ano, mes, 0).getDate() / 7;
}

/** Capacidade do mês a partir do gargalo semanal da linha. */
export function capacidadeMensal(weeklyCapacityPieces: number | undefined, yearMonth?: string) {
    const semanal = weeklyCapacityPieces && weeklyCapacityPieces > 0
        ? weeklyCapacityPieces
        : CAPACIDADE_SEMANAL_PADRAO;
    return {
        semanal,
        mensal: Math.round(semanal * semanasNoMes(yearMonth)),
    };
}
