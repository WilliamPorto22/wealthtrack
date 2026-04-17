import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Navbar } from "../components/Navbar";
import { T, C } from "../theme";
import { useCotacoesReais } from "../services/cotacoesReais";

const IPCA_ANUAL = 3.81;
const TAXA_ANUAL = 14;

const TIPOS = [
  { id:"aposentadoria", label:"Aposentadoria e Liberdade Financeira" },
  { id:"imovel",        label:"Aquisição de Imóvel" },
  { id:"viagem",        label:"Viagens e Experiências" },
  { id:"educacao",      label:"Educação dos Filhos" },
  { id:"saude",         label:"Saúde e Qualidade de Vida" },
  { id:"sucessaoPatrimonial", label:"Sucessão Patrimonial" },
  { id:"personalizado", label:"Objetivo Personalizado" },
];

function encontrarAnos(inicial, aporteMensal, meta, maxAnos = 50) {
  const j = Math.pow(1 + TAXA_ANUAL / 100, 1 / 12) - 1;
  const inflMensal = Math.pow(1 + IPCA_ANUAL / 100, 1 / 12) - 1;
  let vt = inicial;
  for (let mes = 1; mes <= maxAnos * 12; mes++) {
    vt = vt * (1 + j) + aporteMensal;
    const totalReal = vt / Math.pow(1 + inflMensal, mes);
    if (totalReal >= meta) return Math.round(mes / 12 * 10) / 10;
  }
  return null;
}

function calcularTabela(inicial, aporteMensal, anos) {
  const j = Math.pow(1 + TAXA_ANUAL / 100, 1 / 12) - 1;
  const inflMensal = Math.pow(1 + IPCA_ANUAL / 100, 1 / 12) - 1;
  let vt = inicial;
  const tabela = [];
  for (let mes = 1; mes <= anos * 12; mes++) {
    vt = vt * (1 + j) + aporteMensal;
    if (mes % 12 === 0) {
      const totalReal = vt / Math.pow(1 + inflMensal, mes);
      tabela.push({ ano: mes / 12, totalReal, rendaMensalReal: totalReal * j });
    }
  }
  return tabela;
}

function classificar(anosNec, prazo) {
  if (!anosNec) return "inviavel";
  const diff = anosNec - prazo;
  if (diff <= 0) return "viavel";
  if (diff <= 2) return "ajustavel";
  return "inviavel";
}

