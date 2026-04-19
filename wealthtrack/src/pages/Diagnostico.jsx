import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Navbar } from "../components/Navbar";
import { T, C } from "../theme";
import { AvatarIcon } from "./Dashboard";

// ── Helpers ──
function parseCentavos(s) { return parseInt(String(s||"0").replace(/\D/g,""))||0; }
function moedaFull(v) {
  if(!v||v<=0) return "—";
  return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2,maximumFractionDigits:2});
}
function formatMi(v) {
  if(!v||v<=0) return "—";
  if(v>=1000000) return `R$ ${(v/1000000).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}Mi`;
  if(v>=1000) return `R$ ${(v/1000).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:0})}k`;
  return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:0});
}
function calcularIdade(nasc) {
  if(!nasc) return null;
  if(/^\d{1,3}$/.test(nasc)) return parseInt(nasc);
  const p = String(nasc).split("/");
  if(p.length<3) return null;
  const d = new Date(`${p[2]}-${p[1]}-${p[0]}`);
  if(isNaN(d)) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear()-d.getFullYear();
  const m = hoje.getMonth()-d.getMonth();
  if(m<0||(m===0&&hoje.getDate()<d.getDate())) idade--;
  return idade>0&&idade<120 ? idade : null;
}

// Ranges de faixa usadas no cadastro (para estimar valor de imóveis/veículos)
const FAIXAS_IMOVEL_MIDS = {};
[...Array.from({length:50},(_,i)=>(i+1)*100000),5500000,6000000,7000000,8000000,9000000,10000000,12000000].forEach(v=>{
  const label = v===12000000?"Acima de R$ 10M":`R$ ${v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  FAIXAS_IMOVEL_MIDS[label]=v;
});
const FAIXAS_VEICULO_MIDS = {};
[...Array.from({length:50},(_,i)=>(i+1)*10000),600000,700000,800000,900000,1000000,1200000].forEach(v=>{
  const label = v===1200000?"Acima de R$ 1M":`R$ ${v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  FAIXAS_VEICULO_MIDS[label]=v;
});

function totalImoveisCalc(imoveis) {
  return (imoveis||[]).reduce((acc,im)=>{
    const mid = FAIXAS_IMOVEL_MIDS[im.faixa]||0;
    const qtd = Math.max(parseInt(im.quantidade)||1,1);
    return acc+mid*qtd;
  },0);
}
function totalVeiculosCalc(veiculos) {
  return (veiculos||[]).reduce((acc,v)=>{
    const mid = FAIXAS_VEICULO_MIDS[v.faixa]||0;
    const qtd = Math.max(parseInt(v.quantidade)||1,1);
    return acc+mid*qtd;
  },0);
}

// Projeção financeira: patrimônio futuro com aporte mensal e rentabilidade real
// P_futuro = P*(1+r)^n + PMT*[((1+r)^n - 1)/r]  (mensal)
function projetarPatrimonio(inicial, aporteMensal, rentAnualPct, anos) {
  const r = rentAnualPct/100;
  const rMensal = Math.pow(1+r, 1/12)-1;
  const meses = anos*12;
  if(rMensal===0) return inicial + aporteMensal*meses;
  const fv = inicial*Math.pow(1+rMensal,meses) + aporteMensal*((Math.pow(1+rMensal,meses)-1)/rMensal);
  return fv;
}

// Quantos anos para atingir patrimônio-alvo (magic number)
function anosParaAtingir(inicial, aporteMensal, rentAnualPct, alvo) {
  if(alvo<=inicial) return 0;
  const r = rentAnualPct/100;
  const rMensal = Math.pow(1+r,1/12)-1;
  for(let mes=1; mes<=50*12; mes++) {
    const fv = rMensal===0
      ? inicial + aporteMensal*mes
      : inicial*Math.pow(1+rMensal,mes) + aporteMensal*((Math.pow(1+rMensal,mes)-1)/rMensal);
    if(fv>=alvo) return Math.round((mes/12)*10)/10;
  }
  return null;
}

const noEdit = {userSelect:"none",WebkitUserSelect:"none",cursor:"default"};

const NIVEIS = {
  alto:  {cor:"#ef4444",bg:"rgba(239,68,68,0.08)",borda:"rgba(239,68,68,0.28)",label:"ALTA PRIORIDADE"},
  medio: {cor:"#f59e0b",bg:"rgba(245,158,11,0.08)",borda:"rgba(245,158,11,0.28)",label:"ATENÇÃO"},
  baixo: {cor:"#22c55e",bg:"rgba(34,197,94,0.08)",borda:"rgba(34,197,94,0.28)",label:"OPORTUNIDADE"},
  info:  {cor:"#60a5fa",bg:"rgba(96,165,250,0.08)",borda:"rgba(96,165,250,0.28)",label:"INSIGHT"},
};

// ── Motor completo de análise ──
function analisar(cliente) {
  const salario = parseCentavos(cliente.salarioMensal)/100;
  const gastos = parseCentavos(cliente.gastosMensaisManual)/100;
  const aporteMedio = parseCentavos(cliente.aporteMedio)/100;
  const metaAporte = parseCentavos(cliente.metaAporteMensal)/100;
  const patrimonioManual = parseCentavos(cliente.patrimonio)/100;
  const rentAnual = parseFloat(String(cliente.rentabilidadeAnual||"").replace(",","."))||0;

  const imoveis = cliente.imoveis||[];
  const veiculos = cliente.veiculos||[];
  const objetivos = cliente.objetivosInteresse||[];
  const filhos = cliente.filhos||[];
  const estadoCivil = cliente.estadoCivil;
  const foco = cliente.focoInvestimento;
  const modeloAtend = cliente.modeloAtendimento;
  const idade = calcularIdade(cliente.nascimento);

  const valorImoveis = totalImoveisCalc(imoveis);
  const valorVeiculos = totalVeiculosCalc(veiculos);
  const patrimonioFinanceiro = patrimonioManual;
  const patrimonioTotal = patrimonioFinanceiro + valorImoveis + valorVeiculos;

  // Sobra mensal
  const sobra = salario>0&&gastos>0?salario-gastos:0;
  const pctSobra = salario>0?(sobra/salario)*100:0;

  // Reserva ideal (6x gastos)
  const reservaIdeal = gastos*6;

  // Magic Number (regra dos 4% — Bengen/Trinity): gastos anuais × 25
  // Para Brasil, uso 5% ao ano real (conservador) → ×20
  const gastoAnual = (gastos||salario*0.7)*12;
  const magicNumber = gastoAnual*20; // regra 5% real
  const pctLiberdade = magicNumber>0?Math.min((patrimonioFinanceiro/magicNumber)*100,100):0;

  // Projeção aposentadoria
  const rentProj = rentAnual>0?rentAnual:10; // default 10% a.a.
  const rentReal = Math.max(rentProj-4, 2); // descontar inflação ~4%
  const aporteUsado = aporteMedio>0?aporteMedio:metaAporte>0?metaAporte:0;
  const idadeDesejadaAposentar = 60; // padrão
  const anosAte60 = idade?Math.max(idadeDesejadaAposentar-idade, 3):null;
  const patAos60 = anosAte60?projetarPatrimonio(patrimonioFinanceiro, aporteUsado, rentReal, anosAte60):0;
  const rendaPassivaAos60 = patAos60*0.05/12; // 5% a.a. real ÷ 12 = renda mensal
  const anosParaLiberdade = aporteUsado>0?anosParaAtingir(patrimonioFinanceiro, aporteUsado, rentReal, magicNumber):null;
  const idadeLiberdade = idade&&anosParaLiberdade?idade+anosParaLiberdade:null;

  // Distribuição patrimonial
  const distribuicao = [
    {label:"Financeiro",valor:patrimonioFinanceiro,cor:"#F0A202"},
    {label:"Imóveis",valor:valorImoveis,cor:"#22c55e"},
    {label:"Veículos",valor:valorVeiculos,cor:"#60a5fa"},
  ].filter(d=>d.valor>0);
  const pctImoveisTotal = patrimonioTotal>0?(valorImoveis/patrimonioTotal)*100:0;

  // Proteção — cálculo de cobertura
  const temSeguroCarro = veiculos.some(v=>v.temSeguro===true);
  const carrosSemSeguro = veiculos.filter(v=>v.temSeguro===false).length;
  const temFilhosDep = filhos.length>0;
  const temConjuge = estadoCivil==="Casado(a)"||estadoCivil==="União Estável";
  const protecoes = {
    reserva: patrimonioFinanceiro>=reservaIdeal,
    seguroCarro: veiculos.length===0||temSeguroCarro,
    seguroVida: false, // sem campo ainda
    previdencia: false, // detectar via carteira no futuro
    sucessao: !(temFilhosDep||temConjuge)||patrimonioTotal<500000,
  };

  // ═══ SCORE FINANCEIRO ═══ (0-100 com sub-notas)
  // 1. Fluxo (0-25): sobra saudável + capacidade
  let scoreFluxo = 0;
  if(pctSobra>=30) scoreFluxo=25;
  else if(pctSobra>=20) scoreFluxo=22;
  else if(pctSobra>=10) scoreFluxo=15;
  else if(pctSobra>0) scoreFluxo=8;
  else scoreFluxo=0;

  // 2. Reserva (0-20)
  let scoreReserva = 0;
  if(reservaIdeal>0) {
    const rPct = patrimonioFinanceiro/reservaIdeal;
    scoreReserva = Math.min(rPct*20, 20);
  } else if(patrimonioFinanceiro>0) scoreReserva = 10;

  // 3. Investimentos (0-25): rentabilidade + diversificação + patrimônio
  let scoreInvest = 0;
  if(rentAnual>=11) scoreInvest+=12;
  else if(rentAnual>=9) scoreInvest+=9;
  else if(rentAnual>=7) scoreInvest+=6;
  else if(rentAnual>0) scoreInvest+=3;
  if(patrimonioFinanceiro>=500000) scoreInvest+=8;
  else if(patrimonioFinanceiro>=100000) scoreInvest+=5;
  else if(patrimonioFinanceiro>0) scoreInvest+=2;
  if(foco) scoreInvest+=5;

  // 4. Proteção (0-15)
  let scoreProt = 0;
  if(protecoes.reserva) scoreProt+=5;
  if(protecoes.seguroCarro) scoreProt+=5;
  if(protecoes.sucessao) scoreProt+=5;

  // 5. Objetivos e planejamento (0-15)
  let scorePlan = 0;
  if(objetivos.length>=4) scorePlan+=8;
  else if(objetivos.length>=2) scorePlan+=5;
  else if(objetivos.length>=1) scorePlan+=3;
  if(metaAporte>0) scorePlan+=4;
  if(modeloAtend==="Fee Based") scorePlan+=3;

  const scoreTotal = Math.round(scoreFluxo+scoreReserva+scoreInvest+scoreProt+scorePlan);
  const scores = [
    {label:"Organização de Fluxo",valor:Math.round(scoreFluxo),max:25,cor:"#F0A202",desc:"Sobra mensal vs renda"},
    {label:"Reserva de Emergência",valor:Math.round(scoreReserva),max:20,cor:"#22c55e",desc:"6x gastos em liquidez"},
    {label:"Investimentos",valor:Math.round(scoreInvest),max:25,cor:"#60a5fa",desc:"Rentabilidade + patrimônio + foco"},
    {label:"Proteção Patrimonial",valor:Math.round(scoreProt),max:15,cor:"#a78bfa",desc:"Seguros + sucessão + reserva"},
    {label:"Planejamento",valor:Math.round(scorePlan),max:15,cor:"#ec4899",desc:"Objetivos definidos + metas + modelo"},
  ];

  // ═══ INSIGHTS (ricos, com números) ═══
  const insights = [];

  if(salario>0&&gastos>0) {
    if(sobra<0) {
      insights.push({nivel:"alto",icon:"⚠️",titulo:"Fluxo mensal no vermelho",
        texto:`Seus gastos (${moedaFull(gastos)}) superam a renda (${moedaFull(salario)}). Déficit mensal: ${moedaFull(Math.abs(sobra))}. Antes de qualquer investimento, precisamos reorganizar o orçamento — uma análise completa dos 10 grupos de despesas identifica em média 15-25% de otimização.`,
        cta:"Reunião de reorganização de fluxo (45 min).",
      });
    } else if(pctSobra<10) {
      insights.push({nivel:"medio",icon:"📉",titulo:"Margem de manobra apertada",
        texto:`Você poupa apenas ${pctSobra.toFixed(1)}% da renda (${moedaFull(sobra)}/mês). O ideal CFP é 20-30% para construir patrimônio relevante. Em 10 anos, cada 5% a mais de poupança pode significar +${moedaFull(salario*0.05*12*10*1.5)} no patrimônio final.`,
        cta:"Revisão de gastos com metodologia 50/30/20.",
      });
    } else if(pctSobra>=20) {
      const patProj10 = projetarPatrimonio(patrimonioFinanceiro, sobra*0.9, rentReal, 10);
      insights.push({nivel:"baixo",icon:"💪",titulo:"Capacidade de poupança saudável",
        texto:`Você pode direcionar ${moedaFull(sobra)}/mês (${pctSobra.toFixed(0)}% da renda) para investimentos. Se disciplinado com 90% desse valor por 10 anos a ${rentReal.toFixed(1)}% real, chegaria a ${moedaFull(patProj10)} — excelente base.`,
        cta:"Estruturar aporte automático e carteira otimizada.",
      });
    }
  }

  if(gastos>0&&patrimonioFinanceiro<reservaIdeal&&patrimonioFinanceiro>0) {
    const falta = reservaIdeal-patrimonioFinanceiro;
    const mesesParaReserva = sobra>0?Math.ceil(falta/sobra):null;
    insights.push({nivel:"medio",icon:"🛟",titulo:"Reserva de emergência incompleta",
      texto:`Reserva ideal (6x gastos): ${moedaFull(reservaIdeal)}. Faltam ${moedaFull(falta)}.${mesesParaReserva?` Com sua sobra atual de ${moedaFull(sobra)}/mês, completamos em ${mesesParaReserva} meses.`:""} Reserva em CDB liquidez D+1 ou Tesouro Selic.`,
      cta:"Plano de 6-12 meses para blindar a família.",
    });
  }

  if(aporteMedio>0&&metaAporte>0&&aporteMedio<metaAporte) {
    const gap = metaAporte-aporteMedio;
    insights.push({nivel:gap/metaAporte>0.4?"alto":"medio",icon:"🎯",titulo:"Gap entre aporte real e meta",
      texto:`Meta: ${moedaFull(metaAporte)}/mês · Real: ${moedaFull(aporteMedio)}/mês · Gap: ${moedaFull(gap)} (${((gap/metaAporte)*100).toFixed(0)}%). Em 10 anos, este gap representa ${moedaFull(gap*12*10*1.4)} em patrimônio não construído.`,
      cta:"Ajustar meta ou automatizar aporte no dia do salário.",
    });
  }

  if(rentAnual>0&&rentAnual<8) {
    const deltaVs12 = projetarPatrimonio(patrimonioFinanceiro, aporteUsado, 12-4, 10) - projetarPatrimonio(patrimonioFinanceiro, aporteUsado, rentAnual-4, 10);
    insights.push({nivel:"alto",icon:"📉",titulo:"Rentabilidade abaixo do mercado",
      texto:`Você rende ${rentAnual.toFixed(1)}% a.a. — abaixo do CDI (~11%). Em 10 anos, diferença para uma carteira de 12% bem estruturada: +${moedaFull(deltaVs12)} a mais no patrimônio, mesmo risco similar.`,
      cta:"Reposicionamento de carteira com mesmo risco + maior retorno.",
    });
  } else if(rentAnual>0&&rentAnual<11) {
    insights.push({nivel:"medio",icon:"📊",titulo:"Rentabilidade na média",
      texto:`${rentAnual.toFixed(1)}% a.a. é razoável, mas estruturando carteira diversificada (nacional + global + renda variável proporcional ao perfil), podemos buscar 12-14% com risco controlado.`,
      cta:"Diversificação internacional e eficiência fiscal (VGBL/LCA/LCI).",
    });
  }

  if(modeloAtend==="Comissionado (Commission Based)") {
    const custoEstimado = patrimonioFinanceiro*0.015; // ~1,5% a.a. oculto em produtos
    insights.push({nivel:"medio",icon:"💼",titulo:"Modelo comissionado: conflito de interesses",
      texto:`No modelo comissionado, o profissional ganha por produto vendido — estudos mostram custo oculto de 1-2% a.a.${patrimonioFinanceiro>0?` Para sua carteira de ${formatMi(patrimonioFinanceiro)}, isso representa ~${moedaFull(custoEstimado)}/ano drenando seu retorno.`:""} Fee Based: taxa fixa transparente, conselhos alinhados ao seu interesse.`,
      cta:"Análise de custos ocultos vs modelo Fee Based.",
    });
  }

  if(imoveis.length===0) {
    insights.push({nivel:"info",icon:"🏡",titulo:"Sem patrimônio imobiliário",
      texto:`Dois caminhos: (1) Comprar à vista com ${moedaFull(magicNumber*0.15)}-${moedaFull(magicNumber*0.25)} aplicados em cota-alvo; ou (2) Montar carteira que gere renda para aluguel para sempre. Cálculo de retorno comparativo em 20 anos costuma favorecer opção 2.`,
      cta:"Simulação imóvel próprio vs carteira geradora de renda.",
    });
  } else if(pctImoveisTotal>60) {
    insights.push({nivel:"medio",icon:"🏠",titulo:"Concentração em imóveis",
      texto:`${pctImoveisTotal.toFixed(0)}% do seu patrimônio está em imóveis (${moedaFull(valorImoveis)}). Concentração reduz liquidez e flexibilidade. Diversificar gradualmente em ativos líquidos melhora capacidade de resposta a oportunidades e emergências.`,
      cta:"Plano de diversificação gradual sem vender imóveis.",
    });
  }

  if(carrosSemSeguro>0) {
    insights.push({nivel:"alto",icon:"🛡️",titulo:"Veículo sem seguro",
      texto:`${carrosSemSeguro} veículo(s) sem seguro. Um sinistro pode custar ${moedaFull(valorVeiculos*0.8)} de prejuízo imediato — comprometendo meses ou anos de aportes.`,
      cta:"Cotação integrada ao planejamento financeiro.",
    });
  }

  if(objetivos.includes("aposentadoria")&&idade) {
    const gastosAposent = (gastos||salario*0.7);
    const gapRenda = gastosAposent - rendaPassivaAos60;
    if(rendaPassivaAos60<gastosAposent) {
      insights.push({nivel:"alto",icon:"🌴",titulo:"Aposentadoria: rota precisa ajustar",
        texto:`Projetando sua carteira (${moedaFull(patrimonioFinanceiro)}) + aporte médio (${moedaFull(aporteUsado)}/mês) a ${rentReal.toFixed(1)}% real em ${anosAte60} anos → ${moedaFull(patAos60)} aos ${idadeDesejadaAposentar}, gerando ${moedaFull(rendaPassivaAos60)}/mês de renda passiva. Mas seus gastos atuais são ${moedaFull(gastosAposent)} — gap de ${moedaFull(gapRenda)}/mês.`,
        cta:"Ajustar aporte, rentabilidade-alvo ou idade de aposentadoria.",
      });
    } else {
      insights.push({nivel:"baixo",icon:"✅",titulo:"Aposentadoria no caminho",
        texto:`Projeção aos ${idadeDesejadaAposentar}: patrimônio ${moedaFull(patAos60)} gerando ${moedaFull(rendaPassivaAos60)}/mês (acima dos seus gastos atuais de ${moedaFull(gastosAposent)}). Foco agora é proteger esse plano contra inflação, eventos e otimizar fiscalmente.`,
        cta:"Blindagem do plano: seguros + previdência + diversificação.",
      });
    }
  }

  if((temConjuge||temFilhosDep)&&patrimonioTotal>100000) {
    const custoInventario = patrimonioTotal*0.12; // estimativa média
    insights.push({nivel:"medio",icon:"👨‍👩‍👧",titulo:"Sucessão patrimonial",
      texto:`Com ${temFilhosDep?`${filhos.length} filho(s)`:"cônjuge"} e patrimônio de ${formatMi(patrimonioTotal)}, sem planejamento sucessório seus herdeiros podem pagar ~${moedaFull(custoInventario)} em ITCMD + inventário + honorários (4-20% do patrimônio). VGBL, holding patrimonial e seguro de vida reduzem drasticamente esse custo.`,
      cta:"Estruturação sucessória: VGBL + holding + seguro de vida.",
    });
  }

  if(foco&&idade) {
    if(foco.includes("Dividendos")&&idade<40) {
      insights.push({nivel:"info",icon:"📈",titulo:"Foco em dividendos sendo jovem",
        texto:`Aos ${idade} anos, uma carteira mais exposta a crescimento (ações, global equities, FIIs de desenvolvimento) tipicamente entrega 2-4% a.a. a mais que uma focada só em dividendos — e o reinvestimento acelera juros compostos. Dividendos fazem sentido como complemento.`,
        cta:"Balanço entre crescimento e renda para seu perfil.",
      });
    } else if(foco.includes("Valorização")&&idade>=55) {
      insights.push({nivel:"info",icon:"💰",titulo:"Foco em valorização aos 55+",
        texto:`Próximo da aposentadoria, renda passiva (dividendos, FIIs de renda, aluguéis) traz previsibilidade e reduz risco de sequência de retornos (vender ativos em queda).`,
        cta:"Transição gradual da carteira para renda.",
      });
    }
  }

  if(objetivos.includes("planoSaude")||(idade&&idade>=50)) {
    insights.push({nivel:"info",icon:"🏥",titulo:"Saúde após 59: salto no custo",
      texto:`Planos de saúde sobem em média 40-60% após 59 anos. Reserva saúde dedicada ou seguro saúde internacional (com cobertura USD) podem ser alternativas estratégicas, especialmente para patrimônios relevantes.`,
      cta:"Reserva saúde vitalícia ou seguro internacional.",
    });
  }

  if(objetivos.includes("educacao")&&filhos.length>0) {
    const idadesFilhos = filhos.map(f=>parseInt(f.idade)||0).filter(x=>x>0);
    const maisNovo = idadesFilhos.length>0?Math.min(...idadesFilhos):0;
    const anosAteFaculdade = Math.max(18-maisNovo, 2);
    const custoFacu = 480000*filhos.length;
    insights.push({nivel:"medio",icon:"🎓",titulo:"Educação dos filhos",
      texto:`${filhos.length} filho(s), faculdade em ~${anosAteFaculdade} anos. Faculdade particular (4 anos) hoje: ${moedaFull(custoFacu)}. Começar hoje com ${rentReal.toFixed(1)}% real: aporte de ${moedaFull((custoFacu/anosAteFaculdade/12)*0.7)}/mês resolve; começar aos 10 do filho: ${moedaFull(custoFacu/4/12)}/mês.`,
      cta:"Caixinha de educação por filho com VGBL.",
    });
  }

  if(objetivos.includes("viagem")) {
    insights.push({nivel:"info",icon:"✈️",titulo:"Viagens como objetivo",
      texto:`Caixinha específica separa sonhos do capital principal — ativos de liquidez adequada a cada data. Evita tirar dinheiro da carteira em momento errado de mercado.`,
      cta:"Caixinha de viagens com aporte automatizado.",
    });
  }

  // ═══ PLANO DE AÇÃO 90 DIAS ═══
  const plano90 = [];
  if(sobra<0) plano90.push({prazo:"Semana 1-2",acao:"Mapear e cortar 15-20% de gastos para sair do vermelho"});
  if(patrimonioFinanceiro<reservaIdeal&&reservaIdeal>0) plano90.push({prazo:"Mês 1",acao:`Iniciar construção da reserva de emergência (${moedaFull(reservaIdeal)})`});
  if(carrosSemSeguro>0) plano90.push({prazo:"Mês 1",acao:"Contratar seguro dos veículos expostos"});
  if(modeloAtend==="Comissionado (Commission Based)") plano90.push({prazo:"Mês 1",acao:"Análise de custos ocultos da carteira atual"});
  if(rentAnual<11&&rentAnual>0) plano90.push({prazo:"Mês 2",acao:"Rebalancear carteira para rentabilidade-alvo compatível com perfil"});
  if(aporteMedio<metaAporte&&metaAporte>0) plano90.push({prazo:"Mês 2",acao:`Automatizar aporte mensal de ${moedaFull(metaAporte)} no dia ${cliente.diaAporte||"do salário"}`});
  if((temConjuge||temFilhosDep)&&patrimonioTotal>300000) plano90.push({prazo:"Mês 2-3",acao:"Estruturar plano sucessório (VGBL + seguro de vida)"});
  if(objetivos.length>0) plano90.push({prazo:"Mês 3",acao:"Detalhar e dar valores a cada objetivo selecionado (caixinhas)"});
  plano90.push({prazo:"Mês 3",acao:"Revisão trimestral do plano e ajuste de rota"});

  return {
    scores, scoreTotal, insights,
    magicNumber, pctLiberdade, anosParaLiberdade, idadeLiberdade,
    patAos60, rendaPassivaAos60, anosAte60, idadeDesejadaAposentar,
    distribuicao, patrimonioTotal, patrimonioFinanceiro, valorImoveis, valorVeiculos,
    reservaIdeal, sobra, pctSobra,
    protecoes, plano90,
    salario, gastos, aporteMedio, metaAporte, rentAnual, rentReal, idade,
  };
}

// ── Componentes visuais ──

function MiniKPI({label,valor,cor}) {
  return (
    <div style={{background:"rgba(255,255,255,0.02)",border:`0.5px solid ${T.border}`,borderRadius:12,padding:"12px 14px",flex:1,minWidth:140,...noEdit}}>
      <div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8,fontWeight:500}}>{label}</div>
      <div style={{fontSize:16,fontWeight:400,color:cor||T.textPrimary,letterSpacing:"-0.01em"}}>{valor}</div>
    </div>
  );
}

