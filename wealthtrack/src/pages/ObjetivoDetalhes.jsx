import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Navbar } from "../components/Navbar";
import { T, C } from "../theme";
import { useCotacoesReais } from "../services/cotacoesReais";
import {
  TAXA_ANUAL,
  IPCA_ANUAL,
  simularNovoAporte,
  simularNovaTaxa,
  simularNovoPrazo,
  calcularProjecao,
  classificarStatus,
  avaliarAporteMensal
} from "../utils/objetivosCalc";

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

// Funções de formatação visual (SEM cálculos automáticos)
function formatarMoedaDisplay(valor) {
  if (valor === "" || valor === null) return "";
  const num = parseFloat(valor) || 0;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

function formatarPorcentagem(valor) {
  if (valor === "" || valor === null) return "";
  return `${parseFloat(valor) || 0}%`;
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

const labelStatus = { viavel: "Plano Viável", ajustavel: "Plano Ajustável", inviavel: "Plano Inviável" };
const corStatus = { viavel: "#22c55e", ajustavel: "#f59e0b", inviavel: "#ef4444" };

export default function ObjetivoDetalhes() {
  const { clienteId, objetivoIndex } = useParams();
  const navigate = useNavigate();
  const { obterIPCA } = useCotacoesReais();

  const [cliente, setCliente] = useState(null);
  const [objetivo, setObjetivo] = useState(null);
  const [ipca, setIpca] = useState(3.81);
  const [abaAtiva, setAbaAtiva] = useState("resumo");
  const [simulacao, setSimulacao] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rentabilidadeReal, setRentabilidadeReal] = useState(TAXA_ANUAL);

  // Estado para simuladores
  const [simAporte, setSimAporte] = useState(null);
  const [simTaxa, setSimTaxa] = useState(null);
  const [simPrazo, setSimPrazo] = useState(null);

  // Estado temporário para inputs de simulação (strings para evitar re-renders)
  const [inputAporte, setInputAporte] = useState("");
  const [inputTaxa, setInputTaxa] = useState("");
  const [inputPrazo, setInputPrazo] = useState("");

  // Acompanhamento mensal
  const [editandoMes, setEditandoMes] = useState(null);
  const [formEditMes, setFormEditMes] = useState({});
  const [salvandoMes, setSalvandoMes] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  // Carregar dados do cliente e objetivo
  useEffect(() => {
    async function carregar() {
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
    carregar();
  }, [clienteId, objetivoIndex]);

  // Obter IPCA dinâmico
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

  // Auto-save da rentabilidade real
  useEffect(() => {
    if (!cliente || !objetivo || !clienteId) return;

    const timer = setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, "clientes", clienteId));
        if (snap.exists()) {
          const dados = snap.data();
          const objIndex = parseInt(objetivoIndex);
          const objetivos = dados.objetivos || [];

          if (objetivos[objIndex]) {
            objetivos[objIndex].rentabilidadeReal = rentabilidadeReal;

            await fetch(`https://william-porto.web.app`, {
              method: "POST",
              headers: { "Content-Type": "application/json" }
            }).catch(() => {}); // Auto-save silencioso
          }
        }
      } catch (erro) {
        console.error("Erro ao salvar rentabilidade:", erro);
      }
    }, 1000); // Salvar 1 segundo após última alteração

    return () => clearTimeout(timer);
  }, [rentabilidadeReal, cliente, objetivo, clienteId, objetivoIndex]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: T.textMuted }}>Carregando dados...</div>;
  }

  if (!objetivo || !cliente) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ color: T.textMuted, marginBottom: 20 }}>Objetivo não encontrado</div>
        <button onClick={() => navigate(-1)} style={{ ...C.button, background: T.primary, color: "#fff", cursor: "pointer" }}>
          Voltar
        </button>
      </div>
    );
  }

  // Calcular diagnóstico
  const inicial = parseCentavos(objetivo.patrimAtual) / 100;
  const aporte = parseCentavos(objetivo.aporte) / 100;
  const meta = parseCentavos(objetivo.meta) / 100;
  const prazo = parseInt(objetivo.prazo) || 0;

  // Encontrar anos necessários
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
  const projecao = calcularProjecao(inicial, aporte, Math.max(prazo || 10, 5));
  const emoji = emojisPorTipo[objetivo.tipo] || "⭐";
  const gradient = gradientsPorTipo[objetivo.tipo] || gradientsPorTipo.personalizado;

  // Navegação em abas
  const Abas = ({ ativa, onChange }) => (
    <div style={{ display: "flex", gap: 12, borderBottom: `0.5px solid ${T.border}`, marginBottom: 24, overflowX: "auto" }}>
      {["resumo", "simulador", "acompanhamento", "ativos"].map(aba => (
        <button
          key={aba}
          onClick={() => onChange(aba)}
          style={{
            padding: "12px 16px",
            background: "none",
            border: "none",
            borderBottom: ativa === aba ? `2px solid ${T.primary}` : "none",
            color: ativa === aba ? T.textPrimary : T.textMuted,
            fontSize: 13,
            fontWeight: ativa === aba ? 500 : 400,
            cursor: "pointer",
            whiteSpace: "nowrap",
            textTransform: "capitalize"
          }}
        >
          {aba === "resumo" && "📊 Resumo"}
          {aba === "simulador" && "🔧 Simulador"}
          {aba === "acompanhamento" && "📈 Acompanhamento"}
          {aba === "ativos" && "💼 Ativos"}
        </button>
      ))}
    </div>
  );

  // ── SEÇÃO 1: CABEÇALHO ──
  const Cabecalho = () => (
    <div style={{
      background: gradient,
      borderRadius: T.radiusLg,
      padding: "24px 20px",
      marginBottom: 24,
      color: "#fff",
      display: "flex",
      alignItems: "center",
      gap: 16
    }}>
      <div style={{ fontSize: 48 }}>{emoji}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
          {objetivo.nomeCustom || objetivo.label}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>
          Meta: <strong>{brl(meta)}</strong>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
          Prazo: {prazo} {prazo === 1 ? "ano" : "anos"}
        </div>
      </div>
      <div style={{
        textAlign: "right",
        padding: "12px 16px",
        background: "rgba(255,255,255,0.15)",
        borderRadius: T.radiusMd
      }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Status</div>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          padding: "4px 10px",
          background: cor,
          color: "#fff",
          borderRadius: 12,
          display: "inline-block"
        }}>
          {status === "viavel" ? "✓" : status === "ajustavel" ? "⚠" : "✕"} {labelStatus[status]}
        </div>
      </div>
    </div>
  );

  // ── SEÇÃO 2: RESUMO PRINCIPAL ──
  const Resumo = () => {
    const diferencaRentabilidade = rentabilidadeReal - TAXA_ANUAL;
    const corDiferenca = diferencaRentabilidade >= 0 ? "#22c55e" : "#ef4444";

    return (
      <div>
        {/* Painel de Rentabilidade */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: `0.5px solid ${T.border}`,
          borderRadius: T.radiusMd,
          padding: "16px",
          marginBottom: 24,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 16
        }}>
          <div>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 500 }}>
              📊 Meta de Rentabilidade
            </div>
            <div style={{ fontSize: 16, color: T.textPrimary, fontWeight: 600 }}>
              {TAXA_ANUAL}% a.a.
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
              1,16% a.m.
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 500 }}>
              💼 Rentabilidade Real Carteira
            </div>
            <input
              type="number"
              step="0.1"
              value={rentabilidadeReal}
              onChange={(e) => setRentabilidadeReal(parseFloat(e.target.value) || 0)}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: T.bg,
                border: `0.5px solid ${T.border}`,
                borderRadius: T.radiusMd,
                color: T.textPrimary,
                fontSize: 14,
                fontWeight: 600
              }}
            />
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
              Insira a rentabilidade real obtida
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 500 }}>
              📈 Diferença
            </div>
            <div style={{
              fontSize: 16,
              color: corDiferenca,
              fontWeight: 600
            }}>
              {diferencaRentabilidade > 0 ? "+" : ""}{diferencaRentabilidade.toFixed(2)}%
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
              {diferencaRentabilidade >= 0 ? "✓ Acima da meta" : "✗ Abaixo da meta"}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 500 }}>
              💡 Status
            </div>
            <div style={{
              fontSize: 12,
              color: diferencaRentabilidade >= 0 ? "#22c55e" : "#f59e0b",
              fontWeight: 600,
              padding: "6px 10px",
              background: diferencaRentabilidade >= 0 ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
              borderRadius: T.radiusMd,
              textAlign: "center"
            }}>
              {diferencaRentabilidade >= 0 ? "✓ Meta Atingida" : "⚠ Ajuste Necessário"}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 16, fontWeight: 500 }}>
          DADOS PRINCIPAIS
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 24
        }}>
          {[
            ["Patrimônio Necessário", brl(meta)],
            ["Patrimônio Atual", brl(inicial)],
            ["Aporte Mensal", moeda(aporte * 100)],
            ["Prazo Desejado", `${prazo} anos`],
            ["Prazo Necessário", anosNec ? `${anosNec} anos` : "50+ anos"],
            ["Meta de Rentabilidade", `${TAXA_ANUAL}% a.a. (1,16% a.m.)`],
            ["Inflação (IPCA)", `${ipca.toFixed(2)}%`],
            ["Renda em " + (prazo || 30) + " anos", projecao.length > 0 ? brl(projecao[projecao.length - 1]?.rendaMensalReal) : "—"]
          ].map(([label, valor], i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.03)",
              border: `0.5px solid ${T.border}`,
              borderRadius: T.radiusMd,
              padding: "12px 14px"
            }}>
              <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 6, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {label}
              </div>
              <div style={{ fontSize: 14, color: T.textPrimary, fontWeight: 500 }}>
                {valor}
              </div>
            </div>
          ))}
      </div>

      <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 16, fontWeight: 500, marginTop: 28 }}>
        PROJEÇÃO ANO A ANO
      </div>
      <div style={{
        background: "rgba(255,255,255,0.03)",
        border: `0.5px solid ${T.border}`,
        borderRadius: T.radiusMd,
        overflow: "hidden"
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `0.5px solid ${T.border}` }}>
              <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, color: T.textMuted, fontWeight: 500 }}>Ano</th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 11, color: T.textMuted, fontWeight: 500 }}>Patrimônio Real</th>
              <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 11, color: T.textMuted, fontWeight: 500 }}>Renda Mensal</th>
            </tr>
          </thead>
          <tbody>
            {projecao.map((p, i) => (
              <tr key={i} style={{ borderBottom: `0.5px solid ${T.border}` }}>
                <td style={{ padding: "10px 14px", fontSize: 12, color: T.textPrimary }}>Ano {Math.round(p.ano)}</td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: T.textPrimary, textAlign: "right" }}>{brl(p.totalReal)}</td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: T.textPrimary, textAlign: "right" }}>{brl(p.rendaMensalReal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    );
  };

  // ── SEÇÃO 3: SIMULADOR ──
  // Cálculos (fora da renderização para evitar remontagem de inputs)
  const aporteSimulado = inputAporte ? parseFloat(inputAporte) : aporte;
  const taxaSimulada = inputTaxa ? parseFloat(inputTaxa) : TAXA_ANUAL;
  const prazoSimulado = inputPrazo ? parseFloat(inputPrazo) : prazo;

  const calcularAporte = () => {
    const novo = inputAporte ? parseFloat(inputAporte) : aporte;
    setSimAporte(simularNovoAporte(inicial, meta, prazo, novo));
  };

  const calcularTaxa = () => {
    const nova = inputTaxa ? parseFloat(inputTaxa) : TAXA_ANUAL;
    setSimTaxa(simularNovaTaxa(inicial, aporte, meta, prazo, nova));
  };

  const calcularPrazo = () => {
    const novo = inputPrazo ? parseFloat(inputPrazo) : prazo;
    setSimPrazo(simularNovoPrazo(inicial, aporte, meta, novo));
  };

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

  const Simulador = () => {

    return (
      <div>
        <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 12, fontWeight: 500 }}>
          🔧 SIMULE CENÁRIOS
        </div>
        <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 20, lineHeight: 1.5 }}>
          Digite o valor que deseja e clique em "Calcular" para ver o resultado! ⚡ Rápido, preciso e sem travamentos.
        </div>

        {/* Simulação 1: Novo Aporte */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: `0.5px solid ${T.border}`,
          borderRadius: T.radiusMd,
          padding: "16px",
          marginBottom: 20
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: T.textPrimary }}>
            💰 E se aumentasse o aporte mensal?
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 16, textAlign: "center" }}>
              Valor atual: <strong style={{ fontSize: 14, color: T.textPrimary }}>{brl(aporte)}</strong>/mês
            </div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Digite aqui"
              value={inputAporte}
              onChange={(e) => setInputAporte(e.target.value.replace(/\D/g, ""))}
              style={{
                width: "100%",
                padding: "16px 12px",
                background: T.bg,
                border: `2px solid ${T.border}`,
                borderRadius: "10px",
                color: "#22c55e",
                fontSize: 24,
                fontWeight: 600,
                textAlign: "center"
              }}
            />
          </div>

          <button
            onClick={calcularAporte}
            style={{
              width: "100%",
              padding: "11px 16px",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 14,
              transition: "all 0.2s",
              boxShadow: "0 4px 12px rgba(102, 126, 234, 0.4)"
            }}
            onMouseEnter={(e) => e.currentTarget.style.filter = "brightness(1.1)"}
            onMouseLeave={(e) => e.currentTarget.style.filter = "brightness(1)"}
          >
            ✨ Calcular Resultado
          </button>

          {simAporte && (
            <div style={{
              background: "rgba(34,197,94,0.1)",
              border: "2px solid rgba(34,197,94,0.5)",
              borderRadius: "8px",
              padding: "12px",
              fontSize: 12,
              color: "#22c55e",
              lineHeight: 1.6,
              fontWeight: 500
            }}>
              ✅ Com <strong>R$ {brl(simAporte.aporte * 100)}/mês</strong><br/>
              Você chegaria em <strong>{simAporte.prazoNovo || "50+"} anos</strong><br/>
              <span style={{ fontSize: 11, opacity: 0.8 }}>⏱️ {Math.round((simAporte.economia || 0) * 10) / 10} anos mais rápido</span>
            </div>
          )}
        </div>

        {/* Simulação 2: Nova Taxa */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: `0.5px solid ${T.border}`,
          borderRadius: T.radiusMd,
          padding: "16px",
          marginBottom: 20
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: T.textPrimary }}>
            📈 E se tivesse uma rentabilidade maior?
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 16, textAlign: "center" }}>
              Rentabilidade atual: <strong style={{ fontSize: 14, color: T.textPrimary }}>{TAXA_ANUAL}% a.a.</strong>
            </div>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Digite aqui"
              value={inputTaxa}
              onChange={(e) => setInputTaxa(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*?)\./g, "$1"))}
              style={{
                width: "100%",
                padding: "16px 12px",
                background: T.bg,
                border: `2px solid ${T.border}`,
                borderRadius: "10px",
                color: "#f59e0b",
                fontSize: 24,
                fontWeight: 600,
                textAlign: "center"
              }}
            />
          </div>

          <button
            onClick={calcularTaxa}
            style={{
              width: "100%",
              padding: "11px 16px",
              background: "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 14,
              transition: "all 0.2s",
              boxShadow: "0 4px 12px rgba(245, 158, 11, 0.4)"
            }}
            onMouseEnter={(e) => e.currentTarget.style.filter = "brightness(1.1)"}
            onMouseLeave={(e) => e.currentTarget.style.filter = "brightness(1)"}
          >
            ✨ Calcular Resultado
          </button>

          {simTaxa && (
            <div style={{
              background: "rgba(34,197,94,0.1)",
              border: "2px solid rgba(34,197,94,0.5)",
              borderRadius: "8px",
              padding: "12px",
              fontSize: 12,
              color: "#22c55e",
              lineHeight: 1.6,
              fontWeight: 500
            }}>
              ✅ Com <strong>{simTaxa.taxaNova.toFixed(2)}% a.a.</strong> de rentabilidade<br/>
              Você chegaria em <strong>{simTaxa.prazoNovo || "50+"} anos</strong><br/>
              <span style={{ fontSize: 11, opacity: 0.8 }}>⏱️ {Math.round((simTaxa.economia || 0) * 10) / 10} anos mais rápido</span>
            </div>
          )}
        </div>

        {/* Simulação 3: Novo Prazo */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: `0.5px solid ${T.border}`,
          borderRadius: T.radiusMd,
          padding: "16px",
          marginBottom: 20
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: T.textPrimary }}>
            ⏰ E se estendesse o prazo?
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 16, textAlign: "center" }}>
              Prazo atual: <strong style={{ fontSize: 14, color: T.textPrimary }}>{prazo || 10} anos</strong>
            </div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Digite aqui"
              value={inputPrazo}
              onChange={(e) => setInputPrazo(e.target.value.replace(/\D/g, ""))}
              style={{
                width: "100%",
                padding: "16px 12px",
                background: T.bg,
                border: `2px solid ${T.border}`,
                borderRadius: "10px",
                color: "#10b981",
                fontSize: 24,
                fontWeight: 600,
                textAlign: "center"
              }}
            />
          </div>

          <button
            onClick={calcularPrazo}
            style={{
              width: "100%",
              padding: "11px 16px",
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              marginBottom: 14,
              transition: "all 0.2s",
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.4)"
            }}
            onMouseEnter={(e) => e.currentTarget.style.filter = "brightness(1.1)"}
            onMouseLeave={(e) => e.currentTarget.style.filter = "brightness(1)"}
          >
            ✨ Calcular Resultado
          </button>

          {simPrazo && (
            <div style={{
              background: "rgba(34,197,94,0.1)",
              border: "2px solid rgba(34,197,94,0.5)",
              borderRadius: "8px",
              padding: "12px",
              fontSize: 12,
              color: "#22c55e",
              lineHeight: 1.6,
              fontWeight: 500
            }}>
              ✅ Com <strong>{Math.round(inputPrazo || 0)} anos</strong> de prazo<br/>
              Você precisaria de <strong>R$ {brl((simPrazo.aporteNecessario || 0) * 100)}/mês</strong><br/>
              <span style={{ fontSize: 11, opacity: 0.8 }}>📉 Redução: {Math.round(simPrazo.reducao || 0)}% do aporte atual</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── SEÇÃO 4: ACOMPANHAMENTO MENSAL ──
  const Acompanhamento = () => {
    const historico = objetivo?.historicoAcompanhamento || [];
    const temHistorico = historico.length > 0;

    const hoje = new Date();
    const mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const totalMeses = Math.max(prazo * 12, 12);

    const jMensal = Math.pow(1 + TAXA_ANUAL / 100, 1 / 12) - 1;
    const metaRentPct = parseFloat((jMensal * 100).toFixed(2));

    // Gera linhas: mês atual até fim do prazo
    const linhas = [];
    let patrimonioAlvo = inicial;
    for (let i = 0; i < totalMeses; i++) {
      const data = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + i, 1);
      const mesAnoKey = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
      const mesLabel = data.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      patrimonioAlvo = patrimonioAlvo * (1 + jMensal) + aporte;
      const dadoHist = historico.find(h => h.mesAno === mesAnoKey);
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

    const thS = {
      padding: "12px 14px", textAlign: "left", fontSize: 12,
      color: T.textMuted, fontWeight: 500, whiteSpace: "nowrap",
      borderRight: `0.5px solid ${T.border}`,
    };
    const tdS = {
      padding: "11px 14px", fontSize: 13, color: T.textPrimary,
      borderRight: `0.5px solid ${T.border}`, whiteSpace: "nowrap",
    };

    function PillStatus({ s }) {
      if (!s) return <span style={{ color: T.textMuted, fontSize: 10 }}>—</span>;
      const map = {
        meta_batida: ["Meta Batida", "#22c55e", "rgba(34,197,94,0.12)"],
        meta_parcial: ["Meta Parcial", "#f59e0b", "rgba(245,158,11,0.12)"],
        nao_bateu:   ["Não Bateu",   "#ef4444", "rgba(239,68,68,0.12)"],
      };
      const [label, cor, bg] = map[s] || ["—", T.textMuted, "transparent"];
      return (
        <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: bg, color: cor, fontWeight: 600, whiteSpace: "nowrap" }}>
          {label}
        </span>
      );
    }

    return (
      <div>
        {/* ── Histórico accordion ── */}
        <div style={{ border: `0.5px solid ${T.border}`, borderRadius: T.radiusMd, marginBottom: 24, overflow: "hidden" }}>
          <button
            onClick={() => setHistoricoAberto(h => !h)}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "rgba(255,255,255,0.02)", border: "none", cursor: "pointer", color: T.textPrimary, fontFamily: T.fontFamily }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13 }}>📋</span>
              <span style={{ fontSize: 13, fontWeight: 400 }}>Histórico Registrado</span>
              {temHistorico
                ? <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>{historico.length} {historico.length === 1 ? "mês" : "meses"}</span>
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
              {temHistorico && historico
                .slice()
                .sort((a, b) => b.mesAno.localeCompare(a.mesAno))
                .map((h, i) => {
                  const lbl = new Date(h.mesAno + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                  const aOk = (h.aporteRealizado || 0) >= aporte;
                  const rOk = (h.rentabilidadeCarteira || 0) >= metaRentPct;
                  const st = aOk && rOk ? "meta_batida" : aOk || rOk ? "meta_parcial" : "nao_bateu";
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px", borderBottom: i < historico.length - 1 ? `0.5px solid ${T.border}` : "none", fontSize: 12 }}>
                      <span style={{ color: T.textPrimary, textTransform: "capitalize" }}>{lbl}</span>
                      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                        <span style={{ color: T.textSecondary }}>Carteira: {brl(h.valorCarteira || 0)}</span>
                        <span style={{ color: T.textSecondary }}>Aporte: {brl(h.aporteRealizado || 0)}</span>
                        <span style={{ color: T.textSecondary }}>Rent.: {(h.rentabilidadeCarteira || 0).toFixed(2)}%</span>
                        <PillStatus s={st} />
                      </div>
                    </div>
                  );
                })
              }
            </div>
          )}
        </div>

        {/* ── Cabeçalho da tabela ── */}
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
            Meta final: {brl(meta)}<br/>
            <span style={{ color: T.textMuted }}>Aporte comprometido: {brl(aporte)}/mês</span>
          </div>
        </div>

        {/* ── Tabela ── */}
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
                  : linha.isAtual
                  ? "rgba(240,162,2,0.05)"
                  : "transparent";

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
                    <td style={{ ...tdS, textAlign: "right", color: T.textSecondary }}>
                      {brl(linha.patrimonioAlvo)}
                    </td>
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

        {/* Legenda */}
        <div style={{ marginTop: 14, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: T.textMuted, lineHeight: 1.8 }}>
          <span><span style={{ color: "#22c55e" }}>●</span> Meta Batida — aporte e rentabilidade atingidos</span>
          <span><span style={{ color: "#f59e0b" }}>●</span> Meta Parcial — apenas uma meta atingida</span>
          <span><span style={{ color: "#ef4444" }}>●</span> Não Bateu — nenhuma meta atingida</span>
          <span><span style={{ color: T.gold }}>●</span> Mês atual</span>
        </div>
      </div>
    );
  };

  // ── SEÇÃO 5: ATIVOS (PREPARADO) ──
  const Ativos = () => (
    <div>
      <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 16, fontWeight: 500 }}>
        ATIVOS VINCULADOS A ESTE OBJETIVO
      </div>
      <div style={{
        background: "rgba(255,255,255,0.03)",
        border: `0.5px solid ${T.border}`,
        borderRadius: T.radiusMd,
        padding: "24px",
        textAlign: "center"
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>💼</div>
        <div style={{ fontSize: 14, color: T.textPrimary, marginBottom: 8, fontWeight: 500 }}>
          Nenhum ativo vinculado ainda
        </div>
        <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.6 }}>
          Quando você vincular ativos da sua carteira de investimentos a este objetivo,<br/>
          você poderá acompanhar o desempenho em tempo real aqui.
        </div>
      </div>
      <div style={{
        marginTop: 16,
        padding: "12px 14px",
        background: "rgba(255,255,255,0.03)",
        border: `0.5px solid ${T.border}`,
        borderRadius: T.radiusMd,
        fontSize: 12,
        color: T.textSecondary
      }}>
        📌 Em breve você poderá visualizar seus ativos (ações, FIIs, ETFs) e como estão contribuindo para realizar este sonho.
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      <Navbar />
      <div style={{ padding: "20px" }}>

        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <Cabecalho />

          <Abas ativa={abaAtiva} onChange={setAbaAtiva} />

          {abaAtiva === "resumo" && <Resumo />}
          {abaAtiva === "simulador" && <Simulador />}
          {abaAtiva === "acompanhamento" && <Acompanhamento />}
          {abaAtiva === "ativos" && <Ativos />}
        </div>
      </div>
    </div>
  );
}