function brl(v) {
  return Math.round(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function moedaStr(centavos) {
  const num = parseInt(String(centavos || "0").replace(/\D/g, "")) || 0;
  if (!num) return "";
  return (num / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function parseCentavos(str) {
  return parseInt(String(str || "0").replace(/\D/g, "")) || 0;
}

function calcularAporteNecessario(inicial, meta, prazo) {
  let aporteMin = 0;
  let aporteMax = meta;
  for (let i = 0; i < 80; i++) {
    const aporteTeste = (aporteMin + aporteMax) / 2;
    const anosNec = encontrarAnos(inicial, aporteTeste, meta);
    if (!anosNec || anosNec > prazo) aporteMin = aporteTeste;
    else aporteMax = aporteTeste;
  }
  return Math.ceil((aporteMin + aporteMax) / 2);
}

const corStatus = { viavel: "#22c55e", ajustavel: "#f59e0b", inviavel: "#ef4444" };
const labelStatus = { viavel: "Viável", ajustavel: "Ajustável", inviavel: "Inviável" };

// Cores principais por tipo (paleta premium)
const coresPorTipo = {
  aposentadoria:       "#FFCA3A",
  imovel:              "#8AC926",
  viagem:              "#5DD9C1",
  educacao:            "#2274A5",
  saude:               "#1982C4",
  sucessaoPatrimonial: "#6A4C93",
  personalizado:       "#00CC66",
};

// Gradientes sofisticados por tipo — Dark + Color tint
const gradientsPorTipo = {
  aposentadoria:       "linear-gradient(145deg, #2a1f00 0%, #3d2e00 60%, rgba(255,202,58,0.18) 100%)",
  imovel:              "linear-gradient(145deg, #0f2006 0%, #1a360a 60%, rgba(138,201,38,0.18) 100%)",
  viagem:              "linear-gradient(145deg, #042522 0%, #0a3430 60%, rgba(93,217,193,0.18) 100%)",
  educacao:            "linear-gradient(145deg, #061c32 0%, #0d2a48 60%, rgba(34,116,165,0.18) 100%)",
  saude:               "linear-gradient(145deg, #041626 0%, #082238 60%, rgba(25,130,196,0.18) 100%)",
  sucessaoPatrimonial: "linear-gradient(145deg, #0c0820 0%, #160f30 60%, rgba(106,76,147,0.18) 100%)",
  personalizado:       "linear-gradient(145deg, #001f10 0%, #003218 60%, rgba(0,204,102,0.18) 100%)",
};

const emojisPorTipo = {
  aposentadoria: "🏖️",
  imovel: "🏠",
  viagem: "✈️",
  educacao: "📚",
  saude: "💪",
  sucessaoPatrimonial: "👨‍👩‍👧‍👦",
  personalizado: "⭐"
};

export default function Objetivos() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { obterIPCA } = useCotacoesReais();
  const [objetivos, setObjetivos] = useState([]);
  const [selecionado, setSelecionado] = useState(null);
  const [etapa, setEtapa] = useState(0);
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [recalibrar, setRecalibrar] = useState(null);
  const [ipca, setIpca] = useState(3.81);

  useEffect(() => {
    async function carregar() {
      const snap = await getDoc(doc(db, "clientes", id));
      if (snap.exists()) setObjetivos(snap.data().objetivos || []);
    }
    carregar();
  }, [id]);

  // Obter IPCA dinâmico dos últimos 12 meses
  useEffect(() => {
    async function obterDados() {
      try {
        const dados = await obterIPCA();
        if (dados?.valor) {
          setIpca(parseFloat(dados.valor));
        }
      } catch (erro) {
        console.error("Erro ao obter IPCA:", erro);
        // Mantém valor padrão de 3.81%
      }
    }
    obterDados();
  }, []);

  function setF(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function iniciarObj(tipo) {
    setSelecionado(tipo);
    setForm({ tipo: tipo.id, label: tipo.label });
    setEtapa(1);
  }

  async function salvar() {
    setSalvando(true);
    const snap = await getDoc(doc(db, "clientes", id));
    const lista = [...objetivos, form];
    await setDoc(doc(db, "clientes", id), { ...snap.data(), objetivos: lista });
    setObjetivos(lista);
    setSelecionado(null);
    setEtapa(0);
    setForm({});
    setSalvando(false);
  }

  async function deletar(i) {
    const snap = await getDoc(doc(db, "clientes", id));
    const lista = objetivos.filter((_, idx) => idx !== i);
    await setDoc(doc(db, "clientes", id), { ...snap.data(), objetivos: lista });
    setObjetivos(lista);
    if (recalibrar === i) setRecalibrar(null);
  }

  function diagnostico(obj) {
    const inicial = parseCentavos(obj.patrimAtual) / 100;
    const aporte = parseCentavos(obj.aporte) / 100;
    const meta = parseCentavos(obj.meta) / 100;
    const prazo = parseInt(obj.prazo) || 0;
    const anosNec = encontrarAnos(inicial, aporte, meta);
    const status = prazo > 0 ? classificar(anosNec, prazo) : (anosNec ? "viavel" : "inviavel");
    const tabela = calcularTabela(inicial, aporte, prazo || Math.ceil(anosNec || 30) + 2);
    const ultimo = tabela[tabela.length - 1];
    return { anosNec, status, ultimo, inicial, aporte, meta, prazo };
  }

  // ── NAVBAR ──
  const Navbar = () => (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 20px", borderBottom:`0.5px solid ${T.border}`, background:T.bg, position:"sticky", top:0, zIndex:100 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }} onClick={() => navigate("/dashboard")}>
        <div style={{ width:32, height:32, borderRadius:8, background:"linear-gradient(135deg,#1a3560,#0d2040)", border:"1px solid rgba(240,162,2,0.3)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontSize:13, color:"#F0A202", fontWeight:500 }}>P</span>
        </div>
        <span style={{ fontSize:13, color:T.textPrimary, fontWeight:400 }}>Porto Invest</span>
      </div>
    </div>
  );

  // ── BOTÃO FLUTUANTE VOLTAR ──
  const BotoesNavegacao = () => {
    const handleVoltar = () => {
      if (etapa === 0) {
        navigate(`/cliente/${id}`);
      } else {
        setEtapa(etapa - 1);
      }
    };

    const handleProximo = () => {
      if (etapa > 0 && etapa < 4) {
        setEtapa(etapa + 1);
      }
    };

    const btnBase = {
      position:"fixed",
      top:"50%",
      transform:"translateY(-50%)",
      width:44,
      height:44,
      borderRadius:22,
      border:"1px solid rgba(240,162,2,0.3)",
      color:"#F0A202",
      fontSize:20,
      cursor:"pointer",
      zIndex:50,
      display:"flex",
      alignItems:"center",
      justifyContent:"center",
      transition:"all 0.3s ease",
      boxShadow:"0 4px 12px rgba(0,0,0,0.3)",
    };

    return (
      <>
        {/* Voltar — sempre visível */}
        <button
          onClick={handleVoltar}
          style={{ ...btnBase, left:16, background:"rgba(240,162,2,0.15)" }}
          onMouseEnter={e=>{
            e.currentTarget.style.transform="translateY(-50%) scale(1.15)";
            e.currentTarget.style.background="rgba(240,162,2,0.25)";
          }}
          onMouseLeave={e=>{
            e.currentTarget.style.transform="translateY(-50%) scale(1)";
            e.currentTarget.style.background="rgba(240,162,2,0.15)";
          }}
        >
          ←
        </button>

        {/* Próximo — só visível dentro do formulário (etapas 1-3) */}
        {etapa > 0 && etapa < 4 && (
          <button
            onClick={handleProximo}
            style={{ ...btnBase, right:16, background:"rgba(240,162,2,0.15)" }}
            onMouseEnter={e=>{
              e.currentTarget.style.transform="translateY(-50%) scale(1.15)";
              e.currentTarget.style.background="rgba(240,162,2,0.25)";
            }}
            onMouseLeave={e=>{
              e.currentTarget.style.transform="translateY(-50%) scale(1)";
              e.currentTarget.style.background="rgba(240,162,2,0.15)";
            }}
          >
            →
          </button>
        )}
      </>
    );
  };

  // ── TELA 0 — Lista de objetivos + cards de seleção ──
  if (etapa === 0 && !selecionado) return (
    <div style={{ minHeight:"100vh", background:T.bg, fontFamily:T.fontFamily }}>
      <Navbar />
      <div style={{ maxWidth:1000, margin:"0 auto", padding:"24px 20px 60px" }}>

        <div style={{ fontSize:22, fontWeight:300, color:T.textPrimary, marginBottom:4 }}>Objetivos Financeiros</div>
        <div style={{ fontSize:12, color:T.textSecondary, marginBottom:28, lineHeight:1.6 }}>
          Cada objetivo é uma direção. O sistema calcula o caminho.
        </div>

        {/* Objetivos configurados */}
        {objetivos.length > 0 && (
          <>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
              <span style={{ fontSize:9, letterSpacing:"0.18em", textTransform:"uppercase", color:T.textMuted }}>Configurados</span>
              <div style={{ flex:1, height:"0.5px", background:T.border }}/>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))", gap:16, marginBottom:28 }}>
            {objetivos.map((obj, i) => {
              const { anosNec, status, ultimo, inicial, aporte, meta, prazo } = diagnostico(obj);
              const cor = corStatus[status];
              const pct = Math.min(100, Math.round((parseCentavos(obj.patrimAtual) / 100) / (meta || 1) * 100));

              const gradient = gradientsPorTipo[obj.tipo] || gradientsPorTipo.personalizado;
              const emoji = emojisPorTipo[obj.tipo] || "⭐";

              return (
                <div key={i} style={{ marginBottom:20 }}>
                  {/* Card do objetivo — NUBANK STYLE */}
                  <div style={{
                    background: gradient,
                    borderRadius: 16,
                    padding: "20px 18px",
                    minHeight: 240,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    position: "relative",
                    overflow: "hidden",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    transform: "translateY(0)"
                  }}
                  onClick={() => navigate(`/objetivo/${id}/${i}`)}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.4)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.3)";
                  }}>
                    {/* Emoji grande no topo */}
                    <div style={{ fontSize:40, marginBottom:10, lineHeight:1 }}>{emoji}</div>

                    {/* Título e meta */}
                    <div>
                      <div style={{ fontSize:15, fontWeight:400, color:"#fff", marginBottom:4, lineHeight:1.2 }}>
                        {obj.nomeCustom || obj.label}
                      </div>
                      <div style={{ fontSize:11, color:"rgba(255,255,255,0.9)", marginBottom:2 }}>
                        Meta: {brl(meta)}
                      </div>
                      <div style={{ fontSize:10, color:"rgba(255,255,255,0.7)", marginBottom:12 }}>
                        até {prazo} {prazo === 1 ? "ano" : "anos"}
                      </div>

                      {/* Barra de progresso maior */}
                      <div style={{ height:5, background:"rgba(255,255,255,0.2)", borderRadius:3, overflow:"hidden", marginBottom:10 }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:"rgba(255,255,255,0.9)", borderRadius:3, transition:"width 0.4s" }}/>
                      </div>
                      <div style={{ fontSize:11, color:"rgba(255,255,255,0.8)" }}>
                        {pct}% atingido
                      </div>
                    </div>

                    {/* Info + Status */}
                    <div>
                      <div style={{ fontSize:11, color:"rgba(255,255,255,0.85)", marginBottom:12, lineHeight:1.6 }}>
                        Aporte: R$ {Math.round(aporte).toLocaleString("pt-BR")}/mês<br/>
                        <span style={{ fontSize:10, color:"rgba(255,255,255,0.7)" }}>
                          📊 Renda: 1,16% a.m. | 📈 Infl: {ipca.toFixed(2)}%
                        </span><br/>
                        Necessário: {anosNec ? anosNec + " anos" : "50+ anos"}
                      </div>

                      {/* Pills de status */}
                      <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"space-between" }}>
                        <span style={{
                          fontSize:11,
                          padding:"5px 12px",
                          borderRadius:20,
                          background:"rgba(255,255,255,0.25)",
                          color:"#fff",
                          fontWeight:500,
                          whiteSpace:"nowrap"
                        }}>
                          {status === "viavel" ? "✓" : status === "ajustavel" ? "⚠" : "✕"} {labelStatus[status]}
                        </span>
                        <button
                          style={{
                            background:"none",
                            border:"none",
                            color:"rgba(255,255,255,0.6)",
                            fontSize:18,
                            cursor:"pointer",
                            lineHeight:1,
                            padding:0
                          }}
                          onClick={() => deletar(i)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Painel Recalibrar */}
                  {recalibrar === i && (() => {
                    const aporteNec = calcularAporteNecessario(inicial, meta, prazo);
                    const novoPrazo = encontrarAnos(inicial, aporte, meta, 80);
                    return (
                      <div style={{ background:"rgba(37,99,235,0.04)", border:"0.5px solid rgba(37,99,235,0.15)", borderRadius:T.radiusMd, padding:"20px 18px", marginTop:4 }}>
                        <div style={{ fontSize:13, fontWeight:400, color:T.textPrimary, marginBottom:10, lineHeight:1.4 }}>
                          Seu plano precisa de ajustes
                        </div>
                        <div style={{ fontSize:12, color:T.textSecondary, lineHeight:1.7, marginBottom:16 }}>
                          Com os dados atuais, o objetivo de <b style={{ color:T.goldLight }}>{brl(meta)}</b> não
                          será atingido no prazo de <b style={{ color:T.goldLight }}>{prazo} anos</b>.
                        </div>

                        <div style={{ background:"rgba(255,255,255,0.03)", borderRadius:T.radiusMd, padding:"14px 16px", fontSize:12, color:T.textSecondary, lineHeight:1.7, marginBottom:14 }}>
                          Para manter o prazo, o aporte precisa ir de&nbsp;
                          <b style={{ color:"#ef4444" }}>{brl(aporte)}/mês</b> para&nbsp;
                          <b style={{ color:"#22c55e" }}>{brl(aporteNec)}/mês</b>.
                        </div>

                        {[
                          { n:"01", titulo:"Aumentar o aporte", desc:`Ajustando para ${brl(aporteNec)}/mês, o objetivo é atingido no prazo original de ${prazo} anos.` },
                          { n:"02", titulo:"Estender o prazo",  desc:`Mantendo ${brl(aporte)}/mês, o prazo real passa a ser de aproximadamente ${novoPrazo ? novoPrazo + " anos" : "mais de 50 anos"}.` },
                          { n:"03", titulo:"Otimizar a alocação", desc:"Uma revisão da carteira pode melhorar a eficiência dos aportes e acelerar o crescimento." },
                          { n:"04", titulo:"Reorganização patrimonial", desc:"Dependendo do perfil, realocação de ativos ou crédito estruturado pode acelerar o plano." },
                        ].map(a => (
                          <div key={a.n} style={{ display:"flex", gap:14, alignItems:"flex-start", marginBottom:10 }}>
                            <span style={{ fontSize:18, fontWeight:300, color:"rgba(240,162,2,0.3)", flexShrink:0, lineHeight:1, marginTop:2 }}>{a.n}</span>
                            <div>
                              <div style={{ fontSize:12, color:T.textPrimary, marginBottom:3 }}>{a.titulo}</div>
                              <div style={{ fontSize:12, color:T.textMuted, lineHeight:1.6 }}>{a.desc}</div>
                            </div>
                          </div>
                        ))}

                        <div style={{ fontSize:12, color:T.gold, fontStyle:"italic", lineHeight:1.6, paddingTop:12, borderTop:`0.5px solid rgba(240,162,2,0.12)`, marginTop:4 }}>
                          Um plano só é bom quando é executável. Agora você tem clareza para decidir o melhor caminho.
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
            </div>
          </>
        )}

        {/* Adicionar objetivo */}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20, marginTop: objetivos.length > 0 ? 32 : 0 }}>
          <span style={{ fontSize:9, letterSpacing:"0.18em", textTransform:"uppercase", color:T.textMuted }}>Adicionar objetivo</span>
          <div style={{ flex:1, height:"0.5px", background:T.border }}/>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))", gap:14 }}>
          {TIPOS.map(t => {
            const cor = coresPorTipo[t.id] || "#F0A202";
            const [r,g,b] = cor.slice(1).match(/.{2}/g).map(h=>parseInt(h,16));
            const rgb = `${r},${g},${b}`;
            return (
              <div
                key={t.id}
                style={{
                  background: `rgba(${rgb}, 0.07)`,
                  border: `0.5px solid rgba(${rgb}, 0.22)`,
                  borderRadius: 18,
                  padding: "22px 16px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  gap: 10,
                  transition: "all 0.3s ease",
                  transform: "translateY(0)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.25)"
                }}
                onClick={() => iniciarObj(t)}
                onMouseEnter={e => {
                  e.currentTarget.style.background = `rgba(${rgb}, 0.16)`;
                  e.currentTarget.style.border = `0.5px solid rgba(${rgb}, 0.45)`;
                  e.currentTarget.style.boxShadow = `0 8px 24px rgba(${rgb}, 0.2)`;
                  e.currentTarget.style.transform = "translateY(-3px)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = `rgba(${rgb}, 0.07)`;
                  e.currentTarget.style.border = `0.5px solid rgba(${rgb}, 0.22)`;
                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <span style={{ fontSize:34, lineHeight:1 }}>{emojisPorTipo[t.id] || "⭐"}</span>
                <span style={{ fontSize:11, color:T.textPrimary, lineHeight:1.4, fontWeight:400 }}>
                  {t.label}
                </span>
                <span style={{ fontSize:13, color:cor, fontWeight:500 }}>→</span>
              </div>
            );
          })}
        </div>
      </div>
      <BotoesNavegacao />
    </div>
  );

  // ── FORMULÁRIO — Etapas 1 a 4 ──
  const meta = parseCentavos(form.meta) / 100;
  const inicial = parseCentavos(form.patrimAtual) / 100;
  const aporte = parseCentavos(form.aporte) / 100;
  const prazo = parseInt(form.prazo) || 0;

  return (
    <div style={{ minHeight:"100vh", background:T.bg, fontFamily:T.fontFamily }}>
      <Navbar
        actionButtons={[
          {
            label: "+ Novo",
            variant: "primary",
            onClick: ()=>navigate(`/cliente/${id}/objetivo/novo`)
          }
        ]}
      />
      <div style={{ maxWidth:560, margin:"0 auto", padding:"24px 20px 60px" }}>

        {/* Header da etapa */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:300, color:T.textPrimary }}>{selecionado?.label}</div>
          <div style={{ fontSize:10, color:T.textMuted, letterSpacing:"0.08em", marginTop:3 }}>Etapa {etapa} de 4</div>
        </div>

        {/* Barra de progresso */}
        <div style={{ height:1, background:"rgba(255,255,255,0.06)", borderRadius:1, overflow:"hidden", marginBottom:32 }}>
          <div style={{ height:"100%", width:`${etapa * 25}%`, background:`linear-gradient(90deg,#1a3560,${T.gold})`, borderRadius:1, transition:"width 0.4s" }}/>
        </div>

        {/* ETAPA 1 */}
        {etapa === 1 && (
          <div>
            {form.tipo === "aposentadoria" ? (
              <>
                <div style={{ fontSize:20, fontWeight:300, color:T.textPrimary, marginBottom:8, lineHeight:1.3 }}>
                  Qual renda mensal você deseja alcançar?
                </div>
                <div style={{ fontSize:13, color:T.textSecondary, marginBottom:28, lineHeight:1.7 }}>
                  Defina o valor mensal que representaria tranquilidade
                  e liberdade financeira no seu padrão de vida.
                </div>
                <div style={{ marginBottom:20 }}>
                  <label style={C.label}>Renda mensal desejada</label>
                  <input style={{ ...C.input, fontSize:18, padding:"16px 18px" }}
                    placeholder="R$ 0"
                    type="text"
                    inputMode="numeric"
                    value={form.rendaMensal ? (parseCentavos(form.rendaMensal)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:0,maximumFractionDigits:0}) : ""}
                    onChange={e => {
                      const centavos = parseCentavos(e.target.value) * 100;
                      setF("rendaMensal", String(centavos));
                      if (centavos > 0) {
                        const rendaReais = centavos / 100;
                        const patrimonioNecessario = Math.round((rendaReais * 12) / (TAXA_ANUAL / 100));
                        setF("meta", String(patrimonioNecessario * 100));
                      }
                    }}
                  />
                </div>
                {parseCentavos(form.rendaMensal) > 0 && (
                  <div style={{ background:"rgba(240,162,2,0.06)", border:`0.5px solid rgba(240,162,2,0.2)`, borderRadius:T.radiusLg, padding:"22px 20px" }}>
                    <div style={{ fontSize:13, color:T.textSecondary, marginBottom:6, lineHeight:1.6 }}>
                      Para gerar uma renda mensal de <span style={{ color:T.goldLight, fontWeight:500 }}>{moedaStr(form.rendaMensal)}</span>
                    </div>
                    <div style={{ fontSize:13, color:T.textSecondary, marginBottom:10 }}>Será necessário um patrimônio estimado de</div>
                    <div style={{ fontSize:28, fontWeight:300, color:T.textPrimary }}>{moedaStr(form.meta)}</div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize:20, fontWeight:300, color:T.textPrimary, marginBottom:8, lineHeight:1.3 }}>
                  Qual é a meta financeira?
                </div>
                <div style={{ fontSize:13, color:T.textSecondary, marginBottom:28, lineHeight:1.7 }}>
                  Defina o valor total que representa a realização deste objetivo.
                </div>
                {form.tipo === "personalizado" && (
                  <div style={{ marginBottom:16 }}>
                    <label style={C.label}>Nome do objetivo</label>
                    <input style={C.input} placeholder="Ex: Viagem para o Canadá" value={form.nomeCustom||""} onChange={e=>setF("nomeCustom",e.target.value)} />
                  </div>
                )}
                <div style={{ marginBottom:20 }}>
                  <label style={C.label}>Valor total do objetivo</label>
                  <input style={{ ...C.input, fontSize:18, padding:"16px 18px" }}
                    placeholder="R$ 0"
                    type="text"
                    inputMode="numeric"
                    value={form.meta ? (parseCentavos(form.meta)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:0,maximumFractionDigits:0}) : ""}
                    onChange={e => {
                      const centavos = parseCentavos(e.target.value) * 100;
                      setF("meta", String(centavos));
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* ETAPA 2 */}
        {etapa === 2 && (
          <div>
            <div style={{ fontSize:20, fontWeight:300, color:T.textPrimary, marginBottom:8, lineHeight:1.3 }}>
              Qual é a situação atual?
            </div>
            <div style={{ fontSize:13, color:T.textSecondary, marginBottom:28, lineHeight:1.7 }}>
              Esses dados são a base do cálculo.
              Quanto mais preciso, melhor o diagnóstico.
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={C.label}>Patrimônio já acumulado para este objetivo</label>
              <input style={{ ...C.input, fontSize:16, padding:"14px 16px" }} placeholder="R$ 0" type="text" inputMode="numeric"
                value={form.patrimAtual ? (parseCentavos(form.patrimAtual)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:0,maximumFractionDigits:0}) : ""}
                onChange={e => {
                  const centavos = parseCentavos(e.target.value) * 100;
                  setF("patrimAtual", String(centavos));
                }} />
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={C.label}>Aporte mensal destinado a este objetivo</label>
              <input style={{ ...C.input, fontSize:16, padding:"14px 16px" }} placeholder="R$ 0" type="text" inputMode="numeric"
                value={form.aporte ? (parseCentavos(form.aporte)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:0,maximumFractionDigits:0}) : ""}
                onChange={e => {
                  const centavos = parseCentavos(e.target.value) * 100;
                  setF("aporte", String(centavos));
                }} />
            </div>
          </div>
        )}

        {/* ETAPA 3 */}
        {etapa === 3 && (
          <div>
            <div style={{ fontSize:20, fontWeight:300, color:T.textPrimary, marginBottom:8, lineHeight:1.3 }}>
              Qual é o prazo desejado?
            </div>
            <div style={{ fontSize:13, color:T.textSecondary, marginBottom:28, lineHeight:1.7 }}>
              Em quantos anos este objetivo deve ser alcançado?
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={C.label}>Prazo em anos</label>
              <input style={{ ...C.input, fontSize:18, padding:"16px 18px" }} type="number" placeholder="Ex: 10"
                value={form.prazo||""} onChange={e=>setF("prazo",e.target.value)} />
            </div>

            {prazo > 0 && aporte > 0 && meta > 0 && (() => {
              const anosNec = encontrarAnos(inicial, aporte, meta);
              const status = classificar(anosNec, prazo);
              const cor = corStatus[status];
              const tabela = calcularTabela(inicial, aporte, prazo);
              const ultimo = tabela[tabela.length - 1];
              return (
                <div style={{ background:"rgba(255,255,255,0.03)", border:`0.5px solid ${T.border}`, borderRadius:T.radiusLg, padding:"18px 20px" }}>
                  <div style={{ fontSize:9, color:T.textMuted, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:14 }}>
                    Projeção — {prazo} anos
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    {[
                      ["Patrimônio real acumulado", brl(ultimo?.totalReal||0)],
                      ["Renda mensal real",         `${brl(ultimo?.rendaMensalReal||0)}/mês`],
                      ["Tempo necessário",          anosNec?anosNec+" anos":"50+ anos"],
                      ["Status do plano",           labelStatus[status]],
                    ].map(([l,v],i)=>(
                      <div key={l} style={{ background:"rgba(255,255,255,0.03)", borderRadius:T.radiusMd, padding:"12px 14px" }}>
                        <div style={{ fontSize:10, color:T.textMuted, marginBottom:5, lineHeight:1.4 }}>{l}</div>
                        <div style={{ fontSize:14, color: i===3?cor:T.textPrimary }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ETAPA 4 — Diagnóstico */}
        {etapa === 4 && (() => {
          const anosNec = encontrarAnos(inicial, aporte, meta);
          const status = classificar(anosNec, prazo);
          const cor = corStatus[status];
          const tabela = calcularTabela(inicial, aporte, prazo || 30);
          const ultimo = tabela[tabela.length - 1];
          const msg = status === "viavel"
            ? "O plano está alinhado. Mantendo os aportes e a estratégia atual, o objetivo será atingido dentro do prazo."
            : status === "ajustavel"
            ? "O plano está próximo. Um pequeno ajuste no aporte ou extensão de prazo de até 2 anos é suficiente para viabilizá-lo."
            : `Com os dados atuais, o objetivo não será atingido no prazo de ${prazo} anos. O tempo real estimado é de ${anosNec ? anosNec + " anos" : "mais de 50 anos"}. Para viabilizar o plano, será necessário aumentar os aportes ou rever o prazo.`;
          return (
            <div>
              <div style={{ fontSize:20, fontWeight:300, color:T.textPrimary, marginBottom:20, lineHeight:1.3 }}>
                Diagnóstico do Plano
              </div>
              <div style={{ marginBottom:20, paddingBottom:18, borderBottom:`0.5px solid ${T.border}` }}>
                <div style={{ fontSize:15, fontWeight:300, color:T.textPrimary, marginBottom:8 }}>{form.nomeCustom || selecionado?.label}</div>
                <span style={{ fontSize:11, padding:"5px 14px", borderRadius:20, background:`${cor}18`, color:cor, letterSpacing:"0.06em" }}>
                  {status === "viavel" ? "Plano Viável" : status === "ajustavel" ? "Plano Ajustável" : "Plano Inviável"}
                </span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                {[
                  ["Meta",                   brl(meta)],
                  ["Patrimônio atual",        brl(inicial)],
                  ["Aporte mensal",           `${brl(aporte)}/mês`],
                  ["Prazo desejado",          `${prazo} anos`],
                  ["Prazo real necessário",   anosNec?anosNec+" anos":"50+ anos"],
                  [`Renda real em ${prazo} anos`, `${brl(ultimo?.rendaMensalReal||0)}/mês`],
                ].map(([l,v],i)=>(
                  <div key={l} style={{ background:"rgba(255,255,255,0.03)", borderRadius:T.radiusMd, padding:"13px 14px" }}>
                    <div style={{ fontSize:9, color:T.textMuted, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>{l}</div>
                    <div style={{ fontSize:14, color: i===4?cor:T.textPrimary }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ borderRadius:T.radiusMd, padding:"14px 18px", fontSize:12, lineHeight:1.7, background:`${cor}0d`, border:`0.5px solid ${cor}33`, color:cor }}>
                {msg}
              </div>
            </div>
          );
        })()}

        {/* Botões de navegação */}
        <div style={{ display:"flex", gap:10, marginTop:28 }}>
          {etapa > 1 && (
            <button style={{ padding:"13px 20px", background:"none", border:`0.5px solid ${T.border}`, borderRadius:T.radiusMd, color:T.textMuted, cursor:"pointer", fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:T.fontFamily }}
              onClick={() => setEtapa(e => e - 1)}>
              Voltar
            </button>
          )}
          {etapa < 4 && (
            <button style={{ flex:1, padding:"14px", background:T.goldDim, border:`1px solid ${T.goldBorder}`, borderRadius:T.radiusMd, color:T.gold, cursor:"pointer", fontSize:11, letterSpacing:"0.18em", textTransform:"uppercase", fontFamily:T.fontFamily }}
              onClick={() => setEtapa(e => e + 1)} disabled={etapa===1 && !form.meta}>
              Próximo
            </button>
          )}
          {etapa === 4 && (
            <button style={{ flex:1, padding:"14px", background:T.goldDim, border:`1px solid ${T.goldBorder}`, borderRadius:T.radiusMd, color:T.gold, cursor:"pointer", fontSize:11, letterSpacing:"0.18em", textTransform:"uppercase", fontFamily:T.fontFamily }}
              onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar objetivo"}
            </button>
          )}
        </div>
      </div>
      <BotoesNavegacao />
    </div>
  );
}