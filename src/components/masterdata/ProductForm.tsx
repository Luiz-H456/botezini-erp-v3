import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { storageService } from '@/services/storage';
import type { Product, Insumo, CompanyProfile } from '@/types';
import { custoDaPeca, descreverFaltas } from '@/utils/custoDaPeca';
import { AlertTriangle, ChevronDown, ChevronUp, Calculator, Check, Wand2, History, Link2 } from 'lucide-react';
import { formatCurrency } from '@/utils';
import { SearchableSelect } from '@/components/common';
import SugerirNomeModal from '@/components/masterdata/SugerirNomeModal';
import { PainelHistoricoDePreco, referenciaDoProduto } from '@/components/common/HistoricoDePreco';
import { useHistoricoDeProduto, useCurvaDeDesconto } from '@/hooks/useHistoricoDeProduto';
import { resumirProduto, medianaDeFechados } from '@/utils/historicoDeProduto';
import { candidatosDeApelido, apelidosDe } from '@/utils/apelidosDeProduto';
import { BOTAO_SECUNDARIO, ROTULO } from '@/components/finance/ui/estilo';
import { useCustoDeReferencia } from '@/hooks/useTabelaVerdade';

export interface ProductFormProps {
  data: Partial<Product>;
  onChange: (data: Partial<Product>) => void;
  categorySelect: React.ReactNode;
  companyProfile?: CompanyProfile | null;
  productCategoryMetas?: Record<string, any>;
  onApplyCalculator?: (calcData: { fabric_insumo_id: string; fabric_consumption_m: number }) => void;
}

const InputCls = 'w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-200 outline-none focus:border-amber-500/30 transition-all placeholder:text-zinc-700 hover:border-zinc-700';
const LabelCls = 'text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis ml-1';

