// Modo privado — esconde os valores em dinheiro no app inteiro.
//
// Por que um sinalizador de módulo e não um contexto do React: todo valor do
// app passa por `formatCurrency`, que é chamada de 27 arquivos, muitos deles
// funções puras e utilitários fora da árvore de componentes. Retrofitar um
// contexto em cada chamada seria centenas de mudanças e, pior, deixaria de
// fora justamente os lugares esquecidos — e um modo privado que esconde 95%
// dos valores não serve para nada, porque o que vaza é o que importa.
//
// Quem liga o modo é o React (ver App), e a re-renderização vem de lá: o
// estado fica no topo da árvore, então virar a chave re-renderiza as telas e
// elas formatam de novo, agora mascarado.

/** O que aparece no lugar do valor. Largura fixa para a tela não dançar. */
export const MASCARA = '••••••';

let oculto = false;

export function valoresOcultos(): boolean {
    return oculto;
}

// Assinantes: qualquer componente pode reagir sem que o estado precise descer
// por props. Existe porque há mais de um interruptor na tela (a barra do topo e
// o do Financeiro) e dois controles do mesmo estado que não se falam viram um
// mostrando "oculto" enquanto o outro mostra "visível".
const assinantes = new Set<() => void>();

export function assinarPrivacidade(fn: () => void): () => void {
    assinantes.add(fn);
    return () => { assinantes.delete(fn); };
}

export function definirValoresOcultos(v: boolean): void {
    oculto = v;
    salvarPreferenciaDePrivacidade(v);
    for (const fn of assinantes) fn();
}

const CHAVE = 'botezini_valores_ocultos';

/** Lê a preferência salva. Chamada uma vez, na subida do app. */
export function carregarPreferenciaDePrivacidade(): boolean {
    try {
        const v = localStorage.getItem(CHAVE) === '1';
        oculto = v;
        return v;
    } catch {
        // localStorage bloqueado (navegação privada, política do navegador):
        // o modo simplesmente não persiste, mas o app não pode quebrar por isso.
        return false;
    }
}

export function salvarPreferenciaDePrivacidade(v: boolean): void {
    try { localStorage.setItem(CHAVE, v ? '1' : '0'); } catch { /* idem */ }
}
