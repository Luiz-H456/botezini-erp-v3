import React from 'react';
import { maskCNPJ, maskPhone } from '@/utils';
import { FolderTree } from 'lucide-react';
import type { Supplier } from '@/types';
import { SearchableSelect } from '@/components/common';
import { InfoTooltip } from '@/components/common';

export interface SupplierFormProps {
  data: Partial<Supplier>;
  onChange: (data: Partial<Supplier>) => void;
  categorySelect: React.ReactNode;
}

const InputCls = 'w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-200 outline-none focus:border-amber-500/30 transition-all placeholder:text-zinc-700 hover:border-zinc-700';
const LabelCls = 'text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1.5 whitespace-nowrap overflow-hidden text-ellipsis ml-1';

export const SupplierForm: React.FC<SupplierFormProps> = ({
  data,
  onChange,
  categorySelect,
}) => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="col-span-2">
        <label className={LabelCls}>Empresa *</label>
        <input
          className={InputCls}
          value={data.company_name || ''}
          onChange={(e) => onChange({ ...data, company_name: e.target.value })}
        />
      </div>
      <div>
        <label className={LabelCls}>Categoria</label>
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
      <label className={LabelCls}>Endereço</label>
      <input
        className={InputCls}
        value={data.address || ''}
        onChange={(e) => onChange({ ...data, address: e.target.value })}
      />
    </div>

    <div className="border-t border-zinc-800/50 pt-4 mt-2">
      <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
        <FolderTree size={14} /> Classificação Financeira Padrão
      </h4>
      {/* Padrão de meio de pagamento: o que se repete em todo lançamento deste
          fornecedor e não deveria ser redigitado. É sugestão — o lançamento
          pode divergir sem alterar o cadastro. */}
      <div className="max-w-sm">
        <div>
          <label className={`${LabelCls} flex items-center gap-1.5`}>
            Meio de Pagamento Habitual
            <InfoTooltip iconSize={11}>
              <p className="text-[11px] text-zinc-300 leading-relaxed">
                Preenchido automaticamente ao lançar uma conta deste fornecedor.
                Continua editável em cada lançamento — serve para você confirmar
                em vez de redigitar.
              </p>
            </InfoTooltip>
          </label>
          <SearchableSelect
            value={data.default_planned_method || ''}
            onChange={(m) => onChange({ ...data, default_planned_method: m || undefined })}
            options={[
              { value: '', label: 'NENHUM' },
              ...['PIX', 'Boleto', 'TED', 'DOC', 'Cartão', 'Dinheiro', 'Cheque']
                .map(m => ({ value: m, label: m.toUpperCase() })),
            ]}
            placeholder="SELECIONAR..."
          />
        </div>
      </div>
    </div>
  </div>
);
