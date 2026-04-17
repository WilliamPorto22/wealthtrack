import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useRef, useState, useCallback, memo } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Navbar } from "../components/Navbar";
import Tesseract from "tesseract.js";
import { T, C } from "../theme";
import { AvatarIcon } from "./Dashboard";

// ── Utilitários ───────────────────────────────────────────────
function parseCentavos(s){ return parseInt(String(s||"0").replace(/\D/g,""))||0; }
function brl(v){
  const n=parseFloat(v)||0;
  if(!n) return "—";
  return n.toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2});
}
function pct(v){ return (parseFloat(v)||0).toFixed(1)+"%"; }
function newAtivoId(){ return Date.now()+"_"+Math.random().toString(36).slice(2,7); }
const noEdit={userSelect:"none",WebkitUserSelect:"none",cursor:"default"};
const font="-apple-system,'SF Pro Display',sans-serif";
const BG="#0D1321", BD="rgba(62,92,118,0.35)";

// ── Classes de ativos ─────────────────────────────────────────
const GRUPOS = [
  {
    key:"nacional",
    label:"Renda Fixa e Variável Nacional",
    classes:[
      {key:"posFixado",  label:"Renda Fixa Pós-Fixada",  cor:"#2563eb", liq:"d+1"},
      {key:"ipca",       label:"Renda Fixa IPCA+",        cor:"#3b82f6", liq:"d+1"},
      {key:"preFixado",  label:"Renda Fixa Pré-Fixada",   cor:"#60a5fa", liq:"d+1"},
      {key:"acoes",      label:"Ações",                   cor:"#22c55e", liq:"d+2", temSegmento:true},
      {key:"fiis",       label:"Fundos Imobiliários",      cor:"#F0A202", liq:"d+2", temSegmento:true},
      {key:"multi",      label:"Multimercado",             cor:"#a07020", liq:"d+30"},
    ]
  },
  {
    key:"previdencia",
    label:"Previdência",
    classes:[
      {key:"prevVGBL",   label:"Previdência VGBL",         cor:"#f59e0b", liq:"—"},
      {key:"prevPGBL",   label:"Previdência PGBL",         cor:"#d97706", liq:"—"},
    ]
  },
  {
    key:"global",
    label:"Investimentos Globais",
    classes:[
      {key:"globalEquities", label:"Global – Equities (R.V.)",     cor:"#a855f7", liq:"d+2"},
      {key:"globalTreasury", label:"Global – Treasury (Tesouro)",  cor:"#c084fc", liq:"d+2"},
      {key:"globalFunds",    label:"Global – Mutual Funds (R.F.)", cor:"#7c3aed", liq:"d+2"},
      {key:"globalBonds",    label:"Global – Bonds (R.F.)",        cor:"#9333ea", liq:"d+2"},
      {key:"global",         label:"Invest. Globais (Geral)",       cor:"#a855f7", liq:"d+2", legado:true},
    ]
  },
];
const CLASSES = GRUPOS.flatMap(g=>g.classes);

const OBJETIVOS = [
  "Liquidez","Reserva de oportunidade","Aposentadoria","Aquisição de Imóvel",
  "Compra de carro","Viagem","Educação","Saúde","Sucessão","Outros",
];

const SEGMENTOS = {
  acoes:[
    "Setor Bancário","Setor de Energia","Setor de Consumo","Setor de Mineração",
    "Setor de Agronegócio","Setor de Tecnologia","Setor de Saúde",
    "Setor de Saneamento","Setor de Construção","Setor Industrial","ETF","Outros",
  ],
  fiis:[
    "Galpão Logístico","Laje Corporativa","Shoppings","Residencial",
    "Papéis (CRI/CRA)","Fundo de Fundos","Híbrido","Hotel/Hotelaria","Educacional","Outros",
  ],
};

// ── Componentes base ──────────────────────────────────────────
const InputMoeda=memo(function InputMoeda({initValue,onCommit,placeholder="R$ 0,00",small}){
  const [raw,setRaw]=useState(initValue||"");
  function fmt(r){
    const n=parseInt(String(r||"0").replace(/\D/g,""))||0;
    if(!n) return "";
    return "R$ "+(n/100).toLocaleString("pt-BR",{minimumFractionDigits:2});
  }
  function handleChange(e){
    const novo=e.target.value.replace(/\D/g,"");
    setRaw(novo); onCommit(novo);
  }
  return <input style={{...C.input,fontSize:small?12:13}} placeholder={placeholder} value={fmt(raw)} onChange={handleChange}/>;
});

const InputTexto=memo(function InputTexto({initValue,onCommit,placeholder="",small}){
  const [val,setVal]=useState(initValue||"");
  function handleChange(e){setVal(e.target.value);onCommit(e.target.value);}
  return <input style={{...C.input,fontSize:small?11:12}} placeholder={placeholder} value={val} onChange={handleChange}/>;
});