// Score circular
function ScoreCircle({score,size=140}) {
  const r = size*0.42;
  const c = 2*Math.PI*r;
  const pct = Math.max(0,Math.min(score/100,1));
  const cor = score>=80?"#22c55e":score>=60?"#F0A202":score>=40?"#f59e0b":"#ef4444";
  const label = score>=80?"Excelente":score>=60?"Bom":score>=40?"Em construção":"Frágil";
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0,...noEdit}}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size*0.065}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={cor} strokeWidth={size*0.065}
          strokeDasharray={`${c*pct} ${c}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}/>
        <text x={size/2} y={size/2-2} textAnchor="middle" fontSize={size*0.27} fill={T.textPrimary} fontFamily={T.fontFamily} fontWeight="300">{score}</text>
        <text x={size/2} y={size/2+16} textAnchor="middle" fontSize={size*0.075} fill={T.textMuted} fontFamily={T.fontFamily} letterSpacing="0.1em">/ 100</text>
      </svg>
      <div style={{position:"absolute",bottom:-8,left:0,right:0,textAlign:"center",fontSize:11,color:cor,fontWeight:500,letterSpacing:"0.05em"}}>{label}</div>
    </div>
  );
}

function ScoreBar({label,valor,max,cor,desc}) {
  const pct = max>0?(valor/max)*100:0;
  return (
    <div style={{marginBottom:12,...noEdit}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
        <div>
          <div style={{fontSize:12,color:T.textPrimary,fontWeight:500,letterSpacing:"0.01em"}}>{label}</div>
          <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>{desc}</div>
        </div>
        <div style={{fontSize:13,color:cor,fontWeight:500}}>{valor}<span style={{fontSize:10,color:T.textMuted,marginLeft:3}}>/ {max}</span></div>
      </div>
      <div style={{height:5,background:"rgba(255,255,255,0.05)",borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${cor},${cor}cc)`,borderRadius:3,boxShadow:`0 0 8px ${cor}55`,transition:"width 0.8s ease"}}/>
      </div>
    </div>
  );
}

