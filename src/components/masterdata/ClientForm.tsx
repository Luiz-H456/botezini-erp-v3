import React from 'react';
import { maskCNPJ, maskPhone } from '@/utils';
import type { Client } from '@/types';
import { PAYMENT_TERMS_OPTIONS } from '@/types/finance';
import { ClientScoreBadge } from '@/components/finance/ClientScoreBadge';
import { SearchableSelect, InfoTooltip } from '@/components/common';
import { MesclagemEGrupo } from './MesclagemEGrupo';
import { ROTULO_PEQUENO } from '@/components/finance/ui/estilo';

export interface ClientFormProps {
  data: Partial<Client>;
  onChange: (data: Partial<Client>) => void;
  categorySelect: React.ReactNode;
  /** Todos os clientes — para achar duplicatas e grupos existentes. */
  clientes?: Client[];
}

const InputCls = 'w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-200 outline-none focus:border-amber-500/30 transition-all placeholder:text-zinc-700 hover:border-zinc-700';
const LabelCls = 'text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis ml-1';

export const ClientForm: React.FC<ClientFormProps> = ({
  data,
  onChange,
  categorySelect,
  clientes = [],
}) => (
  <div className="space-y-4">
    {data.id && (
      <div className="flex items-center justify-between bg-zinc-950/40 border border-zinc-800 rounded-xl px-3 py-2">
        <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Score de crédito</span>
        <ClientScoreBadge clientId={data.id} />
      </div>
    )}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className={LabelCls}>Empresa *</label>
        <input
          className={InputCls}
          value={data.company_name || ''}
          onChange={(e) => onChange({ ...data, company_name: e.target.value })}
        />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <label className={LabelCls}>Categoria</label>
          <InfoTooltip iconSize={11}>
            <p className="text-[10px] font-bold text-zinc-400 leading-relaxed">
              Categorização para o CRM (ex.: Atacado, Varejo, Representante).
            </p>
          </InfoTooltip>
        </div>
        {categorySelect}
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className={LabelCls}>CNPJ</label>
        <input
          className={InputCls}
          value={data.cnpj || ''}
          onChange={(e) => onChange({ ...data, cnpj: maskCNPJ(e.target.value) })}
          maxLength={18}
        />
      </div>
      <div>
        <label className={LabelCls}>Telefone</label>
        <input
          className={InputCls}
          value={data.phone || ''}
          onChange={(e) => onChange({ ...data, phone: maskPhone(e.target.value) })}
          maxLength={15}
        />
      </div>
      <div>
        <label className={LabelCls}>Inscrição Estadual</label>
        <input
          className={InputCls}
          value={data.inscricao_estadual || ''}
          onChange={(e) => onChange({ ...data, inscricao_estadual: e.target.value })}
          placeholder="ISENTO"
        />
      </div>
    </div>
    <div>
      <label className={LabelCls}>Email</label>
      <input
        className={InputCls}
        value={data.email || ''}
        onChange={(e) => onChange({ ...data, email: e.target.value })}
      />
    </div>
    <div>
      <label className={LabelCls}>Contato (Pessoa)</label>
      <input
        className={InputCls}
        value={data.contact_person || ''}
        onChange={(e) => onChange({ ...data, contact_person: e.target.value })}
      />
    </div>
    <div>
      <label className={LabelCls}>Condição de Pagamento</label>
      <SearchableSelect
        value={data.default_payment_terms || ''}
        onChange={(v) => onChange({ ...data, default_payment_terms: v || undefined })}
        options={[{ value: '', label: '— NÃO DEFINIDA —' }, ...PAYMENT_TERMS_OPTIONS.map(o => ({ value: o.value, label: o.label }))]}
        placeholder="CONDIÇÃO..."
      />
    </div>
    <div>
      <label className={LabelCls}>Endereço</label>
      <input
        className={InputCls}
        value={data.address || ''}
        onChange={(e) => onChange({ ...data, address: e.target.value })}
      />
    </div>

    <MesclagemEGrupo data={data} onChange={onChange} clientes={clientes} />

    {/* Fotos e anotações moram na página do cliente: aqui só o cadastro. */}
    <p className={ROTULO_PEQUENO}>Fotos e anotações ficam na página do cliente (botão de abrir na lista).</p>
  </div>
);
