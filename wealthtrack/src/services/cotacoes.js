/**
 * Serviço de Cotações
 * Atualiza cotações de mercado a cada 3 horas
 * Dados armazenados em localStorage com timestamp
 */

import React from "react";

// Cotações hardcoded (em produção, viria de uma API)
// Você pode integrar com APIs reais como Alpha Vantage, Rapid API, etc.
const COTACOES_PADRAO = {
  dolar: {
    label: "Dólar",
    valor: "R$ 5,08",
    sub: "-1,0% hoje",
    cor: "#ef4444",
    valor_numerico: 5.08,
  },
  selic: {
    label: "Selic",
    valor: "14,75%",
    sub: "a.a.",
    cor: "#6b7280",
    valor_numerico: 14.75,
  },
  ipca: {
    label: "IPCA",
    valor: "4,14%",
    sub: "12 meses",
    cor: "#6b7280",
    valor_numerico: 4.14,
  },
  ibovespa: {
    label: "Ibovespa",
    valor: "197.000",
    sub: "+21% no ano",
    cor: "#22c55e",
    valor_numerico: 197000,
  },
  sp500: {
    label: "S&P 500",
    valor: "5.396",
    sub: "+10% no ano",
    cor: "#22c55e",
    valor_numerico: 5396,
  },
};

// Chave do localStorage
const STORAGE_KEY = "wealthtrack_cotacoes";
const STORAGE_TIMESTAMP_KEY = "wealthtrack_cotacoes_timestamp";
const UPDATE_INTERVAL = 3 * 60 * 60 * 1000; // 3 horas em ms

/**
 * Obtém cotações do localStorage ou padrão
 */
export function obterCotacoes() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Erro ao ler cotações do localStorage:", e);
  }
  return COTACOES_PADRAO;
}

/**
 * Verifica se precisa atualizar cotações
 */
export function precisaAtualizarCotacoes() {
  try {
    const timestamp = localStorage.getItem(STORAGE_TIMESTAMP_KEY);
    if (!timestamp) return true;

    const ultimaAtualizacao = parseInt(timestamp);
    const agora = Date.now();
    return agora - ultimaAtualizacao >= UPDATE_INTERVAL;
  } catch (e) {
    return true;
  }
}

/**
 * Atualiza cotações (simula chamada a API)
 * Em produção, fazer chamada real a API de cotações
 */
export async function atualizarCotacoes() {
  try {
    // AQUI: Integrar com API real
    // Exemplo com Alpha Vantage, Rapid API, ou seu próprio backend

    // Simulação: adiciona variação aleatória às cotações
    const cotacoesAtualizadas = {
      ...COTACOES_PADRAO,
      dolar: {
        ...COTACOES_PADRAO.dolar,
        valor: `R$ ${(5.08 + (Math.random() - 0.5) * 0.5).toFixed(2)}`,
      },
      ibovespa: {
        ...COTACOES_PADRAO.ibovespa,
        valor: `${(197000 + Math.random() * 10000).toFixed(0)}`,
      },
    };

    // Armazena no localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cotacoesAtualizadas));
    localStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());

    return cotacoesAtualizadas;
  } catch (e) {
    console.error("Erro ao atualizar cotações:", e);
    return obterCotacoes();
  }
}

/**
 * Hook para usar cotações no componente
 * Atualiza automaticamente a cada 3 horas
 */
export function useCotacoes() {
  const [cotacoes, setCotacoes] = React.useState(obterCotacoes());

  React.useEffect(() => {
    // Atualizar se necessário
    if (precisaAtualizarCotacoes()) {
      atualizarCotacoes().then(setCotacoes);
    }

    // Configurar atualização periódica (a cada 3 horas)
    const intervalo = setInterval(() => {
      atualizarCotacoes().then(setCotacoes);
    }, UPDATE_INTERVAL);

    return () => clearInterval(intervalo);
  }, []);

  return cotacoes;
}

/**
 * Formata cotações para exibição
 */
export function formatarMercado(cotacoes) {
  return [
    cotacoes.dolar,
    cotacoes.selic,
    cotacoes.ipca,
    cotacoes.ibovespa,
    cotacoes.sp500,
  ];
}
