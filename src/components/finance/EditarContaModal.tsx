import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    X, AlertTriangle, Loader2, Check, Repeat, TrendingUp, CalendarDays, Trash2,
} from 'lucide-react';
import { storageService } from '@/services/storage';
import { formatCurrency } from '@/utils';
import { parseBRL } from '@/utils/currency';
import {
    motivoParaNaoEditar, preverReajuste, parcelasDaRecorrencia,
    preverMudancaDeData, sugerirMudancaDeData, diferencaEmDias,
} from '@/utils/reajusteDeContas';
import type { ModoDeReajuste, ModoDeData } from '@/utils/reajusteDeContas';
import {
    chaveDaSerie, parcelasDaSerie, preverCancelamentoDaSerie, resumoDoCancelamento,
} from '@/utils/serieDeContas';
import { ConfirmarOperacao } from '@/components/common/ConfirmarOperacao';
import type { ObligationSummary } from '@/types';

import { mensagemDeErro } from '@/utils/errorHandling';
import { useSaidaProtegida } from '@/hooks/useSaidaProtegida';
interface Props {
    conta: ObligationSummary;
    /** Todas as contas carregadas — de onde saem as parcelas da mesma série. */
    todas: ObligationSummary[];
    onClose: () => void;
    onSaved: () => void;
}

const inputCls = 'w-full h-10 bg-zinc-950 border border-zinc-800 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-zinc-500 placeholder-zinc-600 transition-colors';
const labelCls = 'text-xs text-zinc-500 block mb-1.5';

const dataCurta = (iso: string) =>
    iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

const MODOS: { valor: ModoDeReajuste; rotulo: string; dica: string; sufixo: string }[] = [
    { valor: 'percentual', rotulo: '% sobre o atual', dica: 'Ex: 8 para reajuste anual de 8%', sufixo: '%' },
    { valor: 'valor', rotulo: 'R$ a mais', dica: 'Ex: 15 soma R$ 15 em cada parcela', sufixo: 'R$' },
    { valor: 'novoValor', rotulo: 'Novo valor fixo', dica: 'Carimba o mesmo valor em todas', sufixo: 'R$' },
];

/**
 * Corrige uma conta em aberto e, quando ela é de uma série, reajusta as demais.
 *
 * Os dois casos moram no mesmo lugar porque são a mesma conversa: a fatura da
 * energia chegou diferente, e a pergunta seguinte é sempre "as próximas também
 * mudam?". Separar em duas telas obrigaria a repetir o valor em outro lugar.
 */
