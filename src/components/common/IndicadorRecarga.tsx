import { RefreshCw } from 'lucide-react';

/**
 * Selo discreto de "buscando dados novos".
 *
 * Substitui o spinner de tela cheia que aparecia a cada ação. A tela continua
 * mostrando os dados anteriores — este selo só avisa que eles estão sendo
 * conferidos, sem tirar nada do lugar nem roubar o foco.
 */
export function IndicadorRecarga({ ativo }: { ativo?: boolean }) {
    if (!ativo) return null;
    return (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[9px] font-black text-zinc-500 uppercase tracking-widest">
            <RefreshCw size={12} className="animate-spin" /> atualizando
        </span>
    );
}