function ProgressoMagic({pct,cor}) {
  return (
    <div style={{height:10,background:"rgba(255,255,255,0.05)",borderRadius:5,overflow:"hidden",marginTop:10,...noEdit}}>
      <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${cor},${cor}99)`,borderRadius:5,boxShadow:`0 0 12px ${cor}66`,transition:"width 0.8s ease"}}/>
    </div>
  );
}

// Distribuição patrimonial — barra horizontal
function DistBar({items,total}) {
  if(!items.length||total<=0) return null;
  return (
    <div style={{...noEdit}}>
      <div style={{display:"flex",height:24,borderRadius:8,overflow:"hidden",marginBottom:12,border:`0.5px solid ${T.border}`}}>
        {items.map(it=>{
          const pct = (it.valor/total)*100;
          return <div key={it.label} style={{width:`${pct}%`,background:it.cor,transition:"width 0.8s ease"}}/>;
        })}
      </div>
      {items.map(it=>{
        const pct = (it.valor/total)*100;
        return (
          <div key={it.label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:`0.5px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:10,height:10,borderRadius:3,background:it.cor}}/>
              <span style={{fontSize:12,color:T.textSecondary}}>{it.label}</span>
            </div>
            <div style={{display:"flex",gap:12,alignItems:"baseline"}}>
              <span style={{fontSize:12,color:T.textPrimary,fontWeight:500}}>{formatMi(it.valor)}</span>
              <span style={{fontSize:11,color:it.cor,fontWeight:500,minWidth:38,textAlign:"right"}}>{pct.toFixed(0)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProtecaoItem({label,ok,desc}) {
  const cor = ok?"#22c55e":"#ef4444";
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`0.5px solid ${T.border}`,...noEdit}}>
      <div style={{width:22,height:22,borderRadius:"50%",background:`${cor}18`,border:`1px solid ${cor}60`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        {ok?<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>:<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,color:T.textPrimary,fontWeight:500}}>{label}</div>
        <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>{desc}</div>
      </div>
      <span style={{fontSize:9,color:cor,fontWeight:600,letterSpacing:"0.1em"}}>{ok?"OK":"GAP"}</span>
    </div>
  );
}

