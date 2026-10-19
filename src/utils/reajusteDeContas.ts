/**
 * Correção de conta lançada e reajuste de recorrência.
 *
 * O modelo trata `original_amount` como imutável, e por um bom motivo: o valor
 * é a base contra a qual os pagamentos são conferidos, e mexer nele depois de
 * um pagamento faz o "pago" e o "falta" mentirem sem deixar rastro.
 *
 * Só que o caso real não é esse. Conta fixa é pré-lançada por estimativa —
 * energia, água, telefone — e chega alguns reais diferente. Sem poder corrigir,
 * a saída era cancelar e relançar, o que troca o id, perde o histórico da série
 * e ainda deixa uma conta cancelada suja no meio do mês.
 *
 * A regra que resolve os dois lados: o valor é editável ENQUANTO NADA FOI PAGO.
 * Assim que existe um pagamento, o valor volta a ser imutável — que é
 * exatamente quando a imutabilidade importa.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export interface ContaEditavel {
    id: string;
    description?: string;
    original_amount: number;
    due_date: string;
    /** Soma dos pagamentos ativos. > 0 tranca o valor. */
    paid_amount?: number;
    derived_status?: string;
    cancelled_at?: string | null;
    recurrence_id?: string | null;
    installment_no?: number | null;
}

const centavos = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Motivo pelo qual a conta não aceita edição de valor, ou `null` se aceita. */
export function motivoParaNaoEditar(conta: ContaEditavel | null | undefined): string | null {
    if (!conta) return 'Conta não encontrada.';
    if (conta.cancelled_at || conta.derived_status === 'cancelled') {
        return 'Conta cancelada não pode ser alterada.';
    }
    if ((Number(conta.paid_amount) || 0) > 0) {
        return 'Esta conta já tem pagamento lançado. O valor vira imutável aí — '
            + 'estorne o pagamento antes de corrigir.';
    }
    return null;
}

export const podeEditar = (conta: ContaEditavel | null | undefined) =>
    motivoParaNaoEditar(conta) === null;

// ─── reajuste em lote ────────────────────────────────────────────────────────

export type ModoDeReajuste = 'percentual' | 'valor' | 'novoValor';

export interface ParametrosDoReajuste {
    modo: ModoDeReajuste;
    /** % no modo percentual, R$ no modo valor (ambos aceitam negativo), R$ no novoValor. */
    quantia: number;
    /** aaaa-mm-dd. Só conta com vencimento a partir daqui entra. */
    aPartirDe?: string;
}

export interface LinhaDoReajuste {
    id: string;
    descricao: string;
    vencimento: string;
    de: number;
    para: number;
    diferenca: number;
}

export interface PreviaDoReajuste {
    linhas: LinhaDoReajuste[];
    /** Quantas ficaram de fora por já terem pagamento ou estarem canceladas. */
    travadas: number;
    /** Quantas ficaram de fora por vencerem antes da data de corte. */
    forintervalo: number;
    totalAtual: number;
    totalNovo: number;
    diferenca: number;
}

/**
 * O que aconteceria com cada parcela, sem gravar nada.
 *
 * Devolver a prévia em vez de aplicar direto é o ponto: reajuste em lote mexe
 * em doze contas de uma vez, e o erro de digitar 100 onde se queria 10 só é
 * visível depois. Com a lista na tela, o erro aparece antes.
 *
 * Conta com pagamento fica de fora e é contada à parte — some da lista sem
 * explicação seria pior do que não poder mexer.
 */
export function preverReajuste(
    contas: ContaEditavel[],
    params: ParametrosDoReajuste,
): PreviaDoReajuste {
    const quantia = Number(params.quantia) || 0;
    const corte = (params.aPartirDe || '').slice(0, 10);

    let travadas = 0, forintervalo = 0;
    const linhas: LinhaDoReajuste[] = [];

    for (const c of contas || []) {
        if (!podeEditar(c)) { travadas++; continue; }
        if (corte && (c.due_date || '') < corte) { forintervalo++; continue; }

        const de = centavos(c.original_amount);
        let para: number;
        if (params.modo === 'percentual') para = centavos(de * (1 + quantia / 100));
        else if (params.modo === 'valor') para = centavos(de + quantia);
        else para = centavos(quantia);

        // Conta não pode virar zero ou negativa: isso não é reajuste, é
        // cancelamento — e cancelamento tem caminho próprio, com motivo.
        if (para <= 0) { travadas++; continue; }
        if (para === de) continue;

        linhas.push({
            id: c.id,
            descricao: c.description || '(sem descrição)',
            vencimento: c.due_date,
            de,
            para,
            diferenca: centavos(para - de),
        });
    }

    linhas.sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));

    const totalAtual = centavos(linhas.reduce((s, l) => s + l.de, 0));
    const totalNovo = centavos(linhas.reduce((s, l) => s + l.para, 0));

    return {
        linhas,
        travadas,
        forintervalo,
        totalAtual,
        totalNovo,
        diferenca: centavos(totalNovo - totalAtual),
    };
}

// ─── mudança de data em lote ─────────────────────────────────────────────────

