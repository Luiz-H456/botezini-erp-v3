import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { storageService } from '@/services/storage';
import { pdfService } from '@/services/pdfService';
import { fotosCarregadas, avisoDeFotosFaltando } from '@/utils/gradeDeFotos';
import { somenteImagens } from '@/utils/anexosDeReferencia';
import { idService } from '@/services/idService';
import { Budget, Order, OrderStatus, ProductionStage, PaymentStatus } from '@/types';
import { formatCurrency, formatDate, getTodayStr, addBusinessDays } from '@/utils';
import { ITENS_POR_PAGINA } from '@/utils/constants';
import { dadosBancariosDoOrcamento } from '@/utils/perfilDaEmpresa';
import { Plus, Search, X, Eye, Pencil, Printer, ChevronLeft, ChevronRight, Calendar, Package, CheckCircle, AlertTriangle, Info, SortDesc, SortAsc } from 'lucide-react';
import { useBudgetController } from '@/hooks/useBudgetController';
import { BudgetEditor } from '@/components/budgets/BudgetEditor';
import { FilaDeFollowUp } from '@/components/budgets/FilaDeFollowUp';
import { ConfirmarOperacao } from '@/components/common/ConfirmarOperacao';
import { BudgetPreviewModal } from '@/components/budgets/BudgetPreviewModal';
import { SearchableSelect, ProximoPasso } from '@/components/common';
import { PaymentPlanModal } from '@/components/finance/PaymentPlanModal';
import type { PlanInstallment } from '@/utils/paymentPlan';
import { planoPrecisaRevisao, sugerirPlanoAtualizado, conferirPlano } from '@/utils/planoDoPedido';
import { ResumoDaConversao } from '@/components/budgets/ResumoDaConversao';
import { BotaoMensagem } from '@/components/common/BotaoMensagem';
import { descreverCondicao } from '@/utils/condicaoDePagamento';
import { msgOrcamentoEnviado, msgFechamento, msgCobrarEntrada, msgPedidoConfirmado, msgRetomarOrcamento, linkDoWhatsApp } from '@/utils/mensagensCliente';
import { filaDeFollowUp } from '@/utils/acompanhamentoComercial';
import { etiquetaDoOrcamento, CLASSE_DO_TOM_DE_VENDA } from '@/utils/vendas/etiquetas';
import { resumoDaEspecificacao } from '@/utils/vendas/especificacao';
import { MenuMais } from '@/components/common/MenuMais';
import { CARTAO, ITEM, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO, BOTAO_SUAVE, BOTAO_PERIGO, pilula } from '@/components/finance/ui/estilo';

import { avisar } from '@/utils/avisos';
import { mensagemDeErro } from '@/utils/errorHandling';
interface Props {
    onNavigate?: (view: 'orders' | 'budgets', searchTerm?: string) => void;
    initialSearch?: string;
    clearSearch?: () => void;
    /** Filtro pedido pela fila do Início. */
    statusInicial?: 'Sent' | 'Approved' | 'Draft';
    limparStatus?: () => void;
}

interface DialogState {
    isOpen: boolean;
    type: 'confirm' | 'alert';
    title: string;
    message: string;
    variant?: 'danger' | 'success' | 'info';
    onConfirm?: () => void;
}

