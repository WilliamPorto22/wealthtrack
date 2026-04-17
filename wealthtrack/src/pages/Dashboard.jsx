import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { obterTodasAsCotacoes, mercadoAberto, proximoHorarioAtualizacao, INTERVALO_ATUALIZACAO, HORARIO_MERCADO } from "../services/cotacoesReais";
import { Navbar } from "../components/Navbar";


// Cotações padrão (atualizadas a cada 2 horas durante horário de mercado)
const MERCADO_PADRAO=[
  {label:"Dólar",    valor:"R$ 5,08",  sub:"-1,0% hoje",  cor:"#ef4444"},
  {label:"Selic",    valor:"14,75%",   sub:"a.a.",         cor:"#6b7280"},
  {label:"IPCA",     valor:"4,14%",    sub:"12 meses",     cor:"#6b7280"},
  {label:"Ibovespa", valor:"197.000",  sub:"+21% no ano",  cor:"#22c55e"},
  {label:"S&P 500",  valor:"5.396",    sub:"+10% no ano",  cor:"#22c55e"},
];

const SEGS=["Digital","Ascensão","Exclusive","Private"];
const SEG_COLORS={
  "Digital":    {color:"#38bdf8", bg:"rgba(56,189,248,0.12)",  border:"rgba(56,189,248,0.30)"},
  "Ascensão":   {color:"#4ade80", bg:"rgba(74,222,128,0.12)",  border:"rgba(74,222,128,0.30)"},
  "Exclusive":  {color:"#f59e0b", bg:"rgba(245,158,11,0.12)",  border:"rgba(245,158,11,0.30)"},
  "Private":    {color:"#c084fc", bg:"rgba(192,132,252,0.12)", border:"rgba(192,132,252,0.30)"},
};
// Removido: user-select para evitar cursor piscante não profissional
const font="-apple-system,'SF Pro Display',sans-serif";
const BG="#0D1321", CARD="#1D2D44", BD="rgba(62,92,118,0.35)";

function segAuto(p){
  const v=parseInt(String(p||"0").replace(/\D/g,""))/100;
  if(v<150000)return"Digital";
  if(v<400000)return"Ascensão";
  if(v<1000000)return"Exclusive";
  return"Private";
}
function brl(v){
  const n=parseInt(String(v||"0").replace(/\D/g,""))/100;
  if(!n)return"—";
  return n.toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2});
}

// Calcula patrimônio total dos clientes
function calcularPatrimonioTotal(clientes){
  return clientes.reduce((total,c)=>{
    const patrimonio=parseInt(String(c.patrimonio||"0").replace(/\D/g,""))/100;
    return total+patrimonio;
  },0);
}


// Conta clientes ativos (com patrimônio > 0)
function contarClientesAtivos(clientes){
  return clientes.filter(c=>{
    const patrimonio=parseInt(String(c.patrimonio||"0").replace(/\D/g,""))/100;
    return patrimonio>0;
  }).length;
}

// ── Lógica CRM ───────────────────────────────────────────────

// Aporte: verifica se teve aporte registrado este mês
function statusAporte(c){
  if(!c.lastAporteDate)return"sem_aporte";
  try{
    const d=c.lastAporteDate.toDate?c.lastAporteDate.toDate():new Date(c.lastAporteDate);
    const hoje=new Date();
    if(d.getMonth()===hoje.getMonth()&&d.getFullYear()===hoje.getFullYear())return"aportando";
  }catch{}
  return"sem_aporte";
}

// Revisão: obrigatória todo mês até dia 15
function statusRevisao(c){
  const hoje=new Date();
  if(!c.lastReviewDate)return"atrasada";
  try{
    const r=c.lastReviewDate.toDate?c.lastReviewDate.toDate():new Date(c.lastReviewDate);
    // Mesmo mês = ok
    if(r.getMonth()===hoje.getMonth()&&r.getFullYear()===hoje.getFullYear())return"ok";
    // Mês diferente — se já passou dia 15, atrasado
    return hoje.getDate()>15?"atrasada":"ok";
  }catch{return"atrasada";}
}

