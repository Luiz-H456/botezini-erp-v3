import { SUPABASE_ENABLED } from './supabase';
import { Client, Product, Order, Budget, Supplier, CompanyProfile, CostCenter, BudgetLine, CashSnapshot, BankAccount, Insumo, InsumoMovement, ProductInsumo, GlobalCategory, FabricColor, PersonalizacaoPreco, PersonalizacaoHistorico, PersonalizacaoNotas, ArteBordado, TecnicaPersonalizacao } from '../types';

// Initialize Repositories
import { BudgetRepository } from '@/repositories/budgetRepository';
import { CrmRepository } from '@/repositories/crmRepository';
import { InventoryRepository } from '@/repositories/inventoryRepository';
import { FinanceRepository } from '@/repositories/financeRepository';
import { SettingsRepository } from '@/repositories/settingsRepository';
import { AttachmentRepository } from '@/repositories/attachmentRepository';
import { EnvelopeRepository } from '@/repositories/envelopeRepository';
import { PcpRepository } from '@/repositories/pcpRepository';
import { OrderRepository } from '@/repositories/orderRepository';
import { globalCategoryRepository } from '../repositories/globalCategoryRepository';
import { boardRepository } from '@/repositories/boardRepository';
import { leadRepository } from '@/repositories/leadRepository';
import { personalizacaoRepository } from '@/repositories/personalizacaoRepository';

const budgetRepository = new BudgetRepository();
const orderRepository = new OrderRepository();
const crmRepository = new CrmRepository();
const inventoryRepository = new InventoryRepository();
const financeRepository = new FinanceRepository();
const settingsRepository = new SettingsRepository();
const attachmentRepository = new AttachmentRepository();
const envelopeRepository = new EnvelopeRepository();
const pcpRepository = new PcpRepository();

/**
 * STORAGE SERVICE FACADE
 * Delegates all operations to specialized repositories.
 */
