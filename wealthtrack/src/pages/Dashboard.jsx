import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
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
  "Digital":   {color:"#748CAB", bg:"rgba(116,140,171,0.10)", border:"rgba(116,140,171,0.25)"},
  "Ascensão":  {color:"#5B9BD5", bg:"rgba(91,155,213,0.10)",  border:"rgba(91,155,213,0.25)"},
  "Exclusive": {color:"#F0A202", bg:"rgba(240,162,2,0.10)",   border:"rgba(240,162,2,0.28)"},
  "Private":   {color:"#9E86C8", bg:"rgba(158,134,200,0.10)", border:"rgba(158,134,200,0.25)"},
};
// Removido: user-select para evitar cursor piscante não profissional
const font="-apple-system,'SF Pro Display',sans-serif";
const BG="#0D1321", CARD="#1D2D44", BD="rgba(62,92,118,0.35)";

function segAuto(v){
  if(v<150000)return"Digital";
  if(v<500000)return"Ascensão";
  if(v<1000000)return"Exclusive";
  return"Private";
}
function brl(v){
  const n=parseInt(String(v||"0").replace(/\D/g,""))/100;
  if(!n)return"—";
  return n.toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2});
}
function brlNum(n){
  if(!n)return"—";
  return n.toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2});
}
const CART_KEYS=["posFixado","ipca","preFixado","acoes","fiis","multi","prevVGBL","prevPGBL","globalEquities","globalTreasury","globalFunds","globalBonds","global"];
function getPatFin(c){
  const t=CART_KEYS.reduce((s,k)=>s+parseInt(String(c.carteira?.[k]||"0").replace(/\D/g,""))/100,0);
  return t>0?t:parseInt(String(c.patrimonio||"0").replace(/\D/g,""))/100;
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

// Aporte: 3 estados — aportou / parcial / sem_aporte
function statusAporte(c){
  if(c.statusAporteMes==="nao_aportou")return"sem_aporte";
  if(c.statusAporteMes==="aportou"){
    const meta=parseInt(String(c.metaAporteMensal||"0").replace(/\D/g,""))/100;
    const reg=parseInt(String(c.aporteRegistradoMes||"0").replace(/\D/g,""))/100;
    if(meta>0&&reg>0&&reg<meta)return"parcial";
    return"aportou";
  }
  if(!c.lastAporteDate)return"sem_aporte";
  try{
    const d=c.lastAporteDate.toDate?c.lastAporteDate.toDate():new Date(c.lastAporteDate);
    const hoje=new Date();
    if(d.getMonth()===hoje.getMonth()&&d.getFullYear()===hoje.getFullYear())return"aportou";
  }catch{}
  return"sem_aporte";
}

// Reserva de emergência
function statusReserva(c){
  const gastos=parseInt(String(c.gastosMensaisManual||"0").replace(/\D/g,""))/100;
  const meta=gastos*6;
  if(!meta)return null;
  const liquidez=parseInt(String(c.carteira?.liquidezD1||"0").replace(/\D/g,""))/100
               ||parseInt(String(c.carteira?.posFixado||"0").replace(/\D/g,""))/100;
  return liquidez>=meta?"ok":"sem";
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

// Card cliente
function ClientCard({c,onClick,sAporte,sRevisao,inviavel,followUp,sReserva}){
  const bordaAtencao=sAporte==="sem_aporte"||sRevisao==="atrasada"||followUp;
  const patFin=getPatFin(c);
  const [hov,setHov]=useState(false);

  let aporteLabel,aporteColor,aporteBg;
  if(sAporte==="aportou"){
    aporteLabel="Aporte Feito"; aporteColor="#4ade80"; aporteBg="rgba(74,222,128,0.10)";
  }else if(sAporte==="parcial"){
    aporteLabel="Aporte Parcial"; aporteColor="#fbbf24"; aporteBg="rgba(251,191,36,0.10)";
  }else{
    aporteLabel="Não Aportou"; aporteColor="#f87171"; aporteBg="rgba(248,113,113,0.10)";
  }

  return(
    <div
      className="client-card"
      onClick={onClick}
      onMouseEnter={()=>setHov(true)}
      onMouseLeave={()=>setHov(false)}
      style={{
        background:hov?"#243756":CARD,
        border:`0.5px solid ${hov?"rgba(240,162,2,0.35)":bordaAtencao?"rgba(245,158,11,0.28)":BD}`,
        borderRadius:14,padding:"15px",cursor:"pointer",
        minHeight:160,width:"100%",minWidth:0,
        boxSizing:"border-box",
        display:"flex",flexDirection:"column",gap:10,
        overflow:"hidden",
        transition:"background 0.2s, border-color 0.2s, transform 0.18s, box-shadow 0.18s",
        transform:hov?"translateY(-2px) scale(1.012)":"none",
        boxShadow:hov?"0 8px 24px rgba(0,0,0,0.45)":"none",
      }}>
      {/* Nome + UF + Fee Based */}
      <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
        <AvatarIcon tipo={c.avatar||"homem"} size={30}/>
        <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
          <div style={{fontSize:11,color:"#F0EBD8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.nome}</div>
          <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
            <span style={{fontSize:10,color:"#3E5C76"}}>{c.uf||"—"}</span>
            {c.feeBased&&<span style={{fontSize:8,padding:"1px 6px",borderRadius:20,background:"rgba(34,197,94,0.13)",color:"#22c55e",fontWeight:500,letterSpacing:"0.04em"}}>Fee Based</span>}
          </div>
        </div>
      </div>
      {/* Patrimônio Financeiro */}
      <div style={{fontSize:12,color:"#FFB20F",fontWeight:300,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{brlNum(patFin)}</div>
      {/* Badges */}
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        <span style={{fontSize:9,padding:"2px 7px",borderRadius:20,flexShrink:0,background:aporteBg,color:aporteColor}}>{aporteLabel}</span>
        {sReserva==="ok"&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,background:"rgba(74,222,128,0.09)",color:"#4ade80",flexShrink:0}}>Reserva OK</span>}
        {sReserva==="sem"&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,background:"rgba(248,113,113,0.09)",color:"#f87171",flexShrink:0}}>Sem Reserva</span>}
        {sRevisao==="atrasada"&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,background:"rgba(251,191,36,0.09)",color:"#fbbf24",flexShrink:0}}>Revisão</span>}
        {inviavel&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,background:"rgba(248,113,113,0.09)",color:"#f87171",flexShrink:0}}>Inviável</span>}
        {followUp&&<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,background:"rgba(167,139,250,0.09)",color:"#a78bfa",flexShrink:0}}>Follow-up</span>}
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
      valor: `R$ ${cotacoes.dolar?.valor?.toFixed(2)?.replace(".", ",") || "5,08"}`,
      sub: cotacoes.dolar?.tipo || "Histórico diário",
      cor: (cotacoes.dolar?.variacao ?? 0) >= 0 ? "#22c55e" : "#ef4444"
    },
    {
      label: "Selic",
      valor: `${cotacoes.selic?.valor?.toFixed(2)?.replace(".", ",") || "14,75"}%`,
      sub: cotacoes.selic?.tipo || "a.a.",
      cor: "#6b7280"
    },
    {
      label: "IPCA",
      valor: `${cotacoes.ipca?.valor?.toFixed(2)?.replace(".", ",") || "4,14"}%`,
      sub: cotacoes.ipca?.tipo || "12 meses",
      cor: "#6b7280"
    },
    {
      label: "Ibovespa",
      valor: `${Math.round(cotacoes.ibovespa?.valor || 197000).toLocaleString("pt-BR")}`,
      sub: cotacoes.ibovespa?.tipo || "Histórico do dia",
      cor: (cotacoes.ibovespa?.variacao ?? 0) >= 0 ? "#22c55e" : "#ef4444"
    },
    {
      label: "S&P 500",
      valor: `${Math.round(cotacoes.sp500?.valor || 5396).toLocaleString("pt-BR")}`,
      sub: cotacoes.sp500?.tipo || "Histórico do dia",
      cor: (cotacoes.sp500?.variacao ?? 0) >= 0 ? "#22c55e" : "#ef4444"
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
      setUltimaAtualizacao(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));

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
      setTimeout(()=>{
        gsap.fromTo(".client-card",
          {opacity:0,y:14},
          {opacity:1,y:0,duration:0.45,stagger:0.06,ease:"power2.out",clearProps:"transform"}
        );
        gsap.fromTo(".dashboard-segment-header",
          {opacity:0,x:-10},
          {opacity:1,x:0,duration:0.35,stagger:0.08,ease:"power2.out"}
        );
      },50);
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
    _sReserva: statusReserva(c),
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
    const s=segAuto(getPatFin(c));
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
            onClick: atualizarCotacoesServidor,
            disabled: atualizando,
            title: statusMercado ? "Atualizar cotações" : "Mercado fechado · Atualizar manualmente",
            variant: "secondary"
          }
        ]}
      />

      <div className="dashboard-content">


        {/* BARRA DE STATUS DO MERCADO */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 10,
          color: "#3E5C76",
          marginBottom: 8,
          letterSpacing: "0.03em",
        }}>
          <span>{new Date().toLocaleDateString("pt-BR")}</span>
          <span style={{ opacity: 0.4 }}>•</span>
          <span style={{ color: statusMercado ? "#22c55e" : "#748CAB" }}>
            {statusMercado ? "● MERCADO ABERTO" : "● MERCADO FECHADO"}
          </span>
          {ultimaAtualizacao && (
            <>
              <span style={{ opacity: 0.4 }}>•</span>
              <span>Última atualização: {ultimaAtualizacao}</span>
            </>
          )}
        </div>

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
                    inviavel={c._inviavel} followUp={c._followUp} sReserva={c._sReserva}/>
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
                          inviavel={c._inviavel} followUp={c._followUp} sReserva={c._sReserva}/>
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