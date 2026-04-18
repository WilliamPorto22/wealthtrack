import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useRef, useState, memo } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Navbar } from "../components/Navbar";
import { T, C } from "../theme";
import { extractText, parseFluxoFromText } from "../utils/documentParser";

// ── Helpers ────────────────────────────────────────────────────
function parseCentavos(s){ return parseInt(String(s||"0").replace(/\D/g,""))||0; }
function fmt(c){
  const n=parseCentavos(c);
  if(!n) return "";
  return "R$ " + (n/100).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
}

// Input de moeda memoizado: estado local isola o foco do re-render do pai
const InputMoeda = memo(function InputMoeda({ initValue, onCommit, placeholder="R$ 0,00", style }) {
  const [raw,setRaw] = useState(initValue||"");
  return (
    <input
      style={{...C.input,fontSize:13,padding:"12px 14px",...style}}
      placeholder={placeholder}
      inputMode="numeric"
      value={fmt(raw)}
      onChange={(e)=>{
        const novo=e.target.value.replace(/\D/g,"");
        setRaw(novo);
        onCommit(novo);
      }}
    />
  );
});
function fmtFull(v){
  if(!v||v<=0) return "—";
  return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2});
}
function fmtMi(v){
  if(!v||v<=0) return "—";
  if(v>=1000000) return `R$ ${(v/1000000).toFixed(2).replace(".",",")}Mi`;
  if(v>=1000) return `R$ ${Math.round(v/1000)}k`;
  return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:0});
}

const noEdit={userSelect:"none",WebkitUserSelect:"none",cursor:"default"};
const font=T.fontFamily||"-apple-system,'SF Pro Display',sans-serif";
const BG="#0D1321";

// ── Categorias de gastos ───────────────────────────────────────
const CATS = [
  { label:"Moradia",                key:"moradia",      cor:"#2563eb",
    desc:"Aluguel, condomínio, financiamento, água, luz, gás, internet" },
  { label:"Alimentação",            key:"alimentacao",  cor:"#3b82f6",
    desc:"Supermercado, restaurantes, delivery, padaria" },
  { label:"Carro / Transporte",     key:"carro",        cor:"#a07020",
    desc:"Combustível, IPVA, seguro, prestação, Uber" },
  { label:"Saúde",                  key:"saude",        cor:"#ef4444",
    desc:"Plano de saúde, farmácia, consultas, exames" },
  { label:"Educação",               key:"educacao",     cor:"#22c55e",
    desc:"Escola, faculdade, cursos, material escolar" },
  { label:"Lazer / Entretenimento", key:"lazer",        cor:"#8b5cf6",
    desc:"Cinema, viagens, hobbies, shows, restaurantes" },
  { label:"Assinaturas",            key:"assinaturas",  cor:"#06b6d4",
    desc:"Netflix, Spotify, apps, clubes, serviços mensais" },
  { label:"Cartões / Consumo",      key:"cartoes",      cor:"#F0A202",
    desc:"Faturas de cartão de crédito e compras diversas" },
  { label:"Seguros",                key:"seguros",      cor:"#64748b",
    desc:"Seguro de vida, residência, outros seguros" },
  { label:"Outros",                 key:"outros",       cor:"#6b7280",
    desc:"Despesas diversas não categorizadas" },
];

