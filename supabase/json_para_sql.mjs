// Converte o resultado JSON do EXPORT_completo em um arquivo .sql pronto.
//
// Use isto se você JÁ copiou o resultado como JSON e não quer rodar a consulta
// de novo. Se puder rodar de novo, prefira o EXPORT_completo.sql atualizado —
// ele já devolve o script pronto numa célula só.
//
// COMO USAR
//   1. Salve o JSON copiado do Supabase como `export.json`
//   2. node supabase/json_para_sql.mjs export.json migracao.sql
//   3. Abra migracao.sql, copie tudo, cole no SQL Editor do DESTINO
//
// O script valida: conta os comandos por tabela e avisa se a ordem das chaves
// estrangeiras estiver errada (pedido antes de cliente, por exemplo).

import { readFileSync, writeFileSync } from 'node:fs';

const [, , entrada, saida = 'migracao.sql'] = process.argv;
if (!entrada) {
  console.error('uso: node json_para_sql.mjs <export.json> [saida.sql]');
  process.exit(1);
}

const dados = JSON.parse(readFileSync(entrada, 'utf8'));
if (!Array.isArray(dados)) {
  console.error('Esperava um array JSON. Copie o resultado inteiro do Supabase.');
  process.exit(1);
}

const comandos = dados
  .map(l => (typeof l === 'string' ? l : l.comando))
  .filter(c => typeof c === 'string' && c.trim().startsWith('INSERT'));

if (comandos.length === 0) {
  console.error('Nenhum INSERT encontrado. O JSON veio do EXPORT_completo?');
  process.exit(1);
}

// Contagem por tabela + checagem de ordem
// Ordenação topológica das chaves estrangeiras. cost_centers vem primeiro:
// suppliers.default_cost_center_id aponta para lá.
const ORDEM = ['cost_centers', 'clients', 'suppliers', 'insumos', 'products',
               'product_insumos', 'budgets', 'orders'];
const tabelaDe = c => (c.match(/INSERT INTO public\.(\w+)/) || [])[1] || '?';

const contagem = new Map();
let ultimaPos = -1;
let foraDeOrdem = 0;
for (const c of comandos) {
  const t = tabelaDe(c);
  contagem.set(t, (contagem.get(t) || 0) + 1);
  const pos = ORDEM.indexOf(t);
  if (pos >= 0) {
    if (pos < ultimaPos) foraDeOrdem++;
    ultimaPos = Math.max(ultimaPos, pos);
  }
}

console.log(`comandos encontrados: ${comandos.length}\n`);
for (const t of ORDEM) {
  if (contagem.has(t)) console.log(`  ${t.padEnd(18)} ${String(contagem.get(t)).padStart(4)}`);
}
const outras = [...contagem.keys()].filter(t => !ORDEM.includes(t));
if (outras.length) console.log(`\n  tabelas inesperadas: ${outras.join(', ')}`);

if (foraDeOrdem > 0) {
  console.log(`\n⚠  ${foraDeOrdem} comando(s) fora da ordem das chaves estrangeiras.`);
  console.log('   Reordenando automaticamente antes de gravar.');
  comandos.sort((a, b) => ORDEM.indexOf(tabelaDe(a)) - ORDEM.indexOf(tabelaDe(b)));
} else {
  console.log('\n✓ ordem das chaves estrangeiras está correta');
}

const script = [
  `-- Migração Botezini · convertido de ${entrada}`,
  `-- ${comandos.length} comandos`,
  '',
  'BEGIN;',
  '',
  ...comandos,
  '',
  'COMMIT;',
  '',
].join('\n');

writeFileSync(saida, script, 'utf8');
console.log(`\ngravado: ${saida}  (${(script.length / 1024).toFixed(0)} KB)`);
console.log('Cole o conteúdo no SQL Editor do DESTINO.');