// Follow-up vencido: nextContactDate passou
function followUpVencido(c){
  if(!c.nextContactDate)return false;
  try{
    const d=new Date(c.nextContactDate);
    return d<new Date();
  }catch{return false;}
}

// Plano inviável
function temInviavel(c){
  return(c.objetivos||[]).some(o=>{
    const j=Math.pow(1+14/100,1/12)-1;
    const infl=Math.pow(1+3.81/100,1/12)-1;
    const meta=parseInt(String(o.meta||"0").replace(/\D/g,""))/100;
    const aporte=parseInt(String(o.aporte||"0").replace(/\D/g,""))/100;
    const inicial=parseInt(String(o.patrimAtual||"0").replace(/\D/g,""))/100;
    const prazo=parseInt(o.prazo)||0;
    if(!meta||!prazo)return false;
    let vt=inicial;
    for(let m=1;m<=prazo*12;m++){
      vt=vt*(1+j)+aporte;
      if(vt/Math.pow(1+infl,m)>=meta)return false;
    }
    return true;
  });
}

// ── Avatares ─────────────────────────────────────────────────
const SVG={
  homem:(c)=><svg viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  mulher:(c)=><svg viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path d="M9 21h6M12 17v4"/></svg>,
  idoso_h:(c)=><svg viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><circle cx="12" cy="7" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path d="M8 20l2-4"/></svg>,
  idoso_m:(c)=><svg viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><circle cx="12" cy="7" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path d="M9 21h6M12 17v3"/></svg>,
  cachorro:(c)=><svg viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><path d="M10 5.5C10 4 11 3 12.5 3S15 4 15 5.5v1l3 1.5v3l-2 1v5a2 2 0 01-4 0v-2h-1v2a2 2 0 01-4 0v-5L5 10V8l3-1.5v-1z"/></svg>,
  gato:(c)=><svg viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}><path d="M4 6l2 3c0 5 2 8 6 8s6-3 6-8l2-3-3 1-2-3-1 2h-4l-1-2-3 3z"/><path d="M10 15s.5 1 2 1 2-1 2-1"/></svg>,
};
const AV=[
  {key:"homem",   bg:"linear-gradient(135deg,#1a3560,#0d2040)",cor:"#60a5fa"},
  {key:"mulher",  bg:"linear-gradient(135deg,#3d1560,#20083d)",cor:"#c084fc"},
  {key:"idoso_h", bg:"linear-gradient(135deg,#1a3020,#0d2010)",cor:"#86efac"},
  {key:"idoso_m", bg:"linear-gradient(135deg,#3d1a30,#200d18)",cor:"#f9a8d4"},
  {key:"cachorro",bg:"linear-gradient(135deg,#2a1a0d,#150d06)",cor:"#fbbf24"},
  {key:"gato",    bg:"linear-gradient(135deg,#1a1a3d,#0d0d20)",cor:"#a5b4fc"},
];

