
import React, { useState, useEffect } from 'react';
import { Order, OrderStatus } from '@/types';
import { formatCurrency, formatDate, getTodayStr } from '@/utils';
import {
    contasDoPedido, resumirPagamentoDoPedido, ROTULO_DA_SITUACAO,
} from '@/utils/situacaoDoPedido';
import { etiquetaDoPedido, avisoDePrazo } from '@/utils/etiquetaDoPedido';
import { acaoDoPedido, CLASSE_DO_TOM_DE_VENDA } from '@/utils/vendas/etiquetas';
import { Search, Eye, PackageCheck, Printer, Clock, ChevronRight, Package, Link, ChevronLeft, CreditCard, CheckCircle, AlertTriangle, X, SortDesc, SortAsc } from 'lucide-react';
import { OrderPreviewModal } from '@/components/orders/OrderPreviewModal';
import { OrderRevertModal, OrderDeleteModal } from '@/components/modals';
import InvoiceModal from '@/components/modals/InvoiceModal';
import { Toast } from '@/components/common/Toast';
import { SearchableSelect } from '@/components/common';
import { useOrders } from '@/hooks/useOrders';
import { pdfService } from '@/services/pdfService';
import { storageService } from '@/services/storage';
import { FichaOptionsModal } from '@/components/orders/FichaOptionsModal';
import { BotaoMensagem } from '@/components/common/BotaoMensagem';
import { MenuMais } from '@/components/common/MenuMais';
import { CARTAO, ITEM, CAMPO, ROTULO, BOTAO_SECUNDARIO, BOTAO_SUAVE, pilula } from '@/components/finance/ui/estilo';
import { msgProducaoIniciada, msgEntregue, msgPedidoConfirmado } from '@/utils/mensagensCliente';
import { FichaDeEntrega } from '@/components/orders/FichaDeEntrega';

/**
 * Dias ÚTEIS entre a confirmação e o prazo — é como o prazo foi combinado.
 * Contar corridos daria um número maior e faria a mensagem contradizer o que
 * foi acordado no fechamento.
 */
const diasUteisEntre = (de?: string, ate?: string): number | null => {
    if (!de || !ate) return null;
    const d = new Date(de.slice(0, 10) + 'T12:00:00');
    const fim = new Date(ate.slice(0, 10) + 'T12:00:00');
    if (Number.isNaN(d.getTime()) || Number.isNaN(fim.getTime()) || fim < d) return null;
    let n = 0;
    while (d < fim) {
        d.setDate(d.getDate() + 1);
        const dia = d.getDay();
        if (dia !== 0 && dia !== 6) n++;
    }
    return n || null;
};

/** Etiqueta no formato do cartão do orçamento (a cor vem de CLASSE_DO_TOM_DE_VENDA). */
const ETIQUETA = 'inline-flex h-6 shrink-0 whitespace-nowrap items-center gap-1 px-2.5 rounded-lg border text-[10px] font-black uppercase tracking-widest';

interface Props {
    onNavigate?: (view: 'orders' | 'budgets' | 'finance', searchTerm?: string) => void;
    initialSearch?: string;
    clearSearch?: () => void;
}

