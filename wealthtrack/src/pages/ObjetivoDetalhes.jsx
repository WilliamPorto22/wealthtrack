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
  liquidez: "🛟",
  carro: "🚗",
  oportunidade: "🎯",
  viagem: "✈️",
  educacao: "📚",
  saude: "💪",
  sucessaoPatrimonial: "👨‍👩‍👧‍👦",
  seguros: "🛡️",
  planoSaude: "❤️‍🩹",
  personalizado: "⭐"
};

const gradientsPorTipo = {
  aposentadoria:       "linear-gradient(145deg, #2a1f00 0%, #3d2e00 60%, rgba(255,202,58,0.18) 100%)",
  imovel:              "linear-gradient(145deg, #0f2006 0%, #1a360a 60%, rgba(138,201,38,0.18) 100%)",
  liquidez:            "linear-gradient(145deg, #012218 0%, #023826 60%, rgba(74,222,128,0.18) 100%)",
  carro:               "linear-gradient(145deg, #2a0e00 0%, #3d1800 60%, rgba(255,107,53,0.18) 100%)",
  oportunidade:        "linear-gradient(145deg, #021e26 0%, #03313e 60%, rgba(6,182,212,0.18) 100%)",
  viagem:              "linear-gradient(145deg, #042522 0%, #0a3430 60%, rgba(93,217,193,0.18) 100%)",
  educacao:            "linear-gradient(145deg, #061c32 0%, #0d2a48 60%, rgba(34,116,165,0.18) 100%)",
  saude:               "linear-gradient(145deg, #041626 0%, #082238 60%, rgba(25,130,196,0.18) 100%)",
  sucessaoPatrimonial: "linear-gradient(145deg, #0c0820 0%, #160f30 60%, rgba(106,76,147,0.18) 100%)",
  seguros:             "linear-gradient(145deg, #2a0a0a 0%, #3d1010 60%, rgba(239,68,68,0.18) 100%)",
  planoSaude:          "linear-gradient(145deg, #2a0c1b 0%, #3d1026 60%, rgba(236,72,153,0.18) 100%)",
  personalizado:       "linear-gradient(145deg, #001f10 0%, #003218 60%, rgba(0,204,102,0.18) 100%)",
};

const coresPorTipo = {
  aposentadoria: "#F0A202",
  imovel: "#8AC926",
  liquidez: "#4ADE80",
  carro: "#FF6B35",
  oportunidade: "#06B6D4",
  viagem: "#5DD9C1",
  educacao: "#2274A5",
  saude: "#1982C4",
  sucessaoPatrimonial: "#6A4C93",
  seguros: "#EF4444",
  planoSaude: "#EC4899",
  personalizado: "#00CC66",
};

