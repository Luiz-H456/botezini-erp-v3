import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Check, Loader2, AlertTriangle, Info, Plus, Pencil, ArrowRight, Calendar,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils';
import { resumirConversao } from '@/utils/resumoDaConversao';
import type { DadosDaConversao } from '@/utils/resumoDaConversao';

interface Props extends DadosDaConversao {
    onConfirmar: () => Promise<void> | void;
    onCancelar: () => void;
    /** Volta para o modal de plano em vez de fechar tudo. */
    onEditarPlano?: () => void;
}

const ESTILO_DO_AVISO = {
    erro: {
        caixa: 'bg-rose-500/10 border-rose-500/30',
        texto: 'text-rose-300',
        icone: 'text-rose-400',
    },
    atencao: {
        caixa: 'bg-amber-500/10 border-amber-500/30',
        texto: 'text-amber-300',
        icone: 'text-amber-400',
    },
    informacao: {
        caixa: 'bg-zinc-900/60 border-zinc-800',
        texto: 'text-zinc-400',
        icone: 'text-zinc-600',
    },
} as const;

/**
 * O que a conversão vai gravar, antes de gravar.
 *
 * Converter é a operação mais cara do sistema — cria pedido, cria contas a
 * receber com vencimento, consome um número de sequência e muda o estado do
 * orçamento. Tudo isso acontecia atrás de uma frase que não citava um único
 * valor nem uma única data.
 *
 * A separação entre CRIAR e ALTERAR é a espinha da tela: criar é reversível
 * apagando; alterar sobrescreve algo que já valia. Quem confere precisa saber
 * de qual dos dois se trata.
 *
 * As parcelas aparecem uma a uma, com valor e vencimento, porque é exatamente
 * a lista que some depois — quem quiser conferir se o combinado com o cliente
 * virou aquilo, aqui é o único lugar onde os dois estão lado a lado.
 */
export function ResumoDaConversao({ onConfirmar, onCancelar, onEditarPlano, ...dados }: Props) {
    const [salvando, setSalvando] = useState(false);
    const r = resumirConversao(dados);

    const confirmar = async () => {
        setSalvando(true);
        try {
            await onConfirmar();
        } finally {
            setSalvando(false);
        }
    };

    const Secao = ({ icone: Icone, titulo, cor, linhas }: {
        icone: typeof Plus; titulo: string; cor: string;
        linhas: { o_que: string; detalhe: string; nota?: string }[];
    }) => (
        <div>
            <p className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] mb-2 ${cor}`}>
                <Icone size={12} /> {titulo}
            </p>
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl divide-y divide-zinc-800/60">
                {linhas.map((l, i) => (
                    <div key={i} className="px-4 py-2.5">
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <span className="text-[11px] font-black text-zinc-200">{l.o_que}</span>
                            <span className="text-[11px] font-bold text-zinc-400 font-mono text-right">{l.detalhe}</span>
                        </div>
                        {l.nota && (
                            <p className="text-[10px] font-bold text-zinc-600 mt-0.5 leading-snug">{l.nota}</p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );

    return createPortal(
        <div className="fixed inset-0 z-sobreposto bg-zinc-950/90 backdrop-blur-xl flex items-center justify-center p-4 ease-out animate-in fade-in duration-200"
            onClick={onCancelar}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden ease-out animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}>

                <div className="shrink-0 px-5 py-4 border-b border-zinc-800 bg-zinc-950/40 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
                            Conferir antes de gerar o pedido
                        </h2>
                        <p className="text-[10px] text-zinc-500 font-bold mt-0.5 truncate">
                            {dados.orcamento.serial_number} · {dados.cliente}
                        </p>
                    </div>
                    <button type="button" onClick={onCancelar} aria-label="Fechar"
                        className="p-2 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors shrink-0">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar">

                    <div className="text-center py-1">
                        <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-1">
                            Valor do pedido
                        </p>
                        <p className="text-3xl font-black font-mono text-amber-500">
                            {formatCurrency(dados.orcamento.total_amount || 0)}
                        </p>
                    </div>

                    <Secao icone={Plus} titulo="Vai criar" cor="text-emerald-500" linhas={r.criar} />

                    {/* As parcelas, uma a uma. É a lista que some depois de gravada
                        e a única chance de comparar com o que foi combinado. */}
                    {r.parcelas.length > 0 && (
                        <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl overflow-hidden">
                            <div className="px-4 py-2 border-b border-zinc-800/60 flex items-center justify-between">
                                <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-1.5">
                                    <Calendar size={12} /> Parcelas no financeiro
                                </span>
                                <span className="text-[10px] font-mono font-black text-zinc-300">
                                    {formatCurrency(r.totalDoPlano)}
                                </span>
                            </div>
                            <div className="divide-y divide-zinc-800/40">
                                {r.parcelas.map((p, i) => (
                                    <div key={i} className="px-4 py-2 flex items-center justify-between gap-3">
                                        <span className="text-[11px] font-bold text-zinc-300 truncate">{p.label}</span>
                                        <span className="flex items-center gap-3 shrink-0">
                                            <span className={`text-[10px] font-bold font-mono ${p.vencida ? 'text-rose-400' : 'text-zinc-500'}`}>
                                                {formatDate(p.due)}
                                                {p.vencida && ' · vencida'}
                                            </span>
                                            <span className="text-[11px] font-mono font-black text-zinc-200 w-24 text-right">
                                                {formatCurrency(p.amount)}
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <Secao icone={Pencil} titulo="Vai alterar" cor="text-sky-400" linhas={r.alterar} />

                    {r.avisos.length > 0 && (
                        <div className="space-y-2">
                            {r.avisos.map((a, i) => {
                                const e = ESTILO_DO_AVISO[a.gravidade];
                                return (
                                    <div key={i} className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border ${e.caixa}`}>
                                        {a.gravidade === 'informacao'
                                            ? <Info size={12} className={`${e.icone} shrink-0 mt-0.5`} />
                                            : <AlertTriangle size={12} className={`${e.icone} shrink-0 mt-0.5`} />}
                                        <p className={`text-[10px] font-bold leading-relaxed ${e.texto}`}>{a.texto}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="shrink-0 p-5 border-t border-zinc-800 bg-zinc-950/40 flex gap-2 flex-wrap">
                    <button onClick={onCancelar} disabled={salvando}
                        className="px-4 py-3 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-40">
                        Cancelar
                    </button>
                    {onEditarPlano && (
                        <button onClick={onEditarPlano} disabled={salvando}
                            className="px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600 text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-40">
                            Ajustar plano
                        </button>
                    )}
                    <button onClick={confirmar} disabled={salvando || r.impedido}
                        title={r.impedido ? 'Corrija os erros acima antes de gerar' : undefined}
                        className="flex-1 min-w-[150px] flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-40 disabled:bg-zinc-800 disabled:text-zinc-500">
                        {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                        {salvando ? 'Gerando...' : 'Gerar pedido'}
                        {!salvando && !r.impedido && <ArrowRight size={13} />}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
