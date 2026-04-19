import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Navbar } from "../components/Navbar";
import { T, C } from "../theme";
import { useCotacoesReais } from "../services/cotacoesReais";
import {
  TAXA_ANUAL,
  IPCA_ANUAL,
  calcularProjecao,
  classificarStatus,
} from "../utils/objetivosCalc";
import {
  listarAtivosCarteira,
  ativosDoObjetivo,
  atualizarVinculoAtivos,
  TIPO_OBJETIVO_PARA_LABEL,
} from "../utils/ativos";

function parseCentavos(s) { return parseInt(String(s || "0").replace(/\D/g, "")) || 0; }
function moeda(c) {
  const n = parseCentavos(c);
  if (!n) return "R$ 0,00";
  return (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function brl(v) {
  const n = Math.round((v || 0) * 100) / 100;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const emojisPorTipo = {
  aposentadoria: "🏖️",
  imovel: "🏠",
  carro: "🚗",
  viagem: "✈️",
  educacao: "📚",
  saude: "💪",
  sucessaoPatrimonial: "👨‍👩‍👧‍👦",
  personalizado: "⭐"
};

const gradientsPorTipo = {
  aposentadoria:       "linear-gradient(145deg, #2a1f00 0%, #3d2e00 60%, rgba(255,202,58,0.18) 100%)",
  imovel:              "linear-gradient(145deg, #0f2006 0%, #1a360a 60%, rgba(138,201,38,0.18) 100%)",
  carro:               "linear-gradient(145deg, #2a0e00 0%, #3d1800 60%, rgba(255,107,53,0.18) 100%)",
  viagem:              "linear-gradient(145deg, #042522 0%, #0a3430 60%, rgba(93,217,193,0.18) 100%)",
  educacao:            "linear-gradient(145deg, #061c32 0%, #0d2a48 60%, rgba(34,116,165,0.18) 100%)",
  saude:               "linear-gradient(145deg, #041626 0%, #082238 60%, rgba(25,130,196,0.18) 100%)",
  sucessaoPatrimonial: "linear-gradient(145deg, #0c0820 0%, #160f30 60%, rgba(106,76,147,0.18) 100%)",
  personalizado:       "linear-gradient(145deg, #001f10 0%, #003218 60%, rgba(0,204,102,0.18) 100%)",
};

const coresPorTipo = {
  aposentadoria: "#F0A202",
  imovel: "#8AC926",
  carro: "#FF6B35",
  viagem: "#5DD9C1",
  educacao: "#2274A5",
  saude: "#1982C4",
  sucessaoPatrimonial: "#6A4C93",
  personalizado: "#00CC66",
};

const labelTipoPorTipo = {
  aposentadoria: "Aposentadoria",
  imovel: "Aquisição de Imóvel",
  carro: "Veículo",
  viagem: "Viagem",
  educacao: "Educação",
  saude: "Saúde",
  sucessaoPatrimonial: "Sucessão Patrimonial",
  personalizado: "Objetivo",
};

const labelStatus = { viavel: "Plano Viável", ajustavel: "Plano Ajustável", inviavel: "Plano Inviável" };
const corStatus = { viavel: "#4ade80", ajustavel: "#f59e0b", inviavel: "#ef4444" };

export default function ObjetivoDetalhes() {
  const { clienteId, objetivoIndex } = useParams();
  const navigate = useNavigate();
  const { obterIPCA } = useCotacoesReais();

  const [cliente, setCliente] = useState(null);
  const [objetivo, setObjetivo] = useState(null);
  const [ipca, setIpca] = useState(3.81);
  const [abaAtiva, setAbaAtiva] = useState("resumo");
  const [loading, setLoading] = useState(true);

  // Acompanhamento mensal
  const [editandoMes, setEditandoMes] = useState(null);
  const [formEditMes, setFormEditMes] = useState({});
  const [salvandoMes, setSalvandoMes] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  // Ativos — vincular novos da carteira
  const [modalAtivos, setModalAtivos] = useState(false);
  const [selecaoAtivos, setSelecaoAtivos] = useState(new Set());
  const [salvandoAtivos, setSalvandoAtivos] = useState(false);

  async function carregarCliente() {
    try {
      const snap = await getDoc(doc(db, "clientes", clienteId));
      if (snap.exists()) {
        const dados = snap.data();
        setCliente(dados);
        const obj = dados.objetivos?.[parseInt(objetivoIndex)];
        if (obj) setObjetivo(obj);
      }
    } catch (erro) {
      console.error("Erro ao carregar dados:", erro);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarCliente();
  }, [clienteId, objetivoIndex]);

  // Re-busca carteira quando a aba volta ao foco (usuário retorna de Carteira)
  useEffect(() => {
    function onFocus() { carregarCliente(); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [clienteId, objetivoIndex]);

  // Re-busca ao trocar para a aba Ativos (para capturar alterações feitas em Carteira)
  useEffect(() => {
    if (abaAtiva === "ativos") carregarCliente();
  }, [abaAtiva]);

  useEffect(() => {
    async function obterDados() {
      try {
        const dados = await obterIPCA();
        if (dados?.valor) setIpca(parseFloat(dados.valor));
      } catch (erro) {
        console.error("Erro ao obter IPCA:", erro);
      }
    }
    obterDados();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.fontFamily }}>
        <div style={{ color: T.textMuted, fontSize: 13 }}>Carregando dados...</div>
      </div>
    );
  }

  if (!objetivo || !cliente) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: T.fontFamily }}>
        <div style={{ color: T.textMuted, marginBottom: 20 }}>Objetivo não encontrado</div>
        <button onClick={() => navigate(-1)} style={{ ...C.btnSecondary, cursor: "pointer" }}>
          Voltar
        </button>
      </div>
    );
  }

  const inicial = parseCentavos(objetivo.patrimAtual) / 100;
  const aporte = parseCentavos(objetivo.aporte) / 100;
  const meta = parseCentavos(objetivo.meta) / 100;
  const prazo = parseInt(objetivo.prazo) || 0;

  const j = Math.pow(1 + TAXA_ANUAL / 100, 1 / 12) - 1;
  const inflMensal = Math.pow(1 + IPCA_ANUAL / 100, 1 / 12) - 1;
  let vt = inicial;
  let anosNec = null;
  for (let mes = 1; mes <= 50 * 12; mes++) {
    vt = vt * (1 + j) + aporte;
    const totalReal = vt / Math.pow(1 + inflMensal, mes);
    if (totalReal >= meta) {
      anosNec = Math.round(mes / 12 * 10) / 10;
      break;
    }
  }

  const status = prazo > 0 ? classificarStatus(anosNec, prazo) : (anosNec ? "viavel" : "inviavel");
  const cor = corStatus[status];
  const corTipo = coresPorTipo[objetivo.tipo] || coresPorTipo.personalizado;
  const projecao = calcularProjecao(inicial, aporte, Math.max(prazo || 10, 5));
  const emoji = emojisPorTipo[objetivo.tipo] || "⭐";
  const gradient = gradientsPorTipo[objetivo.tipo] || gradientsPorTipo.personalizado;
  const pctAtingido = Math.min(100, meta > 0 ? (inicial / meta) * 100 : 0);

  const historico = objetivo?.historicoAcompanhamento || [];
  const rentabilidadeMediaHistorico = historico.length > 0
    ? historico.reduce((s, h) => s + (h.rentabilidadeCarteira || 0), 0) / historico.length
    : null;

  async function salvarVinculoAtivos(novaSelecao) {
    setSalvandoAtivos(true);
    try {
      const snap = await getDoc(doc(db, "clientes", clienteId));
      if (snap.exists()) {
        const dadosCliente = snap.data();
        const selList = [...novaSelecao].map(k => {
          const [classeKey, ativoId] = k.split("::");
          return { classeKey, ativoId };
        });
        const novaCarteira = atualizarVinculoAtivos(dadosCliente.carteira || {}, objetivo.tipo, selList);
        // Atualiza também o campo ativosVinculados do objetivo
        const objs = [...(dadosCliente.objetivos || [])];
        const idx = parseInt(objetivoIndex);
        objs[idx] = { ...objs[idx], ativosVinculados: selList, patrimSource: "ativos" };
        await setDoc(doc(db, "clientes", clienteId), {
          ...dadosCliente,
          carteira: novaCarteira,
          objetivos: objs,
        });
        setCliente({ ...dadosCliente, carteira: novaCarteira, objetivos: objs });
        setObjetivo(objs[idx]);
      }
    } catch (e) {
      console.error("Erro ao salvar vínculo de ativos:", e);
    }
    setSalvandoAtivos(false);
    setModalAtivos(false);
  }

  async function salvarMesHistorico(mesAnoKey, dados) {
    setSalvandoMes(true);
    try {
      const snap = await getDoc(doc(db, "clientes", clienteId));
      if (snap.exists()) {
        const dadosCliente = snap.data();
        const objs = [...(dadosCliente.objetivos || [])];
        const idx = parseInt(objetivoIndex);
        const histAtual = [...(objs[idx]?.historicoAcompanhamento || [])];
        const entradaIdx = histAtual.findIndex(h => h.mesAno === mesAnoKey);
        const novaEntrada = { mesAno: mesAnoKey, ...dados, atualizadoEm: new Date().toISOString() };
        if (entradaIdx >= 0) histAtual[entradaIdx] = novaEntrada;
        else histAtual.push(novaEntrada);
        objs[idx] = { ...objs[idx], historicoAcompanhamento: histAtual };
        await setDoc(doc(db, "clientes", clienteId), { ...dadosCliente, objetivos: objs });
        setObjetivo(objs[idx]);
      }
    } catch (e) {
      console.error("Erro ao salvar histórico:", e);
    }
    setSalvandoMes(false);
    setEditandoMes(null);
  }

  // ── ABAS ──
  const Abas = () => {
    const tabs = [
      { key: "resumo", label: "Resumo" },
      { key: "simulador", label: "Estratégias" },
      { key: "acompanhamento", label: "Acompanhamento" },
      { key: "ativos", label: "Ativos" },
    ];
    return (
      <div style={{ display: "flex", gap: 2, borderBottom: `0.5px solid ${T.border}`, marginBottom: 28 }}>
        {tabs.map(({ key, label }) => {
          const ativo = abaAtiva === key;
          return (
            <button
              key={key}
              onClick={() => setAbaAtiva(key)}
              style={{
                padding: "11px 22px",
                background: "none",
                border: "none",
                borderBottom: ativo ? `2px solid ${corTipo}` : "2px solid transparent",
                color: ativo ? T.textPrimary : T.textMuted,
                fontSize: 14,
                fontWeight: ativo ? 500 : 400,
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: T.fontFamily,
                transition: "all 0.2s",
                letterSpacing: "0.01em",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  };

  // ── CABEÇALHO ──
  const Cabecalho = () => (
    <div style={{
      background: gradient,
      borderRadius: T.radiusLg,
      padding: "24px 22px 20px",
      marginBottom: 24,
      color: "#fff",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 44, lineHeight: 1 }}>{emoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 5, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            {labelTipoPorTipo[objetivo.tipo] || "Objetivo"}
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 5, lineHeight: 1.2 }}>
            {objetivo.nomeCustom || objetivo.label}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
            Meta: <strong style={{ color: "#fff" }}>{brl(meta)}</strong>
            <span style={{ margin: "0 8px", opacity: 0.35 }}>·</span>
            {prazo} {prazo === 1 ? "ano" : "anos"}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 6, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Status
          </div>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            padding: "7px 16px",
            background: `${cor}20`,
            color: cor,
            border: `1px solid ${cor}45`,
            borderRadius: 20,
            display: "inline-block",
            letterSpacing: "0.01em",
          }}>
            {status === "viavel" ? "✓" : status === "ajustavel" ? "⚠" : "✕"} {labelStatus[status]}
          </div>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
          <span>Patrimônio atual: {brl(inicial)}</span>
          <span>{pctAtingido.toFixed(1)}% da meta atingido</span>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${pctAtingido}%`,
            background: `linear-gradient(90deg, ${corTipo}70, ${corTipo})`,
            borderRadius: 4,
            transition: "width 1s ease",
          }} />
        </div>
      </div>
    </div>
  );

  // ── GRÁFICO SVG ──
  const GraficoProjecao = () => {
    if (projecao.length < 2) return null;
    const W = 800, H = 210;
    const padT = 24, padB = 38, padL = 4, padR = 4;
    const cW = W - padL - padR;
    const cH = H - padT - padB;

    const maxVal = Math.max(...projecao.map(p => p.totalReal), meta) * 1.1;
    const toX = (i) => padL + (i / (projecao.length - 1)) * cW;
    const toY = (v) => padT + cH - Math.max(0, Math.min(1, v / maxVal)) * cH;
    const metaY = toY(meta);
    const pts = projecao.map((p, i) => ({ x: toX(i), y: toY(p.totalReal) }));
    const linePath = pts.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${(padT + cH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(padT + cH).toFixed(1)} Z`;
    const crossIdx = projecao.findIndex(p => p.totalReal >= meta);

    const labelStep = Math.max(1, Math.ceil((projecao.length - 1) / 5));
    const labelIdxs = new Set([0, projecao.length - 1]);
    for (let i = labelStep; i < projecao.length - 1; i += labelStep) labelIdxs.add(i);
    const labelArr = [...labelIdxs].sort((a, b) => a - b);

    const gradId = `pg_${objetivo.tipo}`;

    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={corTipo} stopOpacity="0.45" />
            <stop offset="85%" stopColor={corTipo} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map(pct => (
          <line key={pct}
            x1={padL} y1={padT + cH * (1 - pct)}
            x2={W - padR} y2={padT + cH * (1 - pct)}
            stroke="rgba(62,92,118,0.18)" strokeWidth="1"
          />
        ))}

        <path d={areaPath} fill={`url(#${gradId})`} />

        {meta > 0 && meta < maxVal && (
          <>
            <line x1={padL} y1={metaY} x2={W - padR} y2={metaY}
              stroke="#22c55e" strokeWidth="1.5" strokeDasharray="6 5" opacity="0.7" />
            <text x={W - padR - 8} y={metaY - 8} textAnchor="end"
              fill="#22c55e" fontSize="10" opacity="0.85" fontFamily={T.fontFamily}>
              Meta {brl(meta)}
            </text>
          </>
        )}

        <path d={linePath} fill="none" stroke={corTipo} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />

        {crossIdx >= 0 && (
          <>
            <circle cx={pts[crossIdx].x} cy={pts[crossIdx].y} r="10" fill="#22c55e" opacity="0.12" />
            <circle cx={pts[crossIdx].x} cy={pts[crossIdx].y} r="4" fill="#22c55e" />
            <line x1={pts[crossIdx].x} y1={pts[crossIdx].y} x2={pts[crossIdx].x} y2={padT + cH}
              stroke="#22c55e" strokeWidth="1" strokeDasharray="3 4" opacity="0.35" />
          </>
        )}

        <circle cx={pts[0].x} cy={pts[0].y} r="4" fill={corTipo} />
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3.5" fill={corTipo} opacity="0.7" />

        <text x={pts[pts.length - 1].x} y={pts[pts.length - 1].y - 12}
          textAnchor="end" fill={corTipo} fontSize="11" fontWeight="600"
          fontFamily={T.fontFamily} opacity="0.9">
          {brl(projecao[projecao.length - 1].totalReal)}
        </text>

        {labelArr.map(i => (
          <text key={i} x={pts[i].x} y={H - 8} textAnchor="middle"
            fill="#3E5C76" fontSize="10" fontFamily={T.fontFamily}>
            {projecao[i].ano === 0 ? "Hoje" : `Ano ${Math.round(projecao[i].ano)}`}
          </text>
        ))}
      </svg>
    );
  };

  // ── RESUMO ──
  const Resumo = () => {
    const jMensal = Math.pow(1 + TAXA_ANUAL / 100, 1 / 12) - 1;
    const rentMetaMensal = parseFloat((jMensal * 100).toFixed(2));
    const rentRealizada = rentabilidadeMediaHistorico;
    const diferencaRent = rentRealizada !== null ? rentRealizada - rentMetaMensal : null;

    const infoPorTipo = {
      aposentadoria: {
        headline: "Independência Financeira",
        descricao: (<>{`Acumular ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para viver de renda passiva, sem depender de renda ativa.`}<br />{`Juros compostos com meta de ${TAXA_ANUAL}% ao ano real sobre aportes de ${brl(aporte)}/mês.`}</>),
        insight: status === "viavel"
          ? `Plano no caminho certo. Meta atingível em ${anosNec} anos. Renda mensal estimada ao final: ${brl(projecao.at(-1)?.rendaMensalReal)}.`
          : `Para atingir ${brl(meta)} em ${prazo} anos, é necessário ajustar o aporte ou o prazo. Veja as Estratégias.`,
      },
      imovel: {
        headline: "Aquisição do Imóvel",
        descricao: `Acumular ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para compra à vista ou entrada expressiva do imóvel. Cada aporte de ${brl(aporte)}/mês acelera a conquista.`,
        insight: status === "viavel"
          ? `Plano viável — valor projetado ao final do prazo: ${brl(projecao.at(-1)?.totalReal)}.`
          : `Para atingir a meta em ${prazo} anos, ajuste o plano na aba Estratégias.`,
      },
      carro: {
        headline: "Aquisição do Veículo",
        descricao: `Acumular ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para compra à vista ou com entrada expressiva. Disciplina no aporte mensal é a chave.`,
        insight: status === "viavel"
          ? `Plano no prazo — você atinge ${brl(meta)} em ${anosNec} anos.`
          : `Ajuste necessário para cumprir o prazo de ${prazo} anos — veja as Estratégias.`,
      },
      viagem: {
        headline: "Viagem dos Sonhos",
        descricao: `Acumular ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para realizar a viagem planejada. Cada aporte torna o sonho mais próximo.`,
        insight: status === "viavel"
          ? `Plano viável — valor projetado ao final: ${brl(projecao.at(-1)?.totalReal)}.`
          : `Ajuste necessário — veja as Estratégias.`,
      },
      educacao: {
        headline: "Educação",
        descricao: `Acumular ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para custear a formação planejada. Investir em educação é o ativo mais valorizado no longo prazo.`,
        insight: status === "viavel"
          ? `Plano no prazo — valor projetado: ${brl(projecao.at(-1)?.totalReal)}.`
          : `Ajuste necessário — veja as Estratégias.`,
      },
      saude: {
        headline: "Saúde e Qualidade de Vida",
        descricao: `Acumular ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para garantir qualidade de vida e cobertura de saúde ao longo dos anos.`,
        insight: status === "viavel"
          ? `Plano viável — valor projetado: ${brl(projecao.at(-1)?.totalReal)}.`
          : `Ajuste necessário — veja as Estratégias.`,
      },
      sucessaoPatrimonial: {
        headline: "Sucessão Patrimonial",
        descricao: `Estruturar ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para transmissão eficiente do patrimônio, protegendo a família com mínima carga tributária.`,
        insight: `Horizonte de ${prazo} anos para estruturar instrumentos sucessórios com máxima eficiência fiscal.`,
      },
    };

    const info = infoPorTipo[objetivo.tipo] || {
      headline: objetivo.nomeCustom || "Objetivo Personalizado",
      descricao: `Acumular ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"}.`,
      insight: `Valor projetado ao final: ${brl(projecao.at(-1)?.totalReal)}.`,
    };

    const corInsight = status === "viavel" ? "#4ade80" : status === "ajustavel" ? "#f59e0b" : "#ef4444";

    return (
      <div style={{ animation: "objFadeIn 0.32s ease forwards" }}>

        {/* Hero do plano */}
        <div style={{
          background: `linear-gradient(135deg, ${corTipo}12, ${corTipo}06)`,
          border: `0.5px solid ${corTipo}30`,
          borderRadius: T.radiusMd,
          padding: "22px 32px",
          marginBottom: 20,
          maxWidth: 680,
          margin: "0 auto 20px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 10, color: corTipo, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>
            {labelTipoPorTipo[objetivo.tipo] || "Objetivo"}
          </div>
          <div style={{ fontSize: 19, fontWeight: 600, color: T.textPrimary, marginBottom: 8, lineHeight: 1.25 }}>
            {info.headline}
          </div>
          <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.75, marginBottom: 12 }}>
            {info.descricao}
          </div>
          <div style={{
            fontSize: 12,
            color: corInsight,
            lineHeight: 1.6,
            paddingTop: 12,
            borderTop: `0.5px solid ${T.border}`,
            fontWeight: 500,
          }}>
            {info.insight}
          </div>
        </div>

        {/* KPI mini cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 10,
          marginBottom: 20,
        }}>
          {[
            { label: "Patrimônio Atual", valor: brl(inicial), color: corTipo },
            { label: "Meta", valor: brl(meta), color: T.textPrimary },
            { label: "Aporte / Mês", valor: brl(aporte), color: T.textPrimary },
            {
              label: anosNec && anosNec <= prazo ? "Atingível em" : "Prazo Desejado",
              valor: anosNec ? `${anosNec} anos` : `${prazo} anos`,
              color: cor,
            },
          ].map(({ label, valor, color }, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.025)",
              border: `0.5px solid ${T.border}`,
              borderRadius: T.radiusMd,
              padding: "14px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {label}
              </div>
              <div style={{ fontSize: 15, color, fontWeight: 600, lineHeight: 1.2 }}>
                {valor}
              </div>
            </div>
          ))}
        </div>

        {/* Gráfico */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: `0.5px solid ${T.border}`,
          borderRadius: T.radiusMd,
          padding: "16px 12px 8px",
          marginBottom: 20,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingLeft: 4 }}>
            <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500 }}>
              Projeção Patrimonial
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 10, color: T.textMuted }}>
              <span><span style={{ color: corTipo, fontWeight: 700 }}>—</span> Patrimônio Projetado</span>
              <span><span style={{ color: "#22c55e", fontWeight: 700 }}>- -</span> Meta</span>
            </div>
          </div>
          <GraficoProjecao />
        </div>

        {/* Rentabilidade */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: `0.5px solid ${T.border}`,
          borderRadius: T.radiusMd,
          padding: "16px 18px",
          marginBottom: 20,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))",
          gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 8, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>
              Meta de Rentabilidade
            </div>
            <div style={{ fontSize: 18, color: T.textPrimary, fontWeight: 600 }}>
              {TAXA_ANUAL}% a.a.
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
              {rentMetaMensal}% a.m.
            </div>
          </div>

          <div>
            <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 8, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>
              Rent. Realizada (média)
            </div>
            <div style={{
              fontSize: 18,
              color: rentRealizada !== null
                ? (rentRealizada >= rentMetaMensal ? "#22c55e" : "#ef4444")
                : T.textMuted,
              fontWeight: 600,
            }}>
              {rentRealizada !== null ? `${rentRealizada.toFixed(2)}% a.m.` : "—"}
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
              {rentRealizada !== null ? "Baseado no acompanhamento" : "Registre no Acompanhamento"}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 8, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>
              Diferença
            </div>
            {diferencaRent !== null ? (
              <>
                <div style={{ fontSize: 18, color: diferencaRent >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                  {diferencaRent > 0 ? "+" : ""}{diferencaRent.toFixed(2)}%
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
                  {diferencaRent >= 0 ? "✓ Acima da meta" : "✗ Abaixo da meta"}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 18, color: T.textMuted }}>—</div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 8, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>
              IPCA Atual
            </div>
            <div style={{ fontSize: 18, color: T.textPrimary, fontWeight: 600 }}>
              {ipca.toFixed(2)}%
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>ao ano</div>
          </div>
        </div>

        {/* Dados do plano */}
        <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 14, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Dados do Plano
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))",
          gap: 10,
          marginBottom: 28,
        }}>
          {[
            ["Patrimônio Necessário", brl(meta)],
            ["Patrimônio Atual", brl(inicial)],
            ["Aporte Mensal", brl(aporte)],
            ["Prazo Desejado", `${prazo} ${prazo === 1 ? "ano" : "anos"}`],
            ["Prazo Necessário", anosNec ? `${anosNec} anos` : "50+ anos"],
            ["Meta de Rentabilidade", `${TAXA_ANUAL}% a.a.`],
            ["IPCA", `${ipca.toFixed(2)}% a.a.`],
            ["Renda Mensal ao Final", projecao.length > 0 ? brl(projecao[projecao.length - 1]?.rendaMensalReal) : "—"],
          ].map(([label, valor], i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.02)",
              border: `0.5px solid ${T.border}`,
              borderRadius: T.radiusMd,
              padding: "12px 14px",
            }}>
              <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {label}
              </div>
              <div style={{ fontSize: 14, color: T.textPrimary, fontWeight: 500 }}>
                {valor}
              </div>
            </div>
          ))}
        </div>

        {/* Tabela projeção */}
        <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 14, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Projeção Ano a Ano
        </div>
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: `0.5px solid ${T.border}`,
          borderRadius: T.radiusMd,
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `0.5px solid ${T.border}`, background: "rgba(255,255,255,0.025)" }}>
                {["Ano", "Patrimônio Real", "Renda Mensal", "vs. Meta"].map((h, i) => (
                  <th key={i} style={{
                    padding: "10px 14px",
                    textAlign: i === 0 ? "left" : "right",
                    fontSize: 10, color: T.textMuted, fontWeight: 500, letterSpacing: "0.08em",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projecao.map((p, i) => {
                const atingiu = p.totalReal >= meta;
                const pctMeta = meta > 0 ? ((p.totalReal / meta) * 100).toFixed(0) : "—";
                return (
                  <tr key={i} style={{
                    borderBottom: `0.5px solid ${T.border}`,
                    background: atingiu ? "rgba(74,222,128,0.04)" : "transparent",
                  }}>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: T.textPrimary }}>
                      Ano {Math.round(p.ano)}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, textAlign: "right", color: atingiu ? "#4ade80" : T.textPrimary, fontWeight: atingiu ? 600 : 400 }}>
                      {brl(p.totalReal)}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12, textAlign: "right", color: T.textSecondary }}>
                      {brl(p.rendaMensalReal)}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 11, textAlign: "right" }}>
                      {atingiu
                        ? <span style={{ color: "#4ade80", fontWeight: 600 }}>✓ Atingido</span>
                        : <span style={{ color: T.textMuted }}>{pctMeta}%</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── ESTRATÉGIAS ──
  const Planos = () => {
    const calcAporteNec = () => {
      if (!prazo || prazo <= 0 || !meta) return aporte * 2;
      const j = Math.pow(1 + TAXA_ANUAL / 100, 1 / 12) - 1;
      const inflMensal = Math.pow(1 + IPCA_ANUAL / 100, 1 / 12) - 1;
      let aporteMin = 0, aporteMax = meta * 2;
      for (let iter = 0; iter < 80; iter++) {
        const aporteTeste = (aporteMin + aporteMax) / 2;
        let vt = inicial;
        let atingiu = false;
        for (let mes = 1; mes <= prazo * 12; mes++) {
          vt = vt * (1 + j) + aporteTeste;
          if (vt / Math.pow(1 + inflMensal, mes) >= meta) { atingiu = true; break; }
        }
        if (!atingiu) aporteMin = aporteTeste;
        else aporteMax = aporteTeste;
      }
      return Math.ceil((aporteMin + aporteMax) / 2);
    };

    const aporteNecessario = calcAporteNec();
    const aumentoNecessario = Math.max(0, aporteNecessario - aporte);
    const percentualAumento = aporte > 0 ? Math.round((aumentoNecessario / aporte) * 100) : 100;
    const prazoEstendido = anosNec;
    const anosExtras = prazoEstendido ? Math.max(0, Math.round((prazoEstendido - prazo) * 10) / 10) : null;

    const CardPlano = ({ numero, codigo, titulo, subtitulo, cor, descricao, comparacao, destaque, itens }) => (
      <div style={{
        background: "rgba(255,255,255,0.025)",
        border: `0.5px solid ${T.border}`,
        borderLeft: `3px solid ${cor}`,
        borderRadius: T.radiusMd,
        padding: "22px 20px 20px 18px",
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 10,
            background: `${cor}15`, border: `1px solid ${cor}35`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0
          }}>
            <span style={{ fontSize: 11, color: cor, fontWeight: 700, letterSpacing: "0.04em" }}>{codigo}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: cor, letterSpacing: "0.14em", marginBottom: 3, fontWeight: 600, textTransform: "uppercase" }}>
              Plano {numero}{subtitulo ? `  ·  ${subtitulo}` : ""}
            </div>
            <div style={{ fontSize: 15, color: T.textPrimary, fontWeight: 500, lineHeight: 1.3 }}>
              {titulo}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.8, marginBottom: 14 }}>
          {descricao}
        </div>

        {comparacao && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 32px 1fr",
            alignItems: "center",
            gap: 8,
            background: `${cor}08`,
            border: `1px solid ${cor}22`,
            borderRadius: T.radiusSm,
            padding: "16px 14px",
            marginBottom: 16,
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 6, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                {comparacao.antes.label}
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, color: T.textSecondary, lineHeight: 1.1 }}>
                {comparacao.antes.valor}
              </div>
              {comparacao.antes.sub && (
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>{comparacao.antes.sub}</div>
              )}
            </div>
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 20, color: cor, fontWeight: 200, opacity: 0.7 }}>→</span>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: cor, marginBottom: 6, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
                {comparacao.depois.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: cor, lineHeight: 1.1 }}>
                {comparacao.depois.valor}
              </div>
              {comparacao.depois.sub && (
                <div style={{ fontSize: 10, color: cor, marginTop: 4, opacity: 0.8 }}>{comparacao.depois.sub}</div>
              )}
            </div>
          </div>
        )}

        {destaque && (
          <div style={{
            background: `${cor}12`,
            border: `1px solid ${cor}35`,
            borderRadius: T.radiusSm,
            padding: "11px 16px",
            marginBottom: 16,
            fontSize: 14,
            color: cor,
            fontWeight: 700,
            textAlign: "center",
            letterSpacing: "0.01em"
          }}>
            {destaque}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {itens.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12, color: T.textSecondary, lineHeight: 1.65 }}>
              <span style={{ color: cor, flexShrink: 0, fontWeight: 700, fontSize: 14, lineHeight: 1.2, marginTop: 1 }}>›</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    );

    const planosEspecificos = () => {
      switch (objetivo.tipo) {
        case "aposentadoria":
          return [
            {
              numero: "03",
              codigo: "AA",
              titulo: "Alocação Estratégica de Ativos",
              subtitulo: "Eficiência de Retorno",
              cor: "#F0A202",
              descricao: "A composição da carteira de investimentos é o principal determinante do retorno real de longo prazo. Uma alocação estruturada e alinhada ao horizonte temporal pode incrementar a rentabilidade real em 2 a 4 pontos percentuais ao ano sem elevação proporcional do risco.",
              itens: [
                "Tesouro IPCA+: núcleo da carteira com rentabilidade real garantida pelo governo federal, protegendo o poder de compra ao longo de décadas",
                "PGBL com tabela regressiva: dedução de até 12% da renda bruta anual no IR gera liquidez imediata reinvestível, potencializando o efeito dos juros compostos",
                "Fundos Imobiliários de tijolo: renda mensal isenta de IR para pessoa física com histórico de rendimento real positivo consistente no longo prazo",
                "Ações com crescimento histórico de dividendos: proteção estrutural contra inflação e crescimento real do patrimônio ao longo do horizonte de acumulação",
                "LCI e LCA de alta qualidade: camada de liquidez isenta de IR para rebalanceamentos periódicos da carteira sem impacto tributário sobre o movimento"
              ]
            },
            {
              numero: "04",
              codigo: "TR",
              titulo: "Eficiência Tributária como Alavanca de Rentabilidade",
              subtitulo: "Planejamento Fiscal",
              cor: "#22c55e",
              descricao: "Reduzir a alíquota efetiva de IR sobre os rendimentos equivale a um incremento direto na rentabilidade líquida sem necessidade de maior exposição ao risco. Um planejamento tributário bem estruturado pode representar 1 a 3 pontos percentuais adicionais de retorno líquido ao ano.",
              itens: [
                "VGBL com tabela regressiva: alíquota de IR sobre rendimentos reduzida de 35% para 10% após 10 anos de acumulação — menor tributação disponível no sistema tributário brasileiro",
                "Investimentos isentos de IR: LCI, LCA, dividendos de ações, rendimentos de FIIs e CRI/CRA compõem a camada fiscalmente mais eficiente da carteira",
                "Compensação de perdas em renda variável: estratégia fiscal anual para abater prejuízos de operações anteriores na base tributável de ganhos futuros",
                "Análise anual do modelo de declaração: a comparação entre modelo completo e simplificado pode representar diferença relevante na restituição e no fluxo de caixa disponível",
                "Estruturação dos resgates previdenciários: planejar os resgates na fase de distribuição para manter o menor enquadramento de alíquota possível ao longo dos anos"
              ]
            }
          ];

        case "carro": {
          const prazoConsorcio = Math.min(prazo || 5, 5);
          const parcelaConsorcio = (meta / (prazoConsorcio * 12)) * 1.015;
          const taxaFinMensal = 0.0199;
          const entrada = meta * 0.2;
          const creditoFin = meta - entrada;
          const parcelaFin = creditoFin * (taxaFinMensal * Math.pow(1 + taxaFinMensal, 60)) / (Math.pow(1 + taxaFinMensal, 60) - 1);
          return [
            {
              numero: "03",
              codigo: "CC",
              titulo: "Consórcio Automotivo",
              subtitulo: "Menor Custo Total",
              cor: "#FF6B35",
              descricao: "O consórcio automotivo é o instrumento de menor custo para aquisição de veículos a prazo. A ausência de juros elimina o efeito exponencial negativo do financiamento tradicional, especialmente relevante em prazos superiores a 24 meses.",
              destaque: `Parcela estimada: ${brl(parcelaConsorcio)}/mês por ${prazoConsorcio * 12} meses`,
              itens: [
                `Crédito de ${brl(meta)} com taxa de administração de aproximadamente 1,5% sobre o valor total, sem incidência de juros sobre o capital`,
                "Ausência de juros representa economia de 20% a 40% em relação ao custo total do financiamento bancário para o mesmo prazo contratado",
                "Lance com recursos próprios viabiliza contemplação antecipada em qualquer mês do contrato, independentemente do resultado do sorteio mensal",
                "Verifique o histórico de contemplações por sorteio do grupo — grupos mais antigos tendem a apresentar maior frequência de contemplação por maturidade",
                "Confirme o registro da administradora no Banco Central e avalie o histórico operacional antes da adesão ao grupo consorcial"
              ]
            },
            {
              numero: "04",
              codigo: "CF",
              titulo: "Financiamento com Análise de CET",
              subtitulo: "Aquisição Imediata",
              cor: "#2274A5",
              descricao: "O financiamento bancário oferece disponibilidade imediata do veículo, porém o Custo Efetivo Total (CET) pode representar entre 20% e 80% do valor do bem em encargos financeiros. Análise criteriosa é indispensável antes da assinatura do contrato.",
              destaque: `Entrada: ${brl(entrada)} + parcela estimada: ${brl(parcelaFin)}/mês (60x)`,
              itens: [
                "Custo Efetivo Total (CET): compare sempre o CET anual entre bancos, financeiras e montadoras — a taxa nominal subestima o custo real do crédito contratado",
                "Entrada recomendada pelo CFP: mínimo de 20% a 30% do valor do veículo, reduzindo o prazo e o custo total dos juros ao longo do contrato",
                "Débito automático na mesma instituição do salário reduz a taxa de juros contratada em média 0,3% a 0,5% ao mês sobre o saldo devedor",
                "Modalidade CDC: verifique a possibilidade de liquidação antecipada com abatimento proporcional de juros, direito garantido pelo Código de Defesa do Consumidor",
                "Evite prazos superiores a 48 meses em veículos: a depreciação do bem supera com frequência o saldo devedor, criando desequilíbrio patrimonial desfavorável"
              ]
            }
          ];
        }

        case "imovel": {
          const prazoConsorcioIm = Math.min(Math.max(prazo || 15, 10), 20);
          const parcelaConsorcioIm = (meta / (prazoConsorcioIm * 12)) * 1.02;
          const taxaFinMensalIm = 0.0075;
          const entradaIm = meta * 0.2;
          const creditoIm = meta - entradaIm;
          const parcelaFinIm = creditoIm * (taxaFinMensalIm * Math.pow(1 + taxaFinMensalIm, 360)) / (Math.pow(1 + taxaFinMensalIm, 360) - 1);
          return [
            {
              numero: "03",
              codigo: "CI",
              titulo: "Consórcio Imobiliário",
              subtitulo: "Menor Custo Total",
              cor: "#8AC926",
              descricao: "O consórcio imobiliário é o instrumento de menor Custo Efetivo Total (CET) para aquisição de imóveis a prazo. Sem incidência de juros e com apenas taxa de administração, a economia em relação ao financiamento bancário pode superar 40% do valor total do bem.",
              destaque: `Parcela estimada: ${brl(parcelaConsorcioIm)}/mês por ${prazoConsorcioIm} anos`,
              itens: [
                `Crédito de ${brl(meta)} com taxa de administração de aproximadamente 2% sobre o crédito total, sem incidência de juros sobre o capital`,
                "Economia em relação ao financiamento bancário: entre 30% e 50% do valor total do imóvel ao longo do prazo, dependendo da taxa vigente na contratação",
                "FGTS pode ser utilizado como oferta de lance para contemplação antecipada, reduzindo significativamente o tempo de espera pelo crédito",
                "Contemplação por lance livre: o cotista planeja estrategicamente o momento de obtenção do crédito, com maior controle que o sorteio convencional",
                "Avalie o rating ABAC e o histórico de contemplações da administradora escolhida — solidez operacional é critério essencial na seleção"
              ]
            },
            {
              numero: "04",
              codigo: "FI",
              titulo: "Financiamento Imobiliário",
              subtitulo: "Análise de Custo de Oportunidade",
              cor: "#1982C4",
              descricao: "O financiamento imobiliário permite a aquisição antecipada do bem, mas exige análise rigorosa do Custo Efetivo Total (CET) e da decisão de oportunidade: o custo real do financiamento comparado ao retorno do capital não desembolsado mantido investido.",
              destaque: `Entrada estimada: ${brl(entradaIm)} + parcela: ${brl(parcelaFinIm)}/mês (360x)`,
              itens: [
                "Custo Efetivo Total (CET): compare sempre o CET entre Caixa, bancos privados e cooperativas de crédito — a taxa nominal subestima o custo real da operação",
                "FGTS: utilizável como entrada e em amortizações anuais — cada amortização extraordinária reduz o saldo devedor e os juros totais do contrato de forma relevante",
                "Tabela SAC versus Price: a tabela SAC resulta em menor custo total de juros e é recomendada quando há capacidade de pagamento inicial maior nos primeiros anos",
                "Portabilidade de crédito: direito legal do mutuário de transferir o financiamento para instituição com taxa inferior após a contratação, sem penalidade",
                "Análise de oportunidade: mantenha capital excedente em Tesouro IPCA+ enquanto financia — o spread pode ser positivo a depender das taxas vigentes no momento"
              ]
            }
          ];
        }

        case "sucessaoPatrimonial":
          return [
            {
              numero: "03",
              codigo: "PP",
              titulo: "Previdência Privada como Instrumento Sucessório",
              subtitulo: "Planejamento Tributário e Sucessório",
              cor: "#6A4C93",
              descricao: "A previdência privada é o instrumento mais eficiente do mercado brasileiro para planejamento sucessório: não integra o inventário, transmite capital ao beneficiário com liquidez em até 30 dias e oferece benefício tributário expressivo nas fases de acumulação e distribuição.",
              itens: [
                "Não integra o inventário: capital transmitido ao beneficiário em até 30 dias, sem ITCMD em muitos estados, sem bloqueio judicial e sem custos advocatícios de abertura",
                "PGBL: dedução de até 12% da renda bruta tributável anual no IR — instrumento de eficiência tributária com impacto imediato e reinvestível no fluxo de caixa",
                "Tabela regressiva: alíquota de IR sobre os rendimentos reduzida de 35% para 10% após 10 anos de acumulação — menor tributação disponível no sistema tributário brasileiro",
                "VGBL: tributação exclusiva sobre o rendimento (não sobre o total acumulado), indicado como complemento ao PGBL ou para contribuintes do modelo simplificado",
                "Proteção patrimonial: decisões jurídicas recentes têm reconhecido a impenhorabilidade da previdência privada em processos de execução, preservando o patrimônio familiar"
              ]
            },
            {
              numero: "04",
              codigo: "SV",
              titulo: "Seguro de Vida com Capital Relevante",
              subtitulo: "Proteção e Liquidez Imediata",
              cor: "#1982C4",
              descricao: "O seguro de vida com capital expressivo é o único instrumento financeiro que cria patrimônio imediato independente do acumulado. Para planejamento sucessório de alto patrimônio, funciona como mecanismo de liquidez instantânea, viabilizando o pagamento do ITCMD e dos custos do inventário sem necessidade de venda forçada de ativos.",
              itens: [
                "Indenização isenta de Imposto de Renda para beneficiários, conforme Art. 794 do Código Civil e regulamentação da SUSEP — benefício tributário relevante na transmissão",
                "Transmissão extrajudicial e direta: capital pago ao beneficiário cadastrado sem necessidade de abertura de inventário, com liquidez imediata para a família",
                "Capital segurado adequado ao planejamento: a prática CFP recomenda cobertura de 10 a 20 vezes a renda anual, suficiente para manter o padrão de vida por 5 a 10 anos sem redução patrimonial",
                "Coberturas complementares de alto valor: invalidez permanente por acidente ou doença, diagnóstico de doenças graves (câncer, infarto, AVC) e diária de internação hospitalar",
                "Liquidez estratégica no inventário: o capital pode financiar o pagamento do ITCMD (imposto estadual sobre herança), evitando venda forçada de imóveis ou participações societárias"
              ]
            }
          ];

        default:
          return [];
      }
    };

    const planos = planosEspecificos();

    return (
      <div style={{ animation: "objFadeIn 0.32s ease forwards" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            Estratégias Personalizadas
          </div>
          <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.8 }}>
            Baseado nos dados do seu objetivo e nas diretrizes técnicas do planejamento financeiro certificado (CFP),
            mapeamos os caminhos mais eficientes para alcançar sua meta com o menor custo e maior previsibilidade.
          </div>
        </div>

        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: `0.5px solid ${T.border}`,
          borderRadius: T.radiusMd,
          padding: "16px 20px",
          marginBottom: 28,
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
          textAlign: "center"
        }}>
          <div>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 5, letterSpacing: "0.08em", textTransform: "uppercase" }}>Aporte Atual</div>
            <div style={{ fontSize: 16, color: T.textPrimary, fontWeight: 600 }}>{brl(aporte)}</div>
            <div style={{ fontSize: 10, color: T.textMuted }}>por mês</div>
          </div>
          <div style={{ borderLeft: `0.5px solid ${T.border}`, borderRight: `0.5px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 5, letterSpacing: "0.08em", textTransform: "uppercase" }}>Meta</div>
            <div style={{ fontSize: 16, color: T.textPrimary, fontWeight: 600 }}>{brl(meta)}</div>
            <div style={{ fontSize: 10, color: T.textMuted }}>patrimônio</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 5, letterSpacing: "0.08em", textTransform: "uppercase" }}>Prazo</div>
            <div style={{ fontSize: 16, color: T.textPrimary, fontWeight: 600 }}>{prazo}</div>
            <div style={{ fontSize: 10, color: T.textMuted }}>anos</div>
          </div>
        </div>

        <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ whiteSpace: "nowrap" }}>Ajustar a Rota</span>
          <div style={{ flex: 1, height: "0.5px", background: T.border }} />
        </div>

        <CardPlano
          numero="01"
          codigo="M+"
          titulo="Aumentar o Aporte Mensal"
          subtitulo="Rota Principal"
          cor="#22c55e"
          descricao={
            status === "viavel"
              ? "O plano está no caminho certo. A consistência no aporte atual é suficiente para atingir a meta dentro do prazo estabelecido. Um incremento adicional amplia a margem de segurança e antecipa a conquista do seu objetivo."
              : `Para alcançar ${brl(meta)} em ${prazo} anos mantendo a taxa de ${TAXA_ANUAL}% a.a., o aporte mensal necessário foi calculado abaixo. Esta é a rota mais direta para atingir seu objetivo no prazo original.`
          }
          comparacao={status !== "viavel" ? {
            antes: { label: "Aporte Atual", valor: `${brl(aporte)}`, sub: "por mês" },
            depois: { label: "Aporte Necessário", valor: `${brl(aporteNecessario)}`, sub: `+${brl(aumentoNecessario)}/mês  (+${percentualAumento}%)` }
          } : {
            antes: { label: "Aporte Atual", valor: `${brl(aporte)}`, sub: "por mês" },
            depois: { label: "Chegará em", valor: `${prazoEstendido || prazo} anos`, sub: prazoEstendido && prazoEstendido < prazo ? `${Math.round((prazo - prazoEstendido) * 10) / 10} anos antes do prazo` : "dentro do prazo" }
          }}
          itens={[
            status !== "viavel"
              ? `Aumento necessário: ${brl(aumentoNecessario)} adicionais por mês, correspondendo a ${percentualAumento}% acima do aporte atual`
              : "Aporte atual dentro do planejamento — mantenha a consistência e realize revisões anuais para preservar o poder real de acumulação",
            "Automatize os aportes via débito automático na data de recebimento do salário, eliminando o viés comportamental de postergação",
            "Reajuste o aporte pelo IPCA anualmente para preservar o poder real de acumulação e não perder terreno para a inflação ao longo do prazo",
            "Redirecione receitas extraordinárias integralmente ao objetivo: 13º salário, bônus, PLR e restituição de IR têm impacto desproporcional no longo prazo",
            "A cada incremento de renda, comprometa ao menos 50% do aumento com o aporte — controle do lifestyle inflation é fator crítico validado pelo CFP"
          ]}
        />

        <CardPlano
          numero="02"
          codigo="T+"
          titulo="Estender o Prazo do Objetivo"
          subtitulo="Rota Alternativa"
          cor="#3b82f6"
          descricao={
            prazoEstendido && prazoEstendido <= prazo
              ? `O plano está adiantado. Mantendo o aporte atual de ${brl(aporte)}/mês, a meta de ${brl(meta)} será atingida em ${prazoEstendido} anos — antes do prazo original. Nenhum ajuste é necessário.`
              : prazoEstendido
              ? `Mantendo o aporte atual de ${brl(aporte)}/mês sem qualquer alteração, calcule abaixo em quanto tempo você atingirá ${brl(meta)}. Um prazo maior potencializa o efeito dos juros compostos de forma não linear.`
              : `Com o aporte atual, o objetivo levaria mais de 50 anos. A extensão de prazo isolada não resolve — o ajuste de aporte é indispensável.`
          }
          comparacao={prazoEstendido ? {
            antes: { label: "Prazo Desejado", valor: `${prazo} anos`, sub: `aporte de ${brl(aporte)}/mês` },
            depois: prazoEstendido <= prazo
              ? { label: "Chegará em", valor: `${prazoEstendido} anos`, sub: `${Math.round((prazo - prazoEstendido) * 10) / 10} anos antecipado` }
              : { label: "Prazo Real", valor: `${prazoEstendido} anos`, sub: `+${anosExtras} anos além do planejado` }
          } : null}
          itens={[
            prazoEstendido
              ? `Com o aporte atual de ${brl(aporte)}/mês mantido sem alteração, ${brl(meta)} será atingido em ${prazoEstendido} anos`
              : "Aporte atual insuficiente para qualquer horizonte razoável — o ajuste de contribuição mensal é a ação prioritária",
            "Um prazo mais longo permite alocação maior em renda variável, historicamente superior à renda fixa em horizontes acima de 5 anos",
            "Combine extensão de prazo com aumentos graduais de aporte — a convergência das duas alavancas é mais eficiente do que cada uma isolada",
            "Defina marcos intermediários de patrimônio para monitoramento e comprometimento ao longo do horizonte de planejamento",
            "O custo de adiar o início dos aportes é assimétrico: cada ano de postergação exige esforço de recuperação desproporcional nos anos seguintes"
          ]}
        />

        {planos.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 16, marginTop: 28, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ whiteSpace: "nowrap" }}>Alternativas Estratégicas</span>
              <div style={{ flex: 1, height: "0.5px", background: T.border }} />
            </div>
            {planos.map(p => <CardPlano key={p.numero} {...p} />)}
          </>
        )}

        <div style={{
          marginTop: 24,
          padding: "16px 20px",
          background: "rgba(240,162,2,0.04)",
          border: `0.5px solid rgba(240,162,2,0.15)`,
          borderRadius: T.radiusMd,
          fontSize: 11,
          color: T.textMuted,
          lineHeight: 1.8
        }}>
          <span style={{ color: T.gold, fontWeight: 600, letterSpacing: "0.03em" }}>Nota do Assessor (CFP):</span>
          {" "}As estratégias apresentadas são baseadas nos dados informados e nas diretrizes técnicas do CFP (Certified Financial Planner), certificação reconhecida internacionalmente como padrão de excelência no planejamento financeiro pessoal. Para a decisão mais adequada ao seu caso, considere também seu perfil de risco, necessidade de liquidez e situação fiscal atual.
        </div>
      </div>
    );
  };

  // ── ACOMPANHAMENTO MENSAL ──
  const Acompanhamento = () => {
    const hist = objetivo?.historicoAcompanhamento || [];
    const temHistorico = hist.length > 0;

    const hoje = new Date();
    const mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const totalMeses = Math.max(prazo * 12, 12);

    const jMensal = Math.pow(1 + TAXA_ANUAL / 100, 1 / 12) - 1;
    const metaRentPct = parseFloat((jMensal * 100).toFixed(2));

    const linhas = [];
    let patrimonioAlvo = inicial;
    for (let i = 0; i < totalMeses; i++) {
      const data = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + i, 1);
      const mesAnoKey = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
      const mesLabel = data.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      patrimonioAlvo = patrimonioAlvo * (1 + jMensal) + aporte;
      const dadoHist = hist.find(h => h.mesAno === mesAnoKey);
      const isAtual = i === 0;
      const isFuturo = i > 0;
      let statusMes = null;
      if (dadoHist) {
        const aOk = (dadoHist.aporteRealizado || 0) >= aporte;
        const rOk = (dadoHist.rentabilidadeCarteira || 0) >= metaRentPct;
        statusMes = aOk && rOk ? "meta_batida" : aOk || rOk ? "meta_parcial" : "nao_bateu";
      }
      linhas.push({
        mesAnoKey, mesLabel, isAtual, isFuturo, patrimonioAlvo,
        valorCarteira: dadoHist?.valorCarteira ?? (isAtual ? inicial : null),
        aporteRealizado: dadoHist?.aporteRealizado ?? null,
        rentReal: dadoHist?.rentabilidadeCarteira ?? null,
        statusMes, temDados: !!dadoHist,
      });
    }

    const thS = { padding: "12px 14px", textAlign: "left", fontSize: 12, color: T.textMuted, fontWeight: 500, whiteSpace: "nowrap", borderRight: `0.5px solid ${T.border}` };
    const tdS = { padding: "11px 14px", fontSize: 13, color: T.textPrimary, borderRight: `0.5px solid ${T.border}`, whiteSpace: "nowrap" };

    function PillStatus({ s }) {
      if (!s) return <span style={{ color: T.textMuted, fontSize: 10 }}>—</span>;
      const map = {
        meta_batida: ["Meta Batida", "#22c55e", "rgba(34,197,94,0.12)"],
        meta_parcial: ["Meta Parcial", "#f59e0b", "rgba(245,158,11,0.12)"],
        nao_bateu: ["Não Bateu", "#ef4444", "rgba(239,68,68,0.12)"],
      };
      const [label, cor, bg] = map[s] || ["—", T.textMuted, "transparent"];
      return (
        <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: bg, color: cor, fontWeight: 600, whiteSpace: "nowrap" }}>
          {label}
        </span>
      );
    }

    return (
      <div style={{ animation: "objFadeIn 0.32s ease forwards" }}>
        <div style={{ border: `0.5px solid ${T.border}`, borderRadius: T.radiusMd, marginBottom: 24, overflow: "hidden" }}>
          <button
            onClick={() => setHistoricoAberto(h => !h)}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "rgba(255,255,255,0.02)", border: "none", cursor: "pointer", color: T.textPrimary, fontFamily: T.fontFamily }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 400 }}>Histórico Registrado</span>
              {temHistorico
                ? <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>{hist.length} {hist.length === 1 ? "mês" : "meses"}</span>
                : <span style={{ fontSize: 11, color: T.textMuted }}>— Nenhum dado registrado ainda</span>
              }
            </div>
            <span style={{ color: T.textMuted, fontSize: 14 }}>{historicoAberto ? "▲" : "▼"}</span>
          </button>

          {historicoAberto && (
            <div style={{ borderTop: `0.5px solid ${T.border}` }}>
              {!temHistorico && (
                <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: T.textMuted }}>
                  Conforme os meses passarem, os dados registrados aparecerão aqui.
                </div>
              )}
              {temHistorico && hist.slice().sort((a, b) => b.mesAno.localeCompare(a.mesAno)).map((h, i) => {
                const lbl = new Date(h.mesAno + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                const aOk = (h.aporteRealizado || 0) >= aporte;
                const rOk = (h.rentabilidadeCarteira || 0) >= metaRentPct;
                const st = aOk && rOk ? "meta_batida" : aOk || rOk ? "meta_parcial" : "nao_bateu";
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px", borderBottom: i < hist.length - 1 ? `0.5px solid ${T.border}` : "none", fontSize: 12 }}>
                    <span style={{ color: T.textPrimary, textTransform: "capitalize" }}>{lbl}</span>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <span style={{ color: T.textSecondary }}>Carteira: {brl(h.valorCarteira || 0)}</span>
                      <span style={{ color: T.textSecondary }}>Aporte: {brl(h.aporteRealizado || 0)}</span>
                      <span style={{ color: T.textSecondary }}>Rent.: {(h.rentabilidadeCarteira || 0).toFixed(2)}%</span>
                      <PillStatus s={st} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: T.textMuted, marginBottom: 3 }}>
              Plano de Acompanhamento
            </div>
            <div style={{ fontSize: 11, color: T.textMuted }}>
              {prazo} {prazo === 1 ? "ano" : "anos"} · {totalMeses} meses · Clique num mês para registrar dados realizados
            </div>
          </div>
          <div style={{ fontSize: 11, color: T.textSecondary, textAlign: "right" }}>
            Meta final: {brl(meta)}<br />
            <span style={{ color: T.textMuted }}>Aporte comprometido: {brl(aporte)}/mês</span>
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.02)", border: `0.5px solid ${T.border}`, borderRadius: T.radiusMd, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 740 }}>
            <thead>
              <tr style={{ borderBottom: `0.5px solid ${T.border}`, background: "rgba(255,255,255,0.03)" }}>
                <th style={thS}>Mês / Ano</th>
                <th style={{ ...thS, textAlign: "right" }}>Valor Alvo</th>
                <th style={{ ...thS, textAlign: "right" }}>Carteira Atual</th>
                <th style={{ ...thS, textAlign: "right" }}>Meta Aporte</th>
                <th style={{ ...thS, textAlign: "right" }}>Realizado</th>
                <th style={{ ...thS, textAlign: "right" }}>Meta Rent.%</th>
                <th style={{ ...thS, textAlign: "right" }}>Rent. Real%</th>
                <th style={{ ...thS, textAlign: "center", borderRight: "none" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {linhas.flatMap((linha) => {
                const isEditing = editandoMes === linha.mesAnoKey;
                const rowBg = isEditing
                  ? "rgba(240,162,2,0.08)"
                  : linha.isAtual ? "rgba(240,162,2,0.05)" : "transparent";

                const dataRow = (
                  <tr
                    key={linha.mesAnoKey}
                    style={{ borderBottom: `0.5px solid ${T.border}`, background: rowBg, cursor: !linha.isFuturo ? "pointer" : "default", transition: "background 0.15s" }}
                    onClick={() => {
                      if (linha.isFuturo) return;
                      if (isEditing) { setEditandoMes(null); return; }
                      setEditandoMes(linha.mesAnoKey);
                      setFormEditMes({
                        valorCarteira: linha.valorCarteira != null ? String(Math.round(linha.valorCarteira)) : "",
                        aporteRealizado: linha.aporteRealizado != null ? String(Math.round(linha.aporteRealizado)) : "",
                        rentabilidadeCarteira: linha.rentReal != null ? String(linha.rentReal) : "",
                      });
                    }}
                  >
                    <td style={tdS}>
                      <span style={{ color: linha.isAtual ? T.gold : linha.isFuturo ? T.textMuted : T.textPrimary, fontWeight: linha.isAtual ? 500 : 400 }}>
                        {linha.mesLabel}{linha.isAtual && " ●"}
                      </span>
                    </td>
                    <td style={{ ...tdS, textAlign: "right", color: T.textSecondary }}>{brl(linha.patrimonioAlvo)}</td>
                    <td style={{ ...tdS, textAlign: "right" }}>
                      {linha.valorCarteira != null
                        ? <span style={{ color: linha.valorCarteira >= linha.patrimonioAlvo ? "#22c55e" : T.textPrimary }}>{brl(linha.valorCarteira)}</span>
                        : <span style={{ color: T.textMuted }}>—</span>
                      }
                    </td>
                    <td style={{ ...tdS, textAlign: "right", color: T.textSecondary }}>{brl(aporte)}</td>
                    <td style={{ ...tdS, textAlign: "right" }}>
                      {linha.aporteRealizado != null
                        ? <span style={{ color: linha.aporteRealizado >= aporte ? "#22c55e" : "#ef4444" }}>{brl(linha.aporteRealizado)}</span>
                        : <span style={{ color: T.textMuted }}>—</span>
                      }
                    </td>
                    <td style={{ ...tdS, textAlign: "right", color: T.textSecondary }}>{metaRentPct.toFixed(2)}%</td>
                    <td style={{ ...tdS, textAlign: "right" }}>
                      {linha.rentReal != null
                        ? <span style={{ color: linha.rentReal >= metaRentPct ? "#22c55e" : "#ef4444" }}>{linha.rentReal.toFixed(2)}%</span>
                        : <span style={{ color: T.textMuted }}>—</span>
                      }
                    </td>
                    <td style={{ ...tdS, textAlign: "center", borderRight: "none" }}>
                      {linha.isFuturo
                        ? <span style={{ color: T.textMuted, fontSize: 10 }}>—</span>
                        : <PillStatus s={linha.statusMes} />
                      }
                    </td>
                  </tr>
                );

                if (!isEditing) return [dataRow];

                const editRow = (
                  <tr key={linha.mesAnoKey + "_edit"} style={{ borderBottom: `0.5px solid ${T.border}`, background: "rgba(240,162,2,0.04)" }}>
                    <td colSpan={8} style={{ padding: "14px 16px" }}>
                      <div style={{ fontSize: 11, color: T.gold, marginBottom: 10, fontWeight: 500 }}>
                        Registrar dados de {linha.mesLabel}
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div>
                          <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>Valor da Carteira (R$)</div>
                          <input
                            type="text" inputMode="numeric" placeholder="0"
                            value={formEditMes.valorCarteira || ""}
                            onChange={e => setFormEditMes(f => ({ ...f, valorCarteira: e.target.value.replace(/\D/g, "") }))}
                            onClick={e => e.stopPropagation()}
                            style={{ ...C.input, width: 140, padding: "7px 10px", fontSize: 13 }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>Aporte Realizado (R$)</div>
                          <input
                            type="text" inputMode="numeric" placeholder="0"
                            value={formEditMes.aporteRealizado || ""}
                            onChange={e => setFormEditMes(f => ({ ...f, aporteRealizado: e.target.value.replace(/\D/g, "") }))}
                            onClick={e => e.stopPropagation()}
                            style={{ ...C.input, width: 140, padding: "7px 10px", fontSize: 13 }}
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>Rentabilidade Real (%)</div>
                          <input
                            type="text" inputMode="decimal" placeholder={metaRentPct.toFixed(2)}
                            value={formEditMes.rentabilidadeCarteira || ""}
                            onChange={e => setFormEditMes(f => ({ ...f, rentabilidadeCarteira: e.target.value.replace(/[^\d.,]/g, "").replace(",", ".") }))}
                            onClick={e => e.stopPropagation()}
                            style={{ ...C.input, width: 120, padding: "7px 10px", fontSize: 13 }}
                          />
                        </div>
                        <button
                          disabled={salvandoMes}
                          onClick={e => {
                            e.stopPropagation();
                            salvarMesHistorico(linha.mesAnoKey, {
                              valorCarteira: parseFloat(formEditMes.valorCarteira || "0"),
                              aporteRealizado: parseFloat(formEditMes.aporteRealizado || "0"),
                              rentabilidadeCarteira: parseFloat((formEditMes.rentabilidadeCarteira || "0").replace(",", ".")),
                            });
                          }}
                          style={{ padding: "8px 20px", background: T.goldDim, border: `1px solid ${T.goldBorder}`, borderRadius: T.radiusMd, color: T.gold, fontSize: 12, cursor: "pointer", fontFamily: T.fontFamily, letterSpacing: "0.06em" }}
                        >
                          {salvandoMes ? "Salvando..." : "Salvar"}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setEditandoMes(null); }}
                          style={{ padding: "8px 14px", background: "none", border: `0.5px solid ${T.border}`, borderRadius: T.radiusMd, color: T.textMuted, fontSize: 12, cursor: "pointer", fontFamily: T.fontFamily }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                );

                return [dataRow, editRow];
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: T.textMuted, lineHeight: 1.8 }}>
          <span><span style={{ color: "#22c55e" }}>●</span> Meta Batida — aporte e rentabilidade atingidos</span>
          <span><span style={{ color: "#f59e0b" }}>●</span> Meta Parcial — apenas uma meta atingida</span>
          <span><span style={{ color: "#ef4444" }}>●</span> Não Bateu — nenhuma meta atingida</span>
          <span><span style={{ color: T.gold }}>●</span> Mês atual</span>
        </div>
      </div>
    );
  };

  // ── ATIVOS ──
  const Ativos = () => {
    const carteira = cliente?.carteira || {};
    const vinculados = ativosDoObjetivo(carteira, objetivo.tipo);
    const labelAtivo = TIPO_OBJETIVO_PARA_LABEL[objetivo.tipo];
    const todosAtivos = listarAtivosCarteira(carteira);
    const totalVinculado = vinculados.reduce((s, a) => s + (a.valorReais || 0), 0);

    const rentAnoSoma = vinculados.reduce((acc, a) => acc + (parseFloat(String(a.rentAno || "0").replace(",", ".")) || 0) * (a.valorReais || 0), 0);
    const rentMedia12 = totalVinculado > 0 ? rentAnoSoma / totalVinculado : 0;
    const rentMesSoma = vinculados.reduce((acc, a) => acc + (parseFloat(String(a.rentMes || "0").replace(",", ".")) || 0) * (a.valorReais || 0), 0);
    const rentMediaMes = totalVinculado > 0 ? rentMesSoma / totalVinculado : 0;

    const abrirModal = () => {
      setSelecaoAtivos(new Set(vinculados.map(a => `${a.classeKey}::${a.id}`)));
      setModalAtivos(true);
    };

    if (vinculados.length === 0) {
      return (
        <div style={{ animation: "objFadeIn 0.32s ease forwards" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Ativos Vinculados a Este Objetivo
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => navigate(`/cliente/${clienteId}/carteira`)}
                style={{ padding: "8px 14px", background: "rgba(255,255,255,0.04)", border: `0.5px solid ${T.border}`, borderRadius: T.radiusSm, color: T.textSecondary, fontSize: 11, cursor: "pointer", fontFamily: T.fontFamily, letterSpacing: "0.06em" }}
              >
                Ir para Carteira →
              </button>
              {todosAtivos.length > 0 && (
                <button
                  onClick={abrirModal}
                  style={{ padding: "8px 14px", background: T.goldDim, border: `1px solid ${T.goldBorder}`, borderRadius: T.radiusSm, color: T.gold, fontSize: 11, cursor: "pointer", fontFamily: T.fontFamily, letterSpacing: "0.06em" }}
                >
                  + Vincular ativos
                </button>
              )}
            </div>
          </div>
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: `0.5px solid ${T.border}`,
            borderRadius: T.radiusMd,
            padding: "32px 24px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💼</div>
            <div style={{ fontSize: 14, color: T.textPrimary, marginBottom: 8, fontWeight: 500 }}>
              Nenhum ativo vinculado ainda
            </div>
            <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.8, marginBottom: 18 }}>
              {todosAtivos.length === 0
                ? <>Cadastre seus investimentos em <strong style={{ color: T.gold }}>Carteira</strong> e marque-os com o objetivo <strong>"{labelAtivo}"</strong> para visualizar o desempenho real aqui.</>
                : <>Você tem <strong style={{ color: T.textPrimary }}>{todosAtivos.length}</strong> ativo{todosAtivos.length > 1 ? "s" : ""} na carteira. Marque-os com o objetivo <strong>"{labelAtivo}"</strong> em <strong style={{ color: T.gold }}>Carteira</strong>, ou vincule aqui diretamente.</>
              }
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => navigate(`/cliente/${clienteId}/carteira`)}
                style={{ padding: "10px 18px", background: "rgba(255,255,255,0.04)", border: `0.5px solid ${T.border}`, borderRadius: T.radiusMd, color: T.textPrimary, fontSize: 12, cursor: "pointer", fontFamily: T.fontFamily, letterSpacing: "0.08em" }}
              >
                Ir para Carteira →
              </button>
              {todosAtivos.length > 0 && (
                <button
                  onClick={abrirModal}
                  style={{ padding: "10px 18px", background: T.goldDim, border: `1px solid ${T.goldBorder}`, borderRadius: T.radiusMd, color: T.gold, fontSize: 12, cursor: "pointer", fontFamily: T.fontFamily, letterSpacing: "0.08em" }}
                >
                  Vincular ativos da carteira
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ animation: "objFadeIn 0.32s ease forwards" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            Ativos Vinculados a Este Objetivo
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => navigate(`/cliente/${clienteId}/carteira`)}
              style={{ padding: "8px 14px", background: "rgba(255,255,255,0.04)", border: `0.5px solid ${T.border}`, borderRadius: T.radiusSm, color: T.textSecondary, fontSize: 11, cursor: "pointer", fontFamily: T.fontFamily, letterSpacing: "0.06em" }}
            >
              Ir para Carteira →
            </button>
            <button
              onClick={abrirModal}
              style={{ padding: "8px 14px", background: T.goldDim, border: `1px solid ${T.goldBorder}`, borderRadius: T.radiusSm, color: T.gold, fontSize: 11, cursor: "pointer", fontFamily: T.fontFamily, letterSpacing: "0.06em" }}
            >
              Gerenciar vínculos
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Total Vinculado", valor: brl(totalVinculado), color: corTipo },
            { label: "Ativos", valor: `${vinculados.length}`, color: T.textPrimary },
            { label: "Rent. Média 12m", valor: `${rentMedia12.toFixed(2)}%`, color: rentMedia12 >= 0 ? "#22c55e" : "#ef4444" },
            { label: "Rent. Média no Mês", valor: `${rentMediaMes.toFixed(2)}%`, color: rentMediaMes >= 0 ? "#22c55e" : "#ef4444" },
          ].map(({ label, valor, color }, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.025)",
              border: `0.5px solid ${T.border}`,
              borderRadius: T.radiusMd,
              padding: "14px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 8, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {label}
              </div>
              <div style={{ fontSize: 15, color, fontWeight: 600, lineHeight: 1.2 }}>
                {valor}
              </div>
            </div>
          ))}
        </div>

        {/* Tabela de ativos */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: `0.5px solid ${T.border}`,
          borderRadius: T.radiusMd,
          overflow: "hidden",
          marginBottom: 16,
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: `0.5px solid ${T.border}`, background: "rgba(255,255,255,0.025)" }}>
                  {[
                    { h: "Ativo", align: "left" },
                    { h: "Classe", align: "left" },
                    { h: "Valor", align: "right" },
                    { h: "% do Objetivo", align: "right" },
                    { h: "Rent. Mês", align: "right" },
                    { h: "Rent. 12m", align: "right" },
                    { h: "Vencimento", align: "right" },
                  ].map((c, i) => (
                    <th key={i} style={{
                      padding: "11px 14px",
                      textAlign: c.align,
                      fontSize: 10, color: T.textMuted, fontWeight: 500, letterSpacing: "0.08em",
                      whiteSpace: "nowrap",
                    }}>{c.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vinculados.map((a) => {
                  const pct = totalVinculado > 0 ? (a.valorReais / totalVinculado) * 100 : 0;
                  const rMes = parseFloat(String(a.rentMes || "0").replace(",", "."));
                  const rAno = parseFloat(String(a.rentAno || "0").replace(",", "."));
                  return (
                    <tr key={`${a.classeKey}-${a.id}`} style={{ borderBottom: `0.5px solid ${T.border}` }}>
                      <td style={{ padding: "12px 14px", fontSize: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 3, height: 22, borderRadius: 2, background: a.classeCor, flexShrink: 0 }} />
                          <div>
                            <div style={{ color: T.textPrimary, fontWeight: 500 }}>{a.nome || "Ativo sem nome"}</div>
                            {a.segmento && (
                              <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>{a.segmento}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 11, color: T.textSecondary, whiteSpace: "nowrap" }}>
                        {a.classeLabel}
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 12, textAlign: "right", color: T.textPrimary, fontWeight: 500, whiteSpace: "nowrap" }}>
                        {brl(a.valorReais)}
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 12, textAlign: "right", color: T.textSecondary, whiteSpace: "nowrap" }}>
                        {pct.toFixed(1)}%
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 12, textAlign: "right", whiteSpace: "nowrap" }}>
                        {a.rentMes
                          ? <span style={{ color: rMes >= 0 ? "#22c55e" : "#ef4444" }}>{rMes >= 0 ? "+" : ""}{rMes.toFixed(2)}%</span>
                          : <span style={{ color: T.textMuted }}>—</span>
                        }
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 12, textAlign: "right", whiteSpace: "nowrap" }}>
                        {a.rentAno
                          ? <span style={{ color: rAno >= 0 ? "#22c55e" : "#ef4444", fontWeight: 500 }}>{rAno >= 0 ? "+" : ""}{rAno.toFixed(2)}%</span>
                          : <span style={{ color: T.textMuted }}>—</span>
                        }
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 11, textAlign: "right", color: a.vencimento ? T.textSecondary : T.textMuted, whiteSpace: "nowrap" }}>
                        {a.vencimento || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "rgba(255,255,255,0.025)", borderTop: `0.5px solid ${T.border}` }}>
                  <td style={{ padding: "12px 14px", fontSize: 11, color: T.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }} colSpan={2}>
                    Total do objetivo
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 13, textAlign: "right", color: corTipo, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {brl(totalVinculado)}
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 12, textAlign: "right", color: T.textMuted }}>100,0%</td>
                  <td style={{ padding: "12px 14px", fontSize: 12, textAlign: "right", color: rentMediaMes >= 0 ? "#22c55e" : "#ef4444", whiteSpace: "nowrap", fontWeight: 600 }}>
                    {rentMediaMes.toFixed(2)}%
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 12, textAlign: "right", color: rentMedia12 >= 0 ? "#22c55e" : "#ef4444", whiteSpace: "nowrap", fontWeight: 600 }}>
                    {rentMedia12.toFixed(2)}%
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div style={{
          padding: "12px 16px",
          background: "rgba(255,255,255,0.02)",
          border: `0.5px solid ${T.border}`,
          borderRadius: T.radiusMd,
          fontSize: 11,
          color: T.textMuted,
          lineHeight: 1.7,
        }}>
          Médias ponderadas pelo valor de cada ativo. Os percentuais de rentabilidade refletem o que você cadastrou na <strong style={{ color: T.textSecondary }}>Carteira</strong> — <span onClick={() => navigate(`/cliente/${clienteId}/carteira`)} style={{ color: T.gold, cursor: "pointer", textDecoration: "underline" }}>abrir carteira</span> para atualizar. Marcar um ativo com o objetivo <strong>"{labelAtivo}"</strong> o vincula automaticamente aqui.
        </div>
      </div>
    );
  };

  // ── MODAL: vincular ativos ──
  const ModalVincularAtivos = () => {
    if (!modalAtivos) return null;
    const carteira = cliente?.carteira || {};
    const todos = listarAtivosCarteira(carteira);
    const labelAtivo = TIPO_OBJETIVO_PARA_LABEL[objetivo.tipo];
    const total = todos.reduce((acc, a) => {
      const k = `${a.classeKey}::${a.id}`;
      return acc + (selecaoAtivos.has(k) ? a.valorReais : 0);
    }, 0);

    function toggle(a) {
      const k = `${a.classeKey}::${a.id}`;
      const n = new Set(selecaoAtivos);
      if (n.has(k)) n.delete(k); else n.add(k);
      setSelecaoAtivos(n);
    }

    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 620,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
        onClick={() => !salvandoAtivos && setModalAtivos(false)}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: T.bgCard, border: `0.5px solid ${T.border}`, borderRadius: T.radiusLg,
            width: 560, maxWidth: "100%", maxHeight: "86vh",
            display: "flex", flexDirection: "column",
          }}
        >
          <div style={{ padding: "18px 22px", borderBottom: `0.5px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.gold, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
              Vincular ativos
            </div>
            <div style={{ fontSize: 16, color: T.textPrimary, fontWeight: 500, marginBottom: 4 }}>
              {objetivo.nomeCustom || objetivo.label}
            </div>
            <div style={{ fontSize: 11, color: T.textSecondary, lineHeight: 1.6 }}>
              Selecione os ativos da carteira que compõem o patrimônio deste objetivo.
              Serão marcados com o rótulo "{labelAtivo}".
            </div>
          </div>

          <div style={{ padding: "14px 22px", overflowY: "auto", flex: 1 }}>
            {todos.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 20px", fontSize: 12, color: T.textMuted, lineHeight: 1.7 }}>
                Nenhum ativo cadastrado na carteira.<br />
                Vá em "Carteira" e cadastre seus investimentos primeiro.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {todos.map(a => {
                  const k = `${a.classeKey}::${a.id}`;
                  const marcado = selecaoAtivos.has(k);
                  const jaTemOutro = a.objetivo && a.objetivo !== labelAtivo;
                  return (
                    <div
                      key={k}
                      onClick={() => toggle(a)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 12px",
                        background: marcado ? "rgba(240,162,2,0.08)" : "rgba(255,255,255,0.02)",
                        border: marcado ? `0.5px solid ${T.goldBorder}` : `0.5px solid ${T.border}`,
                        borderRadius: T.radiusSm,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: 4,
                        background: marcado ? T.gold : "transparent",
                        border: marcado ? `1px solid ${T.gold}` : `1px solid ${T.textMuted}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, color: T.bg, fontSize: 11, fontWeight: 700,
                      }}>
                        {marcado ? "✓" : ""}
                      </div>
                      <div style={{ width: 4, height: 22, borderRadius: 2, background: a.classeCor, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: T.textPrimary, fontWeight: 500, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {a.nome || "Ativo sem nome"}
                        </div>
                        <div style={{ fontSize: 10, color: T.textMuted, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span>{a.classeLabel}</span>
                          {jaTemOutro && <span style={{ color: T.warning }}>· vinculado a "{a.objetivo}"</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: marcado ? T.gold : T.textSecondary, fontWeight: 600, flexShrink: 0 }}>
                        {brl(a.valorReais)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ padding: "14px 22px", borderTop: `0.5px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, color: T.textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {selecaoAtivos.size} {selecaoAtivos.size === 1 ? "ativo" : "ativos"} · total
              </div>
              <div style={{ fontSize: 15, color: T.gold, fontWeight: 600 }}>{brl(total)}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={salvandoAtivos}
                onClick={() => setModalAtivos(false)}
                style={{ padding: "10px 16px", background: "none", border: `0.5px solid ${T.border}`, borderRadius: T.radiusMd, color: T.textSecondary, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", fontFamily: T.fontFamily }}
              >
                Cancelar
              </button>
              <button
                disabled={salvandoAtivos}
                onClick={() => salvarVinculoAtivos(selecaoAtivos)}
                style={{ padding: "10px 20px", background: T.goldDim, border: `1px solid ${T.goldBorder}`, borderRadius: T.radiusMd, color: T.gold, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", fontFamily: T.fontFamily, fontWeight: 600 }}
              >
                {salvandoAtivos ? "Salvando..." : "Salvar vínculos"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.fontFamily }}>
      <style>{`
        @keyframes objFadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <Navbar />

      {/* Botão voltar flutuante */}
      <button
        onClick={() => navigate(-1)}
        style={{
          position: "fixed",
          top: "50%",
          left: 16,
          transform: "translateY(-50%)",
          width: 44,
          height: 44,
          borderRadius: 22,
          border: "1px solid rgba(240,162,2,0.3)",
          background: "rgba(240,162,2,0.15)",
          color: "#F0A202",
          fontSize: 20,
          cursor: "pointer",
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.3s ease",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          fontFamily: T.fontFamily,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = "translateY(-50%) scale(1.15)";
          e.currentTarget.style.background = "rgba(240,162,2,0.25)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = "translateY(-50%) scale(1)";
          e.currentTarget.style.background = "rgba(240,162,2,0.15)";
        }}
      >
        ←
      </button>

      <div style={{ padding: "20px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>

          <Cabecalho />
          <Abas />

          {abaAtiva === "resumo" && <Resumo />}
          {abaAtiva === "simulador" && <Planos />}
          {abaAtiva === "acompanhamento" && <Acompanhamento />}
          {abaAtiva === "ativos" && <Ativos />}
        </div>
      </div>
      <ModalVincularAtivos />
    </div>
  );
}
