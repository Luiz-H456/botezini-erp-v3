import { useState, useEffect, useMemo } from 'react';
import { storageService } from '@/services/storage';
import {
  Client,
  Product,
  Supplier,
  CompanyProfile,
} from '@/types';
import { Building2 } from 'lucide-react';
import { formatCurrency } from '@/utils';
import { ITENS_POR_PAGINA } from '@/utils/constants';
import { ordenarPorSecao, secaoDaLinha } from '@/utils/listaPorSetor';
import type { Setor } from '@/utils/listaPorSetor';
import { IndicadorRecarga } from '@/components/common/IndicadorRecarga';
import { useMasterData } from '@/hooks/useMasterData';
import { useMasterDataActions } from '@/hooks/useMasterDataActions';
import { useFilteredPaginatedData } from '@/hooks/useFilteredPaginatedData';
import { useToast } from '@/hooks/useToast';
import { useInventoryMutations } from '@/hooks/useInventoryQueries';
import { Pagination } from '@/components/common/Pagination';
import { EntityModal, DeleteConfirmModal, GlobalCategoryQuickAdd } from '@/components/modals';
import { ClientForm, SupplierForm, ProductForm } from '@/components/masterdata';
import { GlobalCategorySelect } from '@/components/masterdata/GlobalCategorySelect';
import BancosPanel from '@/components/cadastros/BancosPanel';
import { ROTULO } from '@/components/finance/ui/estilo';
import { CompanyTab } from '@/pages/masterdata/CompanyTab';
import { EntityListTab } from '@/pages/masterdata/EntityListTab';
import { MensagensTab } from '@/pages/masterdata/MensagensTab';
import { CategoriasTab } from '@/pages/masterdata/CategoriasTab';
import { PainelDeCompletude } from '@/pages/masterdata/PainelDeCompletude';
import { PaginaDoCliente } from '@/pages/masterdata/PaginaDoCliente';
import { PaginaDoFornecedor } from '@/pages/masterdata/PaginaDoFornecedor';
import { PaginaDoGrupo } from '@/pages/masterdata/PaginaDoGrupo';
import { BarraDeGrupo } from '@/components/masterdata/BarraDeGrupo';
import ProductInsumosForm from '@/components/masterdata/ProductInsumosForm';
import { ClientesDormentes } from '@/components/masterdata/ClientesDormentes';
import { BotaoMensagem } from '@/components/common/BotaoMensagem';
import { msgPrimeiroContato, msgCompletarCadastro } from '@/utils/mensagensCliente';

import { mensagemDeErro } from '@/utils/errorHandling';
export type TabId = 'company' | 'clients' | 'suppliers' | 'products' | 'bancos' | 'categorias' | 'mensagens';
type ModalEntityType = 'client' | 'supplier' | 'product';

/** Quem abre um cartão já apontando para algo dentro dele (fila do Início, PCP). */
export type AberturaDeCadastro = { clienteId?: string; fornecedorId?: string; dormentes?: boolean; completude?: boolean };

const DEFAULT_PROFILE: CompanyProfile = {
  name: '',
  cnpj: '',
  email: '',
  phone: '',
  address: '',
  website: '',
  logo_url: '',
  bank_name: '',
  agency: '',
  account_number: '',
  bank_holder: '',
  pix_key: '',
  revenue_goal: 0,
  expense_limit: 0,
  default_tax_rate: 0,
};

interface Props {
  /** Qual cartão do fichário: cada um monta o MasterData com a sua aba, fixa. */
  aba: TabId;
  abertura?: AberturaDeCadastro | null;
  limparAbertura?: () => void;
  onProfileUpdate?: () => void;
  /** Sai dos Cadastros para outra tela — usado pela página do cliente para
   *  abrir o orçamento pelo número. Mesmo canal do deep-link de produto. */
  onNavigate?: (view: 'budgets' | 'orders' | 'inventory', searchTerm?: string) => void;
  /** Deep-link: abre direto a edição deste produto (ex.: criar ficha técnica). */
  openProductId?: string;
  clearOpenProduct?: () => void;
}

