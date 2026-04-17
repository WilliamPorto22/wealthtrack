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

    // Agrupa por Y (topo→base) para reconstruir linhas reais
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
      if (prev && Math.abs(y - prev.y) < 4) {
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

// ── Detecção de tipo de documento ──────────────────────────────
// Genérica — funciona para qualquer banco/corretora

function detectDocType(text) {
  // Indicadores de extrato / fatura de cartão ou conta corrente
  const FATURA_RE = [
    /FATURA.*CART[AÃ]O|CART[AÃ]O.*FATURA/i,
    /LANÇAMENTOS.*COMPRAS|COMPRAS.*LANÇAMENTOS/i,
    /ENCARGOS\s+POR\s+ATRASO|JUROS\s+ROTATIVOS/i,
    /PAGAMENTO\s+(?:M[IÍ]NIMO|TOTAL)\s+DA\s+FATURA/i,
    /FATURA\s+DO\s+M[EÊ]S|FATURA\s+(?:ATUAL|ANTERIOR)/i,
    /EXTRATO\s+(?:DA\s+CONTA|BANC[AÁ]RIO)|CONTA\s+CORRENTE/i,
    /D[EÉ]BITO\s+EM\s+CONTA|CR[EÉ]DITO\s+EM\s+CONTA/i,
  ];
  for (const re of FATURA_RE) {
    if (re.test(text) && /\d{2}\/\d{2}[\s\/\d]*\s+.+\s+[\d.]+,\d{2}/m.test(text)) return "fatura";
  }
  // Se há muitas linhas com padrão transação (DD/MM NOME VALOR) → fatura
  const txLines = (text.match(/^\d{2}\/\d{2}\s+.+\s+[\d.]+,\d{2}(?:\s+CR)?$/gm) || []).length;
  if (txLines >= 3) return "fatura";

  // Indicadores de relatório de investimentos / posição de carteira
  const RELATORIO_RE = [
    /PATRIMÔNIO\s+(?:TOTAL|L[IÍ]QUIDO|BRUTO)|SALDO\s+TOTAL/i,
    /POSIÇÃO\s+(?:DETALHADA|CONSOLIDADA|FINANCEIRA)/i,
    /CARTEIRA\s+(?:CONSOLIDADA|DE\s+INVESTIMENTOS)/i,
    /RENTABILIDADE.*(?:M[EÊ]S|ANO)|RETORNO.*(?:M[EÊ]S|ANO)/i,
    /ALOCA[ÇC][AÃ]O.*CARTEIRA|DISTRIBUI[ÇC][AÃ]O.*ATIVOS/i,
    /(?:P[OÓ]S\s*FIXADO|PR[EÉ]\s*FIXADO|INFLA[ÇC][AÃ]O|MULTIMERCADO)\s+[\d,]+%/i,
  ];
  for (const re of RELATORIO_RE) {
    if (re.test(text)) return "relatorio";
  }

  return "generico";
}

// ── Mapeamento de categorias de gastos ────────────────────────
// Funciona para qualquer banco: classifica pelo nome do estabelecimento
// e por rótulos de categoria que alguns bancos incluem perto das transações

const CAT_RULES = [
  {
    key: "alimentacao",
    re: /ALIMENTA[ÇC][AÃ]O|SUPERMERC|SUPERMERCADO|PADARIA|RESTAURANTE|LANCHONETE|A[CÇ]OUGUE|HORTIFRUTI|MERCEARIA|PEIXARIA|QUITANDA|IFOOD|RAPPI|UBER\s*EATS|DELIVERY|CONVENI[EÊ]NCIA/i,
  },
  {
    key: "carro",
    re: /VE[IÍ]CULOS|COMBUST[IÍ]VEL|GASOLINA|ETANOL|ALCOOL\s+AUTOM|AUTO\s*PE[ÇC]|ESTACION|PED[AÁ]GIO|OFICINA|LUBRIFIC|AUTOPISTA|AUTOVIAÇÃO|SERV.*AUTO/i,
  },
  {
    key: "saude",
    re: /SA[ÚU]DE|FARM[AÁ]CIA|DROGARIA|HOSPITAL|CL[IÍ]NICA|LABORAT[OÓ]RIO|[OÓ]PTICA|HIGIENE|BELEZA|SERV.*SA[ÚU]DE|PLANO\s+SA[ÚU]DE|CONV[EÊ]NIO\s+M[EÉ]D|DENTISTA/i,
  },
  {
    key: "educacao",
    re: /EDUCA[ÇC][AÃ]O|ESCOLA|FACULDADE|UNIVERSIDADE|CURSO\b|IDIOMA|LIVROS|PAPELARIA|MATERIAL\s+ESCOLAR|COLEGIO|ENSINO/i,
  },
  {
    key: "lazer",
    re: /TURISMO|ENTRETENIM|CINEMA|TEATRO|SHOW\b|HOTEL\b|POUSADA|DIVERS[AÃ]O|DIVERS[OÕ]ES|LAZER|ESPORTE|RECREA[ÇC]|EVENTOS|HOSPEDAGEM|RESORT|AIRBNB/i,
  },
  {
    key: "assinaturas",
    re: /STREAMING|ASSINATURA|TELEFONIA|TELECOMUNIC|PLANO\s+(?:M[OÓ]VEL|CELULAR)|MENSALIDADE\s+APP/i,
  },
  {
    key: "moradia",
    re: /CONDOM[IÍ]NIO|ALUGUEL|SERV.*P[UÚ]BLICOS|CONCESSION|ENERGIA\s+EL[EÉ]TRICA|SANEAMENTO|[AÁ]GUA\b|G[AÁ]S\b|IPTU/i,
  },
  {
    key: "cartoes",
    re: /VEST[UÚ][AÁ]RIO|CAL[ÇC]ADOS|MODA\b|ROUPAS|ACESS[OÓ]RIOS|JOALHERIA|ELETR[OÔ]NICO|INFORM[AÁ]TICA|LOJAS\s+/i,
  },
  {
    key: "seguros",
    re: /SEGUROS|SEGURADORA|PR[EÊ]MIO\s+SEGURO|SEGURO\s+(?:VIDA|AUTO|RESID)/i,
  },
  {
    key: "outros",
    re: /OUTROS|DIVERSOS|SERV.*DIVERS|UTILIT[AÁ]RIOS|MISCEL[AÂ]NEA/i,
  },
];

// Merchants conhecidos (cobertura mais ampla que qualquer lista de banco)
const MERCHANT_RULES = [
  // Alimentação
  { re: /ZAFFARI|WALMART|CARREFOUR|ASSAI|ATACAD|EXTRA\b|BIG\b|MERCADONA|HORTIFRUTI|PÃO\s+DE\s+AÇÚCAR|TENDA|SHIBATA|MUNDO\s+VERDE|NATURAL|FORMULA/i, key: "alimentacao" },
  { re: /MCDONALDS|BURGER\s*KING|SUBWAY|HABIB|GIRAFFAS|BOB.?S|DOMINOS|PIZZA|BOBS\b|KFC\b|POPEYES|OUTBACK|MADERO/i, key: "alimentacao" },
  { re: /IFOOD|RAPPI|UBER\s*EATS|JAMES\s*DELIVERY/i, key: "alimentacao" },
  // Carro / Transporte
  { re: /PETROBRAS|IPIRANGA|SHELL|BP\b|RAIZEN|GRAAL|DISTRIBUIDORA\s+COMB/i, key: "carro" },
  { re: /\bUBER\b|99\s*(?:T[AÁ]XI|DRIVER|POP)|CABIFY|INDRIVER/i, key: "carro" },
  { re: /ESTAPAR|PARK\b|ROTATÓRIO|MULTIPARK/i, key: "carro" },
  // Saúde
  { re: /DROGASIL|DROGA\s*RAIA|NISSEI|ULTRAFARMA|PAGUE\s*MENOS|PANVEL|PACHECO|FARMÁCIA\s+SÃO|EXTRAFARMA/i, key: "saude" },
  { re: /UNIMED|AMIL|SULAMERICA|HAPVIDA|NOTREDAME|PREVENT\s*SENIOR/i, key: "saude" },
  // Assinaturas
  { re: /NETFLIX|SPOTIFY|AMAZON\s*PRIME|DISNEY|GLOBOPLAY|YOUTUBE\s*PREM|APPLE\s*COM|DEEZER|PARAMOUNT|MAX\b|HULU/i, key: "assinaturas" },
  { re: /TIM\b|CLARO\b|VIVO\b|OI\b|ALGAR\b|NEXTEL/i, key: "assinaturas" },
  { re: /MICROSOFT|ADOBE|DROPBOX|ICLOUD|OFFICE\s*365|GOOGLE\s*ONE/i, key: "assinaturas" },
  // Lazer
  { re: /CINESYSTEM|CINEMARK|UCI\s+CINEMA|KINOPLEX|CINEPOLIS/i, key: "lazer" },
  { re: /STEAM\b|PLAYSTATION|XBOX\b|NINTENDO/i, key: "lazer" },
  // Moradia
  { re: /SABESP|COPASA|SANEPAR|EMBASA|COSANPA|CASAN/i, key: "moradia" },
  { re: /CEMIG|CPFL|ENEL\b|LIGHT\b|COELBA|CELPE|ENERGISA|ELETROPAULO/i, key: "moradia" },
  { re: /COMGAS|GAS\s*NATURAL|NATURGY/i, key: "moradia" },
];

function mapCategory(nearbyText, merchantName) {
  // 1. Tenta pelo texto próximo (rótulo de categoria que o banco pode incluir)
  for (const { key, re } of CAT_RULES) {
    if (re.test(nearbyText || "")) return key;
  }
  // 2. Tenta por merchant específico
  for (const { key, re } of MERCHANT_RULES) {
    if (re.test(merchantName || "")) return key;
  }
  // 3. Tenta pelas regras gerais no nome do merchant
  for (const { key, re } of CAT_RULES) {
    if (re.test(merchantName || "")) return key;
  }
  return "outros";
}

// ── Parser genérico de extrato / fatura ───────────────────────
// Funciona para qualquer banco: detecta padrão DD/MM ESTABELECIMENTO VALOR

function parseFatura(text) {
  const lines = text.split("\n");
  const result = {};

  // Padrão universal: DD/MM ou DD/MM/AAAA + nome + valor BRL (com ou sem "CR")
  const TRANS_RE = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)\s+(.+?)\s+([\d.]+,\d{2})(?:\s+CR)?$/;

  // Linhas a ignorar (totais, cabeçalhos, rodapés)
  const SKIP_RE = /^(?:TOTAL|SUBTOTAL|VENCIMENTO|DATA\b|VALOR\b|SALDO|LIMITE|FATURA\b|PAGAMENTO\b|CÂMBIO|IOF|ENCARGOS|JUROS\b|MULTA|TARIFA|ANUIDADE|\*{3}|\-{3}|={3})/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || SKIP_RE.test(line)) continue;

    const m = TRANS_RE.exec(line);
    if (!m) continue;

    const data  = m[1].slice(0, 5); // DD/MM
    const nome  = m[2].trim();
    const valor = parseBRL(m[3]);

    // Filtra valores absurdos (acima de R$200k por transação)
    if (valor <= 0 || valor > 20000000) continue;

    // Coleta até 2 linhas seguintes como contexto para detectar categoria
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

