import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Scissors, RefreshCw, TrendingDown, TrendingUp, Minus, AlertTriangle, Check,
} from 'lucide-react';
import { productionRepository } from '@/repositories/productionRepository';
import type { RendimentoDoCorteRow } from '@/repositories/productionRepository';
import {
    resumirRendimento, tendenciaDoCorte, razaoDoCorte, classificar,
    MINIMO_PARA_TENDENCIA,
} from '@/utils/rendimentoDoCorte';
import type { RegistroDeCorte, Veredito } from '@/utils/rendimentoDoCorte';
import { IndicadorRecarga } from '@/components/common/IndicadorRecarga';
import { InfoTooltip } from '@/components/common';
import { CARTAO, ITEM, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL } from '@/components/finance/ui/estilo';

import { mensagemDeErro } from '@/utils/errorHandling';
const TOM: Record<Veredito, string> = {
    economia: 'text-emerald-400',
    dentro: 'text-zinc-300',
    desperdicio: 'text-rose-400',
};

const razaoTexto = (r: number) => r.toFixed(2).replace('.', ',');
const qtd = (n: number, unidade?: string | null) =>
    `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${unidade || ''}`.trim();

const dataCurta = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';

/**
 * Rendimento do corte — o que a ficha previu contra o que o enfesto gastou.
 *
 * Tecido é a maior fatia do custo da peça, e melhorar o encaixe é a alavanca
 * mais direta sobre a margem. Este é o número que diz se ele está melhorando —
 * e o que decide se vale investir em software de encaixe: 1,02 diz que não há
 * muito a ganhar; 1,25 diz que há um quarto do maior custo indo para o chão.
 *
 * O previsto é gravado sozinho quando o pedido entra em produção. O gasto só
 * quem esteve no enfesto sabe, e é o que se digita aqui. Linha sem gasto é
 * pergunta em aberto — nunca um zero.
 */