export default function MasterData({ aba, abertura, limparAbertura, onProfileUpdate, openProductId, clearOpenProduct, onNavigate }: Props) {
  const activeTab = aba;
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<ModalEntityType | null>(null);
  const [editingItem, setEditingItem] = useState<Partial<Client | Supplier | Product>>({});
  const [isCategoryQuickAddOpen, setIsCategoryQuickAddOpen] = useState(false);
  /**
   * Cliente com a página completa aberta. Guarda o ID, não o objeto: o cliente
   * é relido de `clients` na hora de renderizar, senão a página mostraria uma
   * cópia congelada de antes da última edição.
   */
  const [clienteAberto, setClienteAberto] = useState<string | null>(null);
  /** Fornecedor com a página aberta (tabela de preços, v3.1). Id pelo mesmo motivo do cliente. */
  const [fornecedorAberto, setFornecedorAberto] = useState<string | null>(null);
  /** Grupo econômico com a página consolidada aberta. */
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);
  /** Clientes marcados para a ação em lote de grupo. */
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  
  const [itemToDelete, setItemToDelete] = useState<{
    id: string;
    type: ModalEntityType | 'costCenter';
    name: string;
  } | null>(null);

  const { showToast } = useToast();
  const {
    clients,
    suppliers,
    products,
    companyProfile: loadedProfile,
    productCategoryMetas,
    globalCategories,
    isLoading,
    recarregando,
    loadData,
  } = useMasterData();

  const { isSaving, setIsSaving, errors, setErrors, handleSaveEntity, executeDelete } = useMasterDataActions({
    loadData,
    setIsModalOpen,
    setItemToDelete,
    showToast,
  });

  const [companyProfile, setCompanyProfile] =
    useState<CompanyProfile>(DEFAULT_PROFILE);

  useEffect(() => {
    if (loadedProfile) setCompanyProfile(loadedProfile);
  }, [loadedProfile]);

  // Deep-link (vindo da Produção): abre a edição do produto, onde fica a Ficha
  // Técnica (BOM). Espera os produtos carregarem.
  useEffect(() => {
    if (!openProductId) return;
    const prod = products.find(p => p.id === openProductId);
    if (prod) {
      setModalType('product');
      setEditingItem(prod);
      setErrors({});
      setIsModalOpen(true);
      clearOpenProduct?.();
    }
  }, [openProductId, products]);

  // Abertura: espera a primeira carga e devolve. `dormentes` e `completude` vão
  // direto do prop para os painéis — eles leem ao montar, antes deste efeito limpar.
  useEffect(() => {
    if (!abertura || isLoading) return;
    if (abertura.clienteId && clients.some(c => c.id === abertura.clienteId)) setClienteAberto(abertura.clienteId);
    if (abertura.fornecedorId && suppliers.some(s => s.id === abertura.fornecedorId)) setFornecedorAberto(abertura.fornecedorId);
    limparAbertura?.();
  }, [abertura, clients, suppliers, isLoading]);

  const { saveProductInsumoMutation } = useInventoryMutations();

  const handleApplyCalculator = async (calcData: { fabric_insumo_id: string; fabric_consumption_m: number }) => {
    if (!editingItem) return;
    const prod = editingItem as Partial<Product>;

    if (prod.id) {
      try {
        await saveProductInsumoMutation.mutateAsync({
          product_id: prod.id,
          insumo_id: calcData.fabric_insumo_id,
          quantity: calcData.fabric_consumption_m,
        });
        showToast('Ficha técnica atualizada com o tecido da calculadora', 'success');
      } catch (err) {
        console.error('Error syncing material:', err);
      }
    }
  };

  const getDataForTab = (): (Client | Supplier | Product)[] => {
    if (activeTab === 'clients') return clients;
    if (activeTab === 'suppliers') return suppliers;
    if (activeTab === 'products') return products;
    return [];
  };

  /** Setor a que as categorias desta aba deveriam pertencer. */
  const setorDaAba: Setor = activeTab === 'products' ? 'inventory' : 'crm';

  const nomeDoItem = (item: any) => item.company_name || item.name || '';

  // Ordena ANTES de paginar. Paginar primeiro e agrupar dentro da página
  // espalharia a mesma categoria por várias páginas — exatamente a
  // desorganização que o agrupamento existe para resolver. Filtro de busca e
  // fatiamento preservam a ordem, então basta ordenar aqui na entrada.
  const dadosOrdenados = useMemo(
    () => ordenarPorSecao(getDataForTab() as any[], globalCategories, setorDaAba, nomeDoItem)
      .map(l => l.item),
    [clients, suppliers, products, activeTab, globalCategories, setorDaAba]);

  const {
    paginatedData,
    totalPages,
    currentPage,
    setCurrentPage,
  } = useFilteredPaginatedData(dadosOrdenados, searchTerm, ITENS_POR_PAGINA);

  // A seção de cada linha é recalculada só sobre o recorte visível: já está na
  // ordem certa, e o cabeçalho repetido no topo da página seguinte cobre o
  // grupo que atravessa a fronteira da paginação.
  const linhasAgrupadas = useMemo(
    () => (paginatedData as any[]).map(item => ({
      item,
      secao: secaoDaLinha(item, globalCategories, setorDaAba),
    })),
    [paginatedData, globalCategories, setorDaAba]);


  /**
   * Grava o grupo em todos os clientes marcados, um a um.
   *
   * Sequencial e não em paralelo: são poucos registros, e uma falha no meio de
   * um lote paralelo deixaria metade no grupo novo e metade fora — o tipo de
   * estado pela metade que ninguém percebe até o total do grupo sair errado.
   */
  const aplicarGrupoEmLote = async (grupo: string | null) => {
    const alvos = clients.filter(c => selecionados.has(c.id));
    try {
      for (const c of alvos) {
        await storageService.saveClient({ ...c, grupo_economico: grupo });
      }
      showToast(
        grupo
          ? `${alvos.length} empresa(s) em "${grupo}"`
          : `${alvos.length} empresa(s) fora de grupo`,
        'success');
      setSelecionados(new Set());
      loadData();
    } catch (e: any) {
      showToast(`Erro ao agrupar: ${mensagemDeErro(e, 'desconhecido')}`, 'error');
    }
  };

  const handleOpenModal = (type: ModalEntityType, item?: any) => {
    setModalType(type);
    setEditingItem(item || {});
    setErrors({});
    setIsModalOpen(true);
  };

  // Fila de produtos sem ficha técnica. Guarda só os ids: o produto em si é
  // relido de `products` na hora de abrir, senão o editor abriria com uma cópia
  // congelada de antes da última edição.
  const [filaFichas, setFilaFichas] = useState<string[]>([]);

  const abrirFichaDoProduto = (id: string, resto: string[]) => {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    setFilaFichas(resto);
    handleOpenModal('product', prod);
  };

  // Fechar a edição de um produto (por Cancelar, Salvar ou fim do mutirão) pode ter mudado
  // fichas e custo: a versão nova faz o painel de Completude reler, sem remontar.
  const [versaoDaCompletude, setVersaoDaCompletude] = useState(0);
  useEffect(() => {
    if (!isModalOpen && modalType === 'product') setVersaoDaCompletude(v => v + 1);
  }, [isModalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const comecarMutirao = (ids: string[]) => {
    if (ids.length === 0) return;
    abrirFichaDoProduto(ids[0], ids.slice(1));
  };

  const proximaFicha = () => {
    if (filaFichas.length === 0) {
      setIsModalOpen(false);
      showToast('Fichas técnicas concluídas', 'success');
      return;
    }
    abrirFichaDoProduto(filaFichas[0], filaFichas.slice(1));
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await storageService.saveCompanyProfile(companyProfile);
      onProfileUpdate?.();
      showToast('Dados atualizados!', 'success');
    } catch (e: any) {
      const msg = mensagemDeErro(e, 'Erro desconhecido');
      console.error('saveCompanyProfile error:', e);
      showToast(`Falha ao salvar perfil: ${msg}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };


  // Categoria unificada: um único seletor baseado no catálogo global.
  // Grava `global_category_id` E `category` (nome) juntos — sem duplicidade.
  const catDomain: 'crm' | 'inventory' = modalType === 'product' ? 'inventory' : 'crm';
  const categorySelect = modalType && (
    <GlobalCategorySelect
      categories={globalCategories}
      domain={catDomain}
      value={(editingItem as any).global_category_id}
      onChange={(id, name) => setEditingItem({ ...editingItem, global_category_id: id || undefined, category: name || undefined })}
      incluirOutrosSetores
      onCreateNew={() => setIsCategoryQuickAddOpen(true)}
    />
  );

  const renderEntityForm = () => {
    if (modalType === 'client')
      return (
        <ClientForm
          data={editingItem as Partial<Client>}
          onChange={setEditingItem}
          categorySelect={categorySelect!}
          clientes={clients}
        />
      );
    if (modalType === 'supplier')
      return (
        <SupplierForm
          data={editingItem as Partial<Supplier>}
          onChange={setEditingItem}
          categorySelect={categorySelect!}
        />
      );
    if (modalType === 'product') {
      const prod = editingItem as Partial<Product>;
      return (
        <>
          <ProductForm
            data={prod}
            onChange={setEditingItem}
            categorySelect={categorySelect!}
            companyProfile={companyProfile}
            productCategoryMetas={productCategoryMetas}
            onApplyCalculator={handleApplyCalculator}
          />
          <div className="mt-6 pt-6 border-t border-zinc-800">
            <h3 className={`${ROTULO} mb-3`}>Ficha técnica</h3>
            <ProductInsumosForm
              productId={prod.id || ''}
              productName={prod.name}
              price_tier1={prod.price_tier1}
              calculatorFabricId={prod.default_fabric_insumo_id}
              calculatorFabricQtd={prod.fabric_consumption_m}
              fichasRestantes={filaFichas.length}
              onProximaFicha={proximaFicha}
            />
          </div>
        </>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="text-center p-16 text-zinc-600 flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-[10px] font-black uppercase tracking-widest">Sincronizando Banco de Dados...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative pb-20 ease-out animate-in fade-in duration-200">
      <span className="absolute right-0 top-0 z-10"><IndicadorRecarga ativo={recarregando} /></span>

      {activeTab === 'mensagens' && <MensagensTab />}

      {activeTab === 'bancos' && <BancosPanel />}

      {activeTab === 'categorias' && (
        <CategoriasTab categories={globalCategories} onChanged={loadData} />
      )}

      {activeTab === 'company' && (
        <CompanyTab
          profile={companyProfile}
          onChange={setCompanyProfile}
          onSave={handleSaveProfile}
          isSaving={isSaving}
        />
      )}

      {activeTab === 'products' && (
        <PainelDeCompletude
          versao={versaoDaCompletude}
          onAbrirProduto={(id) => {
            const prod = products.find(p => p.id === id);
            if (prod) handleOpenModal('product', prod);
          }}
          onAbrirInsumo={(nome) => onNavigate?.('inventory', nome)}
          onComecarMutirao={comecarMutirao}
          // Só ao montar (a que vem da fila do Início) rola até o painel.
          destacar={!!abertura?.completude}
          aoDestacar={limparAbertura}
        />
      )}

      {/* Clientes que saíram do próprio ritmo de compra. Fica na aba de
          Clientes e some quando alguém abre a página de um deles — ali a
          conversa já é sobre aquele cliente, e a lista viraria ruído. */}
      {activeTab === 'clients' && !clienteAberto && !grupoAberto && (
        <ClientesDormentes clients={clients} onAbrirCliente={(id) => setClienteAberto(id)} abertaInicial={!!abertura?.dormentes} />
      )}

      {activeTab === 'clients' && grupoAberto && !clienteAberto && (
        <PaginaDoGrupo
          grupo={grupoAberto}
          clientes={clients}
          onVoltar={() => setGrupoAberto(null)}
          onAbrirCliente={(id) => setClienteAberto(id)}
          onAbrirOrcamento={onNavigate ? (serial) => onNavigate('budgets', serial) : undefined}
          companyProfile={companyProfile}
        />
      )}

      {activeTab === 'clients' && clienteAberto && clients.find(c => c.id === clienteAberto) && (
        <PaginaDoCliente
          cliente={clients.find(c => c.id === clienteAberto)!}
          onVoltar={() => setClienteAberto(null)}
          onEditar={() => handleOpenModal('client', clients.find(c => c.id === clienteAberto))}
          onSalvou={loadData}
          onAbrirOrcamento={onNavigate ? (serial) => onNavigate('budgets', serial) : undefined}
          companyProfile={companyProfile}
        />
      )}

      {activeTab === 'suppliers' && fornecedorAberto && suppliers.find(s => s.id === fornecedorAberto) && (
        <PaginaDoFornecedor
          fornecedor={suppliers.find(s => s.id === fornecedorAberto)!}
          onVoltar={() => setFornecedorAberto(null)}
          onEditar={() => handleOpenModal('supplier', suppliers.find(s => s.id === fornecedorAberto))}
        />
      )}

      {(activeTab === 'clients' || activeTab === 'suppliers' || activeTab === 'products') && !clienteAberto && !grupoAberto
        && !(activeTab === 'suppliers' && fornecedorAberto) && (
        <EntityListTab
          onAbrirPagina={activeTab === 'clients' ? (item) => setClienteAberto(item.id)
            : activeTab === 'suppliers' ? (item) => setFornecedorAberto(item.id) : undefined}
          getGrupo={activeTab === 'clients'
            ? (item) => ((item as any).grupo_economico || '').trim() || undefined
            : undefined}
          onAbrirGrupo={(g) => setGrupoAberto(g)}
          selecao={activeTab === 'clients' ? {
            ids: selecionados,
            alternar: (id: string) => setSelecionados(atual => {
              const novo = new Set(atual);
              novo.has(id) ? novo.delete(id) : novo.add(id);
              return novo;
            }),
            // Marca todos da pagina; se ja estavam todos marcados, desmarca.
            alternarTodos: (ids: string[]) => setSelecionados(atual => {
              const todosMarcados = ids.length > 0 && ids.every(i => atual.has(i));
              const novo = new Set(atual);
              for (const i of ids) todosMarcados ? novo.delete(i) : novo.add(i);
              return novo;
            }),
            barra: (
              <BarraDeGrupo
                selecionados={clients.filter(c => selecionados.has(c.id))}
                todosOsClientes={clients}
                onLimpar={() => setSelecionados(new Set())}
                onAplicar={aplicarGrupoEmLote}
              />
            ),
          } : undefined}
          entityType={activeTab}
          data={linhasAgrupadas}
          setorDaPagina={setorDaAba}
          acaoGeral={activeTab === 'clients' ? (
            // Não depende de nenhum cliente: é a mensagem que se manda para
            // quem ainda nem existe no sistema.
            <BotaoMensagem titulo="Primeiro contato — pedir dados" rotulo="Msg. de primeiro contato" texto={msgPrimeiroContato()} />
          ) : null}
          renderAcaoExtra={(item) => {
            // Atalho para a pagina do grupo, so em quem pertence a um.
            const grupo = (item as any).grupo_economico?.trim();
            const botaoGrupo = activeTab === 'clients' && grupo ? (
              <button
                onClick={() => setGrupoAberto(grupo)}
                title={`Ver o grupo ${grupo}`}
                className="p-2.5 bg-zinc-950 hover:bg-zinc-900 rounded-xl text-zinc-500 hover:text-amber-500 border border-zinc-800 transition-all hover:border-amber-500/30 active:scale-90"
              >
                <Building2 size={16} />
              </button>
            ) : null;
            // Só clientes têm mensagem — fornecedor e produto não recebem
            // WhatsApp de cadastro.
            if (activeTab !== 'clients') return null;
            const c = item as any;
            const falta = msgCompletarCadastro(c);
            // BUG CORRIGIDO: o fallback era `falta || msgPrimeiroContato(c)`, e
            // msgPrimeiroContato pede TODOS os dados. Resultado: cliente com
            // cadastro completo mostrava um botão pedindo tudo de novo. Cadastro
            // completo não tem o que pedir — texto vazio, e o botão se esconde
            // sozinho. O primeiro contato mudou para o topo da lista, ao lado de
            // "Novo", que é onde ele faz sentido: antes de existir cadastro.
            return (
              <>
                {botaoGrupo}
                <BotaoMensagem
                  titulo="Pedir o que falta no cadastro"
                  telefone={c.phone}
                  texto={falta}
                />
              </>
            );
          }}
          onEdit={(item) =>
            handleOpenModal(
              activeTab === 'clients' ? 'client' : activeTab === 'suppliers' ? 'supplier' : 'product',
              item
            )
          }
          onDelete={(item) =>
            setItemToDelete({
              id: item.id,
              type: activeTab === 'clients' ? 'client' : activeTab === 'suppliers' ? 'supplier' : 'product',
              name: (item as any).company_name || (item as any).name,
            })
          }
          onAdd={() =>
            handleOpenModal(
              activeTab === 'clients' ? 'client' : activeTab === 'suppliers' ? 'supplier' : 'product'
            )
          }
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          pagination={
            totalPages > 1 ? (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={getDataForTab().length}
                itemsPerPage={ITENS_POR_PAGINA}
                onPageChange={setCurrentPage}
              />
            ) : null
          }
          getDisplayName={(item) => (item as any).company_name || (item as any).name}
          getSubInfo={(item) => (item as any).cnpj || (item as any).sku || '-'}
          getCategory={(item) => (item as any).category}
          getContactOrPrice={(item) =>
            activeTab === 'products' ? (
              <span className="font-mono text-emerald-500 font-bold">
                {formatCurrency((item as any).price_tier1 || 0)}
              </span>
            ) : (
              <>
                <p>{(item as any).contact_person || '-'}</p>
                <p className="text-xs text-zinc-500">{(item as any).phone}</p>
              </>
            )
          }
        />
      )}

      {isModalOpen && modalType && (
        <EntityModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setFilaFichas([]); }}
          onSave={async () => {
            const novoCliente = modalType === 'client' && !(editingItem as any).id;
            const salvo = await handleSaveEntity(modalType, editingItem);
            // Cliente recém-criado: a busca leva direto a ele, em vez de deixá-lo perdido na última página.
            if (salvo && novoCliente) setSearchTerm((editingItem as any).company_name || '');
          }}
          entityType={modalType as any}
          isEditing={!!(editingItem as any).id}
          isLoading={isSaving}
          errors={errors}
          maxWidth={modalType === 'product' ? '5xl' : 'lg'}
        >
          {renderEntityForm()}
        </EntityModal>
      )}

      {isCategoryQuickAddOpen && (
        <GlobalCategoryQuickAdd
          domain={catDomain}
          isOpen={isCategoryQuickAddOpen}
          onClose={() => setIsCategoryQuickAddOpen(false)}
          onCreated={(cat) => {
            loadData();
            setEditingItem((prev: any) => ({ ...prev, global_category_id: cat.id, category: cat.name }));
            setIsCategoryQuickAddOpen(false);
          }}
        />
      )}

      {itemToDelete && (
        <DeleteConfirmModal
          isOpen={!!itemToDelete}
          onClose={() => setItemToDelete(null)}
          onConfirm={() => executeDelete(itemToDelete)}
          itemName={itemToDelete.name}
          isLoading={isSaving}
        />
      )}

    </div>
  );
}
