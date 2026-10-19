/**
 * O idioma visual do resto do app (Pedidos, Fábrica, Estoque), em classes
 * prontas para as telas de Finanças. Uma fonte só: quem muda o padrão muda aqui.
 *
 * Escala de espaço: 4 · 8 · 12 · 16 · 20 · 24 (gap-1 … gap-6). Dentro de
 * cartão p-4/p-5, entre cartões gap-3, entre seções space-y-6.
 */
export const ROTULO = 'text-[10px] font-black uppercase tracking-widest text-zinc-500';
export const ROTULO_PEQUENO = 'text-[9px] font-black uppercase tracking-widest text-zinc-500';
export const CARTAO = 'bg-zinc-900/60 border border-zinc-800 rounded-2xl';
export const ITEM = 'bg-zinc-900/40 border border-zinc-800/70 rounded-xl';
export const CAMPO = 'h-10 rounded-xl bg-zinc-950/50 border border-zinc-800 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-amber-500/40';

// [&>svg]:shrink-0: o ícone nunca encolhe. Botão só de ícone (`w-10 px-0`) perdia para o px-4 daqui na
// ordem do CSS do Tailwind v4, sobravam 6px de conteúdo e o ícone de 18px virava um ponto.
const BOTAO = 'inline-flex h-10 items-center justify-center gap-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50 [&>svg]:shrink-0';
export const BOTAO_PRINCIPAL = `${BOTAO} bg-amber-500 text-black hover:bg-amber-400`;
export const BOTAO_SUAVE = `${BOTAO} bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20`;
export const BOTAO_SECUNDARIO = `${BOTAO} border border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:text-white hover:border-zinc-700`;
export const BOTAO_PERIGO = `${BOTAO} border border-rose-500/30 text-rose-400 hover:bg-rose-500/10`;

/** Pílula de aba ou filtro, igual às abas do PCP. */
export const pilula = (ativa: boolean) =>
    `inline-flex h-9 shrink-0 items-center gap-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap border transition-colors ${ativa
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
        : 'text-zinc-500 border-transparent hover:text-zinc-300'}`;

/** Cor do valor por tipo de conta, como na v2: entra verde, sai rosa. */
export const corDoTipo = (tipo: 'receivable' | 'payable') => (tipo === 'receivable' ? 'text-emerald-400' : 'text-rose-400');