export type ModoDeData = 'diaDoMes' | 'deslocamento';

export interface ParametrosDaData {
    modo: ModoDeData;
    /** 1–31, no modo diaDoMes. Dia maior que o mês comporta cai no último dia. */
    dia?: number;
    /** Dias a somar (aceita negativo), no modo deslocamento. */
    dias?: number;
    /** aaaa-mm-dd. Só conta com vencimento a partir daqui entra. */
    aPartirDe?: string;
}

export interface LinhaDeData {
    id: string;
    descricao: string;
    de: string;
    para: string;
}

export interface PreviaDeData {
    linhas: LinhaDeData[];
    travadas: number;
    forintervalo: number;
}

const partes = (iso: string) => (iso || '').slice(0, 10).split('-').map(Number);

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** Último dia do mês — fevereiro e os meses de 30 inclusos. */
export function ultimoDiaDoMes(ano: number, mes: number): number {
    return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Troca o dia do vencimento mantendo mês e ano.
 *
 * O dia é limitado ao último do mês: pedir dia 31 numa série mensal significa
 * "o mais tarde possível", e empurrar fevereiro para março quebraria a ordem
 * das parcelas — duas caindo no mesmo mês e um mês vazio.
 */
export function comDiaDoMes(iso: string, dia: number): string {
    const [a, m] = partes(iso);
    if (!a || !m) return iso;
    const d = Math.min(Math.max(1, Math.trunc(dia)), ultimoDiaDoMes(a, m));
    return `${a}-${doisDigitos(m)}-${doisDigitos(d)}`;
}

/** Quantos dias separam dois vencimentos (negativo quando o segundo é antes). */
export function diferencaEmDias(de: string, para: string): number {
    const [aa, am, ad] = partes(de);
    const [ba, bm, bd] = partes(para);
    if (!aa || !ba) return 0;
    return Math.round((Date.UTC(ba, bm - 1, bd) - Date.UTC(aa, am - 1, ad)) / 86400000);
}

/** Soma dias ao vencimento. Em UTC, para não escorregar por fuso. */
export function somarDias(iso: string, dias: number): string {
    const [a, m, d] = partes(iso);
    if (!a || !m || !d) return iso;
    const t = new Date(Date.UTC(a, m - 1, d));
    t.setUTCDate(t.getUTCDate() + Math.trunc(dias));
    return `${t.getUTCFullYear()}-${doisDigitos(t.getUTCMonth() + 1)}-${doisDigitos(t.getUTCDate())}`;
}

/**
 * O que aconteceria com o vencimento de cada parcela, sem gravar nada.
 *
 * Mesmo motivo da prévia do valor: mexer na data de doze contas de uma vez é
 * fácil de errar e difícil de perceber depois — a lista na tela mostra o erro
 * antes de ele virar um mês com duas contas e outro com nenhuma.
 */
export function preverMudancaDeData(
    contas: ContaEditavel[],
    params: ParametrosDaData,
): PreviaDeData {
    const corte = (params.aPartirDe || '').slice(0, 10);
    let travadas = 0, forintervalo = 0;
    const linhas: LinhaDeData[] = [];

    for (const c of contas || []) {
        if (!podeEditar(c)) { travadas++; continue; }
        const de = (c.due_date || '').slice(0, 10);
        if (!de) { travadas++; continue; }
        if (corte && de < corte) { forintervalo++; continue; }

        const para = params.modo === 'diaDoMes'
            ? comDiaDoMes(de, Number(params.dia) || 0)
            : somarDias(de, Number(params.dias) || 0);

        if (!para || para === de) continue;
        linhas.push({ id: c.id, descricao: c.description || '(sem descrição)', de, para });
    }

    linhas.sort((a, b) => a.de.localeCompare(b.de));
    return { linhas, travadas, forintervalo };
}

/**
 * Deduz a regra do lote a partir da correção já feita nesta conta.
 *
 * Quem mudou o vencimento de 10 para 15 do mesmo mês está dizendo "a conta
 * agora vence dia 15" — o lote é o dia do mês. Quem empurrou para outro mês
 * está adiando, e adiar a série inteira é deslocar todas pelo mesmo tanto.
 * Deduzir evita pedir de novo, em outro campo, o que a pessoa acabou de digitar.
 */
export function sugerirMudancaDeData(de: string, para: string): ParametrosDaData | null {
    const a = (de || '').slice(0, 10);
    const b = (para || '').slice(0, 10);
    if (!a || !b || a === b) return null;

    if (a.slice(0, 7) === b.slice(0, 7)) {
        return { modo: 'diaDoMes', dia: partes(b)[2] };
    }
    return { modo: 'deslocamento', dias: diferencaEmDias(a, b) };
}

/** As parcelas em aberto de uma mesma recorrência, da mais próxima para a mais distante. */
export function parcelasDaRecorrencia(
    contas: ContaEditavel[],
    recurrenceId: string | null | undefined,
    excluirId?: string,
): ContaEditavel[] {
    if (!recurrenceId) return [];
    return (contas || [])
        .filter(c => c.recurrence_id === recurrenceId && c.id !== excluirId)
        .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
}
