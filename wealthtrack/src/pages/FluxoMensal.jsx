import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Navbar } from "../components/Navbar";
import { T, C } from "../theme";

function parseCentavos(s){ return parseInt(String(s||"0").replace(/\D/g,""))||0; }
function moeda(c){ const n=parseCentavos(c); if(!n)return""; return (n/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:0,maximumFractionDigits:0}); }
function brl(v){ return Math.round(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:0,maximumFractionDigits:0}); }

const CATS = [
  { label:"Moradia",           key:"moradia",      cor:"#2563eb" },
  { label:"Alimentação",       key:"alimentacao",  cor:"#3b82f6" },
  { label:"Educação",          key:"educacao",     cor:"#22c55e" },
  { label:"Cartões / Consumo", key:"cartoes",      cor:"#F0A202" },
  { label:"Carro / Transporte",key:"carro",        cor:"#a07020" },
  { label:"Saúde",             key:"saude",        cor:"#ef4444" },
  { label:"Outros",            key:"outros",       cor:"#6b7280" },
];

export default function FluxoMensal() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({});
  const [modo, setModo] = useState("ver");
  const [salvando, setSalvando] = useState(false);

  useEffect(()=>{
    async function carregar(){
      const snap=await getDoc(doc(db,"clientes",id));
      if(snap.exists()) setForm(snap.data().fluxo||{});
    }
    carregar();
  },[id]);

  function setF(k,v){ setForm(f=>({...f,[k]:v})); }

  async function salvar(){
    setSalvando(true);
    const snap=await getDoc(doc(db,"clientes",id));
    await setDoc(doc(db,"clientes",id),{...snap.data(),fluxo:form});
    setModo("ver");
    setSalvando(false);
  }

  const renda = parseCentavos(form.renda)/100;
  const totalGastos = CATS.reduce((acc,{key})=>acc+(parseCentavos(form[key])/100),0);
  const sobra = renda - totalGastos;
  const poupanca = renda>0?Math.round(sobra/renda*100):0;

  return (
    <div className="fluxo-container">
      {/* NAVBAR - Nova com padronização */}
      <Navbar
        actionButtons={[
          {
            label: modo==="ver"?"Editar":"Salvar",
            variant: modo==="editar"?"primary":"secondary",
            onClick: ()=>modo==="ver"?setModo("editar"):salvar(),
            disabled: salvando
          }
        ]}
      />

      <div className="fluxo-content">

        {/* Resumo */}
        <div className="fluxo-summary-grid">
          {[
            ["Renda",    brl(renda),       T.success ],
            ["Gastos",   brl(totalGastos), T.danger  ],
            ["Disponível",brl(sobra),      T.warning ],
          ].map(([l,v,cor])=>(
            <div key={l} className="fluxo-summary-card">
              <div className="fluxo-summary-label">{l}</div>
              <div className="fluxo-summary-value" style={{"--color": cor}}>{v}</div>
            </div>
          ))}
        </div>

        {poupanca<30 && renda>0 && (
          <div className="fluxo-alert">
            Taxa de poupança: {poupanca}%. O ideal é mínimo 30% da renda
            para atingir os objetivos no prazo.
          </div>
        )}

        {/* Renda */}
        {modo==="editar" && (
          <div className="form-group">
            <label className="form-label">Renda mensal total</label>
            <input className="form-input" placeholder="R$ 0" value={moeda(form.renda)} onChange={e=>setF("renda",String(parseCentavos(e.target.value)))} />
          </div>
        )}

        {/* Gastos */}
        <div className="section-header"><span>Gastos por categoria</span><div className="divider-line"/></div>

        <div className="fluxo-categories">
          {CATS.map(({label,key,cor})=>{
            const val = parseCentavos(form[key])/100;
            const pct = totalGastos>0?Math.round(val/totalGastos*100):0;
            return (
              <div key={key} className="fluxo-category">
                <div className="fluxo-category-indicator" style={{"--color":cor}}/>
                <div className="fluxo-category-label">{label}</div>
                <div className="fluxo-category-bar">
                  <div className="fluxo-category-bar-fill" style={{"--pct":`${pct}%`, "--color":cor}}/>
                </div>
                <div className="fluxo-category-percent">{pct}%</div>
                {modo==="editar"
                  ? <input className="fluxo-category-input" value={moeda(form[key])} onChange={e=>setF(key,String(parseCentavos(e.target.value)))} placeholder="R$ 0" />
                  : <div className="fluxo-category-value">{brl(val)}</div>
                }
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}