// ── Parser genérico de relatório de investimentos ──────────────
// Funciona para qualquer corretora/banco: detecta classes e totais

function parseRelatorio(text) {
  const result = {};

  // ── Total do patrimônio ─────────────────────────────────────
  // Busca padrões comuns a qualquer relatório
  const PATRIMONIO_RE = [
    /PATRIMÔNIO\s+(?:TOTAL|L[IÍ]QUIDO|BRUTO)[\s:]*R?\$?\s*([\d.]+,\d{2})/i,
    /SALDO\s+TOTAL[\s:]*R?\$?\s*([\d.]+,\d{2})/i,
    /TOTAL\s+DA\s+CARTEIRA[\s:]*R?\$?\s*([\d.]+,\d{2})/i,
    /VALOR\s+TOTAL[\s:]*R?\$?\s*([\d.]+,\d{2})/i,
  ];
  for (const re of PATRIMONIO_RE) {
    const m = text.match(re);
    if (m) { result._patrimonioTotal = parseBRL(m[1]); break; }
  }

  // ── Rentabilidade do mês ────────────────────────────────────
  const RENT_RE = [
    /RENTABILIDADE\s+(?:DO\s+)?M[EÊ]S[\s:]*([-\d,]+)%/i,
    /RETORNO\s+(?:DO\s+)?M[EÊ]S[\s:]*([-\d,]+)%/i,
    /RENT\.?\s*M[EÊ]S[\s:]*([-\d,]+)%/i,
    /RENDIMENTO\s+(?:DO\s+)?M[EÊ]S[\s:]*([-\d,]+)%/i,
  ];
  for (const re of RENT_RE) {
    const m = text.match(re);
    if (m) { result._rentMes = m[1].replace(",", "."); break; }
  }

  // ── Ganho do mês ───────────────────────────────────────────
  const GANHO_RE = [
    /GANHO\s+(?:DO\s+)?M[EÊ]S[\s:]*R?\$?\s*([\d.]+,\d{2})/i,
    /RESULTADO\s+(?:DO\s+)?M[EÊ]S[\s:]*R?\$?\s*([\d.]+,\d{2})/i,
    /RENDIMENTO\s+(?:DO\s+)?M[EÊ]S[\s:]*R?\$?\s*([\d.]+,\d{2})/i,
  ];
  for (const re of GANHO_RE) {
    const m = text.match(re);
    if (m) { result._ganhoMes = parseBRL(m[1]); break; }
  }

  // ── Alocações por classe ────────────────────────────────────
  // Padrão: "NomeClasse XX,XX% R$X.XXX.XXX,XX" (tabela resumo)
  const CLASS_SUMMARY_RE = /(P[OÓ]S[\s\-]*FIXADO|INFLA[ÇC][AÃ]O|PR[EÉ][\s\-]*FIXADO|RENDA\s+VARI[AÁ]VEL|A[ÇC][OÕ]ES|MULTIMERCADO|FUNDO\s+IMOB|FII\b|VGBL|PGBL|GLOBAL|INTERNACIONAL)\s+[\d,]+%\s+R?\$?\s*([\d.]+,\d{2})/gi;
  let sm;
  while ((sm = CLASS_SUMMARY_RE.exec(text)) !== null) {
    const key = _classNameToKey(sm[1]);
    if (key) {
      const val = parseBRL(sm[2]);
      if (val >= 10000) result[key] = String(val);
    }
  }

  // Fallback: nome da classe → procura valor BRL próximo (até 300 chars)
  const CLASS_FALLBACKS = [
    { re: /P[OÓ]S[\s\-]*FIXADO/i,      key: "posFixado"  },
    { re: /INFLA[ÇC][AÃ]O/i,            key: "ipca"       },
    { re: /PR[EÉ][\s\-]*FIXADO/i,       key: "preFixado"  },
    { re: /RENDA\s+VARI[AÁ]VEL|A[ÇC][OÕ]ES\b/i, key: "acoes" },
    { re: /MULTIMERCADO/i,               key: "multi"      },
    { re: /FUNDO\s+IMOB|FII\b/i,        key: "fiis"       },
    { re: /VGBL/i,                       key: "prevVGBL"   },
    { re: /PGBL/i,                       key: "prevPGBL"   },
    { re: /GLOBAL|INTERNACIONAL|EXTERIOR|D[OÓ]LAR|USD\b/i, key: "global" },
  ];
  for (const { re, key } of CLASS_FALLBACKS) {
    if (result[key]) continue;
    const idx = text.search(re);
    if (idx < 0) continue;
    const chunk = text.slice(idx, Math.min(text.length, idx + 300));
    const valM = chunk.match(/R?\$?\s*([\d.]+,\d{2})/);
    if (valM) {
      const val = parseBRL(valM[1]);
      if (val >= 10000 && val <= 10000000000) result[key] = String(val);
    }
  }

  // ── Rentabilidade → campo da carteira ──────────────────────
  if (result._rentMes) result.rentabilidade = result._rentMes;

  // ── Movimentações ──────────────────────────────────────────
  const movIdx = text.search(/MOVIMENTA[ÇC][OÕ]ES|EXTRATO\s+DE\s+OPERA[ÇC][OÕ]ES/i);
  if (movIdx >= 0) {
    const movText = text.slice(movIdx, Math.min(text.length, movIdx + 6000));

    // Renda passiva: dividendos, juros, amortizações
    let rendimentos = 0;
    const rendRe = /(?:RENDIMENTO|DIVIDENDO|JCP|JSCP|JUROS\s+(?:SOBRE|DE)\s+CAPITAL|PGT[Oo]?\s*JUROS|PGT[Oo]?\s*AMORTIZA|DISTRIBUI[ÇC][AÃ]O)[^\n]*([\d.]+,\d{2})/gi;
    let rm;
    while ((rm = rendRe.exec(movText)) !== null) rendimentos += parseBRL(rm[1]);
    if (rendimentos > 0) result._rendimentosPassivos = rendimentos;

    // Aportes
    let aportes = 0;
    const aRe = /(?:TRANSFER[EÊ]NCIA\s+RECEBIDA|APORTE|APLICA[ÇC][AÃ]O|DEP[OÓ]SITO)[^\n]*([\d.]+,\d{2})/gi;
    let am;
    while ((am = aRe.exec(movText)) !== null) aportes += parseBRL(am[1]);
    if (aportes > 0) result._aportes = aportes;

    // Resgates
    let resgates = 0;
    const rRe = /(?:TRANSFER[EÊ]NCIA\s+ENVIADA|RESGATE|RETIRADA|SAQUE)[^\n]*([\d.]+,\d{2})/gi;
    let resm;
    while ((resm = rRe.exec(movText)) !== null) resgates += parseBRL(resm[1]);
    if (resgates > 0) result._resgates = resgates;
  }

  result._tipo = "relatorio";
  return result;
}

