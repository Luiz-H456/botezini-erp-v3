// Cache curto das leituras pesadas, para trocar de tela não refazer tudo.
//
// O problema: 14 hooks puxam as tabelas inteiras (pedidos, clientes,
// orçamentos, produtos). Trocar de aba no PCP três vezes eram três recargas
// completas — segundos de "carregando" a cada navegação.
//
// A regra que não pode quebrar: NUNCA servir dado anterior a uma escrita. Isso
// traria de volta o problema que o useCargaProgressiva resolveu, só que pior —
// em vez de piscar, a tela mostraria o valor antigo como se fosse o certo.
//
// Por isso o cache não é invalidado por chave nem por tabela: qualquer escrita
// no banco, em qualquer tabela, zera TUDO. É deliberadamente grosseiro. Uma
// invalidação fina erraria o dia em que alguém acrescentasse uma escrita nova e
// esquecesse de mapear quais leituras ela afeta — e o sintoma seria número
// errado na tela, que é o pior tipo de defeito para um ERP. Recarregar de mais
// custa uma requisição; recarregar de menos custa uma decisão tomada em cima de
// dado velho.

interface Entrada {
    versao: number;
    quando: number;
    valor: Promise<any>;
}

/** Sobe a cada escrita. Entrada de versão antiga é descartada. */
let versaoDados = 0;
const entradas = new Map<string, Entrada>();

/**
 * Janela curta de propósito. Serve para a navegação entre telas (que acontece
 * em segundos), não para poupar banco. Passado o prazo, busca de novo mesmo sem
 * ninguém ter escrito — é a rede de segurança para alteração feita fora do app,
 * direto no Supabase ou por outro usuário.
 */
const VALIDADE_MS = 20_000;

/** Chamado por QUALQUER escrita. Descarta tudo que foi lido antes dela. */
export function invalidarCacheDeLeitura(): void {
    versaoDados++;
    entradas.clear();
}

/** Só para os testes — devolve o cache ao estado inicial. */
export function limparCacheDeLeitura(): void {
    versaoDados = 0;
    entradas.clear();
}

export function versaoAtualDosDados(): number {
    return versaoDados;
}

/**
 * Executa `buscar`, reaproveitando o resultado recente da mesma chave.
 *
 * Guarda a PROMESSA, não o valor resolvido. É o que faz duas telas que abrem
 * juntas e pedem `clientes` ao mesmo tempo dividirem uma requisição só, em vez
 * de disparar duas e ainda por cima gravar duas entradas.
 *
 * Se a busca falhar, a entrada é removida: erro não vira resposta cacheada,
 * senão um tropeço de rede se repetiria por 20 segundos.
 */
const VERBOS_DE_ESCRITA = new Set(['insert', 'upsert', 'update', 'delete']);

/**
 * Embrulha o cliente do banco para toda escrita invalidar o cache sozinha.
 *
 * Existe porque o app tem 89 pontos de escrita em 11 repositórios. Marcar a
 * invalidação em cada um seria pedir para esquecer de um — e o esquecido não
 * daria erro, daria número velho na tela, que ninguém percebe na hora. Aqui não
 * há o que lembrar: quem escrever amanhã já passa por este ponto.
 *
 * Pega no `from(tabela)`: no cliente do PostgREST o verbo (insert/upsert/
 * update/delete) é sempre a PRIMEIRA chamada depois dele — os filtros só vêm
 * depois. Então interceptar esse primeiro nível cobre toda escrita.
 *
 * Invalida na CHAMADA, não quando a escrita termina. Se ela falhar, o custo é
 * uma releitura desnecessária; esperar o fim abriria uma janela em que uma
 * leitura paralela gravaria no cache dado já vencido.
 *
 * `rpc` invalida sempre, mesmo que a função só leia. Distinguir exigiria uma
 * lista de nomes para manter, e o erro dessa lista seria de novo dado velho.
 */
export function comInvalidacaoAutomatica<T extends object>(cliente: T): T {
    const pegar = (alvo: any, prop: string | symbol) => {
        const valor = alvo[prop];
        return typeof valor === 'function' ? valor.bind(alvo) : valor;
    };

    return new Proxy(cliente, {
        get(alvo: any, prop) {
            if (prop === 'from' && typeof alvo.from === 'function') {
                return (...args: any[]) => {
                    const construtor = alvo.from(...args);
                    return new Proxy(construtor, {
                        get(b: any, verbo) {
                            if (typeof verbo === 'string' && VERBOS_DE_ESCRITA.has(verbo)
                                && typeof b[verbo] === 'function') {
                                return (...a: any[]) => {
                                    invalidarCacheDeLeitura();
                                    return b[verbo](...a);
                                };
                            }
                            return pegar(b, verbo);
                        },
                    });
                };
            }

            if (prop === 'rpc' && typeof alvo.rpc === 'function') {
                return (...args: any[]) => {
                    invalidarCacheDeLeitura();
                    return alvo.rpc(...args);
                };
            }

            return pegar(alvo, prop);
        },
    }) as T;
}

export function comCache<T>(chave: string, buscar: () => Promise<T>): Promise<T> {
    const agora = Date.now();
    const atual = entradas.get(chave);

    if (atual && atual.versao === versaoDados && agora - atual.quando < VALIDADE_MS) {
        return atual.valor as Promise<T>;
    }

    const versaoNaChamada = versaoDados;
    const promessa = buscar().catch(err => {
        entradas.delete(chave);
        throw err;
    });

    entradas.set(chave, { versao: versaoNaChamada, quando: agora, valor: promessa });
    return promessa;
}
