import Tesseract from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist";

// Worker via CDN — evita configuração extra no Vite
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// ── Extração de texto ──────────────────────────────────────────

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
    const pageText = content.items.map(it => it.str).join(" ");
    if (pageText.trim().length > 20) hasText = true;
    text += pageText + "\n\n";
  }

  // PDF digitalizado (scaneado) → OCR por página
  if (!hasText) {
    text = "";
    onProgress(66, "PDF digitalizado detectado — iniciando OCR...");
    for (let i = 1; i <= n; i++) {
      onProgress(66 + Math.round((i / n) * 24), `OCR página ${i} de ${n}...`);
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      const result = await Tesseract.recognize(canvas, ["por", "eng"]);
      text += result.data.text + "\n\n";
    }
  }

  onProgress(92, "Analisando dados financeiros...");
  return text;
}

async function _fromImage(file, onProgress) {
  onProgress(5, "Iniciando reconhecimento de imagem (OCR)...");
  const result = await Tesseract.recognize(file, ["por", "eng"], {
    logger: m => {
      if (m.status === "recognizing text")
        onProgress(5 + Math.round(m.progress * 85), `OCR: ${Math.round(m.progress * 100)}%`);
    },
  });
  onProgress(92, "Analisando dados financeiros...");
  return result.data.text;
}

// ── Helpers de valor monetário ─────────────────────────────────

function parseBRL(str) {
  if (!str) return 0;
  const s = str.replace(/[R$\s]/g, "");
  // Formato BR: 1.234,56
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s))
    return Math.round(parseFloat(s.replace(/\./g, "").replace(",", ".")) * 100);
  // Sem milhar: 1234,56
  if (/^\d+,\d{2}$/.test(s))
    return Math.round(parseFloat(s.replace(",", ".")) * 100);
  // Inglês: 1234.56
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
      const centavos = parseBRL(v[0]);
      if (centavos > max) max = centavos;
    }
    if (regex.lastIndex === m.index) regex.lastIndex++;
  }
  return max;
}

// ── Parser de CARTEIRA ─────────────────────────────────────────

const CART_PATTERNS = {
  posFixado: [
    /CDB\b/i, /LCI\b/i, /LCA\b/i, /LFT\b/i, /LF\b/i,
    /TESOURO\s+SELIC/i, /TESOURO\s+DI/i,
    /P[OÓ]S.?FIXAD/i, /RENDA\s+FIXA\s+P[OÓ]S/i, /CDI\b/i,
    /COMPROMISSAD/i, /DEBENTURE/i,
  ],
  ipca: [
    /IPCA\s*\+/i, /NTN.?B/i, /TESOURO\s+IPCA/i, /INFLA[ÇC][AÃ]O\b/i,
  ],
  preFixado: [
    /PR[EÉ].?FIXAD/i, /TESOURO\s+PREFIXADO/i, /NTN.?F/i, /LTN\b/i,
  ],
  acoes: [
    /A[ÇC][OÕ]ES?\b/i, /RENDA\s+VARI[AÁ]VEL/i, /BOLSA\b/i,
    /[A-Z]{4}[0-9]{1,2}\b/,
  ],
  fiis: [
    /FUNDO\s+IMOBILI[AÁ]RIO/i, /FII\b/i, /FI-?INFRA/i,
    /[A-Z]{4}11\b/,
  ],
  multi: [/MULTIMERCADO/i, /HEDGE\s*FUND/i, /FUNDO\s+MULTI/i],
  prevVGBL: [/VGBL/i, /VIDA\s+GERADOR/i],
  prevPGBL: [/PGBL/i, /PLANO\s+GERADOR/i],
  globalEquities: [/EQUIT(?:IES|Y)\b/i, /BDR\b/i, /ADR\b/i],
  globalTreasury: [/TREASURY/i, /TESOURO\s+AMERICANO/i],
  globalFunds: [/MUTUAL\s+FUND/i, /GLOBAL.*RENDA\s+FIXA/i],
  globalBonds: [/BONDS?\b/i, /RENDA\s+FIXA\s+GLOBAL/i],
  global: [/GLOBAL\b/i, /INTERNACIONAL\b/i, /EXTERIOR\b/i, /D[OÓ]LAR\b/i, /USD\b/i],
};

