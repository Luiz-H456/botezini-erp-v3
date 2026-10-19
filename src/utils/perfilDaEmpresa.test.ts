import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dadosBancariosDoOrcamento, colunasOpcionaisDoPerfil } from './perfilDaEmpresa.ts';

const antigos = { bank_name: 'Itaú', agency: '0001', account_number: '123-4', bank_holder: 'Botezini', pix_key: 'cnpj' };

test('com banco escolhido, o orçamento usa os dados dele — inteiros, sem misturar com os antigos', () => {
    const d = dadosBancariosDoOrcamento({
        ...antigos,
        banco_do_orcamento: { bank_name: 'Sicoob', agency: '3000', account_number: '9-9', titular: 'Sueli', chave_pix: null },
    });
    assert.deepEqual(d, { bank_name: 'Sicoob', agency: '3000', account_number: '9-9', holder: 'Sueli', pix_key: null });
});

test('sem banco escolhido (ou inativado), volta aos dados antigos da empresa', () => {
    assert.deepEqual(dadosBancariosDoOrcamento({ ...antigos, banco_do_orcamento: null }),
        { bank_name: 'Itaú', agency: '0001', account_number: '123-4', holder: 'Botezini', pix_key: 'cnpj' });
    assert.deepEqual(dadosBancariosDoOrcamento({ ...antigos }),
        { bank_name: 'Itaú', agency: '0001', account_number: '123-4', holder: 'Botezini', pix_key: 'cnpj' });
});

test('aliases antigos de agência e conta ainda valem', () => {
    const d = dadosBancariosDoOrcamento({ bank_name: 'Itaú', bank_agency: '0002', bank_account: '55' });
    assert.equal(d.agency, '0002');
    assert.equal(d.account_number, '55');
});

test('a coluna nova só vai ao banco quando ela existe (veio na leitura)', () => {
    assert.deepEqual(colunasOpcionaisDoPerfil({ bank_name: 'X' }), {});
    assert.deepEqual(colunasOpcionaisDoPerfil({ banco_do_orcamento_id: null }), { banco_do_orcamento_id: null });
    assert.deepEqual(colunasOpcionaisDoPerfil({ banco_do_orcamento_id: 'b1' }), { banco_do_orcamento_id: 'b1' });
});
