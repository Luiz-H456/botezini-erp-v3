import { viewsDaSecao, secaoPorId, ROTULO_DA_VIEW } from '@/utils/navegacao';
import type { SecaoId, View } from '@/utils/navegacao';
import { pilula } from '@/components/finance/ui/estilo';
import { ICONE_DA_VIEW } from './icones';

interface Props { secao: SecaoId; viewAtual: View; onNavegar: (v: View) => void }

/** Os passos do objetivo, no formato das abas do PCP. Numerados quando há ordem (1 → 2 → 3). */
export function BarraDePassos({ secao, viewAtual, onNavegar }: Props) {
    const numerado = !!secaoPorId(secao)?.numerado;
    return (
        <nav aria-label="Passos" className="shrink-0 px-5 pt-4 print:hidden">
            {/* Quebra de linha em vez de rolar de lado: passo escondido à direita é passo que ninguém vê. */}
            <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3">
                {viewsDaSecao(secao).map((v, i) => {
                    const Icone = ICONE_DA_VIEW[v];
                    return (
                        <button key={v} type="button" onClick={() => onNavegar(v)}
                            aria-current={v === viewAtual ? 'page' : undefined} className={pilula(v === viewAtual)}>
                            {numerado
                                ? <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[10px]">{i + 1}</span>
                                : <Icone size={13} />}
                            {ROTULO_DA_VIEW[v]}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
