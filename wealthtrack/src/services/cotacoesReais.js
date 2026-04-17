// services/cotacoesReais.js

// Horário de mercado: 10h–17h (Brasília, UTC-3)
export const HORARIO_MERCADO = { abertura: 10, fechamento: 17 };
export const INTERVALO_ATUALIZACAO = 2 * 60 * 60 * 1000; // 2 horas em ms

export function mercadoAberto() {
  const agora = new Date();
  // Converter para horário de Brasília (UTC-3)
  const brasiliaOffset = -3 * 60;
  const utc = agora.getTime() + agora.getTimezoneOffset() * 60000;
  const brasilia = new Date(utc + brasiliaOffset * 60000);

  const hora = brasilia.getHours();
  const diaSemana = brasilia.getDay(); // 0=Dom, 6=Sáb

  if (diaSemana === 0 || diaSemana === 6) return false;
  return hora >= HORARIO_MERCADO.abertura && hora < HORARIO_MERCADO.fechamento;
}

export function proximoHorarioAtualizacao() {
  const agora = new Date();
  const brasiliaOffset = -3 * 60;
  const utc = agora.getTime() + agora.getTimezoneOffset() * 60000;
  const brasilia = new Date(utc + brasiliaOffset * 60000);

  const hora = brasilia.getHours();
  const minutos = brasilia.getMinutes();

  if (hora < HORARIO_MERCADO.abertura) {
    return `${HORARIO_MERCADO.abertura}h`;
  }
  if (hora >= HORARIO_MERCADO.fechamento) {
    return `amanhã às ${HORARIO_MERCADO.abertura}h`;
  }
  // Dentro do horário — próxima atualização em 2h
  const proximaHora = hora + 2;
  return `${String(proximaHora).padStart(2, '0')}h${minutos > 0 ? String(minutos).padStart(2, '0') : ''}`;
}

// Busca Dólar no Banco Central (oficial, gratuito)
async function buscarDolar() {
  try {
    const hoje = new Date();
    const dd = String(hoje.getDate()).padStart(2, '0');
    const mm = String(hoje.getMonth() + 1).padStart(2, '0');
    const yyyy = hoje.getFullYear();
    const dataStr = `${mm}-${dd}-${yyyy}`;

    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dataStr}'&$top=1&$format=json`;
    const res = await fetch(url);
    const json = await res.json();
    const items = json?.value;

    if (items && items.length > 0) {
      const valor = items[items.length - 1].cotacaoCompra;
      return { valor, tipo: "Banco Central" };
    }

    // Se não há cotação hoje (fim de semana/feriado), busca última disponível
    const urlUltima = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@di,dataFinalCotacao=@df)?@di='01-01-${yyyy}'&@df='${mm}-${dd}-${yyyy}'&$top=1&$orderby=dataHoraCotacao%20desc&$format=json`;
    const res2 = await fetch(urlUltima);
    const json2 = await res2.json();
    if (json2?.value?.length > 0) {
      return { valor: json2.value[0].cotacaoCompra, tipo: "Último disponível" };
    }
  } catch (e) {
    console.error("Erro dólar:", e);
  }
  return { valor: 5.87, tipo: "Fallback" };
}

// Busca índice de mercado via brapi.dev (CORS suportado, gratuito para cotações básicas)
async function buscarIndice(ticker) {
  try {
    const encoded = encodeURIComponent(ticker); // ex: ^BVSP → %5EBVSP
    const url = `https://brapi.dev/api/quote/${encoded}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const r = json?.results?.[0];
    if (!r?.regularMarketPrice) throw new Error("Sem dados");
    const variacao = r.regularMarketChangePercent ?? 0;
    return {
      valor: r.regularMarketPrice,
      variacao,
      tipo: variacao >= 0 ? `+${variacao.toFixed(2)}% hoje` : `${variacao.toFixed(2)}% hoje`,
    };
  } catch (e) {
    console.warn(`Cotação ${ticker} indisponível:`, e.message);
    return null;
  }
}

// Busca Selic no Banco Central
async function buscarSelic() {
  try {
    const res = await fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json");
    const json = await res.json();
    if (json?.[0]?.valor) {
      const anual = parseFloat(json[0].valor.replace(",", "."));
      return { valor: anual, tipo: "a.a." };
    }
  } catch (e) {
    console.error("Erro Selic:", e);
  }
  return { valor: 14.75, tipo: "a.a." };
}

// Busca IPCA no Banco Central
async function buscarIPCA() {
  try {
    const res = await fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json");
    const json = await res.json();
    if (json?.[0]?.valor) {
      return { valor: parseFloat(json[0].valor.replace(",", ".")), tipo: "12 meses" };
    }
  } catch (e) {
    console.error("Erro IPCA:", e);
  }
  return { valor: 4.14, tipo: "12 meses" };
}

export async function obterTodasAsCotacoes() {
  const [dolar, ibovespa, sp500, selic, ipca] = await Promise.allSettled([
    buscarDolar(),
    buscarIndice("^BVSP"),
    buscarIndice("^GSPC"),
    buscarSelic(),
    buscarIPCA(),
  ]);

  return {
    dolar:    dolar.status    === "fulfilled" ? dolar.value    : { valor: 5.87,   tipo: "Fallback" },
    ibovespa: ibovespa.status === "fulfilled" ? ibovespa.value : { valor: 130000, tipo: "Fallback" },
    sp500:    sp500.status    === "fulfilled" ? sp500.value    : { valor: 5500,   tipo: "Fallback" },
    selic:    selic.status    === "fulfilled" ? selic.value    : { valor: 14.75,  tipo: "a.a." },
    ipca:     ipca.status     === "fulfilled" ? ipca.value     : { valor: 4.14,   tipo: "12 meses" },
  };
}

// Hook para acessar cotações em componentes React
export function useCotacoesReais() {
  return {
    obterIPCA: buscarIPCA,
    obterTodasAsCotacoes,
    mercadoAberto,
  };
}