export const RendimentoDoCortePanel: React.FC = () => {
    const [linhas, setLinhas] = useState<RendimentoDoCorteRow[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [recarregando, setRecarregando] = useState(false);
    const [erro, setErro] = useState('');
    const [rascunho, setRascunho] = useState<Record<string, string>>({});
    const [salvando, setSalvando] = useState<string | null>(null);

    const carregar = useCallback(async (primeira = false) => {
        if (primeira) setCarregando(true); else setRecarregando(true);
        try {
            setLinhas(await productionRepository.getRendimentoDoCorte());
        } catch (e: any) {
            setErro(mensagemDeErro(e, 'Falha ao ler o rendimento'));
        } finally {
            setCarregando(false);
            setRecarregando(false);
        }
    }, []);

    useEffect(() => { carregar(true); }, [carregar]);

    const registros: RegistroDeCorte[] = useMemo(() => linhas.map(l => ({
        insumo_id: l.insumo_id,
        insumo_name: l.insumo_name,
        previsto: Number(l.previsto),
        gasto: l.gasto === null || l.gasto === undefined ? null : Number(l.gasto),
        data: l.created_at,
    })), [linhas]);

    const resumo = useMemo(() => resumirRendimento(registros), [registros]);
    const tendencia = useMemo(() => tendenciaDoCorte(registros), [registros]);

    const pendentes = useMemo(
        () => linhas.filter(l => l.gasto === null || l.gasto === undefined),
        [linhas]);
    const informados = useMemo(
        () => linhas.filter(l => l.gasto !== null && l.gasto !== undefined).slice(0, 30),
        [linhas]);

    const informar = async (l: RendimentoDoCorteRow) => {
        // Vírgula é como se digita número aqui; aceitar só ponto seria pedir
        // para a pessoa lutar com o teclado no meio do chão de fábrica.
        const bruto = (rascunho[l.id] || '').replace(',', '.').trim();
        const valor = Number(bruto);
        if (!Number.isFinite(valor) || valor <= 0) {
            setErro('Informe quanto foi gasto de fato, maior que zero.');
            return;
        }
        setSalvando(l.id);
        setErro('');
        try {
            await productionRepository.informarGastoDoCorte(l.id, valor);
            setLinhas(atual => atual.map(x => x.id === l.id
                ? { ...x, gasto: valor, informado_em: new Date().toISOString() }
                : x));
            setRascunho(r => { const { [l.id]: _, ...resto } = r; return resto; });
        } catch (e: any) {
            setErro(mensagemDeErro(e, 'Falha ao gravar'));
        } finally {
            setSalvando(null);
        }
    };

    if (carregando) {
        return (
            <div className="text-center p-16 text-zinc-600 flex flex-col items-center gap-4">
                <RefreshCw size={24} className="animate-spin text-amber-500" />
                <span className={ROTULO}>
                    Levantando o rendimento do corte...
                </span>
            </div>
        );
    }

    if (linhas.length === 0) {
        return (
            <div className={`${CARTAO} flex items-start gap-3 p-5`}>
                <Scissors size={16} className="text-zinc-600 shrink-0 mt-0.5" />
                <div>
                    <p className="text-xs font-black text-white uppercase tracking-tight">
                        Ainda não há corte medido
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed max-w-2xl">
                        O previsto de tecido é gravado sozinho quando um pedido sai do primeiro
                        setor. A partir do próximo, aparece aqui a pergunta de quanto foi gasto de
                        fato — e é a resposta dela que vira o número de rendimento.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5 pb-10 ease-out animate-in fade-in duration-200">
            {/* ── O placar ───────────────────────────────────────────────── */}
            <div className={`${CARTAO} p-5`}>
                <div className="flex items-start justify-between gap-6 flex-wrap">
                    <div className="min-w-0">
                        <h2 className={`flex items-center gap-2 ${ROTULO}`}>
                            Gasto ÷ previsto
                            <InfoTooltip>
                                Quanto de tecido o corte consumiu para cada unidade que a ficha
                                técnica previa. 1,00 é o encaixe exato da ficha; 1,20 quer dizer que
                                se gasta 20% a mais do que o previsto. A conta é ponderada pelo
                                volume — um corte de dois metros não pode pesar igual a um de
                                trezentos.
                            </InfoTooltip>
                        </h2>
                        <p className={`text-5xl font-black tabular-nums mt-2 ${resumo.veredito ? TOM[resumo.veredito] : 'text-zinc-600'}`}>
                            {resumo.razao === null ? '—' : razaoTexto(resumo.razao)}
                        </p>
                        <p className="text-xs text-zinc-500 font-medium mt-1">
                            {resumo.amostras === 0
                                ? 'nenhum corte informado ainda'
                                : `${resumo.amostras} ${resumo.amostras === 1 ? 'corte medido' : 'cortes medidos'}`}
                            {resumo.pendentes > 0 && ` · ${resumo.pendentes} sem informar`}
                        </p>
                    </div>

                    {tendencia ? (
                        <div className="text-right">
                            <p className={ROTULO_PEQUENO}>
                                Metade recente vs. anterior
                            </p>
                            <p className={`flex items-center justify-end gap-2 text-2xl font-black tabular-nums mt-1 ${tendencia.melhorou ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {tendencia.melhorou ? <TrendingDown size={20} /> : <TrendingUp size={20} />}
                                {razaoTexto(tendencia.antes)} → {razaoTexto(tendencia.depois)}
                            </p>
                            <p className="text-[10px] text-zinc-600 mt-1">
                                {tendencia.melhorou ? 'o encaixe está melhorando' : 'o encaixe está piorando'}
                            </p>
                        </div>
                    ) : (
                        <div className="text-right max-w-[220px]">
                            <p className={`flex items-center justify-end gap-2 ${ROTULO}`}>
                                <Minus size={12} /> Sem tendência
                            </p>
                            <p className="text-[10px] text-zinc-600 mt-1 leading-snug">
                                São precisos {MINIMO_PARA_TENDENCIA} cortes medidos para dizer se está
                                melhorando. Antes disso seria palpite com cara de número.
                            </p>
                        </div>
                    )}

                    <IndicadorRecarga ativo={recarregando} />
                </div>

                {resumo.porTecido.length > 0 && (
                    <div className="border-t border-zinc-800/80 mt-5 pt-4 space-y-2">
                        <p className={ROTULO_PEQUENO}>
                            Por tecido, do que mais escapou
                        </p>
                        {resumo.porTecido.map(t => (
                            <div key={t.insumo_id} className="flex items-center gap-3 text-[11px]">
                                <span className="text-zinc-300 font-bold truncate flex-1">{t.nome}</span>
                                <span className="text-zinc-600 tabular-nums shrink-0">
                                    {t.amostras}× · previsto {qtd(t.previsto)} · gasto {qtd(t.gasto)}
                                </span>
                                <span className={`font-mono font-black tabular-nums w-12 text-right shrink-0 ${TOM[t.veredito]}`}>
                                    {razaoTexto(t.razao)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {erro && (
                <p className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
                    <AlertTriangle size={14} /> {erro}
                </p>
            )}

            {/* ── A fila do que falta informar ───────────────────────────── */}
            <section className={`${CARTAO} p-5 space-y-3`}>
                <header className="flex items-center justify-between gap-3">
                    <h3 className={`flex items-center gap-2 ${ROTULO}`}>
                        <Scissors size={14} className="text-amber-500" />
                        Cortes sem gasto informado
                    </h3>
                    <span className="text-[10px] font-black text-zinc-600 tabular-nums">{pendentes.length}</span>
                </header>

                {pendentes.length === 0 ? (
                    <p className="flex items-center gap-2 text-xs text-emerald-400/80 font-medium py-4 justify-center">
                        <Check size={14} /> Todo corte registrado tem o gasto informado.
                    </p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {pendentes.map(l => (
                            <div
                                key={l.id}
                                className={`${ITEM} flex items-center gap-3 p-3 flex-wrap`}
                            >
                                {/* basis-48: sem largura mínima o nome encolhia até "GA…" e o campo nunca
                                    descia de linha; com ela, no celular o campo e o botão vão para baixo. */}
                                <div className="min-w-0 flex-1 basis-48">
                                    <p className="text-xs font-bold text-zinc-200 truncate">
                                        {l.insumo_name || '(sem nome)'}
                                        {l.order_number && (
                                            <span className="text-zinc-600 font-medium"> · #{l.order_number}</span>
                                        )}
                                    </p>
                                    <p className="text-[10px] text-zinc-600 font-medium mt-0.5">
                                        previsto {qtd(l.previsto, l.unidade)} · {dataCurta(l.created_at)}
                                    </p>
                                </div>

                                <div className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:flex-none sm:basis-auto">
                                    <input
                                        value={rascunho[l.id] ?? ''}
                                        onChange={e => setRascunho(r => ({ ...r, [l.id]: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter') informar(l); }}
                                        inputMode="decimal"
                                        placeholder={`gasto em ${l.unidade || 'un'}`}
                                        className={`${CAMPO} min-w-0 flex-1 font-mono sm:w-32 sm:flex-none`}
                                    />
                                    <button
                                        onClick={() => informar(l)}
                                        disabled={salvando === l.id || !(rascunho[l.id] || '').trim()}
                                        className={BOTAO_PRINCIPAL}
                                    >
                                        Gravar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ── O que já foi medido ────────────────────────────────────── */}
            {informados.length > 0 && (
                <section className={`${CARTAO} p-5 space-y-3`}>
                    <h3 className={ROTULO}>
                        Cortes medidos
                    </h3>
                    <div className="flex flex-col gap-2">
                        {informados.map(l => {
                            const razao = razaoDoCorte({
                                insumo_id: l.insumo_id, previsto: Number(l.previsto), gasto: Number(l.gasto),
                            });
                            const veredito = classificar(razao);
                            return (
                                <div key={l.id} className={`${ITEM} flex items-center gap-3 p-3`}>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold text-zinc-300 truncate">
                                            {l.insumo_name || '(sem nome)'}
                                            {l.order_number && (
                                                <span className="text-zinc-600 font-medium"> · #{l.order_number}</span>
                                            )}
                                        </p>
                                        <p className="text-[10px] text-zinc-600 font-medium mt-0.5">
                                            {qtd(l.previsto, l.unidade)} previsto · {qtd(l.gasto || 0, l.unidade)} gasto
                                            {' · '}{dataCurta(l.informado_em || l.created_at)}
                                        </p>
                                    </div>
                                    <span className={`font-mono font-black text-xs tabular-nums shrink-0 ${veredito ? TOM[veredito] : 'text-zinc-600'}`}>
                                        {razao === null ? '—' : razaoTexto(razao)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}
        </div>
    );
};

export default RendimentoDoCortePanel;
