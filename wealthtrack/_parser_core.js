// Extraído de src/utils/documentParser.js para teste em Node standalone (sem pdfjs/tesseract)

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

function largestAmountNear(text, pattern, window = 600) {
  let max = 0;
  const regex = new RegExp(pattern.source, "gi");
  let m;
  while ((m = regex.exec(text)) !== null) {
    const chunk = text.slice(m.index, Math.min(text.length, m.index + window));
    const vals = [...chunk.matchAll(/R?\$?\s?([\d]{1,3}(?:\.[\d]{3})*(?:,[\d]{2})?)/g)];
    for (const v of vals) {
      const c = parseBRL(v[0]);
      if (c > max) max = c;
    }
    if (regex.lastIndex === m.index) regex.lastIndex++;
  }
  return max;
}

function norm(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function detectDocType(text) {
  const t = norm(text);
  if (
    /FATURA.*CARTAO|CARTAO.*FATURA/i.test(t) ||
    /LANCAMENTOS.*COMPRAS|COMPRAS.*LANCAMENTOS/i.test(t) ||
    /ENCARGOS\s+POR\s+ATRASO|JUROS\s+ROTATIVOS/i.test(t) ||
    /PAGAMENTO\s+(?:MINIMO|TOTAL)\s+DA\s+FATURA/i.test(t) ||
    /FATURA\s+DO\s+MES/i.test(t)
  ) {
    if (/\d{2}\/\d{2}\s+.+\s+[\d.]+,\d{2}/.test(text)) return "fatura";
  }
  if ((text.match(/^\d{2}\/\d{2}\s+.+\s+[\d.]+,\d{2}/gm) || []).length >= 3) return "fatura";
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
    for (const pat of pats) {
      if (pat.test(n)) return key;
    }
  }
  return null;
}

