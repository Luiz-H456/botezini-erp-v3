import React, { useCallback, useEffect, useState } from 'react';
import { Users, Plus, Star, Trash2, Check, X, Phone, Mail, Database } from 'lucide-react';
import { storageService } from '@/services/storage';
import type { ClientContact } from '@/types';
import { BotaoMensagem } from '@/components/common/BotaoMensagem';
import { ConfirmarOperacao } from '@/components/common/ConfirmarOperacao';
import { msgPrimeiroContato } from '@/utils/mensagensCliente';
import { CARTAO, ITEM, CAMPO, ROTULO, BOTAO_PRINCIPAL, BOTAO_SECUNDARIO, BOTAO_SUAVE } from '@/components/finance/ui/estilo';

interface Props {
    clientId: string;
    /** O contato do campo antigo, mostrado enquanto a migração não roda. */
    contatoAntigo?: string | null;
}

/**
 * Cargos que aparecem de verdade numa confecção de uniformes.
 *
 * A lista existe para o campo não virar texto livre: "Compras", "compras",
 * "Setor de Compras" e "Cpr" nunca se agrupam, e é o agrupamento que permite,
 * depois, mandar a mesma mensagem para todos os RHs da carteira.
 */
const CARGOS = ['compras', 'rh', 'financeiro', 'diretoria', 'administrativo', 'almoxarifado'];

const Input = `${CAMPO} w-full`;

const vazio = (clientId: string): Partial<ClientContact> => ({
    client_id: clientId, nome: '', cargo: '', telefone: '', email: '', principal: false,
});

const fone = (t?: string | null) => {
    const d = (t || '').replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return d || '';
};

/**
 * A agenda do cliente.
 *
 * Um hospital tem compras, RH e financeiro, e são três conversas diferentes:
 * quem aprova a verba não é quem confere a grade, e nenhum dos dois é quem paga
 * o boleto. O campo único obrigava a escolher um e anotar os outros na
 * observação, onde nenhuma mensagem automática os alcança.
 *
 * O PRINCIPAL é o que o sistema usa quando não se sabe para quem ligar — é o
 * papel que o campo antigo cumpria, agora explícito.
 */
