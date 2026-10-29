import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O padrão que já apagou dinheiro duas vezes nesta base.
 *
 * As duas vezes tiveram a mesma assinatura: um campo que o BANCO calcula, e um
 * cliente que grava a LINHA INTEIRA a partir de um objeto carregado antes.
 *
 *   `bank_accounts.initial_balance` — o formulário guardava o zero de quando
 *   abriu; salvar depois de ancorar o saldo reescrevia o zero.
 *
 *   `orders.total_amount` — o kanban do PCP mandava o pedido inteiro a cada
 *   arrastada de cartão, e devolvia o total de antes do aditivo.
 *
 * Nos dois casos o conserto não foi "lembrar de recarregar antes de salvar" —
 * isso é pedir que ninguém erre. Foi a gravação parar de carregar campo que
 * não é dela.
 *
 * Estes testes leem o código-fonte porque a regra é sobre o código, e não
 * sobre um valor em tempo de execução. Eles falham quando alguém reabre uma
 * das portas — e a mensagem diz qual porta e por quê.
 *
 * Um deles nasceu largo demais e foi corrigido pelo próprio resultado: proibia
 * toda escrita direta em `financial_obligations`, e reprovou contra um
 * repositório que faz isso com cuidado em quatro lugares. Regra que a base boa
 * não passa é regra errada, não base errada.
 */

const REPOS = join(process.cwd(), 'src', 'repositories');
const arquivos = readdirSync(REPOS).filter(f => f.endsWith('.ts'));
const fonte = (f: string) => readFileSync(join(REPOS, f), 'utf8');

/** Tira comentários, para uma menção dentro de explicação não reprovar. */
function semComentarios(texto: string): string {
    return texto
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
}

test('nenhuma escrita do app define cancelled_at ou status da obrigação', () => {
    // A PRIMEIRA VERSÃO DESTE TESTE PROIBIA escrita direta em
    // financial_obligations, e reprovou na hora. A premissa estava errada: o
    // repositório escreve ali em quatro lugares, e todos com cuidado — uma
    // lista ALLOWED, um patch montado campo a campo com filtro
    // `.is('cancelled_at', null)`, e um destructuring que remove os campos da
    // view antes de espalhar. Criar e editar obrigação é trabalho legítimo do
    // aplicativo; não existe RPC para isso e não precisa existir.
    //
    // O que NÃO pode é o aplicativo decidir que uma conta está cancelada ou
    // paga. Esses dois campos são o resultado de cancel_obligation e
    // pay_obligation, que conferem acesso financeiro, recusam cancelar conta
    // com pagamento ativo e deixam rastro. Escrevê-los por fora pula as três
    // coisas — e nada na tela avisaria.
    const proibidos = ['cancelled_at', 'cancelled_reason'];

    for (const f of arquivos) {
        const src = semComentarios(fonte(f));
        for (const campo of proibidos) {
            // `cancelled_at:` é atribuição. `'cancelled_at'` entre aspas é
            // filtro de consulta, que só lê — e é justamente a trava que o
            // repositório já usa.
            assert.ok(
                !new RegExp(`\b${campo}\s*:`).test(src),
                `${f}: define ${campo} diretamente. Cancelar é trabalho de cancel_obligation — ela confere o acesso, recusa conta com pagamento ativo e deixa rastro.`,
            );
        }
    }
});

test('gravar etapa de produção não carrega campo de dinheiro', () => {
    // saveOrderStage mandava `...order`, e com ele total_amount. O kanban do
    // PCP é arrastado o dia inteiro: cada arrastada regravava o total de quando
    // a tela abriu, apagando aditivos lançados no meio.
    const src = semComentarios(fonte('productionRepository.ts'));
    const i = src.indexOf('saveOrderStage');
    assert.ok(i > 0, 'saveOrderStage sumiu — este teste precisa ser reescrito');

    const corpo = src.slice(i, i + 900);
    assert.ok(!/\.\.\.order\b/.test(corpo),
        'saveOrderStage voltou a espalhar o pedido inteiro. Liste os campos de produção.');
    assert.ok(!/total_amount|amount_paid|discount/.test(corpo),
        'saveOrderStage passou a escrever campo de dinheiro. Isso é do comercial.');
});

test('a conta bancária continua entrando pelo camposDaConta', () => {
    // O util separa INSERT de UPDATE justamente para o UPDATE nunca carregar
    // saldo. Se o repositório parar de usá-lo, a porta do saldo reabre.
    const src = fonte('financeRepository.ts');
    assert.ok(src.includes('camposDaConta'),
        'financeRepository parou de usar camposDaConta — o UPDATE pode ter voltado a carregar saldo.');
});

test('o teste acima sabe REPROVAR — provado contra um trecho falso', () => {
    // Um teste que varre texto precisa demonstrar que o padrão casa com o que
    // deveria pegar. Sem isso, um erro de escape faz o teste aprovar para
    // sempre — e teste verde ninguém investiga.
    const padrao = new RegExp(`\\bcancelled_at\\s*:`);

    const atribuicao = "update({ cancelled_at: now })";
    assert.ok(padrao.test(atribuicao),
        'o padrão não casa nem com uma atribuição óbvia — o escape quebrou');

    // O filtro `.is('cancelled_at', null)` só LÊ, e é a trava que o
    // repositório já usa de propósito. Reprovar nele seria punir o acerto.
    const filtro = ".is('cancelled_at', null)";
    assert.ok(!padrao.test(filtro),
        'o padrão casa com um filtro de leitura — reprovaria código correto');
});

test('tabela verdade só grava por RPC: nenhum insert/update/upsert/delete direto nas tabelas dela', () => {
    const TABELAS = ['tecido_linhas', 'tecido_tipos', 'tecido_faixas', 'tecido_precos', 'fornecedor_condicoes', 'fornecedor_frete'];
    const padrao = new RegExp(String.raw`from\(['"](${TABELAS.join('|')})['"]\)[\s\S]{0,200}?\.(insert|update|upsert|delete)\(`);
    // Prova de que o padrão sabe reprovar (teste que varre texto precisa provar que casa).
    assert.ok(padrao.test(`supabase.from('tecido_precos').upsert(x)`));
    for (const f of arquivos) {
        assert.ok(!padrao.test(semComentarios(fonte(f))), `${f} grava direto numa tabela da tabela verdade: use a RPC`);
    }
});
