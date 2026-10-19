import type { SimulationResult } from './pcpScheduler.ts';

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** A resposta do motor do Simulador numa frase, para o editor de orçamento. */
export function respostaCabeNaSemana(r: SimulationResult, prazo: string): { cabe: boolean; texto: string } {
    const semana = r.withNew.weeks[r.placed_week_index]?.week_start;
    if (!semana) return { cabe: false, texto: `não coube no horizonte do cronograma — o prazo de ${ddmm(prazo)} estoura` };
    if (r.self_late) return { cabe: false, texto: `só cabe na semana de ${ddmm(semana)} — o prazo de ${ddmm(prazo)} estoura` };
    return { cabe: true, texto: `cabe na semana de ${ddmm(semana)}` };
}