export const ProductForm: React.FC<ProductFormProps> = ({ data, onChange, categorySelect, companyProfile, productCategoryMetas, onApplyCalculator }) => {
  const hasMarginAlert = data.average_unit_cost && data.price_tier1 && (data.average_unit_cost / data.price_tier1) > 0.6;

  const [sugerindoNome, setSugerindoNome] = useState(false);

  // ── Tabela de preços: valores × critério ─────────────────────────────
  const [abaDePreco, setAbaDePreco] = useState<'valores' | 'notas'>('valores');
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const { vendas: vendasDoProduto, carregando: carregandoHistorico } = useHistoricoDeProduto(data.id);
  const curvaDaCasa = useCurvaDeDesconto();
  const resumoDoHistorico = useMemo(() => resumirProduto(vendasDoProduto), [vendasDoProduto]);
  // O preço que a peça de fato alcança. É o contraponto da calculadora: ela
  // projeta um T1 a partir do custo e, até agora, nunca confrontava com o
  // mercado — e um T1 que ninguém paga estraga toda a leitura de "% da tabela".
  const praticado = useMemo(() => medianaDeFechados(vendasDoProduto), [vendasDoProduto]);

  // Catálogo inteiro, para achar os cadastros que são a mesma peça.
  const { data: produtosDoCatalogo = [] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => storageService.getProducts(),
    staleTime: 1000 * 60 * 10,
  });
  const candidatos = useMemo(
    () => candidatosDeApelido(data as any, produtosDoCatalogo as any),
    [data.id, data.name, data.canonical_product_id, produtosDoCatalogo]);
  const apelidosDeste = useMemo(
    () => apelidosDe(data.id, produtosDoCatalogo as any),
    [data.id, produtosDoCatalogo]);
  // Reage ao que está sendo digitado nos campos de preço, não ao que está salvo:
  // é o ponto do painel — mexer no T1 e ver na hora o que ele implica.
  const referenciaDeHoje = useMemo(() => referenciaDoProduto(data), [
    data.price_tier1, data.price_tier2, data.price_tier3, data.average_unit_cost,
  ]);

  // ── Pricing Calculator state ──────────────────────────────────────────
  const [showCalc, setShowCalc] = useState(false);
  // These are local calc params — saved to product when user clicks "Aplicar"
  const [calcFabricId, setCalcFabricId] = useState(data.default_fabric_insumo_id || '');
  const [calcFabricM, setCalcFabricM] = useState(data.fabric_consumption_m ?? 1.5);
  const [calcOverhead, setCalcOverhead] = useState(data.overhead_percent ?? 40);
  const [calcLaborRate, setCalcLaborRate] = useState(data.labor_hourly_rate ?? companyProfile?.labor_cost_per_hour ?? 0);
  const [calcWorkers, setCalcWorkers] = useState(data.labor_workers ?? 1);
  const [calcTaxRate, setCalcTaxRate] = useState(companyProfile?.default_tax_rate ?? 0);
  const [calcMarkup, setCalcMarkup] = useState(2.5); // suggested price multiplier (not saved to DB)

  // Fetch insumos for fabric selector
  const { data: insumos = [] } = useQuery<Insumo[]>({
    queryKey: ['inventory_insumos'],
    queryFn: () => storageService.getInsumos(),
    staleTime: 1000 * 60 * 5,
  });

  const selectedFabric = insumos.find(i => i.id === calcFabricId);

  // Famílias de tecido do estoque — o nome do produto deve usar o mesmo termo
  // que o insumo, senão a busca por tecido não encontra a peça.
  const familiasDeTecido = useMemo(
    () => [...new Set(insumos.map(i => i.fabric_family).filter(Boolean) as string[])].sort(),
    [insumos],
  );

  // ── Custo de produção ────────────────────────────────────────────────
  //
  // A conta mora em utils/custoDaPeca, testada, e é a MESMA que o orçamento usa
  // na linha do item. Enquanto ela vivia aqui dentro, a tela onde o preço é
  // decidido não tinha como alcançá-la — e duas cópias da mesma conta é como as
  // duas telas passariam a discordar sobre quanto a peça custa.
  // Tabela verdade (v3.1): o custo de referência do tecido vence o custo médio.
  const referencia = useCustoDeReferencia();
  const tecidoComTabela = useMemo(
    () => (selectedFabric ? { ...selectedFabric, custo_referencia: referencia.get(selectedFabric.id) ?? null } : selectedFabric),
    [selectedFabric, referencia],
  );
  const custo = useMemo(() => custoDaPeca({
    consumoM: calcFabricM,
    tecido: tecidoComTabela,
    overheadPercent: calcOverhead,
    operarios: calcWorkers,
    // O padrão de 50 peças/dia é visível: o campo está logo ali na calculadora.
    pecasPorDia: data.pieces_daily_capacity || 50,
    custoHora: calcLaborRate,
    aliquota: calcTaxRate / 100,
  }), [calcFabricM, tecidoComTabela, calcOverhead, calcWorkers,
       data.pieces_daily_capacity, calcLaborRate, calcTaxRate]);

  // A calculadora exibe as parcelas em barras e percentuais, onde ausência e
  // zero se desenham igual. O que falta é dito em texto, logo abaixo do CMV.
  const fabricCostTotal = custo.tecido ?? 0;
  const overheadCost = custo.overhead ?? 0;
  const laborCostPerPiece = custo.maoDeObra ?? 0;

  // O imposto (Simples, ICMS, PIS/COFINS) incide sobre a VENDA, não sobre o
  // custo. Fazer custo × (1 + alíquota) provisiona imposto a menos: quem paga
  // 6% sobre um preço de R$ 77 deve R$ 4,66, não os R$ 1,75 que saem de 6%
  // sobre o custo de R$ 29. Para sobrar o markup desejado DEPOIS do imposto, o
  // preço se divide por (1 − alíquota).
  const cmvBase = custo.producao;
  const aliquota = custo.aliquota;
  const precoAntesDoImposto = cmvBase * calcMarkup;
  const suggestedPrice = precoAntesDoImposto / (1 - aliquota);
  // Imposto por peça no preço sugerido — é o que a venda vai de fato recolher.
  const taxCost = suggestedPrice - precoAntesDoImposto;
  const cmvCalculated = cmvBase + taxCost;

  /**
   * Preço em que a receita cobre exatamente o custo de produção mais o imposto
   * que ela mesma gera. Abaixo disto a peça dá prejuízo — é o piso que o
   * sistema nunca teve escrito em lugar nenhum.
   */
  const pontoDeEquilibrio = custo.piso;

  const handleApplyCMV = () => {
    onChange({
      ...data,
      average_unit_cost: parseFloat(cmvCalculated.toFixed(2)),
      price_tier1: parseFloat(suggestedPrice.toFixed(2)),
      fabric_consumption_m: calcFabricM,
      default_fabric_insumo_id: calcFabricId || undefined,
      labor_hourly_rate: calcLaborRate,
      labor_workers: calcWorkers,
      overhead_percent: calcOverhead,
    });

    if (calcFabricId && calcFabricM > 0) {
      onApplyCalculator?.({
        fabric_insumo_id: calcFabricId,
        fabric_consumption_m: calcFabricM,
      });
    }
    setShowCalc(false);
  };


  // sync external changes into local calc state
  useEffect(() => {
    setCalcFabricId(data.default_fabric_insumo_id || '');
    setCalcFabricM(data.fabric_consumption_m ?? 1.5);
    setCalcOverhead(data.overhead_percent ?? 40);
    setCalcLaborRate(data.labor_hourly_rate ?? companyProfile?.labor_cost_per_hour ?? 0);
    setCalcWorkers(data.labor_workers ?? 1);

    // Default tax matching the company profile
    if (companyProfile?.default_tax_rate !== undefined && !data.id) {
      setCalcTaxRate(companyProfile.default_tax_rate);
    }

    if (companyProfile?.target_margin) {
      setCalcMarkup(1 / (1 - (companyProfile.target_margin / 100)));
    }
  }, [data.id, companyProfile]);

  // Auto-fill fabric consumption when category changes
  const prevCategoryRef = useRef(data.category);

  useEffect(() => {
    if (data.category !== prevCategoryRef.current) {
      if (data.category && productCategoryMetas?.[data.category]) {
        const meta = productCategoryMetas[data.category];
        if (meta.fabric_consumption_m) {
          setCalcFabricM(meta.fabric_consumption_m);
          onChange({ ...data, fabric_consumption_m: meta.fabric_consumption_m });
        }
      }
      prevCategoryRef.current = data.category;
    }
  }, [data.category, productCategoryMetas]);

  // Quatro blocos, nesta ordem: Dados, Preços, Calcular preço e (no MasterData,
  // depois deste formulário) a Ficha técnica. Os campos são os mesmos de antes.
  return (
    <div className="space-y-6">
      {/* ── 1. Dados ── */}
      <section>
      <h3 className={`${ROTULO} mb-3`}>Dados</h3>
      {/* ── Identity ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className={`${LabelCls} mb-0`}>Nome *</label>
            <button type="button" onClick={() => setSugerindoNome(true)}
              title="Montar o nome no padrão da casa"
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 transition-colors shrink-0">
              <Wand2 size={14} /> Sugerir nome
            </button>
          </div>
          <input
            className={InputCls}
            value={data.name || ''}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
          />
        </div>
        <div>
          <label className={LabelCls}>Categoria</label>
          {categorySelect}
        </div>
      </div>
      {/* ── Mesma peça, nome diferente ──
          A peça acaba cadastrada de novo com nome ligeiramente distinto e cada
          cadastro fica com um pedaço do histórico — nenhum com amostra para
          dizer nada sobre preço. Marcar o vínculo não apaga nada: os orçamentos
          antigos seguem apontando para o cadastro que usaram, e o que muda é
          que histórico, médias e curva passam a somar os dois como um só. */}
      {data.id && (candidatos.length > 0 || data.canonical_product_id || apelidosDeste.length > 0) && (
        <div className="bg-zinc-950/40 border border-zinc-800/80 p-4 rounded-2xl mt-4">
          <div className="flex items-center gap-2 mb-2.5">
            <Link2 size={12} className="text-amber-500 shrink-0" />
            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Mesma peça, nome diferente</span>
          </div>

          {data.canonical_product_id ? (
            <div className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
              <p className="text-[10px] text-amber-500/90 leading-snug min-w-0">
                Este cadastro é o mesmo que{' '}
                <b>{produtosDoCatalogo.find(p => p.id === data.canonical_product_id)?.name || '(produto removido)'}</b>.
                O histórico dos dois é contado junto.
              </p>
              <button type="button"
                onClick={() => onChange({ ...data, canonical_product_id: null })}
                className="text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-rose-400 shrink-0 px-2 py-1">
                Desfazer
              </button>
            </div>
          ) : apelidosDeste.length > 0 ? (
            <p className="text-[10px] text-zinc-500 leading-snug">
              Este é o cadastro oficial de{' '}
              <b className="text-zinc-300">{apelidosDeste.map(a => a.name).join(', ')}</b>.
              O histórico de todos é somado aqui.
            </p>
          ) : (
            <>
              <p className="text-[9px] text-zinc-600 uppercase tracking-widest font-black mb-2">
                Parecem ser a mesma peça
              </p>
              <div className="space-y-1.5">
                {candidatos.slice(0, 4).map(c => (
                  <div key={c.produto.id} className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold text-zinc-300 truncate min-w-0">
                      {c.produto.name}
                      {c.mesmoNomeNormalizado && (
                        <span className="ml-2 text-[8px] font-black uppercase tracking-widest text-amber-500/80">mesmo nome</span>
                      )}
                    </span>
                    <button type="button"
                      onClick={() => onChange({ ...data, canonical_product_id: c.produto.id })}
                      className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 transition-colors shrink-0">
                      É a mesma
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={LabelCls}>SKU / Ref</label>
          <input
            className={InputCls}
            value={data.sku || ''}
            onChange={(e) => onChange({ ...data, sku: e.target.value })}
          />
        </div>
        <div>
          <label className={LabelCls} title="Quantas peças a fábrica costura por dia?">Capacidade Produtiva (peças/dia) *</label>
          <input
            type="number"
            min="1"
            className={`${InputCls} font-bold text-emerald-400`}
            value={data.pieces_daily_capacity || ''}
            onChange={(e) => onChange({ ...data, pieces_daily_capacity: parseInt(e.target.value) || 0 })}
            placeholder="Ex: 50"
          />
        </div>
      </div>

      {/* ── CMV display + margin alert ── */}
      <div className="bg-zinc-950/40 border border-zinc-800/80 p-5 rounded-2xl flex items-center justify-between shadow-xl mt-4">
        <div>
          <label className="text-[9px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1 mb-2 ml-1">
            Custo de Produção (CMV)
          </label>
          <div className="flex items-center gap-4 mt-1">
            <input
              type="number"
              className={`${InputCls} !w-36 font-mono`}
              value={data.average_unit_cost ?? ''}
              onChange={(e) => onChange({ ...data, average_unit_cost: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
            />
            <span className="text-xs text-zinc-500 max-w-[180px] leading-tight">
              Calculado pela Calculadora de Custo ou inserido manualmente.
            </span>
          </div>
        </div>
        {hasMarginAlert && (
          <div className="flex items-center gap-2 bg-rose-500/10 text-rose-500 p-3 rounded-lg border border-rose-500/20">
            <AlertTriangle size={20} />
            <div className="text-sm">
              <strong>Alerta de Margem!</strong>
              <p className="text-xs opacity-80">Custo {'>'} 60% do Preço T1.</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        <label className={LabelCls}>Notas</label>
        <textarea
          className={`${InputCls} h-20 resize-none`}
          value={data.notes || ''}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
        />
      </div>
      </section>

      {/* ── 2. Preços ── */}
      <section>
      <h3 className={`${ROTULO} mb-3`}>Preços</h3>
      <div className="bg-zinc-950/40 border border-zinc-800/80 p-5 rounded-2xl relative overflow-hidden shadow-xl">
        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
        <div className="flex items-center justify-between mb-4 ml-2 gap-3">
          <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Tabela de Preços</h4>
          {/* Abas em vez de mais um campo empilhado: o critério de cada faixa é
              texto corrido e ocuparia a altura de três inputs para algo que só
              se lê quando bate a dúvida. */}
          <div className="flex gap-1 shrink-0">
            {([['valores', 'Valores'], ['notas', 'Notas']] as const).map(([id, rotulo]) => (
              <button key={id} type="button" onClick={() => setAbaDePreco(id)}
                className={`text-[8px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${abaDePreco === id
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'}`}>
                {rotulo}
                {id === 'notas' && data.price_notes?.trim() && (
                  <span className="ml-1.5 inline-block w-1 h-1 rounded-full bg-emerald-500 align-middle" />
                )}
              </button>
            ))}
          </div>
        </div>

        {abaDePreco === 'valores' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl">
              <label className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block mb-2 ml-1">Preço T1 (Principal)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600 font-black text-[10px] tracking-widest">R$</span>
                <input type="number" step="0.01" className="w-full bg-zinc-950/80 border border-emerald-500/30 rounded-xl px-4 py-2.5 pl-10 text-[10px] text-emerald-400 font-black uppercase tracking-widest outline-none focus:border-emerald-400 transition-all placeholder:text-emerald-900/50" value={data.price_tier1 ?? ''} onChange={(e) => onChange({ ...data, price_tier1: parseFloat(e.target.value) || 0 })} />
              </div>
              <p className="text-[8px] font-black uppercase tracking-widest text-emerald-600/60 mt-2 ml-1">Venda direta / Varejo</p>
              {/* O T1 é a régua de toda a análise de desconto: cada "% da
                  tabela" é preço ÷ T1. Um T1 acima de tudo que já foi cobrado
                  faz todo orçamento parecer um desconto enorme — foi o que
                  produziu sugestão de baixar preço que já era o piso. */}
              {resumoDoHistorico && (Number(data.price_tier1) || 0) > resumoDoHistorico.maior && (
                <p className="text-[9px] text-amber-500/90 leading-snug mt-2 ml-1">
                  Este T1 está acima de tudo que você já cobrou (máximo {formatCurrency(resumoDoHistorico.maior)}).
                  Como toda a leitura de desconto é preço ÷ T1, um T1 que ninguém paga distorce a análise.
                </p>
              )}
            </div>
            <div className="p-2 border border-transparent">
              <label className={LabelCls}>Preço T2</label>
              <input type="number" step="0.01" className={InputCls} value={data.price_tier2 ?? ''} onChange={(e) => onChange({ ...data, price_tier2: parseFloat(e.target.value) || 0 })} />
              <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mt-2 ml-1">Atacado 1 / Revenda</p>
            </div>
            <div className="p-2 border border-transparent">
              <label className={LabelCls}>Preço T3</label>
              <input type="number" step="0.01" className={InputCls} value={data.price_tier3 ?? ''} onChange={(e) => onChange({ ...data, price_tier3: parseFloat(e.target.value) || 0 })} />
              <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mt-2 ml-1">Atacado 2 / Distr.</p>
            </div>
          </div>
        ) : (
          <div>
            <label className={LabelCls}>Critério das faixas</label>
            <textarea
              className={`${InputCls} h-28 resize-none !normal-case !tracking-normal !font-medium text-[11px] leading-relaxed`}
              placeholder={'A partir de que quantidade cada faixa vale, para que tipo de cliente, o que já está incluso.\n\nEx.: T2 a partir de 50 peças. T3 só para revenda com contrato. Bordado não está incluso em nenhuma.'}
              value={data.price_notes || ''}
              onChange={(e) => onChange({ ...data, price_notes: e.target.value })}
            />
            <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600 mt-2 ml-1">
              Aparece no orçamento, ao lado do histórico do produto
            </p>
          </div>
        )}
      </div>

      {/* ── Histórico praticado ──
          Os três preços acima são uma decisão, e até aqui ela era tomada no
          escuro. Este painel põe ao lado deles o que de fato já foi cobrado e
          fechado, que é a única evidência disponível de que o número faz sentido.
          Só aparece em produto já salvo: sem id não há histórico a buscar. */}
      {data.id && (
        <div className="border border-zinc-800/80 rounded-2xl overflow-hidden mt-4 shadow-xl">
          <button
            type="button"
            onClick={() => setMostrarHistorico(s => !s)}
            className="w-full flex items-center justify-between px-6 py-5 bg-zinc-900/50 hover:bg-zinc-800 transition-all text-[10px] font-black uppercase tracking-widest text-zinc-300 active:scale-[0.99]"
          >
            <span className="flex items-center gap-3">
              <div className="text-amber-500 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 shadow-lg shadow-amber-900/20">
                <History size={14} />
              </div>
              Preço praticado neste produto
              {resumoDoHistorico && (
                <span className="text-[9px] text-zinc-500 ml-2 tracking-widest normal-case">
                  ({formatCurrency(resumoDoHistorico.menor)} – {formatCurrency(resumoDoHistorico.maior)} ·{' '}
                  {resumoDoHistorico.fechados} de {resumoDoHistorico.ocorrencias} fechados)
                </span>
              )}
            </span>
            {mostrarHistorico ? <ChevronUp size={16} className="text-amber-500" /> : <ChevronDown size={16} className="text-zinc-600" />}
          </button>

          {mostrarHistorico && (
            <div className="bg-black/50 border-t border-zinc-800">
              <PainelHistoricoDePreco
                vendas={vendasDoProduto}
                carregando={carregandoHistorico}
                curva={curvaDaCasa}
                referencia={referenciaDeHoje}
              />
            </div>
          )}
        </div>
      )}

      {/* ── O que a peça de fato alcança ──
          A mediana fechada fica no bloco de preços, à vista: é o contraponto dos
          três valores acima, e não depende de abrir a calculadora. A margem usa
          o CMV e a alíquota da calculadora, que já estão calculados aqui. */}
      <div className="bg-zinc-950/40 border border-zinc-800/80 p-5 rounded-2xl mt-4 space-y-2">
        {praticado === null ? (
          <p className="text-[9px] text-zinc-600 leading-snug">
            Sem venda fechada ainda — não há preço praticado para confrontar com a projeção.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 font-black text-[9px] uppercase tracking-widest">Praticado (mediana):</span>
              <span className="text-amber-500 font-mono font-bold text-sm">{formatCurrency(praticado)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 font-black text-[9px] uppercase tracking-widest">Margem nessa mediana:</span>
              <span className={`font-mono font-bold text-sm ${praticado > pontoDeEquilibrio ? 'text-emerald-400' : 'text-rose-400'}`}>
                {/* Margem sobre a receita, descontando o imposto que
                    ela gera — não sobre o custo, que daria um número
                    maior e mais bonito pelo motivo errado. */}
                {(((praticado * (1 - aliquota)) - cmvBase) / praticado * 100)
                  .toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
              </span>
            </div>

            {praticado <= pontoDeEquilibrio && (
              <p className="text-[9px] text-rose-400 leading-snug font-bold">
                A mediana praticada está no prejuízo: cada peça vendida a {formatCurrency(praticado)} não
                cobre {formatCurrency(pontoDeEquilibrio)} de custo mais imposto.
              </p>
            )}

            <button
              type="button"
              onClick={() => onChange({ ...data, price_tier1: parseFloat(praticado.toFixed(2)) })}
              className="w-full mt-1 px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
              title="O T1 é a régua de toda a análise de desconto — um T1 que ninguém paga distorce tudo"
            >
              Usar {formatCurrency(praticado)} como T1
            </button>
          </>
        )}
      </div>
      </section>

      {/* ── 3. Calcular preço ── recolhido: a calculadora é para quem precisa dela. */}
      <section>
      <h3 className={`${ROTULO} mb-3`}>Calcular preço</h3>
      <button
        type="button"
        onClick={() => setShowCalc(s => !s)}
        aria-expanded={showCalc}
        className={BOTAO_SECUNDARIO}
      >
        <Calculator size={14} />
        Calcular preço
        {showCalc ? <ChevronUp size={14} className="text-amber-500" /> : <ChevronDown size={14} />}
      </button>
      {showCalc && (
      <div className="border border-zinc-800/80 rounded-2xl overflow-hidden mt-3 shadow-xl">
        {(() => {
          const totalCost = cmvCalculated || 1;
          const pctFabric = (fabricCostTotal / totalCost) * 100;
          const pctOverhead = (overheadCost / totalCost) * 100;
          const pctLabor = (laborCostPerPiece / totalCost) * 100;
          const pctTax = (taxCost / totalCost) * 100;
          const p1 = pctFabric;
          const p2 = p1 + pctOverhead;
          const p3 = p2 + pctLabor;

          const CardCls = "bg-zinc-950/40 border border-zinc-800/80 rounded-2xl p-5 flex flex-col gap-4 shadow-xl";
          const TitleCls = "text-zinc-200 font-black text-[10px] uppercase tracking-widest";
          const InnerInputCls = "w-full bg-zinc-950/60 border border-zinc-800 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-200 outline-none focus:border-amber-500/30 transition-all placeholder:text-zinc-700 hover:border-zinc-700";
          const InnerLabelCls = "text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 block ml-1";

          return (
            <div className="bg-black/50 p-4 rounded-b-lg border-t border-zinc-800">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

                {/* COLUNA ESQUERDA */}
                <div className="space-y-4">
                  {/* Card: Insumo Tecido */}
                  <div className={CardCls}>
                    <h3 className={TitleCls}>Insumo Tecido</h3>
                    <SearchableSelect
                      value={calcFabricId}
                      onChange={setCalcFabricId}
                      options={insumos.map(i => ({ value: i.id, label: `${i.name} — ${formatCurrency(i.average_unit_cost)}/${i.unit}` }))}
                      placeholder="SELECIONAR TECIDO"
                    />
                    <div>
                      <label className={InnerLabelCls}>Consumo (m/peça)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className={InnerInputCls}
                        value={calcFabricM}
                        onChange={e => setCalcFabricM(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  {/* Card: Custo Operacional */}
                  <div className={CardCls}>
                    <h3 className={TitleCls}>Custo Operacional</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className={InnerLabelCls}>Salário/H (R$)</label>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          className={InnerInputCls + " text-zinc-300 font-mono"}
                          value={calcLaborRate}
                          onChange={e => setCalcLaborRate(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <label className={InnerLabelCls}>Nº Operários</label>
                        <input
                          type="number"
                          min="1"
                          className={InnerInputCls}
                          value={calcWorkers}
                          onChange={e => setCalcWorkers(parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div>
                        <label className={InnerLabelCls}>Peças/Dia</label>
                        <input
                          type="number"
                          disabled
                          className={`${InnerInputCls} opacity-50 cursor-not-allowed`}
                          value={data.pieces_daily_capacity || ''}
                        />
                      </div>
                    </div>
                    <div className="mt-2 bg-zinc-900/50 border border-amber-500/20 rounded-xl p-4 flex justify-between items-center">
                      <span className="text-zinc-300 text-[10px] font-black uppercase tracking-widest">Custo M.O./Pç</span>
                      <span className="text-amber-500 font-bold max-w-[100px] truncate text-right">{formatCurrency(laborCostPerPiece)}</span>
                    </div>
                  </div>
                </div>

                {/* COLUNA DO MEIO */}
                <div className="space-y-4">
                  {/* Card: Custo Indireto */}
                  <div className={CardCls}>
                    <h3 className={TitleCls}>Custo Indireto</h3>
                    <div className="flex justify-between items-center mb-1">
                      <span className={InnerLabelCls + " !mb-0"}>% Sobre Custo do Tecido</span>
                      <span className="text-zinc-300 text-xs font-mono">{calcOverhead}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="80"
                      value={calcOverhead}
                      onChange={e => setCalcOverhead(Number(e.target.value))}
                      className="w-full accent-amber-500 my-2"
                    />
                    <div className="mt-auto bg-zinc-900/50 border border-amber-500/20 rounded-xl p-4 flex justify-between items-center">
                      <span className="text-zinc-300 text-[10px] font-black uppercase tracking-widest">Custo Indireto</span>
                      <span className="text-amber-500 font-bold max-w-[100px] truncate text-right">{formatCurrency(overheadCost)}</span>
                    </div>
                  </div>

                  {/* Card: Tributos */}
                  <div className={CardCls}>
                    <h3 className={TitleCls}>Tributos</h3>
                    <div className="flex justify-between items-center mb-1">
                      <span className={InnerLabelCls + " !mb-0"}>% Sobre o Custo de Confecção</span>
                      <span className="text-zinc-300 text-xs font-mono">{calcTaxRate}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="0.5"
                      value={calcTaxRate}
                      onChange={e => setCalcTaxRate(parseFloat(e.target.value) || 0)}
                      className="w-full accent-amber-500 my-2"
                    />
                    <div className="mt-auto bg-zinc-900/50 border border-amber-500/20 rounded-xl p-4 flex justify-between items-center">
                      <span className="text-zinc-300 text-[10px] font-black uppercase tracking-widest">Custo Impostos</span>
                      <span className="text-amber-500 font-bold max-w-[100px] truncate text-right">{formatCurrency(taxCost)}</span>
                    </div>
                  </div>
                </div>

                {/* COLUNA DIREITA */}
                <div className="h-full flex flex-col">
                  <div className={`${CardCls} flex-1 justify-between shadow-2xl shadow-amber-900/5`}>
                    <h3 className={TitleCls + " mb-2"}>Resumo de Precificação</h3>

                    {/* Donut Chart via Conic Gradient */}
                    <div className="relative w-32 h-32 rounded-full mx-auto my-4 shrink-0 transition-all duration-150 shadow-2xl shadow-black/50"
                      style={{ background: `conic-gradient(#f59e0b ${p1}%, #d97706 0 ${p2}%, #b45309 0 ${p3}%, #78350f 0)` }}>
                      <div className="absolute inset-[15%] bg-zinc-950 rounded-full flex items-center justify-center">
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest leading-tight text-center">CMV<br />BREAKDOWN</span>
                      </div>
                    </div>

                    {/* Progress Bars */}
                    <div className="space-y-4 mt-4">
                      <div className="flex items-center gap-3">
                        <span className="w-14 text-[9px] font-black uppercase tracking-widest text-zinc-500">Tecido</span>
                        <div className="flex-1 h-3 bg-zinc-900 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${pctFabric}%` }}></div>
                        </div>
                        <span className="w-8 text-right text-[10px] text-zinc-400 font-mono">{pctFabric.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-14 text-[9px] font-black uppercase tracking-widest text-zinc-500">Insumos</span>
                        <div className="flex-1 h-3 bg-zinc-900 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-600 transition-all duration-500" style={{ width: `${pctOverhead}%` }}></div>
                        </div>
                        <span className="w-8 text-right text-[10px] text-zinc-400 font-mono">{pctOverhead.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-14 text-[9px] font-black uppercase tracking-widest text-zinc-500">M.O.</span>
                        <div className="flex-1 h-3 bg-zinc-900 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-700 transition-all duration-500" style={{ width: `${pctLabor}%` }}></div>
                        </div>
                        <span className="w-8 text-right text-[10px] text-zinc-400 font-mono">{pctLabor.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-14 text-[9px] font-black uppercase tracking-widest text-zinc-500">Imposto</span>
                        <div className="flex-1 h-3 bg-zinc-900 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-900 transition-all duration-500" style={{ width: `${pctTax}%` }}></div>
                        </div>
                        <span className="w-8 text-right text-[10px] text-zinc-400 font-mono">{pctTax.toFixed(0)}%</span>
                      </div>
                    </div>

                    <div className="border-t border-zinc-800/80 my-5 shrink-0"></div>

                    <div className="flex items-center justify-between mb-2">
                      <span className="text-zinc-400 font-black uppercase tracking-widest text-[10px]">CMV Total:</span>
                      <span className="text-white font-mono font-black text-xl">{formatCurrency(cmvCalculated)}</span>
                    </div>

                    {/* A barra e o percentual desenham ausência e zero do mesmo
                        jeito. Este aviso é o que separa os dois — sem ele, um
                        tecido em kg sem rendimento cadastrado sai da conta em
                        silêncio e o CMV aparece confiante e baixo demais. */}
                    {custo.faltas.length > 0 && (
                      <p className="flex items-start gap-2 text-[10px] leading-snug text-amber-400/90 bg-amber-500/[0.07] border border-amber-500/25 rounded-lg px-2.5 py-2 mb-3">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        <span>
                          Este CMV é o <strong className="font-black">mínimo</strong>: falta {descreverFaltas(custo.faltas)}.
                          O que falta só aumenta o custo.
                        </span>
                      </p>
                    )}

                    <div className="flex items-center justify-between mb-3">
                      <span className="text-emerald-500 font-black text-[10px] uppercase tracking-widest">Preço T1 Sugerido:</span>
                      <span className="text-emerald-400 font-mono font-black text-xl">{formatCurrency(suggestedPrice)}</span>
                    </div>

                    {/* ── O que a peça de fato alcança ──
                        A calculadora projetava um preço a partir do custo e
                        nunca olhava para o mercado. Aqui a projeção fica lado a
                        lado com a mediana realmente fechada e com o piso abaixo
                        do qual a peça dá prejuízo. */}
                    <div className="border-t border-zinc-800/80 pt-3 mb-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500 font-black text-[9px] uppercase tracking-widest">Ponto de Equilíbrio:</span>
                        <span className="text-rose-400/90 font-mono font-bold text-sm">{formatCurrency(pontoDeEquilibrio)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-auto">
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-black text-[8px] tracking-widest">FATOR</span>
                        <input
                          type="number"
                          step="0.1"
                          min="1"
                          className={`${InnerInputCls} !w-32 text-right pl-16`}
                          placeholder="Markup"
                          value={calcMarkup}
                          onChange={e => setCalcMarkup(parseFloat(e.target.value) || 1)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleApplyCMV}
                        className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-widest h-12 rounded-xl text-[10px] transition-all shrink-0 shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2 active:scale-95 border border-amber-400"
                      >
                        <Check size={16} /> APLICAR PREÇO
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          );
        })()}
      </div>
      )}
      </section>

      {sugerindoNome && (
        <SugerirNomeModal
          tecidos={familiasDeTecido}
          inicial={{ tecido: selectedFabric?.fabric_family || '' }}
          onClose={() => setSugerindoNome(false)}
          onAplicar={(nome, sku) => {
            // O SKU só preenche o campo vazio: sobrescrever uma referência que
            // a fábrica já usa em etiqueta e ordem de corte quebraria o vínculo.
            onChange({ ...data, name: nome, sku: data.sku?.trim() ? data.sku : sku });
            setSugerindoNome(false);
          }}
        />
      )}
    </div>
  );
};