const InputPct=memo(function InputPct({initValue,onCommit,placeholder="0,00%"}){
  const [val,setVal]=useState(initValue||"");
  function handleChange(e){setVal(e.target.value);onCommit(e.target.value);}
  return <input style={{...C.input,fontSize:12}} type="text" placeholder={placeholder} value={val} onChange={handleChange}/>;
});

function SelectObj({value,onChange}){
  return(
    <select value={value||""} onChange={e=>onChange(e.target.value)}
      style={{background:"rgba(255,255,255,0.04)",border:`0.5px solid ${BD}`,borderRadius:8,
        color:value?T.textPrimary:T.textMuted,fontSize:12,padding:"9px 10px",fontFamily:font,
        cursor:"pointer",outline:"none",width:"100%",height:42}}>
      <option value="">— Objetivo</option>
      {OBJETIVOS.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function SelectSeg({value,onChange,options}){
  return(
    <select value={value||""} onChange={e=>onChange(e.target.value)}
      style={{background:"rgba(255,255,255,0.04)",border:`0.5px solid ${BD}`,borderRadius:8,
        color:value?T.textPrimary:T.textMuted,fontSize:12,padding:"9px 10px",fontFamily:font,
        cursor:"pointer",outline:"none",width:"100%",height:42}}>
      <option value="">— Segmento</option>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ── Gráfico de pizza ─────────────────────────────────────────
function GraficoPizza({classes,valores,total}){
  if(total<=0) return <div className="grafico-pizza-vazio"><span>Sem dados</span></div>;
  let acumulado=0;
  const fatias=classes.map(c=>{
    const val=parseCentavos(valores[c.key])/100;
    const angulo=(val/total)*360;
    const inicio=acumulado; acumulado+=angulo;
    return{...c,val,angulo,inicio};
  }).filter(f=>f.val>0);
  function descreveFatia(inicio,fim,r,cx,cy){
    const toRad=a=>(a-90)*Math.PI/180;
    const x1=cx+r*Math.cos(toRad(inicio)); const y1=cy+r*Math.sin(toRad(inicio));
    const x2=cx+r*Math.cos(toRad(fim));   const y2=cy+r*Math.sin(toRad(fim));
    return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${fim-inicio>180?1:0},1 ${x2},${y2} Z`;
  }
  const cx=90,cy=90,r=85,ri=45;
  return(
    <svg width={180} height={180} className="grafico-pizza-svg">
      {fatias.map(f=>(
        <path key={f.key} d={descreveFatia(f.inicio,f.inicio+f.angulo,r,cx,cy)}
          fill={f.cor} opacity={0.85} stroke={BG} strokeWidth={1.5}/>
      ))}
      <circle cx={cx} cy={cy} r={ri} fill={BG}/>
      <text x={cx} y={cy-6} textAnchor="middle" fill="#F0EBD8" fontSize={11} fontFamily={font}>Total</text>
      <text x={cx} y={cy+10} textAnchor="middle" fill="#F0A202" fontSize={9} fontFamily={font}>
        {(total/1000000).toFixed(2)}M
      </text>
    </svg>
  );
}

// ── Main ─────────────────────────────────────────────────────
export default function Carteira(){
  const {id}=useParams();
  const navigate=useNavigate();
  const [clienteNome,setClienteNome]=useState("");
  const [clienteAvatar,setClienteAvatar]=useState("homem");
  const [gastosMensais,setGastosMensais]=useState(0);
  const [reservaMeta,setReservaMeta]=useState(0);
  const formRef=useRef({});
  const [snap,setSnap]=useState({});
  const [modo,setModo]=useState("ver");
  const [salvando,setSalvando]=useState(false);
  const [msg,setMsg]=useState("");
  const [alertaRemocao,setAlertaRemocao]=useState(null);
  const [uploading,setUploading]=useState(false);
  const [carregou,setCarregou]=useState(false);
  const [expandedRow,setExpandedRow]=useState(null);
  const fileInputRef=useRef(null);

  useEffect(()=>{
    async function carregar(){
      const s=await getDoc(doc(db,"clientes",id));
      if(!s.exists()){setCarregou(true);return;}
      const data=s.data();
      setClienteNome(data.nome||"");
      setClienteAvatar(data.avatar||"homem");
      const cats=["moradia","alimentacao","educacao","cartoes","carro","saude","outros"];
      const gastosFluxo=cats.reduce((acc,k)=>acc+(parseCentavos(data.fluxo?.[k])/100),0);
      const gastosManual=parseCentavos(data.gastosMensaisManual)/100;
      const gastos=gastosManual||gastosFluxo;
      setGastosMensais(gastos);
      setReservaMeta(gastos*6);
      const carteira=data.carteira||{};
      formRef.current={...carteira};
      setSnap({...carteira});
      setCarregou(true);
    }
    carregar();
  },[id]);

  const setFSnap=useCallback((k,v)=>{formRef.current={...formRef.current,[k]:v};setSnap(p=>({...p,[k]:v}));},[]);

  // ── Gestão de ativos individuais ──────────────────────────────
  function getAtivos(classKey){ return snap[classKey+"Ativos"]||[]; }

  function addAtivo(classKey){
    const ativos=[...(snap[classKey+"Ativos"]||[])];
    ativos.push({id:newAtivoId(),nome:"",valor:"",objetivo:"",vencimento:"",rentMes:"",rentAno:"",segmento:""});
    setFSnap(classKey+"Ativos",ativos);
  }

  function removeAtivo(classKey,idx){
    const ativos=[...(snap[classKey+"Ativos"]||[])];
    ativos.splice(idx,1);
    setFSnap(classKey+"Ativos",ativos);
  }

  function updateAtivo(classKey,idx,field,value){
    const ativos=[...(snap[classKey+"Ativos"]||[])];
    ativos[idx]={...ativos[idx],[field]:value};
    setFSnap(classKey+"Ativos",ativos);
  }

  function getClassTotal(classKey){
    const ativos=snap[classKey+"Ativos"]||[];
    if(ativos.length>0) return ativos.reduce((acc,a)=>acc+parseCentavos(a.valor)/100,0);
    return parseCentavos(snap[classKey])/100;
  }

  // ── Salvar ────────────────────────────────────────────────────
  async function salvar(){
    setSalvando(true);
    try{
      const s=await getDoc(doc(db,"clientes",id));
      const anterior=s.data()?.carteira||{};
      const novoForm={...formRef.current};
      // Sincronizar total da classe com soma dos ativos
      CLASSES.forEach(c=>{
        const ativos=novoForm[c.key+"Ativos"]||[];
        if(ativos.length>0){
          const tot=ativos.reduce((acc,a)=>acc+parseCentavos(a.valor),0);
          novoForm[c.key]=String(tot);
        }
      });
      formRef.current=novoForm;

      const removidos=CLASSES.filter(c=>{
        const antes=parseCentavos(anterior[c.key]);
        const agora=parseCentavos(novoForm[c.key]);
        return antes>0&&agora===0;
      });
      if(removidos.length>0) setAlertaRemocao(removidos.map(r=>r.label));

      // Liquidez: usa objetivo do ativo se existir, senão da classe
      const liqD1=CLASSES.reduce((acc,c)=>{
        const ativos=novoForm[c.key+"Ativos"]||[];
        if(ativos.length>0)
          return acc+ativos.reduce((a,av)=>a+((av.objetivo||"")==="Liquidez"?parseCentavos(av.valor)/100:0),0);
        if((novoForm[c.key+"Obj"]||"")==="Liquidez") return acc+parseCentavos(novoForm[c.key])/100;
        return acc;
      },0);

      const hoje=new Date().toLocaleDateString("pt-BR");
      const novaCarteira={
        ...novoForm,
        liquidezD1:liqD1>0?String(Math.round(liqD1*100)):novoForm.liquidezD1||"",
        atualizadoEm:hoje,
      };
      await setDoc(doc(db,"clientes",id),{...s.data(),carteira:novaCarteira});
      setSnap({...novaCarteira});
      formRef.current={...novaCarteira};
      setMsg("Carteira atualizada com sucesso.");
      setModo("ver");
    }catch(e){setMsg("Erro: "+e.message);}
    setSalvando(false);
  }

  // ── OCR ───────────────────────────────────────────────────────
  function extrairValor(texto){
    const match=texto?.match(/[\d.,]+/);
    if(!match) return 0;
    return Math.round(parseFloat(match[0].replace(/\./g,"").replace(",","."))*100)||0;
  }
  function parseFinancialData(texto){
    const resultado={};
    const patterns={
      posFixado:["PÓS-FIXADO","PÓS FIXADO","SELIC","CDB","LCI","LCA"],
      ipca:["IPCA","IPCA+","NTN-B","TESOURO IPCA"],
      preFixado:["PRÉ-FIXADO","PRÉ FIXADO","TESOURO PREFIXADO"],
      fiis:["FII","FUNDO IMOBILIÁRIO","IMOBILIÁRIOS"],
      multi:["MULTIMERCADO","HEDGE FUND"],
      acoes:["AÇÃO","AÇÕES","ETF","RENDA VARIÁVEL"],
      globalEquities:["EQUITIES","EQUITY"],
      globalTreasury:["TREASURY","TESOURO AMERICANO"],
      globalFunds:["MUTUAL FUND","FUNDO GLOBAL"],
      globalBonds:["BONDS","BOND","RENDA FIXA GLOBAL"],
      global:["GLOBAL","INTERNACIONAL","BDR","EXTERIOR"],
    };
    Object.entries(patterns).forEach(([campo,palavras])=>{
      palavras.forEach(palavra=>{
        const match=texto.match(new RegExp(`${palavra}[^\\d]*([\\d.,]+)`,"i"));
        if(match?.[1]){const v=extrairValor(match[1]);if(v>0)resultado[campo]=v;}
      });
    });
    return resultado;
  }
  async function handleUpload(e){
    const file=e.target.files[0]; if(!file) return;
    setUploading(true); setMsg("Lendo arquivo com OCR...");
    try{
      if(!file.type.startsWith("image/")) throw new Error("Use imagem (JPG, PNG)");
      const result=await Tesseract.recognize(file,["por","eng"],{
        logger:(m)=>{if(m.status==="recognizing")setMsg(`OCR... ${Math.round(m.progress*100)}%`);}
      });
      const dados=parseFinancialData(result.data.text);
      if(Object.keys(dados).length===0){
        setMsg("Nenhum dado detectado. Preencha manualmente."); setModo("editar");
      }else{
        Object.entries(dados).forEach(([k,v])=>{formRef.current={...formRef.current,[k]:String(v)};});
        setSnap(p=>({...p,...Object.fromEntries(Object.entries(dados).map(([k,v])=>[k,String(v)]))}));
        setMsg(`✓ ${Object.keys(dados).length} campos atualizados. Revise e salve.`); setModo("editar");
      }
    }catch(err){setMsg("Erro: "+err.message);}
    setUploading(false); e.target.value="";
  }

  // ── Cálculos ──────────────────────────────────────────────────
  const total=CLASSES.reduce((acc,c)=>acc+getClassTotal(c.key),0);
  const totalNacional=GRUPOS[0].classes.reduce((acc,c)=>acc+getClassTotal(c.key),0);
  const totalPrevidencia=GRUPOS[1].classes.reduce((acc,c)=>acc+getClassTotal(c.key),0);
  const totalGlobal=GRUPOS[2].classes.reduce((acc,c)=>acc+getClassTotal(c.key),0);

  const liquidezObj=CLASSES.reduce((acc,c)=>{
    const ativos=snap[c.key+"Ativos"]||[];
    if(ativos.length>0)
      return acc+ativos.reduce((a,av)=>a+((av.objetivo||"")==="Liquidez"?parseCentavos(av.valor)/100:0),0);
    if((snap[c.key+"Obj"]||"")==="Liquidez") return acc+parseCentavos(snap[c.key])/100;
    return acc;
  },0);
  const liquidezFallback=["posFixado","ipca","preFixado"].reduce((acc,k)=>acc+getClassTotal(k),0);
  const liquidezD1=liquidezObj>0?liquidezObj:liquidezFallback;
  const liquidezOk=reservaMeta>0&&liquidezD1>=reservaMeta;
  const rentabilidade=parseFloat(snap.rentabilidade)||0;

  // Mapa computado de valores para pizza (usa totais reais incluindo ativos)
  const valoresComp=Object.fromEntries(CLASSES.map(c=>[c.key,String(Math.round(getClassTotal(c.key)*100))]));

  const classesAtivas=[...CLASSES]
    .filter(c=>getClassTotal(c.key)>0)
    .sort((a,b)=>getClassTotal(b.key)-getClassTotal(a.key));

  if(!carregou) return <div className="carteira-loading"><div>Carregando...</div></div>;

  const Lbl=({children})=><label style={{fontSize:9,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.1em",display:"block",marginBottom:6,...noEdit}}>{children}</label>;

  return(
    <div className="carteira-container">
      <Navbar
        actionButtons={[
          {icon:uploading?"⟳":"↑",label:uploading?"Processando...":"Importar",onClick:()=>fileInputRef.current?.click(),disabled:uploading},
          {label:modo==="ver"?"Editar":"Salvar",variant:modo==="editar"?"primary":"secondary",onClick:modo==="ver"?()=>setModo("editar"):salvar,disabled:salvando},
          ...(modo==="editar"?[{label:"Cancelar",variant:"secondary",onClick:()=>{formRef.current={...snap};setModo("ver");}}]:[]),
        ]}
      />
      <input ref={fileInputRef} type="file" accept=".png,.jpg,.jpeg" style={{display:"none"}} onChange={handleUpload}/>

      <div className="carteira-content">
        {/* Voltar */}
        <button onClick={()=>navigate(`/cliente/${id}`)}
          style={{position:"fixed",left:16,top:"50%",transform:"translateY(-50%)",width:44,height:44,borderRadius:22,background:"rgba(240,162,2,0.15)",border:"1px solid rgba(240,162,2,0.3)",color:"#F0A202",fontSize:20,cursor:"pointer",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:font}}
          onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-50%) scale(1.15)";e.currentTarget.style.background="rgba(240,162,2,0.25)";}}
          onMouseLeave={e=>{e.currentTarget.style.transform="translateY(-50%) scale(1)";e.currentTarget.style.background="rgba(240,162,2,0.15)";}}
        >←</button>

        {/* Header */}
        <div className="carteira-header">
          <AvatarIcon tipo={clienteAvatar} size={48}/>
          <div>
            <div className="carteira-header-info">Carteira de investimentos</div>
            <div className="carteira-header-title">{clienteNome||"Cliente"}</div>
          </div>
        </div>

        {/* Feedback */}
        {msg&&<div className={`carteira-message ${msg.includes("Erro")?"error":"success"}`}>
          {msg}<button className="carteira-message-close" onClick={()=>setMsg("")}>×</button>
        </div>}
        {alertaRemocao&&(
          <div className="carteira-alert-removal">
            <div className="carteira-alert-title">⚠ Ativo removido da carteira</div>
            <div className="carteira-alert-items">{alertaRemocao.join(", ")}</div>
            <button className="carteira-alert-btn" onClick={()=>setAlertaRemocao(null)}>Entendido</button>
          </div>
        )}

        {/* KPIs */}
        <div className="carteira-kpi-grid">
          {[
            {label:"Patrimônio total",    valor:brl(total),                                    cor:"#FFB20F",grande:true},
            {label:"Rentabilidade no ano",valor:rentabilidade>0?`+${pct(rentabilidade)}`:"—", cor:rentabilidade>0?"#22c55e":"#3E5C76"},
            {label:"Líquido D+1",          valor:brl(liquidezD1),                              cor:"#60a5fa"},
          ].map(({label,valor,cor,grande})=>(
            <div key={label} className="carteira-kpi-card" style={{"--color":cor}}>
              <div className="carteira-kpi-label">{label}</div>
              <div className={`carteira-kpi-value ${grande?"large":""}`}>{valor}</div>
            </div>
          ))}
        </div>

        {/* ══ MODO VER ══ */}
        {modo==="ver"&&(
          <div className="carteira-main-grid">
            {/* Pizza */}
            <div className="carteira-chart-container">
              <div className="carteira-chart-label">Composição</div>
              <GraficoPizza classes={classesAtivas} valores={valoresComp} total={total}/>
              <div className="carteira-legend">
                {classesAtivas.map(c=>{
                  const val=getClassTotal(c.key);
                  const p=total>0?Math.round(val/total*100):0;
                  const obj=snap[c.key+"Obj"];
                  return(
                    <div key={c.key} className="carteira-legend-item">
                      <div className="carteira-legend-dot" style={{"--color":c.cor}}/>
                      <span className="carteira-legend-label">{c.label}</span>
                      <span className="carteira-legend-pct">{p}%</span>
                      {obj&&<span style={{fontSize:8,background:"rgba(255,255,255,0.06)",borderRadius:4,padding:"1px 5px",color:"#748CAB",marginLeft:3,...noEdit}}>{obj}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tabela */}
            <div className="carteira-table-wrapper">
              <div className="carteira-table">
                <div className="carteira-table-header">
                  <div className="carteira-table-header-cell">Classe</div>
                  <div className="carteira-table-header-cell right">Valor</div>
                  <div className="carteira-table-header-cell pct">%</div>
                  <div className="carteira-table-header-cell pct">Liq.</div>
                </div>

                {classesAtivas.map((c,i)=>{
                  const val=getClassTotal(c.key);
                  const p=total>0?Math.round(val/total*100):0;
                  const isExpanded=expandedRow===c.key;
                  const ativos=getAtivos(c.key);
                  const obj=snap[c.key+"Obj"]||"";
                  const venc=snap[c.key+"Venc"]||"";
                  const isLast=i===classesAtivas.length-1;
                  return(
                    <div key={c.key} className={`carteira-table-row${isLast?" last":""}`}
                      style={{cursor:"pointer"}}
                      onClick={()=>setExpandedRow(isExpanded?null:c.key)}>
                      <div className="carteira-table-row-content">
                        <div className="carteira-table-class">
                          <div className="carteira-table-indicator" style={{"--color":c.cor}}/>
                          <div>
                            <span className="carteira-table-class-label">{c.label}</span>
                            {c.legado&&<span style={{fontSize:8,color:"#748CAB",marginLeft:4,...noEdit}}>(legado)</span>}
                            {ativos.length>0&&<span style={{fontSize:8,color:"#748CAB",marginLeft:4,...noEdit}}>{ativos.length} ativo{ativos.length>1?"s":""}</span>}
                          </div>
                        </div>
                        <div className="carteira-table-value"><span>{brl(val)}</span></div>
                        <div className={`carteira-table-pct ${p>0?"text":"muted"}`}>{p>0?p+"%":"—"}</div>
                        <div className="carteira-table-liq">{c.liq}</div>
                      </div>
                      {p>0&&<div className="carteira-table-progress">
                        <div className="carteira-table-progress-bar" style={{"--pct":`${p}%`,"--color":c.cor}}/>
                      </div>}

                      {/* Detalhe expandido */}
                      {isExpanded&&(
                        <div style={{padding:"10px 14px 14px",borderTop:"0.5px solid rgba(255,255,255,0.06)",marginTop:4}}
                          onClick={e=>e.stopPropagation()}>
                          {ativos.length>0?(
                            // Lista de ativos individuais
                            <div style={{display:"flex",flexDirection:"column",gap:8}}>
                              {ativos.map((av,idx)=>{
                                const avVal=parseCentavos(av.valor)/100;
                                return(
                                  <div key={av.id||idx} style={{background:"rgba(255,255,255,0.02)",borderRadius:8,padding:"10px 12px",...noEdit}}>
                                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
                                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                                        <div style={{width:5,height:5,borderRadius:"50%",background:c.cor,flexShrink:0}}/>
                                        <span style={{fontSize:12,color:"#e2e8f0",fontWeight:500}}>{av.nome||"Ativo sem nome"}</span>
                                        {av.segmento&&<span style={{fontSize:8,color:"#748CAB",background:"rgba(255,255,255,0.06)",borderRadius:4,padding:"1px 5px"}}>{av.segmento}</span>}
                                      </div>
                                      <span style={{fontSize:12,color:"#F0A202",fontWeight:600}}>{brl(avVal)}</span>
                                    </div>
                                    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                                      {av.objetivo&&<span style={{fontSize:9,color:"#748CAB",background:"rgba(255,255,255,0.04)",borderRadius:4,padding:"2px 6px"}}>{av.objetivo}</span>}
                                      {av.vencimento&&<span style={{fontSize:9,color:"#748CAB"}}>Venc: {av.vencimento}</span>}
                                      {av.rentAno&&<span style={{fontSize:9,color:"#22c55e"}}>{av.rentAno}% a.a.</span>}
                                      {av.rentMes&&<span style={{fontSize:9,color:"#4ade80"}}>{av.rentMes}% a.m.</span>}
                                    </div>
                                  </div>
                                );
                              })}
                              <div style={{display:"flex",justifyContent:"flex-end",paddingTop:4,borderTop:"0.5px solid rgba(255,255,255,0.05)",...noEdit}}>
                                <span style={{fontSize:10,color:"#748CAB"}}>Total da classe: </span>
                                <span style={{fontSize:10,color:c.cor,fontWeight:600,marginLeft:6}}>{brl(val)}</span>
                              </div>
                            </div>
                          ):(
                            // Sem ativos: mostra objetivo/vencimento/liquidez da classe
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,...noEdit}}>
                              <div>
                                <div style={{fontSize:9,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>Objetivo</div>
                                <div style={{fontSize:12,color:obj?"#e2e8f0":"#748CAB"}}>{obj||"—"}</div>
                              </div>
                              <div>
                                <div style={{fontSize:9,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>Vencimento</div>
                                <div style={{fontSize:12,color:venc?"#e2e8f0":"#748CAB"}}>{venc||"—"}</div>
                              </div>
                              <div>
                                <div style={{fontSize:9,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>Liquidez</div>
                                <div style={{fontSize:12,color:"#60a5fa"}}>{c.liq}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="carteira-table-footer">
                  <span className="carteira-table-footer-label">Total</span>
                  <span className="carteira-table-footer-total">{brl(total)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ MODO EDITAR ══ */}
        {modo==="editar"&&(
          <div style={{marginTop:16}}>
            <div style={{fontSize:10,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:14,padding:"0 4px",...noEdit}}>
              Editar Carteira — adicione os ativos por classe
            </div>

            {GRUPOS.map(grupo=>(
              <div key={grupo.key} style={{marginBottom:20}}>
                <div style={{fontSize:9,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:10,padding:"0 2px",...noEdit}}>
                  {grupo.label}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {grupo.classes
                    .filter(c=>!c.legado||(parseCentavos(snap[c.key])>0||getAtivos(c.key).length>0))
                    .map(c=>{
                      const ativos=getAtivos(c.key);
                      const totalClasse=getClassTotal(c.key);
                      const hasValue=totalClasse>0;
                      const segOpts=c.key==="acoes"?SEGMENTOS.acoes:c.key==="fiis"?SEGMENTOS.fiis:null;
                      return(
                        <div key={c.key} style={{
                          background:hasValue?"rgba(255,255,255,0.03)":"rgba(255,255,255,0.01)",
                          border:`0.5px solid ${hasValue?`rgba(${hexToRgb(c.cor)},0.25)`:BD}`,
                          borderRadius:12,
                          padding:"14px 16px",
                        }}>
                          {/* Cabeçalho: classe + total */}
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,...noEdit}}>
                            <div style={{width:3,height:20,borderRadius:2,background:c.cor,flexShrink:0}}/>
                            <span style={{fontSize:13,color:"#e2e8f0",fontWeight:400}}>{c.label}</span>
                            {c.legado&&<span style={{fontSize:9,color:"#748CAB",background:"rgba(255,255,255,0.06)",borderRadius:4,padding:"1px 5px"}}>legado</span>}
                            <span style={{marginLeft:"auto",fontSize:10,color:hasValue?c.cor:"#748CAB",fontWeight:hasValue?600:400}}>
                              {hasValue?brl(totalClasse):"sem valor"} · {c.liq}
                            </span>
                          </div>

                          {/* Se não tem ativos: campos diretos de classe (retrocompatível) */}
                          {ativos.length===0&&(
                            <div style={{display:"grid",gridTemplateColumns:"1.4fr 1.4fr 1fr",gap:10,marginBottom:12}}>
                              <div>
                                <Lbl>Valor da classe</Lbl>
                                <InputMoeda key={`${c.key}-${id}`} initValue={snap[c.key]} onCommit={v=>setFSnap(c.key,v)}/>
                              </div>
                              <div>
                                <Lbl>Objetivo</Lbl>
                                <SelectObj value={snap[c.key+"Obj"]||""} onChange={v=>setFSnap(c.key+"Obj",v)}/>
                              </div>
                              <div>
                                <Lbl>Vencimento</Lbl>
                                <InputTexto key={`${c.key}Venc-${id}`} initValue={snap[c.key+"Venc"]||""} onCommit={v=>setFSnap(c.key+"Venc",v)} placeholder="DD/MM/AAAA"/>
                              </div>
                            </div>
                          )}

                          {/* Lista de ativos */}
                          {ativos.length>0&&(
                            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10}}>
                              {ativos.map((av,idx)=>(
                                <div key={av.id} style={{
                                  background:"rgba(255,255,255,0.025)",
                                  border:`0.5px solid rgba(${hexToRgb(c.cor)},0.15)`,
                                  borderRadius:10,
                                  padding:"12px 14px",
                                }}>
                                  {/* Header do ativo */}
                                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                                    <div style={{width:3,height:16,borderRadius:2,background:c.cor,flexShrink:0,...noEdit}}/>
                                    <InputTexto
                                      key={av.id+"-nome"}
                                      initValue={av.nome}
                                      onCommit={v=>updateAtivo(c.key,idx,"nome",v)}
                                      placeholder="Nome do ativo (ex: CDB Banco Itaú)"
                                    />
                                    <button
                                      onClick={()=>removeAtivo(c.key,idx)}
                                      style={{flexShrink:0,width:26,height:26,borderRadius:6,background:"rgba(239,68,68,0.1)",border:"0.5px solid rgba(239,68,68,0.25)",color:"#ef4444",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
                                    >×</button>
                                  </div>
                                  {/* Linha 1: Valor | Objetivo | Vencimento */}
                                  <div style={{display:"grid",gridTemplateColumns:"1.4fr 1.4fr 1fr",gap:8,marginBottom:8}}>
                                    <div>
                                      <Lbl>Valor</Lbl>
                                      <InputMoeda key={av.id+"-val"} initValue={av.valor} onCommit={v=>updateAtivo(c.key,idx,"valor",v)} small/>
                                    </div>
                                    <div>
                                      <Lbl>Objetivo</Lbl>
                                      <SelectObj value={av.objetivo||""} onChange={v=>updateAtivo(c.key,idx,"objetivo",v)}/>
                                    </div>
                                    <div>
                                      <Lbl>Vencimento</Lbl>
                                      <InputTexto key={av.id+"-venc"} initValue={av.vencimento} onCommit={v=>updateAtivo(c.key,idx,"vencimento",v)} placeholder="DD/MM/AAAA" small/>
                                    </div>
                                  </div>
                                  {/* Linha 2: Rentabilidade + Segmento */}
                                  <div style={{display:"grid",gridTemplateColumns:segOpts?"1fr 1fr 1.5fr":"1fr 1fr",gap:8}}>
                                    <div>
                                      <Lbl>Rentab. Mês (%)</Lbl>
                                      <InputPct key={av.id+"-rm"} initValue={av.rentMes} onCommit={v=>updateAtivo(c.key,idx,"rentMes",v)} placeholder="ex: 0,85"/>
                                    </div>
                                    <div>
                                      <Lbl>Rentab. Ano (%)</Lbl>
                                      <InputPct key={av.id+"-ra"} initValue={av.rentAno} onCommit={v=>updateAtivo(c.key,idx,"rentAno",v)} placeholder="ex: 10,5"/>
                                    </div>
                                    {segOpts&&(
                                      <div>
                                        <Lbl>Segmento</Lbl>
                                        <SelectSeg value={av.segmento||""} onChange={v=>updateAtivo(c.key,idx,"segmento",v)} options={segOpts}/>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}

                              {/* Total da classe com ativos */}
                              <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",padding:"6px 2px",...noEdit}}>
                                <span style={{fontSize:10,color:"#748CAB"}}>Total da classe:</span>
                                <span style={{fontSize:13,color:c.cor,fontWeight:600,marginLeft:8}}>{brl(totalClasse)}</span>
                              </div>
                            </div>
                          )}

                          {/* Botão Adicionar ativo */}
                          <button
                            onClick={()=>addAtivo(c.key)}
                            style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:"rgba(255,255,255,0.02)",border:`0.5px solid rgba(${hexToRgb(c.cor)},0.2)`,borderRadius:8,cursor:"pointer",width:"100%",fontFamily:font,transition:"background 0.15s"}}
                            onMouseEnter={e=>e.currentTarget.style.background=`rgba(${hexToRgb(c.cor)},0.06)`}
                            onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.02)"}
                          >
                            <div style={{width:3,height:16,borderRadius:2,background:c.cor,flexShrink:0}}/>
                            <span style={{fontSize:12,color:c.cor}}>+ Adicionar ativo</span>
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}

            {/* Rentabilidade geral */}
            <div style={{background:"rgba(255,255,255,0.02)",border:`0.5px solid ${BD}`,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:9,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,...noEdit}}>Rentabilidade da Carteira</div>
              <div>
                <Lbl>Rentabilidade no ano (%)</Lbl>
                <input style={{...C.input,fontSize:13}} type="number" step="0.01" placeholder="Ex: 14.5"
                  value={snap.rentabilidade||""} onChange={e=>setFSnap("rentabilidade",e.target.value)}/>
              </div>
              <div style={{fontSize:9,color:"#748CAB",marginTop:10,...noEdit}}>
                📅 Data de atualização preenchida automaticamente ao salvar
              </div>
            </div>

            <button onClick={salvar} disabled={salvando}
              style={{width:"100%",padding:14,background:"rgba(240,162,2,0.1)",border:"0.5px solid rgba(240,162,2,0.4)",borderRadius:10,color:"#F0A202",fontSize:13,cursor:"pointer",fontFamily:font,letterSpacing:"0.04em"}}>
              {salvando?"Salvando...":"💾 Salvar carteira"}
            </button>
          </div>
        )}

        {/* Nacional vs Global */}
        {totalGlobal>0&&modo==="ver"&&(
          <div style={{background:"rgba(255,255,255,0.02)",border:`0.5px solid ${BD}`,borderRadius:14,padding:"16px 14px",marginTop:16}}>
            <div style={{fontSize:10,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,...noEdit}}>
              Balanço Nacional vs Global
            </div>
            <div style={{display:"grid",gridTemplateColumns:`repeat(${totalPrevidencia>0?3:2},1fr)`,gap:10}}>
              {[
                {label:"🇧🇷 Brasil",    v:totalNacional,    cor:"#F0A202"},
                {label:"🌎 Global (USD)",v:totalGlobal,      cor:"#a855f7"},
                ...(totalPrevidencia>0?[{label:"🛡 Previdência",v:totalPrevidencia,cor:"#f59e0b"}]:[]),
              ].map(({label,v,cor})=>(
                <div key={label} style={{background:`rgba(${hexToRgb(cor)},0.05)`,border:`0.5px solid rgba(${hexToRgb(cor)},0.2)`,borderRadius:10,padding:"12px 14px",...noEdit}}>
                  <div style={{fontSize:9,color:cor,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>{label}</div>
                  <div style={{fontSize:16,fontWeight:300,color:cor}}>{brl(v)}</div>
                  <div style={{fontSize:9,color:"#748CAB",marginTop:2}}>{total>0?Math.round(v/total*100):0}% do total</div>
                  <div style={{height:2,background:"rgba(255,255,255,0.06)",borderRadius:1,overflow:"hidden",marginTop:8}}>
                    <div style={{height:"100%",width:`${total>0?v/total*100:0}%`,background:cor,borderRadius:1}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Liquidez */}
        <div className="carteira-liquidez-box" style={{marginTop:16}}>
          <div className="carteira-liquidez-label">
            Liquidez imediata disponível · D+1
            {liquidezObj>0&&<span style={{marginLeft:8,fontSize:9,background:"rgba(34,197,94,0.12)",border:"0.5px solid rgba(34,197,94,0.3)",borderRadius:4,padding:"2px 6px",color:"#22c55e"}}>via ativos</span>}
          </div>
          <div className="carteira-liquidez-content">
            <div className="carteira-liquidez-value">{brl(liquidezD1)}</div>
            <div className="carteira-liquidez-pct">{total>0?Math.round(liquidezD1/total*100):0}% do patrimônio total</div>
          </div>
          {reservaMeta>0&&(
            <div style={{marginTop:8,padding:"8px 0",borderTop:"0.5px solid rgba(255,255,255,0.06)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",...noEdit}}>
                <span style={{fontSize:11,color:"#748CAB"}}>Meta reserva (6 meses de gastos)</span>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:11,color:"#b0bec5"}}>{brl(reservaMeta)}</span>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,
                    background:liquidezOk?"rgba(34,197,94,0.12)":"rgba(239,68,68,0.1)",
                    color:liquidezOk?"#22c55e":"#ef4444",
                    border:`0.5px solid ${liquidezOk?"rgba(34,197,94,0.3)":"rgba(239,68,68,0.3)"}`,fontWeight:500}}>
                    {liquidezOk?"✓ Meta batida":"✗ Abaixo da meta"}
                  </span>
                </div>
              </div>
              {!liquidezOk&&liquidezD1>0&&<div style={{fontSize:9,color:"#f87171",marginTop:4,...noEdit}}>
                Faltam {brl(reservaMeta-liquidezD1)} para a reserva de emergência
              </div>}
            </div>
          )}
          <div className="carteira-liquidez-desc">
            {liquidezObj>0
              ?"Calculado a partir dos objetivos "Liquidez" nos ativos individuais"
              :"Padrão: Pós-Fixado · IPCA+ · Pré-Fixado (defina objetivos por ativo para personalizar)"
            }
          </div>
        </div>

        {snap.atualizadoEm&&<div className="carteira-footer">Última atualização: {snap.atualizadoEm}</div>}
      </div>
    </div>
  );
}

function hexToRgb(hex){
  const r=parseInt(hex.slice(1,3),16);
  const g=parseInt(hex.slice(3,5),16);
  const b=parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
