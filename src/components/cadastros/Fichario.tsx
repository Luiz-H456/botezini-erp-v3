import { useMemo } from 'react';
import { useFichario } from '@/hooks/cadastros/useFichario';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import { montarFichario } from '@/utils/fichario';
import type { TomDoCartao } from '@/utils/fichario';
import type { View } from '@/utils/navegacao';
import { ICONE_DA_VIEW } from '@/components/layout/icones';
import { CARTAO, ROTULO, ROTULO_PEQUENO, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

const COR_DA_ATENCAO: Record<TomDoCartao, string> = {
    ambar: 'text-amber-400',
    rosa: 'text-rose-400',
    neutro: 'text-zinc-500',
};

/** Cadastros abre aqui: um cartão por cadastro, com a contagem e o que pede atenção. */
export default function Fichario({ onAbrir }: { onAbrir: (view: View) => void }) {
    const { dados, erro, carregando, recarregar } = useFichario();
    const { mostrar } = useMostrarValor();
    // Enquanto carrega (ou se falhou), `dados` é nulo: cartões sem número, nunca com zeros.
    const cartoes = useMemo(() => montarFichario(dados, mostrar), [dados, mostrar]);

    return (
        <div className="space-y-6">
            <div>
                <p className={ROTULO}>Cadastros</p>
                <h1 className="mt-1 text-2xl font-black uppercase tracking-tighter text-white">Fichário</h1>
            </div>
            {erro && (
                <div className="flex flex-wrap items-center gap-3">
                    <p role="alert" className="text-sm font-bold text-rose-400">Não consegui carregar os números — os cartões abrem normalmente.</p>
                    <button type="button" onClick={() => void recarregar()} disabled={carregando} className={`${BOTAO_SECUNDARIO} h-9`}>Tentar de novo</button>
                </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                {cartoes.map(c => {
                    const Icone = ICONE_DA_VIEW[c.view];
                    return (
                        <button key={c.view} type="button" onClick={() => onAbrir(c.view)}
                            className={`${CARTAO} p-5 text-left hover:border-zinc-700 transition-colors`}>
                            <Icone size={18} className="text-zinc-500" />
                            <p className="mt-3 text-sm font-black uppercase tracking-widest text-zinc-200">{c.titulo}</p>
                            {c.contagem !== null && <p className={`mt-1 ${ROTULO_PEQUENO}`}>{c.contagem}</p>}
                            {c.atencao && (
                                <p className={`mt-2 text-[11px] font-black uppercase tracking-widest ${COR_DA_ATENCAO[c.tom]}`}>{c.atencao}</p>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
