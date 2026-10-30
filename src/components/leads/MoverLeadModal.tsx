import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, AlertTriangle, CalendarClock } from 'lucide-react';
import { ROTULO_DA_ETAPA, nomeDoLead } from '@/utils/funilDeLeads';
import type { Lead, EtapaDoLead } from '@/utils/funilDeLeads';
import { CAMPO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SUAVE, BOTAO_SECUNDARIO, BOTAO_PERIGO } from '@/components/finance/ui/estilo';

import { mensagemDeErro } from '@/utils/errorHandling';
interface Props {
    lead: Lead;
    destino: EtapaDoLead;
    onConfirmar: (extras: {
        proxima_acao?: string | null;
        proxima_acao_em?: string | null;
        motivo_perda?: string | null;
    }) => Promise<void> | void;
    onCancelar: () => void;
}

/**
 * Motivos de perda pré-escritos.
 *
 * Digitar livremente produz "não quis", "sem interesse", "não rolou" — três
 * grafias da mesma coisa que nunca se agrupam. E é justamente o agrupamento que
 * diz se você perde por PREÇO (mexe na margem) ou por PRAZO (mexe na fábrica),
 * que são decisões opostas. O campo livre continua ali para o que não couber.
 */
const MOTIVOS = [
    'preço', 'prazo', 'sem verba', 'sem retorno',
    'já tem fornecedor', 'não tem uniforme', 'fora da região',
];

/** Sugestões de próxima ação, pelo que se costuma fazer em cada etapa. */
const ACOES_SUGERIDAS: Partial<Record<EtapaDoLead, string[]>> = {
    contatado: ['Ligar de novo', 'Mandar mensagem', 'Falar com quem decide'],
    qualificado: ['Entender a necessidade', 'Levantar quantidade e modelo', 'Agendar visita'],
    orcando: ['Enviar o orçamento', 'Cobrar retorno do orçamento', 'Ajustar a proposta'],
};

const hojeMais = (dias: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
};

const Input = `${CAMPO} w-full`;
const Rotulo = `${ROTULO_PEQUENO} block mb-2`;

/**
 * Mover de etapa pede a próxima ação e a data.
 *
 * Sem isso o lead sai da fila de hoje e não entra na de nenhum outro dia — some
 * do radar sem nunca ter sido descartado. É o vazamento silencioso de qualquer
 * funil, e a única defesa é a pergunta ser obrigatória na hora do movimento,
 * quando quem move ainda tem o contexto na cabeça.
 *
 * Duas exceções: virar CLIENTE não tem próxima ação de prospecção (o pedido
 * assume), e DESCARTAR troca a pergunta pelo motivo.
 */
