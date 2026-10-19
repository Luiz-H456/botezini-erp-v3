import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerGrade } from './grade.ts';

const ok = (t: string) => { const r = lerGrade(t); assert.ok(r.ok, JSON.stringify(r)); return r.ok ? r.tamanhos : []; };

test('formatos aceitos', () => {
    assert.deepEqual(ok('P 10, M 20, G 15, GG 5'), [
        { size: 'P', quantity: 10 }, { size: 'M', quantity: 20 }, { size: 'G', quantity: 15 }, { size: 'GG', quantity: 5 }]);
    assert.deepEqual(ok('p10;m:20\ng=3'), [{ size: 'P', quantity: 10 }, { size: 'M', quantity: 20 }, { size: 'G', quantity: 3 }]);
    assert.deepEqual(ok('EXG 2'), [{ size: 'EXG', quantity: 2 }]);
    assert.deepEqual(ok('36 4, 38: 6'), [{ size: '36', quantity: 4 }, { size: '38', quantity: 6 }]);
});

test('erros claros; nada é inventado', () => {
    assert.deepEqual(lerGrade(''), { ok: false, erro: 'Digite a grade, ex.: P 10, M 20, G 15' });
    assert.deepEqual(lerGrade('M 10, M 5'), { ok: false, erro: 'Tamanho repetido: M' });
    assert.deepEqual(lerGrade('P 0'), { ok: false, erro: 'Quantidade zero em P' });
    assert.deepEqual(lerGrade('ABCDE'), { ok: false, erro: 'Não entendi "ABCDE"' });
    assert.deepEqual(lerGrade('364'), { ok: false, erro: 'Não entendi "364"' });
});
