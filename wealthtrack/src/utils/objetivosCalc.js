/**
 * Utilitários de Cálculo para Objetivos Financeiros
 * Funções reutilizáveis para simulações e projeções
 */

export const TAXA_ANUAL = 14;
export const IPCA_ANUAL = 3.81;

/**
 * Calcula valor final com juros compostos e aportes mensais
 * @param {number} inicial - Patrimônio inicial (em reais)
 * @param {number} aporteMensal - Aporte mensal (em reais)
 * @param {number} prazo - Prazo em anos
 * @param {number} taxaAnual - Taxa anual (default 14%)
 * @returns {number} Valor final acumulado
 */
export function calcularValorFinal(inicial, aporteMensal, prazo, taxaAnual = TAXA_ANUAL) {
  const j = Math.pow(1 + taxaAnual / 100, 1 / 12) - 1;
  const meses = prazo * 12;
  let valor = inicial;

  for (let m = 0; m < meses; m++) {
    valor = valor * (1 + j) + aporteMensal;
  }

  return valor;
}

/**
 * Encontra o aporte necessário para atingir uma meta em determinado prazo
 * @param {number} inicial - Patrimônio inicial (em reais)
 * @param {number} meta - Meta de patrimônio (em reais)
 * @param {number} prazo - Prazo em anos
 * @param {number} taxaAnual - Taxa anual (default 14%)
 * @returns {number} Aporte mensal necessário (em reais)
 */
export function encontrarAporteNecessario(inicial, meta, prazo, taxaAnual = TAXA_ANUAL) {
  if (prazo <= 0) return meta - inicial;

  // Busca binária para encontrar aporte que atinge meta
  let min = 0, max = meta;

  for (let iter = 0; iter < 100; iter++) {
    const mid = (min + max) / 2;
    const valor = calcularValorFinal(inicial, mid, prazo, taxaAnual);

    if (valor < meta) {
      min = mid;
    } else {
      max = mid;
    }

    // Convergência
    if (Math.abs(max - min) < 0.01) break;
  }

  return Math.ceil((min + max) / 2 * 100) / 100; // Arredondar para 2 casas decimais
}

/**
 * Encontra quantos anos são necessários para atingir a meta
 * @param {number} inicial - Patrimônio inicial (em reais)
 * @param {number} aporteMensal - Aporte mensal (em reais)
 * @param {number} meta - Meta de patrimônio (em reais)
 * @param {number} maxAnos - Máximo de anos a calcular (default 50)
 * @param {number} taxaAnual - Taxa anual (default 14%)
 * @returns {number|null} Anos necessários (com 1 casa decimal) ou null se não atingir
 */
export function encontrarAnosNecessarios(inicial, aporteMensal, meta, maxAnos = 50, taxaAnual = TAXA_ANUAL) {
  const j = Math.pow(1 + taxaAnual / 100, 1 / 12) - 1;
  const inflMensal = Math.pow(1 + IPCA_ANUAL / 100, 1 / 12) - 1;

  let vt = inicial;

  for (let mes = 1; mes <= maxAnos * 12; mes++) {
    vt = vt * (1 + j) + aporteMensal;
    const totalReal = vt / Math.pow(1 + inflMensal, mes);

    if (totalReal >= meta) {
      return Math.round(mes / 12 * 10) / 10; // Arredondar para 1 casa decimal
    }
  }

  return null;
}

/**
 * Simula o impacto de aumentar o aporte
 * @param {number} inicial - Patrimônio inicial (em reais)
 * @param {number} meta - Meta (em reais)
 * @param {number} prazoAtual - Prazo atual em anos
 * @param {number} novoAporte - Novo aporte mensal (em reais)
 * @returns {object} { anosNecessarios, economia (meses), novoAporte }
 */
export function simularNovoAporte(inicial, meta, prazoAtual, novoAporte) {
  const anosNecessarios = encontrarAnosNecessarios(inicial, novoAporte, meta);
  const anosAtual = prazoAtual || 50;

  return {
    prazoAtual: anosAtual,
    prazoNovo: anosNecessarios,
    economia: anosAtual - (anosNecessarios || 50),
    viavel: anosNecessarios !== null
  };
}

/**
 * Simula o impacto de aumentar a taxa de rentabilidade
 * @param {number} inicial - Patrimônio inicial (em reais)
 * @param {number} aporteMensal - Aporte mensal (em reais)
 * @param {number} meta - Meta (em reais)
 * @param {number} prazoAtual - Prazo atual em anos
 * @param {number} novaTaxaAnual - Nova taxa anual (%)
 * @returns {object} { anosNecessarios, economia (anos) }
 */
