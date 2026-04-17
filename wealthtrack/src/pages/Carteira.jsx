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
  if(!n)return"—";
  return n.toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2});
}
function pct(v){ return (parseFloat(v)||0).toFixed(1)+"%"; }

const noEdit={userSelect:"none",WebkitUserSelect:"none",cursor:"default"};
const font="-apple-system,'SF Pro Display',sans-serif";
const BG="#0D1321", CARD="#1D2D44", BD="rgba(62,92,118,0.35)";

// Classes de ativos
const CLASSES=[
  {key:"posFixado",  label:"Renda Fixa Pós-Fixada",  cor:"#2563eb", liquidez:"d+1"},
  {key:"ipca",       label:"Renda Fixa IPCA+",        cor:"#3b82f6", liquidez:"d+1"},
  {key:"preFixado",  label:"Renda Fixa Pré-Fixada",   cor:"#60a5fa", liquidez:"d+1"},
  {key:"fiis",       label:"Fundos Imobiliários",      cor:"#F0A202", liquidez:"d+2"},
  {key:"multi",      label:"Multimercado",             cor:"#a07020", liquidez:"d+30"},
  {key:"acoes",      label:"Ações",                   cor:"#22c55e", liquidez:"d+2"},
  {key:"global",     label:"Investimentos Globais",    cor:"#a855f7", liquidez:"d+2"},
];

// Input moeda sem perda de foco
const InputMoeda=memo(function InputMoeda({initValue,onCommit,placeholder="R$ 0,00"}){
  const [raw,setRaw]=useState(initValue||"");
  function fmt(r){
    const n=parseInt(String(r||"0").replace(/\D/g,""))||0;
    if(!n)return "";
    return "R$ "+(n/100).toLocaleString("pt-BR",{minimumFractionDigits:2});
  }
  function handleChange(e){
    const novo=e.target.value.replace(/\D/g,"");
    setRaw(novo);
    onCommit(novo);
  }
  return <input style={C.input} placeholder={placeholder} value={fmt(raw)} onChange={handleChange}/>;
});

