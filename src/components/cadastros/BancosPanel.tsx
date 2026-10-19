import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { storageService } from '@/services/storage';
import type { BankAccount } from '@/types';
import { BankAccountModal } from '@/components/modals';
import { AlertToast, ConfirmModal } from '@/components/finance';
import { ConfirmarOperacao } from '@/components/common/ConfirmarOperacao';
import { useMostrarValor } from '@/hooks/financas/useMostrarValor';
import {
    conferirSaldos, movimentosDosPagamentos, dadosCompletosDaConferencia, situacaoDoSaldo,
    previaDaSincronizacao,
} from '@/utils/conferenciaDeSaldo';
import type { ResultadoDaConferencia, PreviaDaSincronizacao } from '@/utils/conferenciaDeSaldo';
import { TIPO_DE_CONTA } from '@/utils/opcoesAgrupadas';
import {
    CARTAO, ITEM, ROTULO, ROTULO_PEQUENO, BOTAO_PRINCIPAL, BOTAO_SUAVE,
    BOTAO_SECUNDARIO, BOTAO_PERIGO, pilula,
} from '@/components/finance/ui/estilo';

type Aviso = { msg: string; type: 'success' | 'error' };

/**
 * Cadastros › Bancos: a lista dos bancos, com a conferência do saldo de cada um.
 * Montada com as peças que Finance usava (salvar, ajustar saldo, inativar, sincronizar).
 */
