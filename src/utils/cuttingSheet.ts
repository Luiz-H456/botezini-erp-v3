// Ficha de corte — agrega os itens do pedido em ENFESTOS.
//
// Um enfesto é uma abertura de tecido na mesa: mesma composição e mesma cor.
// É a unidade real de trabalho do corte — ninguém abre dois tecidos ao mesmo
// tempo —, por isso a ficha é organizada assim e não por modelo.
//
// Puro de propósito — sem imports — para poder ser testado direto.

/** Ordem de grade usada na indústria; o que não estiver aqui vai depois. */
const ORDEM_TAMANHOS = [
    'RN', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'EG', 'EXG',
    'G1', 'G2', 'G3', 'G4',
];

export interface CutItem {
    product_id?: string;
    product_name?: string;
    /**
     * Modelo/variante da linha do orçamento — "PINTURA", "PLATAFORMA - CALÇA
     * BEGE ESCURO". Distingue duas peças de mesmo produto e mesmo tecido, então
     * muda o molde: sem ele a mesa não sabe qual das variantes está cortando.
     */
    model?: string;
    quantity: number;
    size?: string;
    fabric_name?: string;
    fabric?: string;
    color?: string;
    sleeve_type?: string;
    gender?: string;
    fit?: string;
    /** Faixa refletiva. Muda o corte e a costura — precisa aparecer na ficha. */
    has_band?: boolean;
    /** Observação da fábrica para esta variante. */
    prod_notes?: string;
    /**
     * Peças do conjunto, quando a linha vende mais de uma peça por um preço só.
     * Cada componente tem seu tecido e sua cor, logo seu próprio enfesto.
     */
    components?: {
        name?: string;
        fabric_name?: string;
        color?: string;
        prod_notes?: string;
    }[];
}

/**
 * Abre um item de conjunto em uma linha de corte por peça.
 *
 * A mesa não corta "conjunto": corta jaleco numa abertura de malha e calça
 * noutra de brim. Cada componente vira uma linha com o tecido e a cor dele,
 * mantendo a quantidade e a grade do conjunto — 30 conjuntos são 30 jalecos E
 * 30 calças, não 15 de cada.
 *
 * O nome da peça entra no modelo para a folha dizer o que está sendo cortado;
 * sem isso dois enfestos do mesmo conjunto sairiam com a mesma descrição.
 */
export function explodirComponentes(items: CutItem[]): CutItem[] {
    const saida: CutItem[] = [];
    for (const item of items || []) {
        if (!item) continue;
        const partes = (item.components || []).filter(c => c && (limpa(c.fabric_name) || limpa(c.name)));
        if (partes.length === 0) { saida.push(item); continue; }
        for (const c of partes) {
            saida.push({
                ...item,
                components: undefined,
                model: [limpa(item.model), limpa(c.name)].filter(Boolean).join(' · '),
                // O tecido do componente manda; sem ele, herda o da linha, senão
                // a peça cairia num enfesto "SEM TECIDO" e ninguém a cortaria.
                fabric_name: limpa(c.fabric_name) || item.fabric_name,
                fabric: limpa(c.fabric_name) || item.fabric,
                color: limpa(c.color) || item.color,
                prod_notes: limpa(c.prod_notes) || item.prod_notes,
            });
        }
    }
    return saida;
}

export interface CutSizeRow {
    size: string;
    qty: number;
}

export interface Enfesto {
    /** Rótulo do cabeçalho: "PIQUET / AZUL MARINHO". */
    label: string;
    fabric: string;
    color: string;
    /** Linha fina de contexto: "polo m.curta masc". */
    spec: string;
    rows: CutSizeRow[];
    total: number;
}

export interface ConferenciaRow {
    label: string;          // "Polo · azul marinho"
    bySize: Record<string, number>;
    total: number;
}