// ── Gráfico donut SVG ──────────────────────────────────────────
function DonutGastos({ cats, form, total, size=200 }) {
  const active = cats.filter(c=>parseCentavos(form[c.key])>0);
  if (!active.length || total<=0) return (
    <div style={{width:size,height:size,display:"flex",alignItems:"center",justifyContent:"center",...noEdit}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:28,marginBottom:8}}>💸</div>
        <div style={{fontSize:11,color:T.textMuted}}>Sem gastos cadastrados</div>
      </div>
    </div>
  );
  const cx=size/2, cy=size/2, Ro=size*0.44, Ri=size*0.30;
  const C2=2*Math.PI*Ro;
  const gap=active.length>1?2:0;
  let angle=-90;
  const segs=active.map(c=>{
    const v=parseCentavos(form[c.key])/100;
    const pct=v/total;
    const sweep=pct*360;
    const dashLen=Math.max((sweep-gap)/360*C2,0.5);
    const rot=angle; angle+=sweep;
    return {...c,v,dashLen,rot,pct};
  });
  return (
    <svg width={size} height={size} style={noEdit}>
      <circle cx={cx} cy={cy} r={Ro} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={Ro-Ri}/>
      {segs.map((s,i)=>(
        <circle key={i} cx={cx} cy={cy} r={Ro} fill="none"
          stroke={s.cor} strokeWidth={Ro-Ri}
          strokeDasharray={`${s.dashLen} ${C2}`}
          strokeLinecap="butt"
          transform={`rotate(${s.rot},${cx},${cy})`} opacity={0.9}/>
      ))}
      <text x={cx} y={cy-10} textAnchor="middle" fontSize={10} fill={T.textMuted} fontFamily={font}>GASTOS</text>
      <text x={cx} y={cy+8} textAnchor="middle" fontSize={13} fill={T.textPrimary} fontFamily={font} fontWeight="300">
        {fmtMi(total)}
      </text>
    </svg>
  );
}

