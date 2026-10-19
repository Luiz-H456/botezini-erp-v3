/**
 * A etiqueta de situação do pedido na lista.
 *
 * O QUE ESTAVA ERRADO
 *
 * A etiqueta mostrava só `order.status`, que tem quatro valores para cobrir a
 * vida inteira de um pedido. Consequência: pedido no Corte e pedido na
 * Finalização exibiam a MESMA palavra, "PRODUÇÃO". A informação que existe —
 * `production_stage`, o setor onde a peça está agora — não aparecia em lugar
 * nenhum da lista. A etiqueta não mentia; ela só não dizia nada.
 *
 * Havia três defeitos concretos junto:
 *
 *   1. `labels[status]` era um Record fechado no enum. Status fora dele (dado
 *      legado, string vazia) devolvia `undefined` e a tela desenhava uma
 *      pílula VAZIA — a etiqueta "estranha" que não combinava com nada.
 *
 *   2. 'Concluído' é inalcançável pelo fluxo: o avanço de etapa vai de
 *      Pendente a Em Produção e daí direto para Entregue. A cor roxa de
 *      "FINALIZADA" só aparecia para dado velho, sem significar nada.
 *
 *   3. Atraso não entrava na conta. Pedido com prazo estourado exibia o mesmo
 *      azul tranquilo de um pedido em dia — justamente o caso em que a
 *      etiqueta precisava gritar.
 *
 * Aqui a etiqueta passa a dizer ONDE o pedido está, e o atraso vira um aviso
 * próprio em vez de se esconder atrás da etapa.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export type TomDaEtiqueta = 'neutro' | 'producao' | 'entregue' | 'alerta' | 'desconhecido';

export interface PedidoParaEtiquetar {
    status?: string | null;
    /** Setor atual. É o dado que a etiqueta antiga jogava fora. */
    production_stage?: string | null;
    /** aaaa-mm-dd. */
    deadline?: string | null;
}

export interface Etiqueta {
    texto: string;
    tom: TomDaEtiqueta;
    /** Frase do title, explicando o que a palavra curta resume. */
    detalhe: string;
}

export interface AvisoDePrazo {
    /** Dias de atraso. 0 quando está em dia. */
    atraso: number;
    /** Vence hoje ou amanhã, ainda sem atraso. */
    apertado: boolean;
    texto: string;
}

const soData = (iso?: string | null) => (iso || '').slice(0, 10);

const diasEntre = (de: string, para: string): number => {
    const [aa, am, ad] = de.split('-').map(Number);
    const [ba, bm, bd] = para.split('-').map(Number);
    if (!aa || !ba) return 0;
    return Math.round((Date.UTC(ba, bm - 1, bd) - Date.UTC(aa, am - 1, ad)) / 86400000);
};

/** Normaliza para comparar sem depender de acento ou caixa. */
const chave = (s?: string | null) =>
    (s || '').trim().toLowerCase()
        .replace(/[áàâã]/g, 'a').replace(/[éê]/g, 'e').replace(/í/g, 'i')
        .replace(/[óôõ]/g, 'o').replace(/ú/g, 'u').replace(/ç/g, 'c');

const ENTREGUE = 'entregue';
const EM_PRODUCAO = 'em producao';
const PENDENTE = 'pendente';
const CONCLUIDO = 'concluido';

/**
 * A etapa em palavra curta, para caber na pílula.
 *
 * Nomes de setor são livres (a fábrica cadastra os dela), então o que não for
 * reconhecido volta em maiúscula em vez de virar "PRODUÇÃO" genérico — o setor
 * que a pessoa nomeou é mais informativo que a categoria que eu inventaria.
 */
export function rotuloDaEtapa(etapa?: string | null): string | null {
    const k = chave(etapa);
    if (!k) return null;
    if (k.includes('aguardando')) return 'AGUARDA MATERIAL';
    if (k.includes('corte')) return 'CORTE';
    if (k.includes('personaliza') || k.includes('bordado') || k.includes('silk')) return 'PERSONALIZAÇÃO';
    if (k.includes('costura')) return 'COSTURA';
    if (k.includes('finaliza') || k.includes('acabamento')) return 'FINALIZAÇÃO';
    if (k.includes('logistica') || k.includes('expedi')) return 'EXPEDIÇÃO';
    return (etapa || '').trim().toUpperCase();
}