export interface CuttingSheet {
    enfestos: Enfesto[];
    /** Tamanhos presentes no pedido, na ordem de grade. */
    sizes: string[];
    conferencia: ConferenciaRow[];
    totalBySize: Record<string, number>;
    totalPieces: number;
}

/** Uma linha do bloco ADICIONAIS: personalização ou item extra do orçamento. */
export interface Adicional {
    tipo: string;          // BORDADO, SILK, DTF, OUTRO, EXTRA
    descricao: string;
    local: string;         // posição da aplicação; vazio para extras
    quantidade: number;
}

const TIPO_CUSTOMIZACAO: Record<string, string> = {
    Embroidery: 'BORDADO', ScreenPrint: 'SILK', DTF: 'DTF', Other: 'OUTRO',
};

/**
 * Junta personalizações e extras do orçamento numa lista só.
 *
 * A ficha antiga jogava os extras no meio das observações, sem quantidade — quem
 * produz precisava adivinhar se eram 50 sacos ou 120. Aqui cada linha carrega a
 * quantidade explícita.
 */
export function buildAdicionais(
    customizations?: { type?: string; description?: string; position?: string; quantity?: number }[] | null,
    extras?: { description?: string; quantity?: number }[] | null,
): Adicional[] {
    const saida: Adicional[] = [];

    for (const c of customizations || []) {
        if (!c) continue;
        const desc = limpa(c.description);
        const tipo = TIPO_CUSTOMIZACAO[c.type || ''] || (limpa(c.type) || 'OUTRO').toUpperCase();
        if (!desc && !limpa(c.position)) continue;
        saida.push({
            tipo,
            descricao: desc || '(sem descrição)',
            local: limpa(c.position),
            quantidade: Number(c.quantity) || 0,
        });
    }

    for (const e of extras || []) {
        if (!e) continue;
        const desc = limpa(e.description);
        if (!desc) continue;
        saida.push({ tipo: 'EXTRA', descricao: desc, local: '', quantidade: Number(e.quantity) || 0 });
    }

    return saida;
}

const SLEEVE: Record<string, string> = {
    manga_curta: 'm.curta', manga_longa: 'm.longa', regata: 'regata', sem_manga: 's/manga',
};
const GENDER: Record<string, string> = {
    masculino: 'masc', feminino: 'fem', infantil: 'inf', unissex: 'uni',
};
const FIT: Record<string, string> = {
    slim: 'slim', regular: 'regular', oversized: 'oversized', babylook: 'babylook',
};

const limpa = (v?: string | null) => (v ?? '').trim();

export function ordenarTamanhos(sizes: string[]): string[] {
    const pos = (s: string) => ORDEM_TAMANHOS.indexOf(s.toUpperCase());
    return [...sizes].sort((a, b) => {
        const pa = pos(a);
        const pb = pos(b);
        if (pa !== -1 && pb !== -1) return pa - pb;
        if (pa !== -1) return -1;
        if (pb !== -1) return 1;
        // numéricos (36, 38, 40) ordenam por valor; o resto, alfabético
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b, 'pt-BR');
    });
}

