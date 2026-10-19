import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotuloDaOrigem } from './origemDoMovimento.ts';

test('cada origem tem o seu rótulo', () => {
    assert.equal(rotuloDaOrigem('compra'), 'Compra');
    assert.equal(rotuloDaOrigem('estorno_compra'), 'Compra excluída');
    assert.equal(rotuloDaOrigem('sobra'), 'Sobra do pedido');
    assert.equal(rotuloDaOrigem('uso_estoque'), 'Usado no pedido');
    assert.equal(rotuloDaOrigem('devolucao'), 'Pedido excluído');
    assert.equal(rotuloDaOrigem('ajuste'), 'Ajuste de contagem');
    assert.equal(rotuloDaOrigem('producao'), 'Baixa antiga');
    assert.equal(rotuloDaOrigem('manual'), 'Lançamento antigo');
});

test('vazio ou desconhecido é lançamento antigo', () => {
    assert.equal(rotuloDaOrigem(undefined), 'Lançamento antigo');
    assert.equal(rotuloDaOrigem(null), 'Lançamento antigo');
    assert.equal(rotuloDaOrigem(''), 'Lançamento antigo');
    assert.equal(rotuloDaOrigem('xyz'), 'Lançamento antigo');
    assert.equal(rotuloDaOrigem('toString'), 'Lançamento antigo');
});