function SectionCard({icon,titulo,subtitulo,children,accent="#F0A202"}) {
  return (
    <div style={{background:T.bgCard,border:`0.5px solid ${T.border}`,borderRadius:18,padding:"22px 22px",marginBottom:14,boxShadow:T.shadowSm}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:18}}>
        <div style={{width:3,height:28,borderRadius:2,background:`linear-gradient(180deg,${accent},${accent}33)`,flexShrink:0,marginTop:2}}/>
        {icon&&<div style={{fontSize:22,lineHeight:1,flexShrink:0}}>{icon}</div>}
        <div>
          <div style={{fontSize:17,fontWeight:500,color:T.textPrimary,letterSpacing:"-0.01em",lineHeight:1.2}}>{titulo}</div>
          {subtitulo&&<div style={{fontSize:11,color:T.textSecondary,marginTop:4,letterSpacing:"0.01em"}}>{subtitulo}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function Diagnostico() {
  const {id} = useParams();
  const navigate = useNavigate();
  const [cliente,setCliente] = useState(null);
  const [carregou,setCarregou] = useState(false);

  useEffect(()=>{
    async function carregar() {
      const s = await getDoc(doc(db,"clientes",id));
      if(s.exists()) setCliente({id:s.id,...s.data()});
      setCarregou(true);
    }
    carregar();
  },[id]);

  if(!carregou) return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.fontFamily}}>
      <div style={{fontSize:13,color:T.textMuted}}>Analisando perfil...</div>
    </div>
  );

  if(!cliente) return (
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.fontFamily}}>
      <div style={{fontSize:13,color:T.textMuted}}>Cliente não encontrado.</div>
    </div>
  );

  const a = analisar(cliente);
  const altos = a.insights.filter(i=>i.nivel==="alto").length;
  const medios = a.insights.filter(i=>i.nivel==="medio").length;

  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:T.fontFamily}}>
      <Navbar
        actionButtons={[
          {label:"Editar cadastro",variant:"secondary",onClick:()=>navigate(`/cliente/${id}`)},
          {label:"Ver dashboard",variant:"primary",onClick:()=>navigate(`/cliente/${id}`)},
        ]}
      />

      <button
        onClick={()=>navigate(`/cliente/${id}`)}
        style={{
          position:"fixed",top:"50%",left:16,transform:"translateY(-50%)",
          width:44,height:44,borderRadius:22,
          background:"rgba(240,162,2,0.15)",border:"1px solid rgba(240,162,2,0.3)",
          color:"#F0A202",fontSize:20,cursor:"pointer",zIndex:50,
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:"0 4px 12px rgba(0,0,0,0.3)",
        }}
      >
        ←
      </button>

      <div style={{maxWidth:960,margin:"0 auto",padding:"36px 32px 80px"}}>

        {/* HERO — Identidade + KPIs + contador */}
        <div style={{
          background:"linear-gradient(135deg,rgba(36,55,83,0.92) 0%,rgba(20,31,51,0.96) 55%,rgba(13,19,33,0.98) 100%)",
          border:"0.5px solid rgba(240,162,2,0.25)",
          borderRadius:22,padding:"28px 26px 24px",marginBottom:18,
          boxShadow:"0 20px 60px -20px rgba(0,0,0,0.7)",
          position:"relative",overflow:"hidden",
        }}>
          <div style={{position:"absolute",top:-120,right:-120,width:340,height:340,background:"radial-gradient(circle,rgba(240,162,2,0.12) 0%,transparent 65%)",pointerEvents:"none",filter:"blur(10px)"}}/>
          <div style={{position:"absolute",bottom:-140,left:-100,width:360,height:360,background:"radial-gradient(circle,rgba(25,130,196,0.08) 0%,transparent 65%)",pointerEvents:"none",filter:"blur(10px)"}}/>

          <div style={{position:"relative",display:"flex",alignItems:"flex-start",gap:18,marginBottom:22,flexWrap:"wrap"}}>
            <div style={{position:"relative",flexShrink:0}}>
              <div style={{position:"absolute",inset:-4,borderRadius:18,background:"linear-gradient(135deg,rgba(240,162,2,0.35),rgba(240,162,2,0.02))",filter:"blur(12px)",opacity:0.55,pointerEvents:"none"}}/>
              <AvatarIcon tipo={cliente.avatar} size={72}/>
            </div>
            <div style={{flex:1,minWidth:240}}>
              <div style={{fontSize:10,color:"#F0A202",textTransform:"uppercase",letterSpacing:"0.2em",marginBottom:6,fontWeight:500,...noEdit}}>Diagnóstico Financeiro</div>
              <div style={{fontSize:24,fontWeight:300,color:T.textPrimary,letterSpacing:"-0.02em",lineHeight:1.15,marginBottom:6}}>
                {cliente.nome||"Cliente"}
              </div>
              <div style={{fontSize:12,color:T.textSecondary,letterSpacing:"0.01em",lineHeight:1.6}}>
                {[a.idade?`${a.idade} anos`:null,cliente.profissao,cliente.cidade&&cliente.uf?`${cliente.cidade} · ${cliente.uf.split("–")[0].trim()}`:cliente.uf].filter(Boolean).join(" · ")}
              </div>
            </div>
            {/* Score circular */}
            <div style={{flexShrink:0}}>
              <ScoreCircle score={a.scoreTotal}/>
            </div>
          </div>

          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
            <MiniKPI label="Renda/mês" valor={a.salario>0?moedaFull(a.salario):"—"}/>
            <MiniKPI label="Gastos/mês" valor={a.gastos>0?moedaFull(a.gastos):"—"} cor={a.gastos>a.salario&&a.salario>0?"#ef4444":T.textPrimary}/>
            <MiniKPI label="Aporte médio" valor={a.aporteMedio>0?moedaFull(a.aporteMedio):"—"} cor="#22c55e"/>
            <MiniKPI label="Patrimônio total" valor={a.patrimonioTotal>0?formatMi(a.patrimonioTotal):"—"} cor="#F0A202"/>
          </div>

          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:130,padding:"10px 14px",background:"rgba(239,68,68,0.08)",border:"0.5px solid rgba(239,68,68,0.28)",borderRadius:12}}>
              <div style={{fontSize:9,color:"#fca5a5",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,fontWeight:500,...noEdit}}>Alta prioridade</div>
              <div style={{fontSize:20,fontWeight:400,color:"#ef4444"}}>{altos}</div>
            </div>
            <div style={{flex:1,minWidth:130,padding:"10px 14px",background:"rgba(245,158,11,0.08)",border:"0.5px solid rgba(245,158,11,0.28)",borderRadius:12}}>
              <div style={{fontSize:9,color:"#fcd34d",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,fontWeight:500,...noEdit}}>Atenção</div>
              <div style={{fontSize:20,fontWeight:400,color:"#f59e0b"}}>{medios}</div>
            </div>
            <div style={{flex:1,minWidth:130,padding:"10px 14px",background:"rgba(34,197,94,0.08)",border:"0.5px solid rgba(34,197,94,0.28)",borderRadius:12}}>
              <div style={{fontSize:9,color:"#86efac",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:5,fontWeight:500,...noEdit}}>Oportunidades</div>
              <div style={{fontSize:20,fontWeight:400,color:"#22c55e"}}>{a.insights.length-altos-medios}</div>
            </div>
          </div>
        </div>

        {/* ═══ SCORE DETALHADO ═══ */}
        <SectionCard icon="🧭" titulo="Score Financeiro por Área" subtitulo="Notas baseadas em padrões CFP/Ancord — pontos fortes e gaps" accent="#F0A202">
          {a.scores.map(s=><ScoreBar key={s.label} {...s}/>)}
        </SectionCard>

        {/* ═══ MAGIC NUMBER — LIBERDADE FINANCEIRA ═══ */}
        {a.magicNumber>0&&(
          <SectionCard icon="💎" titulo="Número da Liberdade Financeira" subtitulo="Regra dos 4% (Trinity Study) adaptada ao Brasil — quanto você precisa ter para viver de renda para sempre" accent="#F0A202">
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",gap:14,marginBottom:18}}>
              <div style={{padding:"14px 16px",background:"rgba(240,162,2,0.08)",border:"0.5px solid rgba(240,162,2,0.25)",borderRadius:12}}>
                <div style={{fontSize:9,color:"#fcd34d",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8,fontWeight:500}}>Seu Magic Number</div>
                <div style={{fontSize:22,fontWeight:400,color:"#F0A202",letterSpacing:"-0.01em"}}>{formatMi(a.magicNumber)}</div>
                <div style={{fontSize:10,color:T.textMuted,marginTop:6}}>Patrimônio-alvo para liberdade</div>
              </div>
              <div style={{padding:"14px 16px",background:"rgba(255,255,255,0.02)",border:`0.5px solid ${T.border}`,borderRadius:12}}>
                <div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8,fontWeight:500}}>Progresso Atual</div>
                <div style={{fontSize:22,fontWeight:400,color:T.textPrimary}}>{a.pctLiberdade.toFixed(1)}%</div>
                <div style={{fontSize:10,color:T.textMuted,marginTop:6}}>{formatMi(a.patrimonioFinanceiro)} de {formatMi(a.magicNumber)}</div>
              </div>
              {a.idadeLiberdade&&(
                <div style={{padding:"14px 16px",background:"rgba(34,197,94,0.06)",border:"0.5px solid rgba(34,197,94,0.25)",borderRadius:12}}>
                  <div style={{fontSize:9,color:"#86efac",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8,fontWeight:500}}>Idade de Liberdade</div>
                  <div style={{fontSize:22,fontWeight:400,color:"#22c55e"}}>{a.idadeLiberdade.toFixed(0)} anos</div>
                  <div style={{fontSize:10,color:T.textMuted,marginTop:6}}>Em ~{a.anosParaLiberdade?.toFixed(1)} anos no ritmo atual</div>
                </div>
              )}
            </div>
            <ProgressoMagic pct={a.pctLiberdade} cor="#F0A202"/>
            <div style={{fontSize:11,color:T.textMuted,marginTop:12,lineHeight:1.6,letterSpacing:"0.01em"}}>
              Cálculo: gastos anuais × 20 (retorno real 5% a.a. sustentável no longo prazo). Este é o patrimônio que, investido com disciplina, gera renda suficiente para cobrir seu custo de vida indefinidamente.
            </div>
          </SectionCard>
        )}

        {/* ═══ PROJEÇÃO DE APOSENTADORIA ═══ */}
        {a.idade&&a.anosAte60>0&&(
          <SectionCard icon="🌴" titulo={`Projeção aos ${a.idadeDesejadaAposentar} anos`} subtitulo={`Patrimônio + aporte + rentabilidade real em ${a.anosAte60} anos (${a.rentReal.toFixed(1)}% a.a. real)`} accent="#22c55e">
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(170px, 1fr))",gap:14}}>
              <div style={{padding:"14px 16px",background:"rgba(255,255,255,0.02)",border:`0.5px solid ${T.border}`,borderRadius:12}}>
                <div style={{fontSize:9,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8,fontWeight:500}}>Patrimônio Hoje</div>
                <div style={{fontSize:18,fontWeight:400,color:T.textPrimary}}>{formatMi(a.patrimonioFinanceiro)}</div>
              </div>
              <div style={{padding:"14px 16px",background:"rgba(34,197,94,0.06)",border:"0.5px solid rgba(34,197,94,0.22)",borderRadius:12}}>
                <div style={{fontSize:9,color:"#86efac",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8,fontWeight:500}}>Patrimônio aos {a.idadeDesejadaAposentar}</div>
                <div style={{fontSize:18,fontWeight:400,color:"#22c55e"}}>{formatMi(a.patAos60)}</div>
              </div>
              <div style={{padding:"14px 16px",background:"rgba(240,162,2,0.06)",border:"0.5px solid rgba(240,162,2,0.22)",borderRadius:12}}>
                <div style={{fontSize:9,color:"#fcd34d",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8,fontWeight:500}}>Renda Passiva Estimada</div>
                <div style={{fontSize:18,fontWeight:400,color:"#F0A202"}}>{moedaFull(a.rendaPassivaAos60)}/mês</div>
              </div>
            </div>
            {a.gastos>0&&(
              <div style={{marginTop:14,padding:"12px 14px",background:a.rendaPassivaAos60>=a.gastos?"rgba(34,197,94,0.06)":"rgba(239,68,68,0.06)",border:`0.5px solid ${a.rendaPassivaAos60>=a.gastos?"rgba(34,197,94,0.25)":"rgba(239,68,68,0.25)"}`,borderRadius:10}}>
                <div style={{fontSize:11,color:a.rendaPassivaAos60>=a.gastos?"#86efac":"#fca5a5",lineHeight:1.6,letterSpacing:"0.01em"}}>
                  {a.rendaPassivaAos60>=a.gastos
                    ? `✅ Renda passiva (${moedaFull(a.rendaPassivaAos60)}) supera gastos atuais (${moedaFull(a.gastos)}). Rota segura.`
                    : `⚠ Gap mensal: ${moedaFull(a.gastos-a.rendaPassivaAos60)}. Precisamos ajustar: aportar mais, render mais ou postergar aposentadoria.`}
                </div>
              </div>
            )}
          </SectionCard>
        )}

        {/* ═══ DISTRIBUIÇÃO PATRIMONIAL ═══ */}
        {a.distribuicao.length>0&&(
          <SectionCard icon="🏛️" titulo="Distribuição Patrimonial" subtitulo={`Total: ${formatMi(a.patrimonioTotal)} — peso de cada categoria no patrimônio`} accent="#60a5fa">
            <DistBar items={a.distribuicao} total={a.patrimonioTotal}/>
          </SectionCard>
        )}

        {/* ═══ PROTEÇÃO PATRIMONIAL ═══ */}
        <SectionCard icon="🛡️" titulo="Blindagem Patrimonial" subtitulo="Proteções essenciais para sua família e patrimônio" accent="#a78bfa">
          <ProtecaoItem label="Reserva de emergência" ok={a.protecoes.reserva} desc={`Ideal: ${moedaFull(a.reservaIdeal)} em liquidez`}/>
          <ProtecaoItem label="Seguro de veículos" ok={a.protecoes.seguroCarro} desc="Proteção contra sinistros"/>
          <ProtecaoItem label="Seguro de vida" ok={a.protecoes.seguroVida} desc="Proteção para dependentes"/>
          <ProtecaoItem label="Planejamento sucessório" ok={a.protecoes.sucessao} desc="Evita ITCMD + inventário caro"/>
        </SectionCard>

        {/* ═══ INSIGHTS ═══ */}
        {a.insights.length>0&&(
          <>
            <div style={{fontSize:10,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.18em",marginTop:24,marginBottom:14,fontWeight:500,...noEdit}}>
              Insights Personalizados ({a.insights.length})
            </div>
            {a.insights.map((ins,i)=>{
              const n = NIVEIS[ins.nivel];
              return (
                <div key={i} style={{background:n.bg,border:`0.5px solid ${n.borda}`,borderRadius:16,padding:"18px 20px",marginBottom:12,position:"relative",overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
                    <div style={{fontSize:28,flexShrink:0,lineHeight:1}}>{ins.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                        <span style={{fontSize:8,padding:"3px 8px",borderRadius:20,background:`${n.cor}22`,color:n.cor,letterSpacing:"0.1em",fontWeight:600,...noEdit}}>{n.label}</span>
                      </div>
                      <div style={{fontSize:15,fontWeight:500,color:T.textPrimary,marginBottom:8,letterSpacing:"-0.01em",lineHeight:1.3}}>{ins.titulo}</div>
                      <div style={{fontSize:12,color:T.textSecondary,lineHeight:1.65,marginBottom:10,letterSpacing:"0.01em"}}>{ins.texto}</div>
                      <div style={{fontSize:11,color:n.cor,fontWeight:500,letterSpacing:"0.01em",lineHeight:1.5,borderLeft:`2px solid ${n.cor}`,paddingLeft:10}}>
                        → {ins.cta}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ═══ PLANO 90 DIAS ═══ */}
        {a.plano90.length>0&&(
          <SectionCard icon="📋" titulo="Plano de Ação: Próximos 90 Dias" subtitulo="Roadmap priorizado para tirar seu planejamento do papel" accent="#ec4899">
            {a.plano90.map((p,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:14,padding:"12px 0",borderBottom:i<a.plano90.length-1?`0.5px solid ${T.border}`:"none"}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(236,72,153,0.1)",border:"0.5px solid rgba(236,72,153,0.35)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#ec4899",fontWeight:500,flexShrink:0,...noEdit}}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:9,color:"#f9a8d4",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:3,fontWeight:500,...noEdit}}>{p.prazo}</div>
                  <div style={{fontSize:13,color:T.textPrimary,lineHeight:1.5,letterSpacing:"0.01em"}}>{p.acao}</div>
                </div>
              </div>
            ))}
          </SectionCard>
        )}

        {/* ═══ CTA FINAL ═══ */}
        <div style={{
          marginTop:24,background:"linear-gradient(135deg,rgba(240,162,2,0.12),rgba(240,162,2,0.02))",
          border:"0.5px solid rgba(240,162,2,0.35)",borderRadius:18,padding:"26px 22px",textAlign:"center",
        }}>
          <div style={{fontSize:20,fontWeight:500,color:T.textPrimary,marginBottom:8,letterSpacing:"-0.01em"}}>
            Gostou do diagnóstico? Vamos fundo.
          </div>
          <div style={{fontSize:12,color:T.textSecondary,marginBottom:20,lineHeight:1.65,letterSpacing:"0.01em",maxWidth:540,margin:"0 auto 20px"}}>
            Para aprofundar, o próximo passo é <b style={{color:"#F0A202"}}>mapear sua carteira de investimentos</b> em detalhe. Depois, se fizer sentido, cadastramos <b style={{color:"#60a5fa"}}>gastos e ganhos mensais da família</b> — aí montamos o planejamento completo, caixinha por caixinha.
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            <button onClick={()=>navigate(`/cliente/${id}/carteira`)} style={{padding:"13px 24px",background:"rgba(240,162,2,0.15)",border:"0.5px solid rgba(240,162,2,0.45)",borderRadius:10,color:"#F0A202",fontSize:12,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.1em",fontWeight:500,textTransform:"uppercase"}}>
              1 · Cadastrar carteira
            </button>
            <button onClick={()=>navigate(`/cliente/${id}/fluxo`)} style={{padding:"13px 24px",background:"rgba(96,165,250,0.10)",border:"0.5px solid rgba(96,165,250,0.35)",borderRadius:10,color:"#60a5fa",fontSize:12,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.1em",fontWeight:500,textTransform:"uppercase"}}>
              2 · Fluxo mensal
            </button>
            <button onClick={()=>navigate(`/cliente/${id}/objetivos`)} style={{padding:"13px 24px",background:"rgba(34,197,94,0.10)",border:"0.5px solid rgba(34,197,94,0.35)",borderRadius:10,color:"#22c55e",fontSize:12,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.1em",fontWeight:500,textTransform:"uppercase"}}>
              3 · Montar objetivos
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
