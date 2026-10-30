import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock, AlertTriangle } from 'lucide-react';

import { mensagemDeErro } from '@/utils/errorHandling';
interface Props {
    orderNumber: string;
    clientName?: string;
    onClose: () => void;
    onConfirm: (dias: number, motivo: string) => Promise<void>;
}

/** Motivos que aparecem toda semana no chão de fábrica — atalho para não ter
 *  que digitar, mas o campo continua livre para o caso que não está na lista. */
const MOTIVOS_COMUNS = [
    'Tecido não chegou',
    'Aviamento em falta',
    'Máquina quebrada',
    'Falta de pessoal',
    'Alteração do cliente',
    'Retrabalho / qualidade',
];

/**
 * Registra um atraso com justificativa obrigatória. Os dias viram uma data de
 * liberação congelada no banco — por isso o texto fala "volta a andar em", e
 * não "atrasa N dias a partir de agora": recalcular o cronograma depois não
 * empurra o pedido de novo.
 */
export const RegistrarAtrasoModal: React.FC<Props> = ({ orderNumber, clientName, onClose, onConfirm }) => {
    const [dias, setDias] = useState(3);
    const [motivo, setMotivo] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    const motivoValido = motivo.trim().length > 0;
    const diasValidos = Number.isFinite(dias) && dias >= 1;

    const liberacao = (() => {
        if (!diasValidos) return '—';
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + Math.round(dias));
        return d.toLocaleDateString('pt-BR');
    })();

    const salvar = async () => {
        if (!motivoValido || !diasValidos || salvando) return;
        setSalvando(true); setErro('');
        try {
            await onConfirm(Math.round(dias), motivo.trim());
        } catch (e: any) {
            setErro(mensagemDeErro(e, 'Não foi possível registrar o atraso'));
            setSalvando(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-xl z-sobreposto flex items-center justify-center p-4 ease-out animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-lg ease-out animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                            <Clock size={20} className="text-rose-400" />
                        </div>
                        <div>
                            <h3 className="text-white font-black uppercase tracking-tight">Registrar atraso</h3>
                            <p className="text-[10px] text-zinc-500 font-bold">
                                #{orderNumber}{clientName ? ` · ${clientName}` : ''}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X size={18} /></button>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">
                            Quantos dias o pedido ficou parado
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number" min={1} max={365} value={dias}
                                onChange={e => setDias(Number(e.target.value))}
                                className="w-24 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono font-bold outline-none focus:border-amber-500"
                            />
                            <p className="text-xs text-zinc-400">
                                Volta a ser planejado em <strong className="text-amber-400 font-mono">{liberacao}</strong>
                            </p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">
                            Motivo <span className="text-rose-400">*</span>
                        </label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {MOTIVOS_COMUNS.map(m => (
                                <button key={m} type="button" onClick={() => setMotivo(m)}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                        motivo === m
                                            ? 'bg-amber-500 text-black border-amber-500'
                                            : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-white'
                                    }`}>
                                    {m}
                                </button>
                            ))}
                        </div>
                        <textarea
                            value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
                            placeholder="O que travou o pedido?"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-amber-500 resize-none placeholder:text-zinc-600"
                        />
                        <p className="text-[10px] text-zinc-600 font-bold mt-1">
                            Fica no histórico do pedido. É o que explica o atraso depois, quando ninguém mais lembra.
                        </p>
                    </div>

                    {erro && (
                        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                            <AlertTriangle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-rose-400 font-bold">{erro}</p>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3 px-6 py-4 border-t border-zinc-800">
                    <button onClick={onClose} disabled={salvando}
                        className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-40">
                        Cancelar
                    </button>
                    <button onClick={salvar} disabled={!motivoValido || !diasValidos || salvando}
                        className="flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500">
                        {salvando ? 'Salvando…' : 'Registrar e replanejar'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
