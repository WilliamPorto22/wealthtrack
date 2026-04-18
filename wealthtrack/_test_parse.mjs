// Teste isolado do parser (sem pdfjs/tesseract imports)
import fs from 'fs';

// Reimplementa as funções locais pra rodar no Node sem o lib
const coreSrc = fs.readFileSync('./_parser_core.js', 'utf-8');
// Torna todas as funções disponíveis no escopo global
const modSrc = coreSrc
  .replace(/\bexport\s+(?:async\s+)?function/g, 'function')
  .replace(/\bexport\s+/g, '');
// Envolve e avalia
const fn = new Function(modSrc + `
  return { parseCarteiraFromText, parseRelatorio: typeof parseRelatorio === 'function' ? parseRelatorio : null, detectDocType };
`);
const { parseCarteiraFromText } = fn();

const text = fs.readFileSync('_xp_dump.txt', 'utf-8');
const dados = parseCarteiraFromText(text);

const meta = Object.fromEntries(Object.entries(dados).filter(([k]) => k.startsWith('_')));
const classFields = Object.fromEntries(Object.entries(dados).filter(([k]) => !k.startsWith('_') && !k.endsWith('Ativos') && k !== 'rentabilidade'));
const ativosFields = Object.fromEntries(Object.entries(dados).filter(([k]) => k.endsWith('Ativos')));

console.log('\n========== META EXTRAÍDO ==========');
for (const [k, v] of Object.entries(meta)) console.log(`  ${k}: ${v}`);
console.log(`  rentabilidade: ${dados.rentabilidade || '-'}`);

console.log('\n========== TOTAIS DE CLASSE ==========');
for (const [k, v] of Object.entries(classFields)) {
  const val = parseInt(v) / 100;
  console.log(`  ${k.padEnd(20)} R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
}

console.log('\n========== ATIVOS POR CLASSE ==========');
for (const [k, lst] of Object.entries(ativosFields)) {
  console.log(`\n  ${k} (${lst.length} ativo${lst.length > 1 ? 's' : ''}):`);
  for (const a of lst) {
    const val = parseInt(a.valor) / 100;
    console.log(`    - ${a.nome}`);
    console.log(`      R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padEnd(15)} venc:${a.vencimento || '-'}  rentMes:${a.rentMes || '-'}%  rentAno:${a.rentAno || '-'}%`);
  }
}

console.log('\n========== VALIDAÇÃO vs PDF REAL ==========');
const esperados = {
  patrimonio: 794088.62,
  rentMes: '1.92',
  rentAno: '14.92',
  ganhoMes: 14930.03,
};
const extMap = {
  patrimonio: (meta._patrimonioTotal || 0) / 100,
  rentMes: meta._rentMes,
  rentAno: meta._rentAno,
  ganhoMes: (meta._ganhoMes || 0) / 100,
};
for (const [k, esp] of Object.entries(esperados)) {
  const ext = extMap[k];
  const ok = String(ext) === String(esp);
  console.log(`  ${ok ? '✓' : '✗'} ${k}: esperado=${esp}  extraído=${ext}`);
}

console.log('\n========== CLASSES DO PDF (esperado) ==========');
console.log('  Pós Fixado:         R$ 119.466,88 (15,05%)');
console.log('  Inflação:           R$  84.325,69 (10,62%)');
console.log('  Pré Fixado:         R$ 231.284,93 (29,14%)');
console.log('  Renda Var. Brasil:  R$ 304.545,89 (38,37%)');
console.log('  Alternativo:        R$  32.319,75 (4,07%)');
console.log('  Caixa:              R$  20.175,38 (2,54%) — ignorado');
console.log('  Proventos:          R$   1.586,60 (0,20%) — ignorado');
console.log('  TOTAL investido:                           R$ 773.942,09 ≈ R$ 794.088,62 - caixa/proventos');
