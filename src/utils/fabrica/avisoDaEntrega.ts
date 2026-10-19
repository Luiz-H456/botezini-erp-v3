import { numero } from '../numeros.ts';

export interface SobraNomeada { nome: string; unidade: string; quantidade: number }

/** Resultado de apurar a sobra: `semBanco` = o SQL ainda não foi rodado; `jaFeita` = a RPC já tinha apurado este pedido. */
export type Apuracao = { semBanco: true } | { semBanco?: false; jaFeita: boolean; sobras: SobraNomeada[] };

/** Banco sem a função de vínculo (null) = SQL não rodado: o desfecho é o mesmo de faltar a de apuração. */
export const apuracaoSeSemBanco = (vinculado: Map<string, number> | null): Apuracao | null =>
    vinculado === null ? { semBanco: true } : null;

/** Frase da entrega: `null` quando não há o que dizer (sem sobra, ou já apurada antes). Só quantidades, nunca dinheiro. */
export function avisoDaEntrega(r: Apuracao): string | null {
    if (r.semBanco) return 'Entregue. A sobra não foi para o estoque: o banco ainda não tem compras por pedido.';
    if (r.jaFeita || r.sobras.length === 0) return null;
    const nomes = r.sobras.map(s => `${s.nome} ${numero(s.quantidade)} ${s.unidade}`.trim());
    const resto = nomes.length - 2;
    return `Sobrou para o estoque: ${nomes.slice(0, 2).join(' · ')}${resto > 0 ? ` +${resto}` : ''}.`;
}

/** Frase quando a entrega gravou mas a sobra não chegou ao estoque. */
export const avisoDeFalhaNaSobra = (erro: string) => `Entregue, mas a sobra não foi para o estoque: ${erro}.`;
