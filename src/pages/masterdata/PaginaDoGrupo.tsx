import { useState, useEffect, useMemo } from 'react';
import {
    ArrowLeft, Building2, Loader2, AlertTriangle, PanelRightOpen, TrendingUp,
    LayoutGrid, FileText, Wallet, Repeat, Eye, ExternalLink,
} from 'lucide-react';
import type { Client, Budget, CompanyProfile } from '@/types';
import { formatCurrency, formatDate, getTodayStr } from '@/utils';
import { storageService } from '@/services/storage';
import { montarDossie } from '@/utils/dossieDoCliente';
import type { DossieDoCliente } from '@/utils/dossieDoCliente';
import { membrosClassificados, ROTULO_DO_PAPEL } from '@/utils/apelidosDeCliente';
import type { MembroClassificado } from '@/utils/apelidosDeCliente';
import { GraficoDePedidos } from '@/components/masterdata/GraficoDePedidos';
import { PainelDoContrato } from '@/components/masterdata/PainelDoContrato';
import { BudgetPreviewModal } from '@/components/budgets/BudgetPreviewModal';
import { Indicador } from '@/components/finance/ui/Indicador';
import { CARTAO, ROTULO, ROTULO_PEQUENO, pilula } from '@/components/finance/ui/estilo';

import { mensagemDeErro } from '@/utils/errorHandling';
interface Props {
    grupo: string;
    clientes: Client[];
    onVoltar: () => void;
    onAbrirCliente: (id: string) => void;
    onAbrirOrcamento?: (serial: string) => void;
    companyProfile?: CompanyProfile | null;
}

type Aba = 'visao' | 'empresas' | 'historico' | 'dinheiro' | 'contrato';

const ABAS: { id: Aba; label: string; icon: any }[] = [
    { id: 'visao', label: 'Visão geral', icon: LayoutGrid },
    { id: 'empresas', label: 'Empresas', icon: Building2 },
    { id: 'historico', label: 'Histórico', icon: FileText },
    { id: 'dinheiro', label: 'Dinheiro', icon: Wallet },
    { id: 'contrato', label: 'Contrato', icon: Repeat },
];

const ROTULO_STATUS: Record<string, string> = {
    Draft: 'Rascunho', Sent: 'Enviado', Approved: 'Aprovado', Converted: 'Pedido',
};

const COR_DO_PAPEL: Record<string, string> = {
    matriz: 'text-amber-500 border-amber-500/40 bg-amber-500/10',
    filial: 'text-zinc-400 border-zinc-700 bg-zinc-900',
    coligada: 'text-sky-400/90 border-sky-500/30 bg-sky-500/10',
    unica: 'text-zinc-500 border-zinc-800 bg-zinc-950',
};

/** Rodapé "em produção" dos cartões de dinheiro a receber: pedido não entregue não vence. */
const rodapeEmProducao = (v: number) => (v > 0 ? `em produção: ${formatCurrency(v)}` : undefined);

const Vazio = ({ texto }: { texto: string }) => (
    <p className="text-[11px] text-zinc-600 font-bold py-8 text-center">{texto}</p>
);

/**
 * O grupo econômico tratado COMO SE FOSSE UM CLIENTE SÓ.
 *
 * A granja com três CNPJs são três clientes de verdade — cada um com sua nota e
 * sua conta. Mas quem negocia não negocia com a filial: negocia com o dono, e
 * precisa ver pedidos, peças, orçamentos e financeiro do grupo somados numa
 * conta só.
 *
 * Chama `montarDossie` com a lista de ids dos membros e recebe exatamente o
 * mesmo objeto que a página do cliente recebe. As abas são as mesmas porque os
 * dados são os mesmos — somar por fora produziria dois cálculos de "quanto isto
 * vale" que divergiriam na primeira mudança.
 *
 * A coluna de origem em cada linha é o que a soma NÃO pode apagar: o pedido
 * continua sendo de uma empresa específica, e na hora de faturar é o CNPJ dela
 * que vale.
 */