function parseRelatorio(text) {
  text = text
    .replace(/([A-Za-zÀ-ÿ])\s(fi|fl|ffi|ffl|ff)\s([a-záéíóúãâêôç])/g, "$1$2$3")
    .replace(/\b(fi|fl|ffi|ffl|ff)\s([a-záéíóúãâêôç])/g, "$1$2");
  const result = {};
  const nt = norm(text);

  const patrimonioRE = [
    /PATRIM.{0,4}NIO\s+TOTAL\s+BRUTO\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /PATRIM.{0,4}NIO\s+(?:TOTAL|LIQUIDO|BRUTO)\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /SALDO\s+TOTAL\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /VALOR\s+TOTAL\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i,
  ];
  for (const re of patrimonioRE) {
    const m = nt.match(re);
    if (m) { result._patrimonioTotal = parseBRL(m[1]); break; }
  }

  const rentMesRE = [
    /RENTABILIDADE\s+(?:DO\s+)?M.S\s*:?\s*([-\d,]+)%/i,
    /RENT\.?\s*M.S\s*:?\s*([-\d,]+)%/i,
  ];
  for (const re of rentMesRE) {
    const m = nt.match(re);
    if (m) { result._rentMes = m[1].replace(",", "."); break; }
  }

  const ganhoRE = [
    /GANHO\s+(?:DO\s+)?M.S\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /RESULTADO\s+(?:DO\s+)?M.S\s*:?\s*R?\$?\s*([\d.]+,\d{2})/i,
  ];
  for (const re of ganhoRE) {
    const m = nt.match(re);
    if (m) { result._ganhoMes = parseBRL(m[1]); break; }
  }

  const rentAnoRE = [
    /RENTABILIDADE\s+(?:DO\s+)?ANO\s*:?\s*([-\d,]+)%/i,
    /RENT\.?\s*ANO\s*:?\s*([-\d,]+)%/i,
    /\bANO\s+R\$\s*[\d.]+,\d{2}\s+([-\d,]+)%/i,
    /PORTF.LIO\s+[-\d,]+%\s+([-\d,]+)%\s+[-\d,]+%\s+[-\d,]+%/i,
    /\(\s*NO\s+ANO[:\s]+([-\d,]+)%\s*\)/i,
  ];
  for (const re of rentAnoRE) {
    const m = nt.match(re);
    if (m) { result._rentAno = m[1].replace(",", "."); break; }
  }

  const kpiIdx = nt.search(/PATRIM.{0,6}NIO\s+TOTAL/i);
  if (kpiIdx >= 0) {
    const kpiChunk = nt.slice(kpiIdx, Math.min(nt.length, kpiIdx + 600));
    const rVals = [...kpiChunk.matchAll(/R\$\s*([\d.]+,\d{2})/g)];
    const pVals = [...kpiChunk.matchAll(/([-\d]+,\d{1,2})%(?![,\d])/g)];
    const kpiIs24M = /24\s*M|.LTIMOS\s*24/i.test(kpiChunk);
    if (!result._patrimonioTotal && rVals[0]) result._patrimonioTotal = parseBRL(rVals[0][1]);
    if (!result._rentMes  && pVals[0]) result._rentMes  = pVals[0][1].replace(",", ".");
    if (!result._rentAno  && pVals[1] && !kpiIs24M) result._rentAno  = pVals[1][1].replace(",", ".");
    if (!result._ganhoMes && rVals[1]) result._ganhoMes = parseBRL(rVals[1][1]);
  }

  const rawLines = text.split("\n");
  const lines = [];
  let carry = "";
  for (const line of rawLines) {
    const t = line.trim();
    if (!t) {
      if (carry) { lines.push(carry.trim()); carry = ""; }
      continue;
    }
    const isCarry =
      !/ R\$/.test(t) &&
      t.length > 8 &&
      (/\s-$/.test(t) || /\d[\d,]+%(?:\s+[A-Z]+)?$/.test(t));
    if (isCarry) {
      carry += t + " ";
    } else {
      lines.push((carry + t).trim());
      carry = "";
    }
  }
  if (carry) lines.push(carry.trim());

  const SKIP_RE = /^(?:POSI.{0,4}O\s+DETALHADA|PRECIFICA|Estrat.{0,3}gia|M.S\s+ATUAL|Refer.{0,4}ncia|ANO\b|24\s*MESES|Relat.{0,4}rio|Data\s+de|Aviso|\*|Gerado|Este\s+material)/i;
  const JUNK_RE = /^(?:[a-z]{3}\.?\/\d{2}\s+R\$|\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}|Portf.lio\s+[-\d,]+%|\d{4}\s+%CDI|CDI\s+[-\d,]+%|Ibovespa\s+[-\d,]+%|IPCA\s+[-\d,]+%|D.lar\s+[-\d,]+%|Benchmarks\b)/i;

  let currentClassKey = null;

  for (const line of lines) {
    const t = line.trim();
    if (!t || SKIP_RE.test(t) || JUNK_RE.test(t)) continue;
    const nt_line = norm(t);

    const compM = nt_line.match(
      /^(?:\d{1,3}[\d,]*%\s+)?([A-Z][A-Z\s\/\-\.]{2,40}?)\s+\(?(\d[\d,]+)%\)?\s+R\$\s*([\d.]+,\d{2})/
    );
    if (compM) {
      const key = classNameToKey(compM[1]);
      if (key) {
        const val = parseBRL(compM[3]);
        if (val >= 100) {
          const existing = parseInt(result[key] || "0");
          result[key] = String(existing + val);
        }
        continue;
      }
    }

    const classHdrM = nt_line.match(
      /^([A-Z][A-Z\s\/\-\.]{2,40}?)\s+R\$\s*([\d.]+,\d{2})\s+[-–]/
    );
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
      if (standaloneKey) {
        currentClassKey = standaloneKey;
        continue;
      }
    }

    if (!currentClassKey) continue;

    const assetM = t.match(
      /^(.+?)\s+R\$\s*([\d.]+,\d{2})(?:\s+([\d.,]+)(?!\s*%))?\s+([\d,]+)%\s+([-\d,]+)%(?:\s+([-\d,]+)%(?:\s+([-\d,]+)%)?)?/
    );

    const assetFallbackM = !assetM && (() => {
      const m = t.match(/^(.+?)\s+R\$\s*([\d.]+,\d{2})(?:\s+[\d.,]+)?\s*$/);
      if (!m) return null;
      if (classNameToKey(norm(m[1]))) return null;
      return m;
    })();

    const matchToUse = assetM || assetFallbackM;
    if (matchToUse) {
      const nomeRaw = matchToUse[1].trim();
      const valor   = parseBRL(matchToUse[2]);
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
          nome,
          valor: String(valor),
          rentMes,
          rentAno,
          vencimento,
          objetivo: "",
          segmento: "",
        });
      }
    }
  }

  for (const { key, pats } of CLASS_DEFS) {
    if (result[key]) continue;
    for (const pat of pats) {
      const idx = nt.search(pat);
      if (idx < 0) continue;
      const chunk = nt.slice(idx, Math.min(nt.length, idx + 400));
      const valM = chunk.match(/R\$\s*([\d.]+,\d{2})/);
      if (valM) {
        const val = parseBRL(valM[1]);
        if (val >= 10000 && val <= 10_000_000_000) {
          result[key] = String(val);
          break;
        }
      }
    }
  }

  if (result._rentAno) result.rentabilidade = result._rentAno;
  else if (result._rentMes) result.rentabilidade = result._rentMes;

  result._tipo = "relatorio";
  return result;
}

function parseCarteiraFromText(text) {
  const tipo = detectDocType(text);
  if (tipo === "relatorio") {
    const res = parseRelatorio(text);
    return res;
  }
  return {};
}

export { parseCarteiraFromText, parseRelatorio, detectDocType, classNameToKey, norm };
