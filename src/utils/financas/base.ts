/**
 * Base das contas do Financeiro v3: tipos estruturais e datas.
 *
 * Tipos estruturais, e não ObligationSummary, para o módulo rodar no
 * `node --test` sem importar `../types` (que é diretório e quebra o runner).
 * Datas são texto ISO (YYYY-MM-DD) e as contas são feitas em UTC: assim fuso
 * nenhum empurra um vencimento para o dia vizinho.
 */

export interface ContaResumo {
    id: string;
    type: 'receivable' | 'payable';
    description: string;
    due_date: string;
    original_amount: number;
    remaining_amount: number;
    derived_status: string;
    awaiting_delivery?: boolean | null;
    /** Conta de pedido ainda não entregue, COM a entrada (o sentido antigo de awaiting_delivery). */
    pedido_em_aberto?: boolean | null;
    is_reconciled?: boolean | null;
    payment_count?: number | null;
    client_id?: string | null;
    supplier_id?: string | null;
    order_id?: string | null;
    global_category_id?: string | null;
    category?: string | null;
    installment_no?: number | null;
    total_installments?: number | null;
    planned_method?: string | null;
    default_account_id?: string | null;
}

export interface PagamentoResumo {
    obligation_id: string;
    amount: number;
    payment_date: string;
    account_id?: string | null;
    reversal_of?: string | null;
    affects_balance?: boolean | null;
    created_at?: string | null;
}

export interface CategoriaResumo {
    id: string;
    name: string;
    custo_do_produto?: boolean | null;
}

export const centavos = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const DIA_EM_MS = 86_400_000;

const emUtc = (dia: string): number => {
    const [y, m, d] = dia.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
};
const paraIso = (t: number): string => new Date(t).toISOString().slice(0, 10);

export const diasEntre = (de: string, ate: string): number => Math.round((emUtc(ate) - emUtc(de)) / DIA_EM_MS);
export const somarDias = (dia: string, dias: number): string => paraIso(emUtc(dia) + dias * DIA_EM_MS);

export const ultimoDiaDoMes = (dia: string): string => {
    const [y, m] = dia.split('-').map(Number);
    return paraIso(Date.UTC(y, m, 0));
};

export const mesDe = (dia: string): string => dia.slice(0, 7);

export const mesAnterior = (mes: string): string => {
    const [y, m] = mes.split('-').map(Number);
    return paraIso(Date.UTC(y, m - 2, 1)).slice(0, 7);
};

export const proximoMes = (mes: string): string => {
    const [y, m] = mes.split('-').map(Number);
    return paraIso(Date.UTC(y, m, 1)).slice(0, 7);
};

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeDoMes = (mes: string): string => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

/** Os três meses do trimestre civil (jan–mar, abr–jun, jul–set, out–dez) que contém `mes`. */
export const trimestreDe = (mes: string): string[] => {
    const [y, m] = mes.split('-').map(Number);
    const primeiro = Math.floor((m - 1) / 3) * 3 + 1;
    return [0, 1, 2].map(i => `${y}-${String(primeiro + i).padStart(2, '0')}`);
};
export const nomeDoTrimestre = (mes: string): string =>
    `${Math.floor((Number(mes.slice(5, 7)) - 1) / 3) + 1}º trimestre ${mes.slice(0, 4)}`;

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const diaDaSemana = (dia: string): string => SEMANA[new Date(emUtc(dia)).getUTCDay()];
export const diaEMes = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** Real brasileiro sem depender do ICU do ambiente (que põe espaço inseparável). */
export function reais(n: number): string {
    const v = centavos(n);
    const [inteiro, decimal] = Math.abs(v).toFixed(2).split('.');
    const comPontos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${v < 0 ? '-' : ''}R$ ${comPontos},${decimal}`;
}