export function AvatarIcon({tipo,size=32}){
  const o=AV.find(a=>a.key===tipo)||AV[0];
  const f=SVG[o.key]||SVG.homem;
  return(
    <div style={{width:size,height:size,borderRadius:Math.round(size*.25),background:o.bg,border:"1px solid rgba(240,162,2,.18)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
      {f(o.cor)}
    </div>
  );
}

// Card cliente — tamanho 100% fixo
function ClientCard({c,onClick,sAporte,sRevisao,inviavel,followUp}){
  const bordaAtencao=sAporte==="sem_aporte"||sRevisao==="atrasada"||followUp;
  return(
    <div onClick={onClick} style={{
      background:CARD,
      border:`0.5px solid ${bordaAtencao?"rgba(245,158,11,0.35)":BD}`,
      borderRadius:14,padding:"13px",cursor:"pointer",
      height:128,width:"100%",minWidth:0,
      boxSizing:"border-box",
      display:"flex",flexDirection:"column",justifyContent:"space-between",
      overflow:"hidden",
    }}>
      <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
        <AvatarIcon tipo={c.avatar||"homem"} size={28}/>
        <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
          <div style={{fontSize:11,color:"#F0EBD8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.nome}</div>
          <div style={{fontSize:10,color:"#3E5C76",marginTop:1}}>{c.uf||"—"}</div>
        </div>
      </div>
      <div style={{fontSize:12,color:"#FFB20F",fontWeight:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{brl(c.patrimonio)}</div>
      <div style={{display:"flex",gap:4,flexWrap:"nowrap",overflow:"hidden"}}>
        <span style={{fontSize:9,padding:"2px 7px",borderRadius:20,flexShrink:0,
          background:sAporte==="aportando"?"rgba(34,197,94,0.12)":"rgba(239,68,68,0.12)",
          color:sAporte==="aportando"?"#22c55e":"#ef4444"}}>
          {sAporte==="aportando"?"Aportando":"Sem aporte"}
        </span>
        {sRevisao==="atrasada"&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,background:"rgba(245,158,11,0.12)",color:"#f59e0b",flexShrink:0}}>Revisão</span>}
        {inviavel&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,background:"rgba(239,68,68,0.12)",color:"#ef4444",flexShrink:0}}>Inviável</span>}
        {followUp&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,background:"rgba(168,85,247,0.12)",color:"#a855f7",flexShrink:0}}>Follow-up</span>}
      </div>
    </div>
  );
}

// Converte cotações da API para o formato do dashboard
function formatarCotacoes(cotacoes) {
  if (!cotacoes) return MERCADO_PADRAO;

  return [
    {
      label: "Dólar",
      valor: `R$ ${cotacoes.dolar?.valor?.toFixed(2) || "5,08"}`,
      sub: cotacoes.dolar?.tipo || "Histórico diário",
      cor: "#ef4444"
    },
    {
      label: "Selic",
      valor: `${cotacoes.selic?.valor?.toFixed(2) || "14,75"}%`,
      sub: cotacoes.selic?.tipo || "Último relatório",
      cor: "#6b7280"
    },
    {
      label: "IPCA",
      valor: `${cotacoes.ipca?.valor?.toFixed(2) || "4,14"}%`,
      sub: cotacoes.ipca?.tipo || "Últimos 12 meses",
      cor: "#6b7280"
    },
    {
      label: "Ibovespa",
      valor: `${Math.round(cotacoes.ibovespa?.valor || 197000).toLocaleString("pt-BR")}`,
      sub: cotacoes.ibovespa?.tipo || "Histórico do dia",
      cor: "#22c55e"
    },
    {
      label: "S&P 500",
      valor: `${Math.round(cotacoes.sp500?.valor || 5396).toLocaleString("pt-BR")}`,
      sub: cotacoes.sp500?.tipo || "Histórico do dia",
      cor: "#22c55e"
    }
  ];
}

