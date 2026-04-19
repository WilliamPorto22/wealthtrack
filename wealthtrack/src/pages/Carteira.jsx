import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Navbar } from "../components/Navbar";
import { T, C } from "../theme";
import { extractText, parseCarteiraFromText } from "../utils/documentParser";
import { AvatarIcon } from "./Dashboard";

// ══════════════════════════════════════════════════════════════
// UTIL
// ══════════════════════════════════════════════════════════════
const parseCentavos = (s) => parseInt(String(s || "0").replace(/\D/g, "")) || 0;
const brl = (v) => {
  const n = parseFloat(v) || 0;
  if (!n) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
};
const brlCompact = (v) => {
  const n = parseFloat(v) || 0;
  if (!n) return "—";
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
  if (n >= 1_000) return `R$ ${(n / 1_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
  return brl(n);
};
const pct = (v, d = 1) => (parseFloat(v) || 0).toFixed(d) + "%";
const newId = () => Date.now() + "_" + Math.random().toString(36).slice(2, 7);
const hexToRgb = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
};
const noSel = { userSelect: "none", WebkitUserSelect: "none" };
const hojeBr = () => new Date().toLocaleDateString("pt-BR");
const mesAtualStr = () => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

// ══════════════════════════════════════════════════════════════
// SCHEMA: classes, objetivos, segmentos
// (mantém compat com ativos.js e Objetivos.jsx)
// ══════════════════════════════════════════════════════════════
const GRUPOS = [
  {
    key: "nacional",
    label: "Renda Fixa e Variável Nacional",
    icon: "🇧🇷",
    cor: "#F0A202",
    classes: [
      { key: "posFixado",  label: "Renda Fixa Pós-Fixada", cor: "#2563eb", liq: "D+1" },
      { key: "ipca",       label: "Renda Fixa IPCA+",       cor: "#3b82f6", liq: "D+1" },
      { key: "preFixado",  label: "Renda Fixa Pré-Fixada",  cor: "#60a5fa", liq: "D+1" },
      { key: "acoes",      label: "Ações",                   cor: "#22c55e", liq: "D+2", temSegmento: true },
      { key: "fiis",       label: "Fundos Imobiliários",     cor: "#f59e0b", liq: "D+2", temSegmento: true },
      { key: "multi",      label: "Multimercado",            cor: "#a07020", liq: "D+30" },
    ],
  },
  {
    key: "previdencia",
    label: "Previdência Privada",
    icon: "🛡",
    cor: "#d97706",
    classes: [
      { key: "prevVGBL", label: "Previdência VGBL", cor: "#f59e0b", liq: "—" },
      { key: "prevPGBL", label: "Previdência PGBL", cor: "#d97706", liq: "—" },
    ],
  },
  {
    key: "global",
    label: "Investimentos Globais",
    icon: "🌎",
    cor: "#a855f7",
    classes: [
      { key: "globalEquities", label: "Global – Equities (R.V.)",    cor: "#a855f7", liq: "D+2" },
      { key: "globalTreasury", label: "Global – Treasury",           cor: "#c084fc", liq: "D+2" },
      { key: "globalFunds",    label: "Global – Mutual Funds",       cor: "#7c3aed", liq: "D+2" },
      { key: "globalBonds",    label: "Global – Bonds",              cor: "#9333ea", liq: "D+2" },
      { key: "global",         label: "Invest. Globais (Geral)",      cor: "#a855f7", liq: "D+2", legado: true },
    ],
  },
];
const CLASSES = GRUPOS.flatMap((g) => g.classes);
const classByKey = Object.fromEntries(CLASSES.map((c) => [c.key, c]));

const OBJETIVOS = [
  "Liquidez", "Reserva de oportunidade", "Aposentadoria", "Aquisição de Imóvel",
  "Compra de carro", "Viagem", "Educação", "Saúde", "Sucessão", "Outros",
];

const SEGMENTOS = {
  acoes: [
    "Setor Bancário", "Setor de Energia", "Setor de Consumo", "Setor de Mineração",
    "Setor de Agronegócio", "Setor de Tecnologia", "Setor de Saúde",
    "Setor de Saneamento", "Setor de Construção", "Setor Industrial", "ETF", "Outros",
  ],
  fiis: [
    "Galpão Logístico", "Laje Corporativa", "Shoppings", "Residencial",
    "Papéis (CRI/CRA)", "Fundo de Fundos", "Híbrido", "Hotel/Hotelaria", "Educacional", "Outros",
  ],
};

// ══════════════════════════════════════════════════════════════
// INPUTS (memoizados para não re-renderizar a cada tecla)
// ══════════════════════════════════════════════════════════════
const InputMoeda = memo(function InputMoeda({ initValue, onCommit, placeholder = "R$ 0,00", size = "md" }) {
  const [raw, setRaw] = useState(initValue || "");
  const fmt = (r) => {
    const n = parseInt(String(r || "0").replace(/\D/g, "")) || 0;
    if (!n) return "";
    return "R$ " + (n / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  };
  return (
    <input
      style={{
        ...C.input,
        fontSize: size === "sm" ? 12 : size === "lg" ? 16 : 13,
        padding: size === "sm" ? "10px 12px" : "12px 14px",
      }}
      placeholder={placeholder}
      value={fmt(raw)}
      onChange={(e) => {
        const novo = e.target.value.replace(/\D/g, "");
        setRaw(novo);
        onCommit(novo);
      }}
    />
  );
});

const InputTexto = memo(function InputTexto({ initValue, onCommit, placeholder = "", size = "md" }) {
  const [val, setVal] = useState(initValue || "");
  return (
    <input
      style={{
        ...C.input,
        fontSize: size === "sm" ? 12 : 13,
        padding: size === "sm" ? "10px 12px" : "12px 14px",
      }}
      placeholder={placeholder}
      value={val}
      onChange={(e) => { setVal(e.target.value); onCommit(e.target.value); }}
    />
  );
});

const InputPct = memo(function InputPct({ initValue, onCommit, placeholder = "0,00%" }) {
  const [val, setVal] = useState(initValue || "");
  return (
    <input
      style={{ ...C.input, fontSize: 12, padding: "10px 12px" }}
      placeholder={placeholder}
      value={val}
      onChange={(e) => { setVal(e.target.value); onCommit(e.target.value); }}
    />
  );
});

const InputDate = memo(function InputDate({ initValue, onCommit }) {
  const [val, setVal] = useState(initValue || "");
  return (
    <input
      type="date"
      style={{ ...C.input, fontSize: 12, padding: "10px 12px", colorScheme: "dark" }}
      value={val}
      onChange={(e) => { setVal(e.target.value); onCommit(e.target.value); }}
    />
  );
});

function Select({ value, onChange, options, placeholder = "—" }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        background: "rgba(255,255,255,0.04)",
        border: `0.5px solid ${T.border}`,
        borderRadius: T.radiusSm,
        color: value ? T.textPrimary : T.textMuted,
        fontSize: 12,
        padding: "10px 12px",
        fontFamily: T.fontFamily,
        cursor: "pointer",
        outline: "none",
        appearance: "none",
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>
          {typeof o === "string" ? o : o.label}
        </option>
      ))}
    </select>
  );
}

// ══════════════════════════════════════════════════════════════
// GRÁFICO DE PIZZA (donut SVG nativo)
// ══════════════════════════════════════════════════════════════
function GraficoPizza({ classesAtivas, total, onHover, hoverKey }) {
  if (total <= 0) {
    return (
      <div style={{
        width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center",
        color: T.textMuted, fontSize: 12, ...noSel,
      }}>
        Sem dados
      </div>
    );
  }
  let acc = 0;
  const fatias = classesAtivas
    .filter((c) => c.valor > 0)
    .map((c) => {
      const ang = (c.valor / total) * 360;
      const ini = acc;
      acc += ang;
      return { ...c, ang, ini, fim: ini + ang };
    });

  const cx = 110, cy = 110, r = 100, ri = 62;
  const toRad = (a) => ((a - 90) * Math.PI) / 180;
  const arc = (ini, fim) => {
    const x1 = cx + r * Math.cos(toRad(ini));
    const y1 = cy + r * Math.sin(toRad(ini));
    const x2 = cx + r * Math.cos(toRad(fim));
    const y2 = cy + r * Math.sin(toRad(fim));
    return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${fim - ini > 180 ? 1 : 0},1 ${x2},${y2} Z`;
  };

  const hovered = fatias.find((f) => f.key === hoverKey) || fatias[0];

  return (
    <svg width={220} height={220} style={{ filter: "drop-shadow(0 4px 20px rgba(240,162,2,0.08))" }}>
      {fatias.map((f) => (
        <path
          key={f.key}
          d={arc(f.ini, f.fim)}
          fill={f.cor}
          opacity={hoverKey ? (f.key === hoverKey ? 1 : 0.28) : 0.9}
          stroke={T.bg}
          strokeWidth={1.5}
          style={{ cursor: "pointer", transition: "opacity 0.2s" }}
          onMouseEnter={() => onHover?.(f.key)}
          onMouseLeave={() => onHover?.(null)}
        />
      ))}
      <circle cx={cx} cy={cy} r={ri} fill={T.bg} />
      <text x={cx} y={cy - 14} textAnchor="middle" fill={T.textMuted} fontSize={9} fontFamily={T.fontFamily} letterSpacing="0.12em">
        {hovered ? hovered.label.toUpperCase().slice(0, 16) : "PATRIMÔNIO"}
      </text>
      <text x={cx} y={cy + 6} textAnchor="middle" fill={T.gold} fontSize={18} fontFamily={T.fontFamily} fontWeight={300}>
        {brlCompact(hovered ? hovered.valor : total)}
      </text>
      <text x={cx} y={cy + 22} textAnchor="middle" fill={T.textMuted} fontSize={10} fontFamily={T.fontFamily}>
        {hovered ? `${Math.round((hovered.valor / total) * 100)}%` : "Total"}
      </text>
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
export default function Carteira() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [clienteNome, setClienteNome] = useState("");
  const [clienteAvatar, setClienteAvatar] = useState("homem");
  const [gastosMensais, setGastosMensais] = useState(0);
  const [reservaMeta, setReservaMeta] = useState(0);
  const [objetivosCliente, setObjetivosCliente] = useState([]);

  const formRef = useRef({});
  const [snap, setSnap] = useState({});
  const [carregou, setCarregou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [msg, setMsg] = useState("");
  const [uploadProgress, setUploadProgress] = useState(null);
  const [xpSummary, setXpSummary] = useState(null);

  // drill-down e editor
  const [classeAberta, setClasseAberta] = useState(null); // classKey
  const [ativoEditando, setAtivoEditando] = useState(null); // { classKey, idx } | "new-{classKey}"
  const [hoverFatia, setHoverFatia] = useState(null);

  // aporte rápido
  const [aporteModal, setAporteModal] = useState(false);

  const fileInputRef = useRef(null);

  // ─── Carregar ───────────────────────────────────────────────
  useEffect(() => {
    async function carregar() {
      const s = await getDoc(doc(db, "clientes", id));
      if (!s.exists()) { setCarregou(true); return; }
      const data = s.data();
      setClienteNome(data.nome || "");
      setClienteAvatar(data.avatar || "homem");
      const cats = ["moradia","alimentacao","educacao","cartoes","carro","saude","lazer","assinaturas","seguros","outros"];
      const gastosFluxo = cats.reduce((acc, k) => acc + parseCentavos(data.fluxo?.[k]) / 100, 0);
      const gastosManual = parseCentavos(data.gastosMensaisManual) / 100;
      const gastos = gastosManual || gastosFluxo;
      setGastosMensais(gastos);
      setReservaMeta(gastos * 6);
      setObjetivosCliente(data.objetivos || []);
      const carteira = data.carteira || {};
      formRef.current = { ...carteira };
      setSnap({ ...carteira });
      setCarregou(true);
    }
    carregar();
  }, [id]);

  const setFSnap = useCallback((k, v) => {
    formRef.current = { ...formRef.current, [k]: v };
    setSnap((p) => ({ ...p, [k]: v }));
  }, []);

  // ─── Gestão de ativos ───────────────────────────────────────
  const getAtivos = (classKey) => snap[classKey + "Ativos"] || [];
  const getClassTotal = (classKey) => {
    const ativos = snap[classKey + "Ativos"] || [];
    if (ativos.length > 0) return ativos.reduce((acc, a) => acc + parseCentavos(a.valor) / 100, 0);
    return parseCentavos(snap[classKey]) / 100;
  };

  function upsertAtivo(classKey, idx, dadosNovos) {
    const ativos = [...(snap[classKey + "Ativos"] || [])];
    if (idx === undefined || idx === null) {
      ativos.push({ id: newId(), nome: "", valor: "", objetivo: "", vencimento: "", rentMes: "", rentAno: "", segmento: "", ...dadosNovos });
    } else {
      ativos[idx] = { ...ativos[idx], ...dadosNovos };
    }
    setFSnap(classKey + "Ativos", ativos);
  }

  function removeAtivo(classKey, idx) {
    const ativos = [...(snap[classKey + "Ativos"] || [])];
    ativos.splice(idx, 1);
    setFSnap(classKey + "Ativos", ativos);
  }

  // move ativo entre classes (preserva id/dados) — usa formRef (sync) pra evitar race
  function moverAtivo(classKeyOrigem, idx, classKeyDestino, segmentoDestino) {
    if (classKeyOrigem === classKeyDestino) return;
    const fonte = formRef.current;
    const origem = [...(fonte[classKeyOrigem + "Ativos"] || [])];
    const ativo = origem[idx];
    if (!ativo) return;
    origem.splice(idx, 1);
    const destino = [...(fonte[classKeyDestino + "Ativos"] || [])];
    destino.push({ ...ativo, segmento: segmentoDestino !== undefined ? segmentoDestino : ativo.segmento });
    const novo = {
      ...fonte,
      [classKeyOrigem + "Ativos"]: origem,
      [classKeyDestino + "Ativos"]: destino,
    };
    formRef.current = novo;
    setSnap(novo);
  }

  // ─── Cálculos agregados ─────────────────────────────────────
  const {
    total, totalNacional, totalPrevidencia, totalGlobal,
    liquidezD1, liquidezObj,
    classesAtivas, todosAtivos, rentCalculada, rentExibir,
    aportesHistorico, aporteMesAtual, aporteMedio, aporteTotal,
    vinculoObjetivos,
  } = useMemo(() => {
    const totais = {};
    CLASSES.forEach((c) => { totais[c.key] = getClassTotal(c.key); });
    const total = CLASSES.reduce((acc, c) => acc + totais[c.key], 0);
    const totalNacional = GRUPOS[0].classes.reduce((a, c) => a + totais[c.key], 0);
    const totalPrevidencia = GRUPOS[1].classes.reduce((a, c) => a + totais[c.key], 0);
    const totalGlobal = GRUPOS[2].classes.reduce((a, c) => a + totais[c.key], 0);

    // Liquidez: se houver ativos com objetivo=Liquidez, usa; senão, Pós+IPCA+Pré
    const liquidezObj = CLASSES.reduce((acc, c) => {
      const ativos = snap[c.key + "Ativos"] || [];
      if (ativos.length > 0) {
        return acc + ativos.reduce((a, av) => a + ((av.objetivo || "") === "Liquidez" ? parseCentavos(av.valor) / 100 : 0), 0);
      }
      if ((snap[c.key + "Obj"] || "") === "Liquidez") return acc + totais[c.key];
      return acc;
    }, 0);
    const liquidezFallback = ["posFixado", "ipca", "preFixado"].reduce((acc, k) => acc + totais[k], 0);
    const liquidezD1 = liquidezObj > 0 ? liquidezObj : liquidezFallback;

    // Lista ordenada por valor
    const classesAtivas = CLASSES
      .filter((c) => totais[c.key] > 0)
      .map((c) => ({ ...c, valor: totais[c.key], grupo: GRUPOS.find(g => g.classes.includes(c))?.key }))
      .sort((a, b) => b.valor - a.valor);

    // Todos os ativos (flat) para stats
    const todosAtivos = CLASSES.flatMap((c) =>
      (snap[c.key + "Ativos"] || []).map((a) => ({ ...a, classeKey: c.key, classeLabel: c.label, classeCor: c.cor, valorReais: parseCentavos(a.valor) / 100 }))
    );

    // Rentabilidade calculada (média ponderada dos rentAno preenchidos)
    const ponderados = todosAtivos.filter((a) => parseFloat(String(a.rentAno).replace(",", ".")) && a.valorReais > 0);
    const somaPond = ponderados.reduce((acc, a) => acc + a.valorReais, 0);
    const rentCalculada = somaPond > 0
      ? ponderados.reduce((acc, a) => acc + parseFloat(String(a.rentAno).replace(",", ".")) * a.valorReais, 0) / somaPond
      : null;
    const rentManual = parseFloat(snap.rentabilidade) || 0;
    const rentExibir = rentCalculada !== null ? rentCalculada : rentManual;

    // Aportes
    const aportesHistorico = Array.isArray(snap.aportesHistorico) ? snap.aportesHistorico : [];
    const mes = mesAtualStr();
    const aporteMesAtual = aportesHistorico
      .filter((a) => {
        if (!a.data) return false;
        const d = new Date(a.data);
        return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` === mes;
      })
      .reduce((acc, a) => acc + parseCentavos(a.valor) / 100, 0);
    const aporteTotal = aportesHistorico.reduce((acc, a) => acc + parseCentavos(a.valor) / 100, 0);
    const aporteMedio = aportesHistorico.length > 0 ? aporteTotal / aportesHistorico.length : 0;

    // Vínculo com objetivos (agrupa ativos por objetivo)
    const vinculoObjetivos = {};
    todosAtivos.forEach((a) => {
      if (!a.objetivo) return;
      if (!vinculoObjetivos[a.objetivo]) vinculoObjetivos[a.objetivo] = { label: a.objetivo, total: 0, qtd: 0, ativos: [] };
      vinculoObjetivos[a.objetivo].total += a.valorReais;
      vinculoObjetivos[a.objetivo].qtd += 1;
      vinculoObjetivos[a.objetivo].ativos.push(a);
    });

    return {
      total, totalNacional, totalPrevidencia, totalGlobal,
      liquidezD1, liquidezObj,
      classesAtivas, todosAtivos, rentCalculada, rentExibir,
      aportesHistorico, aporteMesAtual, aporteMedio, aporteTotal,
      vinculoObjetivos,
    };
  }, [snap]);

  const liquidezOk = reservaMeta > 0 && liquidezD1 >= reservaMeta;

  // ─── Salvar ─────────────────────────────────────────────────
  async function salvar() {
    setSalvando(true);
    try {
      const s = await getDoc(doc(db, "clientes", id));
      const dados = s.data() || {};
      const novoForm = { ...formRef.current };

      // Sincroniza total da classe com soma dos ativos
      CLASSES.forEach((c) => {
        const ativos = novoForm[c.key + "Ativos"] || [];
        if (ativos.length > 0) {
          const tot = ativos.reduce((acc, a) => acc + parseCentavos(a.valor), 0);
          novoForm[c.key] = String(tot);
        }
      });

      // Liquidez sincronizada
      const liqD1Centavos = Math.round(liquidezD1 * 100);

      const novaCarteira = {
        ...novoForm,
        liquidezD1: String(liqD1Centavos),
        rentabilidadeCalculada: rentCalculada !== null ? rentCalculada.toFixed(2) : "",
        atualizadoEm: hojeBr(),
      };

      // Atualiza aporteRegistradoMes no root do cliente (compat dashboard)
      const patch = { ...dados, carteira: novaCarteira };
      if (aporteMesAtual > 0) {
        patch.aporteRegistradoMes = String(Math.round(aporteMesAtual * 100));
        patch.aporteRegistradoMesEm = mesAtualStr();
        patch.lastAporteDate = hojeBr();
      }

      await setDoc(doc(db, "clientes", id), patch);
      formRef.current = { ...novaCarteira };
      setSnap({ ...novaCarteira });
      setIsEditing(false);
      setMsg("✓ Carteira atualizada e sincronizada com os demais módulos.");
      setTimeout(() => setMsg(""), 4000);
    } catch (e) {
      setMsg("Erro: " + e.message);
    }
    setSalvando(false);
  }

  // auto-save para mudanças pontuais (aporte, etc)
  async function salvarSilencioso(snapLocal) {
    const s = await getDoc(doc(db, "clientes", id));
    const dados = s.data() || {};
    const novaCarteira = { ...snapLocal, atualizadoEm: hojeBr() };
    const aportes = Array.isArray(novaCarteira.aportesHistorico) ? novaCarteira.aportesHistorico : [];
    const mes = mesAtualStr();
    const aporteMes = aportes.filter((a) => {
      if (!a.data) return false;
      const d = new Date(a.data);
      return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` === mes;
    }).reduce((acc, a) => acc + parseCentavos(a.valor) / 100, 0);
    const patch = { ...dados, carteira: novaCarteira };
    if (aporteMes > 0) {
      patch.aporteRegistradoMes = String(Math.round(aporteMes * 100));
      patch.aporteRegistradoMesEm = mes;
      patch.lastAporteDate = hojeBr();
    }
    await setDoc(doc(db, "clientes", id), patch);
  }

  // ─── Aporte ─────────────────────────────────────────────────
  async function registrarAporte({ valor, data, observacao }) {
    const centavos = parseCentavos(valor);
    if (centavos <= 0) return;
    const novo = { id: newId(), valor: String(centavos), data: data || new Date().toISOString().slice(0, 10), observacao: observacao || "" };
    const lista = [novo, ...(snap.aportesHistorico || [])];
    const novoForm = { ...formRef.current, aportesHistorico: lista };
    formRef.current = novoForm;
    setSnap(novoForm);
    await salvarSilencioso(novoForm);
    setMsg("✓ Aporte registrado e refletido no dashboard.");
    setTimeout(() => setMsg(""), 3500);
    setAporteModal(false);
  }

  async function removerAporte(aporteId) {
    const lista = (snap.aportesHistorico || []).filter((a) => a.id !== aporteId);
    const novoForm = { ...formRef.current, aportesHistorico: lista };
    formRef.current = novoForm;
    setSnap(novoForm);
    await salvarSilencioso(novoForm);
  }

  // ─── Upload PDF/Imagem ──────────────────────────────────────
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const setP = (pct, message, extra = {}) => setUploadProgress({ pct, message, ...extra });
    setP(0, "Iniciando leitura do arquivo...");
    try {
      const text = await extractText(file, (pct, message) => setP(pct, message));
      const dados = parseCarteiraFromText(text);
      const metaFields = Object.fromEntries(Object.entries(dados).filter(([k]) => k.startsWith("_")));
      const carteiraFields = Object.fromEntries(Object.entries(dados).filter(([k]) => !k.startsWith("_")));
      const camposPreenchidos = Object.keys(carteiraFields).length;

      if (camposPreenchidos === 0) {
        setP(100, "Nenhum dado reconhecido.", { error: true, errorDetail: "O arquivo não contém dados financeiros legíveis. Tente outro arquivo ou preencha manualmente." });
      } else {
        const novoForm = { ...formRef.current };
        Object.entries(carteiraFields).forEach(([k, v]) => { novoForm[k] = v; });
        formRef.current = novoForm;
        setSnap(novoForm);
        if (metaFields._tipo === "relatorio") {
          setXpSummary(metaFields);
          setP(100, `✓ Relatório importado: ${camposPreenchidos} classe${camposPreenchidos > 1 ? "s" : ""} preenchida${camposPreenchidos > 1 ? "s" : ""}. Revise e salve.`);
        } else {
          setP(100, `✓ ${camposPreenchidos} campo${camposPreenchidos > 1 ? "s" : ""} preenchido${camposPreenchidos > 1 ? "s" : ""}. Revise e salve.`);
        }
      }
    } catch (err) {
      setP(0, "", { error: true, pct: 0, message: "Erro ao processar arquivo", errorDetail: err.message });
    }
    e.target.value = "";
  }

  if (!carregou) {
    return (
      <div style={{ ...C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: T.textMuted, fontSize: 12, letterSpacing: "0.1em" }}>CARREGANDO CARTEIRA...</div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div style={{ ...C.bg, minHeight: "100vh", paddingBottom: 80 }}>
      <Navbar
        actionButtons={[
          { icon: "↑", label: "Importar PDF/Imagem", onClick: () => fileInputRef.current?.click(), disabled: !!uploadProgress && !uploadProgress.error && uploadProgress.pct < 100 },
          { icon: "＋", label: "Aporte", variant: "secondary", onClick: () => setAporteModal(true) },
          { icon: "💾", label: salvando ? "Salvando..." : "Salvar", variant: "primary", onClick: salvar, disabled: salvando },
        ]}
      />
      <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" style={{ display: "none" }} onChange={handleUpload} />

      {/* Botão voltar flutuante */}
      <BackFab onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(`/cliente/${id}`))} />

      {/* Modais */}
      {xpSummary && <RelatorioModal meta={xpSummary} onClose={() => setXpSummary(null)} />}
      {uploadProgress && <UploadOverlay progress={uploadProgress} onClose={() => setUploadProgress(null)} />}
      {aporteModal && <AporteModal onClose={() => setAporteModal(false)} onSave={registrarAporte} />}
      {classeAberta && (
        <ClasseDrilldown
          classe={classByKey[classeAberta]}
          ativos={getAtivos(classeAberta)}
          total={getClassTotal(classeAberta)}
          totalCarteira={total}
          onClose={() => setClasseAberta(null)}
          onAddAtivo={() => {
            upsertAtivo(classeAberta);
            setAtivoEditando({ classKey: classeAberta, idx: (getAtivos(classeAberta) || []).length });
          }}
          onEditAtivo={(idx) => setAtivoEditando({ classKey: classeAberta, idx })}
          onRemoveAtivo={(idx) => removeAtivo(classeAberta, idx)}
        />
      )}
      {ativoEditando && (
        <AtivoEditor
          ctx={ativoEditando}
          snap={snap}
          onClose={() => setAtivoEditando(null)}
          onUpdate={(dados) => upsertAtivo(ativoEditando.classKey, ativoEditando.idx, dados)}
          onMove={(destKey, seg) => {
            moverAtivo(ativoEditando.classKey, ativoEditando.idx, destKey, seg);
            setAtivoEditando(null);
            setClasseAberta(destKey);
          }}
        />
      )}

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 28px 60px" }}>
        {/* ── HERO ── */}
        <div style={{
          background: `linear-gradient(135deg, rgba(240,162,2,0.05), rgba(240,162,2,0.02) 50%, transparent)`,
          border: `0.5px solid rgba(240,162,2,0.15)`,
          borderRadius: T.radiusXl,
          padding: "28px 32px",
          marginBottom: 20,
          position: "relative",
          overflow: "hidden",
          boxShadow: T.shadowGold,
        }}>
          <div style={{
            position: "absolute", top: -40, right: -40, width: 200, height: 200,
            background: `radial-gradient(circle, rgba(240,162,2,0.08) 0%, transparent 70%)`,
            pointerEvents: "none",
          }} />
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 18, position: "relative" }}>
            <AvatarIcon tipo={clienteAvatar} size={56} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: T.gold, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 4, ...noSel }}>
                Carteira de Investimentos
              </div>
              <div style={{ fontSize: 26, fontWeight: 300, color: T.textPrimary, letterSpacing: "-0.01em" }}>
                {clienteNome || "Cliente"}
              </div>
            </div>
            {snap.atualizadoEm && (
              <div style={{ textAlign: "right", ...noSel }}>
                <div style={{ fontSize: 9, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.14em" }}>Última atualização</div>
                <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 4 }}>{snap.atualizadoEm}</div>
              </div>
            )}
          </div>

          {/* KPIs dentro do hero */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(0, 1fr))", gap: 14, position: "relative" }}>
            <KPI label="Patrimônio Total" value={brl(total)} color={T.gold} large />
            <KPI
              label="Rentabilidade no ano"
              value={rentExibir > 0 ? `+${pct(rentExibir, 2)}` : rentExibir < 0 ? pct(rentExibir, 2) : "—"}
              color={rentExibir > 0 ? T.success : rentExibir < 0 ? T.danger : T.textMuted}
              hint={rentCalculada !== null ? "auto" : snap.rentabilidade ? "manual" : null}
            />
            <KPI label="Líquido D+1" value={brl(liquidezD1)} color="#60a5fa" hint={liquidezObj > 0 ? "via objetivos" : "renda fixa"} />
            <KPI
              label={`Aporte ${mesAtualStr()}`}
              value={aporteMesAtual > 0 ? brl(aporteMesAtual) : "—"}
              color={aporteMesAtual > 0 ? "#a855f7" : T.textMuted}
              hint={aportesHistorico.length > 0 ? `${aportesHistorico.length} lançamento${aportesHistorico.length > 1 ? "s" : ""}` : null}
            />
          </div>
        </div>

        {/* Feedback */}
        {msg && (
          <div style={{
            padding: "12px 16px", borderRadius: T.radiusMd, marginBottom: 14, fontSize: 12,
            background: msg.includes("Erro") ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
            border: `0.5px solid ${msg.includes("Erro") ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
            color: msg.includes("Erro") ? T.danger : "#4ade80",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            {msg}
            <button onClick={() => setMsg("")} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
        )}

        {/* ── COMPOSIÇÃO (pizza + tabela) ── */}
        <SectionTitle>Composição da Carteira</SectionTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 22 }}>
          {/* Pizza */}
          <div style={{
            ...C.card,
            padding: "24px 20px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 18,
            flexBasis: 300, flexShrink: 0, minWidth: 0, maxWidth: "100%",
          }}>
            <GraficoPizza
              classesAtivas={classesAtivas}
              total={total}
              hoverKey={hoverFatia}
              onHover={setHoverFatia}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", maxHeight: 180, overflowY: "auto" }}>
              {classesAtivas.map((c) => {
                const p = total > 0 ? Math.round((c.valor / total) * 100) : 0;
                return (
                  <div
                    key={c.key}
                    onMouseEnter={() => setHoverFatia(c.key)}
                    onMouseLeave={() => setHoverFatia(null)}
                    onClick={() => setClasseAberta(c.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 8,
                      cursor: "pointer",
                      background: hoverFatia === c.key ? `rgba(${hexToRgb(c.cor)},0.08)` : "transparent",
                      transition: "background 0.15s",
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.cor, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: T.textSecondary, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                    <span style={{ fontSize: 11, color: c.cor, fontWeight: 500 }}>{p}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tabela */}
          <div style={{ ...C.card, padding: 0, overflowX: "auto", overflowY: "hidden", flex: 1, minWidth: 0, WebkitOverflowScrolling: "touch" }}>
            <div style={{ minWidth: 480 }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1.4fr 1fr 60px 80px 80px 1.1fr 28px",
              padding: "16px 18px", borderBottom: `0.5px solid ${T.border}`,
              fontSize: 11, color: T.textSecondary, textTransform: "uppercase", letterSpacing: "0.1em",
              fontWeight: 500, ...noSel,
            }}>
              <div>Classe</div>
              <div style={{ textAlign: "right" }}>Valor</div>
              <div style={{ textAlign: "right" }}>%</div>
              <div style={{ textAlign: "right" }}>Rent Mês</div>
              <div style={{ textAlign: "right" }}>Rent Ano</div>
              <div style={{ paddingLeft: 14 }}>Objetivo</div>
              <div />
            </div>
            {classesAtivas.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: T.textMuted, fontSize: 12, ...noSel }}>
                Nenhuma classe com valor. Importe um relatório ou adicione ativos manualmente.
              </div>
            )}
            {classesAtivas.map((c) => {
              const p = total > 0 ? Math.round((c.valor / total) * 100) : 0;
              const ativos = getAtivos(c.key);
              // rentab média ponderada da classe (ano e mês)
              const ativosComRentAno = ativos.filter((a) => parseFloat(String(a.rentAno).replace(",", ".")) && parseCentavos(a.valor) > 0);
              const somaAno = ativosComRentAno.reduce((acc, a) => acc + parseCentavos(a.valor) / 100, 0);
              const rentAnoC = somaAno > 0 ? ativosComRentAno.reduce((acc, a) => acc + parseFloat(String(a.rentAno).replace(",", ".")) * parseCentavos(a.valor) / 100, 0) / somaAno : null;
              const ativosComRentMes = ativos.filter((a) => parseFloat(String(a.rentMes).replace(",", ".")) && parseCentavos(a.valor) > 0);
              const somaMes = ativosComRentMes.reduce((acc, a) => acc + parseCentavos(a.valor) / 100, 0);
              const rentMesC = somaMes > 0 ? ativosComRentMes.reduce((acc, a) => acc + parseFloat(String(a.rentMes).replace(",", ".")) * parseCentavos(a.valor) / 100, 0) / somaMes : null;
              // objetivo dominante da classe (por valor)
              const objMap = {};
              ativos.forEach((a) => {
                if (!a.objetivo) return;
                objMap[a.objetivo] = (objMap[a.objetivo] || 0) + parseCentavos(a.valor) / 100;
              });
              const objOrdenados = Object.entries(objMap).sort((a, b) => b[1] - a[1]);
              const objPrincipal = objOrdenados[0]?.[0] || null;
              const nObj = objOrdenados.length;
              return (
                <div
                  key={c.key}
                  onClick={() => setClasseAberta(c.key)}
                  onMouseEnter={() => setHoverFatia(c.key)}
                  onMouseLeave={() => setHoverFatia(null)}
                  style={{
                    display: "grid", gridTemplateColumns: "1.4fr 1fr 60px 80px 80px 1.1fr 28px",
                    padding: "16px 18px", borderBottom: `0.5px solid ${T.border}`,
                    cursor: "pointer", alignItems: "center",
                    background: hoverFatia === c.key ? `rgba(${hexToRgb(c.cor)},0.05)` : "transparent",
                    transition: "background 0.15s",
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div style={{ width: 3, height: 24, borderRadius: 2, background: c.cor, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: T.textPrimary, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                        {ativos.length > 0 ? `${ativos.length} ativo${ativos.length > 1 ? "s" : ""} · liq ${c.liq}` : `valor da classe · liq ${c.liq}`}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, color: T.textPrimary, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{brl(c.valor)}</div>
                  <div style={{ fontSize: 13, color: c.cor, textAlign: "right", fontWeight: 600 }}>{p}%</div>
                  <div style={{ fontSize: 12, textAlign: "right", color: rentMesC !== null ? (rentMesC > 0 ? T.success : T.danger) : T.textMuted, fontVariantNumeric: "tabular-nums" }}>
                    {rentMesC !== null ? `${rentMesC > 0 ? "+" : ""}${rentMesC.toFixed(2)}%` : "—"}
                  </div>
                  <div style={{ fontSize: 12, textAlign: "right", color: rentAnoC !== null ? (rentAnoC > 0 ? T.success : T.danger) : T.textMuted, fontVariantNumeric: "tabular-nums" }}>
                    {rentAnoC !== null ? `${rentAnoC > 0 ? "+" : ""}${rentAnoC.toFixed(2)}%` : "—"}
                  </div>
                  <div style={{ paddingLeft: 14, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    {objPrincipal ? (
                      <>
                        <span style={{
                          fontSize: 11, color: T.gold, background: "rgba(240,162,2,0.08)",
                          border: "0.5px solid rgba(240,162,2,0.3)", borderRadius: 4,
                          padding: "3px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          maxWidth: "100%",
                        }}>{objPrincipal}</span>
                        {nObj > 1 && (
                          <span style={{ fontSize: 10, color: T.textMuted }}>+{nObj - 1}</span>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: T.textMuted, fontStyle: "italic" }}>definir →</span>
                    )}
                  </div>
                  <div style={{ color: T.textMuted, fontSize: 16, textAlign: "right" }}>›</div>
                  {/* barra progresso */}
                  <div style={{ gridColumn: "1 / -1", height: 2, background: "rgba(255,255,255,0.04)", borderRadius: 1, overflow: "hidden", marginTop: 10 }}>
                    <div style={{ height: "100%", width: `${p}%`, background: c.cor, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
            {/* Footer total */}
            {classesAtivas.length > 0 && (
              <div style={{
                padding: "16px 18px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "rgba(240,162,2,0.04)",
                ...noSel,
              }}>
                <span style={{ fontSize: 12, color: T.textSecondary, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 }}>Total</span>
                <span style={{ fontSize: 17, color: T.gold, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{brl(total)}</span>
              </div>
            )}
            </div>{/* end minWidth wrapper */}
          </div>
        </div>

        {/* ── BALANÇO NACIONAL/GLOBAL/PREVIDÊNCIA ── */}
        {(totalNacional > 0 || totalGlobal > 0 || totalPrevidencia > 0) && (
          <>
            <SectionTitle>Balanço por Região</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${[totalNacional, totalGlobal, totalPrevidencia].filter(v => v > 0).length}, minmax(0, 1fr))`, gap: 14, marginBottom: 22 }}>
              {[
                { label: "Brasil", icon: "🇧🇷", v: totalNacional, cor: "#F0A202" },
                { label: "Global (USD)", icon: "🌎", v: totalGlobal, cor: "#a855f7" },
                { label: "Previdência", icon: "🛡", v: totalPrevidencia, cor: "#f59e0b" },
              ].filter(x => x.v > 0).map(({ label, icon, v, cor }) => (
                <div key={label} style={{
                  ...C.card,
                  background: `linear-gradient(135deg, rgba(${hexToRgb(cor)},0.06), rgba(${hexToRgb(cor)},0.02))`,
                  border: `0.5px solid rgba(${hexToRgb(cor)},0.2)`,
                  padding: "18px 20px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{icon}</span>
                      <span style={{ fontSize: 10, color: cor, textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</span>
                    </div>
                    <span style={{ fontSize: 10, color: T.textMuted }}>{total > 0 ? Math.round((v / total) * 100) : 0}%</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 300, color: cor, letterSpacing: "-0.01em" }}>{brl(v)}</div>
                  <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden", marginTop: 12 }}>
                    <div style={{ height: "100%", width: `${total > 0 ? (v / total) * 100 : 0}%`, background: cor }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── RESERVA DE EMERGÊNCIA ── */}
        <SectionTitle>Reserva de Emergência</SectionTitle>
        <div style={{ ...C.card, padding: "20px 22px", marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6, ...noSel }}>
                Liquidez disponível D+1
                {liquidezObj > 0 && <span style={{ marginLeft: 8, fontSize: 8, background: "rgba(34,197,94,0.12)", border: "0.5px solid rgba(34,197,94,0.3)", borderRadius: 4, padding: "2px 6px", color: T.success }}>via ativos</span>}
              </div>
              <div style={{ fontSize: 26, fontWeight: 300, color: "#60a5fa", letterSpacing: "-0.01em" }}>{brl(liquidezD1)}</div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{total > 0 ? Math.round((liquidezD1 / total) * 100) : 0}% do patrimônio total</div>
            </div>
            {reservaMeta > 0 && (
              <div style={{ textAlign: "right", ...noSel }}>
                <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Meta (6 meses)</div>
                <div style={{ fontSize: 14, color: T.textSecondary }}>{brl(reservaMeta)}</div>
                <div style={{
                  marginTop: 8, display: "inline-block", padding: "4px 10px", borderRadius: 20, fontSize: 10, fontWeight: 500,
                  background: liquidezOk ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)",
                  color: liquidezOk ? T.success : T.danger,
                  border: `0.5px solid ${liquidezOk ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                }}>
                  {liquidezOk ? "✓ Meta atingida" : "✗ Abaixo da meta"}
                </div>
              </div>
            )}
          </div>
          {reservaMeta > 0 && (
            <>
              <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(100, (liquidezD1 / reservaMeta) * 100)}%`,
                  background: liquidezOk
                    ? "linear-gradient(90deg, rgba(34,197,94,0.6), rgba(34,197,94,0.9))"
                    : "linear-gradient(90deg, rgba(96,165,250,0.6), rgba(96,165,250,0.9))",
                  transition: "width 0.4s",
                }} />
              </div>
              {!liquidezOk && liquidezD1 >= 0 && (
                <div style={{ fontSize: 10, color: "#f87171", marginTop: 8, ...noSel }}>
                  Faltam {brl(reservaMeta - liquidezD1)} para a reserva completa
                </div>
              )}
            </>
          )}
          <div style={{ fontSize: 10, color: T.textMuted, marginTop: 12, lineHeight: 1.6, ...noSel }}>
            {liquidezObj > 0
              ? 'Calculado a partir dos ativos com objetivo "Liquidez" definido.'
              : "Calculado pela soma de Renda Fixa Pós, IPCA+ e Pré. Marque ativos como \"Liquidez\" para personalizar."}
          </div>
        </div>

        {/* ── VÍNCULO COM OBJETIVOS ── */}
        {Object.keys(vinculoObjetivos).length > 0 && (
          <>
            <SectionTitle action={<button onClick={() => navigate(`/cliente/${id}/objetivos`)} style={linkBtnStyle}>ir para objetivos →</button>}>
              Ativos Vinculados a Objetivos
            </SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12, marginBottom: 22 }}>
              {Object.values(vinculoObjetivos).map((obj) => {
                const p = total > 0 ? Math.round((obj.total / total) * 100) : 0;
                return (
                  <div key={obj.label} style={{
                    ...C.card,
                    padding: "14px 16px",
                    borderLeft: `3px solid ${T.gold}`,
                  }}>
                    <div style={{ fontSize: 10, color: T.gold, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6, ...noSel }}>
                      {obj.label}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 300, color: T.textPrimary }}>{brl(obj.total)}</div>
                    <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4, ...noSel }}>
                      {obj.qtd} ativo{obj.qtd > 1 ? "s" : ""} · {p}% do patrimônio
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── APORTES ── */}
        <SectionTitle>Histórico de Aportes</SectionTitle>
        <div style={{ ...C.card, padding: 0, overflow: "hidden", marginBottom: 22 }}>
          {/* Stats row + ação principal */}
          <div style={{
            padding: "20px 24px",
            borderBottom: `0.5px solid ${T.border}`,
            display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 20, flex: 1, minWidth: 0 }}>
              <div>
                <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6, ...noSel }}>Total aportado</div>
                <div style={{ fontSize: 18, color: "#a855f7", fontWeight: 500, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{brl(aporteTotal)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6, ...noSel }}>Média por aporte</div>
                <div style={{ fontSize: 18, color: "#c084fc", fontWeight: 500, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{brl(aporteMedio)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6, ...noSel }}>Aporte {mesAtualStr()}</div>
                <div style={{ fontSize: 18, color: aporteMesAtual > 0 ? T.gold : T.textMuted, fontWeight: 500, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
                  {aporteMesAtual > 0 ? brl(aporteMesAtual) : "—"}
                </div>
              </div>
            </div>
            <button
              onClick={() => setAporteModal(true)}
              style={{
                padding: "12px 20px",
                background: "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.1))",
                border: "0.5px solid rgba(168,85,247,0.45)",
                borderRadius: T.radiusMd,
                color: "#c084fc", fontSize: 12, cursor: "pointer",
                fontFamily: T.fontFamily, letterSpacing: "0.1em", textTransform: "uppercase",
                fontWeight: 600,
                display: "flex", alignItems: "center", gap: 8,
                whiteSpace: "nowrap",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(168,85,247,0.3), rgba(168,85,247,0.18))"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(168,85,247,0.1))"; }}
            >
              <span style={{ fontSize: 16, fontWeight: 400 }}>+</span>
              Aporte {mesAtualStr()}
            </button>
          </div>

          {aportesHistorico.length === 0 ? (
            <div style={{ padding: "32px 24px", textAlign: "center", color: T.textMuted, fontSize: 13, ...noSel }}>
              Nenhum aporte registrado. Use o botão <strong style={{ color: "#c084fc" }}>+ Aporte {mesAtualStr()}</strong> acima para começar.
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <div style={{ minWidth: 340 }}>
              <div style={{
                display: "grid", gridTemplateColumns: "110px 1fr 140px 40px",
                padding: "12px 24px", borderBottom: `0.5px solid ${T.border}`,
                fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", ...noSel,
                background: "rgba(255,255,255,0.015)",
              }}>
                <div>Data</div>
                <div>Observação</div>
                <div style={{ textAlign: "right" }}>Valor</div>
                <div />
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                {aportesHistorico.slice(0, 20).map((a) => {
                  const d = a.data ? new Date(a.data) : null;
                  return (
                    <div key={a.id} style={{
                      display: "grid", gridTemplateColumns: "110px 1fr 140px 40px",
                      padding: "14px 24px", borderBottom: `0.5px solid ${T.border}`,
                      alignItems: "center", gap: 12,
                    }}>
                      <div style={{ fontSize: 12, color: T.textSecondary, fontVariantNumeric: "tabular-nums" }}>
                        {d ? d.toLocaleDateString("pt-BR") : "—"}
                      </div>
                      <div style={{ fontSize: 12, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.observacao || <span style={{ color: T.textMuted, fontStyle: "italic" }}>sem observação</span>}
                      </div>
                      <div style={{ fontSize: 14, color: T.gold, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        + {brl(parseCentavos(a.valor) / 100)}
                      </div>
                      <button
                        onClick={() => removerAporte(a.id)}
                        style={{
                          background: "none", border: "none", color: T.textMuted, cursor: "pointer",
                          fontSize: 16, padding: 4, borderRadius: 4,
                        }}
                        title="Remover aporte"
                        onMouseEnter={(e) => { e.currentTarget.style.color = T.danger; e.currentTarget.style.background = "rgba(239,68,68,0.08)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = T.textMuted; e.currentTarget.style.background = "none"; }}
                      >×</button>
                    </div>
                  );
                })}
              </div>
              </div>{/* end minWidth wrapper */}
              </div>{/* end overflowX wrapper */}
            </>
          )}
        </div>

        {/* ── AÇÃO FINAL ── */}
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button
            onClick={salvar}
            disabled={salvando}
            style={{
              flex: 1,
              padding: 16,
              background: "linear-gradient(135deg, rgba(240,162,2,0.15), rgba(240,162,2,0.08))",
              border: "0.5px solid rgba(240,162,2,0.4)",
              borderRadius: T.radiusMd,
              color: T.gold,
              fontSize: 12,
              cursor: salvando ? "wait" : "pointer",
              fontFamily: T.fontFamily,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            {salvando ? "Salvando..." : "💾 Salvar & Sincronizar"}
          </button>
        </div>

        <div style={{ fontSize: 10, color: T.textMuted, textAlign: "center", marginTop: 18, ...noSel }}>
          Os valores são propagados automaticamente para Dashboard, Objetivos e Ficha do Cliente ao salvar.
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SUB-COMPONENTES
// ══════════════════════════════════════════════════════════════
const linkBtnStyle = {
  background: "none",
  border: "none",
  color: T.gold,
  fontSize: 10,
  cursor: "pointer",
  fontFamily: T.fontFamily,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

function SectionTitle({ children, action }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      marginTop: 12, marginBottom: 16,
    }}>
      <div style={{
        fontSize: 14, color: T.textSecondary, textTransform: "uppercase", letterSpacing: "0.14em",
        fontWeight: 500,
        display: "flex", alignItems: "center", gap: 12, ...noSel,
      }}>
        <div style={{ width: 32, height: 2, background: T.gold, opacity: 0.8, borderRadius: 1 }} />
        {children}
      </div>
      {action}
    </div>
  );
}

function KPI({ label, value, color = T.textPrimary, hint, large }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.02)",
      border: `0.5px solid ${T.border}`,
      borderRadius: T.radiusMd,
      padding: "14px 16px",
      position: "relative",
    }}>
      <div style={{ fontSize: 9, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8, ...noSel }}>{label}</div>
      <div style={{ fontSize: large ? 24 : 18, fontWeight: 300, color, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {hint && (
        <div style={{ fontSize: 9, color: T.textMuted, marginTop: 4, letterSpacing: "0.06em", ...noSel }}>{hint}</div>
      )}
    </div>
  );
}

function Mini({ label, value, cor }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6, ...noSel }}>{label}</div>
      <div style={{ fontSize: 14, color: cor, fontWeight: 400 }}>{value}</div>
    </div>
  );
}

function BackFab({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed", left: 16, top: "50%", transform: "translateY(-50%)",
        width: 44, height: 44, borderRadius: 22,
        background: "rgba(240,162,2,0.15)",
        border: "1px solid rgba(240,162,2,0.3)",
        color: T.gold, fontSize: 20, cursor: "pointer", zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: T.fontFamily,
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-50%) scale(1.1)"; e.currentTarget.style.background = "rgba(240,162,2,0.25)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(-50%) scale(1)"; e.currentTarget.style.background = "rgba(240,162,2,0.15)"; }}
    >←</button>
  );
}

// ══════════════════════════════════════════════════════════════
// DRILL-DOWN DE CLASSE (painel lateral full-height)
// ══════════════════════════════════════════════════════════════
function ClasseDrilldown({ classe, ativos, total, totalCarteira, onClose, onAddAtivo, onEditAtivo, onRemoveAtivo }) {
  const p = totalCarteira > 0 ? Math.round((total / totalCarteira) * 100) : 0;
  const ativosComRent = ativos.filter((a) => parseFloat(String(a.rentAno).replace(",", ".")));
  const somaRent = ativosComRent.reduce((acc, a) => acc + parseCentavos(a.valor) / 100, 0);
  const rentMedia = somaRent > 0
    ? ativosComRent.reduce((acc, a) => acc + parseFloat(String(a.rentAno).replace(",", ".")) * parseCentavos(a.valor) / 100, 0) / somaRent
    : null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 600,
      display: "flex", justifyContent: "flex-end",
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560, maxWidth: "95vw", height: "100%",
          background: T.bg,
          borderLeft: `0.5px solid rgba(${hexToRgb(classe.cor)},0.3)`,
          display: "flex", flexDirection: "column",
          animation: "slideIn 0.25s ease-out",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "24px 28px",
          background: `linear-gradient(135deg, rgba(${hexToRgb(classe.cor)},0.08), transparent)`,
          borderBottom: `0.5px solid ${T.border}`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: classe.cor, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 6 }}>Classe de ativo</div>
              <div style={{ fontSize: 22, fontWeight: 300, color: T.textPrimary, letterSpacing: "-0.01em" }}>{classe.label}</div>
            </div>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.04)", border: `0.5px solid ${T.border}`,
              borderRadius: "50%", width: 32, height: 32, color: T.textSecondary,
              cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
            }}>×</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 14 }}>
            <div>
              <div style={{ fontSize: 9, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>Total</div>
              <div style={{ fontSize: 16, color: classe.cor, fontWeight: 400 }}>{brl(total)}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>% da carteira</div>
              <div style={{ fontSize: 16, color: T.textPrimary, fontWeight: 300 }}>{p}%</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>Rent. média a.a.</div>
              <div style={{ fontSize: 16, color: rentMedia !== null ? (rentMedia > 0 ? T.success : T.danger) : T.textMuted, fontWeight: 400 }}>
                {rentMedia !== null ? `${rentMedia > 0 ? "+" : ""}${rentMedia.toFixed(2)}%` : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Lista de ativos */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 24px" }}>
          {ativos.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: T.textMuted, fontSize: 12, ...noSel }}>
              Nenhum ativo cadastrado nesta classe.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ativos.map((a, idx) => {
              const valor = parseCentavos(a.valor) / 100;
              const pAtivo = total > 0 ? (valor / total) * 100 : 0;
              return (
                <div key={a.id || idx} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `0.5px solid rgba(${hexToRgb(classe.cor)},0.15)`,
                  borderRadius: T.radiusMd,
                  padding: "14px 16px",
                  position: "relative",
                  overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: classe.cor,
                  }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: T.textPrimary, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {a.nome || <span style={{ color: T.textMuted, fontStyle: "italic" }}>Ativo sem nome</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
                        {a.objetivo ? (
                          <Tag cor={T.gold}>🎯 {a.objetivo}</Tag>
                        ) : (
                          <span
                            onClick={() => onEditAtivo(idx)}
                            style={{
                              fontSize: 9, color: T.gold, background: "rgba(240,162,2,0.05)",
                              border: "0.5px dashed rgba(240,162,2,0.35)", borderRadius: 4,
                              padding: "2px 7px", letterSpacing: "0.03em", cursor: "pointer", ...noSel,
                            }}
                          >+ definir objetivo</span>
                        )}
                        {a.segmento && <Tag cor="#60a5fa">{a.segmento}</Tag>}
                        {a.vencimento && <Tag cor={T.textSecondary}>venc {a.vencimento}</Tag>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 14, color: T.gold, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{brl(valor)}</div>
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>{pAtivo.toFixed(1)}% da classe</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 10, paddingTop: 10, borderTop: `0.5px solid ${T.border}` }}>
                    {a.rentMes && (
                      <div>
                        <div style={{ fontSize: 9, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Rent. mês</div>
                        <div style={{ fontSize: 11, color: T.success, marginTop: 2 }}>{a.rentMes}%</div>
                      </div>
                    )}
                    {a.rentAno && (
                      <div>
                        <div style={{ fontSize: 9, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Rent. ano</div>
                        <div style={{ fontSize: 11, color: T.success, marginTop: 2 }}>{a.rentAno}%</div>
                      </div>
                    )}
                    <div style={{ flex: 1 }} />
                    <button
                      onClick={() => onEditAtivo(idx)}
                      style={{
                        fontSize: 10, color: classe.cor, background: `rgba(${hexToRgb(classe.cor)},0.08)`,
                        border: `0.5px solid rgba(${hexToRgb(classe.cor)},0.2)`,
                        borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                        letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: T.fontFamily,
                      }}
                    >editar</button>
                    <button
                      onClick={() => onRemoveAtivo(idx)}
                      style={{
                        fontSize: 10, color: T.danger, background: "rgba(239,68,68,0.06)",
                        border: "0.5px solid rgba(239,68,68,0.2)",
                        borderRadius: 6, padding: "4px 10px", cursor: "pointer",
                        letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: T.fontFamily,
                      }}
                    >remover</button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={onAddAtivo}
            style={{
              width: "100%", marginTop: 14, padding: 14,
              background: `rgba(${hexToRgb(classe.cor)},0.05)`,
              border: `1px dashed rgba(${hexToRgb(classe.cor)},0.3)`,
              borderRadius: T.radiusMd,
              color: classe.cor, fontSize: 12, cursor: "pointer",
              fontFamily: T.fontFamily, letterSpacing: "0.08em",
            }}
          >+ Adicionar ativo a {classe.label}</button>
        </div>
      </div>
      <style>{`@keyframes slideIn { from { transform: translateX(30px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}

function Tag({ cor, children }) {
  return (
    <span style={{
      fontSize: 9, color: cor, background: `rgba(${hexToRgb(cor)},0.1)`,
      border: `0.5px solid rgba(${hexToRgb(cor)},0.25)`,
      borderRadius: 4, padding: "2px 7px", letterSpacing: "0.03em",
      ...noSel,
    }}>{children}</span>
  );
}

// ══════════════════════════════════════════════════════════════
// EDITOR DE ATIVO (modal completo: pode mudar classe, objetivo, segmento)
// ══════════════════════════════════════════════════════════════
function AtivoEditor({ ctx, snap, onClose, onUpdate, onMove }) {
  const { classKey, idx } = ctx;
  const ativo = (snap[classKey + "Ativos"] || [])[idx] || {};
  const classe = classByKey[classKey];
  const [form, setForm] = useState({
    nome: ativo.nome || "",
    valor: ativo.valor || "",
    objetivo: ativo.objetivo || "",
    vencimento: ativo.vencimento || "",
    rentMes: ativo.rentMes || "",
    rentAno: ativo.rentAno || "",
    segmento: ativo.segmento || "",
    novaClasse: classKey,
  });

  const classesOptions = CLASSES.filter((c) => !c.legado).map((c) => ({ value: c.key, label: c.label }));
  const segOpts = form.novaClasse === "acoes" ? SEGMENTOS.acoes : form.novaClasse === "fiis" ? SEGMENTOS.fiis : null;

  function setF(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  function handleSave() {
    if (form.novaClasse !== classKey) {
      // Muda de classe: remove da origem, adiciona no destino (AtivoEditor já faz .onMove)
      // Precisa primeiro atualizar os dados do ativo atual e depois mover
      onUpdate({ nome: form.nome, valor: form.valor, objetivo: form.objetivo, vencimento: form.vencimento, rentMes: form.rentMes, rentAno: form.rentAno, segmento: form.segmento });
      setTimeout(() => onMove(form.novaClasse, form.segmento), 50);
    } else {
      onUpdate({ nome: form.nome, valor: form.valor, objetivo: form.objetivo, vencimento: form.vencimento, rentMes: form.rentMes, rentAno: form.rentAno, segmento: form.segmento });
      onClose();
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 700,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bgCard,
          border: `0.5px solid rgba(${hexToRgb(classe.cor)},0.3)`,
          borderRadius: T.radiusLg,
          padding: 24,
          width: 500, maxWidth: "95vw",
          maxHeight: "90vh", overflowY: "auto",
          boxShadow: T.shadowLg,
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10, color: classe.cor, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 4 }}>
              {idx === undefined ? "Novo ativo" : "Editar ativo"}
            </div>
            <div style={{ fontSize: 17, fontWeight: 400, color: T.textPrimary }}>{classe.label}</div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.04)", border: `0.5px solid ${T.border}`,
            borderRadius: "50%", width: 30, height: 30, color: T.textSecondary,
            cursor: "pointer", fontSize: 14,
          }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ ...C.label }}>Nome do ativo</div>
            <InputTexto initValue={form.nome} onCommit={(v) => setF("nome", v)} placeholder="Ex: CDB Itaú IPCA+ 2030" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <div>
              <div style={{ ...C.label }}>Valor investido</div>
              <InputMoeda initValue={form.valor} onCommit={(v) => setF("valor", v)} />
            </div>
            <div>
              <div style={{ ...C.label }}>Vencimento (opcional)</div>
              <InputTexto initValue={form.vencimento} onCommit={(v) => setF("vencimento", v)} placeholder="DD/MM/AAAA" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <div>
              <div style={{ ...C.label }}>Rentabilidade no mês (%)</div>
              <InputPct initValue={form.rentMes} onCommit={(v) => setF("rentMes", v)} placeholder="0,85" />
            </div>
            <div>
              <div style={{ ...C.label }}>Rentabilidade no ano (%)</div>
              <InputPct initValue={form.rentAno} onCommit={(v) => setF("rentAno", v)} placeholder="12,5" />
            </div>
          </div>

          <div style={{
            padding: 14, background: "rgba(240,162,2,0.04)",
            border: "0.5px solid rgba(240,162,2,0.2)", borderRadius: T.radiusMd,
          }}>
            <div style={{ fontSize: 9, color: T.gold, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10, ...noSel }}>
              🎯 Classificação & Integração
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ ...C.label }}>Classe do ativo</div>
                <Select value={form.novaClasse} onChange={(v) => setF("novaClasse", v)} options={classesOptions} />
                {form.novaClasse !== classKey && (
                  <div style={{ fontSize: 9, color: T.gold, marginTop: 4, ...noSel }}>
                    ⚠ Ativo será movido para {classByKey[form.novaClasse]?.label}
                  </div>
                )}
              </div>
              <div>
                <div style={{ ...C.label }}>Objetivo (liga ao planejamento)</div>
                <Select value={form.objetivo} onChange={(v) => setF("objetivo", v)} options={OBJETIVOS} placeholder="— sem objetivo" />
              </div>
            </div>
            {segOpts && (
              <div>
                <div style={{ ...C.label }}>Segmento</div>
                <Select value={form.segmento} onChange={(v) => setF("segmento", v)} options={segOpts} placeholder="— sem segmento" />
              </div>
            )}
            <div style={{ fontSize: 9, color: T.textMuted, marginTop: 10, lineHeight: 1.5, ...noSel }}>
              Ao definir o objetivo, o ativo é automaticamente vinculado ao planejamento financeiro do cliente.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button onClick={onClose} style={{
              flex: 1, padding: 12, background: "rgba(255,255,255,0.04)",
              border: `0.5px solid ${T.border}`, borderRadius: T.radiusMd,
              color: T.textSecondary, fontSize: 11, cursor: "pointer",
              fontFamily: T.fontFamily, letterSpacing: "0.12em", textTransform: "uppercase",
            }}>Cancelar</button>
            <button onClick={handleSave} style={{
              flex: 1.5, padding: 12,
              background: "rgba(240,162,2,0.12)",
              border: "0.5px solid rgba(240,162,2,0.4)",
              borderRadius: T.radiusMd,
              color: T.gold, fontSize: 11, cursor: "pointer",
              fontFamily: T.fontFamily, letterSpacing: "0.12em", textTransform: "uppercase",
              fontWeight: 500,
            }}>Salvar alterações</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MODAL DE APORTE
// ══════════════════════════════════════════════════════════════
function AporteModal({ onClose, onSave }) {
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState("");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 700,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.bgCard, border: `0.5px solid rgba(168,85,247,0.3)`,
          borderRadius: T.radiusLg, padding: 24, width: 440, maxWidth: "95vw",
          boxShadow: T.shadowLg,
        }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: "#a855f7", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 4 }}>+ Aporte</div>
            <div style={{ fontSize: 17, fontWeight: 400, color: T.textPrimary }}>Registrar aporte mensal</div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.04)", border: `0.5px solid ${T.border}`,
            borderRadius: "50%", width: 30, height: 30, color: T.textSecondary,
            cursor: "pointer", fontSize: 14,
          }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ ...C.label }}>Valor do aporte</div>
            <InputMoeda initValue={valor} onCommit={setValor} size="lg" />
          </div>
          <div>
            <div style={{ ...C.label }}>Data</div>
            <InputDate initValue={data} onCommit={setData} />
          </div>
          <div>
            <div style={{ ...C.label }}>Observação (opcional)</div>
            <InputTexto initValue={observacao} onCommit={setObservacao} placeholder="Ex: salário, 13º, venda de imóvel..." />
          </div>

          <div style={{
            padding: "10px 12px", background: "rgba(168,85,247,0.06)",
            border: "0.5px solid rgba(168,85,247,0.2)", borderRadius: T.radiusSm,
            fontSize: 10, color: "#c084fc", lineHeight: 1.6, ...noSel,
          }}>
            💡 O aporte será registrado no histórico e automaticamente refletido no dashboard do cliente.
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={onClose} style={{
              flex: 1, padding: 12, background: "rgba(255,255,255,0.04)",
              border: `0.5px solid ${T.border}`, borderRadius: T.radiusMd,
              color: T.textSecondary, fontSize: 11, cursor: "pointer",
              fontFamily: T.fontFamily, letterSpacing: "0.12em", textTransform: "uppercase",
            }}>Cancelar</button>
            <button onClick={() => onSave({ valor, data, observacao })} style={{
              flex: 1.5, padding: 12,
              background: "rgba(168,85,247,0.15)",
              border: "0.5px solid rgba(168,85,247,0.4)",
              borderRadius: T.radiusMd,
              color: "#c084fc", fontSize: 11, cursor: "pointer",
              fontFamily: T.fontFamily, letterSpacing: "0.12em", textTransform: "uppercase",
              fontWeight: 500,
            }}>Registrar aporte</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// RESUMO DE RELATÓRIO IMPORTADO (XP/similar)
// ══════════════════════════════════════════════════════════════
function RelatorioModal({ meta, onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 610,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      backdropFilter: "blur(8px)",
    }}>
      <div style={{
        background: T.bgCard, border: "0.5px solid rgba(240,162,2,0.25)",
        borderRadius: T.radiusLg, padding: "24px 22px", width: 400, maxWidth: "100%",
      }}>
        <div style={{ fontSize: 10, color: T.gold, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 4, ...noSel }}>Relatório importado</div>
        <div style={{ fontSize: 17, fontWeight: 300, color: T.textPrimary, marginBottom: 16, ...noSel }}>Carteira de Investimentos</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {meta._patrimonioTotal > 0 && <MetaRow label="Patrimônio Total Bruto" val={brl(meta._patrimonioTotal / 100)} cor={T.gold} />}
          {meta._rentMes && <MetaRow label="Rentabilidade no mês" val={`${meta._rentMes}%`} cor={T.success} />}
          {meta._rentAno && <MetaRow label="Rentabilidade no ano" val={`${meta._rentAno}%`} cor={T.success} />}
          {meta._ganhoMes > 0 && <MetaRow label="Ganho no mês" val={brl(meta._ganhoMes / 100)} cor="#4ade80" />}
          {meta._rendimentosPassivos > 0 && <MetaRow label="Renda Passiva (div/juros)" val={brl(meta._rendimentosPassivos / 100)} cor="#60a5fa" />}
          {meta._aportes > 0 && <MetaRow label="Aportes recebidos" val={brl(meta._aportes / 100)} cor="#a855f7" />}
        </div>
        <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 14, lineHeight: 1.6, ...noSel }}>
          As alocações foram preenchidas automaticamente. Revise os valores e detalhe os ativos clicando em cada classe.
        </div>
        <button onClick={onClose} style={{
          width: "100%", padding: 11, background: "rgba(240,162,2,0.1)",
          border: "0.5px solid rgba(240,162,2,0.35)", borderRadius: T.radiusSm,
          color: T.gold, fontSize: 11, cursor: "pointer", fontFamily: T.fontFamily,
          letterSpacing: "0.12em", textTransform: "uppercase",
        }}>Entendido — revisar carteira</button>
      </div>
    </div>
  );
}

function MetaRow({ label, val, cor }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      padding: "9px 12px",
      background: `rgba(${hexToRgb(cor)},0.06)`,
      border: `0.5px solid rgba(${hexToRgb(cor)},0.18)`,
      borderRadius: 8, ...noSel,
    }}>
      <span style={{ fontSize: 11, color: T.textSecondary }}>{label}</span>
      <span style={{ fontSize: 12, color: cor, fontWeight: 500 }}>{val}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// UPLOAD OVERLAY
// ══════════════════════════════════════════════════════════════
function UploadOverlay({ progress, onClose }) {
  const done = progress.pct >= 100 && !progress.error;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 600,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      backdropFilter: "blur(8px)",
    }}>
      <div style={{
        background: T.bgCard, border: `0.5px solid ${T.border}`,
        borderRadius: T.radiusLg, padding: "28px 24px", width: 380, maxWidth: "100%",
      }}>
        <div style={{
          fontSize: 15, fontWeight: 400,
          color: done ? T.success : progress.error ? T.danger : T.textPrimary,
          marginBottom: 8, ...noSel,
        }}>
          {done ? "✓ Importação concluída" : progress.error ? "✗ Erro na importação" : "Processando arquivo..."}
        </div>
        <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 16, lineHeight: 1.6, ...noSel }}>{progress.message}</div>
        {!progress.error && progress.pct < 100 && (
          <>
            <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${progress.pct}%`, background: T.gold, borderRadius: 3, transition: "width 0.4s" }} />
            </div>
            <div style={{ fontSize: 11, color: T.gold, textAlign: "right", ...noSel }}>{Math.round(progress.pct)}%</div>
          </>
        )}
        {progress.error && (
          <div style={{
            background: "rgba(239,68,68,0.08)", border: "0.5px solid rgba(239,68,68,0.25)",
            borderRadius: 10, padding: "10px 12px", marginBottom: 16,
          }}>
            <div style={{ fontSize: 11, color: T.danger, lineHeight: 1.6 }}>{progress.errorDetail}</div>
          </div>
        )}
        {(progress.pct >= 100 || progress.error) && (
          <button onClick={onClose} style={{
            width: "100%", padding: 10,
            background: "rgba(255,255,255,0.04)", border: `0.5px solid ${T.border}`,
            borderRadius: T.radiusSm, color: T.textSecondary, fontSize: 11,
            cursor: "pointer", fontFamily: T.fontFamily, letterSpacing: "0.1em", textTransform: "uppercase",
          }}>Fechar</button>
        )}
      </div>
    </div>
  );
}
