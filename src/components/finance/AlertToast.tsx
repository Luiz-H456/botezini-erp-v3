import { CheckCircle, AlertTriangle } from 'lucide-react';

interface AlertToastProps {
    msg: string;
    type: 'success' | 'error';
}

export function AlertToast({ msg, type }: AlertToastProps) {
    return (
        <div className={`fixed bottom-5 right-5 z-aviso flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl
            ${type === 'success' ? 'bg-emerald-950 border-emerald-800 text-emerald-400' : 'bg-red-950 border-red-800 text-red-400'}`}>
            {type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
            <p className="text-sm font-bold">{msg}</p>
        </div>
    );
}
