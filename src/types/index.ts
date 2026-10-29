
// --- DOMAIN ENUMS ---
export enum OrderStatus {
  PENDING = 'Pendente',
  IN_PRODUCTION = 'Em Produção',
  DELIVERED = 'Entregue'
}

export enum ProductionStage {
  WAITING = 'Aguardando Material',
  CUTTING = 'Corte',
  CUSTOMIZATION = 'Personalização',
  SEWING = 'Costura',
  FINISHING = 'Finalização',
  LOGISTICS = 'Transporte'
}

export enum PaymentStatus {
  PAID = 'Liquidado',
  PARTIAL = 'Parcial',
  PENDING = 'Pendente',
  OVERDUE = 'Atrasado'
}

// --- SECURITY TYPES ---
export type UserRole = 'admin' | 'manager' | 'factory';

export interface UserProfile {
  id: string; // Matches auth.users id
  email: string;
  role: UserRole;
  full_name?: string;
  /**
   * Caminho da foto no bucket, NUNCA a URL assinada — ela expira em 1 h e
   * guardá-la deixaria o avatar quebrado no dia seguinte. Mesma regra das
   * fotos de referência do orçamento.
   */
  avatar_url?: string;
}

// --- CORE ENTITIES ---
export interface DbEntity {
  id: string;
  user_id?: string; // Ownership tracking
  created_at?: string;
  updated_at?: string;
  [key: string]: any; // Allow dynamic access for generic hooks
}

