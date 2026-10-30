/**
 * Central de avisos do app inteiro (auditoria de 29/10, C5 e R5).
 *
 * Antes eram três jeitos de avisar — o Toast (sumia em 3 s, inclusive erro), o AlertToast do
 * Financeiro (cada tela com o seu tempo) e a janela "Atenção / Entendido" dos Orçamentos — e o
 * mesmo tipo de coisa aparecia diferente conforme a tela. Agora toda tela chama `avisar`:
 *  - sucesso e informação somem sozinhos;
 *  - ERRO FICA até a pessoa fechar: quem desviou o olho ainda lê o que falhou;
 *  - erro passa pelo tradutor (mensagem de banco vira português que diz o que fazer);
 *  - o mesmo aviso repetido não empilha; no máximo 3 na tela.
 *
 * Sem React aqui (testável com node --test); a tela é components/common/CentralDeAvisos.
 */
import { mensagemDeErro } from './errorHandling.ts';

export type TipoDeAviso = 'success' | 'error' | 'info';
export interface Aviso { id: number; tipo: TipoDeAviso; titulo?: string; mensagem: string }

export const DURACAO_MS = 4000;
export const MAXIMO_NA_TELA = 3;
export const someSozinho = (tipo: TipoDeAviso): boolean => tipo !== 'error';

let lista: Aviso[] = [];
let proximo = 1;
const ouvintes = new Set<(l: Aviso[]) => void>();
const emitir = () => ouvintes.forEach(f => f(lista));

export function avisar(mensagem: string, tipo: TipoDeAviso = 'success', titulo?: string): number {
    const texto = tipo === 'error' ? mensagemDeErro(mensagem, 'Algo deu errado. Tente de novo.') : (mensagem || '').trim();
    if (!texto) return 0;
    const igual = lista.find(a => a.tipo === tipo && a.mensagem === texto);
    if (igual) return igual.id;
    const aviso: Aviso = { id: proximo++, tipo, titulo, mensagem: texto };
    lista = [...lista, aviso].slice(-MAXIMO_NA_TELA);
    emitir();
    if (someSozinho(tipo) && typeof setTimeout === 'function') setTimeout(() => fecharAviso(aviso.id), DURACAO_MS);
    return aviso.id;
}

export function fecharAviso(id: number): void {
    const antes = lista.length;
    lista = lista.filter(a => a.id !== id);
    if (lista.length !== antes) emitir();
}

export function ouvirAvisos(fn: (l: Aviso[]) => void): () => void {
    ouvintes.add(fn);
    fn(lista);
    return () => { ouvintes.delete(fn); };
}

/** Só para teste: começa do zero. */
export function limparAvisos(): void { lista = []; emitir(); }
