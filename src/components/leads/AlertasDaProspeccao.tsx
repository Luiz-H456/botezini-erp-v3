import { useMemo } from 'react';
import { Flame, Building2, Network } from 'lucide-react';
import { estaVivo } from '@/utils/funilDeLeads';
import { leadsQueEsfriaram, DIAS_PARA_ESFRIAR } from '@/utils/filaDoDia';
import { agruparEmRedes, abordagensEconomizadas } from '@/utils/redesEConversao';
import type { Lead } from '@/utils/funilDeLeads';
import { ITEM, ROTULO } from '@/components/finance/ui/estilo';

interface Props {
    leads: Lead[];
    onAbrir?: (lead: Lead) => void;
}

/**
 * O que a fila de hoje não mostra: quem esfriou, e o que é a mesma empresa.
 *
 * ESTE COMPONENTE ERA MAIOR. Ele começou com uma fila própria e um painel de
 * conversão — e as duas coisas já existiam: `filaDeHoje` monta a fila com uma
 * taxonomia de motivos melhor que a que eu tinha escrito, e `conversaoPor` já
 * calcula a conversão por segmento, com corte de amostra mínima e tudo. Em vez
 * de competir com elas, a pontuação nova foi para DENTRO do `filaDeHoje`, como
 * critério de ordem, e o que sobrou aqui é só o que não existia.
 *
 * Fica embaixo da fila, e não acima: a pergunta das nove da manhã é "para quem
 * eu ligo agora", e essa é a fila. Estas duas seções são o que se olha depois.
 */
export function AlertasDaProspeccao({ leads, onAbrir }: Props) {
    const hoje = new Date().toISOString().slice(0, 10);

    const frios = useMemo(() => leadsQueEsfriaram(leads, estaVivo, hoje), [leads, hoje]);
    const redes = useMemo(() => agruparEmRedes(leads), [leads]);

    // Nada a dizer é melhor dito com silêncio: seção vazia com título ocupa o
    // olho e não informa.
    if (frios.length === 0 && redes.length === 0) return null;

    return (
        <div className="space-y-6 pt-2">

            {/* ── Quem esfriou ────────────────────────────────────────── */}
            {frios.length > 0 && (
                <section className="space-y-2">
                    <header className="flex items-baseline justify-between gap-3">
                        <h3 className={`${ROTULO} flex items-center gap-2`}>
                            <Flame size={14} className="text-rose-400" /> Esfriaram
                        </h3>
                        <span className="text-[10px] font-bold text-zinc-600">
                            mais de {DIAS_PARA_ESFRIAR} dias sem contato
                        </span>
                    </header>
                    <div className="space-y-2">
                        {frios.slice(0, 8).map(({ lead, dias }) => (
                            <button
                                key={lead.id}
                                onClick={() => onAbrir?.(lead)}
                                className="w-full flex items-center gap-3 rounded-xl border border-rose-500/15 bg-rose-500/[0.04] px-3 py-2 text-left hover:border-rose-500/30 transition-colors"
                            >
                                <span className="min-w-0 flex-1 text-[11px] font-bold text-zinc-300 truncate">
                                    {lead.nome_fantasia || lead.razao_social}
                                </span>
                                <span className="shrink-0 text-[10px] font-black text-rose-400 tabular-nums">
                                    {dias} dias
                                </span>
                            </button>
                        ))}
                        {frios.length > 8 && (
                            <p className="text-[10px] text-zinc-600 font-bold pt-1">
                                e mais {frios.length - 8}.
                            </p>
                        )}
                    </div>
                </section>
            )}

            {/* ── Redes ───────────────────────────────────────────────── */}
            {redes.length > 0 && (
                <section className="space-y-2">
                    <header className="flex items-baseline justify-between gap-3">
                        <h3 className={`${ROTULO} flex items-center gap-2`}>
                            <Network size={14} className="text-sky-400" /> Mesma rede
                        </h3>
                        <span className="text-[10px] font-bold text-zinc-600">
                            {abordagensEconomizadas(redes)} abordagens repetidas
                        </span>
                    </header>
                    <p className="text-[10px] text-zinc-500 leading-snug">
                        {/* Não é uma curiosidade do cadastro: é trabalho que não
                            precisa ser feito. Abordar as filiais uma a uma queima
                            a rede inteira com a mesma mensagem. */}
                        Abordar cada filial é falar com a mesma empresa várias vezes.
                        Fechar com a maior costuma abrir as outras.
                    </p>
                    <div className="space-y-2">
                        {redes.slice(0, 5).map(rede => (
                            <div key={rede.raiz} className={`${ITEM} px-3 py-2`}>
                                <div className="flex items-center gap-2">
                                    <Building2 size={12} className="text-zinc-600 shrink-0" />
                                    <button
                                        onClick={() => onAbrir?.(rede.principal)}
                                        className="min-w-0 flex-1 text-left text-[11px] font-bold text-zinc-200 truncate hover:text-white transition-colors"
                                    >
                                        {rede.principal.nome_fantasia || rede.principal.razao_social}
                                    </button>
                                    <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-zinc-600">
                                        +{rede.filiais.length} {rede.filiais.length === 1 ? 'unidade' : 'unidades'}
                                    </span>
                                </div>
                                {rede.temCliente && (
                                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500/80 mt-1 pl-[19px]">
                                        {/* Muda a abordagem por inteiro: não é
                                            prospecção fria, é expansão de conta. */}
                                        já há cliente nesta rede
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}

        </div>
    );
}

export default AlertasDaProspeccao;
