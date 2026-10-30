import React, { useEffect, useState } from 'react';
import { DollarSign, Upload, Target } from 'lucide-react';
import { maskCNPJ, maskPhone, formatCurrency } from '@/utils';
import { storageService } from '@/services/storage';
import { SearchableSelect } from '@/components/common';
import { CARTAO, ITEM, CAMPO, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SUAVE } from '@/components/finance/ui/estilo';
import { useMetaSugerida } from '@/hooks/cadastros/useMetaSugerida';
import type { BankAccount, CompanyProfile } from '@/types';

export interface CompanyTabProps {
  profile: CompanyProfile;
  onChange: (profile: CompanyProfile) => void;
  onSave: () => void | Promise<void>;
  isSaving: boolean;
}

export const CompanyTab: React.FC<CompanyTabProps> = ({
  profile,
  onChange,
  onSave,
  isSaving,
}) => {
  // Meta de faturamento sugerida: anda junto com a margem alvo digitada na tela.
  const { meta, carregando: calculandoMeta } = useMetaSugerida(Number(profile.target_margin) || 0);
  const [comoCheguei, setComoCheguei] = useState(false);

  // Bancos ativos para o seletor "Banco que sai no orçamento" (só aparece depois do SQL v3_1).
  const [bancos, setBancos] = useState<BankAccount[]>([]);
  const [bancosLidos, setBancosLidos] = useState(false);
  useEffect(() => {
    let vivo = true;
    storageService.getBankAccounts(true)
      .then(b => { if (vivo) { setBancos(b); setBancosLidos(true); } })
      .catch(() => { /* sem lista, o seletor fica só com "os dados abaixo" */ });
    return () => { vivo = false; };
  }, []);
  const temSeletorDeBanco = 'banco_do_orcamento_id' in profile;
  // Inativado/apagado não está na lista: aí os campos voltam, que é o que o orçamento imprime.
  const bancoEscolhido = bancos.find(b => b.id === profile.banco_do_orcamento_id);
  // Só afirma "inativo" com a lista lida: lista vazia por falha ou por carregar não é prova.
  const escolhidoInativo = bancosLidos && !!profile.banco_do_orcamento_id && !bancoEscolhido;

  return (
  <div className="w-full space-y-6 ease-out animate-in slide-in-from-left-2 duration-200">
    <div className={`${CARTAO} p-5`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 flex flex-col items-center gap-4">
          <div className="w-48 h-48 bg-zinc-950/50 border-2 border-dashed border-zinc-800 rounded-2xl flex items-center justify-center overflow-hidden relative group transition-all hover:border-amber-500/30">
            {profile.logo_url ? (
              <img
                src={profile.logo_url}
                alt="Logo"
                className="w-full h-full object-contain p-4"
              />
            ) : (
              <div className="text-center p-4 text-zinc-700 group-hover:text-amber-500 transition-colors">
                <Upload size={32} className="mx-auto mb-2 opacity-50" />
                <span className="text-[10px] font-black uppercase tracking-widest">Carregar Logo</span>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  const r = new FileReader();
                  r.onloadend = () =>
                    onChange({ ...profile, logo_url: r.result as string });
                  r.readAsDataURL(f);
                }
              }}
            />
          </div>
        </div>
        <div className="col-span-2 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={`${ROTULO_PEQUENO} ml-1 mb-1 block`}>
                Razão Social / Nome Fantasia
              </label>
              <input
                className={`${CAMPO} w-full`}
                value={profile.name ?? ''}
                onChange={(e) => onChange({ ...profile, name: e.target.value })}
              />
            </div>
            <div>
              <label className={`${ROTULO_PEQUENO} ml-1 mb-1 block`}>CNPJ</label>
              <input
                className={`${CAMPO} w-full`}
                value={profile.cnpj ?? ''}
                onChange={(e) =>
                  onChange({ ...profile, cnpj: maskCNPJ(e.target.value) })
                }
                maxLength={18}
              />
            </div>
            <div>
              <label className={`${ROTULO_PEQUENO} ml-1 mb-1 block`}>Telefone</label>
              <input
                className={`${CAMPO} w-full`}
                value={profile.phone ?? ''}
                onChange={(e) =>
                  onChange({ ...profile, phone: maskPhone(e.target.value) })
                }
                maxLength={15}
              />
            </div>
            <div className="col-span-2">
              <label className={`${ROTULO_PEQUENO} ml-1 mb-1 block`}>Endereço</label>
              <input
                className={`${CAMPO} w-full`}
                value={profile.address ?? ''}
                onChange={(e) => onChange({ ...profile, address: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-zinc-800">
        <h3 className={`${ROTULO} mb-4 flex items-center gap-3`}>
          <DollarSign size={16} className="text-emerald-500" /> Dados Bancários (Para Orçamentos)
        </h3>
        <div className={`${ITEM} grid grid-cols-2 gap-4 p-4 translate-z-0`}>
          {temSeletorDeBanco ? (
            <div className="col-span-2">
              <label className={`${ROTULO_PEQUENO} block mb-1`}>Banco que sai no orçamento</label>
              <SearchableSelect
                value={profile.banco_do_orcamento_id || ''}
                onChange={(v) => onChange({ ...profile, banco_do_orcamento_id: v || null })}
                options={[
                  { value: '', label: '— os dados abaixo —' },
                  ...bancos.map(b => ({ value: b.id, label: b.bank_name ? `${b.name} · ${b.bank_name}` : b.name })),
                ]}
                placeholder="BANCO..."
              />
              {escolhidoInativo && (
                <p className="text-xs text-amber-400 mt-2">o banco escolhido está inativo — o orçamento usa os dados abaixo</p>
              )}
            </div>
          ) : (
            <p className={`col-span-2 ${ROTULO_PEQUENO}`}>
              Para escolher um banco cadastrado, rode <code>supabase/cadastros_v3_1.sql</code>.
            </p>
          )}
          {bancoEscolhido ? (
            <div className="col-span-2 space-y-1 text-sm text-zinc-300">
              <p className="font-bold text-white">{bancoEscolhido.bank_name || bancoEscolhido.name}</p>
              <p>Ag: {bancoEscolhido.agency || '-'} · CC: {bancoEscolhido.account_number || '-'}</p>
              <p>Titular: {bancoEscolhido.titular || '-'}</p>
              <p>PIX: {bancoEscolhido.chave_pix || '-'}</p>
              {/* Sem PIX o orçamento sai sem PIX: o aviso fica âmbar para chamar a edição. */}
              <p className={`${bancoEscolhido.chave_pix ? ROTULO_PEQUENO : ROTULO_PEQUENO.replace('text-zinc-500', 'text-amber-400')} pt-2`}>
                Titular e PIX se editam em Cadastros › Bancos
              </p>
            </div>
          ) : (<>
          <div>
            <label className={`${ROTULO_PEQUENO} block mb-1`}>Banco</label>
            <input
              className={`${CAMPO} w-full`}
              value={profile.bank_name ?? ''}
              onChange={(e) => onChange({ ...profile, bank_name: e.target.value })}
              placeholder="Nome do Banco"
            />
          </div>
          <div>
            <label className={`${ROTULO_PEQUENO} block mb-1`}>Titular</label>
            <input
              className={`${CAMPO} w-full`}
              value={profile.bank_holder ?? ''}
              onChange={(e) => onChange({ ...profile, bank_holder: e.target.value })}
              placeholder="Nome do Titular"
            />
          </div>
          <div>
            <label className={`${ROTULO_PEQUENO} block mb-1`}>Agência</label>
            <input
              className={`${CAMPO} w-full font-mono`}
              value={profile.agency ?? profile.bank_agency ?? ''}
              onChange={(e) => onChange({ ...profile, agency: e.target.value, bank_agency: e.target.value })}
              placeholder="0000"
            />
          </div>
          <div>
            <label className={`${ROTULO_PEQUENO} block mb-1`}>Conta</label>
            <input
              className={`${CAMPO} w-full font-mono`}
              value={profile.account_number ?? profile.bank_account ?? ''}
              onChange={(e) => onChange({ ...profile, account_number: e.target.value, bank_account: e.target.value })}
              placeholder="00000-0"
            />
          </div>
          <div className="col-span-2">
            <label className={`${ROTULO_PEQUENO} block mb-1`}>
              Chave PIX
            </label>
            <input
              className={`${CAMPO} w-full font-black tracking-wider`}
              value={profile.pix_key ?? ''}
              onChange={(e) => onChange({ ...profile, pix_key: e.target.value })}
              placeholder="CPF/CNPJ/Email/Tel"
            />
          </div>
          </>)}
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-zinc-800">
        <h3 className={`${ROTULO} mb-4 flex items-center gap-3`}>
          <DollarSign size={16} className="text-amber-500" /> Metas Globais & Produção
        </h3>
        <div className={`${ITEM} grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 relative overflow-hidden`}>
          <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]"></div>

          <div className="space-y-1">
            <label className={`${ROTULO_PEQUENO} block mb-2`}>
              Margem de Lucro Alvo
            </label>
            <div className="relative">
              <input
                type="number"
                className={`${CAMPO} w-full pr-8 font-bold text-right`}
                value={profile.target_margin ?? ''}
                onChange={(e) => onChange({ ...profile, target_margin: parseFloat(e.target.value) || 0 })}
                placeholder="35"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-600 font-bold">%</span>
            </div>
            <p className="text-[10px] text-zinc-600 mt-2 font-medium">Markup base para precificação.</p>
          </div>

          <div className="space-y-1 sm:border-l sm:border-zinc-800 sm:pl-6">
            <label className={`${ROTULO_PEQUENO} block mb-2`}>
              Custo Mão-de-Obra (R$/h)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 font-black">R$</span>
              <input
                type="number"
                step="0.5"
                min="0"
                className={`${CAMPO} w-full pl-8 font-bold`}
                value={profile.labor_cost_per_hour ?? ''}
                onChange={(e) => onChange({ ...profile, labor_cost_per_hour: parseFloat(e.target.value) || 0 })}
                placeholder="Ex: 12.50"
              />
            </div>
            <p className="text-[10px] text-zinc-600 mt-2 font-medium uppercase leading-tight">Valor base de remuneração (Salário/Hora).</p>
          </div>
        </div>
        <p className={`${ROTULO_PEQUENO} mt-3`}>A capacidade mensal fica em Cadastros › Setores e capacidade.</p>
      </div>

    {/* ── Metas & Impostos ──
        Veio da antiga aba "Financeiro & Metas", que ficou com um painel só
        depois da aposentadoria dos centros de custo. Uma aba inteira para três
        campos da própria empresa era navegação a mais para chegar no mesmo
        lugar — e estes números são atributos da empresa, como o CNPJ e o
        logo, não um assunto separado. */}
    <div className="mt-6 pt-6 border-t border-zinc-800">
      <h3 className={`${ROTULO} mb-4 flex items-center gap-2`}>
        <Target size={16} className="text-rose-500" /> Metas & Impostos
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className={`${ROTULO_PEQUENO} ml-1 mb-1 block`}>
            Meta de receita (mês)
          </label>
          <input
            type="number"
            className={`${CAMPO} w-full font-mono font-bold`}
            value={profile.revenue_goal ?? 0}
            onChange={(e) => onChange({ ...profile, revenue_goal: parseFloat(e.target.value) || 0 })}
          />
          {calculandoMeta && <p className={`${ROTULO_PEQUENO} mt-2`}>calculando sugestão…</p>}
          {meta && (meta.valor !== null ? (
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className={ROTULO_PEQUENO}>Sugestão: {formatCurrency(meta.valor)} / mês</span>
              {/* Não salva sozinho: preenche o campo e a pessoa salva. */}
              <button type="button" className={BOTAO_SUAVE}
                onClick={() => onChange({ ...profile, revenue_goal: meta.valor! })}>
                Usar sugestão
              </button>
            </div>
          ) : (
            <p className={`${ROTULO_PEQUENO} mt-2`}>{meta.motivo}</p>
          ))}
          {meta && (
            <>
              <button type="button" aria-expanded={comoCheguei} onClick={() => setComoCheguei(v => !v)}
                className={`${ROTULO_PEQUENO} mt-2 hover:text-zinc-300`}>
                {comoCheguei ? '▾' : '▸'} Como cheguei nesse número
              </button>
              {comoCheguei && (
                <div className="mt-1 space-y-1">
                  <p className={ROTULO_PEQUENO}>Custo fixo médio (3 meses fechados): {formatCurrency(meta.custoFixoMedio)}</p>
                  <p className={ROTULO_PEQUENO}>Margem das peças: {meta.margemDeContribuicaoPct !== null ? `${String(meta.margemDeContribuicaoPct).replace('.', ',')}%` : '—'}</p>
                  <p className={ROTULO_PEQUENO}>Margem alvo: {String(meta.margemAlvoPct).replace('.', ',')}%</p>
                  <p className={`${ROTULO_PEQUENO} ${meta.fraca ? 'text-amber-400' : ''}`}>
                    A margem foi medida em {meta.coberturaPct}% do faturamento (as peças com custo cadastrado no produto).
                    {meta.fraca && ' — estimativa fraca, complete o custo das peças'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        <div>
          <label className={`${ROTULO_PEQUENO} ml-1 mb-1 block`}>
            Teto de gastos (mês)
          </label>
          <input
            type="number"
            className={`${CAMPO} w-full font-mono font-bold`}
            value={profile.expense_limit ?? 0}
            onChange={(e) => onChange({ ...profile, expense_limit: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className={`${ROTULO_PEQUENO} ml-1 mb-1 block`}>
            Imposto padrão (%)
          </label>
          <input
            type="number"
            className={`${CAMPO} w-full font-mono font-bold`}
            value={profile.default_tax_rate ?? 0}
            onChange={(e) => onChange({ ...profile, default_tax_rate: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>
    </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={onSave}
          disabled={isSaving}
          className={BOTAO_PRINCIPAL}
        >
          {isSaving ? 'Sincronizando...' : 'Salvar Alterações'}
        </button>
      </div>
    </div>
  </div>
  );
};