export function simularNovaTaxa(inicial, aporteMensal, meta, prazoAtual, novaTaxaAnual) {
  const anosNecessarios = encontrarAnosNecessarios(inicial, aporteMensal, meta, 50, novaTaxaAnual);
  const anosAtual = prazoAtual || 50;

  return {
    prazoAtual: anosAtual,
    prazoNovo: anosNecessarios,
    economia: anosAtual - (anosNecessarios || 50),
    viavel: anosNecessarios !== null,
    taxaNova: novaTaxaAnual
  };
}

/**
 * Simula o impacto de estender o prazo
 * @param {number} inicial - Patrimônio inicial (em reais)
 * @param {number} aporteMensal - Aporte mensal atual (em reais)
 * @param {number} meta - Meta (em reais)
 * @param {number} novoPrazo - Novo prazo em anos
 * @returns {object} { aporteAtual, aporteNecessario, reducao (%) }
 */
export function simularNovoPrazo(inicial, aporteMensal, meta, novoPrazo) {
  const aporteNecessario = encontrarAporteNecessario(inicial, meta, novoPrazo);
  const reducaoPercentual = ((aporteMensal - aporteNecessario) / aporteMensal * 100);

  return {
    aporteAtual: aporteMensal,
    aporteNecessario,
    reducao: reducaoPercentual,
    viavel: aporteNecessario <= aporteMensal
  };
}

/**
 * Calcula tabela de projeção ano a ano com inflação
 * @param {number} inicial - Patrimônio inicial (em reais)
 * @param {number} aporteMensal - Aporte mensal (em reais)
 * @param {number} anos - Número de anos a projetar
 * @param {number} taxaAnual - Taxa anual (default 14%)
 * @returns {array} Array com { ano, totalNominal, totalReal, rendaMensalReal }
 */
export function calcularProjecao(inicial, aporteMensal, anos, taxaAnual = TAXA_ANUAL) {
  const j = Math.pow(1 + taxaAnual / 100, 1 / 12) - 1;
  const inflMensal = Math.pow(1 + IPCA_ANUAL / 100, 1 / 12) - 1;

  let vt = inicial;
  const tabela = [];

  for (let mes = 1; mes <= anos * 12; mes++) {
    vt = vt * (1 + j) + aporteMensal;

    if (mes % 12 === 0) {
      const totalReal = vt / Math.pow(1 + inflMensal, mes);
      const rendaMensalReal = totalReal * j;

      tabela.push({
        ano: mes / 12,
        totalNominal: Math.round(vt),
        totalReal: Math.round(totalReal),
        rendaMensalReal: Math.round(rendaMensalReal),
        mes: mes
      });
    }
  }

  return tabela;
}

/**
 * Classifica o status de um plano
 * @param {number} anosNecessarios - Anos necessários (null se inviável)
 * @param {number} prazoDesejado - Prazo desejado em anos
 * @returns {string} "viavel", "ajustavel" ou "inviavel"
 */
export function classificarStatus(anosNecessarios, prazoDesejado) {
  if (!anosNecessarios) return "inviavel";

  const diff = anosNecessarios - prazoDesejado;
  if (diff <= 0) return "viavel";
  if (diff <= 2) return "ajustavel";
  return "inviavel";
}

/**
 * Calcula se o cliente atingiu a meta de aporte no mês
 * @param {number} aporteRealizado - Aporte realizado (centavos)
 * @param {number} aporteMetaMensal - Meta de aporte mensal (centavos)
 * @returns {object} { atingiu: boolean, percentual: number, diferenca: number }
 */
export function avaliarAporteMensal(aporteRealizado, aporteMetaMensal) {
  if (!aporteMetaMensal) return { atingiu: true, percentual: 100, diferenca: 0 };

  const percentual = (aporteRealizado / aporteMetaMensal) * 100;

  return {
    atingiu: aporteRealizado >= aporteMetaMensal,
    percentual: Math.round(percentual),
    diferenca: aporteRealizado - aporteMetaMensal
  };
}

/**
 * Calcula a projeção de patrimônio esperado até um determinado mês
 * @param {number} inicial - Patrimônio inicial (em reais)
 * @param {number} aporteMensal - Aporte mensal (em reais)
 * @param {number} mesAtual - Mês atual (1-12)
 * @param {number} taxaAnual - Taxa anual (default 14%)
 * @returns {number} Patrimônio esperado até o mês
 */
export function patrimonioEsperadoAteOMes(inicial, aporteMensal, mesAtual, taxaAnual = TAXA_ANUAL) {
  const j = Math.pow(1 + taxaAnual / 100, 1 / 12) - 1;
  let valor = inicial;

  for (let m = 0; m < mesAtual; m++) {
    valor = valor * (1 + j) + aporteMensal;
  }

  return valor;
}