function _classNameToKey(name) {
  const n = name.toUpperCase();
  if (/POS[\s\-]*FIXADO|PÓS/.test(n))          return "posFixado";
  if (/INFLA|IPCA/.test(n))                     return "ipca";
  if (/PR[EÉ][\s\-]*FIXADO/.test(n))            return "preFixado";
  if (/RENDA\s+VARI|A[ÇC][OÕ]ES/.test(n))       return "acoes";
  if (/MULTIMERCADO/.test(n))                    return "multi";
  if (/FUNDO\s+IMOB|FII/.test(n))               return "fiis";
  if (/VGBL/.test(n))                            return "prevVGBL";
  if (/PGBL/.test(n))                            return "prevPGBL";
  if (/GLOBAL|INTERNACIONAL|EXTERIOR/.test(n))  return "global";
  return null;
}

// ── Parsers genéricos (fallback por palavras-chave) ────────────

const CART_PATTERNS = {
  posFixado: [/CDB\b/i,/LCI\b/i,/LCA\b/i,/LFT\b/i,/TESOURO\s+SELIC/i,/P[OÓ]S.?FIXAD/i,/CDI\b/i,/COMPROMISSAD/i,/DEBENTURE/i],
  ipca:      [/IPCA\s*\+/i,/NTN.?B/i,/TESOURO\s+IPCA/i,/INFLA[ÇC][AÃ]O\b/i],
  preFixado: [/PR[EÉ].?FIXAD/i,/TESOURO\s+PREFIXADO/i,/NTN.?F/i,/LTN\b/i],
  acoes:     [/A[ÇC][OÕ]ES?\b/i,/RENDA\s+VARI[AÁ]VEL/i,/BOLSA\b/i,/[A-Z]{4}[0-9]{1,2}\b/],
  fiis:      [/FUNDO\s+IMOBILI[AÁ]RIO/i,/FII\b/i,/FI-?INFRA/i,/[A-Z]{4}11\b/],
  multi:     [/MULTIMERCADO/i,/HEDGE\s*FUND/i],
  prevVGBL:  [/VGBL/i],
  prevPGBL:  [/PGBL/i],
  globalEquities: [/EQUIT(?:IES|Y)\b/i,/BDR\b/i,/ADR\b/i],
  globalTreasury: [/TREASURY/i,/TESOURO\s+AMERICANO/i],
  globalFunds:    [/MUTUAL\s+FUND/i],
  globalBonds:    [/BONDS?\b/i,/RENDA\s+FIXA\s+GLOBAL/i],
  global:         [/GLOBAL\b/i,/INTERNACIONAL\b/i,/EXTERIOR\b/i,/D[OÓ]LAR\b/i,/USD\b/i],
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
  renda:       [/SAL[AÁ]RIO/i,/PROL[AÁ]BORE/i,/HONOR[AÁ]RIOS/i,/REMUNERA/i,/DIVIDENDOS/i,/RENDA\s+BRUTA/i,/RECEITA\b/i],
  moradia:     [/ALUGUEL/i,/CONDOM[IÍ]NIO/i,/IPTU/i,/[AÁ]GUA\b/i,/ENERGIA\s+EL[EÉ]TRICA/i,/INTERNET\b/i],
  alimentacao: [/SUPERMERCADO/i,/ATACAD[AÃ]O/i,/CARREFOUR/i,/RESTAURANTE/i,/IFOOD/i,/DELIVERY/i],
  educacao:    [/ESCOLA\b/i,/FACULDADE/i,/MENSALIDADE.*ENSINO/i,/CURSO\b/i,/EDUCA[ÇC][AÃ]O/i],
  lazer:       [/CINEMA/i,/VIAGEM\b/i,/HOTEL\b/i,/ENTRETENIMENTO/i,/NETFLIX/i,/SPOTIFY/i],
  assinaturas: [/ASSINATURA\b/i,/STREAMING\b/i,/MICROSOFT\s*365/i,/ICLOUD/i],
  cartoes:     [/FATURA\b/i,/CART[AÃ]O\s+DE\s+CR[EÉ]DITO/i],
  carro:       [/COMBUST[IÍ]VEL/i,/GASOLINA/i,/POSTO\b/i,/IPVA/i,/PED[AÁ]GIO/i],
  saude:       [/PLANO\s+DE\s+SA[ÚU]DE/i,/FARM[AÁ]CIA/i,/HOSPITAL/i,/EXAME\b/i],
  seguros:     [/SEGURO\s+DE\s+VIDA/i,/SEGURADORA/i],
  outros:      [/OUTROS\b/i,/DIVERSE/i],
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
  if (tipo === "relatorio") {
    const res = parseRelatorio(text);
    // Se o relatório não trouxe nenhuma classe, complementa com o genérico
    const classes = Object.keys(res).filter(k => !k.startsWith("_") && k !== "rentabilidade");
    if (classes.length === 0) return _parseCarteiraGenerico(text);
    return res;
  }
  return _parseCarteiraGenerico(text);
}

export function parseFluxoFromText(text) {
  const tipo = detectDocType(text);
  if (tipo === "fatura") {
    const res = parseFatura(text);
    // Se não detectou nada pela fatura, usa o genérico
    const cats = Object.keys(res).filter(k => !k.endsWith("_items"));
    if (cats.length === 0) return _parseFluxoGenerico(text);
    return res;
  }
  return _parseFluxoGenerico(text);
}