// ── Dashboard ─────────────────────────────────────────────────
export default function Dashboard(){
  const [clientes,setClientes]=useState([]);
  const [busca,setBusca]=useState("");
  const [filtroAtivo,setFiltroAtivo]=useState(null);
  const [mercado,setMercado]=useState(MERCADO_PADRAO);
  const [atualizando,setAtualizando]=useState(false);
  const [ultimaAtualizacao,setUltimaAtualizacao]=useState(null);
  const [statusMercado,setStatusMercado]=useState(mercadoAberto());
  const nav=useNavigate();
  const clientesRef=useRef(null);
  const intervaloRef=useRef(null);

  // Atualizar cotações do servidor
  const atualizarCotacoesServidor=async()=>{
    setAtualizando(true);
    try{
      const cotacoes=await obterTodasAsCotacoes();
      const formatted=formatarCotacoes(cotacoes);
      setMercado(formatted);
      setUltimaAtualizacao(new Date().toLocaleTimeString("pt-BR"));

      // Salvar em localStorage para fallback
      localStorage.setItem("wealthtrack_cotacoes",JSON.stringify({
        ...cotacoes,
        formatted,
        timestamp: new Date().toISOString()
      }));
    }catch(e){
      console.error("Erro ao atualizar cotações:",e);
      // Se falhar, tenta carregar do localStorage
      try{
        const stored=localStorage.getItem("wealthtrack_cotacoes");
        if(stored){
          const data=JSON.parse(stored);
          if(data.formatted)setMercado(data.formatted);
        }
      }catch{}
    }finally{
      setAtualizando(false);
    }
  };

  // Configurar atualização automática
  useEffect(()=>{
    // Carregar clientes
    getDocs(collection(db,"clientes")).then(s=>{
      const clientesData=s.docs.map(d=>({id:d.id,...d.data()}));
      setClientes(clientesData);
    }).catch(e=>console.error("Erro ao carregar clientes:",e));

    // Atualizar cotações imediatamente na primeira carga
    atualizarCotacoesServidor();

    // Função para configurar o intervalo de atualização
    const configurarIntervalo=()=>{
      // Verificar se mercado está aberto
      const aberto=mercadoAberto();
      setStatusMercado(aberto);

      if(aberto){
        // Mercado aberto - atualizar a cada 2 horas
        if(intervaloRef.current)clearInterval(intervaloRef.current);
        intervaloRef.current=setInterval(()=>{
          atualizarCotacoesServidor();
        },INTERVALO_ATUALIZACAO);
      }else{
        // Mercado fechado - limpar intervalo
        if(intervaloRef.current)clearInterval(intervaloRef.current);

        // Agendar verificação a cada minuto para quando abrir
        if(intervaloRef.current)clearInterval(intervaloRef.current);
        intervaloRef.current=setInterval(()=>{
          const agoraAberto=mercadoAberto();
          if(agoraAberto!==statusMercado){
            setStatusMercado(agoraAberto);
            if(agoraAberto)atualizarCotacoesServidor();
          }
        },60000); // Verificar a cada minuto
      }
    };

    configurarIntervalo();

    return()=>{
      if(intervaloRef.current)clearInterval(intervaloRef.current);
    };
  },[statusMercado]);

  // Calcular status de cada cliente
  const clientesComStatus=clientes.map(c=>({
    ...c,
    _sAporte: statusAporte(c),
    _sRevisao: statusRevisao(c),
    _inviavel: temInviavel(c),
    _followUp: followUpVencido(c),
  }));

  // Alertas reais
  const semAporte  =clientesComStatus.filter(c=>c._sAporte==="sem_aporte");
  const semRevisao =clientesComStatus.filter(c=>c._sRevisao==="atrasada");
  const comInviavel=clientesComStatus.filter(c=>c._inviavel);
  const comFollowUp=clientesComStatus.filter(c=>c._followUp);

  // Agrupamento por segmento
  const porSeg={};
  SEGS.forEach(s=>{porSeg[s]=[];});
  clientesComStatus.forEach(c=>{
    const s=c.segmento||segAuto(c.patrimonio);
    if(porSeg[s])porSeg[s].push(c);
  });

  // Filtro inteligente
  function aplicarFiltro(tipo){
    if(filtroAtivo===tipo){setFiltroAtivo(null);return;}
    setFiltroAtivo(tipo);
    // Scroll suave para seção de clientes
    setTimeout(()=>{
      clientesRef.current?.scrollIntoView({behavior:"smooth",block:"start"});
    },100);
  }

  // Clientes filtrados para exibição na lista
  function clientesFiltrados(){
    let lista=clientesComStatus;
    if(busca)lista=lista.filter(c=>c.nome?.toLowerCase().includes(busca.toLowerCase()));
    if(filtroAtivo==="semAporte") lista=lista.filter(c=>c._sAporte==="sem_aporte");
    if(filtroAtivo==="semRevisao")lista=lista.filter(c=>c._sRevisao==="atrasada");
    if(filtroAtivo==="inviavel")  lista=lista.filter(c=>c._inviavel);
    if(filtroAtivo==="followUp")  lista=lista.filter(c=>c._followUp);
    return lista;
  }

  const hoje=new Date().toLocaleDateString("pt-BR",{day:"numeric",month:"long",year:"numeric"});
  const cW={maxWidth:760,margin:"0 auto"};
  const mostrarLista=busca||filtroAtivo;

  return(
    <div className="dashboard-container">

      {/* NAVBAR - Nova com padronização premium */}
      <Navbar
        showSearch={true}
        searchValue={busca}
        onSearchChange={setBusca}
        showLogout={true}
        actionButtons={[
          {
            icon: atualizando ? "⟳" : "↻",
            label: statusMercado ? "Atualizar" : "Mercado fechado",
            onClick: atualizarCotacoesServidor,
            disabled: atualizando,
            title: statusMercado ? "Mercado aberto - Atualizar cotações" : "Mercado fechado - Atualizações retomam amanhã às 9h",
            variant: statusMercado ? "secondary" : ""
          }
        ]}
      />

      <div className="dashboard-content">

        {/* STATUS DO MERCADO E ÚLTIMA ATUALIZAÇÃO */}
        {(ultimaAtualizacao || !statusMercado) && (
          <div style={{
            fontSize: "11px",
            color: "#3E5C76",
            marginBottom: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: "12px",
            borderBottom: "0.5px solid rgba(255, 255, 255, 0.07)"
          }}>
            <div>
              {statusMercado ? (
                <span style={{ color: "#22c55e" }}>
                  ✓ Mercado aberto (9h-18h)
                </span>
              ) : (
                <span>Mercado fechado · Próxima atualização: 9h</span>
              )}
            </div>
            {ultimaAtualizacao && (
              <div style={{ textAlign: "right" }}>
                Última atualização: {ultimaAtualizacao}
              </div>
            )}
          </div>
        )}

        {/* INDICADORES DE MERCADO */}
        <div className="market-indicators">
          {mercado.map(({label,valor,sub,cor})=>(
            <div key={label} className="market-indicator">
              <div className="market-label">{label}</div>
              <div className="market-value">{valor}</div>
              <div className="market-sub" style={{color:cor}}>{sub}</div>
            </div>
          ))}
        </div>

        {/* CARDS XP STYLE - Horizontais */}
        <div className="dashboard-cards-xp">
          <div className="card-xp">
            <div className="card-xp-label">Custódia Total</div>
            <div className="card-xp-value">{brl(calcularPatrimonioTotal(clientes))}</div>
            <div className="card-xp-subtitle">Total de {clientes.length} cliente{clientes.length!==1?"s":""}</div>
          </div>

          <div className="card-xp">
            <div className="card-xp-label">Total de Clientes</div>
            <div className="card-xp-value">{clientes.length}</div>
            <div className="card-xp-subtitle">Cadastrados no sistema</div>
          </div>

          <div className="card-xp" onClick={()=>aplicarFiltro("semAporte")} style={{cursor:"pointer"}}>
            <div className="card-xp-label">Sem Aporte</div>
            <div className="card-xp-value">{semAporte.length}</div>
            <div className="card-xp-subtitle">Cliente{semAporte.length!==1?"s":""} sem aporte</div>
          </div>

          <div className="card-xp" onClick={()=>aplicarFiltro("semRevisao")} style={{cursor:"pointer"}}>
            <div className="card-xp-label">Sem Reuniões</div>
            <div className="card-xp-value">{semRevisao.length}</div>
            <div className="card-xp-subtitle">Sem revisão no mês</div>
          </div>
        </div>

        {/* ALERTAS CRM */}
        {(semAporte.length>0||semRevisao.length>0||comInviavel.length>0||comFollowUp.length>0)&&(
          <div className="dashboard-alerts-section">
            <div className="grid-alerts">
              {[
                {lista:semAporte,  cor:"#ef4444", titulo:"Sem aporte",       filtro:"semAporte",  msg:"cliente(s) sem aporte no mês"},
                {lista:semRevisao, cor:"#f59e0b", titulo:"Sem revisão",      filtro:"semRevisao", msg:"cliente(s) sem revisão no mês"},
                {lista:comInviavel,cor:"#ef4444", titulo:"Plano inviável",   filtro:"inviavel",   msg:"cliente(s) com objetivo inviável"},
                {lista:comFollowUp,cor:"#a855f7", titulo:"Follow-up vencido",filtro:"followUp",   msg:"cliente(s) com retorno atrasado"},
              ].filter(a=>a.lista.length>0).map((a,i)=>(
                <div key={i}
                  onClick={()=>aplicarFiltro(a.filtro)}
                  className="alert-card"
                  data-severity={a.cor === "#ef4444" ? "danger" : a.cor === "#f59e0b" ? "warning" : "info"}
                  style={{
                    background:filtroAtivo===a.filtro?`${a.cor}12`:`${a.cor}08`,
                    borderColor:filtroAtivo===a.filtro?a.cor:a.cor+"30",
                  }}>
                  <div className="alert-title" style={{color:a.cor}}>{a.titulo}</div>
                  <div className="alert-count">{a.lista.length} {a.msg}</div>
                  <div className="alert-names">
                    {a.lista.slice(0,3).map(c=>c.nome?.split(" ")[0]).join(", ")}
                    {a.lista.length>3?` +${a.lista.length-3}`:""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BANNER CADASTRO */}
        <div className="dashboard-banner-wrapper">
          <div className="registration-banner">
            <div className="registration-title">Cadastrar novo cliente</div>
            <div className="registration-subtitle">Adicione e estruture o plano patrimonial completo</div>
            <button
              className="registration-btn"
              onClick={()=>nav("/cliente/novo")}>
              + Cadastrar
            </button>
          </div>
        </div>

        {/* SEÇÃO CLIENTES — com id para scroll */}
        <div ref={clientesRef} id="clientes">
          <div className="dashboard-clients-header">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div className="page-title">Meus Clientes</div>
              {filtroAtivo&&(
                <button
                  className="btn-small"
                  onClick={()=>setFiltroAtivo(null)}>
                  × limpar filtro
                </button>
              )}
            </div>
            {filtroAtivo&&(
              <div className="dashboard-filter-info">
                Exibindo: <span style={{color:"#F0EBD8"}}>
                  {{semAporte:"Sem aporte",semRevisao:"Sem reunião",inviavel:"Plano inviável",followUp:"Follow-up vencido"}[filtroAtivo]}
                </span>
                {" "}— {clientesFiltrados().length} cliente{clientesFiltrados().length!==1?"s":""}
              </div>
            )}
          </div>

          {/* LISTA FILTRADA */}
          {mostrarLista&&(
            <div className="grid-clients">
              {clientesFiltrados().length===0
                ?<div className="dashboard-no-results">Nenhum cliente encontrado.</div>
                :clientesFiltrados().map(c=>(
                  <ClientCard key={c.id} c={c} onClick={()=>nav(`/cliente/${c.id}`)}
                    sAporte={c._sAporte} sRevisao={c._sRevisao}
                    inviavel={c._inviavel} followUp={c._followUp}/>
                ))
              }
            </div>
          )}

          {/* GRADE POR SEGMENTO */}
          {!mostrarLista&&(
            <div className="grid-clients">
              {SEGS.map(seg=>(
                <div key={seg} className="dashboard-segment">
                  <div className="dashboard-segment-header">
                    <span className="dashboard-segment-title" style={{color:SEG_COLORS[seg].color}}>{seg}</span>
                    <span className="dashboard-segment-count" style={{color:SEG_COLORS[seg].color,background:SEG_COLORS[seg].bg,border:`0.5px solid ${SEG_COLORS[seg].border}`}}>{porSeg[seg].length}</span>
                  </div>
                  <div className="dashboard-segment-clients">
                    {porSeg[seg].length===0?(
                      <div className="dashboard-segment-empty">
                        <span>Sem clientes</span>
                      </div>
                    ):(
                      porSeg[seg].map(c=>(
                        <ClientCard key={c.id} c={c} onClick={()=>nav(`/cliente/${c.id}`)}
                          sAporte={c._sAporte} sRevisao={c._sRevisao}
                          inviavel={c._inviavel} followUp={c._followUp}/>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}