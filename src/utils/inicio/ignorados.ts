/**
 * Avisos do Início que o Luiz mandou ignorar (29/10: "não são ignoráveis ou ocultáveis").
 *
 * Ignorar vale ATÉ A SITUAÇÃO MUDAR: a chave é o aviso mais a quantidade (e a assinatura,
 * quando a quantidade não diz tudo, como a data do caixa negativo). "4 clientes sumidos"
 * ignorado volta sozinho quando vira 5 — senão um aviso calado esconderia problema novo.
 *
 * Pura; o hook guarda o conjunto no navegador.
 */
import type { BlocoDaFila, LinhaDaFila } from './fila.ts';

export const chaveDoAviso = (l: LinhaDaFila): string => `${l.id}|${l.quantidade}|${l.assinatura ?? ''}`;

export function aplicarIgnorados(blocos: BlocoDaFila[], ignorados: ReadonlySet<string>): { visiveis: BlocoDaFila[]; ignoradas: LinhaDaFila[] } {
    const ignoradas: LinhaDaFila[] = [];
    const visiveis = blocos
        .map(b => ({ ...b, linhas: b.linhas.filter(l => (ignorados.has(chaveDoAviso(l)) ? (ignoradas.push(l), false) : true)) }))
        .filter(b => b.linhas.length > 0);
    return { visiveis, ignoradas };
}

/** Só o que ainda está na fila: aviso resolvido sai da lista, e se voltar um dia, volta visível. */
export function podarIgnorados(ignorados: ReadonlySet<string>, blocos: BlocoDaFila[]): Set<string> {
    const atuais = new Set(blocos.flatMap(b => b.linhas.map(chaveDoAviso)));
    return new Set([...ignorados].filter(k => atuais.has(k)));
}
