import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onClose: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
    isDanger?: boolean;
}

export function ConfirmModal({
    isOpen, title, message, onConfirm, onClose, confirmLabel = "Confirmar", cancelLabel = "Cancelar", isDanger = false
}: ConfirmModalProps) {
    if (!isOpen) return null;
    return createPortal(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-confirmacao p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        {isDanger && <AlertTriangle size={20} className="shrink-0 text-rose-400" />}
                        <h3 className="text-base font-semibold text-white">{title}</h3>
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed mb-6">{message}</p>
                    <div className="flex justify-end gap-3">
                        <button onClick={onClose} className="h-10 px-3 rounded-lg border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900">
                            {cancelLabel}
                        </button>
                        <button onClick={onConfirm}
                            className={isDanger
                                ? "h-10 px-4 rounded-lg border border-rose-500/40 text-rose-400 text-sm font-semibold hover:bg-rose-500/10"
                                : "h-10 px-4 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-amber-400"}>
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