// ── Overlay de progresso do upload ─────────────────────────────
function UploadOverlay({ progress, onClose }) {
  if (!progress) return null;
  const done = progress.pct >= 100 && !progress.error;
  const error = progress.error;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.72)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#111827",border:"0.5px solid rgba(255,255,255,0.1)",borderRadius:18,padding:"28px 24px",width:360,maxWidth:"100%"}}>
        <div style={{fontSize:15,fontWeight:400,color:done?"#22c55e":error?"#ef4444":T.textPrimary,marginBottom:6,...noEdit}}>
          {done?"✓ Importação finalizada":error?"✗ Erro na importação":"Processando arquivo..."}
        </div>
        <div style={{fontSize:12,color:T.textMuted,marginBottom:16,lineHeight:1.6,...noEdit}}>{progress.message}</div>
        {!done&&!error&&(
          <>
            <div style={{height:6,background:"rgba(255,255,255,0.08)",borderRadius:3,overflow:"hidden",marginBottom:8}}>
              <div style={{height:"100%",width:`${progress.pct}%`,background:"#F0A202",borderRadius:3,transition:"width 0.4s ease"}}/>
            </div>
            <div style={{fontSize:11,color:"#F0A202",textAlign:"right",...noEdit}}>{Math.round(progress.pct)}%</div>
          </>
        )}
        {error&&(
          <div style={{background:"rgba(239,68,68,0.08)",border:"0.5px solid rgba(239,68,68,0.25)",borderRadius:10,padding:"10px 12px",marginBottom:16,...noEdit}}>
            <div style={{fontSize:11,color:"#ef4444",lineHeight:1.6}}>{progress.errorDetail}</div>
          </div>
        )}
        {(done||error)&&(
          <button onClick={onClose} style={{width:"100%",padding:10,background:"rgba(255,255,255,0.04)",border:"0.5px solid rgba(255,255,255,0.1)",borderRadius:9,color:T.textSecondary,fontSize:12,cursor:"pointer",fontFamily:font}}>
            Fechar
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────
export default function FluxoMensal() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({});
  const [clienteNome, setClienteNome] = useState("");
  const [rendaExterna, setRendaExterna] = useState(0);
  const [modo, setModo] = useState("ver");
  const [salvando, setSalvando] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [expandedCat, setExpandedCat] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(()=>{
    async function carregar(){
      const snap=await getDoc(doc(db,"clientes",id));
      if(!snap.exists()) return;
      const data=snap.data();
      setClienteNome(data.nome||"");
      setForm(data.fluxo||{});
      // Renda: prefere salarioMensal do cadastro
      setRendaExterna(parseCentavos(data.salarioMensal)/100||0);
    }
    carregar();
  },[id]);

  function setF(k,v){ setForm(f=>({...f,[k]:v})); }

  async function salvar(){
    setSalvando(true);
    const snap=await getDoc(doc(db,"clientes",id));
    const data=snap.data()||{};

    // Calcula total dos gastos detalhados para alimentar gastosMensaisManual
    const totalGastosDetalhado = CATS.reduce((acc,{key})=>acc+(parseCentavos(form[key])/100),0);

    const update={
      ...data,
      fluxo:form,
      // Hierarquia: se tem categorias aqui → atualiza gastosMensaisManual
      ...(totalGastosDetalhado>0?{gastosMensaisManual:String(Math.round(totalGastosDetalhado*100))}:{}),
      // Renda do fluxo → atualiza salarioMensal se preenchido aqui e não tiver no cadastro
      ...(parseCentavos(form.renda)>0&&!data.salarioMensal?{salarioMensal:form.renda}:{}),
    };
    await setDoc(doc(db,"clientes",id),update);
    setModo("ver");
    setSalvando(false);
  }

  async function handleUpload(e){
    const file=e.target.files?.[0]; if(!file) return;
    const setP=(pct,message,extra={})=>setUploadProgress({pct,message,...extra});
    setP(0,"Iniciando leitura do arquivo...");
    try{
      const text=await extractText(file,(pct,message)=>setP(pct,message));
      const dados=parseFluxoFromText(text);
      const catKeys=Object.keys(dados).filter(k=>!k.endsWith("_items"));
      if(catKeys.length===0){
        setP(100,"Nenhum dado reconhecido. Verifique o arquivo ou preencha manualmente.",{error:true,errorDetail:"O arquivo não contém dados financeiros legíveis no formato esperado. Tente outro arquivo ou preencha manualmente os campos abaixo."});
        setModo("editar");
      } else {
        const novoForm={...form};
        Object.entries(dados).forEach(([k,v])=>{ novoForm[k]=v; });
        setForm(novoForm);
        const temItems=Object.keys(dados).some(k=>k.endsWith("_items"));
        const msg=temItems
          ?`✓ ${catKeys.length} categori${catKeys.length>1?"as":"a"} com transações individuais importadas. Revise e salve.`
          :`✓ ${catKeys.length} campo${catKeys.length>1?"s":""} preenchido${catKeys.length>1?"s":""}. Revise e salve.`;
        setP(100,msg);
        setModo("ver");
      }
    } catch(err){
      setP(0,"",{error:true,pct:0,message:"Erro ao processar arquivo",errorDetail:err.message});
    }
    e.target.value="";
  }

  // ── Cálculos ──────────────────────────────────────────────────
  const rendaFluxo=parseCentavos(form.renda)/100;
  const rendaEfetiva=rendaFluxo||rendaExterna;
  const totalGastos=CATS.reduce((acc,{key})=>acc+(parseCentavos(form[key])/100),0);
  const sobra=rendaEfetiva-totalGastos;
  const txPoupanca=rendaEfetiva>0?Math.round((sobra/rendaEfetiva)*100):0;

  const Lbl=({children})=>(
    <label style={{fontSize:9,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.1em",display:"block",marginBottom:5,...noEdit}}>{children}</label>
  );

  return (
    <div style={{minHeight:"100vh",background:BG,fontFamily:font}}>
      <Navbar
        actionButtons={[
          {icon:"↑",label:"Importar",onClick:()=>fileInputRef.current?.click(),variant:"secondary"},
          {label:modo==="ver"?"Editar":"Salvar",variant:modo==="editar"?"primary":"secondary",
           onClick:()=>modo==="ver"?setModo("editar"):salvar(),disabled:salvando},
          ...(modo==="editar"?[{label:"Cancelar",variant:"secondary",onClick:()=>setModo("ver")}]:[]),
        ]}
      />

      <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" style={{display:"none"}} onChange={handleUpload}/>
      <UploadOverlay progress={uploadProgress} onClose={()=>setUploadProgress(null)}/>

      {/* Botão ← voltar */}
      <button
        onClick={()=>navigate(`/cliente/${id}`)}
        style={{position:"fixed",left:16,top:"50%",transform:"translateY(-50%)",width:44,height:44,borderRadius:22,
          background:"rgba(240,162,2,0.15)",border:"1px solid rgba(240,162,2,0.3)",
          color:"#F0A202",fontSize:20,cursor:"pointer",zIndex:50,
          display:"flex",alignItems:"center",justifyContent:"center",fontFamily:font}}
        onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-50%) scale(1.15)";e.currentTarget.style.background="rgba(240,162,2,0.25)";}}
        onMouseLeave={e=>{e.currentTarget.style.transform="translateY(-50%) scale(1)";e.currentTarget.style.background="rgba(240,162,2,0.15)";}}
      >←</button>

      <div style={{maxWidth:760,margin:"0 auto",padding:"28px 20px 80px"}}>

        {/* Header */}
        <div style={{marginBottom:22,...noEdit}}>
          <div style={{fontSize:10,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.16em",marginBottom:6}}>Fluxo de Caixa Mensal</div>
          <div style={{fontSize:24,fontWeight:300,color:T.textPrimary,letterSpacing:"-0.01em"}}>{clienteNome||"Cliente"}</div>
        </div>

        {/* KPIs topo */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:18}}>
          {[
            {l:"Renda Mensal",v:fmtFull(rendaEfetiva),cor:"#22c55e",bd:"rgba(34,197,94,0.28)",sub:rendaFluxo>0?"declarado aqui":rendaExterna>0?"do cadastro":"—"},
            {l:"Total de Gastos",v:fmtFull(totalGastos),cor:"#ef4444",bd:"rgba(239,68,68,0.28)",sub:totalGastos>0?`${CATS.filter(c=>parseCentavos(form[c.key])>0).length} categorias`:"sem dados"},
            {l:"Disponível",v:rendaEfetiva>0?fmtFull(sobra):"—",cor:sobra>=0?"#60a5fa":"#f59e0b",bd:sobra>=0?"rgba(96,165,250,0.28)":"rgba(245,158,11,0.28)",sub:rendaEfetiva>0?`${txPoupanca}% de poupança`:""},
          ].map(k=>(
            <div key={k.l} style={{background:T.bgCard,border:`0.5px solid ${k.bd}`,borderRadius:T.radiusMd,padding:"14px 12px",boxShadow:T.shadowSm,...noEdit}}>
              <div style={{fontSize:8,color:k.cor,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6,opacity:0.85}}>{k.l}</div>
              <div style={{fontSize:14,color:k.cor,fontWeight:400,lineHeight:1.3,wordBreak:"break-all"}}>{k.v}</div>
              {k.sub&&<div style={{fontSize:8,color:k.cor,opacity:0.55,marginTop:3,letterSpacing:"0.04em"}}>{k.sub}</div>}
            </div>
          ))}
        </div>

        {/* Alerta taxa poupança baixa */}
        {txPoupanca<30&&rendaEfetiva>0&&(
          <div style={{background:"rgba(245,158,11,0.07)",border:"0.5px solid rgba(245,158,11,0.25)",borderRadius:10,padding:"10px 14px",fontSize:11,color:"#f59e0b",marginBottom:14,lineHeight:1.6,...noEdit}}>
            ⚠ Taxa de poupança: <b>{txPoupanca}%</b>. O recomendado é mínimo <b>30%</b> da renda para atingir os objetivos no prazo.
          </div>
        )}

        {/* ── Seção renda (editar) ── */}
        {modo==="editar"&&(
          <div style={{background:T.bgCard,border:`0.5px solid rgba(34,197,94,0.22)`,borderRadius:T.radiusLg,padding:"16px 18px",marginBottom:14,boxShadow:T.shadowSm}}>
            <div style={{fontSize:9,color:"#86efac",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:12,...noEdit}}>Renda Mensal</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <Lbl>Renda / Salário mensal</Lbl>
                <InputMoeda initValue={form.renda} onCommit={(v)=>setF("renda",v)} placeholder="R$ 0,00"/>
                {rendaExterna>0&&!rendaFluxo&&<div style={{fontSize:9,color:"#748CAB",marginTop:4,...noEdit}}>Cadastro: {fmtFull(rendaExterna)}</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── Visão Visual: Donut + Legenda ── */}
        {totalGastos>0&&modo==="ver"&&(
          <div style={{background:T.bgCard,border:`0.5px solid ${T.border}`,borderRadius:T.radiusLg,padding:"20px 18px",marginBottom:14,boxShadow:T.shadowSm}}>
            <div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.16em",marginBottom:18,...noEdit}}>Distribuição de Gastos</div>
            <div style={{display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{flexShrink:0}}>
                <DonutGastos cats={CATS} form={form} total={totalGastos} size={180}/>
              </div>
              <div style={{flex:1,minWidth:160}}>
                {CATS.filter(c=>parseCentavos(form[c.key])>0).map(c=>{
                  const v=parseCentavos(form[c.key])/100;
                  const pct=totalGastos>0?Math.round(v/totalGastos*100):0;
                  return(
                    <div key={c.key} style={{marginBottom:8,...noEdit}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:8,height:8,borderRadius:2,background:c.cor,flexShrink:0}}/>
                          <span style={{fontSize:11,color:T.textSecondary}}>{c.label}</span>
                        </div>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <span style={{fontSize:10,color:c.cor,fontWeight:600}}>{pct}%</span>
                          <span style={{fontSize:10,color:"#748CAB"}}>{fmtMi(v)}</span>
                        </div>
                      </div>
                      <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${pct}%`,background:c.cor,borderRadius:2}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Categorias ── */}
        <div style={{background:T.bgCard,border:`0.5px solid ${T.border}`,borderRadius:T.radiusLg,padding:"20px 18px",marginBottom:14,boxShadow:T.shadowSm}}>
          <div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.16em",marginBottom:16,...noEdit}}>
            {modo==="editar"?"Editar categorias de gastos":"Gastos por categoria"}
          </div>

          {/* Linha de renda no modo VER */}
          {modo==="ver"&&rendaEfetiva>0&&(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:"rgba(34,197,94,0.06)",border:"0.5px solid rgba(34,197,94,0.18)",borderRadius:10,marginBottom:10,...noEdit}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:3,height:24,borderRadius:2,background:"#22c55e",flexShrink:0}}/>
                <div>
                  <div style={{fontSize:12,color:"#e2e8f0"}}>Renda Mensal</div>
                  <div style={{fontSize:9,color:"#748CAB",marginTop:1}}>{rendaFluxo>0?"declarado aqui":"do cadastro do cliente"}</div>
                </div>
              </div>
              <span style={{fontSize:14,color:"#22c55e",fontWeight:300}}>{fmtFull(rendaEfetiva)}</span>
            </div>
          )}

          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {CATS.map(({label,key,cor,desc})=>{
              const val=parseCentavos(form[key])/100;
              const pct=totalGastos>0?Math.round(val/totalGastos*100):0;
              const hasVal=val>0;

              if(modo==="ver"&&!hasVal) return null;

              const items=form[key+"_items"]||[];
              const isExpanded=expandedCat===key;

              return(
                <div key={key} style={{
                  background:hasVal?`rgba(${hexRgb(cor)},0.04)`:"rgba(255,255,255,0.01)",
                  border:`0.5px solid ${hasVal?`rgba(${hexRgb(cor)},0.2)`:"rgba(255,255,255,0.05)"}`,
                  borderRadius:10,padding:"12px 14px",
                  cursor:modo==="ver"&&items.length>0?"pointer":"default",
                }}>
                  {modo==="ver"?(
                    <div onClick={()=>items.length>0&&setExpandedCat(isExpanded?null:key)}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6,...noEdit}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:3,height:28,borderRadius:2,background:cor,flexShrink:0}}/>
                          <div>
                            <div style={{fontSize:13,color:T.textPrimary}}>{label}</div>
                            <div style={{fontSize:9,color:"#748CAB",marginTop:1}}>
                              {items.length>0?`${items.length} transaç${items.length>1?"ões":"ão"} · clique para ver`:desc}
                            </div>
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontSize:14,color:cor,fontWeight:300}}>{fmtFull(val)}</div>
                            <div style={{fontSize:9,color:"#748CAB",marginTop:1}}>{pct}% dos gastos</div>
                          </div>
                          {items.length>0&&(
                            <div style={{fontSize:14,color:"#748CAB",transform:isExpanded?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",...noEdit}}>▾</div>
                          )}
                        </div>
                      </div>
                      {pct>0&&(
                        <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}>
                          <div style={{height:"100%",width:`${pct}%`,background:cor,borderRadius:2}}/>
                        </div>
                      )}
                      {/* Lista de transações expandida */}
                      {isExpanded&&items.length>0&&(
                        <div style={{marginTop:10,borderTop:`0.5px solid rgba(${hexRgb(cor)},0.15)`,paddingTop:10}}>
                          <div style={{fontSize:9,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,...noEdit}}>
                            Transações importadas
                          </div>
                          <div style={{display:"flex",flexDirection:"column",gap:4}}>
                            {items.map((it,idx)=>(
                              <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",background:"rgba(255,255,255,0.02)",borderRadius:6,...noEdit}}>
                                <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                                  <span style={{fontSize:9,color:"#748CAB",flexShrink:0,fontVariantNumeric:"tabular-nums"}}>{it.data}</span>
                                  <span style={{fontSize:11,color:"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.nome}</span>
                                </div>
                                <span style={{fontSize:11,color:cor,fontWeight:500,flexShrink:0,marginLeft:8}}>
                                  {fmtFull(it.valor/100)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ):(
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,...noEdit}}>
                        <div style={{width:3,height:20,borderRadius:2,background:cor,flexShrink:0}}/>
                        <div>
                          <div style={{fontSize:12,color:T.textPrimary}}>{label}</div>
                          <div style={{fontSize:9,color:"#748CAB"}}>{desc}</div>
                        </div>
                      </div>
                      <InputMoeda
                        initValue={form[key]}
                        onCommit={(v)=>setF(key,v)}
                        placeholder="R$ 0,00"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Linha de gastos gerais manuais — só no editar, opcional */}
          {modo==="editar"&&(
            <div style={{marginTop:14,padding:"14px 16px",background:"rgba(255,255,255,0.03)",border:`0.5px solid ${T.border}`,borderRadius:T.radiusMd}}>
              <div style={{fontSize:9,color:"#748CAB",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:10,...noEdit}}>Ou informe apenas o total de gastos (sem detalhamento)</div>
              <InputMoeda
                initValue={form._totalManual}
                onCommit={(v)=>setF("_totalManual",v)}
                placeholder="R$ total geral de gastos"
              />
              <div style={{fontSize:9,color:"#748CAB",marginTop:6,...noEdit}}>Se preenchido, prevalece sobre os totais das categorias acima</div>
            </div>
          )}
        </div>

        {/* Total rodapé */}
        {totalGastos>0&&(
          <div style={{background:T.bgCard,border:`0.5px solid ${T.border}`,borderRadius:T.radiusMd,padding:"16px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,boxShadow:T.shadowSm,...noEdit}}>
            <div>
              <div style={{fontSize:10,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:4}}>Total de gastos no mês</div>
              {rendaEfetiva>0&&<div style={{fontSize:9,color:"#748CAB"}}>{Math.round(totalGastos/rendaEfetiva*100)}% da renda mensal</div>}
            </div>
            <div style={{fontSize:22,color:"#ef4444",fontWeight:300,letterSpacing:"-0.01em"}}>{fmtFull(totalGastos)}</div>
          </div>
        )}

        {/* Sem dados VER */}
        {totalGastos===0&&modo==="ver"&&(
          <div style={{textAlign:"center",padding:"40px 20px",...noEdit}}>
            <div style={{fontSize:32,marginBottom:12}}>💸</div>
            <div style={{fontSize:14,color:T.textPrimary,marginBottom:6}}>Nenhum gasto cadastrado</div>
            <div style={{fontSize:12,color:T.textMuted,marginBottom:16}}>Clique em Editar para adicionar as categorias de gastos mensais.</div>
            <button onClick={()=>setModo("editar")} style={{padding:"10px 20px",background:"rgba(240,162,2,0.08)",border:"0.5px solid rgba(240,162,2,0.3)",borderRadius:9,color:"#F0A202",fontSize:12,cursor:"pointer",fontFamily:font}}>
              Editar gastos →
            </button>
          </div>
        )}

        {modo==="editar"&&(
          <button onClick={salvar} disabled={salvando}
            style={{width:"100%",padding:14,background:"rgba(240,162,2,0.08)",border:"0.5px solid rgba(240,162,2,0.35)",borderRadius:10,color:"#F0A202",fontSize:13,cursor:"pointer",fontFamily:font,letterSpacing:"0.04em"}}>
            {salvando?"Salvando...":"💾 Salvar fluxo mensal"}
          </button>
        )}
      </div>
    </div>
  );
}

function hexRgb(hex){
  if(!hex||hex.length<7) return "255,255,255";
  const r=parseInt(hex.slice(1,3),16);
  const g=parseInt(hex.slice(3,5),16);
  const b=parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
