import Tesseract from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// ── Extração de texto com linhas preservadas ───────────────────

export async function extractText(file, onProgress) {
  const name = file.name?.toLowerCase() || "";
  const isPDF = file.type === "application/pdf" || name.endsWith(".pdf");
  try {
    if (isPDF) return await _fromPDF(file, onProgress);
    return await _fromImage(file, onProgress);
  } catch (err) {
    throw new Error(`Falha ao ler o arquivo: ${err.message}`);
  }
}

async function _fromPDF(file, onProgress) {
  onProgress(5, "Carregando PDF...");
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const n = pdf.numPages;
  let text = "";
  let hasText = false;

  onProgress(10, `PDF com ${n} página${n > 1 ? "s" : ""} detectado...`);

  for (let i = 1; i <= n; i++) {
    onProgress(10 + Math.round((i / n) * 55), `Lendo página ${i} de ${n}...`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items.filter(it => it.str && it.str.trim());
    if (items.length === 0) { text += "\n"; continue; }

    // Agrupa por Y (topo→base) preservando linhas reais
    const lineMap = new Map();
    for (const item of items) {
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push({ x: item.transform[4], str: item.str });
    }

    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    const merged = [];
    for (const y of sortedYs) {
      const prev = merged[merged.length - 1];
      // Aumentado para 8 para ser mais tolerante com alinhamento de colunas
      if (prev && Math.abs(y - prev.y) < 8) {
        prev.items.push(...lineMap.get(y));
      } else {
        merged.push({ y, items: [...lineMap.get(y)] });
      }
    }

    const pageText = merged
      .map(({ items: its }) => {
        its.sort((a, b) => a.x - b.x);
        return its.map(it => it.str).join(" ").trim();
      })
      .filter(l => l.length > 0)
      .join("\n");

    if (pageText.trim().length > 20) hasText = true;
    text += pageText + "\n\n";
  }

  if (!hasText) {
    text = "";
    onProgress(66, "PDF digitalizado — iniciando OCR...");
    for (let i = 1; i <= n; i++) {
      onProgress(66 + Math.round((i / n) * 24), `OCR página ${i} de ${n}...`);
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      const result = await Tesseract.recognize(canvas, ["por", "eng"]);
      text += result.data.text + "\n\n";
    }
  }

  onProgress(92, "Analisando dados financeiros...");
  // Log para debug no console do navegador
  console.log("[WealthTrack] Texto extraído do PDF (primeiros 3000 chars):\n", text.slice(0, 3000));
  return text;
}

async function _fromImage(file, onProgress) {
  onProgress(5, "Iniciando OCR...");
  const result = await Tesseract.recognize(file, ["por", "eng"], {
    logger: m => {
      if (m.status === "recognizing text")
        onProgress(5 + Math.round(m.progress * 85), `OCR: ${Math.round(m.progress * 100)}%`);
    },
  });
  onProgress(92, "Analisando dados financeiros...");
  return result.data.text;
}

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

// ── Normalização de texto (remove acentos para comparar) ───────

function norm(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

// ── Detecção de tipo de documento ──────────────────────────────
// Usa padrões sem acento para ser resistente a PDFs com codificação customizada

function detectDocType(text) {
  const t = norm(text);

  // Fatura / extrato bancário
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

  // Relatório de investimentos — palavras sem acento
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

// ── Classes de investimento — padrões resistentes a encoding ───

// Cada entrada tem: key do sistema, padrões para detectar no texto normalizado
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

// ── Parser de relatório de investimentos ───────────────────────

function parseRelatorio(text) {
  const result = {};
  const nt = norm(text); // texto normalizado (sem acentos)

  // ── KPIs do cabeçalho ──────────────────────────────────────
  // Aceita tanto "PATRIMÔNIO" quanto "PATRIMONIO" quanto "PATRIM NIO" (garbled)
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

  // ── Fallback KPIs — layout XP: cabeçalhos numa linha, valores na linha de baixo ─
  // Ex.: "PATRIMÔNIO TOTAL BRUTO: RENTABILIDADE MÊS: GANHO MÊS: …\nR$ 684.412,90 1,06% R$ 6.238,08 …"
  if (!result._patrimonioTotal) {
    const kpiIdx = nt.search(/PATRIM.{0,6}NIO\s+TOTAL/i);
    if (kpiIdx >= 0) {
      const kpiChunk = nt.slice(kpiIdx, Math.min(nt.length, kpiIdx + 600));
      const rVals = [...kpiChunk.matchAll(/R\$\s*([\d.]+,\d{2})/g)];
      const pVals = [...kpiChunk.matchAll(/([-\d]+,\d{1,2})%(?![,\d])/g)];
      if (rVals[0]) result._patrimonioTotal = parseBRL(rVals[0][1]);
      if (!result._rentMes && pVals[0]) result._rentMes = pVals[0][1].replace(",", ".");
      if (!result._ganhoMes && rVals[1]) result._ganhoMes = parseBRL(rVals[1][1]);
    }
  }

  // ── Extração de classes — processa linha a linha ────────────
  // Pré-processa: une linhas que terminam com " -" ou com taxa "NN,NN% WORD"
  // (nomes longos que quebram no PDF quando excedem a coluna)
  const rawLines = text.split("\n");
  const lines = [];
  let carry = "";
  for (const line of rawLines) {
    const t = line.trim();
    if (!t) {
      if (carry) { lines.push(carry.trim()); carry = ""; }
      continue;
    }
    // Critérios de carry (linha incompleta que continua na próxima):
    //   1. Termina com " -"  (ex: "CDB BANCO SAFRA - MAI/2028 -")
    //   2. Termina com "NN,NN%" ou "NN,NN% PALAVRA" sem R$ (ex: "CDB BANCO - 101,00%")
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

  // SKIP: linhas que claramente são cabeçalhos ou rodapés
  const SKIP_RE = /^(?:POSI.{0,4}O\s+DETALHADA|PRECIFICA|Estrat.{0,3}gia|M.S\s+ATUAL|Refer.{0,4}ncia|ANO\b|24\s*MESES|Relat.{0,4}rio|Data\s+de|Aviso|\*|Gerado|Este\s+material)/i;

  let currentClassKey = null;

  for (const line of lines) {
    const t = line.trim();
    if (!t || SKIP_RE.test(t)) continue;
    const nt_line = norm(t);

    // ── Detectar linha de composição: "ClassName (XX,XX%) R$ VALUE" ─
    // Funciona no texto normalizado (sem acentos).
    // Aceita prefixo "99,98% " que o pdfjs/pdfplumber inclui do gráfico "Total investido"
    const compM = nt_line.match(
      /^(?:\d{1,3}[\d,]*%\s+)?([A-Z][A-Z\s\/\-\.]{2,40}?)\s+\(?(\d[\d,]+)%\)?\s+R\$\s*([\d.]+,\d{2})/
    );
    if (compM) {
      const key = classNameToKey(compM[1]);
      if (key) {
        const val = parseBRL(compM[3]);
        // Acumula: ex. "Fundos Listados" + "Alternativo" ambos mapeiam para fiis
        if (val >= 100) {
          const existing = parseInt(result[key] || "0");
          result[key] = String(existing + val);
        }
        continue;
      }
    }

    // ── Detectar linha de classe na Posição Detalhada: "ClassName R$ VALUE -" ─
    const classHdrM = nt_line.match(
      /^([A-Z][A-Z\s\/\-\.]{2,40}?)\s+R\$\s*([\d.]+,\d{2})\s+-\s/
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

    // ── Detectar ativo individual: "Nome R$ VALUE QTD %ALOC% RENT%" ─
    // QTD é um número (inteiro ou decimal) — diferencia de classe (que tem "-")
    if (!currentClassKey) continue;

    const assetM = t.match(
      /^(.+?)\s+R\$\s*([\d.]+,\d{2})\s+([\d.,]+)\s+([\d,]+)%\s+([-\d,]+)%/
    );
    if (assetM) {
      const nome = assetM[1].trim();
      const valor = parseBRL(assetM[2]);
      const rentMes = assetM[5];

      if (valor <= 0 || nome.length < 2) continue;
      if (/^(?:CAIXA|PROVENTOS|TOTAL)/i.test(nome)) continue;

      const ativosKey = currentClassKey + "Ativos";
      if (!result[ativosKey]) result[ativosKey] = [];

      // Evita duplicatas
      if (!result[ativosKey].find(a => a.nome === nome)) {
        result[ativosKey].push({
          id: Date.now() + "_" + Math.random().toString(36).slice(2, 7),
          nome,
          valor: String(valor),
          rentMes,
          rentAno: "",
          objetivo: "",
          segmento: "",
        });
      }
    }
  }

  // ── Fallback: se ainda não encontrou classes, busca por padrão livre ─
  for (const { key, pats } of CLASS_DEFS) {
    if (result[key]) continue;
    for (const pat of pats) {
      const idx = nt.search(pat);
      if (idx < 0) continue;
      // Busca a primeira ocorrência de "R$ VALUE" nos próximos 400 chars
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

  if (result._rentMes) result.rentabilidade = result._rentMes;

  // ── Movimentações ──────────────────────────────────────────
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

    let resgates = 0;
    const rRe = /(?:TRANSFER.{0,4}NCIA\s+ENVIADA|RESGATE|RETIRADA)[^\n]*R\$\s*([\d.]+,\d{2})/gi;
    let resm;
    while ((resm = rRe.exec(movChunk)) !== null) resgates += parseBRL(resm[1]);
    if (resgates > 0) result._resgates = resgates;
  }

  result._tipo = "relatorio";
  console.log("[WealthTrack] parseRelatorio resultado:", result);
  return result;
}

// ── Mapeamento de categorias de gastos (fatura) ───────────────

const CAT_RULES = [
  { key: "alimentacao", re: /ALIMENTA.{0,4}O|SUPERMERC|PADARIA|RESTAURANTE|LANCHONETE|A.OUGUE|HORTIFRUTI|MERCEARIA/i },
  { key: "carro",       re: /VE.CULOS|COMBUST.VEL|GASOLINA|ETANOL|AUTO\s*PE.A|ESTACION|PED.GIO|OFICINA/i },
  { key: "saude",       re: /SA.DE|FARM.CIA|DROGARIA|HOSPITAL|CL.NICA|LABORAT|.PTICA|HIGIENE|DENTISTA/i },
  { key: "educacao",    re: /EDUCA.{0,4}O|ESCOLA|FACULDADE|UNIVERSIDADE|CURSO\b|IDIOMA|LIVROS|PAPELARIA/i },
  { key: "lazer",       re: /TURISMO|ENTRETENIM|CINEMA|TEATRO|SHOW\b|HOTEL\b|POUSADA|DIVERS.O|LAZER|ESPORTE|AIRBNB/i },
  { key: "assinaturas", re: /STREAMING|ASSINATURA|TELEFONIA|TELECOMUNIC/i },
  { key: "moradia",     re: /CONDOM.NIO|ALUGUEL|SERV.*P.BLICOS|ENERGIA\s+EL.TRICA|SANEAMENTO|.GUA\b|G.S\b|IPTU/i },
  { key: "cartoes",     re: /VEST.{0,4}RIO|CAL.ADOS|MODA\b|ROUPAS|JOALHERIA|ELETR.NICO/i },
  { key: "seguros",     re: /SEGUROS|SEGURADORA/i },
  { key: "outros",      re: /OUTROS|DIVERSOS/i },
];

const MERCHANT_RULES = [
  { key: "alimentacao", re: /ZAFFARI|WALMART|CARREFOUR|ASSAI|ATACAD|EXTRA\b|BIG\b|HORTIFRUTI|SHIBATA/i },
  { key: "alimentacao", re: /MCDONALDS|BURGER|SUBWAY|HABIB|GIRAFFAS|DOMINOS|PIZZA|KFC\b|OUTBACK|MADERO/i },
  { key: "alimentacao", re: /IFOOD|RAPPI|UBER\s*EATS/i },
  { key: "carro",       re: /PETROBRAS|IPIRANGA|SHELL|BP\b|RAIZEN|GRAAL/i },
  { key: "carro",       re: /\bUBER\b|99\s*(?:TAXI|DRIVER|POP)|CABIFY/i },
  { key: "saude",       re: /DROGASIL|DROGA\s*RAIA|NISSEI|ULTRAFARMA|PAGUE\s*MENOS|PANVEL|PACHECO/i },
  { key: "saude",       re: /UNIMED|AMIL|SULAMERICA|HAPVIDA|NOTREDAME|PREVENT\s*SENIOR/i },
  { key: "assinaturas", re: /NETFLIX|SPOTIFY|AMAZON\s*PRIME|DISNEY|GLOBOPLAY|YOUTUBE\s*PREM|DEEZER|MAX\b/i },
  { key: "assinaturas", re: /\bTIM\b|\bCLARO\b|\bVIVO\b|\bOI\b/i },
  { key: "assinaturas", re: /MICROSOFT|ADOBE|DROPBOX|ICLOUD|OFFICE\s*365|GOOGLE\s*ONE/i },
  { key: "lazer",       re: /CINESYSTEM|CINEMARK|UCI\s+CINEMA|KINOPLEX/i },
  { key: "moradia",     re: /SABESP|COPASA|SANEPAR|EMBASA|CASAN/i },
  { key: "moradia",     re: /CEMIG|CPFL|\bENEL\b|\bLIGHT\b|COELBA|ENERGISA/i },
  { key: "moradia",     re: /COMGAS|GAS\s*NATURAL|NATURGY/i },
];

function mapCategory(nearbyText, merchantName) {
  const context = norm(nearbyText || "");
  const merchant = norm(merchantName || "");
  for (const { key, re } of CAT_RULES) {
    if (re.test(context)) return key;
  }
  for (const { key, re } of MERCHANT_RULES) {
    if (re.test(merchant)) return key;
  }
  for (const { key, re } of CAT_RULES) {
    if (re.test(merchant)) return key;
  }
  return "outros";
}

// ── Parser genérico de fatura / extrato ───────────────────────

function parseFatura(text) {
  const lines = text.split("\n");
  const result = {};

  const TRANS_RE = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+([\d.]+,\d{2})(?:\s+CR)?$/;
  const SKIP_RE = /^(?:TOTAL|SUBTOTAL|VENCIMENTO|DATA\b|VALOR\b|SALDO|LIMITE|FATURA\b|PAGAMENTO\b|CAMBIO|IOF|ENCARGOS|JUROS\b|MULTA|TARIFA|ANUIDADE|\*{3}|\-{3}|={3})/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || SKIP_RE.test(line)) continue;

    const m = TRANS_RE.exec(line);
    if (!m) continue;

    const data  = m[1].slice(0, 5);
    const nome  = m[2].trim();
    const valor = parseBRL(m[3]);

    if (valor <= 0 || valor > 20000000) continue;

    let contexto = "";
    for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
      const nl = lines[j].trim();
      if (!nl || TRANS_RE.test(nl)) break;
      contexto += " " + nl;
    }

    const catKey = mapCategory(contexto, nome);

    if (!result[catKey]) result[catKey] = 0;
    result[catKey] += valor;

    const itemsKey = catKey + "_items";
    if (!result[itemsKey]) result[itemsKey] = [];
    result[itemsKey].push({ nome, valor, data });
  }

  const output = {};
  for (const [key, val] of Object.entries(result)) {
    output[key] = key.endsWith("_items") ? val : String(val);
  }
  return output;
}

// ── Parsers genéricos por palavras-chave (fallback) ────────────

const CART_PATTERNS = {
  posFixado: [/CDB\b/i,/LCI\b/i,/LCA\b/i,/LCD\b/i,/LFT\b/i,/TESOURO\s+SELIC/i,/POS.FIXAD/i,/CDI\b/i],
  ipca:      [/IPCA\s*\+/i,/NTN.?B/i,/TESOURO\s+IPCA/i,/INFLACAO|INFLA.{0,3}O\b/i],
  preFixado: [/PRE.FIXAD/i,/TESOURO\s+PREFIXADO/i,/NTN.?F/i,/LTN\b/i],
  acoes:     [/ACOES|A.OES?\b/i,/RENDA\s+VARI.VEL/i,/BOLSA\b/i],
  fiis:      [/FUNDO\s+IMOBILI/i,/FII\b/i,/[A-Z]{4}11\b/i],
  multi:     [/MULTIMERCADO/i,/HEDGE\s*FUND/i],
  prevVGBL:  [/VGBL/i],
  prevPGBL:  [/PGBL/i],
  globalEquities: [/EQUIT(?:IES|Y)\b/i,/BDR\b/i,/ADR\b/i],
  globalTreasury: [/TREASURY/i,/TESOURO\s+AMERICANO/i],
  globalBonds:    [/BONDS?\b/i],
  global:         [/GLOBAL\b/i,/INTERNACIONAL\b/i,/EXTERIOR\b/i,/DOLAR|D.LAR\b/i,/USD\b/i],
};

function _parseCarteiraGenerico(text) {
  const res = {};
  for (const [key, pats] of Object.entries(CART_PATTERNS)) {
    let max = 0;
    for (const pat of pats) {
      const v = largestAmountNear(text, pat);
      if (v > max) max = v;
    }
    if (max > 0) res[key] = String(max);
  }
  return res;
}

const FLUXO_PATTERNS = {
  renda:       [/SALARIO|SAL.RIO/i,/PROL.BORE/i,/HONOR.RIOS/i,/REMUNERA/i,/DIVIDENDOS/i,/RECEITA\b/i],
  moradia:     [/ALUGUEL/i,/CONDOMINIO|CONDOM.NIO/i,/IPTU/i,/.GUA\b/i,/ENERGIA\s+EL.TRICA/i,/INTERNET\b/i],
  alimentacao: [/SUPERMERCADO/i,/ATACAD.O/i,/CARREFOUR/i,/RESTAURANTE/i,/IFOOD/i],
  educacao:    [/ESCOLA\b/i,/FACULDADE/i,/CURSO\b/i,/EDUCACAO|EDUCA.{0,4}O/i],
  lazer:       [/CINEMA/i,/VIAGEM\b/i,/HOTEL\b/i,/ENTRETENIMENTO/i,/NETFLIX/i,/SPOTIFY/i],
  assinaturas: [/ASSINATURA\b/i,/STREAMING\b/i,/MICROSOFT/i,/ICLOUD/i],
  cartoes:     [/FATURA\b/i,/CARTAO.*CREDITO|CART.O.*CR.DITO/i],
  carro:       [/COMBUSTIVEL|COMBUST.VEL/i,/GASOLINA/i,/POSTO\b/i,/IPVA/i,/PEDAGIO|PED.GIO/i],
  saude:       [/PLANO\s+DE\s+SA.DE/i,/FARMACIA|FARM.CIA/i,/HOSPITAL/i,/EXAME\b/i],
  seguros:     [/SEGURO\s+DE\s+VIDA/i,/SEGURADORA/i],
  outros:      [/OUTROS\b/i,/DIVERSOS/i],
};

function _parseFluxoGenerico(text) {
  const res = {};
  for (const [key, pats] of Object.entries(FLUXO_PATTERNS)) {
    let max = 0;
    for (const pat of pats) {
      const v = largestAmountNear(text, pat, 300);
      if (v > max) max = v;
    }
    if (max > 0) res[key] = String(max);
  }
  return res;
}

// ── API pública ────────────────────────────────────────────────

export function parseCarteiraFromText(text) {
  const tipo = detectDocType(text);
  console.log("[WealthTrack] detectDocType:", tipo);
  if (tipo === "relatorio") {
    const res = parseRelatorio(text);
    const classes = Object.keys(res).filter(k => !k.startsWith("_") && k !== "rentabilidade" && !k.endsWith("Ativos"));
    if (classes.length === 0) {
      console.log("[WealthTrack] Sem classes no parseRelatorio, usando genérico");
      return _parseCarteiraGenerico(text);
    }
    return res;
  }
  return _parseCarteiraGenerico(text);
}

export function parseFluxoFromText(text) {
  const tipo = detectDocType(text);
  if (tipo === "fatura") {
    const res = parseFatura(text);
    const cats = Object.keys(res).filter(k => !k.endsWith("_items"));
    if (cats.length === 0) return _parseFluxoGenerico(text);
    return res;
  }
  return _parseFluxoGenerico(text);
}
