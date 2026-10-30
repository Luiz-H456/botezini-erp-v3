import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';
import { ouvirAvisos, fecharAviso, type Aviso } from '@/utils/avisos';

const ESTILO: Record<Aviso['tipo'], string> = {
    success: 'bg-emerald-950/95 border-emerald-800 text-emerald-200',
    error: 'bg-red-950/95 border-red-800 text-red-200',
    info: 'bg-sky-950/95 border-sky-800 text-sky-200',
};
const ICONE = { success: CheckCircle, error: AlertTriangle, info: Info };

/** Onde os avisos de todo o app aparecem (utils/avisos.ts). Montada uma vez, no App. */
export function CentralDeAvisos() {
    const [avisos, setAvisos] = useState<Aviso[]>([]);
    useEffect(() => ouvirAvisos(setAvisos), []);
    if (avisos.length === 0) return null;
    return createPortal(
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-aviso flex flex-col items-end gap-2 pointer-events-none" aria-live="polite">
            {avisos.map(a => {
                const Icone = ICONE[a.tipo];
                return (
                    <div key={a.id} role={a.tipo === 'error' ? 'alert' : 'status'}
                        className={`pointer-events-auto w-full sm:w-auto sm:max-w-md flex items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur-md ease-out animate-in slide-in-from-bottom-2 duration-200 ${ESTILO[a.tipo]}`}>
                        <Icone size={18} className="shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                            {a.titulo && <p className="text-xs font-bold uppercase">{a.titulo}</p>}
                            <p className="text-sm">{a.mensagem}</p>
                        </div>
                        <button type="button" onClick={() => fecharAviso(a.id)} aria-label="Fechar aviso"
                            className="-mr-2 -my-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg opacity-70 hover:opacity-100">
                            <X size={16} />
                        </button>
                    </div>
                );
            })}
        </div>,
        document.body,
    );
}
