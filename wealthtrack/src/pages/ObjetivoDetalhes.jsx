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
            borderBottom: ativa === aba ? `2px solid ${T.gold}` : "none",
            color: ativa === aba ? T.textPrimary : T.textMuted,
            fontSize: 13,
            fontWeight: ativa === aba ? 500 : 400,
            cursor: "pointer",
            whiteSpace: "nowrap",
            textTransform: "capitalize"
          }}
        >
          {aba === "resumo" && "📊 Resumo"}
          {aba === "simulador" && "💡 Estratégias"}
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

        {/* Comparação visual antes → depois */}
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
      <div>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            Estratégias Personalizadas
          </div>
          <div style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.8 }}>
            Baseado nos dados do seu objetivo e nas diretrizes técnicas do planejamento financeiro certificado (CFP),
            mapeamos os caminhos mais eficientes para alcançar sua meta com o menor custo e maior previsibilidade.
          </div>
        </div>

        {/* Status Mini Card */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: `0.5px solid ${T.border}`,
          borderRadius: T.radiusMd,
          padding: "16px 20px",
          marginBottom: 28,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
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

        {/* Ajustar a Rota */}
        <div style={{
          fontSize: 10, color: T.textMuted, letterSpacing: "0.18em", textTransform: "uppercase",
          marginBottom: 16, display: "flex", alignItems: "center", gap: 10
        }}>
          <span style={{ whiteSpace: "nowrap" }}>Ajustar a Rota</span>
          <div style={{ flex: 1, height: "0.5px", background: T.border }} />
        </div>

        <CardPlano
          numero="01"
          codigo="M+"
          titulo="Ajuste do Aporte Mensal"
          subtitulo="Rota Principal"
          cor="#22c55e"
          descricao={
            status === "viavel"
              ? "O plano está no caminho certo. A consistência no aporte atual é suficiente para atingir a meta dentro do prazo estabelecido. Um incremento adicional amplia a margem de segurança e antecipa a conquista."
              : `A disciplina de aportes é o principal fator de sucesso no acúmulo patrimonial de longo prazo. Para atingir ${brl(meta)} em ${prazo} anos, o aporte mensal necessário é de ${brl(aporteNecessario)}.`
          }
          destaque={
            status === "viavel"
              ? `Aporte atual de ${brl(aporte)}/mês garante a meta no prazo estabelecido`
              : `Aporte necessário: ${brl(aporteNecessario)}/mês  (+${brl(aumentoNecessario)}/mês  —  +${percentualAumento}%)`
          }
          itens={[
            status !== "viavel"
              ? `Ajuste mensal necessário: ${brl(aumentoNecessario)} adicionais por mês, representando ${percentualAumento}% acima do aporte atual`
              : "Aporte atual dentro do planejamento — mantenha a consistência e realize revisões anuais para preservar o poder real de acumulação",
            "Automatize os aportes via débito automático na data de recebimento do salário, eliminando o viés comportamental de postergação do investimento",
            "Reajuste o aporte pelo IPCA anualmente para preservar o poder real de acumulação e não perder terreno para a inflação ao longo do prazo",
            "Redirecione receitas extraordinárias integralmente ao objetivo: 13º salário, bônus, PLR e restituição de IR têm impacto desproporcional no longo prazo",
            "Controle o lifestyle inflation: a cada incremento de renda, comprometa ao menos 50% do aumento com o aporte — comportamento validado pelo CFP como fator crítico de sucesso"
          ]}
        />

        <CardPlano
          numero="02"
          codigo="T+"
          titulo="Extensão Estratégica do Prazo"
          subtitulo="Rota Alternativa"
          cor="#3b82f6"
          descricao={
            prazoEstendido && prazoEstendido <= prazo
              ? `O plano está adiantado. Mantendo o aporte atual de ${brl(aporte)}/mês, a meta de ${brl(meta)} será atingida em ${prazoEstendido} anos — ${Math.round((prazo - prazoEstendido) * 10) / 10} anos antes do prazo original estabelecido.`
              : prazoEstendido
              ? `Um horizonte de investimento maior potencializa o efeito dos juros compostos de forma não linear. Mantendo o aporte atual de ${brl(aporte)}/mês, a meta será atingida em ${prazoEstendido} anos.`
              : `Com o aporte atual, o objetivo levaria mais de 50 anos para ser atingido. A extensão de prazo isolada não resolve — o ajuste de aporte é indispensável para viabilizar o plano.`
          }
          destaque={
            prazoEstendido && prazoEstendido <= prazo
              ? `Meta atingida em ${prazoEstendido} anos — ${Math.round((prazo - prazoEstendido) * 10) / 10} anos antes do prazo previsto`
              : prazoEstendido
              ? `Prazo real com aporte atual: ${prazoEstendido} anos  (+${anosExtras} anos além do planejado)`
              : "Prazo projetado: superior a 50 anos com o aporte atual"
          }
          itens={[
            prazoEstendido
              ? `Projeção consolidada: ${brl(meta)} atingidos em ${prazoEstendido} anos mantendo ${brl(aporte)}/mês sem alteração nos aportes`
              : "Aporte atual insuficiente para qualquer horizonte razoável — o ajuste de contribuição mensal é a ação prioritária",
            "Prazo mais longo permite alocação maior em renda variável, historicamente superior à renda fixa em horizontes acima de 5 anos com menor custo real de risco",
            "Combine extensão de prazo com aumentos graduais de aporte — a convergência das duas alavancas é mais eficiente do que cada uma aplicada isoladamente",
            "Defina marcos intermediários de patrimônio para monitoramento e manutenção do comprometimento ao longo do horizonte de planejamento",
            "O custo de adiar o início dos aportes é assimétrico: cada ano de postergação exige esforço de recuperação desproporcional nos anos subsequentes"
          ]}
        />

        {/* Alternativas estratégicas por tipo */}
        {planos.length > 0 && (
          <>
            <div style={{
              fontSize: 10, color: T.textMuted, letterSpacing: "0.18em", textTransform: "uppercase",
              marginBottom: 16, marginTop: 28, display: "flex", alignItems: "center", gap: 10
            }}>
              <span style={{ whiteSpace: "nowrap" }}>Alternativas Estratégicas</span>
              <div style={{ flex: 1, height: "0.5px", background: T.border }} />
            </div>

            {planos.map(p => (
              <CardPlano key={p.numero} {...p} />
            ))}
          </>
        )}

        {/* Nota CFP */}
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
          {/* Botão Voltar */}
          <button
            onClick={() => navigate(-1)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "none", border: "none",
              color: T.textMuted, cursor: "pointer",
              fontSize: 12, marginBottom: 20, padding: 0,
              fontFamily: T.fontFamily, letterSpacing: "0.06em",
              textTransform: "uppercase", transition: "color 0.2s"
            }}
            onMouseEnter={e => e.currentTarget.style.color = T.textPrimary}
            onMouseLeave={e => e.currentTarget.style.color = T.textMuted}
          >
            ← Voltar
          </button>

          <Cabecalho />

          <Abas ativa={abaAtiva} onChange={setAbaAtiva} />

          {abaAtiva === "resumo" && <Resumo />}
          {abaAtiva === "simulador" && <Planos />}
          {abaAtiva === "acompanhamento" && <Acompanhamento />}
          {abaAtiva === "ativos" && <Ativos />}
        </div>
      </div>
    </div>
  );
}