export default function BancosPanel() {
    const { mostrar } = useMostrarValor();
    const [bancos, setBancos] = useState<BankAccount[]>([]);
    const [conferencia, setConferencia] = useState<ResultadoDaConferencia | null>(null);
    /** O que cada banco vira se sincronizar (null = não deu para calcular). */
    const [previa, setPrevia] = useState<PreviaDaSincronizacao[] | null>(null);
    const [mostrarInativos, setMostrarInativos] = useState(false);
    const [carregando, setCarregando] = useState(true);
    const [erroDaConferencia, setErroDaConferencia] = useState('');
    const [modalAberto, setModalAberto] = useState(false);
    const [selecionado, setSelecionado] = useState<BankAccount | null>(null);
    const [confirmar, setConfirmar] = useState<{ tipo: 'inativar' | 'reativar'; banco: BankAccount } | null>(null);
    const [sincronizarAberto, setSincronizarAberto] = useState(false);
    const [aviso, setAviso] = useState<Aviso | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showAlert = useCallback((msg: string, type: Aviso['type'] = 'success') => {
        setAviso({ msg, type });
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setAviso(null), 3500);
    }, []);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    // Cada carga ganha um número; só a mais recente escreve na tela (alternar
    // "Mostrar inativos" rápido não deixa uma resposta velha por cima da nova).
    const ultimaCarga = useRef(0);
    const carregar = useCallback(async () => {
        const esta = ++ultimaCarga.current;
        // A lista dos bancos não depende da conferência: se obrigações ou
        // pagamentos falharem, os bancos aparecem, só que sem veredito.
        const [lista, leituras] = await Promise.allSettled([
            storageService.getBankAccounts(!mostrarInativos),
            Promise.all([storageService.getObligations(), storageService.getAllPaymentsComTeto()]),
        ]);
        if (esta !== ultimaCarga.current) return;
        setCarregando(false);
        if (lista.status === 'rejected') {
            showAlert('Erro ao carregar: ' + (lista.reason?.message ?? lista.reason), 'error');
            return;
        }
        setBancos(lista.value);
        if (leituras.status === 'rejected') {
            setConferencia(null);
            setPrevia(null);
            setErroDaConferencia(String(leituras.reason?.message ?? leituras.reason));
            return;
        }
        const [contas, pags] = leituras.value;
        const ativosDaLista = lista.value.filter(b => b.is_active);
        const movimentos = movimentosDosPagamentos(pags.pagamentos, contas);
        const completos = dadosCompletosDaConferencia(pags.truncado, contas.length);
        setConferencia(conferirSaldos(ativosDaLista, movimentos, { dadosCompletos: completos }));
        setPrevia(previaDaSincronizacao(ativosDaLista, movimentos, completos));
        setErroDaConferencia('');
    }, [mostrarInativos, showAlert]);

    useEffect(() => { void carregar(); }, [carregar]);

    // A chave só existe quando a coluna existe: é assim que se sabe se o SQL rodou.
    const camposNovos = bancos.some(b => 'titular' in b);

    const abrir = (b: BankAccount | null) => { setSelecionado(b); setModalAberto(true); };

    const salvar = async (banco: Partial<BankAccount>) => {
        try {
            await storageService.saveBankAccount(banco as BankAccount);
            showAlert('Conta Bancária salva', 'success');
            void carregar();
        } catch (e: any) { showAlert(e.message, 'error'); }
    };

    const confirmarOperacao = async () => {
        if (!confirmar) return;
        const { tipo, banco } = confirmar;
        setConfirmar(null);
        try {
            if (tipo === 'inativar') {
                await storageService.deleteBankAccount(banco.id); // soft delete
                showAlert('Conta Bancária inativada', 'success');
            } else {
                await storageService.reactivateBankAccount(banco.id);
                showAlert('Conta Bancária reativada', 'success');
            }
            void carregar();
        } catch (e: any) { showAlert(String(e?.message || e), 'error'); }
    };

    const sincronizar = async () => {
        setSincronizarAberto(false);
        try {
            await storageService.recalculateAllBankBalances();
            showAlert('Saldos sobrescritos', 'success');
            void carregar();
        } catch (e: any) { showAlert(e.message, 'error'); }
    };


    return (
        <div className="space-y-6">
            <div className="flex items-center justify-end gap-3">
                <button type="button" className={BOTAO_PRINCIPAL} onClick={() => abrir(null)}>Novo banco</button>
            </div>

            <div className="space-y-3">
                {carregando && <Loader2 size={16} className="animate-spin text-zinc-600" />}
                {erroDaConferencia && (
                    <p className="text-xs text-rose-400">
                        Não consegui conferir os saldos ({erroDaConferencia}). Os bancos aparecem sem a conferência.
                    </p>
                )}
                {bancos.map(b => {
                    const s = conferencia && b.is_active ? situacaoDoSaldo(conferencia, b.id) : { tipo: 'sem-dados' as const };
                    return (
                        <div key={b.id} className={`${ITEM} p-4 flex flex-wrap items-center justify-between gap-3`}>
                            <div className="min-w-0">
                                <p className={`text-sm font-bold truncate ${b.is_active ? 'text-white' : 'line-through text-zinc-500'}`}>{b.name}</p>
                                <p className={ROTULO_PEQUENO}>{[b.bank_name, TIPO_DE_CONTA[b.type] ?? b.type].filter(Boolean).join(' · ')}</p>
                            </div>
                            <div className="text-right">
                                <p className={`text-sm font-black tabular-nums ${b.current_balance < 0 ? 'text-rose-400' : 'text-white'}`}>
                                    {mostrar(b.current_balance)}
                                </p>
                                {s.tipo === 'bate' && <p className="text-xs text-emerald-500/80">✓ bate com os lançamentos</p>}
                                {s.tipo === 'nao-bate' && (
                                    <p className="text-xs text-rose-400">
                                        não bate: guardado {mostrar(s.guardado)} × lançamentos {mostrar(s.calculado)}
                                    </p>
                                )}
                                {s.tipo === 'sem-partida' && <p className="text-xs text-amber-400">falta o saldo de partida</p>}
                            </div>
                            <div className="flex gap-2">
                                {s.tipo === 'sem-partida' && (
                                    <button type="button" className={BOTAO_SUAVE} onClick={() => abrir(b)}>Ajustar pelo extrato</button>
                                )}
                                <button type="button" className={BOTAO_SECUNDARIO} onClick={() => abrir(b)}>Editar</button>
                                {b.is_active
                                    ? <button type="button" className={BOTAO_PERIGO} onClick={() => setConfirmar({ tipo: 'inativar', banco: b })}>Inativar</button>
                                    : <button type="button" className={BOTAO_SECUNDARIO} onClick={() => setConfirmar({ tipo: 'reativar', banco: b })}>Reativar</button>}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div>
                <button type="button" className={pilula(mostrarInativos)} onClick={() => setMostrarInativos(v => !v)}>
                    Mostrar inativos
                </button>
            </div>

            <div className={`${CARTAO} p-5 space-y-3`}>
                <h3 className={ROTULO}>Manutenção</h3>
                <p className="text-sm text-zinc-400">
                    Sincronizar saldos sobrescreve o saldo guardado de cada banco pelo calculado a partir dos lançamentos.
                    Confira os bancos que não batem antes — sincronizar apaga o saldo guardado.
                </p>
                <button type="button" className={BOTAO_PERIGO} onClick={() => setSincronizarAberto(true)}>Sincronizar saldos…</button>
            </div>

            {modalAberto && (
                <BankAccountModal
                    isOpen={modalAberto}
                    account={selecionado}
                    camposNovos={camposNovos}
                    onClose={() => setModalAberto(false)}
                    onSave={salvar}
                    onSetBalance={async (accountId, newBalance) => {
                        try {
                            const { anterior, conta } = await storageService.setBankBalance(accountId, newBalance, 'Ajuste manual de saldo');
                            showAlert(`Saldo ajustado de ${mostrar(anterior)} para ${mostrar(newBalance)}`, 'success');
                            void carregar();
                            return conta || undefined;
                        } catch (e: any) {
                            // `set_bank_balance` vem de finance_phase10_lancamento_informativo.sql; sem
                            // esta tradução o erro chegava como texto cru do Postgres.
                            const msg = String(e?.message || '');
                            if (/set_bank_balance/.test(msg) && /(does not exist|could not find|schema cache)/i.test(msg)) {
                                throw new Error(
                                    'O ajuste de saldo nao esta instalado neste banco. '
                                    + 'Rode supabase/finance_phase10_lancamento_informativo.sql '
                                    + 'no SQL Editor. Nada foi alterado.');
                            }
                            throw e;
                        }
                    }}
                    onDelete={(banco) => { setModalAberto(false); setConfirmar({ tipo: 'inativar', banco }); }}
                />
            )}

            {confirmar?.tipo === 'inativar' && (
                <ConfirmarOperacao
                    operacaoId="inativar-conta"
                    alvo={confirmar.banco.name}
                    onConfirmar={confirmarOperacao}
                    onCancelar={() => setConfirmar(null)}
                />
            )}

            {confirmar?.tipo === 'reativar' && (
                <ConfirmModal
                    isOpen
                    title="Reativar Conta?"
                    message={`Deseja reativar a conta "${confirmar.banco.name}"? Ela voltará a somar no saldo total e aparecerá em novos lançamentos.`}
                    onConfirm={confirmarOperacao}
                    onClose={() => setConfirmar(null)}
                    isDanger={false}
                    confirmLabel="Reativar"
                />
            )}

            {sincronizarAberto && (
                <ConfirmarOperacao
                    operacaoId="sincronizar-saldos"
                    detalhe={
                        <div className="space-y-1">
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5">
                                O que cada conta vira
                            </p>
                            {/* O saldo que FICA, já somado. Mostrar "saldo de partida + lançamentos"
                                fazia a âncora parecer o novo saldo (R$ 59 mil → R$ 286 mil). */}
                            {previa === null ? (
                                <p className="text-amber-400">Não consegui calcular o resultado agora — confira os bancos antes de sincronizar.</p>
                            ) : previa.map(p => (
                                <div key={p.id} className="flex items-center justify-between gap-3">
                                    <span className="truncate text-zinc-400">{p.nome}</span>
                                    <span className="font-mono tabular-nums shrink-0">
                                        {mostrar(p.atual)}
                                        <span className="text-zinc-600"> {'→'} </span>
                                        {p.depois === null ? (
                                            <span className="text-amber-400">não dá para prever</span>
                                        ) : p.muda ? (
                                            <span className="text-rose-300">{mostrar(p.depois)}</span>
                                        ) : (
                                            <span className="text-zinc-400">{mostrar(p.depois)} · não muda</span>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    }
                    onConfirmar={sincronizar}
                    onCancelar={() => setSincronizarAberto(false)}
                />
            )}

            {aviso && createPortal(<AlertToast msg={aviso.msg} type={aviso.type} />, document.body)}
        </div>
    );
}