export function buildCuttingSheet(entrada: CutItem[]): CuttingSheet {
    // Conjunto vira uma linha por peça antes de qualquer agrupamento: daqui
    // para baixo tudo trabalha com peças, que é o que a mesa corta.
    const items = explodirComponentes(entrada);
    const porEnfesto = new Map<string, Enfesto>();
    const porModelo = new Map<string, ConferenciaRow>();
    const tamanhos = new Set<string>();
    const totalBySize: Record<string, number> = {};
    let totalPieces = 0;

    for (const item of items || []) {
        if (!item) continue;
        const qtd = Number(item.quantity) || 0;
        if (qtd <= 0) continue;

        const tecido = limpa(item.fabric_name) || limpa(item.fabric) || 'SEM TECIDO';
        const cor = limpa(item.color) || 'SEM COR';
        const tam = (limpa(item.size) || '-').toUpperCase();
        const modelo = limpa(item.product_name) || 'Item';

        tamanhos.add(tam);

        // ── enfesto ──────────────────────────────────────────────────────────
        // A chave inclui a especificação, não só tecido e cor: manga, modelagem e
        // faixa mudam o molde, logo mudam o encaixe na mesa. Agrupar só por
        // tecido+cor fazia a especificação do primeiro item valer para todos e a
        // dos demais desaparecer da folha — a fábrica cortaria peça errada.
        // MAIUSCULA: a ficha e lida de longe, na mesa de corte, muitas vezes
        // impressa em folha ja amassada. Caixa alta e o que se le de relance.
        const spec = [
            modelo.toUpperCase(),
            // O modelo/variante da linha ("PINTURA", "PLATAFORMA - CALÇA BEGE
            // ESCURO") entrava na chave do enfesto mas não era passado para cá,
            // então duas variantes do mesmo produto e tecido saíam com a mesma
            // descrição na folha — e a mesa não tinha como saber qual cortar.
            limpa(item.model),
            item.sleeve_type ? SLEEVE[item.sleeve_type] || item.sleeve_type : '',
            item.gender ? GENDER[item.gender] || item.gender : '',
            item.fit ? FIT[item.fit] || item.fit : '',
            item.has_band ? 'c/faixa refletiva' : '',
        ].filter(Boolean).join(' · ').toUpperCase();

        const chaveEnfesto = `${tecido.toUpperCase()}|${cor.toUpperCase()}|${spec}`;
        let enf = porEnfesto.get(chaveEnfesto);
        if (!enf) {
            enf = {
                label: `${tecido.toUpperCase()} / ${cor.toUpperCase()}`,
                fabric: tecido, color: cor, spec,
                rows: [], total: 0,
            };
            porEnfesto.set(chaveEnfesto, enf);
        }
        const linha = enf.rows.find(r => r.size === tam);
        if (linha) linha.qty += qtd;
        else enf.rows.push({ size: tam, qty: qtd });
        enf.total += qtd;

    }

    // ── conferência e totais: contam o PEDIDO, não o corte ───────────────────
    //
    // Percorre a entrada original, antes da explosão. Um conjunto de 30 peças
    // ocupa dois enfestos e rende 60 peças na mesa, mas o cliente pediu 30
    // conjuntos — conferir contra 60 acusaria divergência em toda entrega.
    for (const item of entrada || []) {
        if (!item) continue;
        const qtd = Number(item.quantity) || 0;
        if (qtd <= 0) continue;

        const cor = limpa(item.color) || 'SEM COR';
        const tam = (limpa(item.size) || '-').toUpperCase();
        const modelo = limpa(item.product_name) || 'Item';

        tamanhos.add(tam);
        totalBySize[tam] = (totalBySize[tam] || 0) + qtd;
        totalPieces += qtd;

        const chaveModelo = `${modelo.toUpperCase()}|${cor.toUpperCase()}`;
        let conf = porModelo.get(chaveModelo);
        if (!conf) {
            conf = { label: `${modelo} · ${cor}`.toUpperCase(), bySize: {}, total: 0 };
            porModelo.set(chaveModelo, conf);
        }
        conf.bySize[tam] = (conf.bySize[tam] || 0) + qtd;
        conf.total += qtd;
    }

    const sizes = ordenarTamanhos([...tamanhos]);
    const enfestos = [...porEnfesto.values()];
    for (const e of enfestos) {
        e.rows = ordenarTamanhos(e.rows.map(r => r.size))
            .map(s => e.rows.find(r => r.size === s)!);
    }
    // Maior enfesto primeiro: é o que ocupa a mesa por mais tempo.
    enfestos.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'pt-BR'));

    return {
        enfestos,
        sizes,
        conferencia: [...porModelo.values()].sort((a, b) => b.total - a.total),
        totalBySize,
        totalPieces,
    };
}
