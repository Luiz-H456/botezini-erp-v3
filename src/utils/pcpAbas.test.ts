import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABAS_DA_FABRICA } from './pcpAbas.ts';

test('o papel factory só alcança as três abas dele, sem o simulador', () => {
    assert.deepEqual(ABAS_DA_FABRICA, ['kanban', 'control', 'rendimento']);
    assert.ok(!(ABAS_DA_FABRICA as string[]).includes('simulator'));
});