/**
 * A etiqueta principal: onde o pedido está agora.
 *
 * Status desconhecido devolve o valor cru em vez de vazio. Uma etiqueta com o
 * texto errado ainda pode ser investigada; uma pílula vazia não dá nem para
 * saber que existe um problema.
 */
export function etiquetaDoPedido(pedido: PedidoParaEtiquetar): Etiqueta {
    const st = chave(pedido.status);

    if (st === ENTREGUE) {
        return { texto: 'ENTREGUE', tom: 'entregue', detalhe: 'Pedido entregue ao cliente' };
    }

    if (st === EM_PRODUCAO) {
        const etapa = rotuloDaEtapa(pedido.production_stage);
        return etapa
            ? { texto: etapa, tom: 'producao', detalhe: `Em produção — setor atual: ${etapa.toLowerCase()}` }
            : { texto: 'PRODUÇÃO', tom: 'producao', detalhe: 'Em produção, sem setor registrado' };
    }

    if (st === PENDENTE) {
        // "NA FILA" e não "PENDENTE": pedido recém-convertido está certo, não
        // pendente de nada. "Pendente" em cinza lia como problema a resolver.
        return { texto: 'NA FILA', tom: 'neutro', detalhe: 'Convertido, ainda não entrou na produção' };
    }

    if (st === CONCLUIDO) {
        return {
            texto: 'PRONTO',
            tom: 'producao',
            detalhe: 'Produção concluída, aguardando entrega',
        };
    }

    if (!st) {
        return { texto: 'SEM STATUS', tom: 'desconhecido', detalhe: 'O pedido não tem status gravado' };
    }

    return {
        texto: String(pedido.status).toUpperCase(),
        tom: 'desconhecido',
        detalhe: `Status não reconhecido pelo sistema: "${pedido.status}"`,
    };
}

/**
 * O prazo, separado da etapa.
 *
 * Atraso é uma dimensão independente de onde a peça está: dá para estar na
 * Costura em dia ou na Costura com uma semana de atraso, e são situações
 * diferentes. Espremer as duas numa etiqueta só apagaria uma delas — e a que
 * some sempre é o atraso, que é a que precisava aparecer.
 *
 * Pedido entregue não recebe aviso: o prazo já não é decisão de ninguém.
 */
export function avisoDePrazo(
    pedido: PedidoParaEtiquetar,
    hoje: string,
): AvisoDePrazo | null {
    if (chave(pedido.status) === ENTREGUE) return null;

    const prazo = soData(pedido.deadline);
    if (!prazo) return null;

    const dias = diasEntre(prazo, soData(hoje));

    if (dias > 0) {
        return {
            atraso: dias,
            apertado: false,
            texto: dias === 1 ? '1 DIA DE ATRASO' : `${dias} DIAS DE ATRASO`,
        };
    }
    if (dias === 0) return { atraso: 0, apertado: true, texto: 'VENCE HOJE' };
    if (dias === -1) return { atraso: 0, apertado: true, texto: 'VENCE AMANHÃ' };
    return null;
}

export const CLASSE_DO_TOM: Record<TomDaEtiqueta, string> = {
    neutro: 'text-zinc-400 bg-zinc-800 border-zinc-700',
    producao: 'text-blue-400 bg-blue-950 border-blue-900',
    entregue: 'text-emerald-400 bg-emerald-950 border-emerald-900',
    alerta: 'text-amber-400 bg-amber-950 border-amber-900',
    // Vermelho de propósito: status que o sistema não conhece é defeito de
    // dado, e some da vista se for pintado com a mesma cor calma do resto.
    desconhecido: 'text-rose-400 bg-rose-950/50 border-rose-900',
};
