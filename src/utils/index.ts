import { z } from 'zod';
import { getNow, getTodayStr } from './date';
import { valoresOcultos, MASCARA } from './privacidade';
export { getNow, getTodayStr };

// --- DATE HELPERS (Pure Functions) ---

/**
 * Define um dia específico para uma data string, garantindo que não estoure o mês.
 * Ex: setDayPreservingMonth('2023-02-15', 31) -> '2023-02-28'
 */
export const setDayPreservingMonth = (dateStr: string, targetDay: number): string => {
  const [y, m] = dateStr.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const safeDay = Math.min(targetDay, daysInMonth);
  return `${y}-${String(m).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
};

export const addBusinessDays = (dateStr: string, daysToAdd: number): string => {
  if (!dateStr) return '';
  const currentDate = new Date(dateStr + 'T12:00:00');
  let added = 0;

  while (added < daysToAdd) {
    currentDate.setDate(currentDate.getDate() + 1);
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }

  const y = currentDate.getFullYear();
  const m = String(currentDate.getMonth() + 1).padStart(2, '0');
  const d = String(currentDate.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
};

export const isDateInPeriod = (targetDate: string, period: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'QUARTER' | 'SEMESTER' | 'ALL', referenceDate: string = getTodayStr()): boolean => {
  if (!targetDate || period === 'ALL') return true;

  const target = targetDate.substring(0, 10);
  const ref = referenceDate.substring(0, 10);

  if (period === 'DAY') return target === ref;

  const [tY, tM] = target.split('-').map(Number);
  const [rY, rM] = ref.split('-').map(Number);

  if (period === 'MONTH') return tY === rY && tM === rM;
  if (period === 'YEAR') return tY === rY;

  if (period === 'QUARTER') {
    const qStart = Math.floor((rM - 1) / 3) * 3 + 1;
    return tY === rY && tM >= qStart && tM < qStart + 3;
  }

  if (period === 'SEMESTER') {
    const sStart = Math.floor((rM - 1) / 6) * 6 + 1;
    return tY === rY && tM >= sStart && tM < sStart + 6;
  }

  if (period === 'WEEK') {
    const refObj = new Date(ref + 'T12:00:00');
    const dayOfWeek = refObj.getDay();
    const msPerDay = 86400000;
    const refTime = refObj.getTime();
    const startMs = refTime - (dayOfWeek * msPerDay);
    const endMs = startMs + (6 * msPerDay);
    const targetTime = new Date(target + 'T12:00:00').getTime();
    return targetTime >= startMs && targetTime <= endMs;
  }

  return false;
};

export const isDateBeforePeriod = (targetDate: string, period: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'QUARTER' | 'SEMESTER' | 'ALL', referenceDate: string = getTodayStr()): boolean => {
  if (!targetDate || period === 'ALL') return false;

  const target = targetDate.substring(0, 10);
  const ref = referenceDate.substring(0, 10);

  const [tY, tM] = target.split('-').map(Number);
  const [rY, rM] = ref.split('-').map(Number);

  if (period === 'DAY') return target < ref;

  if (period === 'MONTH') {
    if (tY !== rY) return tY < rY;
    return tM < rM;
  }

  if (period === 'YEAR') return tY < rY;

  if (period === 'QUARTER') {
    const qStart = Math.floor((rM - 1) / 3) * 3 + 1;
    if (tY !== rY) return tY < rY;
    return tM < qStart;
  }

  if (period === 'SEMESTER') {
    const sStart = Math.floor((rM - 1) / 6) * 6 + 1;
    if (tY !== rY) return tY < rY;
    return tM < sStart;
  }

  if (period === 'WEEK') {
    const refObj = new Date(ref + 'T12:00:00');
    const dayOfWeek = refObj.getDay();
    const msPerDay = 86400000;
    const refTime = refObj.getTime();
    const startMs = refTime - (dayOfWeek * msPerDay);

    const targetTime = new Date(target + 'T12:00:00').getTime();
    return targetTime < startMs;
  }

  return false;
};

/**
 * `validity_days` igual a zero é o orçamento SEM VALIDADE — alguns órgãos
 * públicos exigem isso na licitação, e recusam proposta com prazo de validade
 * porque ela deixaria de valer antes do processo terminar. Zero nunca é a
 * validade real de um orçamento comum, então reaproveitá-lo como sentinela não
 * colide com nenhum valor que alguém digitaria de propósito.
 */
export const isBudgetExpired = (dateString: string, validity_days: number): boolean => {
  if (!dateString) return false;
  if (!validity_days || validity_days <= 0) return false;
  const creationTime = new Date(dateString + 'T12:00:00').getTime();
  const todayTime = new Date(getTodayStr() + 'T12:00:00').getTime();
  const daysDiff = (todayTime - creationTime) / (1000 * 60 * 60 * 24);
  return daysDiff > validity_days;
};

// --- FORMATTERS ---

export const maskCNPJ = (v: string) => {
  return v.replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .substr(0, 18);
};

export const maskPhone = (v: string) => {
  return v.replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d)(\d{4})$/, '$1-$2')
    .substr(0, 15);
};

export const round2 = (num: number) => Math.round((num || 0) * 100) / 100;

/**
 * Formata em BRL tolerando null/undefined/NaN.
 *
 * Um SUM() do Postgres sobre conjunto vazio devolve NULL, não zero — sem nenhuma
 * conta bancária cadastrada isso chegava aqui e derrubava a tela do Financeiro.
 * Formatador não é lugar de quebrar a aplicação: na dúvida mostra zero.
 *
 * Implementação única do app; antes existia uma cópia frágil em FinanceComponents.
 */
export const formatCurrency = (value: number | null | undefined) => {
  // Modo privado: mascara aqui porque esta é a única passagem por onde TODO
  // valor em dinheiro do app passa. Esconder em cada tela deixaria de fora
  // justamente as esquecidas, e um modo privado com furos não serve.
  if (valoresOcultos()) return MASCARA;
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
};

export const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  const cleanDate = dateString.substring(0, 10);
  if (cleanDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = cleanDate.split('-');
    return `${day}/${month}/${year}`;
  }
  return dateString;
};

export * from './categoryResolver';

// --- SCHEMAS (ZOD) ---
export const clientSchema = z.object({
  company_name: z.string().min(2, "Nome obrigatório"),
  category: z.string().nullish(),
  cnpj: z.string().nullish(),
  contact_person: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
  default_cost_center_id: z.string().nullish(),
  default_sub_category: z.string().nullish(),
});

export const supplierSchema = z.object({
  company_name: z.string().min(2, "Nome obrigatório"),
  category: z.string().nullish(),
  cnpj: z.string().nullish(),
  contact_person: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  address: z.string().nullish(),
  default_cost_center_id: z.string().nullish(),
  default_sub_category: z.string().nullish(),
});

export const productSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  sku: z.string().nullish(),
  category: z.string().nullish(),
  price_tier1: z.number().optional(),
  price_tier2: z.number().optional(),
  price_tier3: z.number().optional(),
  description: z.string().nullish(),
  notes: z.string().nullish(),
});

export * from './finance';