export const storageService = {

  // -- GLOBAL CATEGORIES (NEW UNIFIED SYSTEM) --
  getGlobalCategories: async (domain: 'finance' | 'inventory' | 'crm', opcoes?: { estrito?: boolean }): Promise<GlobalCategory[]> => globalCategoryRepository.getByDomain(domain, opcoes),
  saveGlobalCategory: async (category: Partial<GlobalCategory>) => globalCategoryRepository.save(category),
  deleteGlobalCategory: async (id: string) => globalCategoryRepository.delete(id),

  // -- SETTINGS & CATEGORIES (Local Cache + Sync) --
  getCategories: (type: string) => {
    const local = localStorage.getItem(`botezini_cat_${type}`);
    if (SUPABASE_ENABLED) {
      settingsRepository.getCategories(type).then(cats => {
        if (cats.length > 0) localStorage.setItem(`botezini_cat_${type}`, JSON.stringify(cats));
      }).catch(() => console.warn(`Sync categorias falhou (${type})`));
    }
    return local ? JSON.parse(local) : [];
  },

  saveCategories: async (type: string, cats: string[]) => {
    localStorage.setItem(`botezini_cat_${type}`, JSON.stringify(cats));
    await settingsRepository.saveCategories(type, cats);
  },

  getCategoryMeta: async (type: string): Promise<Record<string, any>> => settingsRepository.getCategoryMeta(type),
  saveCategoryMeta: async (type: string, metaMap: Record<string, any>) => settingsRepository.saveCategoryMeta(type, metaMap),

  // -- ATTACHMENTS --
  uploadAttachment: async (file: File, folder: string): Promise<string> => attachmentRepository.uploadAttachment(file, folder),
  getAttachmentUrl: async (path: string): Promise<string> => attachmentRepository.getAttachmentUrl(path),
  getAttachmentDataUrl: async (path: string): Promise<string> => attachmentRepository.getAttachmentDataUrl(path),
  supportsReferencePhotos: async (): Promise<boolean> => budgetRepository.supportsReferencePhotos(),
  deleteAttachment: async (path: string) => attachmentRepository.deleteAttachment(path),
  contarOutrasReferencias: async (path: string, idDoAtual: string) => attachmentRepository.contarOutrasReferencias(path, idDoAtual),

  // -- COMPANY PROFILE --
  getCompanyProfile: async (): Promise<CompanyProfile | null> => crmRepository.getCompanyProfile(),
  saveCompanyProfile: async (profile: CompanyProfile) => crmRepository.saveCompanyProfile(profile),

  // -- FINANCE PRESETS (persistência no banco; Front 3) --
  getFinancePresets: async () => crmRepository.getFinancePresets(),
  saveFinancePresets: async (presets: Array<{ name: string; config: any }>) => crmRepository.saveFinancePresets(presets),

  // -- LOOKUP VALUES --
  getLookupValues: async (category?: string) => settingsRepository.getLookupValues(category),
  saveLookupValue: async (lv: any) => settingsRepository.saveLookupValue(lv),

  // -- PRICING DEFAULTS --
  getPricingDefaults: async () => settingsRepository.getPricingDefaults(),
  savePricingDefaults: async (defaults: any) => settingsRepository.savePricingDefaults(defaults),

  // -- FINANCIAL SETTINGS --
  getCostCenters: async (): Promise<CostCenter[]> => financeRepository.getCostCenters(),
  saveCostCenter: async (costCenter: CostCenter): Promise<CostCenter> => financeRepository.saveCostCenter(costCenter),
  deleteCostCenter: async (id: string) => financeRepository.deleteCostCenter(id),

  // -- CRM (CLIENTES / FORNECEDORES) --
  getClients: async (): Promise<Client[]> => crmRepository.getClients(),
  saveClient: async (client: Client): Promise<Client> => crmRepository.saveClient(client),
  supportsClientPhotos: async (): Promise<boolean> => crmRepository.supportsClientPhotos(),
  deleteClient: async (id: string) => crmRepository.deleteClient(id),

  getSuppliers: async (): Promise<Supplier[]> => crmRepository.getSuppliers(),
  saveSupplier: async (supplier: Supplier): Promise<Supplier> => crmRepository.saveSupplier(supplier),
  deleteSupplier: async (id: string) => crmRepository.deleteSupplier(id),

  // -- INVENTORY (INSUMOS / PRODUTOS / PEDIDOS) --
  verifyInventoryTable: async () => inventoryRepository.verifyTableAccess(),
  getInsumos: async (): Promise<Insumo[]> => inventoryRepository.getInsumos(),
  getInsumosPaginated: async (page: number, pageSize: number, search?: string, category?: string): Promise<{ data: Insumo[], count: number }> => inventoryRepository.getInsumosPaginated(page, pageSize, search, category),
  saveInsumo: async (item: Partial<Insumo>) => inventoryRepository.saveInsumo(item),
  definirPrecoDeReferencia: async (id: string, preco: number) => inventoryRepository.definirPrecoDeReferencia(id, preco),
  deleteInsumo: async (id: string) => inventoryRepository.deleteInsumo(id),
  getFabricColors: async (): Promise<FabricColor[]> => inventoryRepository.getFabricColors(),
  saveFabricColors: async (family: string, cores: Partial<FabricColor>[]): Promise<void> =>
    inventoryRepository.saveFabricColors(family, cores),

  getInsumoMovements: async (insumoId?: string): Promise<InsumoMovement[]> => inventoryRepository.getInsumoMovements(insumoId),

  getProductInsumos: async (productId: string): Promise<ProductInsumo[]> => inventoryRepository.getProductInsumos(productId),
  saveProductInsumo: async (mat: Partial<ProductInsumo>) => inventoryRepository.saveProductInsumo(mat),
  deleteProductInsumo: async (id: string) => inventoryRepository.deleteProductInsumo(id),
  // -- CONTATOS DO CLIENTE --
  getClientContacts: async (clientId?: string) => crmRepository.getClientContacts(clientId),
  saveClientContact: async (c: Parameters<typeof crmRepository.saveClientContact>[0]) => crmRepository.saveClientContact(c),
  deleteClientContact: async (id: string) => crmRepository.deleteClientContact(id),

  // -- LEADS (prospeccao) --
  getLeads: async () => leadRepository.getAll(),
  saveLead: async (lead: Parameters<typeof leadRepository.salvar>[0]) => leadRepository.salvar(lead),
  moverLead: async (...args: Parameters<typeof leadRepository.moverEtapa>) => leadRepository.moverEtapa(...args),
  excluirLead: async (id: string) => leadRepository.excluir(id),
  importarLeads: async (linhas: Parameters<typeof leadRepository.importar>[0]) => leadRepository.importar(linhas),
  leadDoCliente: async (clientId: string) => leadRepository.porCliente(clientId),

  getFichaPorProduto: async (): Promise<Map<string, string[]>> => inventoryRepository.getFichaPorProduto(),
  getProductInsumosByProducts: async (ids: string[]) => inventoryRepository.getProductInsumosByProducts(ids),

  // -- PERSONALIZAÇÃO (bordado / DTF / silk / sublimação) --
  personalizacaoMigrada: async (): Promise<boolean> => personalizacaoRepository.migracaoAplicada(),
  getPersonalizacaoPrecos: async (): Promise<PersonalizacaoPreco[]> => personalizacaoRepository.getPrecos(),
  savePersonalizacaoPreco: async (p: Partial<PersonalizacaoPreco>) => personalizacaoRepository.savePreco(p),
  deletePersonalizacaoPreco: async (id: string) => personalizacaoRepository.deletePreco(id),
  getArtesBordado: async (): Promise<ArteBordado[]> => personalizacaoRepository.getArtes(),
  saveArteBordado: async (a: Partial<ArteBordado>) => personalizacaoRepository.saveArte(a),
  deleteArteBordado: async (id: string) => personalizacaoRepository.deleteArte(id),
  getPersonalizacaoHistorico: async (): Promise<PersonalizacaoHistorico[]> => personalizacaoRepository.getHistorico(),
  savePersonalizacaoHistorico: async (h: Partial<PersonalizacaoHistorico>) => personalizacaoRepository.saveHistorico(h),
  deletePersonalizacaoHistorico: async (id: string) => personalizacaoRepository.deleteHistorico(id),
  getPersonalizacaoNotas: async (): Promise<PersonalizacaoNotas[]> => personalizacaoRepository.getNotas(),
  savePersonalizacaoNotas: async (n: Partial<PersonalizacaoNotas> & { tecnica: TecnicaPersonalizacao }) =>
    personalizacaoRepository.saveNotas(n),

  getProducts: async (): Promise<Product[]> => inventoryRepository.getProducts(),
  saveProduct: async (product: Product): Promise<Product> => inventoryRepository.saveProduct(product),
  deleteProduct: async (id: string) => inventoryRepository.deleteProduct(id),

  getOrders: async (): Promise<Order[]> => inventoryRepository.getOrders(),
  saveOrder: async (order: Order) => inventoryRepository.saveOrder(order),
  // Sempre pela cascata: o DELETE cru deixava a conta a receber órfã no
  // financeiro (order_id é ON DELETE SET NULL, a conta sobrevive vencida).
  deleteOrder: async (id: string) => orderRepository.deleteOrderWithCascade(id),

  // -- ORÇAMENTOS (Budgets) --
  getBudgets: async () => budgetRepository.getAll(),
  saveBudget: async (budget: Budget) => budgetRepository.save(budget),
  deleteBudget: async (id: string) => budgetRepository.delete(id),

  // -- FINANCEIRO (BudgetLines, CashFlow) --
  getBankAccounts: async (onlyActive = true): Promise<BankAccount[]> => financeRepository.getBankAccounts(onlyActive),
  saveBankAccount: async (ba: BankAccount): Promise<void> => financeRepository.saveBankAccount(ba),
  deleteBankAccount: async (id: string): Promise<void> => financeRepository.deleteBankAccount(id),
  reactivateBankAccount: async (id: string): Promise<void> => financeRepository.reactivateBankAccount(id),

  getBudgetLines: async (yearMonth?: string): Promise<BudgetLine[]> => financeRepository.getBudgetLines(yearMonth),
  saveBudgetLine: async (bl: BudgetLine) => financeRepository.saveBudgetLine(bl),
  deleteBudgetLine: async (id: string) => financeRepository.deleteBudgetLine(id),

  getCashSnapshots: async (limit = 30): Promise<CashSnapshot[]> => financeRepository.getCashSnapshots(limit),
  saveCashSnapshot: async (snap: CashSnapshot): Promise<void> => financeRepository.saveCashSnapshot(snap),

  // -- FINANCIAL V2 (Professional Accounting) --
  getObligations: async (opts?: any) => financeRepository.getObligations(opts),
  getObligationPayments: async (obligationId: string) => financeRepository.getObligationPayments(obligationId),
  getOrderAddendums: async (order_id: string) => orderRepository.getOrderAddendums(order_id),
  addOrderAddendum: async (e: Parameters<typeof orderRepository.addOrderAddendum>[0]) => orderRepository.addOrderAddendum(e),
  removeOrderAddendum: async (id: string) => orderRepository.removeOrderAddendum(id),
  getAllPayments: async () => financeRepository.getAllPayments(),
  getContasPorObrigacao: async () => financeRepository.getContasPorObrigacao(),
  getAllPaymentsComTeto: async () => financeRepository.getAllPaymentsComTeto(),
  createObligation: async (o: any) => financeRepository.createObligation(o),
  createOrderReceivable: async (opts: Parameters<FinanceRepository['createOrderReceivable']>[0]) => financeRepository.createOrderReceivable(opts),
  getOrderFinancialStatus: async (orderId?: string) => financeRepository.getOrderFinancialStatus(orderId),
  // Fase 2 — controles de recebíveis
  getDeliveredUnpaid: async () => financeRepository.getDeliveredUnpaid(),
  getAdvanceReceived: async () => financeRepository.getAdvanceReceived(),
  getClientReceivables: async () => financeRepository.getClientReceivables(),
  getPaymentMethodBreakdown: async (start: string, end: string) => financeRepository.getPaymentMethodBreakdown(start, end),
  // Fase 3 — score e plano de pagamento
  getClientScore: async (clientId: string) => financeRepository.getClientScore(clientId),
  refreshClientScores: async () => financeRepository.refreshClientScores(),
  applyOrderPaymentPlan: async (opts: Parameters<FinanceRepository['applyOrderPaymentPlan']>[0]) => financeRepository.applyOrderPaymentPlan(opts),
  reviseOrderPlan: async (opts: Parameters<FinanceRepository['reviseOrderPlan']>[0]) => financeRepository.reviseOrderPlan(opts),
  getPendingInstallments: async () => financeRepository.getPendingInstallments(),
  // Fase 6 — Caixinhas (envelopes virtuais)
  getEnvelopes: async (includeArchived = false) => envelopeRepository.getEnvelopes(includeArchived),
  getEnvelopeOverview: async () => envelopeRepository.getOverview(),
  saveEnvelope: async (env: Parameters<EnvelopeRepository['saveEnvelope']>[0]) => envelopeRepository.saveEnvelope(env),
  deleteEnvelope: async (id: string) => envelopeRepository.deleteEnvelope(id),
  moveEnvelope: async (envelopeId: string, delta: number, notes?: string) => envelopeRepository.move(envelopeId, delta, notes),
  transferEnvelope: async (from: string, to: string, amount: number, notes?: string) => envelopeRepository.transfer(from, to, amount, notes),
  getEnvelopeMovements: async (envelopeId: string) => envelopeRepository.getMovements(envelopeId),
  fundEnvelopes: async (base: number) => envelopeRepository.fund(base),
  // PCP — setores e capacidade (Fase 1B)
  getSectors: async (includeInactive = false, opcoes?: { estrito?: boolean }) => pcpRepository.getSectors(includeInactive, opcoes),
  saveSector: async (s: Parameters<PcpRepository['saveSector']>[0]) => pcpRepository.saveSector(s),
  deleteSector: async (id: string) => pcpRepository.deleteSector(id),
  getCapacityConfig: async () => pcpRepository.getCapacityConfig(),
  saveCapacityConfig: async (cfg: Parameters<PcpRepository['saveCapacityConfig']>[0]) => pcpRepository.saveCapacityConfig(cfg),
  getProductionLogs: async (orderId?: string) => pcpRepository.getProductionLogs(orderId),
  logProduction: async (opts: Parameters<PcpRepository['logProduction']>[0]) => pcpRepository.logProduction(opts),
  // PCP — atrasos justificados (Fase 2)
  getOrderDelays: async () => pcpRepository.getDelays(),
  registrarOrderDelay: async (opts: Parameters<PcpRepository['registrarDelay']>[0]) => pcpRepository.registrarDelay(opts),
  deleteOrderDelay: async (id: string) => pcpRepository.deleteDelay(id),
  // Fase 4 — reconciliação
  getOrderReconciliation: async (orderId: string) => financeRepository.getOrderReconciliation(orderId),
  getOrdersNeedingReconciliation: async () => financeRepository.getOrdersNeedingReconciliation(),
  applyOrderAdjustment: async (orderId: string, delta: number, reason?: string, dueDate?: string) => financeRepository.applyOrderAdjustment(orderId, delta, reason, dueDate),
  createRecurrenceObligations: async (opts: any) => financeRepository.createRecurrenceObligations(opts),
  payObligation: async (opts: any) => financeRepository.payObligation(opts),
  registerInformationalPayment: async (opts: Parameters<typeof financeRepository.registerInformationalPayment>[0]) => financeRepository.registerInformationalPayment(opts),
  setBankBalance: async (account_id: string, new_balance: number, reason?: string) => financeRepository.setBankBalance(account_id, new_balance, reason),
  reversePayment: async (payment_id: string, reason?: string) => financeRepository.reversePayment(payment_id, reason),
  cancelObligation: async (obligation_id: string, reason?: string) => financeRepository.cancelObligation(obligation_id, reason),
  cancelObligationSeries: async (obligation_id: string, reason?: string, apenasFuturas?: boolean) => financeRepository.cancelObligationSeries(obligation_id, reason, apenasFuturas), 
  updateObligation: async (id: string, updates: any) => financeRepository.updateObligation(id, updates),
  corrigirContasEmAberto: async (
    updates: Array<{ id: string; original_amount?: number; due_date?: string; description?: string }>,
  ) => financeRepository.corrigirContasEmAberto(updates),
  updateObligationsBatch: async (updates: any[]) => financeRepository.updateObligationsBatch(updates),
  recalculateAllBankBalances: async () => financeRepository.recalculateAllBankBalances(),
  getCashPosition: async (start?: string | null, end?: string | null) => financeRepository.getCashPosition(start, end),
  getAgingBuckets: async (referenceDate?: string) => financeRepository.getAgingBuckets(referenceDate),
  getCashflowSeries: async (start: string, end: string) => financeRepository.getCashflowSeries(start, end),
  getLiquidityKPIs: async (start: string, end: string) => financeRepository.getLiquidityKPIs(start, end),
  toggleReconciliation: async (obligationId: string): Promise<boolean> => financeRepository.toggleReconciliation(obligationId),
  marcarConferida: async (obligationId: string): Promise<boolean> => financeRepository.marcarConferida(obligationId),
  undoReconciliation: async (obligationId: string, reason: string): Promise<boolean> => financeRepository.undoReconciliation(obligationId, reason),

  // -- QUADRO DE NOTAS (pessoal) --
  getBoardNotes: async () => boardRepository.getNotes(),
  createBoardNote: async (note: Parameters<typeof boardRepository.createNote>[0]) => boardRepository.createNote(note),
  updateBoardNoteContent: async (id: string, patch: Parameters<typeof boardRepository.updateContent>[1]) => boardRepository.updateContent(id, patch),
  updateBoardNoteGeometry: async (id: string, patch: Parameters<typeof boardRepository.updateGeometry>[1]) => boardRepository.updateGeometry(id, patch),
  deleteBoardNote: async (id: string) => boardRepository.deleteNote(id),
  getBoardConnections: async () => boardRepository.getConnections(),
  createBoardConnection: async (fromId: string, toId: string, color: Parameters<typeof boardRepository.createConnection>[2]) => boardRepository.createConnection(fromId, toId, color),
  deleteBoardConnection: async (id: string) => boardRepository.deleteConnection(id),
  getBoardDrawings: async () => boardRepository.getDrawings(),
  createBoardDrawing: async (drawing: Parameters<typeof boardRepository.createDrawing>[0]) => boardRepository.createDrawing(drawing),
  deleteBoardDrawing: async (id: string) => boardRepository.deleteDrawing(id),
};