export const MoverLeadModal: React.FC<Props> = ({ lead, destino, onConfirmar, onCancelar }) => {
    const [acao, setAcao] = useState('');
    const [quando, setQuando] = useState(hojeMais(3));
    const [motivo, setMotivo] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    const descartando = destino === 'descartado';
    const virandoCliente = destino === 'cliente';
    const pedeAcao = !descartando && !virandoCliente;

    const sugestoes = useMemo(() => ACOES_SUGERIDAS[destino] || [], [destino]);

    useEffect(() => {
        const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelar(); };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [onCancelar]);

    const confirmar = async () => {
        if (descartando && !motivo.trim()) {
            setErro('O motivo é obrigatório. Uma lista de perdas sem motivo não ensina nada.');
            return;
        }
        if (pedeAcao && !acao.trim()) {
            setErro('Diga o que fazer em seguida — sem isso o lead sai da fila e não volta.');
            return;
        }
        setSalvando(true);
        setErro('');
        try {
            await onConfirmar({
                proxima_acao: pedeAcao ? acao.trim() : null,
                proxima_acao_em: pedeAcao ? quando : null,
                motivo_perda: descartando ? motivo.trim() : null,
            });
        } catch (e: any) {
            setErro(mensagemDeErro(e, 'Falha ao mover'));
            setSalvando(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-sobreposto bg-black/70 flex items-center justify-center p-4 ease-out animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden ease-out animate-in zoom-in-95 duration-150">
                <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800">
                    <div className="min-w-0">
                        <p className={ROTULO_PEQUENO}>
                            {ROTULO_DA_ETAPA[lead.status]} <ArrowRight size={12} className="inline mx-1" /> {ROTULO_DA_ETAPA[destino]}
                        </p>
                        <h3 className="text-sm font-black text-white truncate mt-0.5">{nomeDoLead(lead)}</h3>
                    </div>
                    <button onClick={onCancelar} className={`${BOTAO_SECUNDARIO} w-10 px-0`} aria-label="Fechar">
                        <X size={18} />
                    </button>
                </header>

                <div className="p-5 space-y-4">
                    {descartando && (
                        <div>
                            <label className={Rotulo}>Por que não fechou</label>
                            <div className="flex flex-wrap gap-2 mb-2.5">
                                {MOTIVOS.map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setMotivo(m)}
                                        className={motivo === m ? BOTAO_PERIGO : BOTAO_SECUNDARIO}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                            <input
                                value={motivo}
                                onChange={e => setMotivo(e.target.value)}
                                placeholder="ou escreva o motivo"
                                className={Input}
                                autoFocus
                            />
                            <p className="text-[10px] text-zinc-600 mt-2 leading-snug">
                                Perder por preço e perder por prazo pedem decisões opostas. Sem o motivo,
                                os dois viram "não fechou".
                            </p>
                        </div>
                    )}

                    {virandoCliente && (
                        <p className="text-xs text-zinc-400 leading-relaxed bg-emerald-500/[0.07] border border-emerald-500/25 rounded-xl px-4 py-3">
                            O lead não vai sumir: ele fica ligado ao cadastro do cliente. É isso que
                            mantém a taxa de conversão e o tempo de ciclo calculáveis.
                        </p>
                    )}

                    {pedeAcao && (
                        <>
                            <div>
                                <label className={Rotulo}>O que fazer em seguida</label>
                                {sugestoes.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mb-2.5">
                                        {sugestoes.map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setAcao(s)}
                                                className={acao === s ? BOTAO_SUAVE : BOTAO_SECUNDARIO}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <input
                                    value={acao}
                                    onChange={e => setAcao(e.target.value)}
                                    placeholder="ex.: ligar para o setor de compras"
                                    className={Input}
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className={Rotulo}>Quando</label>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <input
                                        type="date"
                                        value={quando}
                                        onChange={e => setQuando(e.target.value)}
                                        className={`${Input} flex-1 min-w-[150px]`}
                                    />
                                    {[1, 3, 7, 15].map(d => (
                                        <button
                                            key={d}
                                            onClick={() => setQuando(hojeMais(d))}
                                            className={BOTAO_SECUNDARIO}
                                        >
                                            +{d}d
                                        </button>
                                    ))}
                                </div>
                                <p className="flex items-center gap-2 text-[10px] text-zinc-600 mt-2">
                                    <CalendarClock size={12} /> É esta data que traz o lead de volta para a fila.
                                </p>
                            </div>
                        </>
                    )}

                    {erro && (
                        <p className="flex items-start gap-2 text-[11px] text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-xl px-3 py-3 leading-snug">
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {erro}
                        </p>
                    )}
                </div>

                <footer className="flex items-center gap-2 px-5 py-4 border-t border-zinc-800">
                    <button
                        onClick={onCancelar}
                        disabled={salvando}
                        className={BOTAO_SECUNDARIO}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={confirmar}
                        disabled={salvando}
                        className={`${descartando ? BOTAO_PERIGO : BOTAO_PRINCIPAL} flex-1 min-w-0`}
                    >
                        {salvando ? 'Gravando...' : descartando ? 'Descartar' : `Mover para ${ROTULO_DA_ETAPA[destino]}`}
                    </button>
                </footer>
            </div>
        </div>,
        document.body,
    );
};

export default MoverLeadModal;
