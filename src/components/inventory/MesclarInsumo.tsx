import React, { useMemo } from 'react';
import { Link2, AlertTriangle } from 'lucide-react';
import { candidatosDeInsumo, apelidosDe, saldoConsolidado } from '@/utils/apelidosDeInsumo';
import type { Insumo } from '@/types';
import { ITEM, ROTULO_PEQUENO, BOTAO_SUAVE, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

interface Props {
    data: Partial<Insumo>;
    onChange: (patch: Partial<Insumo>) => void;
    /** Todos os insumos, para achar os parecidos. */
    insumos: Insumo[];
}

/**
 * "Este tecido é o mesmo que aquele."
 *
 * O mesmo pano cadastrado três vezes reparte o estoque em três linhas — nenhuma
 * bate com a prateleira — e dá três custos médios diferentes, cada um calculado
 * sobre uma fatia das compras. Qual deles a ficha técnica pegou decide o CMV da
 * peça, o que torna isto um problema de custo, não só de organização.
 *
 * Ligar em vez de fundir: as movimentações de cada cadastro ficam intactas, e a
 * soma acontece na leitura. Desfazer é um clique.
 */
export const MesclarInsumo: React.FC<Props> = ({ data, onChange, insumos }) => {
    const candidatos = useMemo(
        () => candidatosDeInsumo(data as any, insumos as any),
        [data, insumos]);

    const apelidosDeste = useMemo(
        () => apelidosDe(data.id, insumos as any),
        [data.id, insumos]);

    const consolidado = useMemo(
        () => (data.id ? saldoConsolidado(data.id, insumos as any) : null),
        [data.id, insumos]);

    const oficial = insumos.find(i => i.id === data.canonical_insumo_id);

    if (!data.id) return null;
    if (candidatos.length === 0 && !data.canonical_insumo_id && apelidosDeste.length === 0) return null;

    return (
        <div className={`${ITEM} p-4`}>
            <div className="flex items-center gap-2 mb-3">
                <Link2 size={12} className="text-amber-500 shrink-0" />
                <span className={ROTULO_PEQUENO}>
                    Mesmo material, nome diferente
                </span>
            </div>

            {data.canonical_insumo_id ? (
                <div className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                    <p className="text-[10px] text-amber-500/90 leading-snug min-w-0">
                        Este cadastro é o mesmo que <b>{oficial?.name || '(insumo removido)'}</b>.
                        O saldo e o custo dos dois são contados juntos.
                    </p>
                    <button type="button"
                        onClick={() => onChange({ canonical_insumo_id: null })}
                        className={`${BOTAO_SECUNDARIO} shrink-0`}>
                        Desfazer
                    </button>
                </div>
            ) : apelidosDeste.length > 0 ? (
                <div className="space-y-2">
                    <p className="text-[10px] text-zinc-500 leading-snug">
                        Este é o cadastro oficial de{' '}
                        <b className="text-zinc-300">{apelidosDeste.map(i => i.name).join(', ')}</b>.
                    </p>
                    {consolidado && consolidado.cadastros > 1 && (
                        <div className={`flex items-center gap-4 ${ITEM} px-3 py-2`}>
                            <div>
                                <p className={ROTULO_PEQUENO}>Estoque somado</p>
                                <p className="text-[12px] font-black font-mono text-zinc-200">
                                    {consolidado.estoque} {data.unit}
                                </p>
                            </div>
                            <div>
                                <p className={ROTULO_PEQUENO}>Custo médio real</p>
                                <p className="text-[12px] font-black font-mono text-amber-500">
                                    {consolidado.custoMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </p>
                            </div>
                            <p className="text-[9px] text-zinc-600 font-bold leading-snug">
                                ponderado pelo saldo de cada cadastro
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <>
                    <p className="text-[10px] text-zinc-600 font-bold leading-relaxed mb-2">
                        Nada é apagado: as movimentações de cada cadastro seguem intactas, e o saldo
                        e o custo passam a ser somados. As faixas de cor do mesmo tecido
                        (Branco/Padrão/Especial) <b className="text-zinc-500">não</b> aparecem aqui —
                        elas são separadas de propósito, porque o metro custa diferente em cada uma.
                    </p>
                    <div className="space-y-2">
                        {candidatos.slice(0, 5).map(c => (
                            <div key={c.insumo.id} className="flex items-center justify-between gap-3">
                                <span className="text-[10px] font-bold text-zinc-300 truncate min-w-0">
                                    {c.insumo.name}
                                    <span className="ml-2 text-[9px] font-mono text-zinc-600">
                                        {c.insumo.current_stock ?? 0} {c.insumo.unit}
                                    </span>
                                    {c.mesmoNomeNormalizado && (
                                        <span className="ml-2 text-[8px] font-black uppercase tracking-widest text-amber-500">
                                            mesmo nome
                                        </span>
                                    )}
                                    {!c.mesmoNomeNormalizado && c.mesmaFamilia && (
                                        <span className="ml-2 text-[8px] font-black uppercase tracking-widest text-amber-500/70">
                                            mesma família
                                        </span>
                                    )}
                                    {c.unidadeDiferente && (
                                        <span className="ml-2 text-[8px] font-black uppercase tracking-widest text-rose-400/90">
                                            <AlertTriangle size={12} className="inline mb-0.5 mr-0.5" />
                                            unidade diferente
                                        </span>
                                    )}
                                </span>
                                <button type="button"
                                    onClick={() => onChange({ canonical_insumo_id: c.insumo.id })}
                                    className={`${BOTAO_SUAVE} shrink-0`}>
                                    É o mesmo
                                </button>
                            </div>
                        ))}
                    </div>
                    {candidatos.some(c => c.unidadeDiferente) && (
                        <p className="text-[9px] text-rose-400/80 font-bold mt-2 leading-relaxed">
                            Cadastro em unidade diferente soma metro com quilo — o saldo resultante
                            não significa nada. Só mescle se for de fato o mesmo material medido do
                            mesmo jeito.
                        </p>
                    )}
                </>
            )}
        </div>
    );
};
