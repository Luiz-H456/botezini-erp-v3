import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, RotateCcw, X, ClipboardCheck } from 'lucide-react';
import { operacao, ROTULO_DA_REVERSIBILIDADE } from '@/utils/operacoesSemVolta';

interface Props {
    /** Id em utils/operacoesSemVolta. */
    operacaoId: string;
    /** O que está sendo afetado — nome do pedido, da conta, do cliente. */
    alvo?: string | null;
    /** Detalhe calculado na hora, que o registro não tem como saber. */
    detalhe?: React.ReactNode;
    onConfirmar: () => void | Promise<void>;
    onCancelar: () => void;
}

/**
 * A caixa que aparece antes de uma operação perigosa.
 *
 * Ela mostra sempre as mesmas três coisas, na mesma ordem: o que vai
 * acontecer, o que isso custa, e se dá para voltar atrás. O texto não é escrito
 * aqui — vem do registro em utils/operacoesSemVolta, que é testado.
 *
 * O botão nunca diz "Sim". Diz o verbo da ação ("Excluir pedido",
 * "Sobrescrever saldos"), porque quem clica precisa saber o que fez mesmo tendo
 * lido na diagonal.
 *
 * O QUE NÃO FAZ: não pinta tudo de vermelho. Conciliar e excluir um pedido não
 * podem parecer igualmente graves — alarme em tudo é o mesmo que alarme em
 * nada, e a segunda vez que alguém vê vermelho numa ação inofensiva ele para de
 * significar qualquer coisa.
 */
export const ConfirmarOperacao: React.FC<Props> = ({
    operacaoId, alvo, detalhe, onConfirmar, onCancelar,
}) => {
    const d = operacao(operacaoId);
    const [ocupado, setOcupado] = useState(false);

    useEffect(() => {
        const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape' && !ocupado) onCancelar(); };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [onCancelar, ocupado]);

    // Operação sem descrição não abre caixa nenhuma: seria uma confirmação em
    // branco, que é pior que não perguntar. O teste do registro impede que isto
    // aconteça, e este retorno é a segunda linha de defesa.
    if (!d) return null;

    const confirmar = async () => {
        setOcupado(true);
        try { await onConfirmar(); } finally { setOcupado(false); }
    };

    const semVolta = d.reversibilidade === 'sem-volta';

    return createPortal(
        <div className="fixed inset-0 z-confirmacao bg-zinc-950/85 backdrop-blur-md flex items-center justify-center p-4 ease-out animate-in fade-in duration-150">
            <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden ease-out animate-in zoom-in-95 duration-150">

                <header className="flex items-start gap-3.5 px-6 pt-6 pb-4">
                    <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${
                        d.perigo
                            ? 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                            : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                    }`}>
                        {d.perigo ? <AlertTriangle size={20} /> : <Info size={20} />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-black text-white leading-tight">{d.titulo}</h2>
                        {alvo && (
                            <p className="text-xs text-zinc-500 font-bold truncate mt-1">{alvo}</p>
                        )}
                    </div>
                    <button
                        onClick={onCancelar}
                        disabled={ocupado}
                        className="text-zinc-600 hover:text-white transition-colors shrink-0 disabled:opacity-40"
                    >
                        <X size={16} />
                    </button>
                </header>

                <div className="px-6 pb-5 space-y-3">
                    {/* 1. O que vai acontecer */}
                    <p className="text-[13px] text-zinc-200 leading-relaxed">{d.oQueFaz}</p>

                    {/* 2. O que isso custa */}
                    <p className={`text-[12px] leading-relaxed rounded-xl px-3.5 py-3 border ${
                        d.perigo
                            ? 'text-rose-200/90 bg-rose-950/30 border-rose-900/50'
                            : 'text-zinc-400 bg-zinc-950/50 border-zinc-800'
                    }`}>
                        {d.consequencia}
                    </p>

                    {detalhe && (
                        <div className="text-[12px] text-zinc-300 bg-zinc-950/50 border border-zinc-800 rounded-xl px-3.5 py-3">
                            {detalhe}
                        </div>
                    )}

                    {d.antesDeContinuar && (
                        <p className="flex items-start gap-2 text-[12px] text-amber-300/90 leading-relaxed">
                            <ClipboardCheck size={13} className="shrink-0 mt-0.5" />
                            {d.antesDeContinuar}
                        </p>
                    )}

                    {/* 3. Dá para voltar? */}
                    <p className={`flex items-start gap-2 text-[11px] leading-relaxed ${
                        semVolta ? 'text-rose-400/90 font-bold' : 'text-zinc-500'
                    }`}>
                        <RotateCcw size={12} className="shrink-0 mt-0.5" />
                        <span>
                            <strong>{ROTULO_DA_REVERSIBILIDADE[d.reversibilidade]}.</strong>
                            {d.comoDesfazer && ` ${d.comoDesfazer}`}
                        </span>
                    </p>
                </div>

                <footer className="flex items-center gap-2 px-6 py-4 bg-zinc-950/40 border-t border-zinc-800">
                    <button
                        onClick={onCancelar}
                        disabled={ocupado}
                        className="px-5 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-40"
                    >
                        Voltar
                    </button>
                    <button
                        onClick={confirmar}
                        disabled={ocupado}
                        className={`flex-1 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-40 ${
                            d.perigo
                                ? 'bg-rose-600 text-white hover:bg-rose-500'
                                : 'bg-amber-500 text-black hover:bg-amber-400'
                        }`}
                    >
                        {ocupado ? 'Executando...' : d.rotuloConfirmar}
                    </button>
                </footer>
            </div>
        </div>,
        document.body,
    );
};

export default ConfirmarOperacao;