const Budgets: React.FC<Props> = ({ onNavigate, initialSearch, clearSearch, statusInicial, limparStatus }) => {
    const {
        budgets, todosOsBudgets, clients, products, companyProfile,
        searchTerm, setSearchTerm,
        filterClient, setFilterClient,
        filterStatus, setFilterStatus,
        filterPeriod, setFilterPeriod,
        sortOrder, setSortOrder,
        showExpiredOnly, setShowExpiredOnly,
        refresh, prepareDuplicate, deleteBudget, refreshProducts
    } = useBudgetController(initialSearch, clearSearch);

    const filaRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!statusInicial) return;
        setFilterStatus(statusInicial);
        // Só o filtro mostraria todos os enviados; a fila no topo é quem lista os parados.
        if (statusInicial === 'Sent') filaRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        limparStatus?.();
    }, [statusInicial, limparStatus, setFilterStatus]);

    // O próximo passo oferecido onde a ação acabou (salvar, aprovar, converter). Fechar é sempre livre.
    const [passo, setPasso] = useState<React.ReactNode>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
    const [previewBudget, setPreviewBudget] = useState<Budget | null>(null);
    const [excluindoOrcamento, setExcluindoOrcamento] = useState<Budget | null>(null);
    // Editor de plano de pagamento na conversão (Decisão 1A)
    /**
     * A conferência final, entre escolher o plano e gravar.
     *
     * Converter cria pedido, cria N contas a receber com vencimento e muda o
     * estado do orçamento. Isso acontecia atrás de uma frase que não citava um
     * valor nem uma data. Agora a operação inteira aparece antes de acontecer.
     */
    const [resumoCtx, setResumoCtx] = useState<{
        budget: Budget;
        deliveryDate: string;
        plan: PlanInstallment[];
        numeroDoPedido: string;
        /** De onde viemos, para o botão "Ajustar plano" saber voltar. */
        voltarParaOPlano?: { planoSugerido?: PlanInstallment[]; aviso?: string };
    } | null>(null);

    const [planCtx, setPlanCtx] = useState<{
        budget: Budget;
        deliveryDate: string;
        /** Plano já corrigido, quando o gravado no orçamento estava velho. */
        planoSugerido?: PlanInstallment[];
        /** Por que o plano gravado não serve mais. */
        aviso?: string;
    } | null>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = ITENS_POR_PAGINA;

    // Reset page when filters change
    useEffect(() => { setCurrentPage(1); }, [searchTerm, filterClient, filterPeriod, filterStatus]);


    // Dialog State
    const [dialog, setDialog] = useState<DialogState>({ isOpen: false, type: 'alert', title: '', message: '' });
    const [isConfirming, setIsConfirming] = useState(false); // Added isConfirming state

    // Pagination Logic
    const totalPages = Math.ceil(budgets.length / itemsPerPage);
    const paginatedBudgets = budgets.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const openConfirm = (title: string, message: string, onConfirm: () => void | Promise<void>, variant: 'danger' | 'success' | 'info' = 'danger') => {
        setDialog({ isOpen: true, type: 'confirm', title, message, onConfirm, variant });
    };

    // Avisos (salvou / falhou / falta algo) vão para a central do app; a janela fica só para confirmações.
    const openAlert = (message: string, type: 'error' | 'success' = 'error') => { avisar(message, type); };

    const handleOpenEditor = (budget?: Budget) => {
        setPasso(null);
        setEditingBudget(budget || null);
        setIsEditorOpen(true);
    };

    const handleDuplicateClick = (budget: Budget) => {
        setPasso(null);
        openConfirm(
            'Duplicar Orçamento',
            `Deseja duplicar o orçamento ${budget.serial_number}?`,
            async () => {
                const newBudget = await prepareDuplicate(budget);
                handleOpenEditor(newBudget);
                setDialog(prev => ({ ...prev, isOpen: false }));
            },
            'info'
        );
    };

    const handleSaveBudget = async (budgetToSave: Budget) => {
        await storageService.saveBudget(budgetToSave);
        setIsEditorOpen(false);
        // Daqui em diante já está salvo: um erro não pode virar "não consegui salvar" no editor.
        try {
            // Refresh data in background — don't block UI
            setTimeout(() => refresh(), 100);
            // O aviso do próximo passo já diz "Orçamento salvo": o modal por cima era confirmação em
            // dobro e bloqueava o clique. Só abre o modal quando não há aviso para mostrar.
            if (!oferecerProximoPasso(budgetToSave)) openAlert('Orçamento salvo com sucesso!', 'success');
        } catch (e) {
            openAlert(`Orçamento salvo, mas ${e instanceof Error ? e.message : 'o próximo passo falhou'}.`, 'error');
        }
    };

    /**
     * Lê o orçamento de novo, direto do banco. O banner do próximo passo guarda uma
     * fotografia do editor; agir em cima dela pisaria numa conversão feita depois
     * (Converted virando Sent, ou pedido duplicado). Novo sai do editor sem `id`:
     * acha-se pelo número de série.
     */
    const lerFresco = async (b: Budget): Promise<Budget | undefined> =>
        (await storageService.getBudgets()).find(x => b.id ? x.id === b.id : x.serial_number === b.serial_number);

    /** Só o clique em "Enviar ao cliente" marca Enviado, e só o que ainda é rascunho AGORA. */
    const marcarEnviado = async (b: Budget) => {
        try {
            const fresco = await lerFresco(b);
            if (!fresco || fresco.status !== 'Draft') return;
            await storageService.saveBudget({ ...fresco, status: 'Sent' });
            refresh();
        } catch (e) {
            openAlert(`Não consegui marcar o orçamento como Enviado: ${e instanceof Error ? e.message : 'erro desconhecido'}.`, 'error');
        }
    };

    /** Releitura + conferência do status atual; devolve o orçamento só se ainda dá para agir. */
    const abertoAgora = async (b: Budget): Promise<Budget | undefined> => {
        let fresco: Budget | undefined;
        // Falha de rede não pode deixar o clique mudo.
        try { fresco = await lerFresco(b); }
        catch (e) { openAlert(`Não consegui reler o orçamento: ${e instanceof Error ? e.message : 'erro desconhecido'}.`, 'error'); return undefined; }
        if (!fresco) { setPasso(null); openAlert('Não encontrei este orçamento — ele pode ter sido excluído.', 'error'); return undefined; }
        if (fresco.status === 'Converted') {
            setPasso(null);
            openAlert(`O orçamento ${fresco.serial_number} já virou o pedido #${fresco.generated_order_number || ''}.`, 'error');
            return undefined;
        }
        return fresco;
    };

    /** Retomar → o cliente disse sim. Relê antes de agir (o mesmo cuidado do S1) e oferece virar pedido. */
    const marcarAprovado = async (b: Budget) => {
        const atual = await abertoAgora(b);
        if (!atual || atual.status !== 'Sent') { if (atual) openAlert('Este orçamento não está mais como Enviado.'); return; }
        try {
            await storageService.saveBudget({ ...atual, status: 'Approved' } as Budget);
            refresh();
            oferecerProximoPasso({ ...atual, status: 'Approved' } as Budget);
        } catch (e: any) { openAlert(mensagemDeErro(e, 'Não consegui marcar como aprovado.')); }
    };

    /** Mostra o aviso do próximo passo; devolve se havia um para mostrar. */
    const oferecerProximoPasso = (b: Budget): boolean => {
        const cliente = clients.find(c => c.id === b.client_id);
        const fechar = () => setPasso(null);
        if (b.status === 'Approved') {
            setPasso(<ProximoPasso titulo="Orçamento aprovado" onFechar={fechar}
                principal={{ rotulo: 'Virar pedido', onClick: async () => { const g = await abertoAgora(b); if (g) handleConvertClick(g); } }} />);
            return true;
        }
        if (b.status !== 'Draft' && b.status !== 'Sent') return false;
        const texto = msgOrcamentoEnviado(cliente || {}, b);
        const href = linkDoWhatsApp(cliente?.phone, texto);
        // Sem telefone o botão copia a mensagem (e marca Enviado): é o mesmo que o card faz.
        setPasso(<ProximoPasso titulo="Orçamento salvo" onFechar={fechar}
            principal={{ rotulo: 'Enviar ao cliente', whatsapp: true, href, copiar: texto, onClick: () => marcarEnviado(b) }}
            aviso={!href ? 'cliente sem telefone' : undefined}
            maisOpcoes={async () => { const g = await abertoAgora(b); if (g) handleOpenEditor(g); }} />);
        return true;
    };

    /**
     * @param comFotos inclui as referências aprovadas na proposta. Padrão SIM:
     *   o cliente mandou essas imagens, e vê-las junto do orçamento evita a
     *   discussão de "não era isso". Passe false para a versão sem imagem.
     */
    const handlePrint = async (budget: Budget, comFotos = true) => {
        const client = clients.find(c => c.id === budget.client_id);
        // Antes retornava calado aqui: clicar em "Gerar PDF" não fazia nada
        // visível, sem mensagem nenhuma — e cliente sem vínculo (excluído ou
        // mesclado) é exatamente o tipo de estado que passa despercebido até
        // alguém clicar e "nada acontecer".
        if (!client) {
            openAlert('Não foi possível gerar o PDF: o cliente deste orçamento não foi encontrado '
                + '(pode ter sido excluído ou mesclado com outro cadastro).', 'error');
            return;
        }

        // O PDF omite plano que não fecha com o total (ver generateBudgetPDF).
        // Omitir calado seria trocar um documento errado por um incompleto sem
        // ninguém saber — quem vai enviar precisa ouvir isso antes.
        const conf = conferirPlano(budget.payment_plan, budget.total_amount);
        if ((budget.payment_plan?.length ?? 0) > 0 && !conf.confere) {
            openAlert(
                `O plano de pagamento soma ${formatCurrency(conf.total)}, mas o orçamento é de `
                + `${formatCurrency(budget.total_amount)}. O PDF sai SEM o plano — abra o orçamento `
                + 'e use "Ajustar ao total" antes de enviar ao cliente.',
                'error');
        }

        // Foto a foto: uma ausente no armazenamento não derruba as outras (antes, Promise.all
        // descartava TODAS e o aviso era só "não foi possível carregar as fotos").
        let fotos: string[] | undefined;
        const imagens = somenteImagens(budget.reference_photos || []);
        if (comFotos && imagens.length) {
            const lidas = fotosCarregadas(await Promise.allSettled(
                imagens.map(p => storageService.getAttachmentDataUrl(p))));
            fotos = lidas.fotos.length ? lidas.fotos : undefined;
            const aviso = avisoDeFotosFaltando(lidas.faltando, imagens.length);
            if (aviso) openAlert(aviso, 'error');
        }

        // A geração fica dentro de try: `handlePrint` é async, então uma exceção
        // aqui virava promessa rejeitada sem tratamento — o clique não produzia
        // arquivo, nem mensagem, nem nada. "Não aparece nada" é indistinguível
        // de "o botão não funciona", e o erro só existia no console.
        try {
            pdfService.generateBudgetPDF(budget, client, companyProfile, fotos);
        } catch (e: any) {
            console.error('[orçamento] falha ao gerar o PDF:', e);
            openAlert(`Não foi possível gerar o PDF: ${mensagemDeErro(e, 'erro desconhecido')}.`, 'error');
        }
    };

    /**
     * Abre o editor de plano na conversão — MAS se o orçamento já tem plano
     * definido E esse plano ainda vale, converte direto (Fase 7).
     *
     * "Ainda vale" é a parte que faltava. O plano é uma fotografia: valores e
     * datas congelados no dia em que alguém o montou. O orçamento continua
     * vivo depois — o valor muda, o pedido é revertido e reconvertido semanas
     * depois. Convertendo direto, essa fotografia velha virava conta a receber
     * com o valor de ontem e vencimento que já nasce vencido, sem ninguém ver.
     *
     * Agora um plano desatualizado NÃO converte calado: abre o modal com a
     * sugestão corrigida e o motivo escrito, para a pessoa confirmar. Plano de
     * pagamento é acordo com cliente — consertar sozinho seria inventar acordo.
     */
    const handleConvertClick = async (budget: Budget) => {
        setPasso(null);
        if (budget.status === 'Converted') { openAlert('Orçamento já convertido.', 'error'); return; }
        const hoje = getTodayStr();
        const deliveryDate = addBusinessDays(hoje, budget.delivery_time_days || 20);

        const revisao = planoPrecisaRevisao(budget.payment_plan, budget.total_amount, hoje);

        if (budget.payment_plan && budget.payment_plan.length > 0 && revisao.precisa) {
            // Plano velho: abre o modal já com a correção proposta, e avisa por quê.
            setPlanCtx({
                budget,
                deliveryDate,
                planoSugerido: sugerirPlanoAtualizado(budget.payment_plan, budget.total_amount, hoje),
                aviso: revisao.texto,
            });
            return;
        }

        if (budget.payment_plan && budget.payment_plan.length > 0) {
            // Plano confere com o pedido de hoje → pula o editor de plano, mas
            // NÃO pula a conferência: era aqui que uma frase de uma linha fazia
            // as vezes de conferir pedido, parcelas, datas e o que ia mudar.
            await abrirResumo(budget, deliveryDate, budget.payment_plan);
            return;
        }
        setPlanCtx({ budget, deliveryDate });
    };

    /**
     * Monta a conferência final.
     *
     * O número sai de `getNextSequence`, que apenas LÊ o maior existente e soma
     * um — não reserva nada. Por isso pode ser consultado aqui sem custo se a
     * pessoa desistir, e é passado adiante para a gravação usar exatamente o
     * número que foi conferido, em vez de buscar de novo.
     */
    const abrirResumo = async (
        budget: Budget,
        deliveryDate: string,
        plan: PlanInstallment[],
        voltarParaOPlano?: { planoSugerido?: PlanInstallment[]; aviso?: string },
    ) => {
        let numeroDoPedido = '—';
        try {
            numeroDoPedido = await idService.getNextSequence('order');
        } catch {
            /* sem o número a conferência ainda vale; a gravação busca de novo */
        }
        setResumoCtx({ budget, deliveryDate, plan, numeroDoPedido, voltarParaOPlano });
    };

    /**
     * Confirma o plano vindo do modal.
     *
     * O plano confirmado é gravado de volta no orçamento. Sem isso, uma
     * reversão seguida de nova conversão reencontraria a fotografia velha e
     * repetiria o erro — a correção feita aqui morreria com o modal.
     */
    const handleConfirmPlan = async (plan: PlanInstallment[]) => {
        if (!planCtx) return;
        const ctx = planCtx;
        setPlanCtx(null);
        // O plano confirmado é gravado de volta no orçamento junto da conversão.
        // Sem isso, uma reversão seguida de nova conversão reencontraria a
        // fotografia velha e repetiria o erro.
        await abrirResumo(
            { ...ctx.budget, payment_plan: plan },
            ctx.deliveryDate,
            plan,
            { planoSugerido: plan, aviso: ctx.aviso },
        );
    };

    /**
     * Trava de reentrada da conversão.
     *
     * O botão da conferência já se desabilita enquanto salva, mas isso é estado
     * de componente: protege o clique duplo e nada além dele. A trava mora aqui,
     * junto de quem grava, porque é aqui que uma segunda passada custa caro —
     * `doConversion` cria pedido E parcelas, e o desfazer é manual.
     *
     * É `useRef` e não `useState` de propósito: precisa valer no mesmo instante
     * da chamada, sem esperar re-render.
     */
    const convertendo = useRef(false);

    /** Depois de converter: cobrar a entrada, se há; senão confirmar o pedido ao cliente. */
    const oferecerPassoDoPedido = (ctx: NonNullable<typeof resumoCtx>, numeroGravado?: string) => {
        const cliente = clients.find(c => c.id === ctx.budget.client_id) || {};
        const numero = numeroGravado && numeroGravado !== '—' ? numeroGravado : undefined;
        // O mesmo orçamento-com-o-plano-efetivo decide o rótulo E escreve a mensagem.
        const orc = { ...ctx.budget, payment_plan: ctx.plan, date: getTodayStr() };
        const temEntrada = descreverCondicao(orc, orc.date).temEntrada;
        const fone = (cliente as { phone?: string }).phone;
        const link = (texto: string) => numero ? linkDoWhatsApp(fone, texto) : null;
        const textoConfirmar = msgPedidoConfirmado(cliente, { order_number: numero, deadline: ctx.deliveryDate });
        const textoCobrar = msgCobrarEntrada(cliente, { ...orc, chave_pix: dadosBancariosDoOrcamento(companyProfile || {}).pix_key });
        const confirmar = link(textoConfirmar);
        const cobrar = link(textoCobrar);
        // Sem telefone o botão copia a mensagem (a pessoa cola em outro canal); sem número do pedido, nada a enviar.
        const copiarSe = (texto: string) => numero ? texto : undefined;
        const verPedido = () => onNavigate?.('orders', numero);
        setPasso(<ProximoPasso titulo={numero ? `Pedido #${numero} criado` : 'Pedido criado'} onFechar={() => setPasso(null)}
            aviso={!numero ? 'número do pedido indisponível' : !confirmar ? 'cliente sem telefone' : undefined}
            {...(temEntrada
                ? {
                    principal: { rotulo: 'Cobrar entrada', whatsapp: true, href: cobrar, copiar: copiarSe(textoCobrar), rotuloCopiar: 'Copiar cobrança' },
                    secundario: { rotulo: 'Confirmar ao cliente', whatsapp: true, href: confirmar, copiar: copiarSe(textoConfirmar), rotuloCopiar: 'Copiar confirmação' },
                    maisOpcoes: verPedido,
                    rotuloMaisOpcoes: 'Ver pedido',
                }
                : {
                    principal: { rotulo: 'Confirmar ao cliente', whatsapp: true, href: confirmar, copiar: copiarSe(textoConfirmar) },
                    secundario: { rotulo: 'Ver pedido', onClick: verPedido },
                })} />);
    };

    /** Grava de verdade, depois da conferência. */
    const confirmarResumo = async () => {
        if (!resumoCtx || convertendo.current) return;
        const ctx = resumoCtx;
        convertendo.current = true;
        try {
            const numeroGravado = await doConversion(ctx.budget, ctx.deliveryDate, ctx.plan, ctx.numeroDoPedido);
            setResumoCtx(null);
            refresh();
            oferecerPassoDoPedido(ctx, numeroGravado);
        } catch (e) {
            setResumoCtx(null);
            // A mensagem do repositório vem escrita para ser lida — colisão de
            // número, coluna ausente, sem permissão. Trocá-la por um "erro ao
            // converter" genérico apagava justamente a parte que diz o que fazer.
            const texto = e instanceof Error ? e.message.replace(/^[A-Z_]+:\s*/, '') : '';
            openAlert(texto || 'Erro ao converter orçamento.');
        } finally {
            convertendo.current = false;
        }
    };

    // Cria o pedido e aplica o plano de pagamento (atômico por order_id).
    const doConversion = async (
        budget: Budget,
        deliveryDate: string,
        plan: PlanInstallment[],
        /** O número já mostrado na conferência — evita gravar um diferente do conferido. */
        numeroConferido?: string,
    ): Promise<string> => {
        let createdOrderId: string | null = null;
        let createdObligationIds: string[] = [];
        try {
            const nextOrderNumber = numeroConferido && numeroConferido !== '—'
                ? numeroConferido
                : await idService.getNextSequence('order');
            const order: Order = {
                id: idService.generateUUID(),
                budget_id: budget.id,
                budget_serial_number: budget.serial_number,
                order_number: nextOrderNumber,
                client_id: budget.client_id,
                items: budget.items.map(i => ({
                    product_id: i.product_id,
                    product_name: i.product_name,
                    model: i.model,
                    quantity: i.quantity,
                    size: i.size,
                    production_stage: ProductionStage.CUTTING,
                    fabric_insumo_id: i.fabric_insumo_id,
                    fabric_name: i.fabric_name,
                    fabric: i.fabric,
                    color: i.color,
                    sleeve_type: i.sleeve_type,
                    has_band: i.has_band,
                    gender: i.gender,
                    fit: i.fit,
                    prod_notes: i.prod_notes,
                    // As peças do conjunto precisam atravessar a conversão: é o
                    // PEDIDO que gera a ficha de corte, e sem elas o conjunto
                    // volta a ser um enfesto só, no tecido da linha — exatamente
                    // o corte errado que o campo existe para evitar.
                    components: i.components,
                })),
                customizations: budget.customizations,
                extras: budget.extras,
                // As fotos de referência acompanham o pedido — é a produção que
                // precisa delas, e a ficha de corte lê deste campo.
                reference_photos: budget.reference_photos || [],
                // O mesmo vale para a observação geral de fábrica: ela foi
                // escrita para quem corta, e quem corta lê a ficha do PEDIDO.
                factory_notes: budget.factory_notes,
                total_amount: budget.total_amount,
                // amount_paid/payment_status são LEGADOS/derivados (verdade = obligation_summary)
                amount_paid: 0,
                deadline: deliveryDate,
                status: OrderStatus.PENDING,
                payment_status: PaymentStatus.PENDING,
                created_at: getTodayStr(),
                updated_at: getTodayStr()
            };

            await storageService.saveOrder(order);
            createdOrderId = order.id;

            createdObligationIds = await storageService.applyOrderPaymentPlan({
                order_id: order.id,
                client_id: budget.client_id,
                description: `Pedido #${nextOrderNumber} (Orçamento ${budget.serial_number})`,
                plan,
            });

            await storageService.saveBudget({ ...budget, status: 'Converted', generated_order_number: nextOrderNumber });
            return nextOrderNumber;
        } catch (e) {
            console.error(e);
            for (const obId of createdObligationIds) {
                try { await storageService.cancelObligation(obId, 'Rollback de conversao'); } catch { /* noop */ }
            }
            if (createdOrderId) {
                try { await storageService.deleteOrder(createdOrderId); } catch { /* noop */ }
            }
            refresh();
            throw e; // propaga: modal exibe erro; conversão direta cai no openAlert
        }
    };

    const handleDeleteClick = (budget: Budget) => {
        setPasso(null);
        if (budget.status === 'Converted') {
            openAlert('Não é possível excluir um orçamento já convertido em pedido.', 'error');
            return;
        }

        // A caixa do registro diz o que se perde — o historico de preco deste
        // cliente para de contar estas linhas —, em vez de repetir "nao pode
        // ser desfeita", que e verdade sobre tudo e informacao sobre nada.
        setExcluindoOrcamento(budget);
    };

    return (
        <>
            <div className="space-y-6 relative">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                            <p className={ROTULO}>Módulo Comercial</p>
                        </div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Gestão de Orçamentos</h2>
                    </div>
                    <button onClick={() => handleOpenEditor()} className={`${BOTAO_PRINCIPAL} group`}>
                        <Plus size={18} className="group-hover:rotate-90 transition-transform" /> Novo Orçamento
                    </button>
                </div>

                {/* O próximo passo vem antes da fila: com ela longa, ficaria fora da tela. */}
                {passo && <div className="mb-6">{passo}</div>}

                {/* Fila de cobrança — antes dos filtros de propósito: é a única
                    parte da tela que não obedece a eles, e ficar acima deixa isso
                    óbvio. Uma cobrança escondida atrás de um filtro que alguém
                    deixou ligado é uma cobrança perdida. */}
                <div ref={filaRef}>
                    <FilaDeFollowUp
                        budgets={todosOsBudgets}
                        clients={clients}
                        hoje={getTodayStr()}
                        onAbrir={(b) => setPreviewBudget(b)}
                        onMarcarAprovado={(id) => { const b = todosOsBudgets.find(x => x.id === id); if (b) marcarAprovado(b); else openAlert('Não achei este orçamento — recarregue a lista.'); }}
                    />
                </div>

                {/* FILTERS */}
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
                                    placeholder="Buscar por nº ou cliente..."
                                    aria-label="Buscar orçamento por número ou cliente"
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
                                    ...[...clients]
                                        .sort((a, b) => a.company_name.localeCompare(b.company_name))
                                        .map(c => ({ value: c.id, label: c.company_name.toUpperCase() }))
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
                                    { value: 'Draft', label: 'RASCUNHO' },
                                    { value: 'Sent', label: 'ENVIADO' },
                                    { value: 'Approved', label: 'APROVADO' },
                                    { value: 'Converted', label: 'CONVERTIDO' }
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
                            <button type="button" onClick={() => setShowExpiredOnly(!showExpiredOnly)} className={pilula(showExpiredOnly)}>
                                <AlertTriangle size={14} />
                                SOMENTE EXPIRADOS
                            </button>
                            <button type="button" onClick={() => setSortOrder(s => s === 'newest' ? 'oldest' : 'newest')} className={`${pilula(sortOrder !== 'newest')} ml-auto`}>
                                {sortOrder === 'newest' ? <SortDesc size={14} /> : <SortAsc size={14} />}
                                {sortOrder === 'newest' ? 'NOVOS' : 'ANTIGOS'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* LIST */}
                <div className="@container/lista grid gap-4">
                    {paginatedBudgets.map(budget => {
                        const client = clients.find(c => c.id === budget.client_id);
                        const hoje = getTodayStr();
                        const e = etiquetaDoOrcamento(budget, hoje);
                        const aprovado = budget.status === 'Approved';
                        // Orçamento ainda em aberto → mensagem de envio, com valor e prazo.
                        // Já aprovado → mensagem de fechamento, que MOSTRA os dados fiscais
                        // em vez de reperguntar.
                        const tituloDaMensagem = aprovado ? 'Fechamento' : 'Enviar orçamento';
                        const textoDaMensagem = aprovado ? msgFechamento(client || {}, budget) : msgOrcamentoEnviado(client || {}, budget);
                        const classeDaAcao = e.tom === 'verde' ? BOTAO_PRINCIPAL : BOTAO_SUAVE;
                        const verPedido = () => onNavigate?.('orders', budget.generated_order_number);

                        // Enviar e Retomar: prévia da mensagem ao passar o mouse, clique copia, "Enviar" abre o WhatsApp.
                        const acaoDoWhatsApp = (texto: string, titulo: string, aoEnviar?: () => void) => (
                            <BotaoMensagem rotulo={e.rotuloDaAcao} texto={texto} titulo={titulo} telefone={client?.phone} onEnviar={aoEnviar} />
                        );
                        let acaoAVista: React.ReactNode = null;
                        if (e.acao === 'enviar') {
                            acaoAVista = acaoDoWhatsApp(textoDaMensagem, tituloDaMensagem, () => marcarEnviado(budget));
                        } else if (e.acao === 'retomar') {
                            const item = filaDeFollowUp([budget], hoje)[0];
                            const texto = msgRetomarOrcamento(
                                { company_name: client?.company_name, contact_person: client?.contact_person },
                                budget, item?.diasParado ?? null, item?.diasAteVencer ?? null);
                            acaoAVista = acaoDoWhatsApp(texto, `Retomar — ${budget.serial_number}`);
                        } else {
                            const aoClicar = e.acao === 'revalidar' ? () => handleOpenEditor(budget)
                                : e.acao === 'virar-pedido' ? () => handleConvertClick(budget) : verPedido;
                            acaoAVista = <button type="button" onClick={aoClicar} className={classeDaAcao}>{e.rotuloDaAcao}</button>;
                        }

                        // À vista: ver, editar, mensagem e PDF. No ⋯ só o raro e o que apaga (pedido do Luiz, 09/10).
                        const mensagemAVista = e.acao === 'enviar' || e.acao === 'retomar';
                        const itensDoMenu = [
                            { rotulo: 'Duplicar', onClick: () => handleDuplicateClick(budget) },
                            ...(somenteImagens(budget.reference_photos || []).length ? [{ rotulo: 'PDF sem fotos', onClick: () => handlePrint(budget, false) }] : []),
                                            // Antes o "Gerar pedido" estava sempre à vista; com a ação à vista trocando, ele fica aqui.
                            ...(budget.status !== 'Converted' && e.acao !== 'virar-pedido' ? [{ rotulo: 'Gerar pedido', onClick: () => handleConvertClick(budget) }] : []),
                            { rotulo: 'Excluir', onClick: () => handleDeleteClick(budget), perigo: true },
                        ];
                        const icone = `${BOTAO_SECUNDARIO} w-10 px-0`;
                        const classeDaEtiqueta = `inline-flex h-6 shrink-0 whitespace-nowrap items-center px-2.5 rounded-lg border text-[10px] font-black uppercase tracking-widest ${CLASSE_DO_TOM_DE_VENDA[e.tom]}`;

                        return (
                            <div key={budget.id} className={`${CARTAO} p-5 min-w-0 flex flex-col @2xl/lista:flex-row justify-between items-center hover:border-zinc-600 hover:bg-zinc-900/80 transition-colors duration-150 gap-4 group`}>
                                {/* min-w-0: item flex nasce com min-width:auto, ou seja, não
                                    encolhe abaixo da largura do próprio conteúdo. Sem isto o
                                    `truncate` do nome do cliente nunca dispara — o texto longo
                                    segura a largura, o card empurra o contêiner e, com a
                                    lateral aberta, os botões da direita saem pela borda.

                                    @container em vez de `md:`: o `md:flex-row` olha a JANELA.
                                    Com a lateral de 208px aberta, o card tem bem menos espaço
                                    do que a janela diz, e virava linha antes de caber. */}
                                <div className="flex-1 w-full min-w-0">
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-1">
                                        <span className="shrink-0 whitespace-nowrap font-mono text-[10px] bg-zinc-950 px-2 py-1 rounded-lg text-amber-500 border border-zinc-800 font-black tracking-tighter">#{budget.serial_number}</span>
                                        <h3 className="min-w-0 max-w-full font-black text-white text-sm md:text-base truncate group-hover:text-amber-500 transition-colors">{client?.company_name || 'Cliente Desconhecido'}</h3>
                                        {e.acao === 'ver-pedido'
                                            ? <button type="button" onClick={verPedido} className={classeDaEtiqueta}>{e.texto}</button>
                                            : <span className={classeDaEtiqueta}>{e.texto}</span>}
                                    </div>
                                    <div className={`${ROTULO_PEQUENO} flex flex-wrap items-center gap-4 mt-2`}>
                                        <span className="flex items-center gap-1"><Calendar size={12} className="text-zinc-600" /> {formatDate(budget.date)}</span>
                                        <span className="flex items-center gap-1"><Package size={12} className="text-zinc-600" /> {budget.items.length} {budget.items.length === 1 ? 'item' : 'itens'}</span>
                                        {/* Mesmo critério do resumo da linha no editor: tecido e has_band:false antigo não contam */}
                                        {budget.items.some(i => resumoDaEspecificacao(i) !== 'sem especificação') && (
                                            <span>com especificação</span>
                                        )}
                                        <span className="font-mono text-zinc-400 text-[11px] font-black">{formatCurrency(budget.total_amount)}</span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 w-full @2xl/lista:w-auto justify-end shrink-0">
                                    {acaoAVista}
                                    {/* O passo seguinte mais comum de um Enviado: à vista, ao lado do Retomar. */}
                                    {budget.status === 'Sent' && (
                                        <button type="button" onClick={() => marcarAprovado(budget)} className={BOTAO_SECUNDARIO}>Marcar aprovado</button>
                                    )}
                                    {!mensagemAVista && (
                                        <BotaoMensagem texto={textoDaMensagem} titulo={tituloDaMensagem} telefone={client?.phone} />
                                    )}
                                    <button type="button" onClick={() => setPreviewBudget(budget)} className={icone} title="Pré-visualizar" aria-label={`Pré-visualizar orçamento #${budget.serial_number}`}>
                                        <Eye size={16} />
                                    </button>
                                    {budget.status !== 'Converted' && (
                                        <button type="button" onClick={() => handleOpenEditor(budget)} className={icone} title="Editar" aria-label={`Editar orçamento #${budget.serial_number}`}>
                                            <Pencil size={16} />
                                        </button>
                                    )}
                                    <button type="button" onClick={() => handlePrint(budget)} className={icone} title="Gerar PDF" aria-label={`PDF do orçamento #${budget.serial_number}`}>
                                        <Printer size={16} />
                                    </button>
                                    <MenuMais rotulo={`Mais ações do orçamento #${budget.serial_number}`} itens={itensDoMenu} />
                                </div>
                            </div>
                        );
                    })}
                    {budgets.length === 0 && (
                        <div className={`${CARTAO} text-center py-12`}>
                            <p className="text-zinc-500 text-sm font-bold uppercase">Nenhum orçamento encontrado.</p>
                        </div>
                    )}
                </div>

                {/* PAGINATION */}
                {budgets.length > 0 && (
                    <div className={`${CARTAO} flex flex-col md:flex-row justify-between items-center p-5 gap-6`}>
                        <div className="flex items-center gap-4">
                            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                            <span className={ROTULO}>
                                Exibindo {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, budgets.length)} de <span className="text-white">{budgets.length}</span> registros
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
            </div>

            {isEditorOpen && (
                <BudgetEditor
                    budget={editingBudget}
                    clients={clients}
                    products={products}
                    onClose={() => setIsEditorOpen(false)}
                    onSave={handleSaveBudget}
                    showToast={openAlert}
                    refreshProducts={refreshProducts}
                    companyProfile={companyProfile}
                />
            )}

            {previewBudget && (
                <BudgetPreviewModal
                    budget={previewBudget}
                    client={clients.find(c => c.id === previewBudget.client_id)}
                    companyProfile={companyProfile}
                    onClose={() => setPreviewBudget(null)}
                    onPrint={() => handlePrint(previewBudget)}
                    // Botão secundário virou o inverso: as fotos já entram por
                    // padrão, então o que faz falta é a versão limpa.
                    onPrintWithoutPhotos={somenteImagens(previewBudget.reference_photos || []).length
                        ? () => handlePrint(previewBudget, false)
                        : undefined}
                />
            )}

            {excluindoOrcamento && (
                <ConfirmarOperacao
                    operacaoId="excluir-orcamento"
                    alvo={`${excluindoOrcamento.serial_number} · ${formatCurrency(Number(excluindoOrcamento.total_amount) || 0)}`}
                    onConfirmar={async () => {
                        const alvo = excluindoOrcamento;
                        setExcluindoOrcamento(null);
                        await deleteBudget(alvo.id);
                    }}
                    onCancelar={() => setExcluindoOrcamento(null)}
                />
            )}

            {/* CUSTOM DIALOG */}
            {dialog.isOpen && createPortal(
                <div className="fixed inset-0 bg-zinc-950/80 z-confirmacao flex items-center justify-center p-4 ease-out animate-in fade-in duration-200">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-5 text-center relative overflow-hidden transform transition-all ease-out animate-in duration-200 zoom-in-95">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent"></div>

                        <div className={`mx-auto mb-6 w-20 h-20 rounded-2xl flex items-center justify-center border-2 transition-all ${dialog.variant === 'danger' ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                            dialog.variant === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                                'bg-amber-500/10 border-amber-500/20 text-amber-500'
                            }`}>
                            {dialog.variant === 'danger' ? <AlertTriangle size={32} /> :
                                dialog.variant === 'success' ? <CheckCircle size={32} /> : <Info size={32} />}
                        </div>

                        <h3 className="text-xl font-black text-white mb-3 uppercase tracking-tighter">{dialog.title}</h3>
                        <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest leading-relaxed mb-6">{dialog.message}</p>

                        <div className="flex flex-col gap-3">
                            {dialog.type === 'confirm' ? (
                                <>
                                    <button
                                        onClick={async () => {
                                            if (!dialog.onConfirm || isConfirming) return;
                                            setIsConfirming(true);
                                            try { await dialog.onConfirm(); }
                                            finally { setIsConfirming(false); }
                                        }}
                                        disabled={isConfirming}
                                        className={`w-full ${dialog.variant === 'danger' ? BOTAO_PERIGO : BOTAO_PRINCIPAL}`}
                                    >
                                        {isConfirming ? 'AGUARDE...' : 'CONFIRMAR OPERAÇÃO'}
                                    </button>
                                    <button
                                        onClick={() => setDialog(prev => ({ ...prev, isOpen: false }))}
                                        disabled={isConfirming}
                                        className={`w-full ${BOTAO_SECUNDARIO}`}
                                    >
                                        DESISTIR
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => setDialog(prev => ({ ...prev, isOpen: false }))}
                                    className={`w-full ${BOTAO_SECUNDARIO}`}
                                >
                                    ENTENDIDO
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {resumoCtx && (
                <ResumoDaConversao
                    orcamento={resumoCtx.budget}
                    cliente={clients.find(c => c.id === resumoCtx.budget.client_id)?.company_name || ''}
                    plano={resumoCtx.plan}
                    entrega={resumoCtx.deliveryDate}
                    numeroDoPedido={resumoCtx.numeroDoPedido}
                    hoje={getTodayStr()}
                    onConfirmar={confirmarResumo}
                    onCancelar={() => setResumoCtx(null)}
                    onEditarPlano={() => {
                        const ctx = resumoCtx;
                        setResumoCtx(null);
                        setPlanCtx({
                            budget: ctx.budget,
                            deliveryDate: ctx.deliveryDate,
                            planoSugerido: ctx.plan,
                            aviso: ctx.voltarParaOPlano?.aviso,
                        });
                    }}
                />
            )}

            {planCtx && (
                <PaymentPlanModal
                    mode="create"
                    orderId=""
                    orderNumber={planCtx.budget.serial_number}
                    clientId={planCtx.budget.client_id}
                    description={`Pedido (Orçamento ${planCtx.budget.serial_number})`}
                    total={planCtx.budget.total_amount}
                    deliveryDate={planCtx.deliveryDate}
                    downPayment={planCtx.budget.down_payment_value || 0}
                    defaultTerms={clients.find(c => c.id === planCtx.budget.client_id)?.default_payment_terms}
                    initialPlan={planCtx.planoSugerido}
                    aviso={planCtx.aviso}
                    onConfirm={handleConfirmPlan}
                    onClose={() => setPlanCtx(null)}
                />
            )}
        </>
    );
};
export default Budgets;
