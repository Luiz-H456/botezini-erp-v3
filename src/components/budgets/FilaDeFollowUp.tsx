import React, { useMemo, useState } from 'react';
import {
    PhoneCall, ChevronDown, ChevronUp, Check, Clock, Eye,
} from 'lucide-react';
import { formatCurrency } from '@/utils';
import {
    filaDeFollowUp, ROTULO_DA_URGENCIA, DIAS_PARA_COBRAR,
} from '@/utils/acompanhamentoComercial';
import type { UrgenciaDoFollowUp } from '@/utils/acompanhamentoComercial';
import { BotaoMensagem } from '@/components/common/BotaoMensagem';
import { msgRetomarOrcamento } from '@/utils/mensagensCliente';
import { CARTAO, ITEM, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';
import type { Budget, Client } from '@/types';

interface Props {
    budgets: Budget[];
    clients: Client[];
    hoje: string;
    onAbrir: (b: Budget) => void;
    /** O cliente disse sim durante a retomada. */
    onMarcarAprovado?: (orcamentoId: string) => void;
}

const TOM: Record<UrgenciaDoFollowUp, string> = {
    'vence-hoje': 'text-rose-400 border-rose-500/40 bg-rose-950/25',
    'vencendo': 'text-amber-400 border-amber-500/40 bg-amber-950/20',
    'vencido': 'text-zinc-500 border-zinc-800 bg-zinc-950/50',
    'parado': 'text-sky-400 border-sky-500/30 bg-sky-950/20',
    'recente': 'text-zinc-600 border-zinc-800 bg-zinc-950/40',
};

const PREVIA = 5;

/**
 * A fila de cobrança de orçamentos enviados.
 *
 * Depois de enviar, o sistema parava de acompanhar. O status 'Sent' não guardava
 * QUANDO virou 'Sent', então "parado há dez dias" era literalmente incalculável
 * — e é a única pergunta que importa aqui.
 *
 * A ordem põe a VALIDADE à frente do tempo parado: um orçamento que vence
 * amanhã é ligação de hoje mesmo tendo saído ontem, porque depois de vencer
 * refazer a proposta custa mais que cobrá-la.
 */
export const FilaDeFollowUp: React.FC<Props> = ({ budgets, clients, hoje, onAbrir, onMarcarAprovado }) => {
    const [aberta, setAberta] = useState(false);

    const nomePorId = useMemo(
        () => new Map(clients.map(c => [c.id, c.company_name])), [clients]);
    const clientePorId = useMemo(
        () => new Map(clients.map(c => [c.id, c])), [clients]);

    const fila = useMemo(() => filaDeFollowUp(budgets, hoje), [budgets, hoje]);
    // "Recente" fica de fora da contagem do topo: enviado hoje não é pendência,
    // e incluí-lo faria o número piscar para cima a cada proposta nova — o
    // oposto do que um contador de dívida deve fazer.
    const cobraveis = useMemo(() => fila.filter(i => i.urgencia !== 'recente'), [fila]);

    if (fila.length === 0) return null;

    if (cobraveis.length === 0) {
        return (
            <div className="flex items-center gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-4 py-3">
                <Check size={15} className="text-emerald-400 shrink-0" />
                <p className="text-xs text-zinc-300 font-bold">
                    Nenhuma proposta esperando resposta.
                    <span className="text-zinc-500 font-medium"> As {fila.length} enviadas saíram nos últimos {DIAS_PARA_COBRAR} dias.</span>
                </p>
            </div>
        );
    }

    const visiveis = aberta ? cobraveis : cobraveis.slice(0, PREVIA);
    const semData = cobraveis.some(i => i.diasParado === null);

    return (
        <div className={`${CARTAO} overflow-hidden`}>
            <div className="flex items-start gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                    <PhoneCall size={16} className="text-sky-400" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-white uppercase tracking-tight">
                        {cobraveis.length} {cobraveis.length === 1 ? 'proposta esperando' : 'propostas esperando'} resposta
                    </p>
                    <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                        Ordenadas por urgência: o que vence antes vem primeiro, depois o que está
                        parado há mais tempo.
                        {semData && (
                            <span className="text-zinc-600"> Algumas não têm data de envio — rode
                            {' '}<code className="font-mono text-zinc-500">comercial_acompanhamento.sql</code>.</span>
                        )}
                    </p>
                </div>
            </div>

            <div className="px-4 pb-3 flex flex-col gap-1.5">
                {visiveis.map(item => {
                    const b = item.orcamento as Budget;
                    const cliente = b.client_id ? clientePorId.get(b.client_id) : undefined;
                    return (
                        <div
                            key={b.id}
                            className={`${ITEM} flex items-center gap-2.5 px-3 py-2 flex-wrap`}
                        >
                            <span
                                className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest shrink-0 ${TOM[item.urgencia]}`}
                            >
                                {ROTULO_DA_URGENCIA[item.urgencia]}
                            </span>

                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-bold text-zinc-200 truncate">
                                    {b.serial_number}
                                    <span className="text-zinc-600 font-medium">
                                        {' · '}{(b.client_id && nomePorId.get(b.client_id)) || 'cliente desconhecido'}
                                    </span>
                                </p>
                                <p className="flex items-center gap-2 text-[10px] text-zinc-600 font-medium mt-0.5">
                                    <Clock size={12} />
                                    {item.diasParado === null
                                        ? 'sem data de envio'
                                        : `parado há ${item.diasParado} ${item.diasParado === 1 ? 'dia' : 'dias'}`}
                                    {item.diasAteVencer !== null && (
                                        <span className={item.diasAteVencer < 0 ? 'text-zinc-700' : ''}>
                                            {item.diasAteVencer < 0
                                                ? `· venceu há ${-item.diasAteVencer}d`
                                                : `· vence em ${item.diasAteVencer}d`}
                                        </span>
                                    )}
                                </p>
                            </div>

                            <span className="text-[11px] font-mono font-black text-zinc-400 tabular-nums shrink-0">
                                {formatCurrency(Number(b.total_amount) || 0)}
                            </span>

                            <BotaoMensagem
                                texto={msgRetomarOrcamento(
                                    {
                                        company_name: cliente?.company_name,
                                        contact_person: cliente?.contact_person,
                                    },
                                    b,
                                    item.diasParado,
                                    item.diasAteVencer,
                                )}
                                titulo={`Retomar — ${b.serial_number}`}
                                telefone={cliente?.phone}
                                compacto
                            />

                            {onMarcarAprovado && (
                                <button type="button" onClick={() => onMarcarAprovado(b.id)} className={BOTAO_SECUNDARIO}>
                                    Marcar aprovado
                                </button>
                            )}

                            <button
                                onClick={() => onAbrir(b)}
                                title="Abrir o orçamento"
                                aria-label="Abrir o orçamento"
                                className="shrink-0 text-zinc-600 hover:text-amber-400 transition-colors"
                            >
                                <Eye size={13} />
                            </button>
                        </div>
                    );
                })}

                {cobraveis.length > PREVIA && (
                    <button
                        onClick={() => setAberta(v => !v)}
                        className="mt-1 flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors py-1"
                    >
                        {aberta
                            ? <>Ver menos <ChevronUp size={12} /></>
                            : <>Ver as outras {cobraveis.length - PREVIA} <ChevronDown size={12} /></>}
                    </button>
                )}
            </div>
        </div>
    );
};

export default FilaDeFollowUp;