const labelTipoPorTipo = {
  aposentadoria: "Aposentadoria",
  imovel: "Aquisição de Imóvel",
  liquidez: "Reserva de Emergência",
  carro: "Veículo",
  oportunidade: "Reserva de Oportunidade",
  viagem: "Viagem",
  educacao: "Educação",
  saude: "Saúde",
  sucessaoPatrimonial: "Sucessão Patrimonial",
  seguros: "Seguros",
  planoSaude: "Plano de Saúde",
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
  const [confirmTransferAtivo, setConfirmTransferAtivo] = useState(null);

  // Edição do objetivo (meta, aporte, prazo, patrimônio, nome)
  const [editandoObj, setEditandoObj] = useState(false);
  const [formEditObj, setFormEditObj] = useState({});
  const [salvandoEditObj, setSalvandoEditObj] = useState(false);

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

  const carteiraPrincipal = cliente?.carteira || {};
  const ativosVinculadosHeader = ativosDoObjetivo(carteiraPrincipal, objetivo.tipo);
  const totalVinculadoHeader = ativosVinculadosHeader.reduce((s, a) => s + (a.valorReais || 0), 0);
  const inicial = objetivo.patrimSource === "ativos" && totalVinculadoHeader > 0
    ? totalVinculadoHeader
    : parseCentavos(objetivo.patrimAtual) / 100;
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

  // Rentabilidade da carteira (anual → mensal)
  const rentCarteiraAnual = parseFloat(
    cliente?.carteira?.rentabilidadeCalculada || cliente?.carteira?.rentabilidade || "0"
  ) || null;
  const rentCarteiraMensal = rentCarteiraAnual !== null && rentCarteiraAnual !== 0
    ? (Math.pow(1 + rentCarteiraAnual / 100, 1 / 12) - 1) * 100
    : null;

  // Média do histórico de acompanhamento (últimos 12 meses)
  const hoje = new Date();
  const doze = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
  const historico12 = historico.filter(h => {
    if (!h.mesAno) return false;
    const [mm, yyyy] = h.mesAno.split("/");
    return new Date(parseInt(yyyy), parseInt(mm) - 1, 1) >= doze;
  });
  const rentabilidadeMediaHistorico = historico12.length > 0
    ? historico12.reduce((s, h) => s + (h.rentabilidadeCarteira || 0), 0) / historico12.length
    : historico.length > 0
      ? historico.reduce((s, h) => s + (h.rentabilidadeCarteira || 0), 0) / historico.length
      : null;

  // Fonte preferida: carteira (se existir), senão historico acompanhamento
  const rentRealizadaFinal = rentCarteiraMensal ?? rentabilidadeMediaHistorico;
  const rentRealizadaFonte = rentCarteiraMensal !== null ? "carteira" : rentabilidadeMediaHistorico !== null ? "historico" : null;

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

  function abrirEdicaoObj() {
    setFormEditObj({
      nomeCustom: objetivo.nomeCustom || "",
      meta: objetivo.meta || "",
      rendaMensal: objetivo.rendaMensal || "",
      patrimAtual: objetivo.patrimAtual || "",
      aporte: objetivo.aporte || "",
      prazo: objetivo.prazo || "",
    });
    setEditandoObj(true);
  }

  async function salvarEdicaoObj() {
    const metaCent = parseCentavos(formEditObj.meta);
    const aporteCent = parseCentavos(formEditObj.aporte);
    const prazoN = parseInt(formEditObj.prazo) || 0;
    if (metaCent <= 0 || aporteCent <= 0 || prazoN <= 0) return;
    if (objetivo.tipo === "personalizado" && !String(formEditObj.nomeCustom || "").trim()) return;
    if (objetivo.patrimSource !== "ativos" && parseCentavos(formEditObj.patrimAtual) <= 0) return;

    setSalvandoEditObj(true);
    try {
      const snap = await getDoc(doc(db, "clientes", clienteId));
      if (snap.exists()) {
        const dados = snap.data();
        const objs = [...(dados.objetivos || [])];
        const idx = parseInt(objetivoIndex);
        objs[idx] = {
          ...objs[idx],
          nomeCustom: formEditObj.nomeCustom || objs[idx].nomeCustom || "",
          meta: String(metaCent),
          rendaMensal: formEditObj.rendaMensal ? String(parseCentavos(formEditObj.rendaMensal)) : objs[idx].rendaMensal,
          patrimAtual: String(parseCentavos(formEditObj.patrimAtual)),
          aporte: String(aporteCent),
          prazo: String(prazoN),
        };
        await setDoc(doc(db, "clientes", clienteId), { ...dados, objetivos: objs });
        setObjetivo(objs[idx]);
        setCliente({ ...dados, objetivos: objs });
        setEditandoObj(false);
      }
    } catch (e) {
      console.error("Erro ao salvar edição do objetivo:", e);
    }
    setSalvandoEditObj(false);
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
        <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <div>
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
          <button
            onClick={abrirEdicaoObj}
            style={{
              fontSize: 11,
              padding: "7px 14px",
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 20,
              cursor: "pointer",
              fontFamily: T.fontFamily,
              letterSpacing: "0.06em",
              fontWeight: 500,
            }}
          >
            Editar objetivo
          </button>
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
    const rentRealizada = rentRealizadaFinal;
    const diferencaRent = rentRealizada !== null ? rentRealizada - rentMetaMensal : null;

    const infoPorTipo = {
      aposentadoria: {
        headline: "Independência Financeira",
        descricao: (<>{`Acumular ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para viver de renda passiva.`}<br />{`Meta de ${TAXA_ANUAL}% a.a. real sobre aportes de ${brl(aporte)}/mês.`}</>),
        insight: status === "viavel"
          ? `No caminho certo. Meta em ${anosNec} anos — renda final estimada: ${brl(projecao.at(-1)?.rendaMensalReal)}.`
          : `Para atingir ${brl(meta)} em ${prazo} anos, ajuste aporte ou prazo nas Estratégias.`,
      },
      imovel: {
        headline: "Aquisição do Imóvel",
        descricao: `Acumular ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para compra à vista ou entrada. Aporte: ${brl(aporte)}/mês.`,
        insight: status === "viavel"
          ? `Plano viável — projetado: ${brl(projecao.at(-1)?.totalReal)}.`
          : `Ajuste o plano na aba Estratégias.`,
      },
      liquidez: {
        headline: "Reserva de Emergência",
        descricao: `Reserva de ${brl(meta)} em ativos de alta liquidez para proteger o orçamento contra imprevistos (desemprego, saúde, reparos). Recomendação: 6 a 12 meses de custo de vida.`,
        insight: status === "viavel"
          ? `Reserva no caminho certo — meta alcançada em ${anosNec} anos mantendo ${brl(aporte)}/mês.`
          : `Priorize essa reserva — ela é a base de qualquer outro plano. Ajuste aportes nas Estratégias.`,
      },
      carro: {
        headline: "Aquisição do Veículo",
        descricao: `Acumular ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para compra à vista ou entrada expressiva.`,
        insight: status === "viavel"
          ? `No prazo — ${brl(meta)} em ${anosNec} anos.`
          : `Ajuste necessário — veja as Estratégias.`,
      },
      oportunidade: {
        headline: "Reserva de Oportunidade",
        descricao: `Capital de ${brl(meta)} mantido líquido e acessível para capturar oportunidades de investimento (quedas de mercado, ativos descontados, negócios pontuais).`,
        insight: status === "viavel"
          ? `Reserva viável em ${anosNec} anos — posicionamento estratégico preservado.`
          : `Ajuste o aporte para montar a reserva dentro do prazo — veja as Estratégias.`,
      },
      viagem: {
        headline: "Viagem dos Sonhos",
        descricao: `Acumular ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para realizar a viagem planejada.`,
        insight: status === "viavel"
          ? `Plano viável — projetado: ${brl(projecao.at(-1)?.totalReal)}.`
          : `Ajuste necessário — veja as Estratégias.`,
      },
      educacao: {
        headline: "Educação",
        descricao: `Acumular ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para custear a formação planejada.`,
        insight: status === "viavel"
          ? `No prazo — projetado: ${brl(projecao.at(-1)?.totalReal)}.`
          : `Ajuste necessário — veja as Estratégias.`,
      },
      saude: {
        headline: "Saúde e Qualidade de Vida",
        descricao: `Acumular ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para cobrir despesas com saúde e bem-estar.`,
        insight: status === "viavel"
          ? `Plano viável — projetado: ${brl(projecao.at(-1)?.totalReal)}.`
          : `Ajuste necessário — veja as Estratégias.`,
      },
      sucessaoPatrimonial: {
        headline: "Sucessão Patrimonial",
        descricao: `Estruturar ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para transmissão eficiente do patrimônio, com mínima carga tributária.`,
        insight: `Horizonte de ${prazo} anos para estruturar instrumentos sucessórios com máxima eficiência fiscal.`,
      },
      seguros: {
        headline: "Proteção — Seguro de Vida e Veículos",
        descricao: `Reservar ${brl(meta)}/ano em prêmios para seguros de vida e de veículos, blindando o patrimônio e a renda da família contra eventos graves.`,
        insight: status === "viavel"
          ? `Orçamento de proteção no caminho certo — ${brl(aporte)}/mês cobrem os prêmios planejados.`
          : `Ajuste o orçamento de prêmios — proteção subdimensionada expõe o patrimônio. Veja as Estratégias.`,
      },
      planoSaude: {
        headline: "Plano de Saúde",
        descricao: `Provisionar ${brl(meta)} em ${prazo} ${prazo === 1 ? "ano" : "anos"} para custear o plano de saúde e coberturas complementares da família.`,
        insight: status === "viavel"
          ? `Provisão no caminho certo — ${brl(aporte)}/mês bancam as mensalidades e reajustes.`
          : `O custo do plano tende a crescer acima da inflação — revise o aporte nas Estratégias.`,
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
          <div style={{ textAlign: "center" }}>
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

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 8, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>
              Rent. Realizada (carteira)
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
              {rentRealizadaFonte === "carteira" ? "Média da carteira (a.m.)" : rentRealizadaFonte === "historico" ? "Média do acompanhamento" : "Sem dados na carteira"}
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
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

          <div style={{ textAlign: "center" }}>
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
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 28,
        }}>
          {[
            { label: "Patrimônio Necessário", valor: brl(meta), destaque: false },
            { label: "Patrimônio Atual", valor: brl(inicial), destaque: false },
            { label: "Aporte Mensal", valor: brl(aporte), destaque: false },
            { label: "Prazo Desejado", valor: `${prazo} ${prazo === 1 ? "ano" : "anos"}`, destaque: false },
            { label: "Prazo Necessário", valor: anosNec ? `${anosNec} anos` : "50+ anos", destaque: true, cor: cor },
            { label: "Meta de Rentabilidade", valor: `${TAXA_ANUAL}% a.a.`, destaque: false },
            { label: "IPCA Atual", valor: `${ipca.toFixed(2)}% a.a.`, destaque: false },
            { label: "Renda Mensal ao Final", valor: projecao.length > 0 ? brl(projecao[projecao.length - 1]?.rendaMensalReal) : "—", destaque: false },
          ].map(({ label, valor, destaque, cor: corCard }, i) => (
            <div key={i} style={{
              background: destaque ? `${corCard}10` : "rgba(255,255,255,0.025)",
              border: `0.5px solid ${destaque ? corCard + "40" : T.border}`,
              borderRadius: T.radiusMd,
              padding: "16px 18px",
            }}>
              <div style={{ fontSize: 9, color: destaque ? corCard : T.textMuted, marginBottom: 8, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500 }}>
                {label}
              </div>
              <div style={{ fontSize: 16, color: destaque ? corCard : T.textPrimary, fontWeight: 600, lineHeight: 1.2 }}>
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
              descricao: "A composição da carteira é o principal determinante do retorno real no longo prazo — uma alocação bem estruturada pode somar 2 a 4 p.p. ao ano sem elevar proporcionalmente o risco.",
              itens: [
                "Tesouro IPCA+: núcleo da carteira com rentabilidade real garantida, protegendo o poder de compra",
                "PGBL regressivo: dedução de até 12% da renda bruta gera liquidez reinvestível e potencializa juros compostos",
                "FIIs de tijolo: renda mensal isenta de IR com histórico de rendimento real positivo no longo prazo",
                "Ações pagadoras de dividendos: proteção contra inflação e crescimento real do patrimônio",
                "LCI/LCA: liquidez isenta de IR para rebalanceamentos periódicos sem impacto tributário"
              ]
            },
            {
              numero: "04",
              codigo: "TR",
              titulo: "Eficiência Tributária",
              subtitulo: "Planejamento Fiscal",
              cor: "#22c55e",
              descricao: "Reduzir a alíquota efetiva de IR equivale a ganho direto de rentabilidade líquida, sem maior risco — pode somar 1 a 3 p.p. de retorno ao ano.",
              itens: [
                "VGBL regressivo: IR sobre rendimentos cai de 35% para 10% após 10 anos — a menor tributação do sistema",
                "Ativos isentos: LCI, LCA, dividendos, FIIs e CRI/CRA formam a camada fiscalmente mais eficiente",
                "Compensação de perdas em renda variável: abate prejuízos anteriores de ganhos futuros",
                "Revisão anual do modelo de declaração: completo vs. simplificado pode mudar o resultado",
                "Planejamento de resgates previdenciários: mantém a menor alíquota possível na distribuição"
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
              descricao: "Instrumento de menor custo para aquisição a prazo — sem juros, apenas taxa de administração. Economia de 20% a 40% vs. financiamento.",
              destaque: `Parcela estimada: ${brl(parcelaConsorcio)}/mês por ${prazoConsorcio * 12} meses`,
              itens: [
                `${brl(meta)} de crédito com taxa de administração de ~1,5%, sem juros sobre o capital`,
                "Lance próprio antecipa a contemplação a qualquer mês, independente do sorteio",
                "Verifique o histórico de contemplações do grupo — grupos mais antigos contemplam mais",
                "Confirme o registro da administradora no Banco Central antes de aderir"
              ]
            },
            {
              numero: "04",
              codigo: "CF",
              titulo: "Financiamento com Análise de CET",
              subtitulo: "Aquisição Imediata",
              cor: "#2274A5",
              descricao: "Disponibilidade imediata, mas o CET pode somar 20% a 80% do valor do bem em encargos. Análise criteriosa é indispensável.",
              destaque: `Entrada: ${brl(entrada)} + ${brl(parcelaFin)}/mês (60x)`,
              itens: [
                "Compare sempre o CET anual entre bancos, financeiras e montadoras — a taxa nominal engana",
                "Entrada recomendada: 20% a 30% do valor — reduz prazo e juros totais",
                "Débito automático na instituição do salário reduz 0,3% a 0,5% a.m. na taxa",
                "CDC: exerça o direito à liquidação antecipada com abatimento proporcional de juros",
                "Evite prazos acima de 48 meses — depreciação tende a superar o saldo devedor"
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
              descricao: "Menor CET para aquisição a prazo — sem juros, apenas taxa de administração. Economia vs. financiamento pode superar 40% do valor do bem.",
              destaque: `Parcela estimada: ${brl(parcelaConsorcioIm)}/mês por ${prazoConsorcioIm} anos`,
              itens: [
                `${brl(meta)} de crédito com taxa de administração de ~2%, sem juros sobre o capital`,
                "FGTS pode ser usado como lance para contemplação antecipada",
                "Lance livre: controla estrategicamente o momento do crédito",
                "Avalie rating ABAC e histórico de contemplações da administradora"
              ]
            },
            {
              numero: "04",
              codigo: "FI",
              titulo: "Financiamento Imobiliário",
              subtitulo: "Custo de Oportunidade",
              cor: "#1982C4",
              descricao: "Aquisição imediata, mas exige análise rigorosa do CET e do custo de oportunidade (vs. manter capital investido).",
              destaque: `Entrada: ${brl(entradaIm)} + ${brl(parcelaFinIm)}/mês (360x)`,
              itens: [
                "Compare o CET entre Caixa, bancos privados e cooperativas — a taxa nominal engana",
                "FGTS: use como entrada e em amortizações anuais para derrubar o saldo",
                "Tabela SAC é mais barata que Price — exige capacidade de pagamento maior no início",
                "Portabilidade de crédito: troque de banco por taxa menor, sem penalidade",
                "Capital excedente em Tesouro IPCA+ pode render mais que o custo do financiamento"
              ]
            }
          ];
        }

        case "sucessaoPatrimonial":
          return [
            {
              numero: "03",
              codigo: "PP",
              titulo: "Previdência Privada Sucessória",
              subtitulo: "Tributário e Sucessório",
              cor: "#6A4C93",
              descricao: "Instrumento mais eficiente para sucessão no Brasil: fora do inventário, liquidez em até 30 dias para o beneficiário e forte vantagem tributária.",
              itens: [
                "Fora do inventário: capital transmitido em até 30 dias, sem bloqueio judicial, sem ITCMD em muitos estados",
                "PGBL: dedução de até 12% da renda bruta tributável no IR — impacto imediato no fluxo de caixa",
                "Tabela regressiva: IR sobre rendimentos cai de 35% para 10% após 10 anos",
                "VGBL: tributa apenas o rendimento, ideal como complemento ao PGBL",
                "Decisões recentes reconhecem impenhorabilidade em execuções, protegendo a família"
              ]
            },
            {
              numero: "04",
              codigo: "SV",
              titulo: "Seguro de Vida com Capital Relevante",
              subtitulo: "Proteção e Liquidez",
              cor: "#1982C4",
              descricao: "Cria patrimônio imediato independente do acumulado — viabiliza ITCMD e custos de inventário sem venda forçada de ativos.",
              itens: [
                "Indenização isenta de IR (Art. 794 CC) — transmissão direta ao beneficiário",
                "Sem inventário: pagamento direto ao beneficiário cadastrado, liquidez imediata",
                "Cobertura recomendada: 10 a 20x a renda anual, mantendo padrão de vida da família",
                "Coberturas extras: invalidez, doenças graves (câncer, infarto, AVC), diária hospitalar",
                "Liquidez para o ITCMD, evitando venda forçada de imóveis ou participações"
              ]
            }
          ];

        case "liquidez":
          return [
            {
              numero: "03",
              codigo: "RE",
              titulo: "Composição da Reserva de Emergência",
              subtitulo: "Liquidez e Segurança",
              cor: "#4ADE80",
              descricao: "Reserva deve priorizar liquidez diária e preservação de capital — rentabilidade é secundária. Recomendação: 6 a 12 meses de custo de vida.",
              itens: [
                "Tesouro Selic: liquidez em D+1, risco soberano e rendimento próximo da taxa básica",
                "CDB de liquidez diária em banco grande, com FGC até R$ 250 mil por CPF/instituição",
                "Fundos DI com taxa baixa (até ~0,3% a.a.) e resgate em D+0 ou D+1",
                "Evite LCI/LCA nesta reserva — carência compromete a liquidez imediata",
                "Divida entre 2 a 3 instituições distintas para reduzir risco operacional"
              ]
            },
            {
              numero: "04",
              codigo: "DS",
              titulo: "Dimensionamento da Reserva",
              subtitulo: "Quanto Manter",
              cor: "#22c55e",
              descricao: "O tamanho ideal depende da estabilidade da renda, composição familiar e dependentes. CLT estável: 6 meses. Autônomo/PJ: 12 meses ou mais.",
              itens: [
                "Base de cálculo: custo fixo mensal essencial (não a renda) — moradia, alimentação, saúde, educação",
                "CLT estável: 6 meses de despesas como mínimo",
                "Autônomo, PJ ou renda variável: 9 a 12 meses pela volatilidade do fluxo",
                "Revise anualmente ou após mudanças grandes (casamento, filho, troca de emprego)",
                "Depois de atingida, redirecione novos aportes para objetivos de crescimento"
              ]
            }
          ];

        case "oportunidade":
          return [
            {
              numero: "03",
              codigo: "RO",
              titulo: "Capital Tático para Oportunidades",
              subtitulo: "Liquidez Estratégica",
              cor: "#06B6D4",
              descricao: "Reserva separada da emergência — objetivo é capturar quedas de mercado, ativos descontados ou negócios pontuais. Líquida, mas com horizonte tático.",
              itens: [
                "Tesouro Selic e CDB liquidez diária: base para movimentação rápida quando surgir oportunidade",
                "Dimensionamento: 5% a 15% do patrimônio líquido, conforme perfil e convicção",
                "Mantenha separada da reserva de emergência — funções e gatilhos distintos",
                "Defina critérios objetivos para uso (queda X% do índice, múltiplo descontado, evento)",
                "Evite alocar em ativos voláteis — a oportunidade exige liquidez no momento certo"
              ]
            },
            {
              numero: "04",
              codigo: "GE",
              titulo: "Regras de Uso e Recomposição",
              subtitulo: "Disciplina de Execução",
              cor: "#22c55e",
              descricao: "Sem regras claras, a reserva vira gasto ou ansiedade. Critério documentado separa decisão racional de impulso.",
              itens: [
                "Documente gatilhos de entrada antes da oportunidade aparecer — evita viés emocional",
                "Use em tranches (1/3, 1/3, 1/3) em vez de tudo de uma vez quando a queda se aprofundar",
                "Defina teto de uso por oportunidade — não concentre todo o capital em um único ativo",
                "Recomponha a reserva após uso com aportes dedicados até voltar ao dimensionamento",
                "Reveja critérios e tamanho da reserva uma vez por ano"
              ]
            }
          ];

        case "seguros":
          return [
            {
              numero: "03",
              codigo: "SV",
              titulo: "Seguro de Vida",
              subtitulo: "Proteção da Renda Familiar",
              cor: "#EF4444",
              descricao: "Protege a renda da família no caso de morte ou invalidez do provedor — referência: 10 a 20x a renda anual do titular.",
              itens: [
                "Capital segurado: 10 a 20x a renda anual permite 5 a 10 anos de padrão de vida mantido",
                "Coberturas extras: invalidez por acidente/doença, doenças graves (câncer, AVC, infarto), diária hospitalar",
                "Indenização é isenta de IR para beneficiários (Art. 794 CC) e não entra no inventário",
                "Reveja capital a cada evento relevante — casamento, filho, novo imóvel financiado",
                "Compare prêmios anualmente — concorrência do mercado costuma reduzir custo da renovação"
              ]
            },
            {
              numero: "04",
              codigo: "SA",
              titulo: "Seguro de Veículos",
              subtitulo: "Proteção Patrimonial",
              cor: "#FF6B35",
              descricao: "Protege patrimônio (veículo, terceiros) contra eventos de alto impacto financeiro. Franquia e coberturas determinam o prêmio.",
              itens: [
                "Cobertura de terceiros (RCF): fundamental — danos a terceiros podem superar o valor do veículo",
                "Escolha franquia compatível com o caixa — franquia alta derruba o prêmio, mas exige liquidez no sinistro",
                "Coberturas adicionais: vidros, carro reserva, assistência 24h — avalie custo-benefício",
                "Perfil (garagem, kilometragem, condutor) impacta o prêmio — mantenha dados atualizados",
                "Cote ao menos 3 seguradoras todo ano na renovação — diferenças de 20% a 40% são comuns"
              ]
            }
          ];

        case "planoSaude":
          return [
            {
              numero: "03",
              codigo: "PS",
              titulo: "Escolha e Estrutura do Plano",
              subtitulo: "Custo vs. Cobertura",
              cor: "#EC4899",
              descricao: "Plano de saúde é o segundo maior custo familiar depois da moradia. Estruturação correta reduz prêmio sem perder cobertura crítica.",
              itens: [
                "Avalie ao menos 3 operadoras e compare hospitais/médicos efetivamente usados pela família",
                "Plano coletivo por adesão costuma ser mais barato que individual, mas tem reajuste menos regulado",
                "Coparticipação reduz mensalidade, mas exige reserva para cobrir os eventos",
                "Acomodação enfermaria vs. apartamento: diferença de 20% a 40% no prêmio",
                "Cobertura geográfica (nacional/regional) — pague só pelo que a família usa"
              ]
            },
            {
              numero: "04",
              codigo: "RJ",
              titulo: "Reajustes e Previsibilidade",
              subtitulo: "Custo de Longo Prazo",
              cor: "#1982C4",
              descricao: "Reajuste anual de planos historicamente supera IPCA em 3 a 6 p.p. — o orçamento precisa antecipar essa inflação setorial.",
              itens: [
                "Projete aportes crescendo ~10% a.a. — a inflação médica supera a geral",
                "Faixa etária (a cada 5 anos) provoca reajustes adicionais, especialmente após os 59 anos",
                "Avalie seguro saúde (reembolso) vs. plano de rede como alternativa em fases específicas",
                "Para idosos, considere previdência privada dedicada para bancar a mensalidade",
                "Revisão anual do contrato — reajuste abusivo pode ser contestado ou levado à ANS"
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
            Baseado nos dados do seu objetivo e nas melhores práticas de planejamento financeiro,
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
              ? "Plano no caminho certo. Incremento adicional amplia margem de segurança e antecipa a conquista do objetivo."
              : `Para alcançar ${brl(meta)} em ${prazo} anos a ${TAXA_ANUAL}% a.a., o aporte necessário está abaixo — rota mais direta no prazo original.`
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
              ? `Aumento necessário: ${brl(aumentoNecessario)}/mês (+${percentualAumento}% sobre o aporte atual)`
              : "Aporte dentro do planejamento — mantenha consistência e revisões anuais",
            "Automatize o débito no dia do salário — elimina o viés de postergação",
            "Reajuste o aporte pelo IPCA anualmente para preservar o poder de compra",
            "Direcione 13º, bônus, PLR e restituição de IR integralmente ao objetivo",
            "A cada aumento de renda, comprometa 50%+ do incremento com o aporte"
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
              ? `Plano adiantado. Mantendo ${brl(aporte)}/mês, ${brl(meta)} em ${prazoEstendido} anos — antes do prazo original.`
              : prazoEstendido
              ? `Mantendo ${brl(aporte)}/mês, ${brl(meta)} é atingido no tempo abaixo — prazo maior potencializa os juros compostos.`
              : `Com o aporte atual, o objetivo leva 50+ anos. Extensão isolada não resolve — ajuste de aporte é indispensável.`
          }
          comparacao={prazoEstendido ? {
            antes: { label: "Prazo Desejado", valor: `${prazo} anos`, sub: `aporte de ${brl(aporte)}/mês` },
            depois: prazoEstendido <= prazo
              ? { label: "Chegará em", valor: `${prazoEstendido} anos`, sub: `${Math.round((prazo - prazoEstendido) * 10) / 10} anos antecipado` }
              : { label: "Prazo Real", valor: `${prazoEstendido} anos`, sub: `+${anosExtras} anos além do planejado` }
          } : null}
          itens={[
            prazoEstendido
              ? `Mantendo ${brl(aporte)}/mês, ${brl(meta)} é atingido em ${prazoEstendido} anos`
              : "Aporte insuficiente para qualquer horizonte razoável — ajustar contribuição é prioritário",
            "Prazo maior permite mais renda variável, historicamente superior em horizontes 5+ anos",
            "Combine extensão de prazo + aumento gradual de aporte — mais eficiente que cada uma isolada",
            "Defina marcos intermediários de patrimônio para monitorar e manter o comprometimento",
            "Adiar aportes tem custo assimétrico — cada ano de atraso exige esforço desproporcional depois"
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
          <span style={{ color: T.gold, fontWeight: 600, letterSpacing: "0.03em" }}>Nota:</span>
          {" "}As estratégias são baseadas nos dados informados e em boas práticas de planejamento financeiro. Para a decisão mais adequada ao seu caso, considere também seu perfil de risco, necessidade de liquidez e situação fiscal.
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
      } else if (isAtual && rentCarteiraMensal !== null) {
        statusMes = rentCarteiraMensal >= metaRentPct ? "meta_batida" : "nao_bateu";
      }
      const rentRealLinha = dadoHist?.rentabilidadeCarteira ?? (isAtual && rentCarteiraMensal !== null ? rentCarteiraMensal : null);
      linhas.push({
        mesAnoKey, mesLabel, isAtual, isFuturo, patrimonioAlvo,
        valorCarteira: dadoHist?.valorCarteira ?? (isAtual ? inicial : null),
        aporteRealizado: dadoHist?.aporteRealizado ?? null,
        rentReal: rentRealLinha,
        statusMes, temDados: !!dadoHist,
      });
    }

    const thS = { padding: "12px 14px", textAlign: "left", fontSize: 12, color: T.textMuted, fontWeight: 500, whiteSpace: "nowrap", borderRight: `0.5px solid ${T.border}` };
    const tdS = { padding: "11px 14px", fontSize: 13, color: T.textPrimary, borderRight: `0.5px solid ${T.border}`, whiteSpace: "nowrap" };

    function PillStatus({ s }) {
      if (!s) return <span style={{ color: T.textMuted, fontSize: 10 }}>—</span>;
      const map = {
        meta_batida: { icon: "✓", label: "Meta Batida", cor: "#22c55e", bg: "rgba(34,197,94,0.13)", border: "rgba(34,197,94,0.3)" },
        meta_parcial: { icon: "◐", label: "Parcial", cor: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.28)" },
        nao_bateu: { icon: "✕", label: "Não Bateu", cor: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.28)" },
      };
      const info = map[s];
      if (!info) return <span style={{ color: T.textMuted, fontSize: 10 }}>—</span>;
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "3px 10px 3px 6px", borderRadius: 20, background: info.bg, color: info.cor, fontWeight: 600, border: `0.5px solid ${info.border}`, whiteSpace: "nowrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: info.cor, color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{info.icon}</span>
          {info.label}
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
  // NOTE: chamado como função {ModalVincularAtivos()} para evitar unmount/remount ao mudar seleção
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

    const todosSelecionados = todos.length > 0 && todos.every(a => selecaoAtivos.has(`${a.classeKey}::${a.id}`));

    function selecionarTodos() {
      setSelecaoAtivos(new Set(todos.map(a => `${a.classeKey}::${a.id}`)));
    }
    function desmarcarTodos() {
      setSelecaoAtivos(new Set());
    }

    // Seções
    const livres = todos.filter(a => !a.objetivo);
    const desteMesmo = todos.filter(a => a.objetivo === labelAtivo);
    const outroObjetivo = todos.filter(a => a.objetivo && a.objetivo !== labelAtivo);

    const renderAtivo = (a, isOutro = false) => {
      const k = `${a.classeKey}::${a.id}`;
      const marcado = selecaoAtivos.has(k);
      return (
        <div
          key={k}
          onClick={() => {
            if (isOutro && !marcado) {
              setConfirmTransferAtivo(a);
            } else {
              toggle(a);
            }
          }}
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
            <div style={{ fontSize: 10, color: T.textMuted }}>
              {a.classeLabel}
            </div>
          </div>
          {isOutro && !marcado ? (
            <div style={{
              fontSize: 10, color: "#f59e0b", fontWeight: 600, flexShrink: 0,
              border: "0.5px solid rgba(245,158,11,0.4)", borderRadius: 4,
              padding: "3px 8px", letterSpacing: "0.04em", whiteSpace: "nowrap",
            }}>
              Editar objetivo
            </div>
          ) : (
            <div style={{ fontSize: 13, color: marcado ? T.gold : T.textSecondary, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>
              {brl(a.valorReais)}
            </div>
          )}
        </div>
      );
    };

    const Secao = ({ titulo, cor, ativos, isOutro }) => ativos.length === 0 ? null : (
      <div>
        <div style={{ fontSize: 9, color: cor, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>
          {titulo} ({ativos.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ativos.map(a => renderAtivo(a, isOutro))}
        </div>
      </div>
    );

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
            width: 580, maxWidth: "100%", maxHeight: "86vh",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* Header */}
          <div style={{ padding: "18px 22px", borderBottom: `0.5px solid ${T.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: T.gold, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
              Vincular ativos
            </div>
            <div style={{ fontSize: 16, color: T.textPrimary, fontWeight: 500, marginBottom: 6 }}>
              {objetivo.nomeCustom || objetivo.label}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 11, color: T.textSecondary }}>
                Selecione os ativos que compõem este objetivo.
              </div>
              {todos.length > 0 && (
                <button
                  onClick={todosSelecionados ? desmarcarTodos : selecionarTodos}
                  style={{
                    padding: "5px 12px", fontSize: 10, cursor: "pointer",
                    background: "rgba(255,255,255,0.05)", border: `0.5px solid ${T.border}`,
                    borderRadius: T.radiusSm, color: T.textSecondary, fontFamily: T.fontFamily,
                    letterSpacing: "0.06em", whiteSpace: "nowrap",
                  }}
                >
                  {todosSelecionados ? "Desmarcar todos" : "Selecionar todos"}
                </button>
              )}
            </div>
          </div>

          {/* Lista com scroll */}
          <div style={{ padding: "14px 22px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
            {todos.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 20px", fontSize: 12, color: T.textMuted, lineHeight: 1.7 }}>
                Nenhum ativo cadastrado na carteira.<br />
                Vá em "Carteira" e cadastre seus investimentos primeiro.
              </div>
            ) : (
              <>
                <Secao titulo="Sem objetivo vinculado" cor={T.textMuted} ativos={livres} isOutro={false} />
                <Secao titulo="Vinculados a este objetivo" cor={T.gold} ativos={desteMesmo} isOutro={false} />
                <Secao titulo="Vinculados a outro objetivo" cor="#f59e0b" ativos={outroObjetivo} isOutro={true} />
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "14px 22px", borderTop: `0.5px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexShrink: 0 }}>
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

        {/* Confirmação: transferir ativo de outro objetivo */}
        {confirmTransferAtivo && (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 630, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
            onClick={() => setConfirmTransferAtivo(null)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: T.bgCard, border: `0.5px solid ${T.border}`, borderRadius: T.radiusLg,
                width: 420, maxWidth: "100%", padding: "24px 24px 20px",
              }}
            >
              <div style={{ fontSize: 14, color: T.textPrimary, fontWeight: 600, marginBottom: 12 }}>
                Alterar objetivo deste ativo?
              </div>
              <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.8, marginBottom: 20 }}>
                <strong style={{ color: T.textPrimary }}>{confirmTransferAtivo.nome || "Ativo sem nome"}</strong><br />
                Atualmente vinculado a{" "}
                <strong style={{ color: "#f59e0b" }}>"{confirmTransferAtivo.objetivo}"</strong>.<br />
                Deseja transferir para{" "}
                <strong style={{ color: T.gold }}>"{TIPO_OBJETIVO_PARA_LABEL[objetivo.tipo]}"</strong>?
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setConfirmTransferAtivo(null)}
                  style={{ padding: "9px 16px", background: "none", border: `0.5px solid ${T.border}`, borderRadius: T.radiusMd, color: T.textSecondary, fontSize: 11, cursor: "pointer", fontFamily: T.fontFamily, letterSpacing: "0.06em" }}
                >
                  Não
                </button>
                <button
                  onClick={() => { toggle(confirmTransferAtivo); setConfirmTransferAtivo(null); }}
                  style={{ padding: "9px 18px", background: T.goldDim, border: `1px solid ${T.goldBorder}`, borderRadius: T.radiusMd, color: T.gold, fontSize: 11, cursor: "pointer", fontFamily: T.fontFamily, fontWeight: 600, letterSpacing: "0.06em" }}
                >
                  Sim, transferir
                </button>
              </div>
            </div>
          </div>
        )}
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
      {ModalVincularAtivos()}

      {/* Modal edição do objetivo */}
      {editandoObj && (() => {
        const metaCent = parseCentavos(formEditObj.meta);
        const aporteCent = parseCentavos(formEditObj.aporte);
        const patrimCent = parseCentavos(formEditObj.patrimAtual);
        const prazoN = parseInt(formEditObj.prazo) || 0;
        const faltaNome = objetivo.tipo === "personalizado" && !String(formEditObj.nomeCustom || "").trim();
        const precisaPatrim = objetivo.patrimSource !== "ativos";
        const invalido = metaCent <= 0 || aporteCent <= 0 || prazoN <= 0 || faltaNome || (precisaPatrim && patrimCent <= 0);

        const campoMoeda = (label, key, obs) => (
          <div style={{ marginBottom: 14 }}>
            <label style={{ ...C.label, display: "block", marginBottom: 6 }}>{label}</label>
            <input
              style={{ ...C.input, fontSize: 15, padding: "12px 14px" }}
              type="text"
              inputMode="numeric"
              placeholder="R$ 0"
              value={formEditObj[key] ? (parseCentavos(formEditObj[key]) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}
              onChange={e => {
                const centavos = parseCentavos(e.target.value);
                setFormEditObj(f => ({ ...f, [key]: String(centavos) }));
              }}
            />
            {obs && <div style={{ fontSize: 10, color: T.textMuted, marginTop: 5, lineHeight: 1.5 }}>{obs}</div>}
          </div>
        );

        return (
          <div
            onClick={() => !salvandoEditObj && setEditandoObj(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 200,
              background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 20, overflowY: "auto",
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: T.cardBg || "#111",
                border: `0.5px solid ${T.border}`,
                borderRadius: T.radiusLg || 16,
                padding: "28px 26px",
                maxWidth: 480, width: "100%",
                maxHeight: "90vh", overflowY: "auto",
                boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
              }}
            >
              <div style={{ fontSize: 30, textAlign: "center", marginBottom: 10, lineHeight: 1 }}>{emoji}</div>
              <div style={{ fontSize: 17, fontWeight: 400, color: T.textPrimary, textAlign: "center", marginBottom: 4, lineHeight: 1.3 }}>
                Editar objetivo
              </div>
              <div style={{ fontSize: 12, color: T.textSecondary, textAlign: "center", marginBottom: 22, lineHeight: 1.5 }}>
                Ajuste os valores para refinar o plano.
              </div>

              {objetivo.tipo === "personalizado" && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ ...C.label, display: "block", marginBottom: 6 }}>Nome do objetivo</label>
                  <input
                    style={{ ...C.input, fontSize: 14, padding: "12px 14px" }}
                    placeholder="Ex: Viagem para o Canadá"
                    value={formEditObj.nomeCustom || ""}
                    onChange={e => setFormEditObj(f => ({ ...f, nomeCustom: e.target.value }))}
                  />
                </div>
              )}

              {objetivo.tipo === "aposentadoria" && campoMoeda("Renda mensal desejada", "rendaMensal", "Ao alterar, a meta de patrimônio é recalculada automaticamente — ajuste abaixo se preferir.")}

              {campoMoeda("Meta (patrimônio total)", "meta")}

              {precisaPatrim
                ? campoMoeda("Patrimônio já acumulado", "patrimAtual", "Este objetivo usa valor manual. Para vincular ativos da carteira, use a aba Ativos.")
                : (
                  <div style={{ marginBottom: 14, padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: `0.5px solid ${T.border}`, borderRadius: T.radiusMd, fontSize: 11, color: T.textMuted, lineHeight: 1.6 }}>
                    Patrimônio vinculado a ativos da carteira. Para alterar a seleção, use a aba <b style={{ color: T.textSecondary }}>Ativos</b>.
                  </div>
                )
              }

              {campoMoeda("Aporte mensal", "aporte")}

              <div style={{ marginBottom: 20 }}>
                <label style={{ ...C.label, display: "block", marginBottom: 6 }}>Prazo (anos)</label>
                <input
                  style={{ ...C.input, fontSize: 15, padding: "12px 14px" }}
                  type="number"
                  placeholder="Ex: 10"
                  value={formEditObj.prazo || ""}
                  onChange={e => setFormEditObj(f => ({ ...f, prazo: e.target.value }))}
                />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setEditandoObj(false)}
                  disabled={salvandoEditObj}
                  style={{
                    flex: 1, padding: "12px 16px",
                    background: "transparent", border: `0.5px solid ${T.border}`,
                    borderRadius: T.radiusMd, color: T.textMuted,
                    fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
                    cursor: salvandoEditObj ? "not-allowed" : "pointer", fontFamily: T.fontFamily,
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarEdicaoObj}
                  disabled={invalido || salvandoEditObj}
                  style={{
                    flex: 1, padding: "12px 16px",
                    background: invalido ? "rgba(255,255,255,0.03)" : T.goldDim,
                    border: invalido ? `1px solid ${T.border}` : `1px solid ${T.goldBorder}`,
                    borderRadius: T.radiusMd,
                    color: invalido ? T.textMuted : T.gold,
                    fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
                    cursor: invalido || salvandoEditObj ? "not-allowed" : "pointer",
                    fontFamily: T.fontFamily,
                  }}
                >
                  {salvandoEditObj ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