export function EditarContaModal({ conta, todas, onClose, onSaved }: Props) {
    // Fechar com algo digitado pergunta antes (passada de celular e fábrica: as janelas que faltavam).
    const saida = useSaidaProtegida(onClose);
    const travada = motivoParaNaoEditar(conta as any);

    const [valor, setValor] = useState(
        conta.original_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const [vencimento, setVencimento] = useState(conta.due_date || '');
    const [descricao, setDescricao] = useState(conta.description || '');

    const [aplicarNaSerie, setAplicarNaSerie] = useState(false);
    const [modo, setModo] = useState<ModoDeReajuste>('percentual');
    const [quantia, setQuantia] = useState('');
    const [aPartirDe, setAPartirDe] = useState(conta.due_date || '');

    // A data em lote é uma escolha separada da do valor: mudar o vencimento de
    // uma parcela ("essa eu pago dia 20") e mudar o da série toda ("a conta
    // passou a vencer dia 20") são decisões diferentes, e juntá-las num único
    // botão faria uma virar efeito colateral da outra.
    const [dataNaSerie, setDataNaSerie] = useState(false);
    const [modoData, setModoData] = useState<ModoDeData | null>(null);
    // Corte próprio, e não o do reajuste: as duas listas podem começar em meses
    // diferentes (o aumento vale de janeiro, a data nova vale já). Compartilhar
    // o campo faria mexer num alterar silenciosamente o outro.
    const [aPartirDeData, setAPartirDeData] = useState(conta.due_date || '');

    const [salvando, setSalvando] = useState(false);
    const [cancelandoSerie, setCancelandoSerie] = useState(false);
    const [apenasFuturas, setApenasFuturas] = useState(false);
    const [confirmarSerie, setConfirmarSerie] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    /**
     * A série desta conta, e o que aconteceria ao cancelá-la.
     *
     * `parcelasDaSerie` cobre recorrência E parcelamento de pedido, que são
     * colunas diferentes no banco. O `parcelasDaRecorrencia` logo abaixo é
     * outro assunto — ele serve ao reajuste, que só faz sentido em recorrência.
     */
    const serie = useMemo(() => chaveDaSerie(conta), [conta]);
    const parcelasDaSerieToda = useMemo(
        () => parcelasDaSerie(todas as any, conta), [todas, conta]);
    const previsao = useMemo(
        () => preverCancelamentoDaSerie(parcelasDaSerieToda, {
            apenasFuturas,
            hoje: new Date().toISOString().slice(0, 10),
        }),
        [parcelasDaSerieToda, apenasFuturas]);

    const novoValor = parseBRL(valor);
    const mudouAConta = novoValor !== conta.original_amount
        || vencimento !== conta.due_date
        || descricao !== (conta.description || '');

    const parcelas = useMemo(
        () => parcelasDaRecorrencia(todas as any, conta.recurrence_id, conta.id),
        [todas, conta.recurrence_id, conta.id]);

    // A regra do lote sai da correção que a pessoa acabou de fazer nesta conta —
    // ela já disse o que queria ao digitar a data nova. modoData só existe para
    // discordar da dedução.
    const sugestaoDeData = useMemo(
        () => sugerirMudancaDeData(conta.due_date || '', vencimento),
        [conta.due_date, vencimento]);

    const paramsDeData = useMemo(() => {
        if (!sugestaoDeData) return null;
        if (!modoData || modoData === sugestaoDeData.modo) return sugestaoDeData;
        // Traduz a mesma correção para o outro modo, sem pedir nada de novo.
        return modoData === 'diaDoMes'
            ? { modo: 'diaDoMes' as const, dia: Number(vencimento.slice(8, 10)) }
            : { modo: 'deslocamento' as const, dias: diferencaEmDias(conta.due_date || '', vencimento) };
    }, [sugestaoDeData, modoData, vencimento, conta.due_date]);

    const previaDeData = useMemo(() => {
        if (!dataNaSerie || !paramsDeData) return null;
        return preverMudancaDeData(parcelas as any, { ...paramsDeData, aPartirDe: aPartirDeData });
    }, [dataNaSerie, paramsDeData, parcelas, aPartirDeData]);

    const previa = useMemo(() => {
        if (!aplicarNaSerie) return null;
        const q = modo === 'percentual' ? Number(String(quantia).replace(',', '.')) : parseBRL(quantia);
        if (!q) return null;
        return preverReajuste(parcelas as any, { modo, quantia: q, aPartirDe });
    }, [aplicarNaSerie, parcelas, modo, quantia, aPartirDe]);

    const cancelarASerie = async () => {
        setConfirmarSerie(false);
        setCancelandoSerie(true);
        setErro(null);
        try {
            // Quem manda no que cai é o BANCO, não esta prévia: a mesma trava
            // do cancelamento individual — parcela com pagamento ativo não cai
            // — vale lá dentro, numa transação só. A prévia existe para a
            // pessoa saber o que esperar, não para decidir.
            const r = await storageService.cancelObligationSeries(
                conta.id, 'Série cancelada pela tela de edição', apenasFuturas);
            if (r.canceladas === 0) {
                setErro(r.mantidas_por_pagamento > 0
                    ? `Nenhuma parcela foi cancelada: as ${r.mantidas_por_pagamento} que restam têm pagamento registrado. Estorne o pagamento antes.`
                    : 'Nenhuma parcela em aberto para cancelar nesta série.');
                setCancelandoSerie(false);
                return;
            }
            onSaved();
        } catch (e: any) {
            setErro(mensagemDeErro(e, 'Falha ao cancelar a série'));
            setCancelandoSerie(false);
        }
    };

    const salvar = async () => {
        if (travada) return;
        setSalvando(true);
        setErro(null);
        try {
            const updates: Array<{ id: string; original_amount?: number; due_date?: string; description?: string }> = [];

            if (mudouAConta) {
                if (!(novoValor > 0)) throw new Error('Valor precisa ser maior que zero');
                updates.push({
                    id: conta.id,
                    original_amount: novoValor,
                    due_date: vencimento,
                    description: descricao.trim() || conta.description,
                });
            }
            // Valor e data podem cair na mesma parcela: um só update por id, senão
            // a segunda escrita sobrescreveria a primeira com o dado antigo.
            const porId = new Map<string, { id: string; original_amount?: number; due_date?: string }>();
            for (const l of previa?.linhas || []) {
                porId.set(l.id, { ...(porId.get(l.id) || { id: l.id }), original_amount: l.para });
            }
            for (const l of previaDeData?.linhas || []) {
                porId.set(l.id, { ...(porId.get(l.id) || { id: l.id }), due_date: l.para });
            }
            updates.push(...porId.values());
            if (updates.length === 0) { onClose(); return; }

            const r = await storageService.corrigirContasEmAberto(updates);
            if (r.travadas.length > 0) {
                setErro(`${r.alteradas} alterada(s). ${r.travadas.length} não mudaram: `
                    + 'receberam pagamento enquanto esta tela estava aberta.');
                onSaved();
                return;
            }
            onSaved();
            onClose();
        } catch (e: any) {
            setErro(mensagemDeErro(e, 'Não foi possível salvar'));
        } finally {
            setSalvando(false);
        }
    };

    const nada = !mudouAConta && !(previa?.linhas.length) && !(previaDeData?.linhas.length);
    const totalDeContas = (previa?.linhas.length || 0)
        + (previaDeData?.linhas.filter(l => !previa?.linhas.some(v => v.id === l.id)).length || 0)
        + (mudouAConta ? 1 : 0);

    return <>{saida.confirmacao}{createPortal(
        <div className="fixed inset-0 z-sobreposto flex items-center justify-center bg-zinc-950/80 backdrop-blur-md p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh] overflow-hidden" {...saida.aoMexer}>

                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                    <div className="min-w-0">
                        <h2 className="text-sm font-black uppercase tracking-widest text-white">Corrigir conta</h2>
                        <p className="text-xs text-zinc-500 truncate mt-0.5">{conta.description}</p>
                    </div>
                    <button onClick={saida.pedirParaFechar} aria-label="Fechar" className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors shrink-0">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar">

                    {travada ? (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                            <p className="text-sm text-amber-400 leading-relaxed">
                                <AlertTriangle size={12} className="inline mb-0.5 mr-1.5" />
                                {travada}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Valor</label>
                                    <input className={inputCls} value={valor} inputMode="decimal"
                                        onChange={e => setValor(e.target.value)} placeholder="0,00" />
                                    {novoValor !== conta.original_amount && novoValor > 0 && (
                                        <p className="text-xs text-zinc-500 mt-1.5">
                                            de {formatCurrency(conta.original_amount)} →{' '}
                                            <span className="text-zinc-200">
                                                {formatCurrency(novoValor)}
                                            </span>
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className={labelCls}>Vencimento</label>
                                    <input type="date" className={inputCls} value={vencimento}
                                        onChange={e => setVencimento(e.target.value)} />
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Descrição</label>
                                <input className={inputCls} value={descricao}
                                    onChange={e => setDescricao(e.target.value)} />
                            </div>

                            {/* ── Série ──────────────────────────────────────── */}
                            {parcelas.length > 0 && (
                                <div className="border-t border-zinc-800 pt-5 space-y-3">

                                    {/* Data em lote — só aparece depois que o vencimento
                                        mudou, porque antes disso não há o que aplicar. */}
                                    {sugestaoDeData && (
                                        <>
                                            <button type="button" onClick={() => setDataNaSerie(v => !v)}
                                                aria-pressed={dataNaSerie}
                                                className={`w-full text-left flex gap-3 p-3.5 rounded-lg border transition-all ${dataNaSerie
                                                    ? 'bg-zinc-900 border-zinc-600'
                                                    : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}`}>
                                                <span className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center mt-0.5 ${dataNaSerie
                                                    ? 'bg-amber-500 border-amber-500' : 'border-zinc-700'}`}>
                                                    {dataNaSerie && <Check size={13} className="text-zinc-950" strokeWidth={4} />}
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="flex items-center gap-1.5 text-sm text-zinc-200">
                                                        <CalendarDays size={13} /> Mudar a data das outras parcelas
                                                    </span>
                                                    <span className="block text-xs text-zinc-500 mt-1 leading-snug">
                                                        {(paramsDeData?.modo === 'diaDoMes')
                                                            ? `Todas passam a vencer no dia ${paramsDeData.dia} do mês delas.`
                                                            : `Todas andam ${Math.abs(paramsDeData?.dias || 0)} dia(s) para ${(paramsDeData?.dias || 0) > 0 ? 'frente' : 'trás'}.`}
                                                    </span>
                                                </span>
                                            </button>

                                            {dataNaSerie && (
                                                <div className="space-y-3">
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div>
                                                            <label className={labelCls}>Como aplicar</label>
                                                            <div className="grid grid-cols-2 gap-1.5">
                                                                {([['diaDoMes', 'Dia do mês'], ['deslocamento', 'Adiar/antecipar']] as const).map(([v, r]) => (
                                                                    <button key={v} onClick={() => setModoData(v)}
                                                                        className={`h-10 px-2 rounded-lg text-xs border transition-colors ${(paramsDeData?.modo === v)
                                                                            ? 'bg-zinc-800 text-white border-zinc-600'
                                                                            : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'}`}>
                                                                        {r}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className={labelCls}>
                                                                <CalendarDays size={12} className="inline mb-0.5 mr-1" />
                                                                A partir de
                                                            </label>
                                                            <input type="date" className={inputCls} value={aPartirDeData}
                                                                onChange={e => setAPartirDeData(e.target.value)} />
                                                            <p className="text-xs text-zinc-600 mt-1.5">
                                                                Parcela que vence antes disso não muda.
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {previaDeData && (
                                                        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                                                            {previaDeData.linhas.length === 0 ? (
                                                                <p className="text-xs text-zinc-500">
                                                                    Nenhuma outra parcela muda de data.
                                                                    {previaDeData.travadas > 0 && ` ${previaDeData.travadas} já têm pagamento.`}
                                                                    {previaDeData.forintervalo > 0 && ` ${previaDeData.forintervalo} vence(m) antes da data de corte.`}
                                                                </p>
                                                            ) : (
                                                                <>
                                                                    <p className="text-xs text-zinc-500 mb-2">
                                                                        <CalendarDays size={12} className="inline mb-0.5 mr-1" />
                                                                        {previaDeData.linhas.length} parcela{previaDeData.linhas.length > 1 ? 's' : ''} muda{previaDeData.linhas.length > 1 ? 'm' : ''} de vencimento
                                                                    </p>
                                                                    <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                                                                        {previaDeData.linhas.map(l => (
                                                                            <div key={l.id} className="flex items-center gap-2 text-xs tabular-nums">
                                                                                <span className="text-zinc-600">{dataCurta(l.de)}</span>
                                                                                <span className="text-zinc-700">→</span>
                                                                                <span className="text-zinc-200">{dataCurta(l.para)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                    {(previaDeData.travadas > 0 || previaDeData.forintervalo > 0) && (
                                                                        <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
                                                                            Fora da conta:
                                                                            {previaDeData.travadas > 0 && ` ${previaDeData.travadas} com pagamento lançado.`}
                                                                            {previaDeData.forintervalo > 0 && ` ${previaDeData.forintervalo} vencendo antes da data de corte.`}
                                                                        </p>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}

                                    <button type="button" onClick={() => setAplicarNaSerie(v => !v)}
                                        aria-pressed={aplicarNaSerie}
                                        className={`w-full text-left flex gap-3 p-3.5 rounded-lg border transition-all ${aplicarNaSerie
                                            ? 'bg-zinc-900 border-zinc-600'
                                            : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'}`}>
                                        <span className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center mt-0.5 ${aplicarNaSerie
                                            ? 'bg-amber-500 border-amber-500' : 'border-zinc-700'}`}>
                                            {aplicarNaSerie && <Check size={13} className="text-zinc-950" strokeWidth={4} />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-1.5 text-sm text-zinc-200">
                                                <Repeat size={13} /> Reajustar as outras parcelas
                                            </span>
                                            <span className="block text-xs text-zinc-500 mt-1 leading-snug">
                                                Esta conta faz parte de uma série com mais {parcelas.length}{' '}
                                                parcela{parcelas.length > 1 ? 's' : ''}.
                                            </span>
                                        </span>
                                    </button>

                                    {aplicarNaSerie && (
                                        <div className="mt-3 space-y-3">
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {MODOS.map(m => (
                                                    <button key={m.valor} onClick={() => setModo(m.valor)}
                                                        className={`h-10 px-2 rounded-lg text-xs border transition-colors ${modo === m.valor
                                                            ? 'bg-zinc-800 text-white border-zinc-600'
                                                            : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'}`}>
                                                        {m.rotulo}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className={labelCls}>
                                                        {MODOS.find(m => m.valor === modo)!.sufixo === '%' ? 'Percentual' : 'Valor'}
                                                    </label>
                                                    <input className={inputCls} value={quantia} inputMode="decimal"
                                                        onChange={e => setQuantia(e.target.value)}
                                                        placeholder={modo === 'percentual' ? '8' : '0,00'} />
                                                    <p className="text-xs text-zinc-600 mt-1.5">
                                                        {MODOS.find(m => m.valor === modo)!.dica}
                                                    </p>
                                                </div>
                                                <div>
                                                    <label className={labelCls}>
                                                        <CalendarDays size={12} className="inline mb-0.5 mr-1" />
                                                        A partir de
                                                    </label>
                                                    <input type="date" className={inputCls} value={aPartirDe}
                                                        onChange={e => setAPartirDe(e.target.value)} />
                                                    <p className="text-xs text-zinc-600 mt-1.5">
                                                        Parcela que vence antes disso não muda.
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Prévia: reajuste mexe em várias contas de uma vez, e
                                                errar a digitação só apareceria depois de gravado. */}
                                            {previa && (
                                                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                                                    {previa.linhas.length === 0 ? (
                                                        <p className="text-xs text-zinc-500">
                                                            Nada muda com esses parâmetros.
                                                            {previa.travadas > 0 && ` ${previa.travadas} parcela(s) já têm pagamento.`}
                                                            {previa.forintervalo > 0 && ` ${previa.forintervalo} vence(m) antes da data.`}
                                                        </p>
                                                    ) : (
                                                        <>
                                                            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                                                    <TrendingUp size={12} className="inline mb-0.5 mr-1" />
                                                                    {previa.linhas.length} parcela{previa.linhas.length > 1 ? 's' : ''}
                                                                </span>
                                                                <span className="text-sm tabular-nums text-zinc-200">
                                                                    {previa.diferenca >= 0 ? '+' : ''}{formatCurrency(previa.diferenca)} no total
                                                                </span>
                                                            </div>
                                                            <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                                                                {previa.linhas.map(l => (
                                                                    <div key={l.id} className="flex items-center justify-between gap-2 text-xs">
                                                                        <span className="text-zinc-500 tabular-nums shrink-0">{dataCurta(l.vencimento)}</span>
                                                                        <span className="tabular-nums text-zinc-600 truncate">
                                                                            {formatCurrency(l.de)} → <span className="text-zinc-300">{formatCurrency(l.para)}</span>
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            {(previa.travadas > 0 || previa.forintervalo > 0) && (
                                                                <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
                                                                    Fora da conta:
                                                                    {previa.travadas > 0 && ` ${previa.travadas} com pagamento lançado.`}
                                                                    {previa.forintervalo > 0 && ` ${previa.forintervalo} vencendo antes da data.`}
                                                                </p>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {erro && (
                        <div role="alert" className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs leading-relaxed flex items-start gap-2">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {erro}
                        </div>
                    )}
                </div>

                {/* Cancelar a série inteira.
                    Fica FORA do bloco `!travada`: uma conta pode estar travada
                    para edição por já ter pagamento — e é justamente aí que
                    livrar-se das outras onze parcelas em aberto interessa. A
                    trava do pagamento continua valendo por parcela, no banco. */}
                {serie && parcelasDaSerieToda.length > 1 && (
                    <div className="px-6 pt-4 pb-1 border-t border-zinc-800 space-y-2.5">
                        <p className="text-xs text-zinc-500">
                            {serie.tipo === 'recorrencia' ? 'Recorrência' : 'Parcelamento'} · {parcelasDaSerieToda.length} parcelas
                        </p>

                        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={apenasFuturas}
                                onChange={e => setApenasFuturas(e.target.checked)}
                                className="accent-zinc-100"
                            />
                            Manter o que já venceu — cancelar só daqui para a frente
                        </label>

                        {/* A frase vem do util testado, e não montada aqui. Um
                            aviso que conta a consequência errada é pior que
                            nenhum aviso, e string solta no meio do JSX é
                            justamente o que ninguém revisa. */}
                        <p className="text-xs text-zinc-500 leading-snug">
                            {resumoDoCancelamento(previsao, serie.tipo)}
                            {previsao.cancelar.length > 0 && (
                                <span className="text-zinc-400"> Saem {formatCurrency(previsao.valorCancelado)} das projeções.</span>
                            )}
                        </p>

                        <button
                            onClick={() => setConfirmarSerie(true)}
                            disabled={cancelandoSerie || previsao.cancelar.length === 0}
                            className="w-full flex items-center justify-center gap-2 h-10 px-3 rounded-lg border border-zinc-800 text-sm text-rose-400 hover:bg-zinc-900 transition-colors disabled:opacity-30"
                        >
                            {cancelandoSerie
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Trash2 size={13} />}
                            {cancelandoSerie
                                ? 'Cancelando...'
                                : `Cancelar a série (${previsao.cancelar.length})`}
                        </button>
                    </div>
                )}

                {confirmarSerie && serie && (
                    <ConfirmarOperacao
                        operacaoId="cancelar-serie"
                        alvo={`${conta.description ?? ''} — ${previsao.cancelar.length} de ${parcelasDaSerieToda.length} parcelas`}
                        detalhe={resumoDoCancelamento(previsao, serie.tipo)
                            + ` Saem ${formatCurrency(previsao.valorCancelado)} das projeções de caixa.`}
                        onConfirmar={cancelarASerie}
                        onCancelar={() => setConfirmarSerie(false)}
                    />
                )}

                {!travada && (
                    <div className="p-6 border-t border-zinc-800 flex justify-end gap-2">
                        <button onClick={saida.pedirParaFechar}
                            className="h-10 px-3 rounded-lg border border-zinc-800 text-sm text-zinc-300 hover:bg-zinc-900">
                            Cancelar
                        </button>
                        <button onClick={salvar} disabled={salvando || nada}
                            className="flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 disabled:opacity-40 disabled:bg-zinc-800 disabled:text-zinc-500">
                            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                            {salvando ? 'Salvando...' : totalDeContas > 1
                                ? `Salvar (${totalDeContas} contas)`
                                : 'Salvar'}
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    )}</>;
}
