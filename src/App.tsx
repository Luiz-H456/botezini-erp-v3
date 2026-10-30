
import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Factory, Hexagon, AlertTriangle, LogOut, Shield, ChevronRight, Eye, EyeOff, Search } from 'lucide-react';

const Inicio = lazy(() => import('@/pages/Inicio'));
const Finance = lazy(() => import('@/pages/Finance'));
const Receivables = lazy(() => import('@/components/finance/ReceivablesControlPanel').then(m => ({ default: m.ReceivablesControlPanel })));
const SaudeDoCaixa = lazy(() => import('@/components/finance/SaudeDoCaixaPanel').then(m => ({ default: m.SaudeDoCaixaPanel })));
const Envelopes = lazy(() => import('@/components/finance/EnvelopesPanel').then(m => ({ default: m.EnvelopesPanel })));
const Resultado = lazy(() => import('@/pages/Resultado'));
const PCP = lazy(() => import('@/pages/PCP').then(m => ({ default: m.PCP })));
const Budgets = lazy(() => import('@/pages/Budgets'));
const Orders = lazy(() => import('@/pages/Orders'));
const MasterData = lazy(() => import('@/pages/MasterData'));
const TabelasDeCusto = lazy(() => import('@/pages/TabelasDeCusto'));
const ItensVendidos = lazy(() => import('@/pages/ItensVendidos'));
const Login = lazy(() => import('@/pages/Login'));
const Board = lazy(() => import('@/pages/Board'));
const Leads = lazy(() => import('@/pages/Leads'));
const Fichario = lazy(() => import('@/components/cadastros/Fichario'));

import { ABAS_DA_FABRICA } from '@/utils/pcpAbas';

import { checkConnection } from '@/services/supabase';
import { authService } from '@/services/auth';
import { storageService } from '@/services/storage';
import { UserProfile, CompanyProfile } from '@/types';
import type { View, SecaoId } from '@/utils/navegacao';
import { secaoDaView, temPassos, viewInicialDaSecao, viewReal, ROTULO_DA_VIEW, secaoPorId, enderecoDaView, viewDoEndereco } from '@/utils/navegacao';
import { useFilaDoInicio } from '@/hooks/inicio/useFilaDoInicio';
import type { DestinoDaFila } from '@/utils/inicio/fila';
import { BarraDeTopo } from '@/components/layout/BarraDeTopo';
import { MenuDoApp } from '@/components/layout/MenuDoApp';
import { useTelaLarga } from '@/hooks/useTelaLarga';
import { BarraDePassos } from '@/components/layout/BarraDePassos';
import type { FiltrosDaLista } from '@/utils/financas/lista';
import { MeuPerfilModal } from '@/components/layout/MeuPerfilModal';
import CabecalhoDoCartao from '@/components/cadastros/CabecalhoDoCartao';
import type { AberturaDeCadastro } from '@/pages/MasterData';

import { carregarPreferenciaDePrivacidade } from '@/utils/privacidade';
import { usePrivacidade } from '@/hooks/usePrivacidade';

