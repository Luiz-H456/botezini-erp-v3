import React, { useMemo } from 'react';
import { TrendingDown, TrendingUp, Scale } from 'lucide-react';
import { PersonalizacaoPreco, PersonalizacaoHistorico } from '@/types';
import { formatCurrency } from '@/utils';
import { compararTabelaComPraticado, ROTULO_TECNICA } from '@/utils/personalizacao';
import { CARTAO, ROTULO, ROTULO_PEQUENO } from '@/components/finance/ui/estilo';

interface Props {
    precos: PersonalizacaoPreco[];
    historico: PersonalizacaoHistorico[];
}

/**
 * "A minha tabela ainda vale?"
 *
 * Só aparece quando há tabela E histórico da mesma técnica — sem os dois lados
 * não há comparação, e um painel vazio ocupando o topo da tela seria só ruído.
 *
 * Uma diferença pequena é normal (desconto de volume, um pedido urgente). O que
 * o painel mostra é a diferença SISTEMÁTICA: se a média ponderada de meses fica
 * 25% abaixo da tabela, o desconto virou o preço real sem ninguém decidir isso.
 */
const TOLERANCIA_PCT = 10;

const DivergenciaPanel: React.FC<Props> = ({ precos, historico }) => {
    const linhas = useMemo(
        () => compararTabelaComPraticado(precos as any, historico as any)
            .filter(d => d.tabelado !== null && d.diferencaPct !== null),
        [precos, historico]);

    const relevantes = linhas.filter(d => Math.abs(d.diferencaPct!) > TOLERANCIA_PCT);
    if (relevantes.length === 0) return null;

    return (
        <div className={`${CARTAO} p-5 space-y-3`}>
            <p className={`${ROTULO} flex items-center gap-2`}>
                <Scale size={15} className="text-amber-500" /> Tabela × praticado
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {relevantes.map(d => {
                    const abaixo = d.diferenca! < 0;
                    return (
                        <div key={d.tecnica}
                            className={`rounded-xl p-4 border ${abaixo ? 'bg-rose-950/10 border-rose-900/40' : 'bg-emerald-950/10 border-emerald-900/40'}`}>
                            <p className={`${ROTULO_PEQUENO} mb-2`}>{ROTULO_TECNICA[d.tecnica]}</p>
                            <p className={`text-xl font-black font-mono tracking-tighter flex items-center gap-2 ${abaixo ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {abaixo ? <TrendingDown size={18} /> : <TrendingUp size={18} />}
                                {d.diferencaPct! > 0 ? '+' : ''}{d.diferencaPct!.toFixed(0)}%
                            </p>
                            <p className="text-[10px] text-zinc-500 mt-1.5">
                                tabela {formatCurrency(d.tabelado!)} · praticado {formatCurrency(d.praticado)}
                            </p>
                            <p className="text-[10px] text-zinc-600 mt-0.5">
                                {abaixo ? 'Você cobra menos do que tabela' : 'Você cobra acima da tabela'} — {d.lancamentos} lanç.
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default DivergenciaPanel;
