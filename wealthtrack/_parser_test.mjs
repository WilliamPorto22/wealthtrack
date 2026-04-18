import fs from 'fs';

// ── Helpers monetários ─────────────────────────────────────────
function parseBRL(str) {
  if (!str) return 0;
  const s = String(str).replace(/[R$\s]/g, "");
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s))
    return Math.round(parseFloat(s.replace(/\./g, "").replace(",", ".")) * 100);
  if (/^\d+,\d{2}$/.test(s))
    return Math.round(parseFloat(s.replace(",", ".")) * 100);
  if (/^\d+\.\d{2}$/.test(s))
    return Math.round(parseFloat(s) * 100);
  const n = parseInt(s.replace(/\D/g, ""));
  return n > 0 ? n * 100 : 0;
}

function norm(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

const CLASS_DEFS = [
  { key: "posFixado",  pats: [/POS\s*FIXADO|P.S\s+FIXADO|RENDA\s+FIXA\s+POS/i] },
  { key: "preFixado",  pats: [/PRE\s*FIXADO|PR.\s+FIXADO|RENDA\s+FIXA\s+PRE/i] },
  { key: "ipca",       pats: [/INFLACAO|INFLA.{0,3}O\b|IPCA\s*\+|NTN.?B/i] },
  { key: "acoes",      pats: [/RENDA\s+VARI.VEL(?:\s+BRASIL)?|ACOES\b|A.OES\b/i] },
  { key: "multi",      pats: [/MULTIMERCADO/i] },
  { key: "fiis",       pats: [/FUNDOS?\s+LISTADOS|FUNDO\s+IMOBILI.{0,3}RIO|FII\b|ALTERNATIVO/i] },
  { key: "prevVGBL",   pats: [/VGBL/i] },
  { key: "prevPGBL",   pats: [/PGBL/i] },
  { key: "global",     pats: [/GLOBAL|INTERNACIONAL|EXTERIOR/i] },
];

function classNameToKey(name) {
  const n = norm(name);
  for (const { key, pats } of CLASS_DEFS) {
    for (const pat of pats) if (pat.test(n)) return key;
  }
  return null;
}

function detectDocType(text) {
  const t = norm(text);
  if (
    /PATRIMONIO\s+TOTAL|PATRIM.{0,3}NIO\s+TOTAL/i.test(t) ||
    /EVOLUCAO\s+PATRIMONIAL|EVOLU.{0,3}O\s+PATRIMONIAL/i.test(t) ||
    /POSICAO\s+DETALHADA|POSI.{0,3}O\s+DETALHADA/i.test(t) ||
    /CARTEIRA\s+CONSOLIDADA/i.test(t) ||
    /COMPOSICAO|COMPOSI.{0,3}O/i.test(t) && /RENTABILIDADE/i.test(t) ||
    /POS\s+FIXADO|P.S\s+FIXADO/i.test(t) && /RENTABILIDADE/i.test(t)
  ) return "relatorio";
  return "generico";
}

// Cópia da função parseRelatorio
function parseRelatorio(text) {
  const result = {};
  const nt = norm(text);

  const patrimonioRE = [
    /PATRIM.{0,4}NIO\s+TOTAL\s+BRUTO\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /PATRIM.{0,4}NIO\s+(?:TOTAL|LIQUIDO|BRUTO)\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /SALDO\s+TOTAL\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /VALOR\s+TOTAL\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i,
  ];
  for (const re of patrimonioRE) { const m = nt.match(re); if (m) { result._patrimonioTotal = parseBRL(m[1]); break; } }

  const rentMesRE = [/RENTABILIDADE\s+(?:DO\s+)?M.S\s*:?\s*([-\d,]+)%/i, /RENT\.?\s*M.S\s*:?\s*([-\d,]+)%/i];
  for (const re of rentMesRE) { const m = nt.match(re); if (m) { result._rentMes = m[1].replace(",", "."); break; } }

  const ganhoRE = [/GANHO\s+(?:DO\s+)?M.S\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i, /RESULTADO\s+(?:DO\s+)?M.S\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i];
  for (const re of ganhoRE) { const m = nt.match(re); if (m) { result._ganhoMes = parseBRL(m[1]); break; } }

  const rentAnoRE = [/RENTABILIDADE\s+(?:DO\s+)?ANO\s*:?\s*([-\d,]+)%/i, /RENT\.?\s*ANO\s*:?\s*([-\d,]+)%/i];
  for (const re of rentAnoRE) { const m = nt.match(re); if (m) { result._rentAno = m[1].replace(",", "."); break; } }

  const kpiIdx = nt.search(/PATRIM.{0,6}NIO\s+TOTAL/i);
  if (kpiIdx >= 0) {
    const kpiChunk = nt.slice(kpiIdx, Math.min(nt.length, kpiIdx + 600));
    const rVals = [...kpiChunk.matchAll(/R\$\s*([\d.]+,\d{2})/g)];
    const pVals = [...kpiChunk.matchAll(/([-\d]+,\d{1,2})%(?![,\d])/g)];
    if (!result._patrimonioTotal && rVals[0]) result._patrimonioTotal = parseBRL(rVals[0][1]);
    if (!result._rentMes  && pVals[0]) result._rentMes  = pVals[0][1].replace(",", ".");
    if (!result._rentAno  && pVals[1]) result._rentAno  = pVals[1][1].replace(",", ".");
    if (!result._ganhoMes && rVals[1]) result._ganhoMes = parseBRL(rVals[1][1]);
  }

  const rawLines = text.split("\n");
  const lines = [];
  let carry = "";
  for (const line of rawLines) {
    const t = line.trim();
    if (!t) { if (carry) { lines.push(carry.trim()); carry = ""; } continue; }
    const isCarry = !/ R\$/.test(t) && t.length > 8 && (/\s-$/.test(t) || /\d[\d,]+%(?:\s+[A-Z]+)?$/.test(t));
    if (isCarry) { carry += t + " "; } else { lines.push((carry + t).trim()); carry = ""; }
  }
  if (carry) lines.push(carry.trim());

  const SKIP_RE = /^(?:POSI.{0,4}O\s+DETALHADA|PRECIFICA|Estrat.{0,3}gia|M.S\s+ATUAL|Refer.{0,4}ncia|ANO\b|24\s*MESES|Relat.{0,4}rio|Data\s+de|Aviso|\*|Gerado|Este\s+material)/i;

  let currentClassKey = null;

  for (const line of lines) {
    const t = line.trim();
    if (!t || SKIP_RE.test(t)) continue;
    const nt_line = norm(t);

    const compM = nt_line.match(/^(?:\d{1,3}[\d,]*%\s+)?([A-Z][A-Z\s\/\-\.]{2,40}?)\s+\(?(\d[\d,]+)%\)?\s+R\$\s*([\d.]+,\d{2})/);
    if (compM) {
      const key = classNameToKey(compM[1]);
      if (key) {
        const val = parseBRL(compM[3]);
        if (val >= 100) { const existing = parseInt(result[key] || "0"); result[key] = String(existing + val); }
        continue;
      }
    }

    const classHdrM = nt_line.match(/^([A-Z][A-Z\s\/\-\.]{2,40}?)\s+R\$\s*([\d.]+,\d{2})\s+[-–]/);
    if (classHdrM) {
      const key = classNameToKey(classHdrM[1]);
      if (key) {
        currentClassKey = key;
        const val = parseBRL(classHdrM[2]);
        if (val >= 100 && !result[key]) result[key] = String(val);
        continue;
      }
    }

    if (!compM && !classHdrM && !/ R\$/.test(t) && t.length < 60) {
      const standaloneKey = classNameToKey(nt_line);
      if (standaloneKey) { currentClassKey = standaloneKey; continue; }
    }

    if (!currentClassKey) continue;

    const assetM = t.match(/^(.+?)\s+R\$\s*([\d.]+,\d{2})(?:\s+([\d.,]+)(?!\s*%))?\s+([\d,]+)%\s+([-\d,]+)%(?:\s+([-\d,]+)%(?:\s+([-\d,]+)%)?)?/);
    const assetFallbackM = !assetM && (() => {
      const m = t.match(/^(.+?)\s+R\$\s*([\d.]+,\d{2})(?:\s+[\d.,]+)?\s*$/);
      if (!m) return null;
      if (classNameToKey(norm(m[1]))) return null;
      return m;
    })();

    const matchToUse = assetM || assetFallbackM;
    if (matchToUse) {
      const nomeRaw = matchToUse[1].trim();
      const valor = parseBRL(matchToUse[2]);
      const rentMes = assetM ? (assetM[5] || "") : "";
      const rentAno = assetM && assetM[7] ? assetM[7].replace(",", ".") : "";

      if (valor <= 0 || nomeRaw.length < 2) continue;
      if (/^(?:CAIXA|PROVENTOS|TOTAL)/i.test(nomeRaw)) continue;

      const vencM = nomeRaw.match(/\b([A-Z]{3}\/\d{2,4})\b/i);
      const vencimento = vencM ? vencM[1].toUpperCase() : "";

      const nome = nomeRaw
        .replace(/^(?:IPC[-\s]*A|IPCA)\s*\+\s*[\d,]+%\s+/i, "")
        .replace(/\s*[-–]\s*(?:(?:IPC[-\s]*A|IPCA)\s*\+\s*)?[\d,]+%[\w\s%+\-]*$/i, "")
        .replace(/\s*[-–]\s*$/, "")
        .trim();

      const isIpca = /(?:IPC[-\s]*A|IPCA)\s*\+/i.test(nomeRaw);
      const effectiveKey = isIpca ? "ipca" : currentClassKey;

      const ativosKey = effectiveKey + "Ativos";
      if (!result[ativosKey]) result[ativosKey] = [];

      if (!result[ativosKey].find(a => a.nome === nome)) {
        result[ativosKey].push({
          id: Date.now() + "_" + Math.random().toString(36).slice(2, 7),
          nome, valor: String(valor), rentMes, rentAno, vencimento, objetivo: "", segmento: "",
        });
      }
    }
  }

  if (result._rentAno) result.rentabilidade = result._rentAno;
  else if (result._rentMes) result.rentabilidade = result._rentMes;

  const movIdx = nt.search(/MOVIMENTA.{0,4}ES|OPERA.{0,4}ES\s+(?:DA|DO)/i);
  if (movIdx >= 0) {
    const movChunk = nt.slice(movIdx, Math.min(nt.length, movIdx + 8000));
    let rendimentos = 0;
    const rendRe = /(?:RENDIMENTO|DIVIDENDO|JCP|JSCP|JUROS|AMORTIZA.{0,4}O|INTEGRALIZA.{0,4}O\s+DE\s+COTAS)[^\n]*R\$\s*([\d.]+,\d{2})/gi;
    let rm;
    while ((rm = rendRe.exec(movChunk)) !== null) rendimentos += parseBRL(rm[1]);
    if (rendimentos > 0) result._rendimentosPassivos = rendimentos;

    let aportes = 0;
    const aRe = /(?:TRANSFER.{0,4}NCIA\s+RECEBIDA|TED.*APLICA|APORTE|APLICA.{0,4}O)[^\n]*R\$\s*([\d.]+,\d{2})/gi;
    let am;
    while ((am = aRe.exec(movChunk)) !== null) aportes += parseBRL(am[1]);
    if (aportes > 0) result._aportes = aportes;
  }

  result._tipo = "relatorio";
  return result;
}

function parseCarteiraFromText(text) {
  const tipo = detectDocType(text);
  if (tipo === "relatorio") return parseRelatorio(text);
  return {};
}

// ── EXECUTA TESTE ──────────────────────────────────────────────
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
    console.log(`    - ${a.nome.substring(0,55).padEnd(55)}  R$ ${String(val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })).padStart(12)}  venc:${(a.vencimento || '-').padEnd(9)} rMes:${(a.rentMes || '-').padEnd(6)}% rAno:${(a.rentAno || '-')}%`);
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

console.log('\n========== COMPARATIVO COM ESPERADO ==========');
const classesEsperadas = {
  posFixado: { esp: 119466.88, ativos: ['AZQI11', 'CDB WILL', 'LCA RABOBANK', 'Trend Investback'] },
  ipca: { esp: 84325.69, ativos: ['CDB BANCO C6', 'CDB FIBRA', 'XP Brasil Soberano'] },
  preFixado: { esp: 231284.93, ativos: ['CDB PICPAY', 'CDB WILL MAR/2027', 'LFTB11', 'TG Renda', 'XP SierraCol'] },
  acoes: { esp: 304545.89, ativos: ['AURA33','BBDC4','BRAP4','CMIG4','CURY3','CXSE3','CYRE3','DIRR3','GOAU4','ITSA4','ITUB4','JBSS32','PETR4','POMO4','VALE3'] },
  fiis: { esp: 32319.75, ativos: ['XP Logístico'] },
};

for (const [k, { esp, ativos }] of Object.entries(classesEsperadas)) {
  const got = (parseInt(classFields[k] || '0') / 100) || 0;
  const gotAtivos = (ativosFields[k + 'Ativos'] || []).length;
  const tolerancia = Math.abs(got - esp) < 1;
  console.log(`  ${tolerancia && gotAtivos === ativos.length ? '✓' : '✗'} ${k.padEnd(12)}: R$ ${got.toFixed(2).padStart(12)} (esperado R$ ${esp.toFixed(2)}) — ${gotAtivos} ativos (esperado ${ativos.length})`);
}
