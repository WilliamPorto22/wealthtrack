// Definições compartilhadas de classes da carteira.
// Alinhado ao que Carteira.jsx já persiste no Firestore (snap[classKey+"Ativos"]).
export const CLASSES_CARTEIRA = [
  { key: "posFixado",      label: "Renda Fixa Pós-Fixada",   cor: "#2563eb", liq: "d+1" },
  { key: "ipca",           label: "Renda Fixa IPCA+",         cor: "#3b82f6", liq: "d+1" },
  { key: "preFixado",      label: "Renda Fixa Pré-Fixada",    cor: "#60a5fa", liq: "d+1" },
  { key: "acoes",          label: "Ações",                     cor: "#22c55e", liq: "d+2" },
  { key: "fiis",           label: "Fundos Imobiliários",        cor: "#F0A202", liq: "d+2" },
  { key: "multi",          label: "Multimercado",               cor: "#a07020", liq: "d+30" },
  { key: "prevVGBL",       label: "Previdência VGBL",           cor: "#f59e0b", liq: "—" },
  { key: "prevPGBL",       label: "Previdência PGBL",           cor: "#d97706", liq: "—" },
  { key: "globalEquities", label: "Global – Equities (R.V.)",   cor: "#a855f7", liq: "d+2" },
  { key: "globalTreasury", label: "Global – Treasury",          cor: "#c084fc", liq: "d+2" },
  { key: "globalFunds",    label: "Global – Mutual Funds",      cor: "#7c3aed", liq: "d+2" },
  { key: "globalBonds",    label: "Global – Bonds",             cor: "#9333ea", liq: "d+2" },
  { key: "global",         label: "Invest. Globais (Geral)",     cor: "#a855f7", liq: "d+2" },
];

// Mapeia o `tipo` do objetivo para o valor armazenado em `ativo.objetivo`
// (os selects da Carteira.jsx usam estes rótulos).
export const TIPO_OBJETIVO_PARA_LABEL = {
  aposentadoria:       "Aposentadoria",
  imovel:              "Aquisição de Imóvel",
  carro:               "Compra de carro",
  viagem:              "Viagem",
  educacao:            "Educação",
  saude:               "Saúde",
  sucessaoPatrimonial: "Sucessão",
  personalizado:       "Outros",
};

function parseCentavos(s) {
  return parseInt(String(s || "0").replace(/\D/g, "")) || 0;
}

// Retorna lista plana de todos os ativos do cliente com metadados de classe.
export function listarAtivosCarteira(carteira) {
  const c = carteira || {};
  const out = [];
  for (const classe of CLASSES_CARTEIRA) {
    const lista = c[classe.key + "Ativos"] || [];
    for (const a of lista) {
      out.push({
        ...a,
        classeKey: classe.key,
        classeLabel: classe.label,
        classeCor: classe.cor,
        liq: classe.liq,
        valorReais: parseCentavos(a.valor) / 100,
      });
    }
  }
  return out;
}

// Filtra ativos da carteira cujo campo `objetivo` coincide com o tipo
// do objetivo em análise.
export function ativosDoObjetivo(carteira, tipo) {
  const label = TIPO_OBJETIVO_PARA_LABEL[tipo];
  if (!label) return [];
  return listarAtivosCarteira(carteira).filter(a => (a.objetivo || "") === label);
}

// Atualiza a carteira marcando uma seleção de ativos com o rótulo do objetivo,
// e limpando a marcação de ativos que haviam sido ligados mas agora foram removidos.
// `selecionados` é um array de { classeKey, ativoId }.
export function atualizarVinculoAtivos(carteira, tipo, selecionadosIds) {
  const label = TIPO_OBJETIVO_PARA_LABEL[tipo];
  if (!label) return carteira;
  const nova = { ...(carteira || {}) };
  const selected = new Set(selecionadosIds.map(s => `${s.classeKey}::${s.ativoId}`));

  for (const classe of CLASSES_CARTEIRA) {
    const arr = nova[classe.key + "Ativos"];
    if (!arr || arr.length === 0) continue;
    const novoArr = arr.map(a => {
      const key = `${classe.key}::${a.id}`;
      const estaNaSelecao = selected.has(key);
      const estavaMarcado = (a.objetivo || "") === label;
      if (estaNaSelecao && !estavaMarcado) return { ...a, objetivo: label };
      if (!estaNaSelecao && estavaMarcado) return { ...a, objetivo: "" };
      return a;
    });
    nova[classe.key + "Ativos"] = novoArr;
  }
  return nova;
}

export function somaAtivosReais(ativos) {
  return (ativos || []).reduce((acc, a) => acc + (a.valorReais || 0), 0);
}