const Orders: React.FC<Props> = ({ onNavigate, initialSearch, clearSearch }) => {
    const {
        clients, products, companyProfile, receivables,
        isLoading, searchTerm, setSearchTerm,
        filterClient, setFilterClient,
        filterStatus, setFilterStatus,
        filterPeriod, setFilterPeriod,
        sortOrder, setSortOrder,
        currentPage, setCurrentPage,
        paginatedOrders, totalPages, processedOrders,
        itemsPerPage,
        deleteOrder, toast, loadData
    } = useOrders(initialSearch);

    const [isRevertModalOpen, setIsRevertModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [orderToAction, setOrderToAction] = useState<Order | null>(null);
    const [selectedPaymentOrder, setSelectedPaymentOrder] = useState<Order | null>(null);
    const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
    const [fichaDeEntrega, setFichaDeEntrega] = useState<Order | null>(null);

    useEffect(() => {
        if (initialSearch && clearSearch) clearSearch();
    }, [initialSearch, clearSearch]);

    // Nome do último setor ativo, na ordem de produção: é onde o pedido vira "ficha de entrega".
    const [ultimoSetor, setUltimoSetor] = useState<string | null>(null);
    useEffect(() => {
        storageService.getSectors(false)
            .then(setores => setUltimoSetor(setores.length ? setores[setores.length - 1].name : null))
            .catch(() => setUltimoSetor(null));
    }, []);

    const getClient = (id: string) => clients.find(c => c.id === id);

    /** Pedido cuja ficha está sendo montada; null = diálogo fechado. */
    const [fichaOpts, setFichaOpts] = useState<Order | null>(null);

    const gerarFicha = async (order: Order, incluirFotos: boolean) => {
        const client = getClient(order.client_id);
        if (!client) return;
        setFichaOpts(null);

        let fotos: string[] | undefined;
        if (incluirFotos && order.reference_photos?.length) {
            try {
                fotos = await Promise.all(
                    order.reference_photos.map(p => storageService.getAttachmentDataUrl(p)));
            } catch {
                // A ficha de corte é o essencial; sem as fotos ela ainda serve.
                fotos = undefined;
            }
        }

        pdfService.generateOrderProductionPDF(
            order, client, products, companyProfile, order.budget_serial_number || '',
            { photoDataUris: fotos },
        );
    };

    /**
     * A especificação técnica agora vive dentro do bloco de enfesto, então a única
     * escolha que resta é anexar as fotos — e ela só existe se houver foto.
     */
    const handlePrintPDF = (order: Order) => {
        if (order.reference_photos?.length) setFichaOpts(order);
        else gerarFicha(order, false);
    };

    const handleRevertClick = (order: Order) => {
        if (!order.budget_id) return;
        setOrderToAction(order);
        setIsRevertModalOpen(true);
    };

    const handleDeleteClick = (order: Order) => {
        setOrderToAction(order);
        setIsDeleteModalOpen(true);
    };

    const executeDeletion = async () => {
        if (!orderToAction) return;
        await deleteOrder(orderToAction.id);
        setIsRevertModalOpen(false);
        setIsDeleteModalOpen(false);
        setOrderToAction(null);
    };

    /**
     * A etiqueta de situação, agora dizendo ONDE o pedido está.
     *
     * Antes mostrava só `order.status`, que tem quatro valores para a vida
     * inteira do pedido: Corte e Finalização exibiam a MESMA palavra,
     * "PRODUÇÃO". E `labels[status]` era um Record fechado no enum — status
     * fora dele desenhava uma pílula VAZIA, que é a etiqueta "estranha".
     *
     * O prazo vem em chip separado porque atraso é independente da etapa: dá
     * para estar na Costura em dia ou com uma semana de atraso, e espremer as
     * duas informações numa pílula só apagava justamente o atraso.
     */
    const getStatusBadge = (order: Order) => {
        const e = etiquetaDoPedido(order as any);
        const prazo = avisoDePrazo(order as any, getTodayStr());
        return (
            <>
                <span title={e.detalhe} className={`${ETIQUETA} ${CLASSE_DO_TOM_DE_VENDA.neutro}`}>
                    {e.texto}
                </span>
                {prazo && (
                    <span
                        title={prazo.atraso > 0
                            ? `Prazo de entrega vencido há ${prazo.atraso} dia(s)`
                            : 'Prazo de entrega chegando'}
                        className={`${ETIQUETA} ${CLASSE_DO_TOM_DE_VENDA[prazo.atraso > 0 ? 'rosa' : 'ambar']}`}
                    >
                        {prazo.texto}
                    </span>
                )}
            </>
        );
    };

    return (
        <div className="space-y-6 relative pb-20 px-1">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                        <p className={ROTULO}>Fluxo de Carteira e Entrega</p>
                    </div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Gestão de Pedidos</h2>
                </div>
            </div>

            <div className={`${CARTAO} p-4 mb-6 relative group`}>
                <div className="absolute top-0 left-0 w-full h-1 rounded-t-2xl bg-gradient-to-r from-transparent via-amber-500/10 to-transparent"></div>

                {/* Duas linhas que quebram sem espremer: busca e seletores em cima, pílulas embaixo.
                    O seletor desenha a própria caixa (atenuado = 40px, a altura do CAMPO); embrulhá-lo
                    noutra caixa fazia ele vazar por cima da borda. */}
                <div className="relative z-10 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <label className={`${CAMPO} flex items-center gap-2 flex-[2_1_260px] min-w-0 focus-within:border-amber-500/40 group/input`}>
                            <Search size={16} className="shrink-0 text-zinc-600 group-focus-within/input:text-amber-500 transition-colors" />
                            <input
                                placeholder="Buscar por cliente ou nº..."
                                aria-label="Buscar pedido por cliente ou número"
                                className="bg-transparent outline-none text-sm text-white w-full min-w-0 placeholder:text-zinc-600"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && <button type="button" onClick={() => setSearchTerm('')} aria-label="Limpar busca"><X size={14} className="text-zinc-500 hover:text-white" /></button>}
                        </label>
                        <SearchableSelect
                            atenuado
                            value={filterClient}
                            onChange={setFilterClient}
                            options={[
                                { value: 'ALL', label: 'TODOS OS CLIENTES' },
                                ...[...clients].sort((a, b) => a.company_name.localeCompare(b.company_name)).map(c => ({ value: c.id, label: c.company_name.toUpperCase() }))
                            ]}
                            placeholder="SELECIONAR CLIENTE..."
                            className="flex-[1_1_220px] min-w-0"
                        />
                        <SearchableSelect
                            atenuado
                            value={filterStatus}
                            onChange={setFilterStatus}
                            options={[
                                { value: 'ALL', label: 'TODOS OS STATUS' },
                                { value: OrderStatus.PENDING, label: OrderStatus.PENDING },
                                { value: OrderStatus.IN_PRODUCTION, label: OrderStatus.IN_PRODUCTION },
                                { value: OrderStatus.DELIVERED, label: OrderStatus.DELIVERED }
                            ]}
                            placeholder="FILTRAR STATUS..."
                            className="flex-[1_1_180px] min-w-0"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                        {(['ALL', 'DAY', 'WEEK', 'MONTH'] as const).map(p => (
                            <button key={p} type="button" onClick={() => setFilterPeriod(p)} className={pilula(filterPeriod === p)}>
                                {p === 'ALL' ? 'TUDO' : p === 'DAY' ? 'HOJE' : p === 'WEEK' ? '7 DIAS' : '30 DIAS'}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                            className={`${pilula(sortOrder !== 'desc')} ml-auto`}
                            title={sortOrder === 'desc' ? 'Mais novos primeiro' : 'Mais antigos primeiro'}
                        >
                            {sortOrder === 'desc' ? <SortDesc size={14} /> : <SortAsc size={14} />}
                            {sortOrder === 'desc' ? 'NOVOS' : 'ANTIGOS'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="@container/lista grid gap-4">
                {paginatedOrders.map(order => {
                    const client = getClient(order.client_id);
                    const a = acaoDoPedido(order, ultimoSetor);

                    // A mensagem segue a fase do pedido: pendente confirma (com o prazo
                    // contado da CONVERSÃO, não da data do orçamento — `created_at` é o
                    // instante em que virou pedido e `deadline` já saiu dele), em produção
                    // avisa o andamento, entregue confirma a entrega.
                    const entregue = order.status === OrderStatus.DELIVERED;
                    // Saldo da mensagem de entrega e da etiqueta da fatura: um só cálculo, das contas do pedido.
                    const resumo = resumirPagamentoDoPedido(receivables as any, order, order.total_amount);
                    const emProducao = order.status === OrderStatus.IN_PRODUCTION;
                    const tituloDaMensagem = entregue ? 'Pedido entregue' : emProducao ? 'Produção iniciada' : 'Pedido confirmado';
                    const textoDaMensagem = entregue
                        ? msgEntregue(client || {}, order, resumo.situacao === 'sem_conta' ? null : resumo.falta)
                        : emProducao
                            ? msgProducaoIniciada(client || {}, order)
                            : msgPedidoConfirmado(client || {}, {
                                ...order,
                                confirmado_em: order.created_at,
                                prazo_dias: diasUteisEntre(order.created_at, order.deadline),
                            });

                    // Confirmar e Avisar andamento: prévia da mensagem ao passar o mouse, clique copia, "Enviar" abre o WhatsApp.
                    let acaoAVista: React.ReactNode;
                    if (a.acao === 'ficha-de-entrega') {
                        acaoAVista = <button type="button" onClick={() => setFichaDeEntrega(order)} className={BOTAO_SUAVE}>{a.rotulo}</button>;
                    } else {
                        acaoAVista = <BotaoMensagem rotulo={a.rotulo} texto={textoDaMensagem} titulo={tituloDaMensagem} telefone={client?.phone} />;
                    }

                    // À vista: as ações do dia a dia. No ⋯ só o raro e o que desfaz (pedido do Luiz, 09/10).
                    const itensDoMenu = [
                        ...(order.budget_id ? [{ rotulo: 'Reverter para orçamento', onClick: () => handleRevertClick(order) }] : []),
                        { rotulo: 'Excluir', onClick: () => handleDeleteClick(order), perigo: true },
                    ];
                    const icone = `${BOTAO_SECUNDARIO} w-10 px-0`;

                    return (
                        <div key={order.id} className={`${CARTAO} p-5 min-w-0 flex flex-col @2xl/lista:flex-row justify-between items-center hover:border-zinc-600 hover:bg-zinc-900/80 transition-colors duration-150 gap-4 group`}>
                            {/* min-w-0: item flex nasce com min-width:auto, ou seja, não
                                encolhe abaixo da largura do próprio conteúdo. Sem isto o
                                `truncate` do nome do cliente nunca dispara — o texto longo
                                segura a largura, o card empurra o contêiner e, com a
                                lateral aberta, os botões da direita saem pela borda.

@container em vez de `md:`: o `md:flex-row` olha a JANELA.
                                Com a lateral de 208px aberta, o card tem bem menos espaço
                                do que a janela diz, e virava linha antes de caber.
                                
                                O min-w-0 no próprio card é pelo mesmo motivo, um nível
                                acima: item de GRID também nasce com min-width:auto, então
                                o card segurava a largura do conteúdo e estourava a lista.
                                Medido: 55px para fora num contêiner de 560. */}
                            <div className="flex-1 w-full min-w-0">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-1">
                                    <span className="shrink-0 whitespace-nowrap font-mono text-[10px] bg-zinc-950 px-2 py-1 rounded-lg text-amber-500 border border-zinc-800 font-black tracking-tighter">#{order.order_number}</span>
                                    <h3 className="min-w-0 max-w-full font-black text-white text-sm md:text-base truncate group-hover:text-amber-500 transition-colors">{client?.company_name || 'Cliente Desconhecido'}</h3>
                                    {getStatusBadge(order)}
                                    {(() => {
                                        // A tag resume TODAS as parcelas do pedido, achadas por
                                        // order_id. Antes era `.find()` por pedaço de descrição:
                                        // "Pedido #1" casava com "#14", e a situação de uma
                                        // parcela qualquer virava a situação do pedido inteiro.
                                        if (resumo.situacao === 'sem_conta') return null;

                                        const tons = {
                                            open: 'ambar', partial: 'ambar', paid: 'verde',
                                            overdue: 'rosa', cancelled: 'neutro',
                                        } as const;
                                        const icons: Record<string, React.ReactNode> = {
                                            open: <Clock size={12} />,
                                            partial: <CreditCard size={12} />,
                                            paid: <CheckCircle size={12} />,
                                            overdue: <AlertTriangle size={12} />,
                                            cancelled: <X size={12} />
                                        };
                                        const detalhe = resumo.parcelas > 1
                                            ? ` · ${resumo.parcelas}x`
                                            : '';
                                        // O texto diz quanto falta; a situação e o nº de parcelas ficam no title.
                                        const texto = resumo.situacao === 'paid' ? 'quitado'
                                            : resumo.situacao === 'cancelled' ? ROTULO_DA_SITUACAO.cancelled
                                            : `falta ${formatCurrency(resumo.falta)}`;
                                        return (
                                            <>
                                                <button
                                                    onClick={() => setSelectedPaymentOrder(order)}
                                                    className={`${ETIQUETA} cursor-pointer hover:brightness-125 transition ${CLASSE_DO_TOM_DE_VENDA[tons[resumo.situacao as keyof typeof tons] || 'ambar']}`}
                                                    title={`Ver fatura — ${ROTULO_DA_SITUACAO[resumo.situacao]}${detalhe}, ${resumo.parcelas} parcela(s), falta ${formatCurrency(resumo.falta)}`}
                                                >
                                                    {icons[resumo.situacao] || icons['open']}
                                                    {texto}
                                                </button>
                                                {/* O financeiro e o pedido discordando sobre o valor é
                                                    o sintoma do plano velho convertido. Fica visível na
                                                    linha em vez de esperar alguém abrir a fatura. */}
                                                {Math.abs(resumo.divergencia) >= 0.01 && (
                                                    <span
                                                        className="flex items-center gap-1 px-2 py-0.5 text-[8px] font-black tracking-widest uppercase rounded-full border border-orange-700 bg-orange-950/40 text-orange-400"
                                                        title={`As contas somam ${formatCurrency(resumo.total)}, mas o pedido é de ${formatCurrency(order.total_amount)}. Revise o plano de pagamento.`}
                                                    >
                                                        <AlertTriangle size={12} /> DIVERGE {formatCurrency(Math.abs(resumo.divergencia))}
                                                    </span>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                                <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-4 mt-2">
                                    <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-widest"><Clock size={12} className="text-zinc-600" /> ENTREGA: {formatDate(order.deadline)}</span>
                                    <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-widest"><Package size={12} className="text-zinc-600" /> {order.items.length} {order.items.length === 1 ? 'item' : 'itens'}</span>
                                    <span className="font-mono text-zinc-400 text-[11px] font-black">{formatCurrency(order.total_amount)}</span>
                                    {order.budget_serial_number && (
                                        <div
                                            className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-amber-500 cursor-pointer hover:bg-amber-500/20 transition-all group/link"
                                            onClick={() => onNavigate && onNavigate('budgets', order.budget_serial_number)}
                                        >
                                            <Link size={12} />
                                            <span>#{order.budget_serial_number}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 w-full @2xl/lista:w-auto justify-end shrink-0">
                                {acaoAVista}
                                {a.acao === 'ficha-de-entrega' && (
                                    <BotaoMensagem texto={textoDaMensagem} titulo={tituloDaMensagem} telefone={client?.phone} />
                                )}
                                <button type="button" onClick={() => setPreviewOrder(order)} className={icone} title="Ver pedido" aria-label={`Ver pedido #${order.order_number}`}>
                                    <Eye size={16} />
                                </button>
                                {a.acao !== 'ficha-de-entrega' && (
                                    <button type="button" onClick={() => setFichaDeEntrega(order)} className={icone} title="Ficha de entrega" aria-label={`Ficha de entrega do pedido #${order.order_number}`}>
                                        <PackageCheck size={16} />
                                    </button>
                                )}
                                <button type="button" onClick={() => handlePrintPDF(order)} className={icone} title="Ficha de produção (PDF)" aria-label={`Ficha de produção do pedido #${order.order_number}`}>
                                    <Printer size={16} />
                                </button>
                                <MenuMais rotulo={`Mais ações do pedido #${order.order_number}`} itens={itensDoMenu} />
                            </div>
                        </div>
                    );
                })}
                {processedOrders.length === 0 && (
                    <div className={`${CARTAO} text-center py-12`}>
                        <p className="text-zinc-500 text-sm font-bold uppercase tracking-widest">Nenhum pedido encontrado.</p>
                    </div>
                )}
            </div>

            {processedOrders.length > 0 && (
                <div className={`${CARTAO} flex flex-col md:flex-row justify-between items-center p-5 gap-6`}>
                    <div className="flex items-center gap-4">
                        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                        <span className={ROTULO}>
                            Exibindo {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, processedOrders.length)} de <span className="text-white">{processedOrders.length}</span> registros
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className={BOTAO_SECUNDARIO}
                            aria-label="Página anterior"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <div className={`${ITEM} px-5 h-10 text-[11px] font-black text-amber-500 flex items-center tracking-widest`}>
                            {currentPage} <span className="text-zinc-700 mx-2">/</span> {totalPages}
                        </div>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className={BOTAO_SECUNDARIO}
                            aria-label="Próxima página"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
            )}

            {/* Action Modals */}
            <OrderRevertModal
                isOpen={isRevertModalOpen}
                onClose={() => {
                    setIsRevertModalOpen(false);
                    setOrderToAction(null);
                }}
                onConfirm={() => executeDeletion()}
                order_number={orderToAction?.order_number?.toString() || ''}
                isLoading={isLoading}
            />

            <OrderDeleteModal
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setOrderToAction(null);
                }}
                onConfirm={() => executeDeletion()}
                order_number={orderToAction?.order_number?.toString() || ''}
                isLoading={isLoading}
            />

            {/* Quick View / Preview Modal */}
            {fichaDeEntrega && (
                <FichaDeEntrega
                    order={fichaDeEntrega}
                    client={clients.find(c => c.id === fichaDeEntrega.client_id)}
                    onClose={() => setFichaDeEntrega(null)}
                    onSaved={() => { setFichaDeEntrega(null); loadData(); }}
                />
            )}

            {previewOrder && (
                <OrderPreviewModal
                    order={previewOrder}
                    client={getClient(previewOrder.client_id) || null}
                    companyProfile={companyProfile}
                    onClose={() => setPreviewOrder(null)}
                    onPrint={() => handlePrintPDF(previewOrder)}
                />
            )}

            {selectedPaymentOrder && (
                (() => {
                    // Mesma busca por chave da tag. A fatura mostra a primeira parcela em
                    // aberto — não uma linha sorteada por casamento de texto.
                    const contas = contasDoPedido(receivables as any, selectedPaymentOrder);
                    const ob = (contas.find(c => c.remaining_amount > 0) || contas[0]) as any;
                    if (!ob) return null;
                    return (
                        <InvoiceModal
                            obligation={ob}
                            client_name={getClient(selectedPaymentOrder.client_id)?.company_name || 'Desconhecido'}
                            order_number={selectedPaymentOrder.order_number}
                            onClose={() => setSelectedPaymentOrder(null)}
                            onGoToFinance={() => {
                                setSelectedPaymentOrder(null);
                                onNavigate && onNavigate('finance', `Pedido #${selectedPaymentOrder.order_number}`);
                            }}
                        />
                    );
                })()
            )}

            {fichaOpts && (
                <FichaOptionsModal
                    orderNumber={fichaOpts.order_number}
                    photoCount={fichaOpts.reference_photos?.length || 0}
                    onConfirm={(comFotos) => gerarFicha(fichaOpts, comFotos)}
                    onClose={() => setFichaOpts(null)}
                />
            )}

            <Toast visible={toast.visible} message={toast.message} title={toast.title} type={toast.type} />
        </div>
    );
};

export default Orders;
