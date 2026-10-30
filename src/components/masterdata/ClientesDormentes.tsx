import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MoonStar, RefreshCw, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '@/utils';
import { storageService } from '@/services/storage';
import { getTodayStr } from '@/utils/date';
import { clientesDormentes, descreverAtraso, MINIMO_DE_COMPRAS } from '@/utils/acompanhamentoComercial';
import type { ClienteDormente } from '@/utils/acompanhamentoComercial';
import { BotaoMensagem } from '@/components/common/BotaoMensagem';
import { msgLevantamento } from '@/utils/mensagensCliente';
import type { Client } from '@/types';
import { CARTAO, ITEM, BOTAO_SECUNDARIO } from '@/components/finance/ui/estilo';

interface Props {
    clients: Client[];
    onAbrirCliente?: (id: string) => void;
    /** Já abre a lista inteira e rola até ela: quem vem do cartão "N sumidos" cai aqui. */
    abertaInicial?: boolean;
}

const PREVIA = 5;

const dataCurta = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—');

/**
 * Clientes que pararam de comprar sem ninguém notar.
 *
 * É a informação comercial mais barata que existe: o banco JÁ sabe a data do
 * último pedido de cada cliente e o intervalo típico entre as compras dele.
 * Ninguém pergunta.
 *
 * A DEFINIÇÃO DE "SUMIU" É POR CLIENTE, NÃO POR CALENDÁRIO. Um prazo fixo trata
 * igual o hospital que compra todo mês e a escola que compra uma vez por ano —
 * e acusa a escola de sumida em março, todo ano, até a equipe aprender a ignorar
 * a lista. O que denuncia de verdade é o cliente estar fora do PRÓPRIO ritmo.
 */
export const ClientesDormentes: React.FC<Props> = ({ clients, onAbrirCliente, abertaInicial = false }) => {
    const [dormentes, setDormentes] = useState<ClienteDormente[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');
    const [aberta, setAberta] = useState(abertaInicial);
    const ref = useRef<HTMLDivElement>(null);
    // Lido ao montar: o painel só aparece depois da carga, e é aí que o scroll mira (uma vez).
    const rolar = useRef(abertaInicial);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const pedidos = await storageService.getOrders();
            setErro('');
            setDormentes(clientesDormentes(
                clients,
                pedidos.map(o => ({
                    client_id: o.client_id,
                    data: o.created_at,
                    valor: Number(o.total_amount) || 0,
                })),
                getTodayStr(),
            ));
        } catch (e) {
            // Falha não é "ninguém sumiu": sem pedidos não há como saber.
            setDormentes([]);
            setErro(e instanceof Error ? e.message : 'Não consegui ler os pedidos.');
        } finally {
            setCarregando(false);
        }
    }, [clients]);

    useEffect(() => { if (clients.length > 0) carregar(); }, [carregar, clients.length]);

    useEffect(() => {
        if (carregando || !rolar.current) return;
        rolar.current = false;
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [carregando]);

    const visiveis = useMemo(
        () => (aberta ? dormentes : dormentes.slice(0, PREVIA)), [aberta, dormentes]);

    if (carregando || clients.length === 0) return null;

    if (erro) {
        return (
            <div ref={ref} className="flex flex-wrap items-center gap-3">
                <p className="text-xs text-rose-400">Não consegui ver os clientes sumidos ({erro}).</p>
                <button type="button" onClick={carregar} className={BOTAO_SECUNDARIO}>Tentar de novo</button>
            </div>
        );
    }

    if (dormentes.length === 0) {
        return (
            <div ref={ref} className="flex items-center gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4">
                <Check size={15} className="text-emerald-400 shrink-0" />
                <p className="text-xs text-zinc-300 font-bold">
                    Nenhum cliente fora do próprio ritmo de compra.
                    <span className="text-zinc-500 font-medium">
                        {' '}Só entram aqui quem já comprou ao menos {MINIMO_DE_COMPRAS} vezes — abaixo
                        disso não há padrão a violar.
                    </span>
                </p>
            </div>
        );
    }

    return (
        <div ref={ref} className={`${CARTAO} overflow-hidden`}>
            <div className="flex items-start gap-3 p-4">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    <MoonStar size={16} className="text-indigo-400" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-white uppercase tracking-tight">
                        {dormentes.length} {dormentes.length === 1 ? 'cliente saiu' : 'clientes saíram'} do próprio ritmo
                    </p>
                    <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">
                        Comparado com o intervalo de compra de cada um, não com um prazo fixo — assim a
                        escola que compra uma vez por ano não é acusada de sumida em março.
                    </p>
                </div>
                <button
                    onClick={carregar}
                    className="p-2 text-zinc-600 hover:text-white transition-colors shrink-0"
                    title="Recarregar"
                    aria-label="Recarregar"
                >
                    <RefreshCw size={13} />
                </button>
            </div>

            <div className="px-4 pb-4 flex flex-col gap-2">
                {visiveis.map(d => (
                    <div
                        key={d.cliente.id}
                        className={`${ITEM} flex items-center gap-3 px-3 py-2.5 flex-wrap`}
                    >
                        <button
                            onClick={() => onAbrirCliente?.(d.cliente.id)}
                            className="min-w-0 flex-1 text-left group"
                        >
                            <p className="text-[11px] font-bold text-zinc-200 truncate group-hover:text-white transition-colors">
                                {d.cliente.company_name || '(sem nome)'}
                            </p>
                            <p className="text-[10px] text-zinc-600 font-medium mt-0.5 truncate">
                                {descreverAtraso(d)} · última em {dataCurta(d.ultimaCompra)}
                            </p>
                        </button>

                        <span className="text-[11px] font-mono font-black text-zinc-400 tabular-nums shrink-0">
                            {formatCurrency(d.valorHistorico)}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400/70 tabular-nums shrink-0 w-10 text-right">
                            {d.atraso.toFixed(1).replace('.', ',')}×
                        </span>

                        <BotaoMensagem
                            texto={msgLevantamento({
                                company_name: d.cliente.company_name,
                                contact_person: d.cliente.contact_person,
                            })}
                            titulo={`Retomar — ${d.cliente.company_name || ''}`}
                            telefone={d.cliente.phone}
                            compacto
                        />
                    </div>
                ))}

                {dormentes.length > PREVIA && (
                    <button
                        onClick={() => setAberta(v => !v)}
                        className="mt-1 flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-white transition-colors py-1"
                    >
                        {aberta
                            ? <>Ver menos <ChevronUp size={12} /></>
                            : <>Ver os outros {dormentes.length - PREVIA} <ChevronDown size={12} /></>}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ClientesDormentes;