export const ContatosDoCliente: React.FC<Props> = ({ clientId, contatoAntigo }) => {
    const [contatos, setContatos] = useState<ClientContact[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [migrado, setMigrado] = useState(true);
    const [rascunho, setRascunho] = useState<Partial<ClientContact> | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    // Excluir contato nao perguntava nada: um clique na lixeira e a pessoa
    // sumia da agenda. Se era o contato principal, o cliente ficava sem
    // ninguem marcado e as mensagens automaticas sem destinatario — e nada
    // na tela dizia isso antes.
    const [excluindo, setExcluindo] = useState<ClientContact | null>(null);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const lista = await storageService.getClientContacts(clientId);
            setContatos(lista);
            // Zero contatos com um contact_person preenchido no cadastro antigo
            // é o sintoma de migração pendente: o .sql copia o campo antigo para
            // cá, então nesse estado a lista nunca deveria estar vazia.
            setMigrado(!(lista.length === 0 && !!(contatoAntigo || '').trim()));
        } catch (e: any) {
            setErro(e?.message || 'Falha ao ler os contatos');
        } finally {
            setCarregando(false);
        }
    }, [clientId, contatoAntigo]);

    useEffect(() => { carregar(); }, [carregar]);

    const salvar = async () => {
        if (!rascunho?.nome?.trim()) { setErro('O nome é obrigatório.'); return; }
        setSalvando(true);
        setErro('');
        try {
            await storageService.saveClientContact({
                ...rascunho,
                nome: rascunho.nome.trim(),
                telefone: (rascunho.telefone || '').replace(/\D/g, '') || null,
            });
            setRascunho(null);
            await carregar();
        } catch (e: any) {
            setErro(e?.message || 'Falha ao gravar');
        } finally {
            setSalvando(false);
        }
    };

    const marcarPrincipal = async (c: ClientContact) => {
        try {
            await storageService.saveClientContact({ ...c, principal: true });
            await carregar();
        } catch (e: any) {
            setErro(e?.message || 'Falha ao marcar');
        }
    };

    const excluir = async () => {
        if (!excluindo) return;
        const id = excluindo.id;
        setExcluindo(null);
        try {
            await storageService.deleteClientContact(id);
            await carregar();
        } catch (e: any) {
            setErro(e?.message || 'Falha ao excluir');
        }
    };

    if (carregando) return null;

    return (
        <section className={`${CARTAO} p-5 space-y-3`}>
            <header className="flex items-center justify-between gap-3">
                <h3 className={`${ROTULO} flex items-center gap-2`}>
                    <Users size={14} className="text-amber-500" /> Contatos
                    <span className="text-zinc-600 tabular-nums">{contatos.length}</span>
                </h3>
                {!rascunho && (
                    <button
                        onClick={() => setRascunho(vazio(clientId))}
                        className={BOTAO_SUAVE}
                    >
                        <Plus size={14} /> Adicionar
                    </button>
                )}
            </header>

            {!migrado && (
                <p className="flex items-start gap-2 text-[10px] text-amber-300/90 bg-amber-500/[0.07] border border-amber-500/25 rounded-xl px-3 py-2.5 leading-snug">
                    <Database size={12} className="shrink-0 mt-0.5" />
                    <span>
                        Este cliente tem <strong>{contatoAntigo}</strong> no campo antigo, que continua
                        valendo. Rodar <code className="font-mono">comercial_acompanhamento.sql</code> traz
                        esse contato para cá automaticamente.
                    </span>
                </p>
            )}

            {contatos.length === 0 && !rascunho && migrado && (
                <p className="text-[11px] text-zinc-600 italic py-3 text-center">
                    Nenhum contato cadastrado. Compras, RH e financeiro costumam ser pessoas diferentes.
                </p>
            )}

            <div className="flex flex-col gap-2">
                {contatos.map(c => (
                    <div
                        key={c.id}
                        className={`${ITEM} flex items-center gap-3 px-3 py-2.5 flex-wrap`}
                    >
                        <button
                            onClick={() => !c.principal && marcarPrincipal(c)}
                            title={c.principal ? 'Contato principal' : 'Tornar principal'}
                            className={`shrink-0 transition-colors ${
                                c.principal ? 'text-amber-500' : 'text-zinc-700 hover:text-amber-500/60'
                            }`}
                        >
                            <Star size={13} fill={c.principal ? 'currentColor' : 'none'} />
                        </button>

                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold text-zinc-200 truncate">
                                {c.nome}
                                {c.cargo && <span className="text-zinc-600 font-medium"> · {c.cargo}</span>}
                            </p>
                            <p className="flex items-center gap-3 text-[10px] text-zinc-600 font-medium mt-0.5 flex-wrap">
                                {c.telefone && (
                                    <span className="flex items-center gap-1 font-mono">
                                        <Phone size={12} /> {fone(c.telefone)}
                                    </span>
                                )}
                                {c.email && (
                                    <span className="flex items-center gap-1 truncate">
                                        <Mail size={12} /> {c.email}
                                    </span>
                                )}
                            </p>
                        </div>

                        <BotaoMensagem
                            texto={msgPrimeiroContato({ contact_person: c.nome })}
                            titulo={`Mensagem — ${c.nome}`}
                            telefone={c.telefone}
                            compacto
                        />

                        <button
                            onClick={() => setExcluindo(c)}
                            title="Excluir contato"
                            aria-label="Excluir contato"
                            className="shrink-0 text-zinc-700 hover:text-rose-400 transition-colors"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}
            </div>

            {rascunho && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                            value={rascunho.nome || ''}
                            onChange={e => setRascunho({ ...rascunho, nome: e.target.value })}
                            placeholder="Nome"
                            className={Input}
                            autoFocus
                        />
                        <input
                            value={rascunho.telefone || ''}
                            onChange={e => setRascunho({ ...rascunho, telefone: e.target.value })}
                            placeholder="Telefone com DDD"
                            className={Input}
                        />
                        <input
                            value={rascunho.email || ''}
                            onChange={e => setRascunho({ ...rascunho, email: e.target.value })}
                            placeholder="E-mail"
                            className={Input}
                        />
                        <input
                            value={rascunho.cargo || ''}
                            onChange={e => setRascunho({ ...rascunho, cargo: e.target.value.toLowerCase() })}
                            placeholder="Cargo"
                            list="cargos-de-contato"
                            className={Input}
                        />
                        <datalist id="cargos-de-contato">
                            {CARGOS.map(c => <option key={c} value={c} />)}
                        </datalist>
                    </div>

                    <label className="flex items-center gap-2 text-[10px] text-zinc-400 font-bold cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!!rascunho.principal}
                            onChange={e => setRascunho({ ...rascunho, principal: e.target.checked })}
                            className="accent-amber-500"
                        />
                        Contato principal — é para quem o sistema escreve quando não se diz outro
                    </label>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={salvar}
                            disabled={salvando}
                            className={BOTAO_PRINCIPAL}
                        >
                            <Check size={14} /> {salvando ? 'Gravando...' : 'Gravar'}
                        </button>
                        <button
                            onClick={() => { setRascunho(null); setErro(''); }}
                            className={BOTAO_SECUNDARIO}
                        >
                            <X size={14} /> Cancelar
                        </button>
                    </div>
                </div>
            )}

            {excluindo && (
                <ConfirmarOperacao
                    operacaoId="excluir-contato"
                    alvo={`${excluindo.nome}${excluindo.cargo ? ` · ${excluindo.cargo}` : ''}`}
                    detalhe={excluindo.principal
                        ? 'Este é o contato PRINCIPAL deste cliente.'
                        : undefined}
                    onConfirmar={excluir}
                    onCancelar={() => setExcluindo(null)}
                />
            )}

            {erro && <p className="text-[10px] text-rose-400">{erro}</p>}
        </section>
    );
};

export default ContatosDoCliente;
