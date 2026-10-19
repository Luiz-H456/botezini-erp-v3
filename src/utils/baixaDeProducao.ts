// O que sai do estoque quando um pedido entra em produção — e o que não sai.
//
// O sistema sempre soube a ficha técnica, sempre soube a quantidade e até
// conferia a falta antes de deixar o pedido avançar. O que nunca fez foi
// DESCONTAR. O estoque é, por isso, uma opinião de quando alguém teve tempo de
// ajustá-lo à mão.
//
// POR QUE ISTO NÃO É SÓ "MULTIPLIQUE E SUBTRAIA"
// Boa parte dos produtos não tem ficha. Uma baixa que simplesmente pula esses
// itens seria pior que baixa nenhuma: o estoque continuaria errado e agora com
// um carimbo de conferido. Então cada peça que NÃO pôde ser apurada sai daqui
// nomeada, com o motivo, para virar uma lista que alguém consegue olhar.
//
// O estoque continua errado como hoje. A diferença é que agora está escrito
// onde.
//
// APELIDOS NÃO SÃO RESOLVIDOS AQUI, DE PROPÓSITO
// Cada cadastro de insumo tem o seu próprio saldo — a soma dos apelidos
// acontece na LEITURA. Baixar do canônico tiraria de um saldo que não é o que a
// ficha aponta, e os dois ficariam errados em direções opostas.
//
// Só importa utils irmãos (relativo, com .ts), para ser testado direto com `node --test`.

export interface ItemParaBaixa {
    product_id?: string | null;
    product_name?: string | null;
    quantity?: number | null;
}

/** Uma linha da ficha técnica: quanto do insumo cada PEÇA consome. */
export interface LinhaDaFicha {
    insumo_id: string;
    quantity?: number | null;
}

export type MotivoNaoApurado =
    | 'produto-nao-cadastrado'
    | 'sem-ficha'
    | 'ficha-sem-quantidade';

export const ROTULO_DO_MOTIVO: Record<MotivoNaoApurado, string> = {
    'produto-nao-cadastrado': 'produto digitado à mão, fora do cadastro',
    'sem-ficha': 'produto sem ficha técnica',
    'ficha-sem-quantidade': 'ficha sem quantidade por peça',
};

export interface BaixaDeInsumo {
    insumo_id: string;
    /** Total a sair do estoque, somado sobre todos os itens do pedido. */
    quantidade: number;
}

export interface ConsumoNaoApurado {
    product_id: string | null;
    product_name: string;
    /** Peças do pedido que ficaram sem baixa. */
    pecas: number;
    motivo: MotivoNaoApurado;
}

export interface PlanoDeBaixa {
    baixas: BaixaDeInsumo[];
    naoApurado: ConsumoNaoApurado[];
    /** Peças do pedido que tiveram o consumo apurado. */
    pecasApuradas: number;
    /** Peças que não tiveram. A soma das duas é o pedido inteiro. */
    pecasNaoApuradas: number;
}

const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * O que sai do estoque, e o que fica por apurar.
 *
 * As baixas saem ordenadas por insumo_id para a chamada ser estável: a mesma
 * entrada produz sempre a mesma sequência, e um pedido reprocessado gera um
 * payload idêntico em vez de um diff falso.
 */
export function planejarBaixa(
    itens: ItemParaBaixa[] | null | undefined,
    fichaPorProduto: Map<string, LinhaDaFicha[]>,
): PlanoDeBaixa {
    const porInsumo = new Map<string, number>();
    const naoApurado: ConsumoNaoApurado[] = [];
    let pecasApuradas = 0;
    let pecasNaoApuradas = 0;

    /** Agrupa o não apurado por produto e motivo — a lista é para ler, não para contar linhas. */
    const registrarFalta = (
        product_id: string | null,
        product_name: string,
        pecas: number,
        motivo: MotivoNaoApurado,
    ) => {
        pecasNaoApuradas += pecas;
        const existente = naoApurado.find(n => n.product_id === product_id && n.motivo === motivo);
        if (existente) { existente.pecas += pecas; return; }
        naoApurado.push({ product_id, product_name, pecas, motivo });
    };

    for (const item of itens || []) {
        const pecas = num(item.quantity);
        const nome = (item.product_name || '').trim() || '(sem nome)';
        // Item de quantidade zero não consome nada e não é pendência: não há o
        // que apurar. Entra em nenhuma das duas contas.
        if (pecas <= 0) continue;

        if (!item.product_id) {
            registrarFalta(null, nome, pecas, 'produto-nao-cadastrado');
            continue;
        }

        const ficha = fichaPorProduto.get(item.product_id) || [];
        if (ficha.length === 0) {
            registrarFalta(item.product_id, nome, pecas, 'sem-ficha');
            continue;
        }

        // Ficha existe mas nenhuma linha diz quanto se consome: pior que não
        // ter, porque parece completa. Baixar zero seria dizer que a peça não
        // consome nada.
        const uteis = ficha.filter(l => l.insumo_id && num(l.quantity) > 0);
        if (uteis.length === 0) {
            registrarFalta(item.product_id, nome, pecas, 'ficha-sem-quantidade');
            continue;
        }

        pecasApuradas += pecas;
        for (const linha of uteis) {
            const total = num(linha.quantity) * pecas;
            porInsumo.set(linha.insumo_id, (porInsumo.get(linha.insumo_id) || 0) + total);
        }
    }

    const baixas = [...porInsumo.entries()]
        .map(([insumo_id, quantidade]) => ({ insumo_id, quantidade }))
        .filter(b => b.quantidade > 0)
        .sort((a, b) => a.insumo_id.localeCompare(b.insumo_id));

    return { baixas, naoApurado, pecasApuradas, pecasNaoApuradas };
}