export function PaginaDoGrupo({
    grupo, clientes, onVoltar, onAbrirCliente, onAbrirOrcamento, companyProfile,
}: Props) {
    const [aba, setAba] = useState<Aba>('visao');
    const [dossie, setDossie] = useState<DossieDoCliente | null>(null);
    const [porMembro, setPorMembro] = useState<Map<string, DossieDoCliente>>(new Map());
    const [orcamentosCompletos, setOrcamentosCompletos] = useState<any[]>([]);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState('');
    const [preview, setPreview] = useState<Budget | null>(null);

    const membros: MembroClassificado[] = useMemo(
        () => membrosClassificados(grupo, clientes as any),
        [grupo, clientes]);

    /** Nome da empresa por id — a coluna "de quem é" em cada linha somada. */
    const nomePorId = useMemo(
        () => new Map(membros.map(m => [m.cliente.id, m.cliente.company_name || ''])),
        [membros]);

    useEffect(() => {
        let vivo = true;
        if (membros.length === 0) return;
        setCarregando(true);
        setErro('');

        Promise.all([
            storageService.getBudgets(),
            storageService.getOrders(),
            storageService.getObligations(),
        ])
            .then(([orcamentos, pedidos, contas]) => {
                if (!vivo) return;
                const hoje = getTodayStr();
                const ids = membros.map(m => m.cliente.id);

                // UM dossiê com todos os ids: é isto que faz o grupo se
                // comportar como um cliente só, sem duplicar a lógica.
                setDossie(montarDossie(ids, orcamentos as any, pedidos as any, contas as any, hoje));

                // E um por membro, só para a aba Empresas mostrar o recorte.
                const mapa = new Map<string, DossieDoCliente>();
                for (const id of ids) {
                    mapa.set(id, montarDossie(id, orcamentos as any, pedidos as any, contas as any, hoje));
                }
                setPorMembro(mapa);

                const meus = new Set(ids);
                setOrcamentosCompletos((orcamentos as any[]).filter(o => meus.has(o.client_id)));
            })
            .catch((e: any) => { if (vivo) setErro(mensagemDeErro(e, 'Não foi possível carregar o grupo')); })
            .finally(() => { if (vivo) setCarregando(false); });

        return () => { vivo = false; };
    }, [membros]);

    const Origem = ({ id }: { id?: string }) => (
        <span className="text-[9px] font-bold text-zinc-600 truncate">
            {(id && nomePorId.get(id)) || '—'}
        </span>
    );

    return (
        <div className="ease-out animate-in slide-in-from-bottom-2 duration-200 space-y-5">

            {/* ── Cabeçalho ─────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 min-w-0">
                    <button onClick={onVoltar} title="Voltar para a lista"
                        className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-500 hover:text-white hover:border-zinc-700 transition-all shrink-0">
                        <ArrowLeft size={16} />
                    </button>
                    <div className="min-w-0">
                        <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                            <Building2 size={12} /> Grupo econômico
                        </p>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight truncate">{grupo}</h2>
                        <p className="text-[10px] text-zinc-500 font-bold mt-0.5">
                            {membros.length} empresa{membros.length === 1 ? '' : 's'} somadas como um cliente só
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Abas ──────────────────────────────────────────────────── */}
            <div className="flex items-center gap-1 overflow-x-auto chips-scroll">
                {ABAS.map(a => (
                    <button key={a.id} onClick={() => setAba(a.id)} className={pilula(aba === a.id)}>
                        <a.icon size={13} /> {a.label}
                    </button>
                ))}
            </div>

            {erro && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-[10px] font-bold flex items-center gap-2">
                    <AlertTriangle size={14} /> {erro}
                </div>
            )}

            {carregando && !dossie ? (
                <div className="flex items-center justify-center gap-2 py-16 text-zinc-600">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Somando o grupo</span>
                </div>
            ) : dossie && (
                <>
                    {/* ── Visão geral ───────────────────────────────────── */}
                    {aba === 'visao' && (
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <Indicador rotulo="Total em pedidos" valor={formatCurrency(dossie.totalEmPedidos)}
                                    sub={`${dossie.pedidos.length} pedido${dossie.pedidos.length === 1 ? '' : 's'} no grupo`} />
                                <Indicador rotulo="Já recebido" valor={formatCurrency(dossie.totalRecebido)} tom="emerald" />
                                <Indicador rotulo="A receber" valor={formatCurrency(dossie.aReceber)}
                                    sub={rodapeEmProducao(dossie.emProducao)} />
                                <Indicador rotulo="Vencido" valor={formatCurrency(dossie.vencido)}
                                    tom={dossie.vencido > 0 ? 'rose' : 'emerald'}
                                    sub={dossie.vencido > 0 ? 'passou do vencimento' : 'nada em atraso'} />
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                <Indicador rotulo="Ticket médio"
                                    valor={dossie.ticketMedio !== null ? formatCurrency(dossie.ticketMedio) : '—'}
                                    sub="por pedido do grupo" />
                                <Indicador rotulo="Taxa de fechamento"
                                    valor={dossie.taxaDeFechamento !== null ? `${Math.round(dossie.taxaDeFechamento * 100)}%` : '—'}
                                    sub={dossie.taxaDeFechamento !== null
                                        ? `${dossie.orcamentosFechados.length} de ${dossie.orcamentosConsiderados} enviados`
                                        : 'nenhum orçamento enviado'} />
                                <Indicador rotulo="Último pedido"
                                    valor={dossie.ultimoPedidoEm ? formatDate(dossie.ultimoPedidoEm) : '—'} />
                            </div>

                            <div className={`${CARTAO} p-5 space-y-4`}>
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                        <TrendingUp size={12} className="text-amber-500" /> Pedidos do grupo no tempo
                                    </p>
                                    {dossie.padrao.intervaloMedioDias !== null && (
                                        <p className={`text-[10px] font-black uppercase tracking-widest ${dossie.padrao.atrasado ? 'text-amber-500' : 'text-zinc-500'}`}>
                                            {dossie.padrao.atrasado
                                                ? `Atrasado — ${dossie.padrao.diasDesdeUltimo} dias sem pedir`
                                                : `Compra a cada ~${dossie.padrao.intervaloMedioDias} dias`}
                                        </p>
                                    )}
                                </div>
                                <GraficoDePedidos serie={dossie.porMes} />
                                <p className="text-[9px] text-zinc-600 font-bold leading-relaxed">
                                    O ritmo é do grupo somado — é o que mostra se o dono continua comprando
                                    mesmo quando uma filial some e outra cresce.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── Empresas ──────────────────────────────────────── */}
                    {aba === 'empresas' && (
                        <div className={`${CARTAO} overflow-hidden`}>
                            <table className="w-full text-left text-[11px]">
                                <thead className="bg-zinc-900/50 text-zinc-500 text-[10px] uppercase font-black tracking-widest border-b border-zinc-900">
                                    <tr>
                                        <th className="p-4">Empresa</th>
                                        <th className="p-4">Papel</th>
                                        <th className="p-4">CNPJ</th>
                                        <th className="p-4">Em pedidos</th>
                                        <th className="p-4">A receber</th>
                                        <th className="p-4 text-right">Abrir</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900">
                                    {membros.map(({ cliente, papel }) => {
                                        const d = porMembro.get(cliente.id);
                                        return (
                                            <tr key={cliente.id} className="group hover:bg-zinc-800/40 transition-colors">
                                                <td className="p-4">
                                                    <button onClick={() => onAbrirCliente(cliente.id)}
                                                        className="font-black text-white uppercase tracking-tight hover:text-amber-500 transition-colors text-left">
                                                        {cliente.company_name}
                                                    </button>
                                                </td>
                                                <td className="p-4">
                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${COR_DO_PAPEL[papel]}`}>
                                                        {ROTULO_DO_PAPEL[papel]}
                                                    </span>
                                                </td>
                                                <td className="p-4 font-mono text-zinc-500">{cliente.cnpj || '—'}</td>
                                                <td className="p-4 font-mono text-zinc-300">
                                                    {d ? formatCurrency(d.totalEmPedidos) : '—'}
                                                </td>
                                                <td className={`p-4 font-mono ${d && d.vencido > 0 ? 'text-rose-400' : 'text-zinc-400'}`}>
                                                    {d ? formatCurrency(d.aReceber) : '—'}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <button onClick={() => onAbrirCliente(cliente.id)}
                                                        title="Abrir a página desta empresa"
                                                        className="p-2 rounded-lg text-zinc-600 hover:text-amber-500 hover:bg-amber-500/10 transition-colors opacity-0 group-hover:opacity-100">
                                                        <PanelRightOpen size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <p className="px-4 py-3 text-[9px] text-zinc-600 font-bold border-t border-zinc-900 leading-relaxed">
                                <b className="text-amber-500/80">Matriz</b> e <b className="text-zinc-400">filial</b> são
                                deduzidas do próprio CNPJ — mesma raiz, sufixo /0001 é a matriz.
                                <b className="text-sky-400/80"> Coligada</b> é empresa de CNPJ diferente que entra no
                                grupo por decisão comercial, não por vínculo no cadastro.
                            </p>
                        </div>
                    )}

                    {/* ── Histórico ─────────────────────────────────────── */}
                    {aba === 'historico' && (
                        <div className="space-y-6">
                            <section className="space-y-3">
                                <p className={ROTULO}>Peças</p>
                                <div className={`${CARTAO} overflow-hidden`}>
                                    {dossie.pecas.length === 0 ? (
                                        <Vazio texto="Nenhuma peça orçada para o grupo ainda." />
                                    ) : (
                                        <table className="w-full text-left text-[11px]">
                                            <thead className="bg-zinc-900/50 text-zinc-500 text-[10px] uppercase font-black tracking-widest border-b border-zinc-900">
                                                <tr>
                                                    <th className="p-4">Peça</th>
                                                    <th className="p-4">Orçadas</th>
                                                    <th className="p-4">Fechadas</th>
                                                    <th className="p-4">Preço médio</th>
                                                    <th className="p-4">Último preço</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-900">
                                                {dossie.pecas.map(pc => (
                                                    <tr key={pc.produto} className="hover:bg-zinc-800/40 transition-colors">
                                                        <td className="p-4 font-black text-zinc-200 uppercase tracking-tight">
                                                            {pc.produto}
                                                            <span className="block text-[9px] font-bold text-zinc-600 normal-case tracking-normal mt-0.5">
                                                                em {pc.aparicoes} orçamento{pc.aparicoes > 1 ? 's' : ''} do grupo
                                                            </span>
                                                        </td>
                                                        <td className="p-4 font-mono text-zinc-300">{pc.quantidadeOrcada}</td>
                                                        <td className="p-4 font-mono text-emerald-400">{pc.quantidadeFechada}</td>
                                                        <td className="p-4 font-mono text-zinc-300">{formatCurrency(pc.precoMedio)}</td>
                                                        <td className="p-4 font-mono text-zinc-400">{formatCurrency(pc.ultimoPreco)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                    {dossie.pecas.length > 0 && (
                                        <p className="px-4 py-3 text-[9px] text-zinc-600 font-bold border-t border-zinc-900 leading-relaxed">
                                            Volume somado do grupo — é este número que sustenta pedir desconto de escala.
                                        </p>
                                    )}
                                </div>
                            </section>
                            <section className="space-y-3">
                                <p className={ROTULO}>Orçamentos</p>
                                <div className={`${CARTAO} overflow-hidden`}>
                                    {dossie.orcamentos.length === 0 ? <Vazio texto="Nenhum orçamento no grupo." /> : (
                                        <table className="w-full text-left text-[11px]">
                                            <thead className="bg-zinc-900/50 text-zinc-500 text-[10px] uppercase font-black tracking-widest border-b border-zinc-900">
                                                <tr>
                                                    <th className="p-4">Número</th><th className="p-4">Empresa</th>
                                                    <th className="p-4">Data</th><th className="p-4">Valor</th>
                                                    <th className="p-4">Situação</th><th className="p-4 text-right">Ver</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-900">
                                                {dossie.orcamentos.map(o => {
                                                    const fechado = o.status === 'Approved' || o.status === 'Converted';
                                                    const completo = orcamentosCompletos.find(x => x.id === o.id);
                                                    return (
                                                        <tr key={o.id} className="group hover:bg-zinc-800/40 transition-colors">
                                                            <td className="p-4">
                                                                {onAbrirOrcamento && o.serial_number ? (
                                                                    <button onClick={() => onAbrirOrcamento(o.serial_number as string)}
                                                                        title="Abrir na tela de Orçamentos"
                                                                        className="font-mono text-amber-500 font-black hover:underline flex items-center gap-1.5">
                                                                        #{o.serial_number}
                                                                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                    </button>
                                                                ) : (
                                                                    <span className="font-mono text-amber-500 font-black">#{o.serial_number}</span>
                                                                )}
                                                            </td>
                                                            <td className="p-4"><Origem id={o.client_id} /></td>
                                                            <td className="p-4 text-zinc-400">{o.date ? formatDate(o.date) : '—'}</td>
                                                            <td className="p-4 font-mono text-zinc-300">{formatCurrency(o.total_amount || 0)}</td>
                                                            <td className="p-4">
                                                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${fechado
                                                                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                                                                    : 'text-zinc-500 border-zinc-800 bg-zinc-950'}`}>
                                                                    {ROTULO_STATUS[o.status || ''] || o.status}
                                                                </span>
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                {completo && (
                                                                    <button onClick={() => setPreview(completo)}
                                                                        title="Ver o orçamento sem sair daqui"
                                                                        className="p-2 rounded-lg text-zinc-600 hover:text-amber-500 hover:bg-amber-500/10 transition-colors opacity-0 group-hover:opacity-100">
                                                                        <Eye size={14} />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </section>
                            <section className="space-y-3">
                                <p className={ROTULO}>Pedidos</p>
                                <div className={`${CARTAO} overflow-hidden`}>
                                    {dossie.pedidos.length === 0 ? <Vazio texto="Nenhum pedido no grupo." /> : (
                                        <table className="w-full text-left text-[11px]">
                                            <thead className="bg-zinc-900/50 text-zinc-500 text-[10px] uppercase font-black tracking-widest border-b border-zinc-900">
                                                <tr>
                                                    <th className="p-4">Pedido</th><th className="p-4">Empresa</th>
                                                    <th className="p-4">Aberto em</th><th className="p-4">Prazo</th>
                                                    <th className="p-4">Valor</th><th className="p-4">Situação</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-900">
                                                {dossie.pedidos.map(p => (
                                                    <tr key={p.id} className="hover:bg-zinc-800/40 transition-colors">
                                                        <td className="p-4 font-mono text-amber-500 font-black">#{p.order_number}</td>
                                                        <td className="p-4"><Origem id={p.client_id} /></td>
                                                        <td className="p-4 text-zinc-400">{p.created_at ? formatDate(p.created_at) : '—'}</td>
                                                        <td className="p-4 text-zinc-400">{p.deadline ? formatDate(p.deadline) : '—'}</td>
                                                        <td className="p-4 font-mono text-zinc-300">{formatCurrency(p.total_amount || 0)}</td>
                                                        <td className="p-4 text-[9px] font-black uppercase tracking-widest text-zinc-400">{p.status || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </section>
                        </div>
                    )}

                    {/* ── Dinheiro ──────────────────────────────────────── */}
                    {aba === 'dinheiro' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                                <Indicador rotulo="Recebido" valor={formatCurrency(dossie.totalRecebido)} tom="emerald" />
                                <Indicador rotulo="Em aberto" valor={formatCurrency(dossie.aReceber)}
                                    sub={rodapeEmProducao(dossie.emProducao)} />
                                <Indicador rotulo="Vencido" valor={formatCurrency(dossie.vencido)}
                                    tom={dossie.vencido > 0 ? 'rose' : 'emerald'} />
                            </div>
                            <div className={`${CARTAO} overflow-hidden`}>
                                {dossie.contas.length === 0 ? <Vazio texto="Nenhuma conta no grupo." /> : (
                                    <table className="w-full text-left text-[11px]">
                                        <thead className="bg-zinc-900/50 text-zinc-500 text-[10px] uppercase font-black tracking-widest border-b border-zinc-900">
                                            <tr>
                                                <th className="p-4">Descrição</th><th className="p-4">Empresa</th>
                                                <th className="p-4">Vencimento</th><th className="p-4">Valor</th>
                                                <th className="p-4">Pago</th><th className="p-4">Falta</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-900">
                                            {dossie.contas.map(c => {
                                                const cancelada = !!c.cancelled_at || c.derived_status === 'cancelled';
                                                return (
                                                    <tr key={c.id} className={`hover:bg-zinc-800/40 transition-colors ${cancelada ? 'opacity-40' : ''}`}>
                                                        <td className="p-4 text-zinc-300 font-bold">
                                                            {c.description}
                                                            {cancelada && <span className="ml-2 text-[8px] font-black uppercase text-rose-500">cancelada</span>}
                                                            {/* Pedido ainda não entregue: fora dos cartões de vencido e a receber. */}
                                                            {c.awaiting_delivery && <span className={`${ROTULO_PEQUENO} ml-2`}>em produção</span>}
                                                        </td>
                                                        <td className="p-4"><Origem id={c.client_id} /></td>
                                                        <td className="p-4 text-zinc-400">{c.due_date ? formatDate(c.due_date) : '—'}</td>
                                                        <td className="p-4 font-mono text-zinc-300">{formatCurrency(c.original_amount || 0)}</td>
                                                        <td className="p-4 font-mono text-emerald-400">{formatCurrency(c.paid_amount || 0)}</td>
                                                        <td className="p-4 font-mono text-amber-500">{formatCurrency(c.remaining_amount || 0)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Contrato ──────────────────────────────────────── */}
                    {aba === 'contrato' && (
                        <PainelDoContrato
                            clientId={membros[0]?.cliente.id || ''}
                            pecas={dossie.pecas}
                            intervaloMedioDias={dossie.padrao.intervaloMedioDias}
                        />
                    )}
                </>
            )}

            {preview && (
                <BudgetPreviewModal
                    budget={preview}
                    client={clientes.find(c => c.id === preview.client_id)}
                    companyProfile={companyProfile}
                    onClose={() => setPreview(null)}
                    onPrint={() => {
                        setPreview(null);
                        if (onAbrirOrcamento && preview.serial_number) onAbrirOrcamento(preview.serial_number);
                    }}
                />
            )}
        </div>
    );
}

export default PaginaDoGrupo;
