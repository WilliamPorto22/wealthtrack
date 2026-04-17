import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useRef, useState, useCallback, memo } from "react";
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Navbar } from "../components/Navbar";
import { T, C } from "../theme";
import { AvatarIcon } from "./Dashboard";

// ── Helpers ────────────────────────────────────────────────────
function parseCentavos(s) { return parseInt(String(s||"0").replace(/\D/g,""))||0; }
function moeda(c) {
  const n = parseCentavos(c);
  if(!n) return null;
  return (n/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2,maximumFractionDigits:2});
}
function formatMi(v) {
  if(!v||v<=0) return "—";
  if(v>=1000000) return `R$ ${(v/1000000).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}Mi`;
  if(v>=1000) return `R$ ${(v/1000).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:0})}k`;
  return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:0});
}
// Valor completo sem abreviação — R$ 1.234.567,89
function moedaFull(v) {
  if(!v||v<=0) return "—";
  return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2,maximumFractionDigits:2});
}
function calcularIdade(nasc) {
  if(!nasc) return null;
  const p = nasc.split("/");
  if(p.length<3) return null;
  const d = new Date(`${p[2]}-${p[1]}-${p[0]}`);
  if(isNaN(d)) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear()-d.getFullYear();
  const m = hoje.getMonth()-d.getMonth();
  if(m<0||(m===0&&hoje.getDate()<d.getDate())) idade--;
  return idade>0&&idade<120 ? idade : null;
}
function segmentoAuto(patrimonio) {
  const v = parseCentavos(patrimonio)/100;
  if(v<=0) return null;
  if(v<150000) return "Digital";
  if(v<400000) return "Ascensão";
  if(v<1000000) return "Exclusive";
  return "Private";
}
function formatarData(ts) {
  if(!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("pt-BR",{day:"numeric",month:"long",year:"numeric"});
}
function proximoDia1() {
  const hoje = new Date();
  const p = new Date(hoje.getFullYear(), hoje.getMonth()+1, 1);
  return `${String(p.getDate()).padStart(2,"0")}/${String(p.getMonth()+1).padStart(2,"0")}/${p.getFullYear()}`;
}
function contatoVencido(dateStr) {
  if(!dateStr) return false;
  const p = dateStr.split("/");
  if(p.length<3) return false;
  return new Date(`${p[2]}-${p[1]}-${p[0]}`) < new Date();
}

// ── Constants ──────────────────────────────────────────────────
const ESTADOS_BRASIL = [
  "AC – Acre","AL – Alagoas","AP – Amapá","AM – Amazonas","BA – Bahia",
  "CE – Ceará","DF – Distrito Federal","ES – Espírito Santo","GO – Goiás",
  "MA – Maranhão","MT – Mato Grosso","MS – Mato Grosso do Sul","MG – Minas Gerais",
  "PA – Pará","PB – Paraíba","PR – Paraná","PE – Pernambuco","PI – Piauí",
  "RJ – Rio de Janeiro","RN – Rio Grande do Norte","RS – Rio Grande do Sul",
  "RO – Rondônia","RR – Roraima","SC – Santa Catarina","SP – São Paulo",
  "SE – Sergipe","TO – Tocantins"
];
const PROFISSOES = [
  "Médico(a)","Médico Especialista","Cirurgião(ã)","Dentista","Fisioterapeuta",
  "Enfermeiro(a)","Psicólogo(a)","Farmacêutico(a)","Nutricionista","Veterinário(a)",
  "Advogado(a)","Juiz(a) / Desembargador(a)","Promotor(a) de Justiça","Defensor(a) Público",
  "Tabelião / Notário",
  "Empresário(a)","Sócio-Proprietário","Diretor(a) Executivo","CEO / Fundador",
  "Gerente","Consultor(a)","Analista",
  "Engenheiro(a) Civil","Engenheiro(a) Elétrico","Engenheiro(a) Mecânico","Engenheiro(a) de Software",
  "Arquiteto(a)","Desenvolvedor(a) / TI","Cientista de Dados","Analista de TI",
  "Economista","Contador(a)","Auditor(a)","Actuário(a)",
  "Investidor(a)","Trader","Gestor(a) de Fundos","Gestor(a) de Patrimônio",
  "Corretor(a) de Imóveis","Corretor(a) de Seguros","Agente Financeiro",
  "Professor(a)","Coordenador(a) Pedagógico","Reitor(a)",
  "Funcionário Público Federal","Funcionário Público Estadual","Servidor(a) Municipal",
  "Militar – Oficial","Militar – Praça","Policial Civil","Policial Militar","Bombeiro(a)",
  "Autônomo(a)","Comerciante","Aposentado(a)","Pensionista",
  "Agropecuarista / Produtor Rural","Piloto(a)","Jornalista",
  "Designer","Marketing / Publicidade","Administrador(a)",
  "Influencer / Criador de Conteúdo","Artista / Músico(a)","Outros"
];
const HOBBIES = [
  "Viagens","Academia","Corrida","Golfe","Tênis","Futebol","Pescaria","Leitura",
  "Ciclismo","Games","Gastronomia","Fotografia","Arte","Vinho","Surf","Música","Yoga","Meditação"
];
const AVATAR_OPTS = [
  {key:"homem",label:"Homem"},{key:"mulher",label:"Mulher"},
  {key:"idoso_h",label:"Experiente"},{key:"idoso_m",label:"Experiente"},
  {key:"cachorro",label:"Companheiro"},{key:"gato",label:"Amigável"},
];
const TIPOS_IMOVEL = ["Casa","Apartamento","Cobertura","Terreno","Sítio / Fazenda","Imóvel Comercial","Galpão / Armazém"];
const TIPOS_VEICULO = ["Carro","SUV","Picape","Moto","Caminhão","Ônibus","Barco","Aeronave","Outros"];
const FAIXAS_IMOVEL = [
  ...Array.from({length:50},(_,i)=>{const v=(i+1)*100000;return{label:`R$ ${v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`,mid:v};}),
  {label:"R$ 5.500.000,00",mid:5500000},
  {label:"R$ 6.000.000,00",mid:6000000},
  {label:"R$ 7.000.000,00",mid:7000000},
  {label:"R$ 8.000.000,00",mid:8000000},
  {label:"R$ 9.000.000,00",mid:9000000},
  {label:"R$ 10.000.000,00",mid:10000000},
  {label:"Acima de R$ 10M",mid:12000000},
];
const FAIXAS_VEICULO = [
  ...Array.from({length:50},(_,i)=>{const v=(i+1)*10000;return{label:`R$ ${v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`,mid:v};}),
  {label:"R$ 600.000,00",mid:600000},
  {label:"R$ 700.000,00",mid:700000},
  {label:"R$ 800.000,00",mid:800000},
  {label:"R$ 900.000,00",mid:900000},
  {label:"R$ 1.000.000,00",mid:1000000},
  {label:"Acima de R$ 1M",mid:1200000},
];
const CLASSES_CARTEIRA = [
  {key:"preFixado", label:"Prefixado", cor:"#F0A202"},
  {key:"posFixado", label:"Pós Fixado", cor:"#2563eb"},
  {key:"ipca",     label:"Inflação (IPCA+)", cor:"#22c55e"},
  {key:"acoes",    label:"Renda Variável", cor:"#f59e0b"},
  {key:"fiis",     label:"Fundos Imobiliários", cor:"#a855f7"},
  {key:"multi",    label:"Multimercado", cor:"#06b6d4"},
  {key:"global",   label:"Global / Exterior", cor:"#60a5fa"},
];

const noEdit = {userSelect:"none",WebkitUserSelect:"none",cursor:"default"};

// ── Sub-components ─────────────────────────────────────────────
const InputMoeda = memo(function InputMoeda({initValue,onCommit,placeholder="R$ 0,00"}) {
  const [raw,setRaw] = useState(initValue||"");
  function fmt(r) {
    if(!r) return placeholder;
    const n = parseInt(String(r).replace(/\D/g,""))||0;
    return (n/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function handleChange(e) { const v=e.target.value.replace(/\D/g,""); setRaw(v); onCommit(v); }
  return <input style={C.input} placeholder={placeholder} value={fmt(raw)} onChange={handleChange}/>;
});

const InputTexto = memo(function InputTexto({initValue,onCommit,placeholder="",type="text"}) {
  const [val,setVal] = useState(initValue||"");
  function handleChange(e) { setVal(e.target.value); onCommit(e.target.value); }
  return <input style={C.input} type={type} placeholder={placeholder} value={val} onChange={handleChange}/>;
});

const TextareaLocal = memo(function TextareaLocal({initValue,onCommit,placeholder=""}) {
  const [val,setVal] = useState(initValue||"");
  function handleChange(e) { setVal(e.target.value); onCommit(e.target.value); }
  return <textarea style={{...C.input,height:80,resize:"none",lineHeight:1.6,paddingTop:12}} placeholder={placeholder} value={val} onChange={handleChange}/>;
});

function CustomSelect({value,onChange,options,placeholder="Selecione"}) {
  const [open,setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(()=>{
    function click(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}
    document.addEventListener("mousedown",click);
    return()=>document.removeEventListener("mousedown",click);
  },[]);
  return (
    <div ref={ref} style={{position:"relative"}}>
      <div style={{...C.input,display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer",...noEdit}} onClick={()=>setOpen(o=>!o)}>
        <span style={{color:value?T.textPrimary:T.textMuted,fontSize:14}}>{value||placeholder}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{transform:open?"rotate(180deg)":"none",transition:"transform 0.2s",flexShrink:0}}><path d="M6 9l6 6 6-6"/></svg>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#111827",border:`0.5px solid ${T.border}`,borderRadius:10,zIndex:300,overflow:"hidden",boxShadow:"0 8px 24px rgba(0,0,0,0.5)",maxHeight:220,overflowY:"auto"}}>
          {options.map(opt=>(
            <div key={opt} style={{padding:"11px 16px",fontSize:13,color:value===opt?"#F0A202":T.textSecondary,background:value===opt?"rgba(240,162,2,0.08)":"transparent",cursor:"pointer",...noEdit}}
              onMouseDown={e=>{e.preventDefault();onChange(opt);setOpen(false);}}>
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// SVG Donut Chart — anel fino, centro com duas linhas
function DonutChart({data, total, centerLabel, centerValue, size=160}) {
  if(!total||total<=0) return (
    <div style={{width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center",...noEdit}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:11,color:T.textMuted}}>Sem dados</div>
      </div>
    </div>
  );
  const cx=size/2, cy=size/2;
  const Ro=size*0.46, Ri=size*0.33; // anel mais fino
  const active=data.filter(d=>d.value>0);
  const gap=active.length>1?2:0;
  let angle=-90;
  const segs=active.map(d=>{
    const pct=d.value/total;
    const sweep=pct*360-gap;
    const start=angle;
    angle+=pct*360;
    return {...d,start,sweep};
  });
  function xy(a,r){const rad=a*Math.PI/180;return[cx+r*Math.cos(rad),cy+r*Math.sin(rad)];}
  function arc(start,sweep){
    if(sweep>=359){
      const mid=(Ro+Ri)/2;
      return `M ${cx} ${cy-mid} A ${mid} ${mid} 0 1 1 ${cx-0.01} ${cy-mid} Z`;
    }
    const end=start+sweep;
    const[x1,y1]=xy(start,Ro);const[x2,y2]=xy(end,Ro);
    const[x3,y3]=xy(end,Ri);const[x4,y4]=xy(start,Ri);
    const lg=sweep>180?1:0;
    return `M${x1} ${y1} A${Ro} ${Ro} 0 ${lg} 1 ${x2} ${y2} L${x3} ${y3} A${Ri} ${Ri} 0 ${lg} 0 ${x4} ${y4} Z`;
  }
  return (
    <svg width={size} height={size} style={noEdit}>
      <circle cx={cx} cy={cy} r={(Ro+Ri)/2} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={Ro-Ri}/>
      {segs.map((s,i)=>(
        <path key={i} d={arc(s.start,s.sweep)} fill={s.cor||s.color} opacity={0.92}/>
      ))}
      <text x={cx} y={cy-6} textAnchor="middle" fontSize={size>140?11:9} fill={T.textMuted} fontFamily={T.fontFamily}>{centerLabel}</text>
      <text x={cx} y={cy+11} textAnchor="middle" fontSize={size>140?13:11} fill={T.textPrimary} fontFamily={T.fontFamily} fontWeight="300">{centerValue}</text>
    </svg>
  );
}

// Gráfico de barras verticais SVG (estilo Gráfico 3 das imagens)
function BarChartVertical({items}) {
  const active=items.filter(i=>i.v>0);
  if(!active.length) return null;
  const maxVal=Math.max(...active.map(i=>i.v));
  const rounded=Math.ceil(maxVal/100000)*100000||1;
  const H=100, barW=36, gap=56, leftPad=40, topPad=14, botPad=30;
  const totalW=leftPad+active.length*(barW+gap)-gap+16;
  const totalH=topPad+H+botPad;
  const ticks=[0,0.5,1].map(t=>rounded*t);
  function yPos(v){return topPad+H-Math.max((v/rounded)*H,0);}
  function lbl(v){
    if(v>=1000000) return `${(v/1000000).toFixed(v%1000000===0?0:1).replace(".",",")}Mi`;
    if(v>=1000) return `${Math.round(v/1000)}k`;
    return `${v}`;
  }
  function valLbl(v){
    if(v>=1000000) return `R$ ${(v/1000000).toFixed(2).replace(".",",")}Mi`;
    if(v>=1000) return `R$ ${Math.round(v/1000)}k`;
    return `R$ ${v}`;
  }
  return (
    <svg viewBox={`0 0 ${totalW} ${totalH}`} width="100%" style={{display:"block",overflow:"visible",...noEdit}}>
      {/* Grid + Y labels */}
      {ticks.map((t,i)=>(
        <g key={i}>
          <line x1={leftPad} y1={yPos(t)} x2={totalW-4} y2={yPos(t)} stroke="rgba(255,255,255,0.07)" strokeWidth={0.5}/>
          <text x={leftPad-6} y={yPos(t)+3.5} textAnchor="end" fontSize={9} fill={T.textMuted} fontFamily={T.fontFamily}>{lbl(t)}</text>
        </g>
      ))}
      {/* Bars */}
      {active.map((item,i)=>{
        const x=leftPad+i*(barW+gap);
        const bH=Math.max((item.v/rounded)*H,4);
        const y=yPos(item.v);
        return (
          <g key={item.label}>
            <rect x={x} y={y} width={barW} height={bH} fill={item.cor} rx={5} opacity={0.88}/>
            <text x={x+barW/2} y={y-6} textAnchor="middle" fontSize={9} fill={item.cor} fontFamily={T.fontFamily}>{valLbl(item.v)}</text>
            <text x={x+barW/2} y={topPad+H+18} textAnchor="middle" fontSize={9} fill={T.textMuted} fontFamily={T.fontFamily}>{item.label}</text>
          </g>
        );
      })}
      {/* Baseline */}
      <line x1={leftPad} y1={topPad+H} x2={totalW-4} y2={topPad+H} stroke="rgba(255,255,255,0.12)" strokeWidth={0.5}/>
    </svg>
  );
}

// Legenda compacta reutilizável para ring charts
function LegendaRow({label, v, cor, total}) {
  const pct = total>0?((v/total)*100).toFixed(0):0;
  return (
    <div style={{marginBottom:7,...noEdit}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:7,height:7,borderRadius:2,background:cor,flexShrink:0}}/>
          <span style={{fontSize:10,color:"#b0bec5",lineHeight:1.3}}>{label}</span>
        </div>
        <span style={{fontSize:10,color:cor,fontWeight:600}}>{pct}%</span>
      </div>
      <div style={{height:2,background:"rgba(255,255,255,0.06)",borderRadius:1,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:cor,borderRadius:1}}/>
      </div>
      <div style={{fontSize:9,color:"#748CAB",marginTop:1}}>{moedaFull(v)}</div>
    </div>
  );
}

// Gráfico de anel premium — stroke-based, glow, futurista
function RingChart({data, total, size=180}) {
  if(!total||total<=0) return (
    <div style={{width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center",...noEdit}}>
      <div style={{fontSize:11,color:T.textMuted}}>Sem dados</div>
    </div>
  );
  const cx=size/2, cy=size/2;
  const R=size*0.355;
  const SW=size*0.082;
  const C=2*Math.PI*R;
  const active=data.filter(d=>d.value>0);
  const gapDeg=active.length>1?3:0;
  let angle=-90;
  const segs=active.map(d=>{
    const pct=d.value/total;
    const sweep=pct*360;
    const dashLen=Math.max((sweep-gapDeg)/360*C,0.5);
    const rot=angle;
    angle+=sweep;
    return {...d,dashLen,rot,pct};
  });
  const circ=2*Math.PI*R;
  return(
    <svg width={size} height={size} style={noEdit}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={SW}/>
      {/* Segmentos sem glow */}
      {segs.map((s,i)=>(
        <circle
          key={i}
          cx={cx} cy={cy} r={R}
          fill="none"
          stroke={s.cor||s.color}
          strokeWidth={SW}
          strokeDasharray={`${s.dashLen} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(${s.rot},${cx},${cy})`}
          opacity={0.9}
        />
      ))}
      {/* Centro */}
      <text x={cx} y={cy-9} textAnchor="middle" fontSize={size*0.062} fill={T.textMuted} fontFamily={T.fontFamily} letterSpacing="0.08em">TOTAL</text>
      <text x={cx} y={cy+12} textAnchor="middle" fontSize={size*0.105} fill={T.textPrimary} fontFamily={T.fontFamily} fontWeight="200">{formatMi(total)}</text>
    </svg>
  );
}

// Accordion Section
function AccordionSection({title,subtitle,icon,isOpen,onToggle,children,badge,badgeColor="#22c55e"}) {
  return (
    <div style={{background:T.bgCard,border:`0.5px solid ${T.border}`,borderRadius:16,marginBottom:10,overflow:"hidden"}}>
      <div onClick={onToggle} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",cursor:"pointer",...noEdit}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:9,background:"rgba(240,162,2,0.07)",border:"0.5px solid rgba(240,162,2,0.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>
            {icon}
          </div>
          <div>
            <div style={{fontSize:14,fontWeight:500,color:T.textPrimary,lineHeight:1.2}}>{title}</div>
            {subtitle&&<div style={{fontSize:11,color:T.textSecondary,marginTop:3,letterSpacing:"0.01em"}}>{subtitle}</div>}
          </div>
          {badge&&<span style={{fontSize:9,padding:"3px 8px",borderRadius:20,background:`${badgeColor}18`,color:badgeColor,border:`0.5px solid ${badgeColor}40`,letterSpacing:"0.06em",...noEdit}}>{badge}</span>}
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{transform:isOpen?"rotate(180deg)":"none",transition:"transform 0.3s",flexShrink:0}}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>
      {isOpen&&<div style={{padding:"4px 20px 22px",borderTop:`0.5px solid ${T.border}`}}>{children}</div>}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────
export default function ClienteFicha() {
  const {id} = useParams();
  const navigate = useNavigate();
  const [modo,setModo] = useState(id==="novo"?"editar":"ver");

  const formRef = useRef({
    nome:"",codigo:"",email:"",telefone:"",uf:"",
    avatar:"homem",patrimonio:"",aporte:"",desde:"",
    nascimento:"",hobby:"",profissao:"",
    statusAporteMes:"",nextContactDate:"",notes:"",
    gastosMensaisManual:"",aporteRegistradoMes:"",
    salarioMensal:"",metaAporteMensal:"",
    imoveis:[],veiculos:[],veiculoValor:"",
  });
  const savedDataRef = useRef({});

  const [snap,setSnap] = useState({...formRef.current});
  const [gastosSync,setGastosSync] = useState(0);
  const [ultimaRevisao,setUltimaRevisao] = useState(null);
  const [marcandoRevisao,setMarcandoRevisao] = useState(false);
  const [salvando,setSalvando] = useState(false);
  const [msg,setMsg] = useState("");
  const [carregou,setCarregou] = useState(false);

  const [modalAporte,setModalAporte] = useState(false);
  const [valorAporteInput,setValorAporteInput] = useState("");
  const [modalNaoAportou,setModalNaoAportou] = useState(false);
  const [dataProximoContato,setDataProximoContato] = useState("");
  const [mesDetalhes,setMesDetalhes] = useState(null);

  const [sections,setSections] = useState({
    rendas:false, patrimonio:false, carteira:false, reserva:false, aportes:false, dados:false
  });
  function toggleSection(k){setSections(s=>({...s,[k]:!s[k]}));}

  useEffect(()=>{
    if(id==="novo"){setCarregou(true);return;}
    async function carregar(){
      const s = await getDoc(doc(db,"clientes",id));
      if(!s.exists()){setCarregou(true);return;}
      const data={
        avatar:"homem",statusAporteMes:"",nextContactDate:"",notes:"",
        gastosMensaisManual:"",aporteRegistradoMes:"",
        salarioMensal:"",metaAporteMensal:"",
        imoveis:[],veiculos:[],veiculoValor:"",
        ...s.data()
      };
      formRef.current={...data};
      savedDataRef.current={...data};
      setSnap({...data});
      setUltimaRevisao(data.lastReviewDate||data.ultimaRevisao||null);
      if(data.fluxo){
        const cats=["moradia","alimentacao","educacao","cartoes","carro","saude","outros"];
        const total=cats.reduce((acc,k)=>acc+(parseCentavos(data.fluxo[k])/100),0);
        setGastosSync(total);
      }
      setCarregou(true);
    }
    carregar();
  },[id]);

  useEffect(()=>{
    if(!snap.gastosMensaisManual&&gastosSync>0){
      const c=Math.round(gastosSync*100);
      setFSnap("gastosMensaisManual",String(c));
    }
  },[gastosSync]);

  const setF = useCallback((k,v)=>{formRef.current={...formRef.current,[k]:v};},[]);
  const setFSnap = useCallback((k,v)=>{formRef.current={...formRef.current,[k]:v};setSnap(prev=>({...prev,[k]:v}));},[]);

  // ── Calculations ──────────────────────────────────────────────
  const hoje = new Date();
  const gastosMensaisEfetivo = (parseCentavos(snap.gastosMensaisManual)/100)||gastosSync;
  const aporteRegistradoVal = parseCentavos(snap.aporteRegistradoMes)/100;
  const rendaMensal = parseCentavos(snap.salarioMensal)/100||parseCentavos(snap.fluxo?.renda)/100||0;

  // Portfolio total
  const totalCarteira = CLASSES_CARTEIRA.reduce((acc,c)=>acc+parseCentavos(snap.carteira?.[c.key])/100,0);

  // Real estate total (midpoints × quantity)
  const totalImoveis = (snap.imoveis||[]).reduce((acc,im)=>{
    const f=FAIXAS_IMOVEL.find(x=>x.label===im.faixa);
    const qtd=Math.max(parseInt(im.quantidade)||1,1);
    return acc+(f?f.mid*qtd:0);
  },0);

  // Vehicles array total
  const totalVeiculosArray = (snap.veiculos||[]).reduce((acc,v)=>{
    const f=FAIXAS_VEICULO.find(x=>x.label===v.faixa);
    const qtd=Math.max(parseInt(v.quantidade)||1,1);
    return acc+(f?f.mid*qtd:0);
  },0);
  // Legacy single field
  const totalVeiculosLegacy = parseCentavos(snap.veiculoValor)/100;
  const totalVeiculos = totalVeiculosArray>0 ? totalVeiculosArray : totalVeiculosLegacy;

  // Total patrimônio
  const patrimonioCalculado = totalCarteira+totalImoveis+totalVeiculos;
  const patrimonioManual = parseCentavos(snap.patrimonio)/100;
  const patrimonioDisplay = patrimonioCalculado>0?patrimonioCalculado:patrimonioManual;
  // Segmento usa só patrimônio financeiro (carteira ou campo manual)
  const patrimonioFinanceiro = totalCarteira>0 ? totalCarteira : patrimonioManual;
  const segmento = segmentoAuto(String(Math.round(patrimonioFinanceiro*100)));

  // Emergency reserve
  const reservaMeta = gastosMensaisEfetivo*6;

  // Alerts
  const alertaContato = snap.nextContactDate&&contatoVencido(snap.nextContactDate);
  const alertaViradaMes = hoje.getDate()===1&&id!=="novo";
  const dataRevisao = formatarData(ultimaRevisao);
  function revisaoPendente(){
    if(!ultimaRevisao) return true;
    try{
      const r=ultimaRevisao.toDate?ultimaRevisao.toDate():new Date(ultimaRevisao);
      if(r.getMonth()===hoje.getMonth()&&r.getFullYear()===hoje.getFullYear()) return false;
      return hoje.getDate()>15;
    }catch{return true;}
  }
  const pendente = id!=="novo"&&revisaoPendente();
  const idade = calcularIdade(snap.nascimento);

  // ── Handlers ─────────────────────────────────────────────────
  function handleAportou(){setFSnap("statusAporteMes","aportou");setModalAporte(true);}

  async function confirmarAporte(){
    const reais=parseInt(valorAporteInput.replace(/\D/g,""))||0;
    const centavos=reais*100;
    if(centavos===0){setMsg("Informe um valor válido.");return;}
    const novoRegistroMes=parseCentavos(snap.aporteRegistradoMes)+centavos;
    setFSnap("aporteRegistradoMes",String(novoRegistroMes));
    const novoAporte=parseCentavos(snap.aporte)+centavos;
    setFSnap("aporte",String(novoAporte));
    const mesAtual=hoje.getMonth()+1;
    const hist=[...(snap.carteiraHistorico||[])];
    const idx=hist.findIndex(m=>m.mes===mesAtual);
    const mov={mes:mesAtual,tipo:"aporte",valor:String(novoRegistroMes),data:hoje.toLocaleDateString("pt-BR")};
    if(idx>=0)hist[idx]=mov; else hist.push(mov);
    setFSnap("carteiraHistorico",hist);
    try{
      await setDoc(doc(db,"clientes",id),{...formRef.current,aporteRegistradoMes:String(novoRegistroMes),aporte:String(novoAporte),carteiraHistorico:hist});
      setMsg("Aporte registrado com sucesso.");
    }catch(e){setMsg("Erro: "+e.message);}
    setModalAporte(false);setValorAporteInput("");
  }

  function handleNaoAportou(){setFSnap("statusAporteMes","nao_aportou");setDataProximoContato(proximoDia1());setModalNaoAportou(true);}
  function confirmarNaoAportou(){setFSnap("nextContactDate",dataProximoContato);setModalNaoAportou(false);setDataProximoContato("");}

  function adicionarImovel(){const n=[...(snap.imoveis||[]),{tipo:"Casa",nome:"",quantidade:1,faixa:"R$ 500.000,00"}];setFSnap("imoveis",n);}
  function removerImovel(i){const n=(snap.imoveis||[]).filter((_,idx)=>idx!==i);setFSnap("imoveis",n);}
  function atualizarImovel(i,campo,valor){const n=(snap.imoveis||[]).map((im,idx)=>idx===i?{...im,[campo]:valor}:im);setFSnap("imoveis",n);}

  function adicionarVeiculo(){const n=[...(snap.veiculos||[]),{tipo:"Carro",nome:"",quantidade:1,faixa:"R$ 50.000,00"}];setFSnap("veiculos",n);}
  function removerVeiculo(i){const n=(snap.veiculos||[]).filter((_,idx)=>idx!==i);setFSnap("veiculos",n);}
  function atualizarVeiculo(i,campo,valor){const n=(snap.veiculos||[]).map((v,idx)=>idx===i?{...v,[campo]:valor}:v);setFSnap("veiculos",n);}

  async function salvar(){
    if(!formRef.current.nome){setMsg("Nome é obrigatório.");return;}
    setSalvando(true);
    try{
      const patFinal=patrimonioCalculado>0?String(Math.round(patrimonioCalculado*100)):formRef.current.patrimonio;
      // Segmento: só patrimônio financeiro (carteira ou campo manual)
      const patFinSeg = totalCarteira>0 ? String(Math.round(totalCarteira*100)) : formRef.current.patrimonio;
      const seg=segmentoAuto(patFinSeg);
      const data={...formRef.current,segmento:seg||"",patrimonio:patFinal};
      if(id==="novo"){
        const ref=await addDoc(collection(db,"clientes"),data);
        setMsg("Cliente salvo.");
        setTimeout(()=>navigate(`/cliente/${ref.id}`),800);
      }else{
        await setDoc(doc(db,"clientes",id),data);
        savedDataRef.current={...data};
        setSnap({...data});
        setMsg("Dados atualizados.");
        setModo("ver");
      }
    }catch(e){setMsg("Erro: "+e.message);}
    setSalvando(false);
  }

  function cancelarEdicao(){
    formRef.current={...savedDataRef.current};
    setSnap({...savedDataRef.current});
    setModo("ver");
  }

  async function marcarRevisao(){
    setMarcandoRevisao(true);
    try{
      const s=await getDoc(doc(db,"clientes",id));
      await setDoc(doc(db,"clientes",id),{...s.data(),lastReviewDate:serverTimestamp()});
      setUltimaRevisao({toDate:()=>new Date()});
      setMsg("Revisão marcada.");
    }catch{setMsg("Erro ao marcar revisão.");}
    setMarcandoRevisao(false);
  }

  if(!carregou) return(
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.fontFamily}}>
      <div style={{fontSize:13,color:T.textMuted}}>Carregando...</div>
    </div>
  );

  // ── Label helper ───────────────────────────────────────────────
  const Lbl=({children})=><label style={{...C.label,...noEdit}}>{children}</label>;
  const ValorTexto=({valor,cor})=>(
    <div style={{fontSize:14,color:cor||T.textSecondary,padding:"9px 0",borderBottom:`0.5px solid ${T.border}`,...noEdit}}>{valor||"—"}</div>
  );

  // ── MAIN RENDER ───────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:T.fontFamily}}>
      <Navbar
        actionButtons={[
          {
            label:modo==="ver"?"Editar":"Salvar",
            variant:modo==="editar"?"primary":"secondary",
            onClick:()=>modo==="ver"?setModo("editar"):salvar(),
            disabled:salvando
          },
          ...(modo==="editar"&&id!=="novo"?[{label:"Cancelar",variant:"secondary",onClick:cancelarEdicao}]:[])
        ]}
      />

      {/* MODAL: Aporte */}
      {modalAporte&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:T.bgCard,border:`0.5px solid ${T.border}`,borderRadius:18,padding:"28px 24px",width:320,maxWidth:"100%"}}>
            <div style={{fontSize:16,fontWeight:300,color:T.textPrimary,marginBottom:4,...noEdit}}>Valor aportado</div>
            <div style={{fontSize:12,color:T.textMuted,marginBottom:20,...noEdit}}>Quanto o cliente aportou este mês?</div>
            <div style={{fontSize:26,fontWeight:300,color:"#22c55e",marginBottom:12,textAlign:"center",...noEdit}}>
              {valorAporteInput?(parseInt(valorAporteInput.replace(/\D/g,""))||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2}):"R$ 0,00"}
            </div>
            <input style={{...C.input,textAlign:"center",fontSize:14}} placeholder="0" value={valorAporteInput} onChange={e=>setValorAporteInput(e.target.value)} autoFocus inputMode="numeric"/>
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <button style={{flex:1,padding:11,background:"none",border:`0.5px solid ${T.border}`,borderRadius:9,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>{setModalAporte(false);setValorAporteInput("");}}>Cancelar</button>
              <button style={{flex:1,padding:11,background:"rgba(34,197,94,0.1)",border:"0.5px solid rgba(34,197,94,0.4)",borderRadius:9,color:"#22c55e",fontSize:11,cursor:"pointer",fontFamily:"inherit"}} onClick={confirmarAporte}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Não aportou */}
      {modalNaoAportou&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:T.bgCard,border:`0.5px solid ${T.border}`,borderRadius:18,padding:"28px 24px",width:340,maxWidth:"100%"}}>
            <div style={{fontSize:16,fontWeight:300,color:T.textPrimary,marginBottom:4,...noEdit}}>Cliente sem aporte</div>
            <div style={{fontSize:12,color:T.textMuted,marginBottom:20,...noEdit}}>Quando será o próximo contato?</div>
            <div style={{background:"rgba(245,158,11,0.05)",border:"0.5px solid rgba(245,158,11,0.2)",borderRadius:10,padding:14,marginBottom:16}}>
              <div style={{fontSize:10,color:"#f59e0b",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6,...noEdit}}>Próximo Contato</div>
              <div style={{fontSize:14,color:T.textPrimary}}>{dataProximoContato}</div>
            </div>
            <input style={{...C.input,marginBottom:16}} type="date"
              value={dataProximoContato.split("/").reverse().join("-")||""}
              onChange={e=>{if(e.target.value){const[a,m,d]=e.target.value.split("-");setDataProximoContato(`${d}/${m}/${a}`);}}}
            />
            <div style={{display:"flex",gap:10}}>
              <button style={{flex:1,padding:11,background:"none",border:`0.5px solid ${T.border}`,borderRadius:9,color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>{setModalNaoAportou(false);setDataProximoContato("");}}>Cancelar</button>
              <button style={{flex:1,padding:11,background:"rgba(245,158,11,0.1)",border:"0.5px solid rgba(245,158,11,0.4)",borderRadius:9,color:"#f59e0b",fontSize:11,cursor:"pointer",fontFamily:"inherit"}} onClick={confirmarNaoAportou}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Mês detalhes */}
      {mesDetalhes&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:T.bgCard,border:`0.5px solid ${T.border}`,borderRadius:18,padding:"28px 24px",width:320,maxWidth:"100%"}}>
            <div style={{fontSize:16,fontWeight:300,color:T.textPrimary,marginBottom:4,...noEdit}}>
              {["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][mesDetalhes.mes]}
            </div>
            <div style={{fontSize:12,color:T.textMuted,marginBottom:20,...noEdit}}>Detalhes da movimentação</div>
            {mesDetalhes.movimento&&(
              <div style={{background:mesDetalhes.movimento.tipo==="aporte"?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)",border:`0.5px solid ${mesDetalhes.movimento.tipo==="aporte"?"rgba(34,197,94,0.25)":"rgba(239,68,68,0.25)"}`,borderRadius:12,padding:16,marginBottom:20}}>
                <div style={{fontSize:10,color:mesDetalhes.movimento.tipo==="aporte"?"#22c55e":"#ef4444",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,...noEdit}}>
                  {mesDetalhes.movimento.tipo==="aporte"?"↑ Aporte":"↓ Resgate"}
                </div>
                <div style={{fontSize:22,fontWeight:300,color:T.textPrimary}}>{moeda(mesDetalhes.movimento.valor)||"—"}</div>
                {mesDetalhes.movimento.data&&<div style={{fontSize:11,color:T.textMuted,marginTop:8,...noEdit}}>{mesDetalhes.movimento.data}</div>}
              </div>
            )}
            <button style={{width:"100%",padding:11,background:"rgba(255,255,255,0.04)",border:`0.5px solid ${T.border}`,borderRadius:9,color:T.textSecondary,fontSize:11,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>setMesDetalhes(null)}>Fechar</button>
          </div>
        </div>
      )}

      {/* Botão ← fixo lateral esquerda — mesmo estilo de Objetivos */}
      <button
        onClick={()=>navigate("/dashboard")}
        style={{
          position:"fixed",top:"50%",left:16,transform:"translateY(-50%)",
          width:44,height:44,borderRadius:22,
          background:"rgba(240,162,2,0.15)",border:"1px solid rgba(240,162,2,0.3)",
          color:"#F0A202",fontSize:20,cursor:"pointer",zIndex:50,
          display:"flex",alignItems:"center",justifyContent:"center",
          transition:"all 0.3s ease",boxShadow:"0 4px 12px rgba(0,0,0,0.3)",
          fontFamily:T.fontFamily,
        }}
        onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-50%) scale(1.15)";e.currentTarget.style.background="rgba(240,162,2,0.25)";}}
        onMouseLeave={e=>{e.currentTarget.style.transform="translateY(-50%) scale(1)";e.currentTarget.style.background="rgba(240,162,2,0.15)";}}
      >
        ←
      </button>

      <div style={{maxWidth:960,margin:"0 auto",padding:"36px 32px 80px"}}>

        {/* Alertas */}
        {alertaViradaMes&&(
          <div style={{background:"rgba(168,85,247,0.08)",border:"0.5px solid rgba(168,85,247,0.3)",borderRadius:10,padding:"12px 16px",fontSize:12,color:"#a855f7",marginBottom:10,lineHeight:1.6,...noEdit}}>
            📅 Início do mês — lembre de entrar em contato e verificar o aporte.
          </div>
        )}
        {alertaContato&&(
          <div style={{background:"rgba(245,158,11,0.08)",border:"0.5px solid rgba(245,158,11,0.3)",borderRadius:10,padding:"12px 16px",fontSize:12,color:"#f59e0b",marginBottom:10,lineHeight:1.6,...noEdit}}>
            ⚠ Contato vencido: <b>{snap.nextContactDate}</b>. Entre em contato agora!
          </div>
        )}

        {/* ─── HERO CARD ─────────────────────────────────────────── */}
        <div style={{background:"linear-gradient(145deg,rgba(29,45,68,0.95),rgba(13,19,33,0.98))",border:`0.5px solid ${T.border}`,borderRadius:20,padding:"20px",marginBottom:12,boxShadow:"0 6px 32px rgba(0,0,0,0.5)"}}>

          {/* Avatar + Nome + badges */}
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
            {/* Avatar sem badge flutuante */}
            <AvatarIcon tipo={snap.avatar} size={64}/>

            {/* Info */}
            <div style={{flex:1,minWidth:0}}>
              {/* Nome + segmento inline */}
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                <div style={{fontSize:22,fontWeight:300,color:T.textPrimary,letterSpacing:"-0.01em",lineHeight:1.2,...noEdit}}>
                  {snap.nome||"Novo cliente"}
                </div>
                {segmento&&(
                  <span style={{fontSize:10,padding:"3px 10px",borderRadius:20,background:"rgba(240,162,2,0.15)",color:"#F0A202",border:"0.5px solid rgba(240,162,2,0.4)",letterSpacing:"0.06em",fontWeight:500,whiteSpace:"nowrap",...noEdit}}>
                    {segmento}
                  </span>
                )}
              </div>
              <div style={{fontSize:12,color:T.textSecondary,lineHeight:1.5,...noEdit}}>
                {[snap.profissao,snap.uf?snap.uf.split("–")[0].trim():null,idade?`${idade} anos`:null].filter(Boolean).join(" · ")}
              </div>
              <div style={{fontSize:11,marginTop:5,...noEdit,color:pendente?"#f59e0b":"#3E5C76"}}>
                {pendente?"⚠ Revisão pendente este mês":`✓ Revisado em ${dataRevisao}`}
              </div>
            </div>
          </div>

          {/* Botões de ação */}
          {id!=="novo"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:18}}>
              {/* Marcar revisão */}
              <button
                onClick={marcarRevisao}
                disabled={marcandoRevisao}
                style={{padding:"12px 10px",background:"rgba(240,162,2,0.07)",border:"0.5px solid rgba(240,162,2,0.28)",borderRadius:10,color:"#F0A202",fontSize:12,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.04em",textAlign:"center",fontWeight:500,...noEdit}}
              >
                {marcandoRevisao?"Salvando...":"Marcar revisão"}
              </button>

              {/* Status de aporte do mês — inteligente */}
              {(()=>{
                const aportou   = snap.statusAporteMes==="aportou";
                const semAporte = snap.statusAporteMes==="nao_aportou";
                const metaReais = parseCentavos(snap.metaAporteMensal)/100;
                const bateuMeta = aportou && metaReais>0 && aporteRegistradoVal>=metaReais;
                const abaixoMeta= aportou && metaReais>0 && aporteRegistradoVal<metaReais;

                let corBg, corBorder, corTexto, linha1, linha2;
                if(bateuMeta){
                  corBg="rgba(34,197,94,0.12)"; corBorder="rgba(34,197,94,0.45)"; corTexto="#22c55e";
                  linha1="✓ Meta batida!";
                  linha2=moedaFull(aporteRegistradoVal);
                } else if(abaixoMeta){
                  corBg="rgba(245,158,11,0.09)"; corBorder="rgba(245,158,11,0.4)"; corTexto="#f59e0b";
                  linha1="✓ Abaixo da meta";
                  linha2=`${moedaFull(aporteRegistradoVal)} / ${moedaFull(metaReais)}`;
                } else if(aportou){
                  corBg="rgba(34,197,94,0.08)"; corBorder="rgba(34,197,94,0.3)"; corTexto="#22c55e";
                  linha1="✓ Aporte feito";
                  linha2=aporteRegistradoVal>0?moedaFull(aporteRegistradoVal):"";
                } else if(semAporte){
                  corBg="rgba(239,68,68,0.08)"; corBorder="rgba(239,68,68,0.3)"; corTexto="#ef4444";
                  linha1="✗ Sem aporte"; linha2="este mês";
                } else {
                  corBg="rgba(255,255,255,0.03)"; corBorder="rgba(255,255,255,0.08)"; corTexto=T.textMuted;
                  linha1="Aporte pendente"; linha2="";
                }
                return (
                  <button
                    onClick={()=>toggleSection("aportes")}
                    style={{padding:"12px 10px",background:corBg,border:`0.5px solid ${corBorder}`,borderRadius:10,color:corTexto,fontSize:12,cursor:"pointer",fontFamily:"inherit",textAlign:"center",lineHeight:1.5,...noEdit}}
                  >
                    <div style={{fontWeight:500}}>{linha1}</div>
                    {linha2&&<div style={{fontSize:11,opacity:0.75,marginTop:2}}>{linha2}</div>}
                  </button>
                );
              })()}
            </div>
          )}

          {/* KPI strip — 3 caixinhas */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {/* Patrimônio Total — valor completo */}
            <div style={{background:"rgba(34,197,94,0.07)",border:"0.5px solid rgba(34,197,94,0.2)",borderRadius:12,padding:"12px 10px",textAlign:"center",...noEdit}}>
              <div style={{fontSize:9,color:"#86efac",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6,fontWeight:500}}>Patrimônio Total</div>
              <div style={{fontSize:13,fontWeight:400,color:"#22c55e",lineHeight:1.4,wordBreak:"break-all"}}>
                {moedaFull(patrimonioDisplay)}
              </div>
            </div>
            {/* Renda Mensal — valor completo */}
            <div style={{background:"rgba(96,165,250,0.07)",border:"0.5px solid rgba(96,165,250,0.2)",borderRadius:12,padding:"12px 10px",textAlign:"center",...noEdit}}>
              <div style={{fontSize:9,color:"#93c5fd",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6,fontWeight:500}}>Renda Mensal</div>
              <div style={{fontSize:13,fontWeight:400,color:"#60a5fa",lineHeight:1.4,wordBreak:"break-all"}}>
                {rendaMensal>0?moedaFull(rendaMensal):"—"}
              </div>
            </div>
            {/* Reserva de Emergência — valor completo */}
            <div style={{background:"rgba(168,85,247,0.07)",border:"0.5px solid rgba(168,85,247,0.2)",borderRadius:12,padding:"12px 10px",textAlign:"center",...noEdit}}>
              <div style={{fontSize:9,color:"#c4b5fd",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6,fontWeight:500}}>Reserva Emergência</div>
              <div style={{fontSize:13,fontWeight:400,color:"#a855f7",lineHeight:1.4,wordBreak:"break-all"}}>
                {reservaMeta>0?moedaFull(reservaMeta):"—"}
              </div>
            </div>
          </div>
        </div>

        {/* Feedback */}
        {msg&&(
          <div style={{background:msg.includes("Erro")?"rgba(239,68,68,0.08)":"rgba(34,197,94,0.08)",border:`0.5px solid ${msg.includes("Erro")?"rgba(239,68,68,0.25)":"rgba(34,197,94,0.25)"}`,borderRadius:10,padding:"11px 14px",fontSize:12,color:msg.includes("Erro")?T.danger:T.success,marginBottom:14,lineHeight:1.5,...noEdit}}>
            {msg}
          </div>
        )}

        {/* ─── EDIT MODE ──────────────────────────────────────────── */}
        {modo==="editar"&&(
          <div style={{background:T.bgCard,border:`0.5px solid ${T.border}`,borderRadius:16,padding:"24px 20px"}}>

            {/* Avatar */}
            <div style={{marginBottom:24}}>
              <div style={{fontSize:10,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12,...noEdit}}>Avatar</div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                {AVATAR_OPTS.map(opt=>(
                  <div key={opt.key} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,cursor:"pointer",opacity:snap.avatar===opt.key?1:0.35,transition:"opacity 0.2s",...noEdit}} onClick={()=>setFSnap("avatar",opt.key)}>
                    <AvatarIcon tipo={opt.key} size={40}/>
                    <span style={{fontSize:9,color:T.textMuted}}>{opt.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dados pessoais */}
            <div style={{fontSize:10,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:14,...noEdit}}>Dados Pessoais</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
              <div style={{gridColumn:"1/-1"}}>
                <Lbl>Nome completo</Lbl>
                <InputTexto key={`nome-${id}`} initValue={snap.nome} onCommit={v=>setFSnap("nome",v)} placeholder="Nome do cliente"/>
              </div>
              <div>
                <Lbl>Código do cliente</Lbl>
                <InputTexto key={`cod-${id}`} initValue={snap.codigo} onCommit={v=>setF("codigo",v)}/>
              </div>
              <div>
                <Lbl>Cliente desde</Lbl>
                <InputTexto key={`desde-${id}`} initValue={snap.desde} onCommit={v=>setF("desde",v)} placeholder="jan/2023"/>
              </div>
              <div>
                <Lbl>Data de nascimento</Lbl>
                <InputTexto key={`nasc-${id}`} initValue={snap.nascimento} onCommit={v=>setFSnap("nascimento",v)} placeholder="DD/MM/AAAA"/>
              </div>
              <div>
                <Lbl>E-mail</Lbl>
                <InputTexto key={`email-${id}`} initValue={snap.email} onCommit={v=>setF("email",v)} type="email"/>
              </div>
              <div>
                <Lbl>Telefone</Lbl>
                <InputTexto key={`tel-${id}`} initValue={snap.telefone} onCommit={v=>setF("telefone",v)} placeholder="(51) 99999-9999"/>
              </div>
              <div>
                <Lbl>Estado (UF)</Lbl>
                <CustomSelect value={snap.uf} onChange={v=>setFSnap("uf",v)} options={ESTADOS_BRASIL} placeholder="Selecione o estado"/>
              </div>
              <div>
                <Lbl>Profissão</Lbl>
                <CustomSelect value={snap.profissao} onChange={v=>setFSnap("profissao",v)} options={PROFISSOES}/>
              </div>
              <div>
                <Lbl>Hobby / Interesse</Lbl>
                <CustomSelect value={snap.hobby} onChange={v=>setFSnap("hobby",v)} options={HOBBIES}/>
              </div>
            </div>

            {/* Financeiro */}
            <div style={{fontSize:10,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:14,...noEdit}}>Dados Financeiros</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
              <div>
                <Lbl>Salário / Renda mensal</Lbl>
                <InputMoeda key={`sal-${id}`} initValue={snap.salarioMensal} onCommit={v=>setFSnap("salarioMensal",v)}/>
              </div>
              <div>
                <Lbl>Despesas mensais</Lbl>
                <InputMoeda key={`gasp-${id}`} initValue={snap.gastosMensaisManual||String(Math.round(gastosSync*100))} onCommit={v=>setFSnap("gastosMensaisManual",v)}/>
              </div>
              <div>
                <Lbl>Meta de aporte mensal</Lbl>
                <InputMoeda key={`meta-${id}`} initValue={snap.metaAporteMensal} onCommit={v=>setFSnap("metaAporteMensal",v)}/>
              </div>
              <div>
                <Lbl>Patrimônio total (manual)</Lbl>
                <InputMoeda key={`pat-${id}`} initValue={snap.patrimonio} onCommit={v=>setFSnap("patrimonio",v)}/>
                <div style={{fontSize:9,color:T.textMuted,marginTop:4,...noEdit}}>Preenchido automaticamente se imóveis/carteira estiverem cadastrados</div>
              </div>
            </div>

            {/* Imóveis */}
            <div style={{fontSize:10,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:14,...noEdit}}>Patrimônio Imobiliário</div>
            {(snap.imoveis||[]).length===0&&(
              <div style={{fontSize:12,color:T.textMuted,marginBottom:12,padding:"12px 0",...noEdit}}>Nenhum imóvel cadastrado.</div>
            )}
            {(snap.imoveis||[]).map((im,i)=>(
              <div key={i} style={{background:"rgba(255,255,255,0.02)",border:`0.5px solid ${T.border}`,borderRadius:12,padding:"14px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:10,color:"#22c55e",textTransform:"uppercase",letterSpacing:"0.1em",...noEdit}}>Imóvel {i+1}</div>
                  <button onClick={()=>removerImovel(i)} style={{padding:"4px 10px",background:"rgba(239,68,68,0.08)",border:"0.5px solid rgba(239,68,68,0.2)",borderRadius:7,color:"#ef4444",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Remover</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <Lbl>Tipo de imóvel</Lbl>
                    <CustomSelect value={im.tipo} onChange={v=>atualizarImovel(i,"tipo",v)} options={TIPOS_IMOVEL}/>
                  </div>
                  <div>
                    <Lbl>Nome / Identificação</Lbl>
                    <InputTexto key={`im-nome-${i}`} initValue={im.nome||""} onCommit={v=>atualizarImovel(i,"nome",v)} placeholder="Ex: Casa principal"/>
                  </div>
                  <div>
                    <Lbl>Quantidade</Lbl>
                    <input type="number" min="1" max="99" value={im.quantidade||1} onChange={e=>atualizarImovel(i,"quantidade",Math.max(1,parseInt(e.target.value)||1))} style={{...C.input,width:"100%"}}/>
                  </div>
                  <div>
                    <Lbl>Valor (R$)</Lbl>
                    <CustomSelect value={im.faixa} onChange={v=>atualizarImovel(i,"faixa",v)} options={FAIXAS_IMOVEL.map(f=>f.label)}/>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={adicionarImovel} style={{padding:"10px 16px",background:"rgba(240,162,2,0.06)",border:"0.5px solid rgba(240,162,2,0.2)",borderRadius:9,color:"#F0A202",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.06em",marginBottom:20}}>
              + Adicionar imóvel
            </button>

            {/* Veículos */}
            <div style={{fontSize:10,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:14,...noEdit}}>Veículos</div>
            {(snap.veiculos||[]).length===0&&(
              <div style={{fontSize:12,color:T.textMuted,marginBottom:12,padding:"12px 0",...noEdit}}>Nenhum veículo cadastrado.</div>
            )}
            {(snap.veiculos||[]).map((v,i)=>(
              <div key={i} style={{background:"rgba(255,255,255,0.02)",border:`0.5px solid ${T.border}`,borderRadius:12,padding:"14px",marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:10,color:"#60a5fa",textTransform:"uppercase",letterSpacing:"0.1em",...noEdit}}>Veículo {i+1}</div>
                  <button onClick={()=>removerVeiculo(i)} style={{padding:"4px 10px",background:"rgba(239,68,68,0.08)",border:"0.5px solid rgba(239,68,68,0.2)",borderRadius:7,color:"#ef4444",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Remover</button>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div>
                    <Lbl>Tipo de veículo</Lbl>
                    <CustomSelect value={v.tipo} onChange={val=>atualizarVeiculo(i,"tipo",val)} options={TIPOS_VEICULO}/>
                  </div>
                  <div>
                    <Lbl>Nome / Identificação</Lbl>
                    <InputTexto key={`ve-nome-${i}`} initValue={v.nome||""} onCommit={val=>atualizarVeiculo(i,"nome",val)} placeholder="Ex: Honda Civic"/>
                  </div>
                  <div>
                    <Lbl>Quantidade</Lbl>
                    <input type="number" min="1" max="99" value={v.quantidade||1} onChange={e=>atualizarVeiculo(i,"quantidade",Math.max(1,parseInt(e.target.value)||1))} style={{...C.input,width:"100%"}}/>
                  </div>
                  <div>
                    <Lbl>Valor (R$)</Lbl>
                    <CustomSelect value={v.faixa} onChange={val=>atualizarVeiculo(i,"faixa",val)} options={FAIXAS_VEICULO.map(f=>f.label)}/>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={adicionarVeiculo} style={{padding:"10px 16px",background:"rgba(96,165,250,0.06)",border:"0.5px solid rgba(96,165,250,0.2)",borderRadius:9,color:"#60a5fa",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.06em",marginBottom:20}}>
              + Adicionar veículo
            </button>

            <button onClick={salvar} disabled={salvando} style={{...C.btnPrimary,marginTop:4}}>
              {salvando?"Salvando...":"Salvar alterações"}
            </button>
          </div>
        )}

        {/* ─── VIEW MODE SECTIONS ─────────────────────────────────── */}
        {modo==="ver"&&id!=="novo"&&(
          <>
            {/* Quick links */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
              {[["Objetivos","objetivos","🎯"],["Carteira","carteira","📊"],["Fluxo Mensal","fluxo","💸"]].map(([l,r,ic])=>(
                <div key={l} style={{background:T.bgCard,border:`0.5px solid ${T.border}`,borderRadius:12,padding:"14px 12px",textAlign:"center",cursor:"pointer",...noEdit}} onClick={()=>navigate(`/cliente/${id}/${r}`)}>
                  <div style={{fontSize:18,marginBottom:6}}>{ic}</div>
                  <div style={{fontSize:11,color:T.textPrimary,marginBottom:3}}>{l}</div>
                  <div style={{fontSize:9,color:"#F0A202",letterSpacing:"0.08em"}}>Abrir →</div>
                </div>
              ))}
            </div>

            {/* ── SEÇÃO: Patrimônio Consolidado ─────────────────────── */}
            <AccordionSection
              title="Patrimônio Consolidado"
              subtitle={patrimonioDisplay>0?`Visão patrimonial completa · ${moedaFull(patrimonioDisplay)}`:"Cadastre seus bens para visualizar"}
              icon="🏛️"
              isOpen={sections.patrimonio}
              onToggle={()=>toggleSection("patrimonio")}
            >
              <div style={{paddingTop:16}}>
                {(totalCarteira>0||totalImoveis>0||totalVeiculos>0)?(()=>{
                  const cats=[
                    {label:"Investimentos",v:totalCarteira,cor:"#F0A202"},
                    {label:"Imóveis",v:totalImoveis,cor:"#22c55e"},
                    {label:"Veículos",v:totalVeiculos,cor:"#60a5fa"},
                  ].filter(x=>x.v>0);
                  return (
                    <>
                      {/* ── Gráficos: barras + ring chart lado a lado ── */}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20,alignItems:"stretch"}}>

                        {/* Painel esquerdo: barras compactas */}
                        <div style={{background:"rgba(255,255,255,0.02)",border:`0.5px solid ${T.border}`,borderRadius:14,padding:"14px 10px"}}>
                          <div style={{fontSize:9,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,...noEdit}}>Em Reais (R$)</div>
                          <BarChartVertical items={cats}/>
                        </div>

                        {/* Painel direito: ring chart moderno + legenda */}
                        <div style={{background:"rgba(255,255,255,0.02)",border:`0.5px solid ${T.border}`,borderRadius:14,padding:"14px 16px"}}>
                          <div style={{fontSize:9,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,...noEdit}}>Distribuição (%)</div>
                          <div style={{display:"flex",alignItems:"center",gap:14}}>
                            {/* Ring chart */}
                            <div style={{flexShrink:0}}>
                              <RingChart
                                data={cats.map(c=>({...c,value:c.v}))}
                                total={patrimonioDisplay}
                                size={155}
                              />
                            </div>
                            {/* Legenda vertical */}
                            <div style={{flex:1,minWidth:0}}>
                              {cats.map(c=>(
                                <div key={c.label} style={{marginBottom:12,...noEdit}}>
                                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                                      <div style={{width:8,height:8,borderRadius:2,background:c.cor,boxShadow:`0 0 6px ${c.cor}70`,flexShrink:0}}/>
                                      <span style={{fontSize:11,color:"#b0bec5"}}>{c.label}</span>
                                    </div>
                                    <span style={{fontSize:11,color:c.cor,fontWeight:600}}>{((c.v/patrimonioDisplay)*100).toFixed(0)}%</span>
                                  </div>
                                  <div style={{height:2,background:"rgba(255,255,255,0.06)",borderRadius:1,overflow:"hidden"}}>
                                    <div style={{height:"100%",width:`${(c.v/patrimonioDisplay)*100}%`,background:c.cor,borderRadius:1,boxShadow:`0 0 4px ${c.cor}60`}}/>
                                  </div>
                                  <div style={{fontSize:10,color:"#748CAB",marginTop:2}}>{moedaFull(c.v)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── Patrimônio Financeiro ── */}
                      {(()=>{
                        const patFin=totalCarteira>0?totalCarteira:patrimonioManual;
                        return patFin>0?(
                          <div style={{marginBottom:8}}>
                            <div style={{fontSize:9,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6,...noEdit}}>Patrimônio Financeiro</div>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:"rgba(240,162,2,0.05)",border:"0.5px solid rgba(240,162,2,0.18)",borderRadius:10,marginBottom:6,...noEdit}}>
                              <div style={{display:"flex",alignItems:"center",gap:10}}>
                                <div style={{width:36,height:36,borderRadius:9,background:"rgba(240,162,2,0.08)",border:"0.5px solid rgba(240,162,2,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>📊</div>
                                <div>
                                  <div style={{fontSize:13,color:"#e2e8f0",fontWeight:400}}>Carteira de Investimentos</div>
                                  <div style={{fontSize:10,color:"#748CAB",marginTop:2}}>{totalCarteira>0?"Declarado na carteira":"Informado no cadastro"}</div>
                                </div>
                              </div>
                              <span style={{fontSize:13,color:"#F0A202",fontWeight:400}}>{moedaFull(patFin)}</span>
                            </div>
                          </div>
                        ):null;
                      })()}

                      {/* ── Bens Cadastrados ── */}
                      {((snap.imoveis||[]).length>0||(snap.veiculos||[]).length>0||totalVeiculosLegacy>0)&&(
                        <div style={{fontSize:9,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6,...noEdit}}>Bens Cadastrados</div>
                      )}

                      {/* Imóveis */}
                      {(snap.imoveis||[]).map((im,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:"rgba(34,197,94,0.05)",border:"0.5px solid rgba(34,197,94,0.14)",borderRadius:10,marginBottom:6,...noEdit}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:36,height:36,borderRadius:9,background:"rgba(34,197,94,0.08)",border:"0.5px solid rgba(34,197,94,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🏠</div>
                            <div>
                              <div style={{fontSize:13,color:"#e2e8f0",fontWeight:400}}>{im.nome||im.tipo}</div>
                              <div style={{fontSize:10,color:"#748CAB",marginTop:2}}>{im.tipo}{parseInt(im.quantidade)>1?` · ${im.quantidade}x`:""} · Imóvel</div>
                            </div>
                          </div>
                          <span style={{fontSize:13,color:"#22c55e",fontWeight:400}}>{im.faixa}</span>
                        </div>
                      ))}

                      {/* Veículos (array) */}
                      {(snap.veiculos||[]).map((v,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:"rgba(96,165,250,0.05)",border:"0.5px solid rgba(96,165,250,0.14)",borderRadius:10,marginBottom:6,...noEdit}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:36,height:36,borderRadius:9,background:"rgba(96,165,250,0.08)",border:"0.5px solid rgba(96,165,250,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🚗</div>
                            <div>
                              <div style={{fontSize:13,color:"#e2e8f0",fontWeight:400}}>{v.nome||v.tipo}</div>
                              <div style={{fontSize:10,color:"#748CAB",marginTop:2}}>{v.tipo}{parseInt(v.quantidade)>1?` · ${v.quantidade}x`:""} · Veículo</div>
                            </div>
                          </div>
                          <span style={{fontSize:13,color:"#60a5fa",fontWeight:400}}>{v.faixa}</span>
                        </div>
                      ))}

                      {/* Veículos legado (campo único antigo) */}
                      {totalVeiculosLegacy>0&&(snap.veiculos||[]).length===0&&(
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:"rgba(96,165,250,0.05)",border:"0.5px solid rgba(96,165,250,0.14)",borderRadius:10,marginBottom:6,...noEdit}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:36,height:36,borderRadius:9,background:"rgba(96,165,250,0.08)",border:"0.5px solid rgba(96,165,250,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🚗</div>
                            <div>
                              <div style={{fontSize:13,color:"#e2e8f0",fontWeight:400}}>Veículos</div>
                              <div style={{fontSize:10,color:"#748CAB",marginTop:2}}>Frota declarada</div>
                            </div>
                          </div>
                          <span style={{fontSize:13,color:"#60a5fa",fontWeight:400}}>{formatMi(totalVeiculosLegacy)}</span>
                        </div>
                      )}
                    </>
                  );
                })():(
                  <div style={{fontSize:12,color:T.textMuted,padding:"12px 0 4px",...noEdit}}>
                    Nenhum dado patrimonial cadastrado ainda.{" "}
                    <span style={{color:"#F0A202",cursor:"pointer"}} onClick={()=>setModo("editar")}>Editar perfil →</span>
                  </div>
                )}
              </div>
            </AccordionSection>

            {/* ── SEÇÃO: Carteira de Investimentos ─────────────────── */}
            <AccordionSection
              title="Carteira de Investimentos"
              subtitle={totalCarteira>0?`Total: ${formatMi(totalCarteira)}`:"Dados da carteira"}
              icon="📈"
              isOpen={sections.carteira}
              onToggle={()=>toggleSection("carteira")}
            >
              <div style={{paddingTop:16}}>
                {totalCarteira>0?(()=>{
                  const classesAtivas=CLASSES_CARTEIRA.map(c=>({
                    ...c, value:parseCentavos(snap.carteira?.[c.key])/100
                  })).filter(c=>c.value>0);
                  return (
                    <>
                      {/* Título do gráfico */}
                      <div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:14,...noEdit}}>
                        Distribuição em Percentual (%)
                      </div>

                      {/* Donut + Legenda lado a lado */}
                      <div style={{display:"flex",gap:18,alignItems:"center",marginBottom:20,flexWrap:"wrap"}}>
                        {/* Donut grande */}
                        <div style={{flexShrink:0}}>
                          <DonutChart
                            data={classesAtivas}
                            total={totalCarteira}
                            centerLabel="Investimento Total"
                            centerValue={formatMi(totalCarteira)}
                            size={170}
                          />
                        </div>

                        {/* Legenda com barra de progresso por classe */}
                        <div style={{flex:1,minWidth:150}}>
                          {classesAtivas.map(c=>{
                            const pct=((c.value/totalCarteira)*100);
                            return (
                              <div key={c.key} style={{marginBottom:11,...noEdit}}>
                                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                                    <div style={{width:8,height:8,borderRadius:2,background:c.cor,flexShrink:0}}/>
                                    <span style={{fontSize:11,color:T.textSecondary}}>{c.label}</span>
                                  </div>
                                  <div style={{display:"flex",gap:6}}>
                                    <span style={{fontSize:10,fontWeight:500,color:c.cor}}>{pct.toFixed(0)}%</span>
                                  </div>
                                </div>
                                {/* Mini progress bar */}
                                <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}>
                                  <div style={{height:"100%",width:`${pct}%`,background:c.cor,borderRadius:2}}/>
                                </div>
                              </div>
                            );
                          })}
                          {snap.carteira?.atualizadoEm&&(
                            <div style={{fontSize:9,color:T.textMuted,marginTop:10,...noEdit}}>
                              Atualizado: {snap.carteira.atualizadoEm}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Tabela resumo das classes */}
                      <div style={{background:"rgba(255,255,255,0.02)",border:`0.5px solid ${T.border}`,borderRadius:12,overflow:"hidden",marginBottom:4}}>
                        {classesAtivas.map((c,i)=>(
                          <div key={c.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 14px",borderBottom:i<classesAtivas.length-1?`0.5px solid ${T.border}`:"none",...noEdit}}>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <div style={{width:3,height:24,borderRadius:2,background:c.cor,flexShrink:0}}/>
                              <span style={{fontSize:12,color:T.textSecondary}}>{c.label}</span>
                            </div>
                            <div style={{display:"flex",gap:16,alignItems:"center"}}>
                              <span style={{fontSize:11,color:T.textMuted}}>{((c.value/totalCarteira)*100).toFixed(0)}%</span>
                              <span style={{fontSize:13,fontWeight:300,color:c.cor,minWidth:70,textAlign:"right"}}>{formatMi(c.value)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })():(
                  <div style={{fontSize:12,color:T.textMuted,padding:"12px 0",...noEdit}}>
                    Carteira não cadastrada ainda.{" "}
                    <span style={{color:"#F0A202",cursor:"pointer"}} onClick={()=>navigate(`/cliente/${id}/carteira`)}>Cadastrar →</span>
                  </div>
                )}
                <button onClick={()=>navigate(`/cliente/${id}/carteira`)} style={{width:"100%",marginTop:14,padding:"11px",background:"rgba(240,162,2,0.05)",border:"0.5px solid rgba(240,162,2,0.2)",borderRadius:10,color:"#F0A202",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.06em",...noEdit}}>
                  Abrir carteira completa →
                </button>
              </div>
            </AccordionSection>

            {/* ── SEÇÃO: Rendas & Despesas ─────────────────────────── */}
            <AccordionSection
              title="Rendas e Despesas"
              subtitle="Fluxo de caixa mensal e anual"
              icon="💰"
              isOpen={sections.rendas}
              onToggle={()=>toggleSection("rendas")}
            >
              <div style={{paddingTop:16}}>
                {/* Cards Rendas / Despesas */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
                  {/* RENDAS */}
                  <div style={{background:"rgba(34,197,94,0.05)",border:"0.5px solid rgba(34,197,94,0.22)",borderRadius:14,padding:"16px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
                          <circle cx="12" cy="12" r="11" fill="rgba(34,197,94,0.15)"/>
                          <text x="8" y="16" fontSize="11" fill="#22c55e" fontFamily={T.fontFamily} fontWeight="600">$</text>
                          <path d="M17 7l-4 4m0 0l-4-4m4 4V3" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" transform="translate(2,3) scale(0.6)"/>
                        </svg>
                        <span style={{fontSize:11,fontWeight:700,color:"#22c55e",letterSpacing:"0.1em",...noEdit}}>RENDAS</span>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      <div>
                        <div style={{fontSize:8,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,...noEdit}}>Renda Mensal</div>
                        <div style={{fontSize:15,fontWeight:300,color:T.textPrimary,...noEdit}}>{rendaMensal>0?formatMi(rendaMensal):"—"}</div>
                      </div>
                      <div>
                        <div style={{fontSize:8,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,...noEdit}}>Renda Anual</div>
                        <div style={{fontSize:15,fontWeight:300,color:T.textPrimary,...noEdit}}>{rendaMensal>0?formatMi(rendaMensal*12):"—"}</div>
                      </div>
                    </div>
                  </div>
                  {/* DESPESAS */}
                  <div style={{background:"rgba(239,68,68,0.05)",border:"0.5px solid rgba(239,68,68,0.22)",borderRadius:14,padding:"16px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
                          <circle cx="12" cy="12" r="11" fill="rgba(239,68,68,0.15)"/>
                          <text x="8" y="16" fontSize="11" fill="#ef4444" fontFamily={T.fontFamily} fontWeight="600">$</text>
                          <path d="M7 17l4-4m0 0l4 4m-4-4v8" stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" transform="translate(2,-2) scale(0.6)"/>
                        </svg>
                        <span style={{fontSize:11,fontWeight:700,color:"#ef4444",letterSpacing:"0.1em",...noEdit}}>DESPESAS</span>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      <div>
                        <div style={{fontSize:8,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,...noEdit}}>Desp. Mensal</div>
                        <div style={{fontSize:15,fontWeight:300,color:T.textPrimary,...noEdit}}>{gastosMensaisEfetivo>0?formatMi(gastosMensaisEfetivo):"—"}</div>
                      </div>
                      <div>
                        <div style={{fontSize:8,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,...noEdit}}>Desp. Anual</div>
                        <div style={{fontSize:15,fontWeight:300,color:T.textPrimary,...noEdit}}>{gastosMensaisEfetivo>0?formatMi(gastosMensaisEfetivo*12):"—"}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sobra e meta */}
                {rendaMensal>0&&gastosMensaisEfetivo>0&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
                    {[
                      {l:"Sobra mensal",v:rendaMensal-gastosMensaisEfetivo,cor:"#60a5fa"},
                      {l:"Meta de aporte/mês",v:parseCentavos(snap.metaAporteMensal)/100,cor:"#22c55e"},
                      {l:"Aportado este mês",v:aporteRegistradoVal,cor:aporteRegistradoVal>0?"#22c55e":"#f59e0b"},
                    ].map(k=>(
                      <div key={k.l} style={{background:"rgba(255,255,255,0.025)",borderRadius:10,padding:"12px",textAlign:"center",...noEdit}}>
                        <div style={{fontSize:8,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>{k.l}</div>
                        <div style={{fontSize:14,fontWeight:300,color:k.v>0?k.cor:T.textMuted}}>{k.v>0?formatMi(k.v):"—"}</div>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={()=>navigate(`/cliente/${id}/fluxo`)} style={{width:"100%",padding:"11px",background:"rgba(240,162,2,0.05)",border:"0.5px solid rgba(240,162,2,0.2)",borderRadius:10,color:"#F0A202",fontSize:11,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.06em",...noEdit}}>
                  Ver detalhamento mensal completo →
                </button>
              </div>
            </AccordionSection>

            {/* ── SEÇÃO: Mapa de Aportes ────────────────────────────── */}
            <AccordionSection
              title="Mapa de Aportes"
              subtitle="Histórico de movimentações mensais"
              icon="📅"
              isOpen={sections.aportes}
              onToggle={()=>toggleSection("aportes")}
              badge={snap.statusAporteMes==="aportou"?"Aportou ✓":snap.statusAporteMes==="nao_aportou"?"Sem aporte":undefined}
              badgeColor={snap.statusAporteMes==="aportou"?"#22c55e":"#f59e0b"}
            >
              <div style={{paddingTop:16}}>
                {/* Calendar */}
                {(()=>{
                  const meses=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
                  const hist=snap.carteiraHistorico||[];
                  const metaCentavos=parseCentavos(snap.metaAporteMensal);
                  const mesAtual=hoje.getMonth();
                  return(
                    <>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6,marginBottom:16}}>
                        {meses.map((mes,i)=>{
                          const mov=hist.find(m=>m.mes===i+1);
                          let bg="rgba(107,127,163,0.12)",cor=T.textMuted,tipo=null;
                          if(mov){
                            if(mov.tipo==="resgate"){bg="rgba(239,68,68,0.18)";cor="#ef4444";tipo="resgate";}
                            else if(mov.tipo==="aporte"){
                              const a=parseCentavos(mov.valor);
                              if(a>=metaCentavos&&metaCentavos>0){bg="rgba(34,197,94,0.18)";cor="#22c55e";tipo="aporte_ok";}
                              else{bg="rgba(245,158,11,0.18)";cor="#f59e0b";tipo="aporte_baixo";}
                            }
                          }
                          const isCurrent=i===mesAtual;
                          return(
                            <div key={mes} onClick={()=>mov&&setMesDetalhes({mes:i,movimento:mov})} style={{display:"flex",flexDirection:"column",alignItems:"center",cursor:mov?"pointer":"default",...noEdit}}>
                              <div style={{
                                width:"100%",aspectRatio:"1",borderRadius:10,
                                background:bg,
                                border:isCurrent?`1.5px solid ${cor}`:`0.5px solid ${cor}30`,
                                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                                gap:3,padding:"4px 2px",boxSizing:"border-box",
                                transition:"all 0.15s",
                              }}>
                                <span style={{fontSize:11,fontWeight:isCurrent?600:400,color:mov?cor:T.textMuted}}>{mes}</span>
                                {tipo==="aporte_ok"&&<span style={{fontSize:8,color:cor}}>↑</span>}
                                {tipo==="aporte_baixo"&&<span style={{fontSize:8,color:cor}}>↑</span>}
                                {tipo==="resgate"&&<span style={{fontSize:8,color:cor}}>↓</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Legend */}
                      <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:18}}>
                        {[["#22c55e","Aporte OK"],["#f59e0b","Abaixo da meta"],["#ef4444","Resgate"],["rgba(107,127,163,0.5)","Sem movimento"]].map(([c,l])=>(
                          <div key={l} style={{display:"flex",alignItems:"center",gap:5,...noEdit}}>
                            <div style={{width:10,height:10,borderRadius:3,background:c}}/>
                            <span style={{fontSize:10,color:T.textSecondary}}>{l}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}

                {/* CRM Buttons */}
                <div style={{fontSize:10,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10,...noEdit}}>Status de aporte – {hoje.toLocaleString("pt-BR",{month:"long",year:"numeric"})}</div>
                <div style={{display:"flex",gap:8,marginBottom:16}}>
                  <button
                    onClick={handleAportou}
                    style={{
                      flex:1,padding:"12px 8px",
                      background:snap.statusAporteMes==="aportou"?"rgba(34,197,94,0.12)":"rgba(255,255,255,0.03)",
                      border:`0.5px solid ${snap.statusAporteMes==="aportou"?"rgba(34,197,94,0.5)":"rgba(255,255,255,0.08)"}`,
                      borderRadius:10,color:snap.statusAporteMes==="aportou"?"#22c55e":"#748CAB",
                      fontSize:13,cursor:"pointer",fontFamily:"inherit",
                    }}>
                    ✓ Aportou
                  </button>
                  <button
                    onClick={handleNaoAportou}
                    style={{
                      flex:1,padding:"12px 8px",
                      background:snap.statusAporteMes==="nao_aportou"?"rgba(239,68,68,0.12)":"rgba(255,255,255,0.03)",
                      border:`0.5px solid ${snap.statusAporteMes==="nao_aportou"?"rgba(239,68,68,0.5)":"rgba(255,255,255,0.08)"}`,
                      borderRadius:10,color:snap.statusAporteMes==="nao_aportou"?"#ef4444":"#748CAB",
                      fontSize:13,cursor:"pointer",fontFamily:"inherit",
                    }}>
                    ✗ Não aportou
                  </button>
                </div>

                {snap.statusAporteMes==="aportou"&&aporteRegistradoVal>0&&(
                  <div style={{background:"rgba(34,197,94,0.06)",border:"0.5px solid rgba(34,197,94,0.2)",borderRadius:10,padding:"11px 14px",fontSize:12,color:"#22c55e",marginBottom:14,...noEdit}}>
                    Aporte registrado: <b>{aporteRegistradoVal.toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2})}</b>
                  </div>
                )}

                {/* Próximo contato – campo apenas para o assessor */}
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:10,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8,...noEdit}}>Próximo contato</div>
                  <div style={{display:"flex",alignItems:"center",height:44,background:"rgba(255,255,255,0.03)",border:`0.5px solid ${T.border}`,borderRadius:10,padding:"0 14px",boxSizing:"border-box"}}>
                    <input
                      type="text"
                      placeholder="DD/MM/AAAA"
                      value={snap.nextContactDate||""}
                      onChange={e=>setFSnap("nextContactDate",e.target.value)}
                      style={{background:"transparent",border:"none",outline:"none",color:T.textPrimary,fontSize:13,fontFamily:"inherit",width:"100%"}}
                    />
                  </div>
                </div>

                {/* Anotações */}
                <div>
                  <div style={{fontSize:10,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8,...noEdit}}>Anotação / Follow-up</div>
                  <TextareaLocal
                    key={`notes-${id}`}
                    initValue={snap.notes||""}
                    onCommit={v=>setF("notes",v)}
                    placeholder='Ex: "Cliente vai aportar dia 15. Confirmar na próxima semana."'
                  />
                  <button
                    onClick={async()=>{
                      try{
                        const s=await getDoc(doc(db,"clientes",id));
                        await setDoc(doc(db,"clientes",id),{...s.data(),notes:formRef.current.notes,nextContactDate:formRef.current.nextContactDate});
                        setMsg("Anotação salva.");
                      }catch(e){setMsg("Erro: "+e.message);}
                    }}
                    style={{marginTop:8,padding:"9px 16px",background:"rgba(255,255,255,0.04)",border:`0.5px solid ${T.border}`,borderRadius:9,color:T.textSecondary,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}
                  >
                    Salvar anotação
                  </button>
                </div>
              </div>
            </AccordionSection>

            {/* ── SEÇÃO: Reserva de Emergência ──────────────────────── */}
            {(()=>{
              // Proxy: posFixado é o ativo mais líquido da carteira
              const liquidez = parseCentavos(snap.carteira?.posFixado)/100;
              const pctAtingido = reservaMeta>0 ? Math.min((liquidez/reservaMeta)*100,100) : 0;
              const statusReserva = liquidez>=reservaMeta&&reservaMeta>0
                ? {label:"🏆 Reserva Alinhada!",desc:"Parabéns — sua reserva cobre os 6 meses necessários.",cor:"#22c55e",bg:"rgba(34,197,94,0.07)",border:"rgba(34,197,94,0.25)"}
                : liquidez>=reservaMeta*0.6&&reservaMeta>0
                ? {label:"⚡ Em Construção",desc:"Mais da metade conquistada. Continue aportando na reserva.",cor:"#f59e0b",bg:"rgba(245,158,11,0.07)",border:"rgba(245,158,11,0.25)"}
                : liquidez>0&&reservaMeta>0
                ? {label:"⚠ Fortalecer Reserva",desc:"Priorize aportes em renda fixa pós-fixada para formar a reserva.",cor:"#ef4444",bg:"rgba(239,68,68,0.07)",border:"rgba(239,68,68,0.25)"}
                : {label:"— Dados insuficientes",desc:"Preencha carteira e despesas mensais para calcular.",cor:T.textMuted,bg:"rgba(255,255,255,0.02)",border:T.border};
              return (
                <AccordionSection
                  title="Reserva de Emergência"
                  subtitle={reservaMeta>0?`Meta: ${formatMi(reservaMeta)} · 6 meses de despesas`:"Preencha as despesas mensais"}
                  icon="🛡️"
                  isOpen={sections.reserva}
                  onToggle={()=>toggleSection("reserva")}
                  badge={reservaMeta>0?statusReserva.label.split(" ").slice(1).join(" "):undefined}
                  badgeColor={statusReserva.cor}
                >
                  <div style={{paddingTop:16}}>
                    {reservaMeta>0?(
                      <>
                        {/* Card de status principal */}
                        <div style={{background:statusReserva.bg,border:`0.5px solid ${statusReserva.border}`,borderRadius:14,padding:"18px 20px",marginBottom:16}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                            <div>
                              <div style={{fontSize:16,fontWeight:500,color:statusReserva.cor,marginBottom:4,...noEdit}}>{statusReserva.label}</div>
                              <div style={{fontSize:11,color:T.textSecondary,lineHeight:1.5,maxWidth:340,...noEdit}}>{statusReserva.desc}</div>
                            </div>
                            <div style={{textAlign:"right",...noEdit}}>
                              <div style={{fontSize:10,color:T.textMuted,marginBottom:2}}>Meta</div>
                              <div style={{fontSize:20,fontWeight:300,color:T.textPrimary}}>{formatMi(reservaMeta)}</div>
                            </div>
                          </div>

                          {/* Barra de progresso */}
                          {liquidez>0&&(
                            <div style={{marginTop:14}}>
                              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                                <span style={{fontSize:10,color:T.textMuted,...noEdit}}>Renda Fixa Pós-fixada (proxy de liquidez)</span>
                                <span style={{fontSize:10,color:statusReserva.cor,...noEdit}}>{pctAtingido.toFixed(0)}%</span>
                              </div>
                              <div style={{height:6,background:"rgba(255,255,255,0.07)",borderRadius:3,overflow:"hidden"}}>
                                <div style={{height:"100%",width:`${pctAtingido}%`,background:statusReserva.cor,borderRadius:3,transition:"width 0.6s ease"}}/>
                              </div>
                              <div style={{fontSize:10,color:T.textMuted,marginTop:4,...noEdit}}>
                                {formatMi(liquidez)} de {formatMi(reservaMeta)} formados
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Cards 1 / 3 / 6 meses */}
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                          {[1,3,6].map(m=>(
                            <div key={m} style={{background:"rgba(255,255,255,0.025)",borderRadius:10,padding:"12px",textAlign:"center",...noEdit}}>
                              <div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>{m} {m===1?"mês":"meses"}</div>
                              <div style={{fontSize:13,fontWeight:300,color:m===6?"#a855f7":T.textSecondary}}>{formatMi(gastosMensaisEfetivo*m)}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{fontSize:11,color:T.textMuted,lineHeight:1.6,...noEdit}}>
                          💡 Mantenha a reserva em CDB diário, Tesouro Selic ou poupança — alta liquidez e baixo risco.
                        </div>
                      </>
                    ):(
                      <div style={{fontSize:12,color:T.textMuted,padding:"12px 0",...noEdit}}>
                        Preencha as despesas no{" "}
                        <span style={{color:"#F0A202",cursor:"pointer"}} onClick={()=>navigate(`/cliente/${id}/fluxo`)}>Fluxo Mensal</span>{" "}
                        para calcular a reserva de emergência.
                      </div>
                    )}
                  </div>
                </AccordionSection>
              );
            })()}

            {/* ── SEÇÃO: Dados Pessoais ─────────────────────────────── */}
            <AccordionSection
              title="Dados Pessoais"
              subtitle="Cadastro e informações do cliente"
              icon="👤"
              isOpen={sections.dados}
              onToggle={()=>toggleSection("dados")}
            >
              <div style={{paddingTop:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[
                  {l:"E-mail",v:snap.email},
                  {l:"Telefone",v:snap.telefone},
                  {l:"Estado",v:snap.uf},
                  {l:"Profissão",v:snap.profissao},
                  {l:"Nascimento",v:snap.nascimento?(snap.nascimento+(idade?` (${idade} anos)`:"")):null},
                  {l:"Hobby",v:snap.hobby},
                  {l:"Código do cliente",v:snap.codigo},
                  {l:"Cliente desde",v:snap.desde},
                ].map(f=>(
                  <div key={f.l}>
                    <div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,...noEdit}}>{f.l}</div>
                    <div style={{fontSize:13,color:T.textSecondary,padding:"6px 0",borderBottom:`0.5px solid ${T.border}`,...noEdit}}>{f.v||"—"}</div>
                  </div>
                ))}
                <div style={{gridColumn:"1/-1",display:"flex",flexDirection:"column",alignItems:"center",paddingTop:8}}>
                  <div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8,...noEdit}}>Segmento</div>
                  <span style={{fontSize:13,color:"#F0A202",padding:"5px 20px",borderRadius:20,background:"rgba(240,162,2,0.08)",border:"0.5px solid rgba(240,162,2,0.2)",...noEdit}}>{segmento||"—"}</span>
                </div>
              </div>
            </AccordionSection>
          </>
        )}
      </div>
    </div>
  );
}
