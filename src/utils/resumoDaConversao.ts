/**
 * O que a conversão de um orçamento vai gravar no ERP.
 *
 * POR QUE ISTO EXISTE
 * Converter é a operação mais cara do sistema: cria um pedido, cria N contas a
 * receber com vencimento, consome um número de sequência, muda o estado do
 * orçamento e leva fotos e observações para a produção. Tudo isso acontecia
 * atrás de uma frase — "Converter ORC-9 em pedido usando o plano já definido
 * (2 parcelas)?" — que não dizia os valores, nem as datas, nem o que ia mudar.
 *
 * Quem clicava só descobria o que tinha sido lançado depois, no financeiro. Foi
 * assim que duas parcelas de 400 entraram num pedido de 1400 sem ninguém ver.
 *
 * A conferência do plano (planoDoPedido.ts) impede o caso conhecido. Este
 * módulo resolve o caso geral: mostrar a operação inteira ANTES, para o erro
 * ser visto por quem sabe qual era o combinado.
 *
 * Só descreve — não grava nada, não decide nada.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

import type { ParcelaDoPlano } from './planoDoPedido.ts';
import { conferirPlano, planoPrecisaRevisao } from './planoDoPedido.ts';

export interface ItemDoOrcamento {
    product_name?: string;
    model?: string;
    size?: string;
    quantity?: number;
}

export interface OrcamentoParaConverter {
    serial_number?: string;
    total_amount?: number;
    items?: ItemDoOrcamento[];
    reference_photos?: string[];
    factory_notes?: string;
    notes?: string;
    delivery_time_days?: number;
    generated_order_number?: string;
    status?: string;
}

export interface DadosDaConversao {
    orcamento: OrcamentoParaConverter;
    cliente: string;
    plano: ParcelaDoPlano[];
    /** aaaa-mm-dd — o prazo calculado para este pedido. */
    entrega: string;
    /** Próximo número da sequência — só se firma ao gravar. */
    numeroDoPedido: string;
    hoje: string;
}

export interface LinhaDoResumo {
    /** Rótulo curto da esquerda. */
    o_que: string;
    /** O valor, já formatado pelo chamador quando for dinheiro ou data. */
    detalhe: string;
    /** Linha secundária, quando o detalhe precisa de contexto. */
    nota?: string;
}

export type GravidadeDoAviso = 'erro' | 'atencao' | 'informacao';

export interface AvisoDaConversao {
    gravidade: GravidadeDoAviso;
    texto: string;
}

export interface ResumoDaConversao {
    /** Registros que passam a existir. */
    criar: LinhaDoResumo[];
    /** Registros que já existem e serão alterados. */
    alterar: LinhaDoResumo[];
    /** Parcelas, como vão para o financeiro. */
    parcelas: Array<ParcelaDoPlano & { vencida: boolean }>;
    avisos: AvisoDaConversao[];
    /** Soma das peças de todos os itens. */
    pecas: number;
    totalDoPlano: number;
    /** Trava dura: há motivo para não deixar converter. */
    impedido: boolean;
}

const centavos = (n?: number | null) => Math.round((Number(n) || 0) * 100) / 100;
const soData = (s?: string | null) => (s || '').slice(0, 10);

/**
 * Reais por extenso, sem depender do formatador do app.
 *
 * `toLocaleString` é da própria linguagem, então este módulo continua sem
 * imports e testável com `node --test` — e os avisos param de misturar
 * "400.00" com "R$ 1.400,00" na mesma tela, que é o tipo de detalhe que faz
 * quem confere hesitar em vez de ler.
 */
