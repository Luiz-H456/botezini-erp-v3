/**
 * Rascunho automático (auditoria de 29/10, C2): o que está sendo editado fica guardado no
 * navegador a cada mudança, e ao reabrir oferece "Recuperar". Fechar a aba, dar F5 ou o
 * computador desligar deixava de custar o orçamento inteiro.
 *
 * Pura: quem lê e grava no localStorage é a tela. Sem import do app.
 */

/** Texto estável de um valor: mesma informação, mesmo texto (as chaves vão em ordem). */
export function assinatura(valor: unknown): string {
    const ordenar = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(ordenar);
        if (v && typeof v === 'object') {
            const o = v as Record<string, unknown>;
            return Object.keys(o).sort().reduce<Record<string, unknown>>((acc, k) => {
                if (o[k] !== undefined) acc[k] = ordenar(o[k]);
                return acc;
            }, {});
        }
        return v;
    };
    return JSON.stringify(ordenar(valor)) ?? '';
}

export const chaveDoRascunho = (tipo: string, id: string | null | undefined): string =>
    `botezini.rascunho.${tipo}.${id || 'novo'}`;

export interface Rascunho<T> { quando: number; dados: T }

/** Rascunhos com mais de 14 dias são lixo esquecido, não trabalho em andamento. */
export const IDADE_MAXIMA_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * O rascunho guardado vale a pena oferecer? Só se é legível, recente e DIFERENTE do que está
 * salvo — oferecer "recuperar" o que já está salvo ensina a ignorar o aviso.
 */
export function rascunhoParaOferecer<T>(guardado: string | null, salvo: T | null, agora: number): Rascunho<T> | null {
    if (!guardado) return null;
    let r: Rascunho<T>;
    try { r = JSON.parse(guardado) as Rascunho<T>; } catch { return null; }
    if (!r || typeof r.quando !== 'number' || r.dados == null) return null;
    if (agora - r.quando > IDADE_MAXIMA_MS) return null;
    if (salvo != null && assinatura(r.dados) === assinatura(salvo)) return null;
    return r;
}
