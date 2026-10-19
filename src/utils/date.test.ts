
import test from 'node:test';
import assert from 'node:assert';
import { getTodayStr } from './date.ts';

test('getTodayStr: formats current date as YYYY-MM-DD', () => {
    const d = new Date(2024, 0, 15); // Jan 15, 2024
    const result = getTodayStr(d);
    assert.strictEqual(result, '2024-01-15');
});

test('getTodayStr: pads month and day with zeros', () => {
    const d = new Date(2024, 0, 5); // Jan 5, 2024
    const result = getTodayStr(d);
    assert.strictEqual(result, '2024-01-05');
});

test('getTodayStr: handles December correctly', () => {
    const d = new Date(2023, 11, 31); // Dec 31, 2023
    const result = getTodayStr(d);
    assert.strictEqual(result, '2023-12-31');
});
