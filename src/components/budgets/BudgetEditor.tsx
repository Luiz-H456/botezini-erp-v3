import React, { useState, useEffect, useMemo, useRef } from 'react';
import { idService } from '@/services/idService';
import { storageService } from '@/services/storage';
import { useQueryClient, useQuery } from '@tanstack/react-query';

import { budgetService } from '@/services/budgetService';
import {
  Budget,
  Client,
  Product,
  BudgetItem,
  ItemComponent,
  BudgetCustomization,
  BudgetExtra,
  Insumo,
  CompanyProfile,
} from '@/types';
import { useInsumos } from '@/hooks/useInventoryQueries';
import { formatCurrency, formatDate, getTodayStr, round2, addBusinessDays } from '@/utils';
import { interpretarNomeProduto, nomePrincipal } from '@/utils/nomeProduto';
import { PaymentPlanModal } from '@/components/finance/PaymentPlanModal';
import type { PlanInstallment } from '@/utils/paymentPlan';
import {
  Plus,
  Save,
  ChevronLeft,
  Calendar,
  User,
  DollarSign,
  Trash2,
  Truck,
  Paintbrush,
  Copy,
  GripVertical,
  Download,
  Boxes,
  Pencil,
  Infinity as InfinityIcon,
  AlertTriangle,
  ChevronDown,
  Rows3,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import QuickCreateModal from '@/components/modals/QuickCreateModal';
import { SearchableSelect } from '@/components/common';
import { ReferencePhotos } from './ReferencePhotos';
import ImportarPersonalizacaoModal from './ImportarPersonalizacaoModal';
import HistoricoProdutoBadge from './HistoricoProdutoBadge';
import CustoDaPecaBadge from './CustoDaPecaBadge';
import { historicoPorProduto, linhasNormalizadas, curvaDeDesconto, vendasDeClientes } from '@/utils/historicoDeProduto';
import { nomeDoGrupo, membrosDoGrupo } from '@/utils/apelidosDeCliente';
import { agruparPorCategoria } from '@/utils/opcoesAgrupadas';
import { listaPorProduto } from '@/hooks/useHistoricoDeProduto';
import { mapaDeCanonicos, canonico } from '@/utils/apelidosDeProduto';
import { BotaoMensagem } from '@/components/common/BotaoMensagem';
import { msgLevantamento, msgCobrarGrade, msgAprovacaoDeArte } from '@/utils/mensagensCliente';
import { AreaDeTexto } from '@/components/common/AreaDeTexto';
import { conferirPlano, reescalarPlano } from '@/utils/planoDoPedido';
import { usePcpSimulator } from '@/hooks/pcp/usePcpSimulator';
import { respostaCabeNaSemana } from '@/utils/cabeNaSemana';
import { lerGrade } from '@/utils/vendas/grade';
import { copiarEspecificacao, resumoDaEspecificacao, type GrupoCopiavel } from '@/utils/vendas/especificacao';
import { aplicarEntrada, planoParaMostrar, entradaPctDoPlano, descreverCondicao } from '@/utils/condicaoDePagamento';
import { mensagemDeErro } from '@/utils/errorHandling';
import { assinatura, chaveDoRascunho, rascunhoParaOferecer, type Rascunho } from '@/utils/rascunho';
import { useSaidaProtegida } from '@/hooks/useSaidaProtegida';
import { faltasDoOrcamento, type FaltaNoOrcamento } from '@/utils/vendas/faltasDoOrcamento';
import { useOrdemDasFaixas } from '@/hooks/useTabelaVerdade';
import {
  CARTAO, ITEM, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SUAVE, BOTAO_SECUNDARIO, pilula,
} from '@/components/finance/ui/estilo';

// Especificação da linha em um clique: o do dia a dia à vista, o raro no "+ mais".
const ESPECIFICACAO: { campo: 'sleeve_type' | 'gender' | 'fit'; rotulo: string; comuns: [string, string][]; raros: [string, string][] }[] = [
  { campo: 'sleeve_type', rotulo: 'Manga', comuns: [['manga_curta', 'Curta'], ['manga_longa', 'Longa'], ['sem_manga', 'Sem']], raros: [['outro', 'Outro padrão']] },
  { campo: 'gender', rotulo: 'Gênero', comuns: [['masculino', 'Masc'], ['feminino', 'Fem'], ['unissex', 'Uni']], raros: [['infantil', 'Infantil']] },
  { campo: 'fit', rotulo: 'Modelagem', comuns: [['regular', 'Regular'], ['slim', 'Slim'], ['babylook', 'Babylook']], raros: [['oversized', 'Oversized'], ['plus_size', 'Plus size']] },
];

// Valor raro ou detalhe já gravado abre o "+ mais" da linha: nada fica escondido.
const temRaroGravado = (item: BudgetItem) =>
  !!item.prod_notes || ESPECIFICACAO.some(g => g.raros.some(([v]) => item[g.campo] === v));
const linhasComRaro = (lista: BudgetItem[]) => new Set(lista.flatMap((it, k) => (temRaroGravado(it) ? [k] : [])));

const GRUPOS_COPIAVEIS: [GrupoCopiavel, string][] = [
  ['opcionais', 'Opcionais (manga, gênero, modelagem, faixa)'], ['detalhes', 'Detalhes'], ['tecido', 'Tecido e cor'], ['preco', 'Preço'],
];

export interface BudgetEditorProps {
  budget?: Budget | null;
  clients: Client[];
  products: Product[];
  onClose: () => void;
  onSave: (budget: Budget) => Promise<void>;
  showToast: (msg: string, type?: 'error' | 'success') => void;
  refreshProducts?: () => Promise<void>;
  /** Alíquota e custo/hora da casa — entram no custo por peça de cada linha. */
  companyProfile?: CompanyProfile | null;
}

const SectionHeader = ({
  title,
  onAdd,
  acaoExtra,
}: {
  title: string;
  onAdd: () => void;
  acaoExtra?: React.ReactNode;
}) => (
  <div className="flex flex-wrap justify-between items-center gap-x-3 gap-y-2 mt-6 mb-3 px-2 min-w-0">
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0"></div>
      <h3 className={ROTULO}>
        {title}
      </h3>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {acaoExtra}
      <button
        onClick={onAdd}
        className={BOTAO_SUAVE}
      >
        <Plus size={12} /> ADICIONAR REGISTRO
      </button>
    </div>
  </div>
);

/**
 * Bloco recolhível do editor. Fechado, mostra o resumo do que tem dentro:
 * recolher não pode virar esconder — quem passa o olho precisa saber se há
 * algo ali sem abrir. O conteúdo continua montado (só `hidden`), para não
 * perder foto subindo nem o texto da aba de observação ao recolher.
 */
const BlocoRecolhivel = ({
  titulo,
  aberto,
  onAlternar,
  resumo,
  children,
}: {
  titulo: string;
  aberto: boolean;
  onAlternar: () => void;
  resumo: string;
  children: React.ReactNode;
}) => (
  <section className="space-y-3">
    <button
      type="button"
      aria-expanded={aberto}
      onClick={onAlternar}
      className="w-full flex items-center gap-3 text-left min-w-0"
    >
      <ChevronDown size={14} className={`text-zinc-500 shrink-0 transition-transform ${aberto ? '' : '-rotate-90'}`} />
      <span className={ROTULO}>{titulo}</span>
      {!aberto && <span className={`${ROTULO_PEQUENO} truncate`}>{resumo}</span>}
    </button>
    <div hidden={!aberto}>{children}</div>
  </section>
);

export const BudgetEditor: React.FC<BudgetEditorProps> = ({
  budget,
  clients,
  products,
  onClose,
  onSave,
  showToast,
  refreshProducts,
  companyProfile,
}) => {
  const queryClient = useQueryClient();
  const [headerInfo, setHeaderInfo] = useState({
    serial_number: '',
    date: getTodayStr(),
    validity: 15,
    status: 'Draft' as const,
  });
  // Guarda o último prazo digitado para restaurar ao desligar "sem validade" —
  // sem isto, ligar e desligar o alternador trocaria qualquer prazo por 15
  // de novo, apagando o que a pessoa tinha escrito.
  const [validadeAnterior, setValidadeAnterior] = useState(15);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [customizations, setCustomizations] = useState<BudgetCustomization[]>([]);
  const [importandoPersonalizacao, setImportandoPersonalizacao] = useState(false);
  const [extras, setExtras] = useState<BudgetExtra[]>([]);
  /** Caminhos das fotos de referência; acompanham o pedido na conversão. */
  const [referencePhotos, setReferencePhotos] = useState<string[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentInfo, setPaymentInfo] = useState({ down_payment_percent: 50, notes: '' });
  const [delivery_time_days, setDeliveryTimeDays] = useState(20);
  // Fase 7 — plano de pagamento opcional no orçamento
  const [paymentPlan, setPaymentPlan] = useState<PlanInstallment[] | undefined>(undefined);
  /**
   * Observação geral de fábrica — interna, não sai no PDF do cliente.
   *
   * Vive em aba separada das observações comerciais porque os dois textos têm
   * leitores diferentes: um vai no papel que o cliente assina, o outro na
   * ficha que fica na mesa de corte. Num campo só, ou o recado de produção
   * vazava para o cliente, ou não era escrito para não vazar — e não chegava a
   * quem precisava dele.
   */
  const [factoryNotes, setFactoryNotes] = useState('');
  const [abaDeObservacao, setAbaDeObservacao] = useState<'cliente' | 'fabrica'>('cliente');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [showPlanModal, setShowPlanModal] = useState(false);
  // Orçamento novo abre tudo (há tudo por preencher); o existente abre
  // recolhido, porque quem volta a ele quase sempre mexe só nos itens.
  // Duplicar também é proposta nova (vem com id vazio).
  const [acabamentoAberto, setAcabamentoAberto] = useState(!budget?.id);
  const [condicoesAberto, setCondicoesAberto] = useState(!budget?.id);

  const [isSaving, setIsSaving] = useState(false);
  const [faltas, setFaltas] = useState<FaltaNoOrcamento[]>([]);
  const ordemDasFaixas = useOrdemDasFaixas();
  const corpoRef = useRef<HTMLDivElement>(null);
  // Corrigiu o que faltava: a lista some sozinha, sem esperar o próximo "salvar".
  useEffect(() => {
    if (faltas.length === 0) return;
    const ainda = faltasDoOrcamento({ clienteId: selectedClientId, itens: items, servicos: customizations });
    if (!ainda.some(f => f.campo !== 'linha')) setFaltas([]);
  }, [selectedClientId, items, customizations]); // eslint-disable-line react-hooks/exhaustive-deps
  // De onde o editor carrega: o orçamento salvo ou, depois de "Recuperar", o rascunho (auditoria C2).
  const [fonte, setFonte] = useState<Budget | null | undefined>(budget);
  useEffect(() => { setFonte(budget); }, [budget]);
  /** Init terminou: só então o estado é o "salvo" contra o qual se mede a alteração. */
  const [pronto, setPronto] = useState(false);

  // Insumos query
  const { data: insumosData } = useInsumos();
  const insumos = useMemo(() => insumosData || [], [insumosData]);

  // Cartela de cores homologada (espelha botezini.com.br/cores)
  const { data: fabricColorsData } = useQuery({
    queryKey: ['fabric_colors'],
    queryFn: () => storageService.getFabricColors(),
    staleTime: 1000 * 60 * 30,
  });
  const fabricColors = useMemo(() => fabricColorsData || [], [fabricColorsData]);

  // Histórico de preço por produto — o que já foi cobrado, de quem e quando.
  // Vem dos orçamentos porque o pedido copia o item sem o preço unitário.
  const { data: orcamentosAnteriores } = useQuery({
    queryKey: ['budgets'],
    queryFn: () => storageService.getBudgets(),
    staleTime: 1000 * 60 * 5,
  });

  // Quick Create State
  const [localClients, setLocalClients] = useState(() =>
    [...clients].sort((a, b) => a.company_name.localeCompare(b.company_name))
  );
  const [localProducts, setLocalProducts] = useState(() =>
    [...products].sort((a, b) => a.name.localeCompare(b.name))
  );
  const [localInsumos, setLocalInsumos] = useState<Insumo[]>([]);

  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState<'client' | 'product' | 'insumo'>('client');
  const [pendingItemIndex, setPendingItemIndex] = useState<number | null>(null); // For product creation linked to a specific item row

  useEffect(() => {
    setLocalClients([...clients].sort((a, b) => a.company_name.localeCompare(b.company_name)));
  }, [clients]);
  // Note: localProducts is NOT synced from props after a QuickCreate to avoid overwriting
  // the newly created item. refreshProducts() is called to update state directly.
  useEffect(() => {
    setLocalProducts([...products].sort((a, b) => a.name.localeCompare(b.name)));
  }, [products]);
  useEffect(() => {
    setLocalInsumos([...insumos].sort((a: Insumo, b: Insumo) => a.name.localeCompare(b.name)));
  }, [insumos]);

  const handleQuickCreateSuccess = (newItem: any) => {
    if (quickCreateType === 'client') {
      setLocalClients(prev => [...prev, newItem].sort((a, b) => a.company_name.localeCompare(b.company_name)));
      setSelectedClientId(newItem.id);
      showToast('Cliente criado com sucesso!', 'success');
    } else if (quickCreateType === 'product') {
      setLocalProducts(prev => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));
      if (pendingItemIndex !== null) {
        updateItem(pendingItemIndex, 'product_id', newItem.id);
        setPendingItemIndex(null);
      }
      refreshProducts?.();
      showToast('Produto criado com sucesso!', 'success');
    } else if (quickCreateType === 'insumo') {
      setLocalInsumos(prev => [...prev, newItem].sort((a: Insumo, b: Insumo) => a.name.localeCompare(b.name)));
      if (pendingItemIndex !== null) {
        // Manually update the row with the newly created Insumo (fabric)
        const newItems = [...items];
        newItems[pendingItemIndex] = {
          ...newItems[pendingItemIndex],
          fabric_insumo_id: newItem.id,
          fabric_name: newItem.name,
          fabric: newItem.name,
        };
        setItems(newItems);
        setPendingItemIndex(null);
      }
      showToast('Tecido/Insumo criado com sucesso!', 'success');
      queryClient.invalidateQueries({ queryKey: ['insumos'] });
    }
    setShowQuickCreate(false);
  };

  useEffect(() => {
    const init = async () => {
      const budget = fonte;
      if (budget) {
        setHeaderInfo({
          serial_number: budget.serial_number,
          date: budget.date,
          validity: budget.validity_days,
          status: budget.status as any,
        });
        if (budget.validity_days > 0) setValidadeAnterior(budget.validity_days);
        setSelectedClientId(budget.client_id);
        setItems(budget.items || []);
        setMaisAbertos(linhasComRaro(budget.items || []));
        setCustomizations(budget.customizations || []);
        setExtras(budget.extras || []);
        setReferencePhotos(budget.reference_photos || []);
        setDiscount(budget.discount || 0);
        setPaymentInfo({
          down_payment_percent: budget.down_payment_percent,
          notes: budget.notes || '',
        });
        setDeliveryTimeDays(budget.delivery_time_days || 20);
        setFactoryNotes(budget.factory_notes || '');
        // Orçamento antigo, só com "entrada %", abre já mostrando o plano
        // equivalente — nada é gravado até salvar. O total é a mesma conta de
        // `totals` sobre os mesmos dados: o estado ainda não assentou aqui.
        const totalAoAbrir = budgetService.calculateTotals(
          budget.items || [], budget.customizations || [], budget.extras || [], budget.discount || 0,
        ).total_amount;
        // A entrada se ancora na EMISSÃO: é contra ela que a condição decide o
        // que é entrada, e datá-la de hoje a tiraria da folga.
        setPaymentPlan(planoParaMostrar(
          budget, totalAoAbrir, budget.date || getTodayStr(),
          addBusinessDays(budget.date || getTodayStr(), budget.delivery_time_days || 20),
        ) ?? budget.payment_plan);
        setPaymentMethod(budget.payment_method || '');
      } else {
        const serial = await idService.getNextSequence('budget');
        setHeaderInfo((prev) => ({ ...prev, serial_number: serial }));
      }
      setPronto(true);
    };
    init();
  }, [fonte]);

  // ── Rascunho automático e saída protegida (auditoria C2) ──────────────────
  //
  // Fechar, dar F5 ou fechar a aba com um orçamento de 19 itens aberto perdia tudo. Agora o que
  // muda fica guardado no navegador e, ao reabrir, aparece "Recuperar"; fechar com alteração
  // pergunta antes. O "salvo" é o estado logo depois de carregar.
  const chaveRascunho = chaveDoRascunho('orcamento', budget?.id);
  const estadoEditavel = useMemo(() => ({
    id: budget?.id || '', serial_number: headerInfo.serial_number, client_id: selectedClientId,
    date: headerInfo.date, status: headerInfo.status, validity_days: headerInfo.validity,
    items, customizations, extras, reference_photos: referencePhotos, discount,
    down_payment_percent: paymentInfo.down_payment_percent, notes: paymentInfo.notes,
    delivery_time_days, factory_notes: factoryNotes, payment_plan: paymentPlan, payment_method: paymentMethod,
  }), [budget?.id, headerInfo, selectedClientId, items, customizations, extras, referencePhotos, discount,
       paymentInfo, delivery_time_days, factoryNotes, paymentPlan, paymentMethod]);
  const assinaturaAtual = useMemo(() => assinatura(estadoEditavel), [estadoEditavel]);
  const salvoRef = useRef<{ assinatura: string; estado: typeof estadoEditavel } | null>(null);
  const [oferta, setOferta] = useState<Rascunho<typeof estadoEditavel> | null>(null);
  useEffect(() => {
    if (!pronto || salvoRef.current) return;
    salvoRef.current = { assinatura: assinaturaAtual, estado: estadoEditavel };
    let guardado: string | null = null;
    try { guardado = localStorage.getItem(chaveRascunho); } catch { /* sem armazenamento */ }
    setOferta(rascunhoParaOferecer(guardado, estadoEditavel, Date.now()));
  }, [pronto, assinaturaAtual, estadoEditavel, chaveRascunho]);
  const alterado = pronto && !!salvoRef.current && assinaturaAtual !== salvoRef.current.assinatura;
  useEffect(() => {
    if (!alterado) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(chaveRascunho, JSON.stringify({ quando: Date.now(), dados: estadoEditavel })); } catch { /* cheio ou bloqueado */ }
    }, 600);
    return () => clearTimeout(t);
  }, [alterado, assinaturaAtual, chaveRascunho, estadoEditavel]);
  const apagarRascunho = () => { try { localStorage.removeItem(chaveRascunho); } catch { /* idem */ } };
  const recuperarRascunho = () => {
    if (!oferta) return;
    // Orçamento novo continua com o número que acabou de receber: o do rascunho pode já ter sido usado.
    setFonte({ ...(budget ?? {}), ...oferta.dados, serial_number: budget ? oferta.dados.serial_number : headerInfo.serial_number } as Budget);
    setOferta(null);
  };
  const saida = useSaidaProtegida(() => { apagarRascunho(); onClose(); }, alterado);

  // Um índice só para a tabela inteira: montar por linha varreria todos os
  // orçamentos uma vez por peça, sempre para chegar no mesmo resultado.
  // O orçamento aberto sai do próprio histórico — senão a caixinha devolveria
  // como referência o preço que a pessoa acabou de digitar.
  // Cadastros marcados como a mesma peça somam o histórico num só.
  const canonicos = useMemo(() => mapaDeCanonicos(localProducts), [localProducts]);

  // A lista de escolha mostra só o cadastro oficial: o apelido existe para
  // amarrar o histórico do que já foi orçado, não para ser escolhido de novo —
  // deixá-lo na lista seria continuar produzindo a duplicata que ele resolve.
  // O item que JÁ está na linha continua aparecendo, senão o produto sumiria
  // da tela ao abrir um orçamento antigo.
  const produtosParaEscolher = useMemo(() => {
    const emUso = new Set(items.map(i => i.product_id).filter(Boolean));
    return localProducts.filter(p => !p.canonical_product_id || emUso.has(p.id));
  }, [localProducts, items]);

  // Divisória por categoria: num catálogo de dezenas de peças, achar "JALECO"
  // dentro do bloco de jalecos é outra tarefa que varrer a lista inteira.
  // O item vazio fica fora de grupo, no topo — é a saída, não uma peça.
  const opcoesDeProduto = useMemo(() => [
    { value: '', label: 'SELECIONAR PRODUTO...' },
    ...agruparPorCategoria(produtosParaEscolher, p => (p.name || '').toUpperCase()),
  ], [produtosParaEscolher]);

  const opcoesDeCliente = useMemo(() => [
    { value: '', label: 'SELECIONAR CLIENTE...' },
    ...agruparPorCategoria(localClients, c =>
      `${(c.company_name || '').toUpperCase()} ${c.contact_person ? `(${c.contact_person.toUpperCase()})` : ''}`.trim()),
  ], [localClients]);

  const historicoDeProdutos = useMemo(() => {
    const nomePorId = new Map(localClients.map(c => [c.id, c.company_name]));
    return historicoPorProduto(
      (orcamentosAnteriores || []) as any,
      (id?: string) => (id && nomePorId.get(id)) || '—',
      budget?.id,
      (id: string) => canonico(id, canonicos),
    );
  }, [orcamentosAnteriores, localClients, budget?.id, canonicos]);

  // Curva de resposta ao desconto da CASA — uma só para a tabela inteira. É
  // sobre ela que a sugestão de preço é calculada: dentro de um produto,
  // preço÷tabela é só o preço noutra escala; entre produtos, o T1 absorve a
  // especificação e as orçadas viram comparáveis.
  const curvaDaCasa = useMemo(() => curvaDeDesconto(
    linhasNormalizadas(
      (orcamentosAnteriores || []) as any,
      listaPorProduto(localProducts),
      budget?.id,
    ),
  ), [orcamentosAnteriores, localProducts, budget?.id]);

  // "Cabe na semana?" — só informa, nunca trava o salvamento.
  const sim = usePcpSimulator();
  const pecasDoOrcamento = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const prazoDeEntrega = addBusinessDays(getTodayStr(), delivery_time_days || 20);
  const primeiroItem = items[0];
  const cabeNaSemana = useMemo(() => {
    if (sim.loading || sim.error || pecasDoOrcamento <= 0) return null;
    return respostaCabeNaSemana(
      sim.simulate(pecasDoOrcamento, prazoDeEntrega, undefined, primeiroItem?.color, primeiroItem?.product_name),
      prazoDeEntrega,
    );
  }, [pecasDoOrcamento, prazoDeEntrega, primeiroItem?.color, primeiroItem?.product_name, sim.simulate, sim.loading, sim.error]);

  const totals = useMemo(
    () => budgetService.calculateTotals(items, customizations, extras, discount),
    [items, customizations, extras, discount]
  );
  const payments = useMemo(
    () => budgetService.calculatePayments(totals.total_amount, paymentInfo.down_payment_percent),
    [totals.total_amount, paymentInfo.down_payment_percent]
  );

  /**
   * O plano ainda fecha com o total?
   *
   * O plano é montado uma vez e congela; o orçamento continua sendo editado.
   * Adicionar um item, dar desconto ou trocar o tecido move o total e deixa as
   * parcelas para trás — e nada avisava. O PDF saía com o total certo e um
   * plano somando outra coisa, contradição que o cliente recebe pronta.
   */
  /**
   * O grupo econômico do cliente selecionado, e quem são seus membros.
   *
   * É o recorte que dá sentido ao histórico "de dentro de casa": ao orçar para
   * uma filial, o preço que o comprador tem em mãos é o que as OUTRAS filiais
   * pagaram. Cliente sem grupo simplesmente não ganha o badge — um grupo de um
   * membro só repetiria o histórico geral fingindo ser outra informação.
   */
  const grupoDoCliente = useMemo(() => {
    const cliente = localClients.find((c: any) => c.id === selectedClientId);
    const nome = nomeDoGrupo(cliente as any);
    if (!nome) return null;
    const membros = membrosDoGrupo(nome, localClients as any);
    if (membros.length < 2) return null;
    return { nome, ids: new Set(membros.map((m: any) => m.id)) };
  }, [localClients, selectedClientId]);

  const conferenciaDoPlano = useMemo(
    () => (paymentPlan && paymentPlan.length > 0
      ? conferirPlano(paymentPlan, totals.total_amount)
      : null),
    [paymentPlan, totals.total_amount]
  );
  const planoDesatualizado = !!conferenciaDoPlano && !conferenciaDoPlano.confere;
  // O aviso de plano desatualizado mora em Condições: recolhido, ninguém o veria.
  useEffect(() => {
    if (planoDesatualizado) setCondicoesAberto(true);
  }, [planoDesatualizado]);

  /** Reescala mantendo a proporção: 50/50 continua 50/50, 30/60/90 idem. */
  const ajustarPlanoAoTotal = () => {
    if (!paymentPlan || paymentPlan.length === 0) return;
    setPaymentPlan(reescalarPlano(paymentPlan, totals.total_amount));
  };

  /** Devolve false quando a validação recusou salvar (o Ctrl+S usa isso para devolver o foco). */
  const handleSave = async (): Promise<boolean> => {
    // Tudo o que falta, de uma vez, no topo do editor; o campo do cliente fica marcado (auditoria R2).
    // Barram o salvar só cliente e itens (como antes); problemas de linha vão junto na lista.
    const faltas = faltasDoOrcamento({ clienteId: selectedClientId, itens: items, servicos: customizations });
    if (faltas.some(f => f.campo !== 'linha')) {
      setFaltas(faltas);
      corpoRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    }
    setFaltas([]);
    setIsSaving(true);
    try {
      // Fonte única: se há plano, entrada/saldo derivam DELE (a 1ª parcela é a
      // entrada), evitando o conflito com o campo "Entrada Mínima %".
      const hasPlan = !!paymentPlan && paymentPlan.length > 0;
      const planEntrada = hasPlan ? (paymentPlan![0].amount || 0) : payments.down_payment_value;
      const planSaldo = hasPlan
        ? paymentPlan!.slice(1).reduce((s, p) => s + (p.amount || 0), 0)
        : payments.delivery_payment_value;
      const effDownPercent = hasPlan && totals.total_amount > 0
        ? Math.round((planEntrada / totals.total_amount) * 100)
        : paymentInfo.down_payment_percent;
      const payload: Budget = {
        id: budget?.id || '',
        serial_number: headerInfo.serial_number,
        client_id: selectedClientId,
        date: headerInfo.date,
        items,
        customizations,
        extras,
        reference_photos: referencePhotos,
        subtotal_items: totals.subtotal_items,
        subtotal_customizations: totals.subtotalCustom,
        subtotal_extras: totals.subtotal_extras,
        discount,
        total_amount: totals.total_amount,
        down_payment_percent: effDownPercent,
        down_payment_value: planEntrada,
        delivery_payment_value: planSaldo,
        validity_days: headerInfo.validity,
        delivery_time_days,
        notes: paymentInfo.notes,
        factory_notes: factoryNotes.trim() || undefined,
        status: headerInfo.status,
        payment_plan: paymentPlan,
        payment_method: paymentMethod || undefined,
      };
      await onSave(payload);
      apagarRascunho();
    } catch (e: any) {
      // Sem isto o botão ficava em "salvando" para sempre e só restava descartar.
      showToast(mensagemDeErro(e, 'Não consegui salvar o orçamento.'), 'error');
      return false;
    } finally {
      setIsSaving(false);
    }
    return true;
  };

  // Ctrl+S salva. O ouvinte fica registrado uma vez e lê o handleSave da vez
  // pela ref — senão salvaria o estado do primeiro render.
  const salvarRef = useRef(handleSave);
  salvarRef.current = handleSave;
  const isSavingRef = useRef(isSaving);
  isSavingRef.current = isSaving;
  // Com uma janela aberta, Ctrl+S não é do orçamento: salvaria o plano velho e
  // fecharia o editor, perdendo o rascunho que a janela ainda não confirmou.
  const janelaAbertaRef = useRef(false);
  janelaAbertaRef.current = showPlanModal || showQuickCreate || importandoPersonalizacao;
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.defaultPrevented || janelaAbertaRef.current) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        // Tira o foco antes: o campo de entrada % só aplica ao sair dele, e o
        // salvar do próximo tique já lê o handleSave do render com o plano novo.
        const foco = document.activeElement as HTMLElement | null;
        foco?.blur();
        setTimeout(async () => {
          // Validação recusou: a pessoa continua editando onde estava.
          if (!isSavingRef.current && (await salvarRef.current()) === false) foco?.focus();
        }, 0);
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  const updateItem = (index: number, field: keyof BudgetItem, value: any) => {
    const newItems = [...items];
    const item = { ...newItems[index] };
    if (field === 'product_id') {
      // Use localProducts to include quick-created products
      const prod = localProducts.find((p) => p.id === value);
      if (prod) {
        item.product_id = prod.id;
        item.unit_price = prod.price_tier1 || 0;
        item.model = '';

        // O nome padrão já carrega manga/gênero/modelagem/faixa. Aqui elas
        // saem do texto e vão para os campos próprios da linha — senão a mesma
        // característica apareceria duas vezes, e as duas cópias poderiam
        // divergir quando alguém alterasse só uma.
        const attr = interpretarNomeProduto(prod.name);
        item.product_name = nomePrincipal(prod.name);
        // Só preenche o que está vazio: o que o usuário já escolheu manda.
        if (item.sleeve_type === undefined && attr.manga) item.sleeve_type = attr.manga;
        if (item.gender === undefined && attr.genero) item.gender = attr.genero;
        if (item.fit === undefined && attr.modelagem) item.fit = attr.modelagem;
        if (item.has_band === undefined && attr.faixaRefletiva) item.has_band = true;
      }
    } else {
      (item as any)[field] = value;
    }
    item.total = round2((item.quantity || 0) * (item.unit_price || 0));
    newItems[index] = item;
    setItems(newItems);

    // Ficha técnica → orçamento: se o produto tem tecido cadastrado na BOM e a
    // linha ainda não tem tecido escolhido, pré-preenche (adianta o trabalho).
    if (field === 'product_id' && value && !item.fabric_insumo_id) {
      autoFillFabricFromBOM(index, value);
    }
  };

  const autoFillFabricFromBOM = async (index: number, productId: string) => {
    try {
      const bom = await storageService.getProductInsumos(productId);
      if (!bom || bom.length === 0) return;
      // Mesmo critério do dropdown de tecido: sem categoria ou categoria "Tecidos/Tecido".
      const fabricInsumo = bom
        .map(b => insumos.find((i: Insumo) => i.id === b.insumo_id))
        .find((ins?: Insumo) => ins && (!ins.category || ['tecidos', 'tecido'].includes(ins.category.toLowerCase())));
      if (!fabricInsumo) return;
      setItems(prev => {
        // Guarda: só aplica se a linha ainda for do mesmo produto e continuar sem tecido.
        if (prev[index]?.product_id !== productId || prev[index]?.fabric_insumo_id) return prev;
        const next = [...prev];
        next[index] = {
          ...next[index],
          fabric_insumo_id: fabricInsumo.id,
          fabric_name: fabricInsumo.name,
          fabric: fabricInsumo.name,
          // Agora que se sabe QUAL é o tecido, ele também sai do nome — sozinho
          // no texto não dava para distingui-lo do nome da peça ("Jaleco
          // Oxford" tanto pode ser peça+tecido quanto o nome inteiro da peça).
          product_name: nomePrincipal(next[index].product_name, [
            fabricInsumo.fabric_family || '', fabricInsumo.name,
          ]),
        };
        return next;
      });
    } catch (e) {
      console.warn('Auto-preenchimento de tecido a partir da ficha técnica falhou:', e);
    }
  };

  const handleCloneItem = (index: number) => {
    const itemToClone = items[index];
    const clonedItem = { ...itemToClone };
    const newItems = [...items];
    newItems.splice(index + 1, 0, clonedItem);
    setItems(newItems);
    esquecerIndices(newItems);
  };

  // A lista deslocou: painel ou barra presos a um índice apontariam para outra linha.
  // O "+ mais" se refaz pela lista nova, para a linha com valor raro continuar aberta.
  const esquecerIndices = (novos: BudgetItem[]) => {
    setGradeAberta(null);
    setCopiando(null);
    setExpandedSpecRows(new Set());
    setMaisAbertos(linhasComRaro(novos));
  };

  // Copiar especificação: uma linha de origem, os grupos marcados, as linhas de destino.
  const [copiando, setCopiando] = useState<{ origem: number; grupos: GrupoCopiavel[]; destinos: Set<number> } | null>(null);
  const alternarDestino = (k: number) => setCopiando(c => {
    if (!c) return c;
    const d = new Set(c.destinos);
    if (d.has(k)) d.delete(k); else d.add(k);
    return { ...c, destinos: d };
  });
  const alternarGrupo = (g: GrupoCopiavel) => setCopiando(c => c && {
    ...c, grupos: c.grupos.includes(g) ? c.grupos.filter(x => x !== g) : [...c.grupos, g],
  });
  // "todas" marca todas menos a origem; se já estão todas, desmarca.
  const alternarTodas = () => setCopiando(c => {
    if (!c) return c;
    const outras = items.map((_, k) => k).filter(k => k !== c.origem);
    return { ...c, destinos: new Set(outras.every(k => c.destinos.has(k)) ? [] : outras) };
  });
  const aplicarCopia = () => {
    if (!copiando) return;
    const n = copiando.destinos.size;
    const novos = items.map((it, k) => copiando.destinos.has(k) ? copiarEspecificacao(items[copiando.origem], it, copiando.grupos) : it);
    setItems(novos);
    // O raro que chegou pela cópia também abre o "+ mais" do destino.
    setMaisAbertos(prev => new Set([...prev, ...linhasComRaro(novos)]));
    setCopiando(null);
    showToast(`${n} ${n === 1 ? 'item atualizado' : 'itens atualizados'}`, 'success');
  };
  // Esc fecha a barra sem mudar nada — menos com janela aberta, que tem o Esc dela (como o Ctrl+S).
  const copiandoAberto = !!copiando;
  useEffect(() => {
    if (!copiandoAberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !janelaAbertaRef.current) setCopiando(null);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [copiandoAberto]);

  // Grade: "P 10, M 20, G 15" vira uma linha por tamanho, no lugar da linha de origem.
  const [gradeAberta, setGradeAberta] = useState<number | null>(null);
  const [gradeTexto, setGradeTexto] = useState('');
  const [gradeErro, setGradeErro] = useState('');
  const abrirGrade = (i: number) => {
    setGradeTexto('');
    setGradeErro('');
    setGradeAberta(gradeAberta === i ? null : i);
  };
  const aplicarGrade = (i: number) => {
    const r = lerGrade(gradeTexto);
    if (!r.ok) { setGradeErro(r.erro); return; }
    const item = items[i];
    const linhas = r.tamanhos.map(t => ({
      ...item, size: t.size, quantity: t.quantity, total: round2(t.quantity * (item.unit_price || 0)),
    }));
    const novos = [...items.slice(0, i), ...linhas, ...items.slice(i + 1)];
    setItems(novos);
    esquecerIndices(novos);
    const pecas = r.tamanhos.reduce((s, t) => s + t.quantity, 0);
    showToast(`${linhas.length} ${linhas.length === 1 ? 'linha' : 'linhas'} · ${pecas} peças`, 'success');
  };

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, _index: number) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newItems = [...items];
    const [movedItem] = newItems.splice(draggedIndex, 1);
    newItems.splice(index, 0, movedItem);
    setItems(newItems);
    setDraggedIndex(null);
    esquecerIndices(newItems);
  };

  // ── Tecido + cor ───────────────────────────────────────────────────────────
  // O tecido tem 3 faixas de preço por cor (Branco / Padrão / Especial). O
  // usuário NÃO escolhe a faixa: ele escolhe a cor da cartela e a faixa é
  // resolvida sozinha. Por isso o dropdown de tecido só lista a faixa Padrão
  // (mais a que já estiver na linha, para não sumir da tela).
  const isFabricCat = (i: Insumo) =>
    !i.category || ['tecidos', 'tecido'].includes(i.category.toLowerCase());

  // Um item por tecido no seletor (v3.1: faixas livres, até 6). Fica a faixa "Padrão" quando
  // existe — é o preço-base de sempre dos tecidos antigos —; senão a de menor nome.
  const representantes = useMemo(() => {
    const porFamilia = new Map<string, Insumo>();
    const peso = (i: Insumo) => (i.color_tier === 'Padrão' ? 0 : 1);
    for (const i of localInsumos) {
      if (!i.fabric_family || i.canonical_insumo_id) continue;
      const atual = porFamilia.get(i.fabric_family);
      if (!atual || peso(i) < peso(atual) || (peso(i) === peso(atual) && (i.name || '') < (atual.name || ''))) porFamilia.set(i.fabric_family, i);
    }
    return new Set([...porFamilia.values()].map(i => i.id));
  }, [localInsumos]);

  const fabricOptionsFor = (currentId?: string) => [
    { value: '', label: 'Tecido livre...' },
    ...localInsumos
      .filter(isFabricCat)
      .filter((i: Insumo) => !i.fabric_family || representantes.has(i.id) || i.id === currentId)
      .map((i: Insumo) => ({
        value: i.id,
        label: (i.fabric_family || i.name).toUpperCase(),
      })),
  ];

  // Cores homologadas do tecido da linha. null = tecido sem cartela → texto livre.
  const colorOptionsFor = (fabricInsumoId?: string) => {
    const family = localInsumos.find((i: Insumo) => i.id === fabricInsumoId)?.fabric_family;
    if (!family) return null;
    const cores = fabricColors.filter(c => c.fabric_family === family);
    if (cores.length === 0) return null;

    const opts: { value: string; label: string; swatch?: string; isHeader?: boolean }[] = [];
    // As faixas na ordem da tabela de preços (1..6); faixa ainda sem tabela vai no fim, na ordem da cartela.
    const posicao = (tier: string) => Math.min(...cores.filter(c => c.color_tier === tier).map(c => (c.faixa_id && ordemDasFaixas.get(c.faixa_id)) || 99));
    for (const tier of [...new Set(cores.map(c => c.color_tier))].sort((a, b) => posicao(a) - posicao(b))) {
      const doTier = cores.filter(c => c.color_tier === tier);
      if (doTier.length === 0) continue;
      opts.push({ value: `__h_${tier}`, label: `Faixa ${tier}`, isHeader: true });
      for (const c of doTier) {
        // Caixa alta no VALOR, não só no rótulo: é assim que a cor é gravada
        // no item, e é por igualdade de valor que o seletor reencontra a opção.
        const nome = c.color_name.toUpperCase();
        opts.push({ value: nome, label: nome, swatch: c.hex });
      }
    }
    return opts;
  };

  // Escolher a cor troca o insumo para a faixa de preço correspondente.
  const handleColorPick = (index: number, colorName: string) => {
    setItems(prev => {
      const next = [...prev];
      const item = { ...next[index], color: colorName.toUpperCase() };
      const family = localInsumos.find((i: Insumo) => i.id === item.fabric_insumo_id)?.fabric_family;
      const cor = family
        // Sem caixa: o valor que chega do seletor já vem em maiúsculas, e o
        // banco guarda a cor como foi cadastrada. Comparar cru fazia a troca de
        // faixa de preço falhar em silêncio.
        ? fabricColors.find(c => c.fabric_family === family
            && c.color_name.toUpperCase() === (colorName || '').toUpperCase())
        : undefined;
      if (cor) {
        const target = localInsumos.find(
          (i: Insumo) => i.fabric_family === family && i.color_tier === cor.color_tier);
        if (target && target.id !== item.fabric_insumo_id) {
          item.fabric_insumo_id = target.id;
          item.fabric_name = target.name;
          item.fabric = target.name;
        }
      }
      next[index] = item;
      return next;
    });
  };

  // Faixa atual da linha — mostrada só quando não é a do preço-base (o representante
  // do tecido no seletor), para o usuário saber que aquele item saiu dele.
  const tierBadgeFor = (fabricInsumoId?: string) => {
    const ins = localInsumos.find((i: Insumo) => i.id === fabricInsumoId);
    return ins?.color_tier && !representantes.has(ins.id) ? ins.color_tier : null;
  };

  // ── Peças do conjunto ──────────────────────────────────────────────────
  //
  // Mexem numa lista dentro do item, então cada uma reescreve o array inteiro:
  // mutar em cima do estado deixaria o React sem enxergar a mudança.
  const mexerNosComponentes = (
    linha: number,
    f: (atual: ItemComponent[]) => ItemComponent[],
  ) => setItems(prev => {
    const next = [...prev];
    next[linha] = { ...next[linha], components: f(next[linha].components || []) };
    return next;
  });

  /**
   * Catálogo ou nome livre? A resposta vem do próprio dado, não de um estado
   * paralelo: `name` definido (mesmo vazio) significa que o usuário optou por
   * digitar. Uma peça recém-criada nasce sem `name` e por isso cai no seletor.
   *
   * A primeira versão guardava as peças livres num Set com chave "linha:índice".
   * Remover a peça 1 fazia a 2 virar 1 e herdar a marcação da vizinha — e ao
   * reabrir o orçamento a marcação não existia mais.
   */
  const pecaEhLivre = (c: ItemComponent) => !c.product_id && c.name !== undefined;

  /**
   * Escolher a peça no catálogo traz nome e tecido padrão prontos.
   *
   * O conjunto quase sempre é feito de peças que a casa já vende soltas — o
   * jaleco do conjunto é o mesmo jaleco do catálogo. Herdar evita redigitar e,
   * mais importante, mantém o mesmo vocabulário do resto do sistema: "JALECO"
   * escrito à mão em cinco orçamentos vira cinco peças diferentes na busca.
   */
  const escolherProdutoDaPeca = (linha: number, comp: number, productId: string) =>
    mexerNosComponentes(linha, atual => atual.map((c, k) => {
      if (k !== comp) return c;
      const p = localProducts.find(x => x.id === productId);
      if (!p) return c;
      const tecido = p.default_fabric_insumo_id
        ? localInsumos.find((x: Insumo) => x.id === p.default_fabric_insumo_id)
        : undefined;
      return {
        ...c,
        product_id: p.id,
        name: p.name.toUpperCase(),
        // Só preenche o tecido se a peça ainda não tinha um: trocar de produto
        // não pode apagar uma escolha que o usuário já fez de propósito.
        fabric_insumo_id: c.fabric_insumo_id || tecido?.id,
        fabric_name: c.fabric_name || (tecido ? (tecido.fabric_family || tecido.name) : undefined),
      };
    }));

  const adicionarComponente = (linha: number) =>
    mexerNosComponentes(linha, atual => [...atual, {}]);

  const removerComponente = (linha: number, comp: number) =>
    mexerNosComponentes(linha, atual => atual.filter((_, k) => k !== comp));

  const atualizarComponente = (
    linha: number, comp: number, campo: keyof ItemComponent, valor: string,
  ) => mexerNosComponentes(linha, atual =>
    atual.map((c, k) => (k === comp ? { ...c, [campo]: valor } : c)));

  /**
   * Trocar o tecido da peça guarda também o nome, porque a ficha de corte e o
   * PDF leem `fabric_name` — sem ele o enfesto sairia sem tecido. A cor é
   * limpa: cartela nova, cor antiga não existe mais.
   */
  const trocarTecidoDoComponente = (linha: number, comp: number, insumoId: string) =>
    mexerNosComponentes(linha, atual => atual.map((c, k) => {
      if (k !== comp) return c;
      const ins = localInsumos.find((x: Insumo) => x.id === insumoId);
      return {
        ...c,
        fabric_insumo_id: insumoId || undefined,
        fabric_name: ins ? (ins.fabric_family || ins.name) : undefined,
        color: '',
      };
    }));

  // Per-row expanded spec panel state
  const [expandedSpecRows, setExpandedSpecRows] = useState<Set<number>>(new Set());
  const toggleSpecRow = (i: number) => setExpandedSpecRows(prev => {
    const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n;
  });
  // "+ mais" de cada linha: abre sozinho com valor raro gravado e daí só o botão fecha.
  const [maisAbertos, setMaisAbertos] = useState<Set<number>>(new Set());
  const alternarMais = (i: number) => setMaisAbertos(prev => {
    const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n;
  });

  const temPlano = !!paymentPlan && paymentPlan.length > 0;
  const referenciaDaEntrada = headerInfo.date || getTodayStr();
  // Rodapé e resumo leem a condição como o PDF e a mensagem a leem — entrada é
  // o que vence na confirmação, não "a 1ª parcela" —, senão a tela diria
  // "entrada" num 30/60 que o cliente vai receber como duas parcelas. Só
  // exibição: o que se grava continua saindo do handleSave.
  const condicao = descreverCondicao({
    date: headerInfo.date,
    total_amount: totals.total_amount,
    payment_plan: paymentPlan,
    down_payment_value: payments.down_payment_value,
    delivery_payment_value: payments.delivery_payment_value,
  }, getTodayStr());
  const entradaPct = entradaPctDoPlano(paymentPlan, totals.total_amount, referenciaDaEntrada);

  // Texto próprio no campo de entrada %: o plano só é refeito ao sair do campo
  // (ou Enter). Refazer a cada tecla transformava o "3" de "30" num plano de 3%.
  // Sem plano, o campo mostra a entrada que o rodapé já usa (50% no orçamento
  // novo) — senão o campo vazio e o rodapé diriam coisas diferentes.
  const entradaNoCampo = temPlano ? entradaPct : paymentInfo.down_payment_percent;
  const [entradaTexto, setEntradaTexto] = useState('');
  useEffect(() => {
    setEntradaTexto(entradaNoCampo > 0 ? String(entradaNoCampo) : '');
  }, [entradaNoCampo]);
  const aplicarEntradaDigitada = () => {
    const v = parseFloat(entradaTexto);
    // Vazio não monta nada: apagar não pode virar uma entrada de 1%. E o mesmo
    // número de antes também não: o campo mostra o % arredondado, e reaplicá-lo
    // só por passar pelo campo trocaria 333,33 por 330,00 e reescalaria o saldo.
    if (!v || v === entradaNoCampo || totals.total_amount <= 0) {
      setEntradaTexto(entradaNoCampo > 0 ? String(entradaNoCampo) : '');
      return;
    }
    const novo = aplicarEntrada({
      plano: paymentPlan,
      total: totals.total_amount,
      entradaPct: v,
      hoje: referenciaDaEntrada,
      entrega: prazoDeEntrega,
      metodo: paymentMethod || undefined,
    });
    setPaymentPlan(novo);
    setEntradaTexto(String(entradaPctDoPlano(novo, totals.total_amount, referenciaDaEntrada)));
  };

  const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const resumoDoAcabamento = [
    customizations.length > 0 && contar(customizations.length, 'personalização', 'personalizações'),
    extras.length > 0 && contar(extras.length, 'extra', 'extras'),
    referencePhotos.length > 0 && contar(referencePhotos.length, 'foto', 'fotos'),
  ].filter(Boolean).join(' · ') || 'nada ainda';
  const prazoNoResumo = `prazo ${contar(delivery_time_days, 'dia', 'dias')}`;
  const resumoDasCondicoes = !temPlano
    ? `${paymentInfo.down_payment_percent > 0 ? `entrada ${paymentInfo.down_payment_percent}% · ` : ''}sem parcelas · ${prazoNoResumo}`
    : condicao.entrada > 0
      ? `entrada ${entradaPct}% + ${contar(condicao.parcelas.filter(p => !p.naConfirmacao).length, 'parcela', 'parcelas')} · ${prazoNoResumo}`
      : `${contar(condicao.parcelas.length, 'parcela', 'parcelas')} · ${prazoNoResumo}`;

  return createPortal(
    <div className="fixed inset-0 bg-zinc-950 flex flex-col z-modal ease-out animate-in fade-in duration-200">
      {/* ── CABEÇALHO ── Como na v2 (pedido do Luiz, 09/10): quem é o cliente, a data, a validade e o
          "Finalizar proposta" ficam no topo, sempre à vista. Quebra em linhas no celular em vez de espremer. */}
      <div className="border-b border-zinc-800/50 bg-zinc-900/50 backdrop-blur-md flex flex-wrap lg:flex-nowrap items-center gap-x-4 gap-y-2 px-4 md:px-6 py-3 shrink-0 relative z-20">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <button
            onClick={saida.pedirParaFechar}
            aria-label="Fechar o editor"
            title="Fechar (pergunta antes se houver alteração)"
            className="text-zinc-500 hover:text-white transition-colors p-2 rounded-xl hover:bg-zinc-800 border border-transparent hover:border-zinc-700"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white uppercase tracking-tighter leading-none whitespace-nowrap">
                {headerInfo.serial_number}
              </h2>
              <span className="hidden sm:inline-block text-[10px] font-black uppercase tracking-widest bg-amber-500 text-black px-2 py-0.5 rounded-lg whitespace-nowrap">
                {budget?.id ? 'Editando proposta' : 'Nova proposta'}
              </span>
            </div>
            <p className={`${ROTULO_PEQUENO} mt-1`}>Editor de orçamentos</p>
          </div>
        </div>

        <div className={`${ITEM} flex flex-wrap items-center gap-y-2 py-1 flex-1 min-w-0 order-last lg:order-none basis-full lg:basis-auto`}>
              <div className="flex items-center gap-2 px-3 border-r border-zinc-800/50 h-10 min-w-0">
                <User size={18} className="text-zinc-600 shrink-0" />
                {/* Largura elástica com piso: o campo encolhe até 160 px quando o
                    nome é longo, em vez de exigir 280 px e estourar a barra. */}
                <div className={`min-w-[160px] w-[240px] max-w-full rounded-xl ${faltas.some(f => f.campo === 'cliente') ? 'ring-2 ring-rose-500/70' : ''}`}>
                  <SearchableSelect
                    value={selectedClientId}
                    onChange={(val) => setSelectedClientId(val)}
                    options={opcoesDeCliente}
                    placeholder="PROCURAR CLIENTE..."
                    className="text-[10px] font-black uppercase tracking-widest"
                  />
                </div>
                <button
                  onClick={() => { setQuickCreateType('client'); setShowQuickCreate(true); }}
                  className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 hover:text-amber-500 hover:border-amber-500/30 transition-all active:scale-90"
                  title="Novo Cliente"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2 px-3 border-r border-zinc-800/50 h-10">
                <Calendar size={18} className="text-zinc-600" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-zinc-700 uppercase tracking-tighter">Data de Emissão</span>
                  <input
                    type="date"
                    value={headerInfo.date}
                    onChange={(e) => setHeaderInfo({ ...headerInfo, date: e.target.value })}
                    className="bg-transparent text-xs font-black text-zinc-300 outline-none w-36 uppercase tracking-widest cursor-pointer hover:text-amber-500 transition-colors"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 h-10">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-zinc-700 uppercase tracking-tighter">Validade</span>
                  <div className="flex items-center gap-1.5">
                    {headerInfo.validity > 0 ? (
                      <>
                        <input
                          type="number"
                          value={headerInfo.validity}
                          onChange={(e) =>
                            setHeaderInfo({ ...headerInfo, validity: parseInt(e.target.value) || 0 })
                          }
                          className="bg-transparent text-xs font-black text-amber-500 outline-none w-8 text-center border-b border-transparent focus:border-amber-500/30 transition-all"
                        />
                        <span className="text-[10px] font-black text-zinc-600 uppercase">DIAS</span>
                      </>
                    ) : (
                      <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest whitespace-nowrap">
                        Sem validade
                      </span>
                    )}
                    {/* Zero é a sentinela de "sem validade" — alguns órgãos públicos
                        exigem proposta assim, porque um prazo a venceria antes do
                        processo de licitação terminar. */}
                    <button
                      type="button"
                      onClick={() => {
                        if (headerInfo.validity > 0) {
                          setValidadeAnterior(headerInfo.validity);
                          setHeaderInfo({ ...headerInfo, validity: 0 });
                        } else {
                          setHeaderInfo({ ...headerInfo, validity: validadeAnterior || 15 });
                        }
                      }}
                      title={headerInfo.validity > 0
                        ? 'Marcar como sem validade — para licitações que exigem proposta sem prazo'
                        : 'Voltar a ter prazo de validade'}
                      className={`p-1 rounded-lg transition-colors shrink-0 ${headerInfo.validity > 0
                        ? 'text-zinc-700 hover:text-emerald-500 hover:bg-emerald-500/10'
                        : 'text-emerald-500 bg-emerald-500/10'}`}
                    >
                      <InfinityIcon size={13} />
                    </button>
                  </div>
                </div>
              </div>
        </div>

        <button type="button" onClick={handleSave} disabled={isSaving} className={`${BOTAO_PRINCIPAL} ml-auto shrink-0`}>
          <Save size={14} />
          {isSaving ? 'Salvando...' : budget?.id ? 'Salvar proposta' : 'Finalizar proposta'}
        </button>
      </div>

      {saida.confirmacao}
      <div ref={corpoRef} className="flex-1 overflow-y-auto bg-zinc-950 p-4 md:px-6 custom-scrollbar">
        <div className="w-full min-w-0 space-y-6 pb-6">
          {faltas.length > 0 && (
            <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
              <p className="text-sm font-bold text-rose-300">Para salvar, falta:</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-rose-200/90">
                {faltas.map(f => <li key={f.texto}>{f.texto}</li>)}
              </ul>
            </div>
          )}
          {oferta && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <p className="text-sm text-amber-200">
                Há alterações neste orçamento que não foram salvas, de {new Date(oferta.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={recuperarRascunho} className={BOTAO_PRINCIPAL}>Recuperar</button>
                <button type="button" onClick={() => { apagarRascunho(); setOferta(null); }} className={BOTAO_SECUNDARIO}>Descartar</button>
              </div>
            </div>
          )}
          {/* ── ITENS ── */}
          <section className="space-y-3 min-w-0">
            <h3 className={ROTULO}>Itens</h3>
            <SectionHeader
              title="Itens de Produção"
              onAdd={() =>
                setItems([
                  ...items,
                  {
                    product_id: '',
                    product_name: '',
                    model: '',
                    fabric: '',
                    fabric_insumo_id: '',
                    fabric_name: '',
                    color: '',
                    size: 'M',
                    quantity: 10,
                    unit_price: 0,
                    total: 0,
                  },
                ])
              }
            />
            {/* Mensagens do orçamento — ficam acima dos itens porque é aqui que se
                descobre o que ainda falta perguntar ao cliente. */}
            {(() => {
              const cliente = clients.find(c => c.id === selectedClientId);
              const semTamanho = items.some(i => i.product_id && !i.size);
              const temPersonalizacao = (customizations || []).length > 0;
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  <BotaoMensagem
                    titulo="Levantamento da peça"
                    rotulo="Msg: levantamento"
                    telefone={cliente?.phone}
                    texto={msgLevantamento(cliente || {})}
                  />
                  {/* Só oferece cobrar a grade quando de fato falta tamanho —
                      senão você mandaria pedir o que já tem. */}
                  {semTamanho && (
                    <BotaoMensagem
                      titulo="Cobrar grade de tamanhos"
                      rotulo="Msg: cobrar grade"
                      telefone={cliente?.phone}
                      texto={msgCobrarGrade(cliente || {})}
                    />
                  )}
                  {temPersonalizacao && (
                    <BotaoMensagem
                      titulo="Aprovação da arte"
                      rotulo="Msg: aprovar arte"
                      telefone={cliente?.phone}
                      texto={msgAprovacaoDeArte(cliente || {})}
                    />
                  )}
                </div>
              );
            })()}

            {/* ── Copiar especificação ── */}
            {copiando && (
              <div className={`${ITEM} p-3 flex flex-wrap items-center gap-3`}>
                <p className="text-xs text-zinc-300">
                  Copiando de: <span className="font-black">{items[copiando.origem]?.product_name || 'item sem produto'}</span> (linha {copiando.origem + 1})
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  {GRUPOS_COPIAVEIS.map(([g, rotulo]) => (
                    <label key={g} className="flex items-center gap-1 text-[11px] text-zinc-400">
                      <input type="checkbox" className="accent-amber-500" checked={copiando.grupos.includes(g)} onChange={() => alternarGrupo(g)} />
                      {rotulo}
                    </label>
                  ))}
                </div>
                <button type="button" onClick={alternarTodas} className={pilula(false)}>todas</button>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={aplicarCopia}
                    disabled={copiando.destinos.size === 0 || copiando.grupos.length === 0}
                    className={BOTAO_PRINCIPAL}
                  >
                    Aplicar em {copiando.destinos.size} {copiando.destinos.size === 1 ? 'item' : 'itens'}
                  </button>
                  <button type="button" onClick={() => setCopiando(null)} className={BOTAO_SECUNDARIO}>Cancelar</button>
                </div>
              </div>
            )}

            {/* ── ITEMS TABLE ── Largura mínima: abaixo de 960px as 12 colunas viravam fiapos ilegíveis.
                Com o piso, só esta faixa rola para o lado (o resto do editor não); listas e balões saem em portal, então não são cortados. */}
            <div className="overflow-x-auto min-w-0 pb-1 custom-scrollbar">
            <div className={`${CARTAO} relative min-w-[960px]`}>
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/10 to-transparent"></div>

              <div className={`grid grid-cols-12 gap-px bg-zinc-950/50 border-b border-zinc-800/50 ${ROTULO_PEQUENO} text-center`}>
                <div className="col-span-4 py-4 text-left pl-6">PRODUTO / REFERÊNCIA</div>
                <div className="col-span-1 py-4">MODELO/REF</div>
                <div className="col-span-2 py-4 text-left pl-4">TECIDO SELECIONADO</div>
                <div className="col-span-1 py-4">COR</div>
                <div className="col-span-1 py-4">TAM</div>
                <div className="col-span-1 py-4 text-amber-500/80">QTD</div>
                <div className="col-span-1 py-4 text-right">UNIT (R$)</div>
                <div className="col-span-1 py-4 text-right pr-6">TOTAL (R$)</div>
              </div>
              {items.length > 0 ? (
                <div className="divide-y divide-zinc-800/50">
                  {items.map((item, i) => (
                    <div key={i}>
                      {/* ── Main row ── */}
                      <div
                        className={`grid grid-cols-12 gap-px items-center hover:bg-zinc-900/60 transition-all group relative ${draggedIndex === i ? 'opacity-30' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, i)}
                        onDragOver={(e) => handleDragOver(e, i)}
                        onDrop={(e) => handleDrop(e, i)}
                      >
                        <div className="absolute top-0 left-0 w-1 h-full bg-transparent group-hover:bg-amber-500/50 transition-colors"></div>

                        {/* Drag Handle */}
                        <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all cursor-grab active:cursor-grabbing text-zinc-700 hover:text-amber-500">
                          <GripVertical size={14} />
                        </div>

                        <div className="col-span-4 p-2 flex gap-2 pl-5 min-w-0">
                          {copiando && copiando.origem !== i && (
                            <input
                              type="checkbox"
                              aria-label={`Copiar para a linha ${i + 1}`}
                              className="accent-amber-500 self-center shrink-0"
                              checked={copiando.destinos.has(i)}
                              onChange={() => alternarDestino(i)}
                            />
                          )}
                          <div className="flex-1 relative min-w-0">
                            <SearchableSelect
                              value={item.product_id}
                              onChange={(val) => updateItem(i, 'product_id', val)}
                              options={opcoesDeProduto}
                              placeholder="PRODUTO..."
                              className="text-[10px] font-black uppercase tracking-widest"
                            />
                            {item.product_id && (() => {
                              const doProduto = historicoDeProdutos.get(canonico(item.product_id, canonicos)) || [];
                              const cadastro = localProducts.find(p => p.id === item.product_id);
                              return (
                                // Os dois lado a lado: a faixa da casa e a do
                                // grupo do cliente. Lidos juntos, dizem se o preço
                                // que se vai propor está em pé dentro e fora da
                                // relação — que é a comparação que a negociação usa.
                                <div className="flex items-stretch gap-1.5">
                                  <HistoricoProdutoBadge
                                    vendas={doProduto}
                                    precoAtual={item.unit_price}
                                    produto={cadastro}
                                    curva={curvaDaCasa}
                                    onUsarPreco={(preco) => updateItem(i, 'unit_price', preco)}
                                  />
                                  {grupoDoCliente && (
                                    <HistoricoProdutoBadge
                                      escopo="grupo"
                                      nomeDoGrupo={grupoDoCliente.nome}
                                      vendas={vendasDeClientes(doProduto, grupoDoCliente.ids)}
                                      precoAtual={item.unit_price}
                                      curva={curvaDaCasa}
                                    />
                                  )}
                                  {/* O terceiro olha para o outro lado: os dois
                                      primeiros dizem por quanto já se vendeu, este
                                      diz por quanto NÃO dá para vender. O tecido
                                      vem da própria linha — trocá-lo muda o custo,
                                      e é aqui que a troca acontece. */}
                                  <CustoDaPecaBadge
                                    produto={cadastro}
                                    tecido={item.fabric_insumo_id
                                      ? localInsumos.find((ins: Insumo) => ins.id === item.fabric_insumo_id)
                                      : null}
                                    precoAtual={item.unit_price}
                                    companyProfile={companyProfile}
                                  />
                                </div>
                              );
                            })()}
                          </div>
                          <button
                            onClick={() => { setQuickCreateType('product'); setPendingItemIndex(i); setShowQuickCreate(true); }}
                            className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-600 hover:text-amber-500 hover:border-amber-500/30 transition-all active:scale-90"
                            title="Novo Produto"
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        <div className="col-span-1 p-2">
                          <input
                            placeholder="MODELO..."
                            value={item.model}
                            onChange={(e) => updateItem(i, 'model', e.target.value.toUpperCase())}
                            className="w-full bg-zinc-950/50 text-zinc-200 text-[10px] font-black uppercase tracking-widest p-2 rounded-lg outline-none border border-zinc-800 hover:border-zinc-700 focus:border-amber-500/30 transition-all text-center placeholder:text-zinc-800"
                          />
                        </div>

                        <div className="col-span-2 p-2 flex gap-2 min-w-0">
                          <div className="flex-1 relative min-w-0">
                            <SearchableSelect
                              value={item.fabric_insumo_id || ''}
                              onChange={(val) => {
                                const selectedInsumo = insumos.find((ins: Insumo) => ins.id === val);
                                const newItems = [...items];
                                // Trocou de tecido: se a cor atual não existe na cartela
                                // do novo tecido, limpa para não sobrar cor inválida.
                                const novaFamilia = selectedInsumo?.fabric_family;
                                const corAindaVale = !novaFamilia || !newItems[i].color
                                  || fabricColors.some(c => c.fabric_family === novaFamilia
                                    && c.color_name.toUpperCase() === newItems[i].color.toUpperCase());
                                newItems[i] = {
                                  ...newItems[i],
                                  fabric_insumo_id: val || undefined,
                                  fabric_name: selectedInsumo?.name || '',
                                  fabric: selectedInsumo?.name || newItems[i].fabric,
                                  color: corAindaVale ? newItems[i].color : '',
                                };
                                setItems(newItems);
                              }}
                              options={fabricOptionsFor(item.fabric_insumo_id)}
                              placeholder="TECIDO LIVRE..."
                              className="text-[10px] font-black uppercase tracking-widest"
                            />
                            {tierBadgeFor(item.fabric_insumo_id) && (
                              <span
                                className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[7px] font-black uppercase tracking-widest pointer-events-none"
                                title="Esta cor sai da faixa de preço padrão do tecido"
                              >
                                {tierBadgeFor(item.fabric_insumo_id)}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => { setQuickCreateType('insumo'); setPendingItemIndex(i); setShowQuickCreate(true); }}
                            className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0 text-zinc-600 hover:text-amber-500 hover:border-amber-500/30 transition-all active:scale-90"
                            title="Novo Módulo/Tecido"
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        <div className="col-span-1 p-2">
                          {(() => {
                            const cores = colorOptionsFor(item.fabric_insumo_id);
                            // Tecido homologado → só cores da cartela (e a faixa de
                            // preço se resolve sozinha). Tecido livre → texto solto.
                            return cores ? (
                              <SearchableSelect
                                value={item.color || ''}
                                onChange={(val) => handleColorPick(i, val)}
                                options={cores}
                                placeholder="COR..."
                                className="text-[10px] font-black uppercase tracking-widest"
                              />
                            ) : (
                              <input
                                placeholder="COR..."
                                value={item.color}
                                onChange={(e) => updateItem(i, 'color', e.target.value.toUpperCase())}
                                className="w-full bg-zinc-950/50 text-zinc-200 text-[10px] font-black uppercase tracking-widest p-2 rounded-lg outline-none border border-zinc-800 hover:border-zinc-700 focus:border-amber-500/30 transition-all text-center placeholder:text-zinc-800"
                              />
                            );
                          })()}
                        </div>

                        <div className="col-span-1 p-2">
                          <input
                            placeholder="M"
                            value={item.size}
                            onChange={(e) => updateItem(i, 'size', e.target.value.toUpperCase())}
                            className="w-full bg-zinc-950/50 text-zinc-200 text-[10px] font-black uppercase tracking-widest p-2 rounded-lg outline-none border border-zinc-800 hover:border-zinc-700 focus:border-amber-500/30 transition-all text-center placeholder:text-zinc-800"
                          />
                        </div>

                        <div className="col-span-1 p-2">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full bg-zinc-950 text-amber-500 font-black text-[11px] p-2 rounded-lg outline-none border border-amber-500/20 hover:border-amber-500/40 focus:border-amber-500 transition-all text-center shadow-lg shadow-amber-900/5"
                          />
                        </div>

                        <div className="col-span-1 p-2">
                          <input
                            type="number"
                            value={item.unit_price}
                            onChange={(e) => updateItem(i, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-full bg-zinc-950/50 text-zinc-300 text-[11px] font-black p-2 rounded-lg outline-none border border-zinc-800 hover:border-zinc-700 focus:border-amber-500/30 transition-all text-right"
                          />
                        </div>

                        <div className="col-span-1 p-2 pr-6 flex justify-end items-center relative overflow-hidden group/cell">
                          <span className="text-[11px] font-black text-white tracking-tight group-hover/cell:opacity-0 group-hover/cell:translate-x-12 group-focus-within/cell:opacity-0 group-focus-within/cell:translate-x-12 transition-all duration-150">
                            {formatCurrency(item.total)}
                          </span>

                          {/* ── Floating actions ── */}
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 translate-x-12 group-hover/cell:translate-x-0 group-hover/cell:opacity-100 group-focus-within/cell:translate-x-0 group-focus-within/cell:opacity-100 transition-all duration-150">
                            <div className="relative group/btn flex justify-center">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleCloneItem(i); }}
                                aria-label="Clonar item"
                                className="w-6 h-6 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-amber-500 hover:border-amber-500/30 transition-all active:scale-95"
                              >
                                <Copy size={12} />
                              </button>
                              <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 text-white text-[10px] font-black px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">CLONAR</span>
                            </div>
                            <div className="relative group/btn flex justify-center">
                              <button
                                aria-label="Copiar especificação"
                                onClick={(e) => { e.stopPropagation(); setCopiando({ origem: i, grupos: ['opcionais', 'detalhes', 'tecido', 'preco'], destinos: new Set<number>() }); }}
                                className={`w-6 h-6 flex items-center justify-center rounded-lg border transition-all ${copiando?.origem === i
                                  ? 'bg-amber-500 border-amber-600 text-black'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-amber-500 hover:border-amber-500/30'
                                  }`}
                              >
                                <Paintbrush size={12} />
                              </button>
                              <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 text-white text-[10px] font-black px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">COPIAR ESPEC.</span>
                            </div>
                            <div className="relative group/btn flex justify-center">
                              <button
                                aria-label="Grade de tamanhos"
                                onClick={(e) => { e.stopPropagation(); abrirGrade(i); }}
                                className={`w-6 h-6 flex items-center justify-center rounded-lg border transition-all ${gradeAberta === i
                                  ? 'bg-amber-500 border-amber-600 text-black'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-amber-500 hover:border-amber-500/30'
                                  }`}
                              >
                                <Rows3 size={12} />
                              </button>
                              <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 text-white text-[10px] font-black px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">GRADE</span>
                            </div>
                            <div className="relative group/btn flex justify-center">
                              <button
                                onClick={() => { const novos = items.filter((_, idx) => idx !== i); setItems(novos); esquecerIndices(novos); }}
                                aria-label="Excluir item"
                                className="w-6 h-6 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-rose-500 hover:border-rose-500/30 transition-all active:scale-95"
                              >
                                <Trash2 size={12} />
                              </button>
                              <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-root bg-zinc-900 border border-zinc-800 text-white text-[10px] font-black px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">EXCLUIR</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── Resumo da especificação; o lápis abre e fecha o painel ── */}
                      <div className="flex items-center gap-2 pl-6 pb-2">
                        <span className={ROTULO_PEQUENO}>{resumoDaEspecificacao(item)}</span>
                        <button
                          type="button"
                          aria-label="Editar especificação"
                          aria-expanded={expandedSpecRows.has(i)}
                          onClick={() => toggleSpecRow(i)}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${expandedSpecRows.has(i) ? 'text-amber-400' : 'text-zinc-600 hover:text-amber-500'}`}
                        >
                          <Pencil size={16} />
                        </button>
                      </div>

                      {/* ── Grade de tamanhos numa linha só ── */}
                      {gradeAberta === i && (
                        <div className="bg-zinc-950/80 border-t border-zinc-800/40 px-6 py-3 flex flex-wrap items-center gap-2">
                          <input
                            autoFocus
                            value={gradeTexto}
                            onChange={(e) => { setGradeTexto(e.target.value); setGradeErro(''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') aplicarGrade(i); if (e.key === 'Escape') { e.preventDefault(); setGradeAberta(null); } }}
                            placeholder="P 10, M 20, G 15, GG 5"
                            className={`${CAMPO} flex-1 min-w-[200px] uppercase`}
                          />
                          <button type="button" onClick={() => aplicarGrade(i)} className={BOTAO_SUAVE}>Aplicar</button>
                          <button type="button" onClick={() => setGradeAberta(null)} className={BOTAO_SECUNDARIO}>Cancelar</button>
                          {gradeErro && <p className="basis-full text-[11px] text-rose-400">{gradeErro}</p>}
                        </div>
                      )}

                      {/* ── Production spec expansion panel ── */}
                      {expandedSpecRows.has(i) && (
                        <div className="col-span-12 bg-zinc-950/80 border-t border-zinc-800/40 px-6 py-5 ease-out animate-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center gap-3 mb-6">
                            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                            <p className={ROTULO}>
                              Especificações Técnicas: {item.product_name || 'NÃO DEFINIDO'}
                            </p>
                          </div>

                          {/* Um clique escolhe; clicar no ativo desmarca. */}
                          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                            {ESPECIFICACAO.map(g => (
                              <div key={g.campo} className="flex items-center gap-1">
                                <span className={`${ROTULO_PEQUENO} mr-1`}>{g.rotulo}</span>
                                {g.comuns.map(([valor, rotulo]) => (
                                  <button
                                    key={valor}
                                    type="button"
                                    onClick={() => updateItem(i, g.campo, item[g.campo] === valor ? undefined : valor)}
                                    className={pilula(item[g.campo] === valor)}
                                  >
                                    {rotulo}
                                  </button>
                                ))}
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => updateItem(i, 'has_band', item.has_band ? undefined : true)}
                              className={pilula(!!item.has_band)}
                            >
                              Faixa
                            </button>
                            <button
                              type="button"
                              aria-expanded={maisAbertos.has(i)}
                              onClick={() => alternarMais(i)}
                              className={pilula(maisAbertos.has(i))}
                            >
                              + mais
                            </button>
                          </div>

                          {maisAbertos.has(i) && (
                            <div className="flex flex-wrap items-start gap-x-6 gap-y-3 mt-3">
                              <div className="flex flex-wrap items-center gap-1">
                                {ESPECIFICACAO.flatMap(g => g.raros.map(([valor, rotulo]) => (
                                  <button
                                    key={valor}
                                    type="button"
                                    onClick={() => updateItem(i, g.campo, item[g.campo] === valor ? undefined : valor)}
                                    className={pilula(item[g.campo] === valor)}
                                  >
                                    {rotulo}
                                  </button>
                                )))}
                              </div>
                              <div className="flex-1 min-w-[240px] space-y-1">
                                <label className={ROTULO_PEQUENO}>Detalhes</label>
                                {/* Era <input>: uma linha só, e observação longa
                                    sumia para a direita sem sinal de que havia mais.
                                    Agora cresce com o texto e o Tab recua. */}
                                <AreaDeTexto
                                  placeholder="DETALHES ADICIONAIS...   (TAB RECUA)"
                                  value={item.prod_notes || ''}
                                  onChange={(v) => updateItem(i, 'prod_notes', v)}
                                  maiuscula
                                  // Alça embaixo: este campo vive no cartão do item,
                                  // em fluxo normal, e cresce para baixo. No rodapé
                                  // é o contrário — lá a caixa está ancorada e sobe.
                                  redimensionavel="base"
                                  linhas={2}
                                  linhasMaximas={10}
                                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest text-zinc-200 outline-none focus:border-amber-500/30 transition-all placeholder:text-zinc-700 whitespace-pre-wrap"
                                />
                              </div>
                            </div>
                          )}

                          {/* ── PEÇAS DO CONJUNTO ──
                              Cartão próprio, e não mais um rodapé da grade de
                              especificações. As duas coisas se pareciam demais: a
                              grade descreve a peça inteira, esta lista diz de
                              QUANTAS peças ela é feita — misturadas, ninguém via
                              onde uma terminava e a outra começava.

                              Conjunto se vende por um preço só mas se CORTA peça
                              por peça: o jaleco sai de uma malha e a calça de um
                              brim, cada um no seu enfesto. Quantidade e preço
                              seguem na linha — 30 conjuntos são 30 jalecos E 30
                              calças. */}
                          <div className={`${ITEM} mt-6 overflow-hidden`}>
                            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800/40 bg-zinc-950/25">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="p-1.5 rounded-lg bg-zinc-800/50 border border-zinc-800 shrink-0">
                                  <Boxes size={12} className="text-zinc-500" />
                                </div>
                                <div className="min-w-0">
                                  <p className={`${ROTULO_PEQUENO} leading-none`}>
                                    Peças do conjunto
                                  </p>
                                  <p className="text-[10px] text-zinc-700 uppercase tracking-widest mt-1 truncate">
                                    {(item.components?.length || 0) === 0
                                      ? 'peça única · usa o tecido e a cor da linha'
                                      : `${contar(item.components!.length, 'peça', 'peças')} · um preço só · um enfesto cada`}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); adicionarComponente(i); }}
                                className={`${BOTAO_SECUNDARIO} shrink-0`}
                              >
                                <Plus size={14} /> Peça
                              </button>
                            </div>

                            {(item.components || []).length === 0 ? (
                              <p className="px-4 py-4 text-[10px] text-zinc-700 leading-relaxed">
                                Esta linha é uma peça só. Se for um conjunto — jaleco e calça, por exemplo —
                                acrescente as peças aqui: cada uma leva o seu tecido e a sua cor, e sai num
                                enfesto próprio na ficha de corte. O preço continua sendo o da linha.
                              </p>
                            ) : (
                              <div className="p-3 space-y-2.5">
                                {(item.components || []).map((comp, ci) => {
                                  const livre = pecaEhLivre(comp);
                                  const cores = colorOptionsFor(comp.fabric_insumo_id);
                                  return (
                                    /* Cada peça em cartão próprio.
                                       Empilhadas como linhas soltas, as peças se
                                       confundiam entre si e com os campos delas —
                                       eram cinco caixas iguais numa faixa só. O
                                       cartão fecha o grupo, e dentro dele o nome
                                       sobe para uma linha exclusiva enquanto
                                       tecido e cor descem rotulados: três níveis
                                       de leitura em vez de um. */
                                    <div key={ci}
                                      className={`${ITEM} p-3`}>

                                      {/* Identidade da peça */}
                                      <div className="flex items-center gap-2">
                                        <span className="w-5 h-5 shrink-0 flex items-center justify-center rounded-md bg-zinc-800/60 text-[10px] font-black text-zinc-500">
                                          {ci + 1}
                                        </span>

                                        {livre ? (
                                          <input
                                            placeholder="NOME DA PEÇA..."
                                            value={comp.name || ''}
                                            onChange={(e) => atualizarComponente(i, ci, 'name', e.target.value.toUpperCase())}
                                            className="flex-1 min-w-0 bg-transparent border-0 px-1 py-1 text-[11px] font-black uppercase tracking-widest text-zinc-300 outline-none placeholder:text-zinc-700"
                                          />
                                        ) : (
                                          <div className="flex-1 min-w-0">
                                            <SearchableSelect
                                              value={comp.product_id || ''}
                                              onChange={(val) => escolherProdutoDaPeca(i, ci, val)}
                                              options={opcoesDeProduto}
                                              placeholder="PEÇA DO CATÁLOGO..."
                                              className="text-[10px] font-black uppercase tracking-widest"
                                              atenuado
                                            />
                                          </div>
                                        )}

                                        <button
                                          type="button"
                                          title={livre ? 'Escolher do catálogo' : 'Digitar um nome livre'}
                                          aria-label={livre ? 'Escolher do catálogo' : 'Digitar um nome livre'}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            // Trocar de modo limpa o que era do
                                            // outro, senão sobra um nome órfão
                                            // apontando para produto nenhum. É a
                                            // presença de `name` que define o modo.
                                            mexerNosComponentes(i, atual => atual.map((c, k) =>
                                              k === ci
                                                ? { product_id: undefined, name: livre ? undefined : '' }
                                                : c));
                                          }}
                                          className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-lg border transition-colors ${livre
                                            ? 'bg-zinc-800/40 border-zinc-700/60 text-zinc-400'
                                            : 'bg-transparent border-zinc-800/60 text-zinc-700 hover:text-zinc-400'}`}
                                        >
                                          <Pencil size={16} />
                                        </button>

                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); removerComponente(i, ci); }}
                                          title="Remover esta peça do conjunto"
                                          className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-zinc-700 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </div>

                                      {/* Do que ela é feita — rotulado, para os
                                          dois campos deixarem de ser caixas anônimas */}
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5 pt-2.5 border-t border-zinc-800/40">
                                        <div>
                                          <label className={`${ROTULO_PEQUENO} block mb-1 ml-1`}>
                                            Tecido
                                          </label>
                                          <SearchableSelect
                                            value={comp.fabric_insumo_id || ''}
                                            onChange={(val) => trocarTecidoDoComponente(i, ci, val)}
                                            options={fabricOptionsFor(comp.fabric_insumo_id)}
                                            placeholder="TECIDO..."
                                            className="text-[10px] font-black uppercase tracking-widest"
                                            atenuado
                                          />
                                        </div>
                                        <div>
                                          <label className={`${ROTULO_PEQUENO} block mb-1 ml-1`}>
                                            Cor
                                          </label>
                                          {/* Mesma cartela do tecido da peça: a cor
                                              é que define a faixa de preço do insumo. */}
                                          {cores ? (
                                            <SearchableSelect
                                              value={comp.color || ''}
                                              onChange={(val) => atualizarComponente(i, ci, 'color', val.toUpperCase())}
                                              options={cores}
                                              placeholder="COR..."
                                              className="text-[10px] font-black uppercase tracking-widest"
                                              atenuado
                                            />
                                          ) : (
                                            <input
                                              placeholder="COR..."
                                              value={comp.color || ''}
                                              onChange={(e) => atualizarComponente(i, ci, 'color', e.target.value.toUpperCase())}
                                              className={`${CAMPO} w-full uppercase`}
                                            />
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Fecha a aba de edição.
                              Aberto, o painel encostava direto na linha do produto
                              seguinte: os dois liam como um bloco só, e quem
                              rolava não sabia onde as especificações de um item
                              terminavam. O traço desbota nas pontas para marcar o
                              fim sem virar mais uma divisória de tabela. */}
                          <div className="mt-5 -mx-6 -mb-3 pt-4">
                            <div className="h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-zinc-600 text-xs border-t border-zinc-800 border-dashed">
                  Nenhum item adicionado.
                </div>
              )}
            </div>
            </div>
          </section>

          {/* ── ACABAMENTO ── */}
          <BlocoRecolhivel
            titulo="Acabamento"
            aberto={acabamentoAberto}
            onAlternar={() => setAcabamentoAberto(v => !v)}
            resumo={resumoDoAcabamento}
          >
          <SectionHeader
            title="Personalizações Adicionais"
            acaoExtra={
              <button
                onClick={() => setImportandoPersonalizacao(true)}
                title="Trazer da tabela de preços ou das artes cadastradas"
                className={BOTAO_SECUNDARIO}
              >
                <Download size={12} /> IMPORTAR
              </button>
            }
            onAdd={() =>
              setCustomizations([
                ...customizations,
                {
                  id: idService.generateUUID(),
                  type: 'Other',
                  description: '',
                  position: '',
                  quantity: 1,
                  unit_price: 0,
                  total: 0,
                },
              ])
            }
          />
          {customizations.length > 0 && (
            <div className={`${CARTAO} relative`}>
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/10 to-transparent"></div>

              <div className={`grid grid-cols-12 gap-px bg-zinc-950/50 border-b border-zinc-800/50 ${ROTULO_PEQUENO} text-center`}>
                <div className="col-span-2 py-4 text-left pl-6">MÉTODO</div>
                <div className="col-span-4 py-4 text-left pl-4">DESCRIÇÃO DA ARTE</div>
                <div className="col-span-2 py-4">POSIÇÃO</div>
                <div className="col-span-1 py-4 text-amber-500/80">QTD</div>
                <div className="col-span-2 py-4 text-right">UNIT (R$)</div>
                <div className="col-span-1 py-4 text-right pr-6">TOTAL (R$)</div>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {customizations.map((custom, i) => (
                  <div
                    key={custom.id}
                    className="grid grid-cols-12 gap-px items-center hover:bg-zinc-900/60 transition-all group relative"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-transparent group-hover:bg-amber-500/50 transition-colors"></div>

                    <div className="col-span-2 p-2 pl-4">
                      <SearchableSelect
                        value={custom.type}
                        onChange={(val) => {
                          const newC = [...customizations];
                          newC[i].type = val as any;
                          setCustomizations(newC);
                        }}
                        options={[
                          { value: 'Embroidery', label: 'BORDADO' },
                          { value: 'ScreenPrint', label: 'SILK/ESTAMPA' },
                          { value: 'DTF', label: 'DTF' },
                          { value: 'Other', label: 'OUTRO' },
                        ]}
                        className="text-[10px] font-black uppercase tracking-widest"
                      />
                    </div>
                    <div className="col-span-4 p-2 pl-4">
                      <input
                        placeholder="EX: LOGOTIPO PEITO..."
                        value={custom.description}
                        onChange={(e) => {
                          const newC = [...customizations];
                          newC[i].description = e.target.value.toUpperCase();
                          setCustomizations(newC);
                        }}
                        className="w-full bg-zinc-950/50 text-zinc-200 text-[10px] font-black uppercase tracking-widest p-2.5 rounded-lg outline-none border border-zinc-800 hover:border-zinc-700 focus:border-amber-500/30 transition-all placeholder:text-zinc-800"
                      />
                    </div>
                    <div className="col-span-2 p-2">
                      <input
                        placeholder="EX: PEITO ESQ..."
                        value={custom.position}
                        onChange={(e) => {
                          const newC = [...customizations];
                          newC[i].position = e.target.value.toUpperCase();
                          setCustomizations(newC);
                        }}
                        className="w-full bg-zinc-950/50 text-zinc-200 text-[10px] font-black uppercase tracking-widest p-2.5 rounded-lg outline-none border border-zinc-800 hover:border-zinc-700 focus:border-amber-500/30 transition-all text-center placeholder:text-zinc-800"
                      />
                    </div>
                    <div className="col-span-1 p-2">
                      <input
                        type="number"
                        value={custom.quantity}
                        onChange={(e) => {
                          const newC = [...customizations];
                          newC[i].quantity = parseFloat(e.target.value) || 0;
                          newC[i].total = round2(newC[i].quantity * newC[i].unit_price);
                          setCustomizations(newC);
                        }}
                        className="w-full bg-zinc-950 text-amber-500 font-black text-[11px] p-2 rounded-lg outline-none border border-amber-500/20 hover:border-amber-500/40 focus:border-amber-500 transition-all text-center"
                      />
                    </div>
                    <div className="col-span-2 p-2">
                      <input
                        type="number"
                        value={custom.unit_price}
                        onChange={(e) => {
                          const newC = [...customizations];
                          newC[i].unit_price = parseFloat(e.target.value) || 0;
                          newC[i].total = round2(newC[i].quantity * newC[i].unit_price);
                          setCustomizations(newC);
                        }}
                        className="w-full bg-zinc-950/50 text-zinc-300 text-[11px] font-black p-2 rounded-lg outline-none border border-zinc-800 hover:border-zinc-700 focus:border-amber-500/30 transition-all text-right"
                      />
                    </div>
                    <div className="col-span-1 p-2 pr-6 flex justify-end items-center relative overflow-hidden group/cell">
                      <span className="text-[11px] font-black text-white tracking-tight group-hover/cell:opacity-0 group-hover/cell:translate-x-12 transition-all duration-150">
                        {formatCurrency(custom.total)}
                      </span>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 translate-x-12 group-hover/cell:translate-x-0 group-hover/cell:opacity-100 transition-all duration-150">
                        <div className="relative group/btn flex justify-center">
                          <button
                            onClick={() => setCustomizations(customizations.filter((_, idx) => idx !== i))}
                            aria-label="Excluir personalização"
                            className="w-6 h-6 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-rose-500 hover:border-rose-500/30 transition-all active:scale-95"
                          >
                            <Trash2 size={12} />
                          </button>
                          <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 text-white text-[10px] font-black px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">EXCLUIR</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <SectionHeader
            title="Extras / Serviços"
            onAdd={() =>
              setExtras([
                ...extras,
                {
                  id: idService.generateUUID(),
                  description: '',
                  quantity: 1,
                  unit_price: 0,
                  total: 0,
                },
              ])
            }
          />
          {extras.length > 0 && (
            <div className={`${CARTAO} relative`}>
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/10 to-transparent"></div>

              <div className={`grid grid-cols-12 gap-px bg-zinc-950/50 border-b border-zinc-800/50 ${ROTULO_PEQUENO} text-center`}>
                <div className="col-span-8 py-4 text-left pl-6">DESCRIÇÃO DO SERVIÇO / TAXA</div>
                <div className="col-span-1 py-4 text-amber-500/80">QTD</div>
                <div className="col-span-2 py-4 text-right">VALOR UNIT (R$)</div>
                <div className="col-span-1 py-4 text-right pr-6">TOTAL (R$)</div>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {extras.map((extra, i) => (
                  <div
                    key={extra.id}
                    className="grid grid-cols-12 gap-px items-center hover:bg-zinc-900/60 transition-all group relative"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-transparent group-hover:bg-amber-500/50 transition-colors"></div>

                    <div className="col-span-8 p-2 pl-4">
                      <input
                        placeholder="EX: TAXA DE ENTREGA / SERVIÇO DE CRIAÇÃO..."
                        value={extra.description}
                        onChange={(e) => {
                          const newE = [...extras];
                          newE[i].description = e.target.value.toUpperCase();
                          setExtras(newE);
                        }}
                        className="w-full bg-zinc-950/50 text-zinc-200 text-[10px] font-black uppercase tracking-widest p-2.5 rounded-lg outline-none border border-zinc-800 hover:border-zinc-700 focus:border-amber-500/30 transition-all placeholder:text-zinc-800"
                      />
                    </div>
                    <div className="col-span-1 p-2">
                      <input
                        type="number"
                        value={extra.quantity}
                        onChange={(e) => {
                          const newE = [...extras];
                          newE[i].quantity = parseFloat(e.target.value) || 0;
                          newE[i].total = round2(newE[i].quantity * newE[i].unit_price);
                          setExtras(newE);
                        }}
                        className="w-full bg-zinc-950 text-amber-500 font-black text-[11px] p-2 rounded-lg outline-none border border-amber-500/20 hover:border-amber-500/40 focus:border-amber-500 transition-all text-center"
                      />
                    </div>
                    <div className="col-span-2 p-2">
                      <input
                        type="number"
                        value={extra.unit_price}
                        onChange={(e) => {
                          const newE = [...extras];
                          newE[i].unit_price = parseFloat(e.target.value) || 0;
                          newE[i].total = round2(newE[i].quantity * newE[i].unit_price);
                          setExtras(newE);
                        }}
                        className="w-full bg-zinc-950/50 text-zinc-300 text-[11px] font-black p-2 rounded-lg outline-none border border-zinc-800 hover:border-zinc-700 focus:border-amber-500/30 transition-all text-right"
                      />
                    </div>
                    <div className="col-span-1 p-2 pr-6 flex justify-end items-center relative overflow-hidden group/cell">
                      <span className="text-[11px] font-black text-white tracking-tight group-hover/cell:opacity-0 group-hover/cell:translate-x-12 transition-all duration-150">
                        {formatCurrency(extra.total)}
                      </span>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 translate-x-12 group-hover/cell:translate-x-0 group-hover/cell:opacity-100 transition-all duration-150">
                        <div className="relative group/btn flex justify-center">
                          <button
                            onClick={() => setExtras(extras.filter((_, idx) => idx !== i))}
                            aria-label="Excluir extra"
                            className="w-6 h-6 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-rose-500 hover:border-rose-500/30 transition-all active:scale-95"
                          >
                            <Trash2 size={12} />
                          </button>
                          <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 text-white text-[10px] font-black px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">EXCLUIR</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

            {/* Observações + fotos de referência */}
            <div className={`${CARTAO} p-4 mt-6`}>
            <div className="w-full grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-6 items-start">
              <div className="min-w-0">
                {/* Duas abas, um espaço. O rótulo de cada uma diz onde o texto sai —
                    é a única coisa que impede escrever recado de produção no papel
                    que o cliente lê. */}
                <div className="flex items-center gap-1 mb-3">
                  {([
                    ['cliente', 'Cliente', 'Sai no PDF do orçamento'],
                    ['fabrica', 'Fábrica', 'Só na ficha de produção'],
                  ] as const).map(([valor, rotulo, dica]) => {
                    const ativa = abaDeObservacao === valor;
                    const preenchida = valor === 'cliente'
                      ? !!paymentInfo.notes.trim()
                      : !!factoryNotes.trim();
                    return (
                      <button
                        key={valor}
                        type="button"
                        onClick={() => setAbaDeObservacao(valor)}
                        title={dica}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border transition-all ${ativa
                          ? valor === 'fabrica'
                            ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                            : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                          : 'bg-zinc-950/40 border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700'}`}
                      >
                        {rotulo}
                        {preenchida && (
                          <span className={`w-1.5 h-1.5 rounded-full ${valor === 'fabrica' ? 'bg-sky-400' : 'bg-amber-400'}`} />
                        )}
                      </button>
                    );
                  })}
                  <span className="text-[10px] font-bold text-zinc-600 ml-2 hidden sm:block truncate">
                    {abaDeObservacao === 'cliente'
                      ? 'Condições comerciais — o cliente lê isto'
                      : 'Recado interno — sai só na ficha de produção'}
                  </span>
                </div>

                {abaDeObservacao === 'cliente' ? (
                  <AreaDeTexto
                    value={paymentInfo.notes}
                    onChange={(v) => setPaymentInfo({ ...paymentInfo, notes: v })}
                    maiuscula
                    placeholder="CONDIÇÕES DE PAGAMENTO, PRAZOS ESPECÍFICOS, DETALHES TÉCNICOS ADICIONAIS...   (TAB RECUA)"
                    redimensionavel
                    linhas={3}
                    linhasMaximas={14}
                    className="w-full bg-zinc-900/30 border border-zinc-800 rounded-2xl text-[11px] font-medium text-zinc-400 p-5 outline-none focus:border-amber-500/30 transition-all placeholder:text-zinc-800 leading-relaxed"
                  />
                ) : (
                  <AreaDeTexto
                    value={factoryNotes}
                    onChange={setFactoryNotes}
                    maiuscula
                    redimensionavel
                    placeholder={'AVISO GERAL PARA A PRODUÇÃO — VALE PARA O PEDIDO INTEIRO.\nEX: CONFERIR TONALIDADE DO LOTE ANTES DE CORTAR   (TAB RECUA)'}
                    linhas={3}
                    linhasMaximas={14}
                    className="w-full bg-sky-950/10 border border-sky-500/20 rounded-2xl text-[11px] font-medium text-zinc-300 p-5 outline-none focus:border-sky-500/40 transition-all placeholder:text-zinc-700 leading-relaxed"
                  />
                )}
              </div>
              <div className="xl:w-[290px]">
                <ReferencePhotos
                  photos={referencePhotos}
                  onChange={setReferencePhotos}
                  folder={budget?.id || 'novos'}
                  registroId={budget?.id || ''}
                />
              </div>
            </div>
            </div>
          </BlocoRecolhivel>

          {/* ── CONDIÇÕES ── */}
          <BlocoRecolhivel
            titulo="Condições"
            aberto={condicoesAberto}
            onAlternar={() => setCondicoesAberto(v => !v)}
            resumo={resumoDasCondicoes}
          >
            <div className={`${CARTAO} p-4 space-y-4`}>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-4 px-4 border-r border-zinc-800/50 h-12">
                  <DollarSign size={20} className="text-zinc-600" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-zinc-700 uppercase tracking-tighter">Desconto Especial</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={discount}
                        onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                        className="w-12 bg-transparent text-xs font-black text-rose-500 border-b border-transparent focus:border-rose-500/30 outline-none transition-all text-right"
                        placeholder="0.00"
                      />
                      <span className="text-[10px] font-black text-zinc-600 uppercase">%</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 px-4 h-12">
                  <Truck size={20} className="text-zinc-600" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-zinc-700 uppercase tracking-tighter">Prazo de Entrega</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={delivery_time_days}
                        onChange={(e) => setDeliveryTimeDays(parseInt(e.target.value) || 0)}
                        className="w-8 bg-transparent text-xs font-black text-white border-b border-transparent focus:border-amber-500/30 outline-none transition-all text-center"
                      />
                      <span className="text-[10px] font-black text-zinc-600 uppercase">DIAS</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Condição de pagamento num bloco só: a entrada é a 1ª parcela do
                  plano. Mexer na entrada % refaz o plano; o resto das parcelas
                  se edita no modal de sempre. */}
              <div className="space-y-3 border-t border-zinc-800 pt-4">
                <p className={ROTULO_PEQUENO}>Condição de pagamento</p>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2">
                    <span className={ROTULO_PEQUENO}>Entrada %</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={entradaTexto}
                      disabled={totals.total_amount <= 0}
                      onChange={(e) => setEntradaTexto(e.target.value)}
                      onBlur={aplicarEntradaDigitada}
                      onKeyDown={(e) => { if (e.key === 'Enter') aplicarEntradaDigitada(); }}
                      className={`${CAMPO} w-20 text-center`}
                    />
                  </label>
                  {!temPlano && (
                    <span className="text-[10px] text-zinc-600">sem parcelas · mude a entrada para montar o plano</span>
                  )}
                  <button type="button" onClick={() => setShowPlanModal(true)} className={BOTAO_SUAVE}>
                    <DollarSign size={13} />
                    Editar parcelas
                  </button>
                  {planoDesatualizado ? (
                    // Aviso na cara e conserto de um clique: quem edita o orçamento
                    // não tem por que refazer a conta de cabeça, e sem isto o erro
                    // só aparece no PDF que o cliente já recebeu.
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[10px] font-black uppercase tracking-widest text-rose-300">
                        <AlertTriangle size={12} />
                        Plano soma {formatCurrency(conferenciaDoPlano!.total)} · total {formatCurrency(totals.total_amount)}
                      </span>
                      <button
                        type="button"
                        onClick={ajustarPlanoAoTotal}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-rose-500 text-black hover:bg-rose-400 transition-colors"
                      >
                        Ajustar ao total
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] font-black text-zinc-700 uppercase tracking-tighter">opcional · vai no PDF</span>
                  )}
                </div>
                {temPlano && (
                  <ul className="space-y-1">
                    {paymentPlan!.map((p, i) => (
                      <li key={i} className={`${ITEM} px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]`}>
                        <span className="flex-1 min-w-0 truncate font-black text-zinc-300">{p.label || `Parcela ${i + 1}`}</span>
                        <span className="font-black text-white">{formatCurrency(p.amount || 0)}</span>
                        <span className="text-zinc-500">{formatDate(p.due)}</span>
                        <span className={ROTULO_PEQUENO}>{p.method || '—'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </BlocoRecolhivel>

          {/* Os totais de sempre, no fim da tela. */}
          <div className="flex items-center justify-end gap-6 px-2">
            <div className="text-right flex flex-col items-end">
              <span className="text-[10px] text-zinc-600 uppercase font-black tracking-widest leading-none mb-1">
                SUBTOTAL BRUTO
              </span>
              <span className="text-sm text-zinc-400 font-black tracking-tighter">
                {formatCurrency(
                  totals.subtotal_items + totals.subtotalCustom + totals.subtotal_extras
                )}
              </span>
            </div>

            <div className="w-px h-10 bg-zinc-800/50" />

            <div className="text-right flex flex-col items-end group">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                <span className="text-[10px] text-emerald-500 uppercase font-black tracking-[0.2em] leading-none">
                  VALOR CONSOLIDADO
                </span>
              </div>
              <span className="text-4xl font-black text-white tracking-tighter group-hover:text-amber-500 transition-colors leading-none">
                {formatCurrency(totals.total_amount)}
              </span>
            </div>
          </div>
        </div>

        {/* Rodapé fixo: o resumo que acompanha a rolagem — total, entrada e
            saldo e se cabe na semana. Salvar mora no cabeçalho, como na v2. */}
        <div className={`${CARTAO} p-4 sticky bottom-0 z-10 backdrop-blur-md flex flex-wrap items-center justify-between gap-3`}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 min-w-0">
            <div>
              <p className={ROTULO_PEQUENO}>Total</p>
              <p className="text-lg font-black text-white leading-tight">{formatCurrency(totals.total_amount)}</p>
            </div>
            <div>
              <p className={ROTULO_PEQUENO}>Entrada</p>
              <p className="text-sm font-black text-zinc-300 leading-tight">{formatCurrency(condicao.entrada)}</p>
            </div>
            <div>
              <p className={ROTULO_PEQUENO}>Saldo</p>
              <p className="text-sm font-black text-zinc-300 leading-tight">{formatCurrency(condicao.aPrazo)}</p>
            </div>
            {/* Convertido já é pedido e já está na carga: contar de novo dobraria as peças. */}
            {cabeNaSemana && budget?.status !== 'Converted' && (
              <p className={`max-w-[16rem] leading-tight text-[10px] font-black uppercase tracking-widest ${cabeNaSemana.cabe ? 'text-emerald-400' : 'text-rose-400'}`}>{cabeNaSemana.texto}</p>
            )}
          </div>
        </div>
      </div>
      <QuickCreateModal
        isOpen={showQuickCreate}
        onClose={() => setShowQuickCreate(false)}
        type={quickCreateType as any}
        onSuccess={handleQuickCreateSuccess}
      />
      {showPlanModal && (
        <PaymentPlanModal
          mode="budget"
          orderId=""
          orderNumber={headerInfo.serial_number || 'novo'}
          hoje={headerInfo.date}
          clientId={selectedClientId}
          description="Plano de pagamento"
          total={totals.total_amount}
          deliveryDate={addBusinessDays(headerInfo.date || getTodayStr(), delivery_time_days || 20)}
          downPayment={payments.down_payment_value}
          defaultTerms={localClients.find((c: any) => c.id === selectedClientId)?.default_payment_terms || '50_50'}
          initialPlan={paymentPlan}
          onConfirm={async (plan) => { setPaymentPlan(plan); setShowPlanModal(false); }}
          onClose={() => setShowPlanModal(false)}
        />
      )}
      <ImportarPersonalizacaoModal
        isOpen={importandoPersonalizacao}
        onClose={() => setImportandoPersonalizacao(false)}
        // A quantidade das peças já lançadas é o que decide a faixa de preço:
        // importar "bordado" num orçamento de 200 peças deve trazer o preço de
        // 200, não o de uma. Sem itens ainda, o modal usa 1.
        quantidadeSugerida={items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)}
        onImportar={(linhas) => setCustomizations(atual => [...atual, ...linhas])}
      />
    </div>,
    document.body
  );
};