// Gráfico de pizza SVG simples
function GraficoPizza({classes, valores, total}){
  if(total<=0)return(
    <div className="grafico-pizza-vazio">
      <span>Sem dados</span>
    </div>
  );

  let acumulado=0;
  const fatias=classes.map(c=>{
    const val=parseCentavos(valores[c.key])/100;
    const angulo=(val/total)*360;
    const inicio=acumulado;
    acumulado+=angulo;
    return{...c,val,angulo,inicio};
  }).filter(f=>f.val>0);

  function descreveFatia(inicio,fim,r,cx,cy){
    const toRad=a=>(a-90)*Math.PI/180;
    const x1=cx+r*Math.cos(toRad(inicio));
    const y1=cy+r*Math.sin(toRad(inicio));
    const x2=cx+r*Math.cos(toRad(fim));
    const y2=cy+r*Math.sin(toRad(fim));
    const large=fim-inicio>180?1:0;
    return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`;
  }

  const cx=90,cy=90,r=85,ri=45;
  return(
    <svg width={180} height={180} className="grafico-pizza-svg">
      {fatias.map((f,i)=>(
        <path key={f.key}
          d={descreveFatia(f.inicio,f.inicio+f.angulo,r,cx,cy)}
          fill={f.cor}
          opacity={0.85}
          stroke={BG}
          strokeWidth={1.5}
        />
      ))}
      {/* Buraco central */}
      <circle cx={cx} cy={cy} r={ri} fill={BG}/>
      <text x={cx} y={cy-6} textAnchor="middle" fill="#F0EBD8" fontSize={11} fontFamily={font}>Total</text>
      <text x={cx} y={cy+10} textAnchor="middle" fill="#F0A202" fontSize={9} fontFamily={font}>
        {(total/1000000).toFixed(2)}M
      </text>
    </svg>
  );
}

export default function Carteira(){
  const {id}=useParams();
  const navigate=useNavigate();
  const [clienteNome,setClienteNome]=useState("");
  const [clienteAvatar,setClienteAvatar]=useState("homem");
  const formRef=useRef({});
  const [snap,setSnap]=useState({});
  const [modo,setModo]=useState("ver");
  const [salvando,setSalvando]=useState(false);
  const [msg,setMsg]=useState("");
  const [alertaRemocao,setAlertaRemocao]=useState(null);
  const [uploading,setUploading]=useState(false);
  const [carregou,setCarregou]=useState(false);
  const fileInputRef=useRef(null);

  useEffect(()=>{
    async function carregar(){
      const s=await getDoc(doc(db,"clientes",id));
      if(!s.exists()){setCarregou(true);return;}
      const data=s.data();
      setClienteNome(data.nome||"");
      setClienteAvatar(data.avatar||"homem");
      const carteira=data.carteira||{};
      formRef.current={...carteira};
      setSnap({...carteira});
      setCarregou(true);
    }
    carregar();
  },[id]);

  const setF=useCallback((k,v)=>{formRef.current={...formRef.current,[k]:v};},[]);
  const setFSnap=useCallback((k,v)=>{formRef.current={...formRef.current,[k]:v};setSnap(p=>({...p,[k]:v}));},[]);

  async function salvar(){
    setSalvando(true);
    try{
      const s=await getDoc(doc(db,"clientes",id));
      const anterior=s.data()?.carteira||{};

      // Detectar remoção de ativos
      const removidos=CLASSES.filter(c=>{
        const antes=parseCentavos(anterior[c.key]);
        const agora=parseCentavos(formRef.current[c.key]);
        return antes>0&&agora===0;
      });
      if(removidos.length>0){
        setAlertaRemocao(removidos.map(r=>r.label));
      }

      await setDoc(doc(db,"clientes",id),{...s.data(),carteira:{...formRef.current,atualizadoEm:new Date().toLocaleDateString("pt-BR")}});
      setSnap({...formRef.current});
      setMsg("Carteira atualizada com sucesso.");
      setModo("ver");
    }catch(e){setMsg("Erro: "+e.message);}
    setSalvando(false);
  }

  // Extrai números de valores financeiros do texto (ex: "R$ 1.500,00" -> 150000)
  function extrairValor(texto){
    if(!texto)return 0;
    const match=texto.match(/[\d.,]+/);
    if(!match)return 0;
    const limpo=match[0].replace(/\./g,"").replace(",",".");
    return Math.round(parseFloat(limpo)*100)||0;
  }

  // Parser simples para extrair dados financeiros do texto OCR
  function parseFinancialData(texto){
    const resultado={};
    const textUpper=texto.toUpperCase();

    // Mapa de palavras-chave para campos
    const patterns={
      posFixado:["PÓS-FIXADO","PÓS FIXADO","SELIC","CDB","LCI","LCA"],
      ipca:["IPCA","IPCA+","IPCA +","NTN-B","TESOURO IPCA"],
      preFixado:["PRÉ-FIXADO","PRÉ FIXADO","TESOURO PREFIXADO","NTN-F"],
      fiis:["FII","FUNDO IMOBILIÁRIO","IMOBILIÁRIOS"],
      multi:["MULTIMERCADO","HEDGE FUND"],
      acoes:["AÇÃO","AÇÕES","ETF","RENDA VARIÁVEL"],
      global:["GLOBAL","INTERNACIONAL","BDR","EXTERIOR"],
    };

    // Procurar por valores próximos às palavras-chave
    Object.entries(patterns).forEach(([campo,palavras])=>{
      palavras.forEach(palavra=>{
        const regex=new RegExp(`${palavra}[^\\d]*([\\d.,]+)`, "i");
        const match=texto.match(regex);
        if(match&&match[1]){
          const valor=extrairValor(match[1]);
          if(valor>0)resultado[campo]=valor;
        }
      });
    });

    return resultado;
  }

  // Upload e leitura de PDF/Imagem via Tesseract OCR
  async function handleUpload(e){
    const file=e.target.files[0];
    if(!file)return;
    setUploading(true);
    setMsg("Lendo arquivo com OCR (pode levar 10-30 segundos)...");

    try{
      const isPDF=file.type==="application/pdf";
      const isImage=file.type.startsWith("image/");

      if(!isPDF&&!isImage){
        throw new Error("Use PDF ou imagem (JPG, PNG)");
      }

      let imagemParaOCR=file;

      // Se for PDF, converter primeira página para imagem
      if(isPDF){
        setMsg("Convertendo PDF para imagem...");
        const arrayBuffer=await file.arrayBuffer();
        // Nota: Para produção, usar pdfjs-dist para extrair imagem do PDF
        // Por enquanto, usar uma abordagem simplificada
        throw new Error("Para PDFs, salve como imagem primeiro. Suporte completo em breve!");
      }

      // Executar OCR com Tesseract
      setMsg("Executando OCR... (0%)");
      const result=await Tesseract.recognize(imagemParaOCR,["por","eng"],{
        logger:(m)=>{
          if(m.status==="recognizing"){
            const pct=Math.round(m.progress*100);
            setMsg(`Executando OCR... (${pct}%)`);
          }
        }
      });

      const textoExtraido=result.data.text;

      if(!textoExtraido||textoExtraido.trim().length<10){
        throw new Error("Não consegui extrair texto do arquivo. Tente com uma imagem mais clara.");
      }

      // Parser dos dados financeiros
      const dados=parseFinancialData(textoExtraido);

      if(Object.keys(dados).length===0){
        setMsg("Arquivo lido, mas nenhum dado financeiro detectado. Preencha manualmente.");
        setModo("editar");
      }else{
        // Atualizar campos
        const updates={};
        CLASSES.forEach(c=>{
          if(dados[c.key]&&dados[c.key]>0){
            updates[c.key]=String(dados[c.key]);
          }
        });

        Object.entries(updates).forEach(([k,v])=>{
          formRef.current={...formRef.current,[k]:v};
        });
        setSnap(p=>({...p,...updates}));

        setMsg(`✓ Dados extraídos! ${Object.keys(updates).length} campos atualizados. Revise e salve.`);
        setModo("editar");
      }

    }catch(err){
      setMsg("Erro: "+err.message);
    }
    setUploading(false);
    e.target.value="";
  }

  // Totais
  const total=CLASSES.reduce((acc,c)=>acc+(parseCentavos(snap[c.key])/100),0);
  const liquidezD1=["posFixado","ipca","preFixado"].reduce((acc,k)=>acc+(parseCentavos(snap[k])/100),0);
  const rentabilidade=parseFloat(snap.rentabilidade)||0;

  if(!carregou)return(
    <div className="carteira-loading">
      <div>Carregando...</div>
    </div>
  );

  return(
    <div className="carteira-container">

      {/* NAVBAR - Nova com padronização */}
      <Navbar
        actionButtons={[
          {
            icon: uploading?"⟳":"↑",
            label: uploading?"Processando...":"Importar arquivo",
            onClick: ()=>fileInputRef.current?.click(),
            disabled: uploading
          },
          {
            label: modo==="ver"?"Editar":"Salvar",
            variant: modo==="editar"?"primary":"secondary",
            onClick: modo==="ver"?()=>setModo("editar"):salvar,
            disabled: salvando
          }
        ]}
      />
      <input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg" style={{display:"none"}} onChange={handleUpload}/>

      <div className="carteira-content">

        {/* Voltar — flutuante */}
        <button
          onClick={()=>navigate(`/cliente/${id}`)}
          style={{
            position:"fixed",
            left:16,
            top:"50%",
            transform:"translateY(-50%)",
            width:44,
            height:44,
            borderRadius:22,
            background:"rgba(240,162,2,0.15)",
            border:"1px solid rgba(240,162,2,0.3)",
            color:"#F0A202",
            fontSize:20,
            cursor:"pointer",
            zIndex:50,
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            transition:"all 0.3s ease",
            boxShadow:"0 4px 12px rgba(0,0,0,0.3)"
          }}
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

        {/* HEADER — nome do cliente */}
        <div className="carteira-header">
          <AvatarIcon tipo={clienteAvatar} size={48}/>
          <div>
            <div className="carteira-header-info">Carteira de investimentos</div>
            <div className="carteira-header-title">{clienteNome||"Cliente"}</div>
          </div>
        </div>

        {/* Feedback */}
        {msg&&(
          <div className={`carteira-message ${msg.includes("Erro") ? "error" : "success"}`}>
            {msg}
            <button className="carteira-message-close" onClick={()=>setMsg("")}>×</button>
          </div>
        )}

        {/* Alerta de remoção de ativo */}
        {alertaRemocao&&(
          <div className="carteira-alert-removal">
            <div className="carteira-alert-title">⚠ Ativo removido da carteira</div>
            <div>Identifiquei que o(s) seguinte(s) ativo(s) foram zerados em relação à versão anterior:</div>
            <div className="carteira-alert-items">{alertaRemocao.join(", ")}</div>
            <div style={{marginTop:6}}>O cliente vendeu / resgatou esses ativos?</div>
            <button className="carteira-alert-btn" onClick={()=>setAlertaRemocao(null)}>Entendido</button>
          </div>
        )}

        {/* KPIs de topo */}
        <div className="carteira-kpi-grid">
          {[
            {label:"Patrimônio total",   valor:brl(total),              cor:"#FFB20F", grande:true},
            {label:"Rentabilidade no ano",valor:rentabilidade>0?`+${pct(rentabilidade)}`:"—", cor:rentabilidade>0?"#22c55e":"#3E5C76"},
            {label:"Liquidez D+1",       valor:brl(liquidezD1),         cor:"#60a5fa"},
          ].map(({label,valor,cor,grande})=>(
            <div key={label} className="carteira-kpi-card" style={{"--color":cor}}>
              <div className="carteira-kpi-label">{label}</div>
              <div className={`carteira-kpi-value ${grande?"large":""}`}>{valor}</div>
            </div>
          ))}
        </div>

        {/* GRÁFICO + TABELA lado a lado */}
        <div className="carteira-main-grid">

          {/* Gráfico pizza */}
          <div className="carteira-chart-container">
            <div className="carteira-chart-label">Composição</div>
            <GraficoPizza classes={CLASSES} valores={snap} total={total}/>
            {/* Legenda */}
            <div className="carteira-legend">
              {CLASSES.map(c=>{
                const val=parseCentavos(snap[c.key])/100;
                const p=total>0?Math.round(val/total*100):0;
                if(!val)return null;
                return(
                  <div key={c.key} className="carteira-legend-item">
                    <div className="carteira-legend-dot" style={{"--color":c.cor}}/>
                    <span className="carteira-legend-label">{c.label}</span>
                    <span className="carteira-legend-pct">{p}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tabela de ativos */}
          <div className="carteira-table-wrapper">
            <div className="carteira-table">
              {/* Header tabela */}
              <div className="carteira-table-header">
                <div className="carteira-table-header-cell">Classe</div>
                <div className="carteira-table-header-cell right">Valor</div>
                <div className="carteira-table-header-cell pct">%</div>
                <div className="carteira-table-header-cell pct">Liq.</div>
              </div>

              {CLASSES.map((c,i)=>{
                const val=parseCentavos(snap[c.key])/100;
                const p=total>0?Math.round(val/total*100):0;
                return(
                  <div key={c.key} className={`carteira-table-row ${i<CLASSES.length-1?"":" last"}`}>
                    <div className="carteira-table-row-content">
                      <div className="carteira-table-class">
                        <div className="carteira-table-indicator" style={{"--color":c.cor}}/>
                        <span className="carteira-table-class-label">{c.label}</span>
                      </div>
                      <div className="carteira-table-value">
                        {modo==="editar"
                          ?<InputMoeda key={`${c.key}-${id}`} initValue={snap[c.key]} onCommit={v=>setFSnap(c.key,v)}/>
                          :<span className={val>0?"":" dash"}>{val>0?brl(val):"—"}</span>
                        }
                      </div>
                      <div className={`carteira-table-pct ${p>0?"text":"muted"}`}>{p>0?p+"%":"—"}</div>
                      <div className="carteira-table-liq">{c.liquidez}</div>
                    </div>
                    {/* Barra de progresso */}
                    {p>0&&(
                      <div className="carteira-table-progress">
                        <div className="carteira-table-progress-bar" style={{"--pct":`${p}%`, "--color":c.cor}}/>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Total */}
              <div className="carteira-table-footer">
                <span className="carteira-table-footer-label">Total</span>
                <span className="carteira-table-footer-total">{brl(total)}</span>
              </div>
            </div>

            {/* Rentabilidade e data — só em edição */}
            {modo==="editar"&&(
              <div className="carteira-edit-form">
                <div>
                  <label className="form-label">Rentabilidade no ano (%)</label>
                  <input className="form-input" type="number" step="0.01" placeholder="Ex: 14.5"
                    value={snap.rentabilidade||""}
                    onChange={e=>setFSnap("rentabilidade",e.target.value)}/>
                </div>
                <div>
                  <label className="form-label">Data de atualização</label>
                  <input className="form-input" placeholder="DD/MM/AAAA" value={snap.atualizadoEm||""}
                    onChange={e=>setFSnap("atualizadoEm",e.target.value)}/>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* LIQUIDEZ D+1 destaque */}
        <div className="carteira-liquidez-box">
          <div className="carteira-liquidez-label">Liquidez imediata disponível · D+1</div>
          <div className="carteira-liquidez-content">
            <div className="carteira-liquidez-value">{brl(liquidezD1)}</div>
            <div className="carteira-liquidez-pct">
              {total>0?Math.round(liquidezD1/total*100):0}% do patrimônio total
            </div>
          </div>
          <div className="carteira-liquidez-desc">
            Inclui: Renda Fixa Pós-Fixada · Renda Fixa IPCA+ · Renda Fixa Pré-Fixada
          </div>
        </div>

        {/* Aporte do mês (se extraído do arquivo) */}
        {snap.aporteMesExtrato&&parseCentavos(snap.aporteMesExtrato)>0&&(
          <div className="carteira-aporte-box">
            <div className="carteira-aporte-label">Aporte identificado no extrato</div>
            <div className="carteira-aporte-value">{brl(parseCentavos(snap.aporteMesExtrato)/100)}</div>
            <div className="carteira-aporte-desc">Valor detectado automaticamente na leitura do arquivo</div>
          </div>
        )}

        {/* Informações adicionais */}
        {snap.atualizadoEm&&(
          <div className="carteira-footer">
            Última atualização: {snap.atualizadoEm}
          </div>
        )}

      </div>
    </div>
  );
}