export interface GlobalCategory {
  id: string;
  user_id?: string;
  name: string;
  domain: 'finance' | 'inventory' | 'crm';
  parent_id?: string | null;
  color?: string;
  is_active: boolean;
  /** fixo | variavel | undefined. Não classificado fica fora do ponto de
   *  equilíbrio de propósito — ver saudeDoCaixa.ts. */
  natureza?: 'fixo' | 'variavel' | null;
  /**
   * Gasto desta categoria entra no CPV (custo dos produtos vendidos).
   *
   * Eixo separado da natureza, porque os dois não coincidem: comissão de
   * vendedor é variável e NÃO é CPV (despesa comercial); tecido é variável E é
   * CPV. Uma coluna só obrigaria a escolher qual das duas perguntas responder.
   *
   * Substituiu o centro de custo no cálculo de lucro bruto: aquele campo era
   * preenchido em todo lançamento e alimentava apenas este `if`.
   */
  custo_do_produto?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CompanyProfile {
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  website?: string;
  logo_url?: string;
  primary_color?: string;

  // Banking Info
  bank_name?: string;
  agency?: string;         // primary field in DB
  bank_agency?: string;    // alias used in pdfService / BudgetPreviewModal
  account_number?: string; // primary field in DB
  bank_account?: string;   // alias used in pdfService / BudgetPreviewModal
  bank_holder?: string;
  pix_key?: string;
  bank_info?: string;
  /** Banco cadastrado que sai no orçamento (cadastros_v3_1.sql). */
  banco_do_orcamento_id?: string | null;
  /** Preenchido na leitura do perfil (Task 7); aqui só o tipo. */
  banco_do_orcamento?: {
    bank_name?: string | null; agency?: string | null; account_number?: string | null;
    titular?: string | null; chave_pix?: string | null;
  } | null;

  // Settings & Goals
  payment_terms?: string;
  default_validity_days?: number;
  revenue_goal?: number;
  expense_limit?: number;
  monthly_capacity?: number;
  target_margin?: number;
  default_tax_rate?: number;
  default_commission?: number;
  labor_cost_per_hour?: number;
}

export interface Product extends DbEntity {
  name: string;
  description?: string;
  sku?: string;
  category?: string;
  global_category_id?: string;
  notes?: string;
  price_tier1?: number;
  price_tier2?: number;
  price_tier3?: number;
  /**
   * Por que cada faixa vale o que vale: a partir de que quantidade, para que
   * tipo de cliente, o que já está incluso. Separado de `notes` porque a nota
   * geral do produto fala da peça, e esta fala do preço — misturar as duas faz
   * quem consulta na hora de orçar ter que garimpar.
   */
  price_notes?: string;
  /**
   * "Este produto é o mesmo que aquele."
   *
   * Aponta para o cadastro que vale como oficial quando a mesma peça foi
   * cadastrada mais de uma vez com nomes ligeiramente diferentes ("CAMISA
   * BRIM", "Camisa de Brim", "CAMISA BRIM PROFISSIONAL"). Nada é apagado e os
   * orçamentos antigos continuam apontando para o cadastro que usaram — o que
   * muda é que histórico, médias e curva passam a somar os dois como um só.
   *
   * Sem isto a mesma peça aparece com três históricos rasos em vez de um denso,
   * e nenhum deles tem amostra para dizer coisa alguma sobre preço.
   */
  canonical_product_id?: string | null;
  average_unit_cost?: number; // Custo Dinamico (CMV) via SQL Triggers
  margin_alert?: boolean;
  // Pricing Calculator fields
  fabric_consumption_m?: number;      // metros de tecido por peça
  default_fabric_insumo_id?: string;   // insumo de tecido padrão
  labor_hourly_rate?: number;          // R$/hora por operário
  labor_workers?: number;             // nº de operários
  pieces_daily_capacity?: number;      // peças/dia
  overhead_percent?: number;          // % de insumos + energia (default 40)
}

export interface Insumo extends DbEntity {
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  average_unit_cost: number;
  category?: string;
  global_category_id?: string;
  rendimento?: number;  // metros por kg (ex: 1 kg = 3.2m). Default 1 (unidades sem conversão).
  supplier_id?: string;
  supplier_name?: string; // Denormalized name from join
  notes?: string;
  // Tecidos: as 3 faixas de preço do mesmo tecido compartilham a família.
  // A cor escolhida no item define a faixa (ver fabric_colors).
  fabric_family?: string;
  color_tier?: ColorTier;
  /** Faixa da tabela verdade (v3.1). Null em aviamento. */
  faixa_id?: string | null;
  /**
   * "Este insumo e o mesmo que aquele."
   *
   * O mesmo tecido cadastrado varias vezes com nomes diferentes, cada um com
   * seu saldo e seu custo medio — o estoque fica repartido e o CMV da peca sai
   * errado dependendo de qual foi escolhido na ficha. Aponta para o cadastro
   * oficial; as movimentacoes de cada um seguem intactas e a soma acontece na
   * leitura. Ver apelidosDeInsumo.ts.
   */
  canonical_insumo_id?: string | null;
}

/** Nome da faixa de cor do tecido: até 6 por tecido, livres desde a v3.1 (antes: Branco/Padrão/Especial). */
export type ColorTier = string;

// Cartela homologada (espelha botezini.com.br/cores).
export interface FabricColor extends DbEntity {
  fabric_family: string;
  color_name: string;
  hex: string;
  color_tier: ColorTier;
  /** Faixa da tabela verdade (v3.1). */
  faixa_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface InsumoMovement extends DbEntity {
  insumo_id: string;
  type: 'IN' | 'OUT';
  quantity: number;
  unit_cost?: number; // Needed only when type = 'IN'
  total_cost?: number;
  reference_id?: string;
  notes?: string;
  source?: OrigemDoMovimento;
  compra_item_id?: string | null;
}

export type OrigemDoMovimento = 'manual' | 'compra' | 'estorno_compra' | 'sobra' | 'uso_estoque' | 'devolucao' | 'ajuste'
  | 'producao'; // baixa automática antiga: linhas que ainda existem no banco

export interface CompraItem { id: string; compra_id: string; insumo_id: string; quantidade: number; custo_unitario: number; pedido_id?: string | null }
export interface Compra { id: string; fornecedor_id?: string | null; fornecedor_nome?: string | null; data: string; notas?: string | null; created_at: string; itens: CompraItem[] }

export interface ProductInsumo extends DbEntity {
  product_id: string;
  insumo_id: string;
  quantity: number;
}

// --- PERSONALIZAÇÃO (bordado, DTF, silk, sublimação) ---

export type TecnicaPersonalizacao = 'bordado' | 'dtf' | 'silk' | 'sublimacao';

/** Linha da tabela de referência: quanto se PRETENDE cobrar. */
export interface PersonalizacaoPreco extends DbEntity {
  tecnica: TecnicaPersonalizacao;
  descricao: string;
  unidade: string;
  valor: number;
  /** Faixa de quantidade em que o preço vale. Ambos nulos = vale sempre. */
  faixa_min?: number | null;
  faixa_max?: number | null;
  observacao?: string;
  is_active?: boolean;
}

/** Cadastro próprio da arte — o mesmo logo serve vários pedidos por anos. */
export interface ArteBordado extends DbEntity {
  nome: string;
  cliente_id?: string | null;
  cliente_nome?: string;   // denormalizado na leitura
  pontos?: number | null;
  cores_linha?: string;
  tempo_minutos?: number | null;
  /** Texto livre de propósito: caminho de rede, gaveta, pendrive, link. */
  local_do_arquivo?: string;
  largura_mm?: number | null;
  altura_mm?: number | null;
  observacoes?: string;
  feita_em?: string | null;
  is_active?: boolean;
}

/** O que foi REALMENTE cobrado. A distância para a tabela é a informação útil. */
export interface PersonalizacaoHistorico extends DbEntity {
  tecnica: TecnicaPersonalizacao;
  descricao: string;
  arte_id?: string | null;
  cliente_id?: string | null;
  quantidade: number;
  valor_unitario: number;
  data: string;
  observacao?: string;
}

/** Uma linha por técnica. Notas gerais + os números que geram sugestão. */
export interface PersonalizacaoNotas {
  tecnica: TecnicaPersonalizacao;
  notas?: string;
  preco_por_mil_pontos?: number | null;
  valor_minimo?: number | null;
  valor_da_arte?: number | null;
  updated_at?: string;
}

// --- PROSPECCAO ---
//
// O tipo Lead mora em utils/funilDeLeads porque a REGRA do funil mora la, e a
// regra e testada sem tocar no app. Reexportado aqui so para quem importa de
// '@/types' nao precisar saber disso.
export type { Lead, EtapaDoLead } from '@/utils/funilDeLeads';

/**
 * Um contato do cliente.
 *
 * Vendendo para hospital e faculdade, compras, RH e financeiro sao pessoas
 * diferentes — e o campo antigo (`Client.contact_person`) cabia uma. Ele
 * CONTINUA existindo e vira o contato principal na migracao: nada quebra, e
 * quem nunca abrir esta tela nao percebe diferenca.
 */
export interface ClientContact {
    id: string;
    client_id: string;
    user_id?: string | null;
    nome: string;
    cargo?: string | null;
    telefone?: string | null;
    email?: string | null;
    /** Quem responde quando nao se sabe para quem ligar. Um por cliente. */
    principal: boolean;
    notas?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface Client extends DbEntity {
  company_name: string;
  category?: string;
  global_category_id?: string;
  cnpj?: string;
  /** IE para a nota. "ISENTO" é valor válido, não ausência. */
  inscricao_estadual?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  // Fase 3 — condições comerciais e score derivado
  default_payment_terms?: string;
  credit_limit?: number;
  score_cached?: number;
  score_updated_at?: string;
  /**
   * Modelo de peça combinado, posição do bordado, preferência de acabamento —
   * o que se repete a cada orçamento novo deste cliente e hoje vive só na
   * memória de quem atende. Texto livre, de propósito: cada cliente tem seu
   * próprio jeito de pedir, e um formulário estruturado obrigaria a encaixar
   * a informação real numa forma que não é a dela.
   */
  notes?: string;
  /**
   * Logo, arte aprovada, peça de referência, print do modelo que o cliente
   * mandou. Mora no cliente e não no orçamento porque serve para TODOS os
   * pedidos futuros dele, não só para o que estava sendo feito quando a foto
   * chegou — sem isso, cada orçamento novo reabria a conversa "me manda a arte
   * de novo" com um cliente que já tinha mandado.
   */
  reference_photos?: string[];
  /**
   * "Este cadastro e o mesmo que aquele."
   *
   * A mesma empresa cadastrada duas vezes com grafias diferentes. Aponta para o
   * cadastro oficial; nada e apagado e os orcamentos antigos continuam
   * apontando para o que usaram. O que muda e que historico e financeiro passam
   * a somar os dois como um so. Ver apelidosDeCliente.ts.
   */
  canonical_client_id?: string | null;
  /**
   * Grupo economico: empresas DIFERENTES do mesmo dono (matriz e filiais).
   *
   * Nao confundir com canonical_client_id. A granja com tres CNPJs sao tres
   * clientes de verdade, cada um com sua nota e sua conta a receber — o grupo
   * so os amarra para quem negocia ver o total consolidado.
   */
  grupo_economico?: string | null;
}

export interface Supplier extends DbEntity {
  company_name: string;
  category?: string;
  global_category_id?: string;
  cnpj?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  default_cost_center_id?: string;
  default_sub_category?: string;
  /** Sugeridos ao lançar conta deste fornecedor — sugestão, não trava. */
  default_global_category_id?: string;
  default_planned_method?: string;
}

// --- BUDGET AGGREGATE ---

export interface BudgetCustomization {
  id: string;
  type: 'Embroidery' | 'ScreenPrint' | 'DTF' | 'Other';
  description: string;
  position: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface BudgetExtra {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export type SleeveType = 'manga_curta' | 'manga_longa' | 'sem_manga' | 'outro';
export type GenderType = 'masculino' | 'feminino' | 'infantil' | 'unissex';
// 'plus_size' já era oferecido no seletor de modelagem do orçamento e gravado
// no banco — faltava só no tipo, que dizia ser impossível.
export type FitType = 'slim' | 'regular' | 'oversized' | 'babylook' | 'plus_size';

/**
 * Uma peça de um conjunto — jaleco, calça, touca.
 *
 * Existe porque conjunto se vende por um preço só, mas se CORTA peça por peça:
 * o jaleco sai de uma malha e a calça de um brim, cada um com sua cor e seu
 * enfesto na mesa. Antes o item tinha um único tecido, então o segundo sumia do
 * orçamento e da ficha — a fábrica cortava o conjunto inteiro no tecido errado.
 *
 * Preço e quantidade NÃO moram aqui: são do conjunto. Um conjunto de 30 peças
 * é 30 jalecos e 30 calças, e cobrar por componente seria outra venda.
 */
export interface ItemComponent {
  /**
   * Produto cadastrado que esta peça é, quando existe.
   *
   * O conjunto costuma ser feito de peças que a casa já vende soltas — o jaleco
   * do conjunto é o mesmo jaleco do catálogo. Apontar para o cadastro traz o
   * nome e o tecido padrão prontos e mantém o vocabulário igual ao do resto do
   * sistema; digitar livre continua valendo para o que não tem cadastro.
   */
  product_id?: string;
  /**
   * Que peça do conjunto: "JALECO", "CALÇA", "TOUCA".
   *
   * Ausente quando a peça ainda vai ser escolhida no catálogo; definido (mesmo
   * vazio) quando o usuário optou por digitar o nome à mão. É essa distinção
   * que a tela usa para saber em qual dos dois modos desenhar a linha.
   */
  name?: string;
  fabric_insumo_id?: string;
  fabric_name?: string;
  color?: string;
  /** Consumo de tecido por conjunto, em metros — alimenta custo e compra. */
  consumption_m?: number;
  /** Observação da fábrica só para esta peça. */
  prod_notes?: string;
}

export interface BudgetItem {
  product_id: string;
  product_name: string;
  model: string;
  /**
   * Peças do conjunto. Vazio ou ausente = peça única, e aí valem os campos
   * `fabric`/`color` da própria linha. Ter as duas formas evita migrar todo o
   * histórico: orçamento antigo continua sendo lido como sempre foi.
   */
  components?: ItemComponent[];
  // Fabric — may be linked to insumos table OR plain text
  fabric_insumo_id?: string;   // FK to insumos.id
  fabric_name?: string;       // Denormalized name for quick display
  fabric: string;            // Legacy plain-text (kept for backwards compat)
  color: string;
  size: string;
  quantity: number;
  unit_price: number;
  total: number;
  // Production specification
  sleeve_type?: SleeveType;
  has_band?: boolean;
  gender?: GenderType;
  fit?: FitType;
  prod_notes?: string;        // Notas internas de produção (não vai para PDF cliente)
}

export interface Budget extends DbEntity {
  serial_number: string;
  client_id: string;
  date: string;

  items: BudgetItem[];
  customizations: BudgetCustomization[];
  extras: BudgetExtra[];

  /**
   * Caminhos das fotos de referência no bucket de anexos (não o binário).
   * Material interno de produção: a ficha de corte cita a existência delas e o
   * PDF do orçamento só as inclui se pedido explicitamente.
   */
  reference_photos?: string[];

  // Financials
  subtotal_items: number;
  subtotal_customizations: number;
  subtotal_extras: number;
  discount: number;
  total_amount: number;

  // Payment Control
  down_payment_percent: number;
  down_payment_value: number;
  delivery_payment_value: number;
  // Fase 7 — plano de pagamento opcional definido já no orçamento (mostrado no PDF)
  payment_plan?: Array<{ label: string; amount: number; due: string; method?: string }>;
  payment_method?: string;

  validity_days: number;
  /**
   * Quando o orcamento passou a "Enviado".
   *
   * Preenchido por trigger no banco, na PRIMEIRA transicao. `updated_at` nao
   * serve para isso: qualquer edicao posterior o move, e a proposta enviada ha
   * tres semanas e corrigida ontem apareceria como fresca na fila de cobranca.
   */
  sent_at?: string | null;
  delivery_time_days?: number;
  notes: string;
  /**
   * Observação geral de fábrica. NÃO sai no PDF do orçamento — é interna.
   *
   * Existe porque `notes` é comercial: vai no papel que o cliente lê, junto
   * das condições de pagamento. Recado de produção escrito lá ou vazava para
   * o cliente, ou era omitido e não chegava a quem corta. São dois leitores
   * diferentes, e um campo só obrigava a escolher qual deles ficaria sem a
   * informação.
   *
   * Aceita várias linhas e recuo por Tab; a ficha preserva a formatação.
   */
  factory_notes?: string;
  status: 'Draft' | 'Sent' | 'Approved' | 'Converted';

  generated_order_number?: string;
}

// --- ORDER AGGREGATE ---

export interface OrderItem {
  product_id: string;
  product_name?: string;
  model?: string;         // MODELO/REF — mapeado do BudgetItem.model na conversão
  quantity: number;
  size: string;
  production_stage: ProductionStage;
  fabric?: string;
  fabric_insumo_id?: string;
  fabric_name?: string;
  color?: string;
  sleeve_type?: SleeveType;
  has_band?: boolean;
  gender?: GenderType;
  fit?: FitType;
  prod_notes?: string;
  /** Peças do conjunto — copiadas do orçamento; ver ItemComponent. */
  components?: ItemComponent[];
}

export interface Order extends DbEntity {
  budget_id: string;
  budget_serial_number?: string;
  order_number: string;
  client_id: string;

  // Top-level stage for Kanban
  production_stage?: ProductionStage;

  items: OrderItem[];

  customizations?: BudgetCustomization[];
  extras?: BudgetExtra[];

  /** Copiado do orçamento na conversão. Ver Budget.reference_photos. */
  reference_photos?: string[];

  total_amount: number;
  amount_paid: number;
  discount?: number;
  /** Pedido de antes da virada das compras por pedido: fora da Lista de compras e das sobras. */
  compras_legado?: boolean;
  deadline: string;
  /** Dia em que o pedido foi entregue (Confirmar entrega). Entregas antigas têm aproximação. */
  delivered_at?: string | null;
  status: OrderStatus;
  payment_status?: PaymentStatus;
  // Fase 3 — plano de pagamento combinado (intenção; obrigações são a realização)
  payment_plan?: Array<{ label: string; amount: number; due: string }>;
  /** Observação geral de fábrica, herdada do orçamento. Só na ficha de produção. */
  factory_notes?: string;
}

/**
 * Peças acrescentadas depois que o orçamento virou pedido.
 *
 * O pedido saiu com 100 camisas e na entrega vão 120. O aditivo guarda as 20 —
 * o quê, quanto, quando e por quê — enquanto `Order.total_amount` já vem somado,
 * porque é dele que saem status de pagamento, recebíveis e indicadores.
 *
 * `obligation_id` nulo quer dizer que ninguém gerou cobrança à parte: legítimo
 * quando o cliente paga tudo junto no ato.
 */
export interface OrderAddendum {
  id: string;
  user_id?: string;
  order_id: string;
  items: Array<{
    product_id?: string | null;
    product_name: string;
    size?: string | null;
    quantity: number;
    unit_price: number;
  }>;
  amount: number;
  reason?: string | null;
  obligation_id?: string | null;
  created_at: string;
  updated_at?: string;
}

// --- FINANCE AGGREGATE (PHASE 3 ENTERPRISE) ---


export interface BankAccount extends DbEntity {
  name: string;
  type: 'checking' | 'savings' | 'cash' | 'credit_card';
  bank_name?: string;
  account_number?: string;
  agency?: string;
  initial_balance: number;
  current_balance: number;
  currency: string;
  is_active: boolean;
  /** Só existem depois de supabase/cadastros_v3_1.sql; ausentes antes disso. */
  titular?: string | null;
  chave_pix?: string | null;
}

// FinancialCategory (legado) removido no Front 4 — consolidado em GlobalCategory
// (domain='finance'). A tabela financial_categories será derrubada via SQL.


// --- CONFIGURATION TYPES ---

export interface CostCenter extends DbEntity {
  name: string;
  type: 'production' | 'administrative' | 'commercial' | 'financial';
  color: string;
  budget_limit?: number;
  is_active: boolean;
  categories: string[];
  actual?: number;
  percent?: number;
}

// --- DASHBOARD & REPORTING TYPES ---

export interface DRELine {
  label: string;
  value: number;
  level: number;
  percent?: number;
  is_deduction?: boolean;
  is_total?: boolean;
  children?: DRELine[];
}

// --- CONTAS A RECEBER (INVOICE SYSTEM) ---

/** Uma baixa/pagamento parcial numa fatura */
export interface InvoicePayment {
  id: string;
  date: string;
  amount: number;
  method?: 'PIX' | 'TED' | 'Cart\u00e3o' | 'Boleto' | 'Dinheiro' | 'Outro';
  notes?: string;
  transaction_id?: string;
}

/** Fatura vinculada a um Pedido */
export interface Invoice extends DbEntity {
  order_id: string;
  client_id: string;
  order_number: string;
  total_amount: number;
  due_date: string;
  payments: InvoicePayment[];
  paid_amount: number;
  status: 'open' | 'partial' | 'paid' | 'overdue';
  notes?: string;
}


export interface BudgetLine extends DbEntity {
  cost_center_id?: string;
  category?: string;
  year_month: string;         // 'YYYY-MM'
  budgeted_amount: number;
  notes?: string;
  // derived
  actual_amount?: number;
  percent_used?: number;
  projected_amount?: number;
}

export interface CashSnapshot extends DbEntity {
  snapshot_date: string;      // ISO date YYYY-MM-DD
  calculated_balance: number;
  confirmed_balance?: number; // null = not confirmed
  discrepancy?: number;      // confirmedBalance - calculatedBalance
  closed_by?: string;
  notes?: string;
}

// =============================================================================
// FINANCIAL V2 — Modelo Contábil Profissional
// =============================================================================

export type ObligationType = 'receivable' | 'payable';
export type ObligationStatus = 'open' | 'partial' | 'paid' | 'cancelled' | 'overdue';
export type PaymentMethod = 'PIX' | 'TED' | 'DOC' | 'Boleto' | 'Cartão' | 'Dinheiro' | 'Cheque' | 'Outro';

/** Documento financeiro imutável (o "deve") */
export interface FinancialObligation {
  id: string;
  user_id?: string;

  type: ObligationType;        // 'receivable' = a receber | 'payable' = a pagar
  status: ObligationStatus;    // armazenado, sincronizado após cada payment

  description: string;
  original_amount: number;     // ⚠️ NUNCA mutar após criação

  due_date: string;            // ISO date YYYY-MM-DD
  issue_date: string;          // Data de emissão

  category?: string;
  global_category_id?: string;
  cost_center_id?: string;
  notes?: string;
  order_id?: string;

  client_id?: string;
  supplier_id?: string;
  default_account_id?: string; // Conta bancária sugerida

  is_recurring: boolean;
  recurrence_id?: string;
  installment_no?: number;
  total_installments?: number;
  planned_method?: string;     // meio de pagamento previsto (pré-lançado)
  /** Sobrescreve a natureza da categoria nesta conta. Ver saudeDoCaixa.ts. */
  natureza_override?: 'fixo' | 'variavel' | null;

  cancelled_at?: string;
  cancelled_reason?: string;

  is_reconciled: boolean;
  unreconciled_reason?: string | null;
  unreconciled_at?: string | null;
  attachments?: string[];

  created_at: string;
  updated_at: string;
}

/** Movimento de caixa imutável (o "pagou") */
export interface ObligationPayment {
  id: string;
  user_id?: string;

  obligation_id: string;

  amount: number;
  payment_date: string;        // ISO date YYYY-MM-DD
  account_id: string;          // Obrigatório: todo payment afeta um caixa
  method: PaymentMethod;
  notes?: string;

  reversed_at?: string;        // Se não null, este payment foi estornado
  reversed_by?: string;        // FK ao payment de estorno
  reversal_of?: string;        // FK ao payment original que originou este estorno

  attachments?: string[];
  /** false = lançamento informativo: baixou a conta sem mexer no saldo do banco. */
  affects_balance?: boolean;
  created_at: string;
}

/** Obrigação com saldo calculado — vem da VIEW obligation_summary */
export interface ObligationSummary extends FinancialObligation {
  paid_amount: number;         // Soma de payments ativos (não estornados)
  remaining_amount: number;    // original_amount - paid_amount
  payment_count: number;       // Nº de payments ativos
  derived_status: ObligationStatus; // Status calculado pelo banco (source of truth)
  paid_pct: number;            // % já quitado (0-100)
  /** A receber de pedido ainda não entregue, MENOS a entrada: não é "a receber" nem "atrasada". */
  awaiting_delivery?: boolean;
  /** A receber de pedido ainda não entregue, com a entrada. É o que o "Recebido antecipado" soma. */
  pedido_em_aberto?: boolean;
}

