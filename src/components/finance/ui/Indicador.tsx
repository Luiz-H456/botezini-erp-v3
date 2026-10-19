import type { LucideIcon } from 'lucide-react';
import { CARTAO, ROTULO_PEQUENO } from './estilo';

type Tom = 'zinc' | 'amber' | 'rose' | 'emerald' | 'violet';
const COR: Record<Tom, string> = {
    zinc: 'text-zinc-100', amber: 'text-amber-400', rose: 'text-rose-400', emerald: 'text-emerald-400', violet: 'text-violet-400',
};

interface Props {
    rotulo: string;
    valor: string;
    sub?: string;
    tom?: Tom;
    icone?: LucideIcon;
    grande?: boolean;
    /** Com onClick vira botão de filtro; `ativo` acende a borda âmbar. */
    onClick?: () => void;
    ativo?: boolean;
}

/** Cartão de indicador — o mesmo do painel da Fábrica (PCP), para as Finanças falarem a mesma língua. */
export function Indicador({ rotulo, valor, sub, tom = 'zinc', icone: Icone, grande, onClick, ativo }: Props) {
    const corpo = (
        <>
            <span className="flex items-center gap-1.5">
                {Icone && <Icone size={12} className="text-zinc-600 shrink-0" />}
                <span className={ROTULO_PEQUENO}>{rotulo}</span>
            </span>
            <span className={`block mt-1 font-black tracking-tighter tabular-nums truncate ${grande ? 'text-3xl' : 'text-lg'} ${COR[tom]}`}>{valor}</span>
            {sub && <span className="block mt-0.5 text-[10px] font-bold text-zinc-600 truncate">{sub}</span>}
        </>
    );
    const base = `${CARTAO} ${grande ? 'p-5' : 'p-4'} min-w-0 text-left`;
    if (!onClick) return <div className={base}>{corpo}</div>;
    return (
        <button type="button" onClick={onClick} aria-pressed={!!ativo}
            className={`${base} transition-colors ${ativo ? 'border-amber-500/40 bg-amber-500/5' : 'hover:border-zinc-700'}`}>
            {corpo}
        </button>
    );
}
