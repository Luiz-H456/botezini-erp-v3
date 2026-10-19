// PCP — semana de trabalho e urgência do pedido.
//
// Sem imports de propósito, para poder ser testado direto pelo runner do Node.
//
// A semana aqui começa na SEGUNDA, igual ao motor do cronograma
// (pcpScheduler). O resto do app tem um `isDateInPeriod(..., 'WEEK')` que conta
// a semana a partir de DOMINGO — são convenções diferentes que coexistem, e
// misturar as duas faria a sexta-feira cair em semanas distintas dependendo de
// quem pergunta. Produção usa segunda; é o que a fábrica entende por "semana".

/** Datas ISO são comparadas e montadas por componente LOCAL — nunca por
 *  toISOString(), que converte para UTC e no Brasil (UTC-3) devolve o dia
 *  anterior quando a hora local é de madrugada. */
function paraISO(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dia}`;
}

function paraData(iso: string): Date {
    return new Date(iso + 'T00:00:00');
}

export function somarDias(iso: string, dias: number): string {
    const d = paraData(iso);
    d.setDate(d.getDate() + dias);
    return paraISO(d);
}

/** Segunda-feira da semana que contém `iso`. Domingo pertence à semana que
 *  começou na segunda anterior (e não à que vai começar no dia seguinte). */
export function segundaDaSemana(iso: string): string {
    const d = paraData(iso);
    const dow = (d.getDay() + 6) % 7;   // 0 = segunda … 6 = domingo
    d.setDate(d.getDate() - dow);
    return paraISO(d);
}

/** Domingo que fecha a semana de `iso`. */
export function domingoDaSemana(iso: string): string {
    return somarDias(segundaDaSemana(iso), 6);
}

/** Duas datas caem na mesma semana de trabalho? */
export function mesmaSemana(a: string, b: string): boolean {
    return segundaDaSemana(a) === segundaDaSemana(b);
}

/** Dias corridos de `deISO` até `ateISO`. Negativo = `ateISO` já passou. */
export function diasEntre(deISO: string, ateISO: string): number {
    const a = paraData(deISO).getTime();
    const b = paraData(ateISO).getTime();
    return Math.round((b - a) / 86_400_000);
}

/**
 * Como o pedido deve aparecer no quadro. A ordem importa: quem já estourou o
 * prazo é "atrasado" mesmo que a entrega caia nesta semana, e a entrega desta
 * semana ganha do início desta semana — o prazo com o cliente pesa mais que o
 * planejamento interno.
 */
export type UrgenciaPedido = 'atrasado' | 'entrega-semana' | 'inicio-semana' | 'normal';

export function urgenciaDoPedido(
    pedido: { deadline?: string | null; inicioPlanejado?: string | null },
    hojeISO: string,
): UrgenciaPedido {
    const { deadline, inicioPlanejado } = pedido;

    if (deadline && deadline < hojeISO) return 'atrasado';
    if (deadline && mesmaSemana(deadline, hojeISO)) return 'entrega-semana';
    if (inicioPlanejado && mesmaSemana(inicioPlanejado, hojeISO)) return 'inicio-semana';
    return 'normal';
}
