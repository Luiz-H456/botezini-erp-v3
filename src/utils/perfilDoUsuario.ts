/**
 * Como o usuário aparece na barra de cima.
 *
 * O sistema só guardava `full_name`, e ele nunca foi preenchido — a barra caía
 * no rótulo do cargo, então todo mundo aparecia como "Administrador". Um nome
 * que não é o da pessoa é pior que nenhum: some a informação e ainda ocupa o
 * lugar dela.
 *
 * A escada aqui vai do mais pessoal ao mais genérico, e cada degrau só é usado
 * quando o de cima está de fato vazio.
 *
 * Sem imports do app, para ser testado direto com `node --test`.
 */

export interface PerfilParaExibir {
    full_name?: string | null;
    email?: string | null;
    role?: string | null;
    avatar_url?: string | null;
}

export const ROTULO_DO_CARGO: Record<string, string> = {
    admin: 'Administrador',
    manager: 'Gerente',
    factory: 'Produção',
};

const limpo = (s?: string | null) => (s || '').trim();

/**
 * O que escrever no lugar do nome.
 *
 * Sem nome cadastrado, o trecho do e-mail antes do @ identifica melhor que o
 * cargo: numa casa com dois gerentes, "Gerente" não diz qual dos dois está
 * logado, e "marina" diz.
 */
export function nomeDeExibicao(perfil?: PerfilParaExibir | null): string {
    const nome = limpo(perfil?.full_name);
    if (nome) return nome;

    const email = limpo(perfil?.email);
    if (email.includes('@')) {
        const usuario = email.split('@')[0]
            .replace(/[._-]+/g, ' ')
            .trim();
        if (usuario) {
            return usuario
                .split(/\s+/)
                .map(p => p.charAt(0).toUpperCase() + p.slice(1))
                .join(' ');
        }
    }
    if (email) return email;
    return rotuloDoCargo(perfil?.role);
}

export const rotuloDoCargo = (role?: string | null): string =>
    ROTULO_DO_CARGO[limpo(role).toLowerCase()] || limpo(role) || 'Usuário';

/**
 * Iniciais para o círculo, quando não há foto.
 *
 * Duas letras, da primeira e da ÚLTIMA palavra — "Maria Eduarda Silva" vira
 * MS, não ME. É como se lê um nome em português: o primeiro e o sobrenome.
 * Palavras de ligação ficam de fora pelo mesmo motivo.
 */
const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

export function iniciais(perfil?: PerfilParaExibir | null): string {
    const base = nomeDeExibicao(perfil);
    const partes = base
        .split(/\s+/)
        .map(p => p.replace(/[^\p{L}]/gu, ''))
        .filter(p => p && !LIGACOES.has(p.toLowerCase()));

    if (partes.length === 0) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * Cor do círculo, derivada do nome.
 *
 * Determinística de propósito: a mesma pessoa tem sempre a mesma cor, então o
 * círculo vira reconhecível de relance mesmo sem ler as letras. Sortear a cada
 * carregamento tiraria justamente isso.
 *
 * A paleta evita âmbar — é a cor de ação do app, e um avatar âmbar competiria
 * com o que está selecionado no menu.
 */
export const CORES_DE_AVATAR = [
    'bg-sky-500/15 text-sky-300 border-sky-500/30',
    'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    'bg-violet-500/15 text-violet-300 border-violet-500/30',
    'bg-rose-500/15 text-rose-300 border-rose-500/30',
    'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    'bg-orange-500/15 text-orange-300 border-orange-500/30',
];

export function corDoAvatar(perfil?: PerfilParaExibir | null): string {
    const base = limpo(perfil?.full_name) || limpo(perfil?.email) || '';
    if (!base) return CORES_DE_AVATAR[0];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma = (soma + base.charCodeAt(i)) % 9973;
    return CORES_DE_AVATAR[soma % CORES_DE_AVATAR.length];
}

/** Falta preencher o nome de verdade? Governa o convite a completar o perfil. */
export const semNomeProprio = (perfil?: PerfilParaExibir | null): boolean =>
    !limpo(perfil?.full_name);