export function parseCarteiraFromText(text) {
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

// ── Parser de FLUXO MENSAL ─────────────────────────────────────

const FLUXO_PATTERNS = {
  renda: [
    /SAL[AÁ]RIO/i, /VENCIMENTO\b/i, /PROL[AÁ]BORE/i, /PRÓ.LABORE/i,
    /HONOR[AÁ]RIOS/i, /REMUNERA[ÇC][AÃ]O/i, /FOLHA\s+DE\s+PAGAMENTO/i,
    /DIVIDENDOS/i, /JCP\b/i, /RENDA\s+BRUTA/i, /RECEITA\b/i,
  ],
  moradia: [
    /ALUGUEL/i, /CONDOM[IÍ]NIO/i, /IPTU/i, /FINANCIAMENTO.*IMÓVEL/i,
    /[AÁ]GUA\b/i, /SANEAMENTO/i, /ENERGIA\s+EL[EÉ]TRICA/i,
    /CEMIG/i, /CPFL/i, /ENEL/i, /LIGHT\b/i, /COMGAS/i, /G[AÁ]S\b/i,
    /INTERNET\b/i, /NET\b/i, /CLARO.*RESI/i, /VIVO.*FIBRA/i, /FIBRA\b/i,
  ],
  alimentacao: [
    /SUPERMERCADO/i, /MERCADO\b/i, /ATACAD[AÃ]O/i, /CARREFOUR/i,
    /P[AÃ]O\s+DE\s+A[CÇ][ÚU]CAR/i, /WALMART/i, /ASSA[IÍ]/i,
    /RESTAURANTE/i, /LANCHONETE/i, /PADARIA/i, /A[CÇ]OUGUE/i,
    /IFOOD/i, /RAPPI/i, /UBER\s*EATS/i, /DELIVERY/i,
  ],
  educacao: [
    /ESCOLA\b/i, /COL[EÉ]GIO/i, /FACULDADE/i, /UNIVERSIDADE/i,
    /MENSALIDADE.*ENSINO/i, /CURSO\b/i, /IDIOMAS/i,
    /EDUCA[ÇC][AÃ]O/i, /MATERIAL\s+ESCOLAR/i, /AULA\b/i,
  ],
  lazer: [
    /CINEMA/i, /TEATRO/i, /SHOW\b/i, /EVENTO\b/i, /VIAGEM\b/i,
    /HOTEL\b/i, /POUSADA/i, /ENTRETENIMENTO/i, /LAZER\b/i,
    /NETFLIX/i, /SPOTIFY/i, /AMAZON\s*PRIME/i, /DISNEY/i,
    /GLOBOPLAY/i, /YOUTUBE\s*PREMIUM/i,
  ],
  assinaturas: [
    /ASSINATURA\b/i, /STREAMING\b/i, /MENSALIDADE.*APP/i,
    /ADOBE/i, /MICROSOFT\s*365/i, /OFFICE\s*365/i, /ICLOUD/i, /DROPBOX/i,
    /NUBANK.*PLUS/i, /PLANO\b.*MENSAL/i,
  ],
  cartoes: [
    /FATURA\b/i, /CART[AÃ]O\s+DE\s+CR[EÉ]DITO/i, /PAGAMENTO.*FATURA/i,
    /VISA\b/i, /MASTERCARD/i, /AMERICAN\s*EXPRESS/i,
    /NUBANK.*FATURA/i, /ITAUCARD/i, /BRADESCO.*CART/i,
  ],
  carro: [
    /COMBUST[IÍ]VEL/i, /GASOLINA/i, /ETANOL/i, /POSTO\b/i, /IPVA/i,
    /SEGURO.*VE[IÍ]CULO/i, /SEGURO.*AUTO/i, /DPVAT/i,
    /ESTACIONAMENTO/i, /PED[AÁ]GIO/i, /TOLL/i,
    /MANUTEN[ÇC][AÃ]O.*VE[IÍ]CULO/i, /OFICINA/i,
    /UBER\b/i, /99\s*T[AÁ]XI/i,
  ],
  saude: [
    /PLANO\s+DE\s+SA[ÚU]DE/i, /CONV[EÊ]NIO\s+M[EÉ]DICO/i,
    /UNIMED/i, /AMIL/i, /BRADESCO\s+SA[ÚU]DE/i, /SULAMERICA\s+SA[ÚU]DE/i,
    /FARM[AÁ]CIA/i, /DROGARIA/i, /DROGASIL/i, /DROGA\s*RAIA/i,
    /HOSPITAL/i, /CL[IÍ]NICA/i, /CONSULTA\s+M[EÉ]DICA/i, /DENTISTA/i,
    /LABORAT[OÓ]RIO/i, /EXAME\b/i,
  ],
  seguros: [
    /SEGURO\s+DE\s+VIDA/i, /SEGURO\s+RESID/i, /SEGURO.*PATRIMONIAL/i,
    /SEGURADORA/i, /PORTO\s+SEGURO/i, /MAPFRE/i, /ALLIANZ/i, /TOKIO\s*MARINE/i,
  ],
  outros: [/OUTROS\b/i, /DIVERSE/i, /MISCELÂNEA/i],
};

export function parseFluxoFromText(text) {
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
