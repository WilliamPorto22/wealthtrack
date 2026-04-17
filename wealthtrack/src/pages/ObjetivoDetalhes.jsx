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
  viagem: "✈️",
  educacao: "📚",
  saude: "💪",
  sucessaoPatrimonial: "👨‍👩‍👧‍👦",
  personalizado: "⭐"
};

const gradientsPorTipo = {
  aposentadoria: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  imovel: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  viagem: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  educacao: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  saude: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  sucessaoPatrimonial: "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
  personalizado: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)"
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
    // Calcular patrimônio esperado para cada mês
    const j = Math.pow(1 + TAXA_ANUAL / 100, 1 / 12) - 1;
    let patrimonioMesAnterior = inicial;
    const dadosMeses = [];

    for (let mes = 1; mes <= 24; mes++) {
      patrimonioMesAnterior = patrimonioMesAnterior * (1 + j) + aporte;
      const movimentacao = cliente?.acompanhamentoMensal?.find(m => m.mes === mes % 12 || 12);
      const aporteRealizado = movimentacao?.aporteRealizado || 0;
      const atingiu = aporteRealizado >= (aporte * 100);
      const ehFuturo = mes > 12;

      dadosMeses.push({
        mes,
        mesNum: mes % 12 || 12,
        ano: Math.ceil(mes / 12),
        patrimonioEsperado: patrimonioMesAnterior,
        aporteRealizado,
        atingiu,
        temDados: mes <= 12 && !!movimentacao,
        ehFuturo
      });
    }

    return (
      <div>
        <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 16, fontWeight: 500 }}>
          📊 ACOMPANHAMENTO: PASSADO (12 MESES) + FUTURO (12 MESES)
        </div>

        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: `0.5px solid ${T.border}`,
          borderRadius: T.radiusMd,
          overflow: "hidden"
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `0.5px solid ${T.border}`, background: "rgba(255,255,255,0.02)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, color: T.textMuted, fontWeight: 500 }}>Período</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 11, color: T.textMuted, fontWeight: 500 }}>Planejado</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 11, color: T.textMuted, fontWeight: 500 }}>Realizado</th>
                <th style={{ padding: "10px 14px", textAlign: "right", fontSize: 11, color: T.textMuted, fontWeight: 500 }}>Patrimônio Esperado</th>
                <th style={{ padding: "10px 14px", textAlign: "center", fontSize: 11, color: T.textMuted, fontWeight: 500 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {/* Separador: Passado */}
              <tr style={{ background: "rgba(34,197,94,0.1)" }}>
                <td colSpan="5" style={{ padding: "8px 14px", fontSize: 11, fontWeight: 600, color: "#22c55e" }}>
                  ✓ PASSADO - Últimos 12 Meses
                </td>
              </tr>

              {dadosMeses.slice(0, 12).map((d, i) => (
                <tr key={i} style={{ borderBottom: `0.5px solid ${T.border}` }}>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: T.textPrimary }}>Mês {d.mesNum}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: T.textPrimary, textAlign: "right" }}>
                    {brl(aporte * 100)}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: T.textPrimary, textAlign: "right" }}>
                    {d.temDados ? brl(d.aporteRealizado) : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: T.textPrimary, textAlign: "right" }}>
                    {brl(d.patrimonioEsperado)}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12 }}>
                    {!d.temDados && <span style={{ color: T.textMuted }}>—</span>}
                    {d.temDados && d.atingiu && <span style={{ color: "#22c55e", fontWeight: 600 }}>✓ OK</span>}
                    {d.temDados && !d.atingiu && <span style={{ color: "#ef4444", fontWeight: 600 }}>✗ Abaixo</span>}
                  </td>
                </tr>
              ))}

              {/* Separador: Futuro */}
              <tr style={{ background: "rgba(100,150,200,0.1)" }}>
                <td colSpan="5" style={{ padding: "8px 14px", fontSize: 11, fontWeight: 600, color: "#60a5fa" }}>
                  📈 FUTURO - Próximos 12 Meses (Projeção)
                </td>
              </tr>

              {dadosMeses.slice(12, 24).map((d, i) => (
                <tr key={i + 12} style={{ borderBottom: `0.5px solid ${T.border}`, opacity: 0.8 }}>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: T.textPrimary }}>
                    <span style={{ fontSize: 11, color: T.textMuted }}>Ano 2 -</span> Mês {d.mesNum}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: T.textPrimary, textAlign: "right" }}>
                    {brl(aporte * 100)}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: T.textMuted, textAlign: "right", fontStyle: "italic" }}>
                    Projeção
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: T.textPrimary, textAlign: "right" }}>
                    {brl(d.patrimonioEsperado)}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12 }}>
                    <span style={{ color: "#60a5fa", fontSize: 11 }}>→ Meta</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12
        }}>
          <div style={{
            padding: "12px 14px",
            background: "rgba(34,197,94,0.1)",
            border: "0.5px solid rgba(34,197,94,0.3)",
            borderRadius: T.radiusMd,
            fontSize: 12,
            color: "#22c55e"
          }}>
            ✓ <strong>Passado:</strong> Histórico real dos aportes realizados nos últimos 12 meses.
          </div>

          <div style={{
            padding: "12px 14px",
            background: "rgba(100,150,200,0.1)",
            border: "0.5px solid rgba(100,150,200,0.3)",
            borderRadius: T.radiusMd,
            fontSize: 12,
            color: "#60a5fa"
          }}>
            📈 <strong>Futuro:</strong> Projeção dos próximos 12 meses se você continuar com o aporte de R$ {Math.round(aporte).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mês.
          </div>
        </div>

        <div style={{
          marginTop: 16,
          padding: "12px 14px",
          background: "rgba(255,255,255,0.03)",
          border: `0.5px solid ${T.border}`,
          borderRadius: T.radiusMd,
          fontSize: 12,
          color: T.textSecondary,
          lineHeight: 1.6
        }}>
          💡 <strong>Como ler:</strong> A projeção futura é calculada assumindo que você mantenha o aporte mensal constante. Se conseguir uma rentabilidade maior ou aumentar os aportes, o prazo será reduzido e você chegará ao seu objetivo mais rápido! Cada mês que passa, esses dados são atualizados automaticamente.
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