const reais = (n?: number | null) =>
    (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** aaaa-mm-dd para dd/mm/aaaa, sem passar por Date (que escorrega no fuso). */
const dataBR = (iso?: string | null) => {
    const [a, m, d] = soData(iso).split('-');
    return a && m && d ? `${d}/${m}/${a}` : (iso || '');
};

/** Soma as quantidades — é o número que a produção usa, não a contagem de linhas. */
export const contarPecas = (itens?: ItemDoOrcamento[]): number =>
    (itens || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);

/**
 * O retrato completo da operação.
 *
 * A separação entre CRIAR e ALTERAR não é decoração: criar é reversível
 * apagando, alterar sobrescreve algo que já valia. Quem confere precisa saber
 * de qual dos dois se trata antes de clicar.
 */
export function resumirConversao(dados: DadosDaConversao): ResumoDaConversao {
    const { orcamento, cliente, plano, entrega, numeroDoPedido, hoje } = dados;

    const total = centavos(orcamento.total_amount);
    const pecas = contarPecas(orcamento.items);
    const nItens = (orcamento.items || []).length;
    const nFotos = (orcamento.reference_photos || []).length;
    const conferencia = conferirPlano(plano, total);
    const revisao = planoPrecisaRevisao(plano, total, hoje);

    const parcelas = (plano || []).map(p => ({
        ...p,
        vencida: soData(p.due) < soData(hoje),
    }));

    // ── o que nasce ─────────────────────────────────────────────────────────
    const criar: LinhaDoResumo[] = [
        {
            o_que: `Pedido #${numeroDoPedido}`,
            detalhe: cliente || 'sem cliente',
            nota: `${nItens} ${nItens === 1 ? 'item' : 'itens'} · ${pecas} ${pecas === 1 ? 'peça' : 'peças'} · entrega ${dataBR(entrega)}`,
        },
    ];

    if (parcelas.length > 0) {
        criar.push({
            o_que: `${parcelas.length} ${parcelas.length === 1 ? 'conta a receber' : 'contas a receber'}`,
            detalhe: `soma ${reais(conferencia.total)}`,
            nota: 'entram no financeiro com vencimento próprio, uma por parcela',
        });
    }

    // ── o que muda ──────────────────────────────────────────────────────────
    const alterar: LinhaDoResumo[] = [
        {
            o_que: `Orçamento ${orcamento.serial_number || ''}`.trim(),
            detalhe: `${orcamento.status || 'Aprovado'} → Convertido`,
            nota: 'deixa de aceitar edição e passa a apontar para o pedido',
        },
    ];

    if (nFotos > 0) {
        alterar.push({
            o_que: `${nFotos} ${nFotos === 1 ? 'foto de referência' : 'fotos de referência'}`,
            detalhe: 'copiadas para o pedido',
            nota: 'a ficha de produção lê deste campo',
        });
    }

    if (orcamento.factory_notes && orcamento.factory_notes.trim()) {
        alterar.push({
            o_que: 'Observação de fábrica',
            detalhe: 'copiada para o pedido',
            nota: 'sai só na ficha de produção, nunca no PDF do cliente',
        });
    }

    // ── avisos ──────────────────────────────────────────────────────────────
    const avisos: AvisoDaConversao[] = [];
    let impedido = false;

    if (!plano || plano.length === 0) {
        impedido = true;
        avisos.push({
            gravidade: 'erro',
            texto: 'Sem plano de pagamento: o pedido nasceria sem nenhuma conta a receber.',
        });
    } else if (!conferencia.confere) {
        // Não impede — pode haver acerto combinado com o cliente. Mas foi este
        // silêncio que deixou 400 passarem por 1400.
        const verbo = conferencia.diferenca > 0 ? 'a mais' : 'a menos';
        avisos.push({
            gravidade: 'erro',
            texto: `As parcelas somam ${reais(conferencia.total)}, `
                + `${reais(Math.abs(conferencia.diferenca))} ${verbo} que o pedido `
                + `(${reais(total)}). O financeiro e o pedido vão discordar.`,
        });
    }

    const vencidas = parcelas.filter(p => p.vencida).length;
    if (vencidas > 0) {
        avisos.push({
            gravidade: 'erro',
            texto: vencidas === 1
                ? 'Uma parcela já nasce vencida — o cliente aparece em atraso hoje mesmo.'
                : `${vencidas} parcelas já nascem vencidas — o cliente aparece em atraso hoje mesmo.`,
        });
    }

    if (total <= 0) {
        impedido = true;
        avisos.push({ gravidade: 'erro', texto: 'O orçamento está com valor zero.' });
    }

    if (pecas <= 0) {
        avisos.push({
            gravidade: 'atencao',
            texto: 'Nenhuma peça no pedido — a ficha de produção sairia vazia.',
        });
    }

    if (orcamento.generated_order_number) {
        avisos.push({
            gravidade: 'atencao',
            texto: `Este orçamento já gerou o pedido #${orcamento.generated_order_number} antes. `
                + 'Converter de novo cria um segundo pedido.',
        });
    }

    if (nFotos === 0) {
        avisos.push({
            gravidade: 'informacao',
            texto: 'Sem fotos de referência: a produção não terá imagem para conferir.',
        });
    }

    // O número sai de max(existentes) + 1 e só se firma ao gravar: nada fica
    // reservado enquanto esta tela estiver aberta. Dito porque a diferença
    // importa se duas pessoas converterem ao mesmo tempo.
    avisos.push({
        gravidade: 'informacao',
        texto: `O pedido nasce como #${numeroDoPedido}, o próximo da sequência no momento desta conferência.`,
    });

    return {
        criar,
        alterar,
        parcelas,
        avisos,
        pecas,
        totalDoPlano: conferencia.total,
        impedido: impedido || (revisao.motivos.includes('vazio') && plano.length === 0),
    };
}