import { CentralDeAvisos } from '@/components/common/CentralDeAvisos';
import { BuscaGeral } from '@/components/layout/BuscaGeral';
import type { ResultadoDaBusca } from '@/utils/buscaGeral';
import { avisar } from '@/utils/avisos';
// Lê a preferência salva antes do primeiro render, para não haver um piscar de
// valores visíveis em quem deixou o modo privado ligado.
carregarPreferenciaDePrivacidade();

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('login');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  /**
   * Abaixo de 1024px o menu recolhe para os ícones sozinho.
   *
   * Muda o PADRÃO, não trava o botão: a largura só reposiciona o estado na
   * virada; depois disso quem manda é quem clicou.
   */
  const telaLarga = useTelaLarga();
  useEffect(() => { setIsSidebarOpen(telaLarga); }, [telaLarga]);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const [perfilAberto, setPerfilAberto] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message?: string } | null>(null);

  // Search state to pass between views
  const [autoSearchTerm, setAutoSearchTerm] = useState<string>('');
  const [aberturaBudgets, setAberturaBudgets] = useState<'Sent' | 'Approved' | 'Draft' | null>(null);
  const [aberturaBanco, setAberturaBanco] = useState<string | null>(null);
  const [aberturaReceber, setAberturaReceber] = useState<string | null>(null);
  const [aberturaSaude, setAberturaSaude] = useState<string | null>(null);
  const [tabelasSemPreco, setTabelasSemPreco] = useState(false);
  const [destaqueQuadro, setDestaqueQuadro] = useState<'atrasados' | 'ultimo-setor' | null>(null);
  // O destaque vale só para a visita ao Quadro que o pediu; o banco a conferir, só para a das Contas.
  useEffect(() => { if (currentView !== 'quadro') setDestaqueQuadro(null); }, [currentView]);
  useEffect(() => { if (currentView !== 'finance') setAberturaBanco(null); }, [currentView]);
  useEffect(() => { if (currentView !== 'receivables') setAberturaReceber(null); }, [currentView]);
  useEffect(() => { if (currentView !== 'saude-caixa') setAberturaSaude(null); }, [currentView]);
  const [filtrosParaContas, setFiltrosParaContas] = useState<Partial<FiltrosDaLista> | null>(null);
  const [aberturaClientes, setAberturaClientes] = useState<AberturaDeCadastro | null>(null);
  const [aberturaProdutos, setAberturaProdutos] = useState<AberturaDeCadastro | null>(null);
  const [aberturaFornecedores, setAberturaFornecedores] = useState<AberturaDeCadastro | null>(null);
  const [filtroDeCompras, setFiltroDeCompras] = useState<'this_week' | null>(null);
  // Mesma regra do banco: a abertura vale só para a visita que a pediu (sair antes da carga a descarta).
  useEffect(() => { if (currentView !== 'clientes') setAberturaClientes(null); }, [currentView]);
  useEffect(() => { if (currentView !== 'produtos') setAberturaProdutos(null); }, [currentView]);
  useEffect(() => { if (currentView !== 'fornecedores') setAberturaFornecedores(null); }, [currentView]);
  useEffect(() => { if (currentView !== 'compras') setFiltroDeCompras(null); }, [currentView]);

  // A fila do Início (e os contadores do menu). Fábrica e deslogado não leem nada.
  const fila = useFilaDoInicio(isAuthenticated && userProfile?.role !== 'factory');
  // Recarga (spec, seção 2): sempre ao entrar no Início; nas outras telas, no máximo a cada 30 s.
  const ultimaCargaDaFila = useRef(0);
  useEffect(() => {
    const agora = Date.now();
    if (currentView !== 'dashboard' && agora - ultimaCargaDaFila.current < 30_000) return;
    const anterior = ultimaCargaDaFila.current;
    ultimaCargaDaFila.current = agora;
    // Pedido coalescido numa carga em curso (ou inativo) não conta como carga nova.
    void fila.recarregar().then(iniciou => { if (!iniciou) ultimaCargaDaFila.current = anterior; });
  }, [currentView]); // eslint-disable-line react-hooks/exhaustive-deps

  // O perfil da empresa NÃO é carregado aqui.
  //
  // Ele mora atrás da autenticação, então pedi-lo antes de saber se há sessão
  // garante uma resposta 401 — e era metade dos erros vermelhos que apareciam
  // no console em toda abertura do sistema. Agora ele é buscado dentro do
  // checkSession, depois que a sessão se confirma.
  useEffect(() => {
    checkSession();
    checkConnection().then(setConnectionStatus);
  }, []);

  const loadCompanyProfile = async () => {
    const profile = await storageService.getCompanyProfile();
    setCompanyProfile(profile);
  };

  const checkSession = async () => {
    setIsAuthLoading(true);
    try {
      const profile = await authService.getCurrentProfile();
      if (profile) {
        setUserProfile(profile);
        setIsAuthenticated(true);
        // Só agora: há sessão, e a leitura passa pela RLS.
        loadCompanyProfile();
        // Tela inicial: a do endereço (F5 e link voltam para onde estavam); sem endereço, a do papel.
        // A fábrica tem layout fixo e sempre abre no Quadro.
        if (currentView === 'login') {
          const doEndereco = profile.role === 'factory' ? null : viewDoEndereco(window.location.hash);
          setCurrentView(doEndereco ?? (profile.role === 'factory' ? 'quadro' : 'dashboard'));
        }
      } else {
        setIsAuthenticated(false);
        setCurrentView('login');
      }
    } catch (e) {
      console.error("Session Check Failed", e);
      setIsAuthenticated(false);
      setCurrentView('login');
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Endereço por tela (auditoria C1): cada troca de tela vira uma entrada no histórico do
  // navegador, então o "voltar" anda dentro do app em vez de sair dele, e o F5 reabre a tela.
  useEffect(() => {
    if (!isAuthenticated || currentView === 'login') return;
    const alvo = enderecoDaView(currentView);
    if (window.location.hash !== alvo) window.history.pushState(null, '', alvo);
    document.title = `${ROTULO_DA_VIEW[viewReal(currentView)]} · Botezini`;
  }, [currentView, isAuthenticated]);
  useEffect(() => {
    const aoVoltar = () => {
      if (!isAuthenticated || userProfile?.role === 'factory') return;
      const v = viewDoEndereco(window.location.hash);
      if (v) setCurrentView(v);
    };
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, [isAuthenticated, userProfile?.role]);

  // Rodinha do mouse em cima de um campo de número focado mudava o valor (um preço, uma quantidade)
  // sem a pessoa perceber, ao rolar a página. Tira o foco: a página rola e o número fica (auditoria R6).
  useEffect(() => {
    const aoRolar = (e: WheelEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === 'number' && el === e.target) el.blur();
    };
    document.addEventListener('wheel', aoRolar, { passive: true });
    return () => document.removeEventListener('wheel', aoRolar);
  }, []);

  // Busca geral (auditoria R1/N2): Ctrl+K de qualquer lugar; "/" quando não se está digitando.
  const [buscaAberta, setBuscaAberta] = useState(false);
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!isAuthenticated || userProfile?.role === 'factory') return;
      const alvo = e.target as HTMLElement | null;
      const digitando = !!alvo && (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName));
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBuscaAberta(true); }
      else if (e.key === '/' && !digitando && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setBuscaAberta(true); }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [isAuthenticated, userProfile?.role]);
  const abrirDaBusca = (r: ResultadoDaBusca) => {
    if (r.tipo === 'cliente') { setAberturaClientes({ clienteId: r.chave }); handleNavigate('clientes'); }
    else if (r.tipo === 'fornecedor') { setAberturaFornecedores({ fornecedorId: r.chave }); handleNavigate('fornecedores'); }
    else if (r.tipo === 'pedido') handleNavigate('orders', r.chave);
    else if (r.tipo === 'orcamento') handleNavigate('budgets', r.chave);
    else handleNavigate('masterdata', r.chave);
  };

  // Sessão que acaba sozinha (saiu em outra aba, token vencido): volta ao login com aviso, em vez
  // de deixar a tela aberta com toda chamada falhando (segunda passada da auditoria).
  const saindoRef = useRef(false);
  useEffect(() => authService.aoSessaoTerminar(() => {
    if (saindoRef.current) { saindoRef.current = false; return; }
    setIsAuthenticated(false);
    setUserProfile(null);
    setCurrentView('login');
    avisar('Sua sessão terminou. Entre de novo para continuar de onde parou.', 'info');
  }), []);

  const handleLogout = async () => {
    saindoRef.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    document.title = 'Botezini ERP';
    await authService.signOut();
    setIsAuthenticated(false);
    setUserProfile(null);
    setCurrentView('login');
  };

  // Modo privado. O estado mora aqui, no topo da árvore, de propósito: virar a
  // chave re-renderiza todas as telas abaixo, e é isso que faz `formatCurrency`
  // ser chamada de novo e devolver a máscara. Um estado local numa tela só
  // esconderia os valores daquela tela.
  const { oculto: valoresOcultos, alternar: alternarPrivacidade } = usePrivacidade();

  const handleNavigate = (view: View, searchTerm?: string) => {
    // Chão de fábrica não navega: o layout dele é fixo e não usa handleNavigate.
    if (userProfile?.role === 'factory') return;
    // `masterdata` com id de produto (deep-link da Produção) abre Produtos, não o fichário.
    const real = viewReal(view);
    setCurrentView(real === 'cadastros' && searchTerm ? 'produtos' : real);
    if (searchTerm) {
      setAutoSearchTerm(searchTerm);
    }
  };

  /** Outra tela pede a aba Contas já filtrada (barra do Resultado, cliente em Clientes que devem). */
  const abrirContas = (f: Partial<FiltrosDaLista>) => { setFiltrosParaContas(f); setCurrentView('finance'); };

  /** Linha da fila do Início: abre o passo certo, já filtrado. */
  const abrirDestino = (d: DestinoDaFila) => {
    if (d.view === 'budgets') setAberturaBudgets(d.status);
    else if (d.view === 'quadro') setDestaqueQuadro(d.destaque);
    else if (d.view === 'finance' && 'conferirBanco' in d) setAberturaBanco(d.conferirBanco);
    else if (d.view === 'finance' && 'recorte' in d) abrirContas({ recorte: d.recorte });
    else if (d.view === 'clientes') setAberturaClientes({ dormentes: true });
    else if (d.view === 'produtos') setAberturaProdutos({ completude: true });
    else if (d.view === 'compras') setFiltroDeCompras(d.filtro);
    else if (d.view === 'saude-caixa') setAberturaSaude(d.mes);
    else if (d.view === 'tabelas') { setTabelasSemPreco(d.semPreco); return handleNavigate(d.view, d.busca); }
    handleNavigate(d.view);
  };

  /**
   * Clicar numa seção do menu leva à primeira tela dela.
   *
   * Se já se está dentro da seção, não faz nada: reabrir a mesma seção
   * jogaria de volta para a primeira tela e perderia onde a pessoa estava.
   */
  const irParaSecao = (id: SecaoId) => {
    // Exceção: num cartão de Cadastros, o clique no menu volta ao fichário.
    const voltarAoFichario = id === 'cadastros' && currentView !== 'cadastros';
    if (secaoDaView(currentView) === id && !voltarAoFichario) return;
    handleNavigate(viewInicialDaSecao(id));
  };

  const recarregarPerfil = async () => {
    setUserProfile(await authService.getCurrentProfile());
  };


  /** Cada cartão do fichário. 'masterdata' e 'capacidade' não entram: o alias os manda para cá. */
  const renderCartao = () => {
    const comuns = { onProfileUpdate: loadCompanyProfile, openProductId: autoSearchTerm, clearOpenProduct: () => setAutoSearchTerm(''), onNavigate: handleNavigate };
    switch (currentView) {
      case 'clientes': return <MasterData key="clientes" aba="clients" abertura={aberturaClientes} limparAbertura={() => setAberturaClientes(null)} {...comuns} />;
      case 'produtos': return <MasterData key="produtos" aba="products" abertura={aberturaProdutos} limparAbertura={() => setAberturaProdutos(null)} {...comuns} />;
      case 'fornecedores': return <MasterData key="fornecedores" aba="suppliers" abertura={aberturaFornecedores} limparAbertura={() => setAberturaFornecedores(null)} {...comuns} />;
      case 'bancos': return <MasterData key="bancos" aba="bancos" {...comuns} />;
      case 'empresa': return <MasterData key="empresa" aba="company" {...comuns} />;
      case 'categorias': return <MasterData key="categorias" aba="categorias" {...comuns} />;
      case 'mensagens': return <MasterData key="mensagens" aba="mensagens" {...comuns} />;
      case 'setores': return <PCP key="setores" abas={['capacity']} />;
      default: return null;
    }
  };

  // --- RENDER CONTENT ---
  const renderContent = () => {
    // Factory Restriction — PCP em modo fábrica (só Kanban, Controle parcial e Rendimento: ABAS_DA_FABRICA).
    if (userProfile?.role === 'factory') {
      return <PCP abas={ABAS_DA_FABRICA} semFinanceiro />;
    }

    switch (currentView) {
      case 'dashboard': return <Inicio fila={fila} onAbrir={abrirDestino} onIrPara={handleNavigate} />;
      case 'budgets':
        return <Budgets
          onNavigate={handleNavigate}
          initialSearch={autoSearchTerm}
          clearSearch={() => setAutoSearchTerm('')}
          statusInicial={aberturaBudgets ?? undefined}
          limparStatus={() => setAberturaBudgets(null)}
        />;
      case 'orders':
        return <Orders
          onNavigate={handleNavigate}
          initialSearch={autoSearchTerm}
          clearSearch={() => setAutoSearchTerm('')}
        />;
      case 'tabelas': return <TabelasDeCusto initialSearch={autoSearchTerm} clearSearch={() => setAutoSearchTerm('')}
        semPrecoInicial={tabelasSemPreco} limparSemPreco={() => setTabelasSemPreco(false)}
        companyProfile={companyProfile} onAbrirProduto={(id) => handleNavigate('produtos', id)}
        onAbrirFornecedor={(id) => { setAberturaFornecedores({ fornecedorId: id }); handleNavigate('fornecedores'); }} />;
      case 'itens-vendidos': return <ItensVendidos />;
      case 'finance': return <Finance initialSearch={autoSearchTerm} clearSearch={() => setAutoSearchTerm('')}
          filtrosIniciais={filtrosParaContas ?? undefined} limparFiltros={() => setFiltrosParaContas(null)}
          bancoParaConferir={aberturaBanco ?? undefined} limparBanco={() => setAberturaBanco(null)}
          onNavegar={handleNavigate} onGerenciarBancos={() => handleNavigate('bancos')} />;
      case 'receivables': return <Receivables abrirContas={abrirContas} clienteInicial={aberturaReceber} limparClienteInicial={() => setAberturaReceber(null)} />;
      case 'resultado': return <Resultado abrirContas={abrirContas} onIrPara={handleNavigate} />;
      case 'envelopes': return <Envelopes />;
      case 'saude-caixa': return <SaudeDoCaixa mesInicial={aberturaSaude ?? undefined} />;
      // Cada aba do antigo PCP é um passo. `key` = view, para trocar de passo zerar o estado.
      // 'pcp' e 'production' não entram aqui: o alias (viewReal) já os manda para 'quadro'.
      case 'quadro': return <PCP key="quadro" abas={['kanban']} destaque={destaqueQuadro ?? undefined} onIrPara={handleNavigate}
        onVerReceber={(id) => { setAberturaReceber(id); handleNavigate('receivables'); }} />;
      case 'controle-parcial': return <PCP key="controle-parcial" abas={['control']} />;
      case 'cronograma': return <PCP key="cronograma" abas={['schedule']} onIrPara={handleNavigate} />;
      case 'compras': return <PCP key="compras" abas={['purchases']} onIrPara={handleNavigate} filtroDeCompras={filtroDeCompras ?? undefined} />;
      case 'indicadores': return <PCP key="indicadores" abas={['dashboard', 'desempenho', 'rendimento']} />;
      case 'cadastros': return <Fichario onAbrir={handleNavigate} />;
      case 'clientes': case 'produtos': case 'fornecedores': case 'bancos': case 'setores':
      case 'empresa': case 'categorias': case 'mensagens':
        return <>
          <CabecalhoDoCartao view={currentView} onVoltar={() => handleNavigate('cadastros')} />
          {renderCartao()}
        </>;
      case 'leads': return <Leads onNavigate={handleNavigate} companyProfile={companyProfile} />;
      case 'board': return <Board />;
      default: return <Inicio fila={fila} onAbrir={abrirDestino} onIrPara={handleNavigate} />;
    }
  };

  // --- LAYOUTS ---

  if (isAuthLoading) {
    return (
      <div className="h-full bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Hexagon className="text-gold-500 animate-pulse" size={48} />
          <p className="text-zinc-500 text-xs font-mono uppercase">Carregando Sistema...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || currentView === 'login') {
    return (
      <>
      <CentralDeAvisos />
      <Suspense fallback={
        <div className="h-screen h-svh w-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 text-slate-200">
          <Hexagon className="text-amber-500 animate-pulse" size={48} />
          <p className="text-zinc-600 text-xs font-black uppercase tracking-[0.2em]">Iniciando Portal Seguro...</p>
        </div>
      }>
        <Login onLoginSuccess={() => { checkSession(); loadCompanyProfile(); }} />
      </Suspense>
      </>
    );
  }

  // FACTORY LAYOUT
  if (userProfile?.role === 'factory') {
    return (
      <div className="h-screen h-svh w-screen bg-zinc-950 text-slate-200 flex flex-col overflow-hidden">
        <CentralDeAvisos />
        <header className="h-16 bg-zinc-900 border-b border-zinc-800 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {companyProfile?.logo_url ? (
              <img src={companyProfile.logo_url} alt="Logo" className="w-8 h-8 object-contain" />
            ) : (
              <Factory className="text-amber-500" />
            )}
            <h1 className="font-black text-white tracking-[0.2em] uppercase text-xs">
              {companyProfile?.name || 'MODO FÁBRICA'}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-white">{userProfile?.full_name || 'OPERADOR'}</p>
              <p className="text-[10px] text-zinc-500 uppercase bg-zinc-950 px-1 rounded inline-block border border-zinc-800">Fábrica</p>
            </div>
            <button onClick={handleLogout} className="bg-zinc-800 hover:bg-red-900/30 text-white p-2 rounded-sm border border-zinc-700 hover:border-red-800 transition-colors" title="Sair">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="flex-1 min-w-0 overflow-hidden relative">
          <Suspense fallback={
            <div className="h-full w-full flex items-center justify-center bg-zinc-950">
              <Hexagon className="text-amber-500/50 animate-pulse" size={32} />
            </div>
          }>
            <div className="h-full overflow-auto p-5">
              <PCP abas={ABAS_DA_FABRICA} semFinanceiro />
            </div>
          </Suspense>
        </main>
      </div>
    );
  }

  // ADMIN / MANAGER LAYOUT
  //
  // O menu da esquerda lista os objetivos; dentro de cada um, a barra de passos.
  const secaoAtual = secaoDaView(currentView);

  return (
    <div className="flex flex-col h-screen h-svh w-screen bg-zinc-950 overflow-hidden text-slate-200">
      <CentralDeAvisos />
      <BuscaGeral aberta={buscaAberta} onFechar={() => setBuscaAberta(false)} onAbrir={abrirDaBusca} />
      <BarraDeTopo
        onNavegar={handleNavigate}
        onAbrirMenu={() => setGavetaAberta(true)}
        menuAberto={gavetaAberta}
        companyProfile={companyProfile}
        userProfile={userProfile}
        onAbrirPerfil={() => setPerfilAberto(true)}
        onSair={handleLogout}
        acoes={
          <>
            <button
              onClick={() => setBuscaAberta(true)}
              title="Buscar cliente, pedido, orçamento, fornecedor ou produto (Ctrl+K)"
              aria-label="Busca geral"
              className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-3 text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <Search size={18} /><span className="hidden md:inline text-xs text-zinc-600">Ctrl+K</span>
            </button>
            <button
              onClick={alternarPrivacidade}
              title={valoresOcultos ? 'Mostrar valores' : 'Ocultar valores em todo o app'}
              aria-pressed={valoresOcultos}
              className={`p-2 rounded-lg border transition-colors ${
                valoresOcultos
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                  : 'text-zinc-600 border-transparent hover:text-zinc-300 hover:border-zinc-800'
              }`}
            >
              {valoresOcultos ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            {connectionStatus?.success && (
              <span title="Conexão Segura" className="px-1"><Shield size={12} className="text-emerald-500/50" /></span>
            )}
          </>
        }
      />

      <div className="flex-1 min-h-0 flex">
        <MenuDoApp
          secaoAtual={secaoAtual}
          contadores={fila.contadores}
          aberto={isSidebarOpen}
          onAlternar={() => setIsSidebarOpen(o => !o)}
          gavetaAberta={gavetaAberta}
          onFecharGaveta={() => setGavetaAberta(false)}
          onIrParaSecao={irParaSecao}
        />

        {/* min-w-0: item flex nasce com min-width:auto e por isso NÃO encolhe
            abaixo da largura do próprio conteúdo. Sem isto o <main> esticava
            junto com o kanban em vez de segurar a largura, e o overflow-x-auto
            da faixa de colunas nunca chegava a ativar — as colunas da direita
            simplesmente sumiam recortadas em telas menores. */}
        <main className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-zinc-950 relative">
          <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

          {/* Migalha: seção › tela. Nas seções de um passo só, é a única
              coisa que diz onde a pessoa está. */}
          <div className="h-8 shrink-0 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900 flex items-center px-5 z-20 print:hidden">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-black text-zinc-600 select-none min-w-0">
              <span className="shrink-0">{secaoPorId(secaoAtual)?.rotulo || 'Botezini'}</span>
              <ChevronRight size={12} className="text-zinc-800 shrink-0" />
              <span className="text-zinc-400 truncate">{ROTULO_DA_VIEW[currentView] || currentView}</span>
            </div>
          </div>

          {temPassos(secaoAtual) && secaoAtual && (
            <BarraDePassos secao={secaoAtual} viewAtual={currentView} onNavegar={handleNavigate} />
          )}

          <div className="flex-1 min-w-0 overflow-auto p-5 print:p-0 print:overflow-visible z-10">
            <Suspense fallback={
              <div className="h-full w-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <Hexagon className="text-zinc-800 animate-pulse" size={32} />
                  <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em]">Carregando Módulo...</p>
                </div>
              </div>
            }>
              {renderContent()}
            </Suspense>
          </div>

          {connectionStatus && !connectionStatus.success && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-950/90 border border-red-800 text-red-200 text-xs font-bold py-3 px-6 z-50 flex items-center justify-center gap-3 rounded-sm shadow-xl ease-out animate-in duration-200 slide-in-from-bottom-2">
              <AlertTriangle size={16} className="text-red-500" />
              <span>ERRO DE SEGURANÇA: {connectionStatus.message}</span>
            </div>
          )}
        </main>
      </div>

      {perfilAberto && (
        <MeuPerfilModal
          perfil={userProfile}
          onSalvo={recarregarPerfil}
          onFechar={() => setPerfilAberto(false)}
        />
      )}
    </div>
  );
};

export default App;
