# 🚀 Guia de Uso Rápido - Melhorias ClienteFicha v3.3

---

## 📱 Como Usar Cada Nova Funcionalidade

### 1️⃣ Formatação de Aporte em Tempo Real

**Cenário:** Registrar quanto o cliente aportou este mês

**Passo a Passo:**
1. Na seção "Acompanhamento Mensal de Aporte", clique no botão **"Aportou"**
2. Uma modal aparecerá com o título "Valor aportado"
3. **Digite os números do aporte** enquanto vê o formato em tempo real:
   - Digita: `2` → Vê: `R$ 0,02`
   - Digita: `20` → Vê: `R$ 0,20`
   - Digita: `200` → Vê: `R$ 2,00`
   - Digita: `2000` → Vê: `R$ 20,00`
4. Clique em "Confirmar"
5. Valor é salvo e exibido na seção "Aporte registrado este mês"

**Dica:** Se errar, clique "Cancelar" e tente de novo.

---

### 2️⃣ Registrar "Não Aportou"

**Cenário:** O cliente não aportou este mês, você quer agendar próximo contato

**Passo a Passo:**
1. Na seção "Acompanhamento Mensal de Aporte", clique em **"Não aportou"**
2. Uma modal laranja aparecerá com título "Cliente sem aporte"
3. **Selecione a data do próximo contato:**
   - Use o seletor de data que aparece
   - Ou digite manualmente em formato DD/MM/AAAA
4. Clique "Confirmar"
5. Data é salva em "Próx. contato" e você vê mensagem de confirmação

**Resultado:** 
- Status passa para "Não aportou" (botão fica vermelho)
- Data fica salva para follow-up
- Próxima vez que abrir a ficha, data estará lá

---

### 3️⃣ Visualizar Próximo Contato Alinhado

**Cenário:** Ver de forma clara quando você deve contatar o cliente

**O Que Mudou:**
- O campo "Próx. contato" agora tem **altura uniforme** (42px)
- **Fica alinhado perfeitamente** com os botões "Aportou" e "Não aportou"
- Mostra placeholder: "DD/MM/AAAA" para facilitar entrada

**Como Usar:**
1. Clique no campo de data
2. Digite a data ou selecione via date picker
3. Campo mostra data no formato brasileiro
4. Data é salva automaticamente

---

### 4️⃣ Planejamento Financeiro Mensal

**Cenário:** Entender a saúde financeira do cliente mês a mês

**Os 3 Campos:**

#### 📊 Salário Mensal
- **O quê:** Quanto o cliente ganha por mês
- **Como preencher:** Digite ou edite o valor
- **Formato:** Aceita números, calcula automaticamente em moeda
- **Exemplo:** Digite `5000` vê `R$ 5.000,00`

#### 💳 Despesas Mensais
- **O quê:** Total gasto pelo cliente por mês
- **Como preencher:** Normalmente sincroniza com FluxoMensal
- **Nota:** Diz "(Puxado do Fluxo Mensal)" indicando origem
- **Fallback:** Se não houver dados do FluxoMensal, você pode editar manualmente
- **Exemplo:** `R$ 3.000,00`

#### 🎯 Meta de Aporte/Mês
- **O quê:** Quanto ele deveria aportar por mês (objetivo)
- **Como preencher:** Digite o valor desejado
- **Impacto:** Afeta o cálculo "Vs. Meta"
- **Exemplo:** `R$ 1.000,00`

---

### 5️⃣ Resumo Mensal (Calculado Automaticamente)

**Cenário:** Ver análise rápida da capacidade financeira

**Exemplo Real:**
```
Salário Mensal:   R$ 5.000,00
Despesas Mensais: R$ 3.000,00
Meta de Aporte:   R$ 1.000,00
Aporte Este Mês:  R$ 800,00

RESULTADO:
┌─────────────────────────────────────┐
│ SOBRA MENSAL       │ VS. META      │ ESTE MÊS   │
│ R$ 2.000,00 (azul)│R$ 1.000,00(V)|R$ 800,00(V)│
└─────────────────────────────────────┘
```

**Interpretação:**
- **Sobra Mensal (R$ 2.000,00):** Salário - Despesas = 5000 - 3000
  - Cliente tem R$ 2.000 disponíveis após despesas
  
- **Vs. Meta (R$ 1.000,00):** Sobra - Meta = 2000 - 1000
  - Após aportar a meta (R$ 1.000), ainda sobram R$ 1.000
  - Verde = Cliente está atingindo a meta ✅
  
- **Este Mês (R$ 800,00):** Valor real aportado
  - Mostra o que ele realmente aportou (R$ 800)
  - Um pouco abaixo da meta, mas ok

---

### 6️⃣ Calendário de Aportes/Resgates

**Cenário:** Ver visualmente quais meses o cliente aportou ou resgatou

**Como Funciona:**

```
JAN    FEV    MAR    ABR    MAI    JUN
[verde] [cinza] [verm] [cinza] [verde] [cinza]
↑Aport         ↓Resga        ↑Aport
```

**Cores:**
- 🟢 **Verde:** Mês com aporte (↑ Aporte)
- 🔴 **Vermelho:** Mês com resgate (↓ Resgate)
- ⚪ **Cinza:** Nenhuma movimentação
- **Mês atual tem borda:** Destaque especial

**Como Interpretar:**
- Cliente aportou em Janeiro e Maio
- Cliente resgatou em Março
- Nenhuma movimento em Fevereiro, Abril, Junho

**Integração:**
- Dados virão de **Carteira.jsx** quando salvar movimentações
- Será atualizado automaticamente
- Mostra últimos 12 meses

---

### 7️⃣ Previsão de Gastos Anuais

**Cenário:** Entender quanto o cliente gasta por ano

**Como Funciona:**
```
Despesas Mensais: R$ 3.000,00
×12 meses
= R$ 36.000,00/ano
```

**Visual:**
- Box com fundo **vermelho claro**
- Número **grande (fontSize 28)** em vermelho
- Texto explicativo: "Calculado automaticamente"

**Uso:**
- Ajuda planejar investimentos anuais
- Mostra quanto ele "não terá" disponível
- Útil para análise de risco

**Exemplo:**
Se despesas são R$ 3.000/mês, no ano são R$ 36.000
→ Isso é R$ 36.000 que não pode ir para investimentos

---

## 🔄 Fluxo Completo de Aporte

**Dia 5 do mês: Cliente aporta R$ 1.500**

```
1. Você acessa: Dashboard → Clique no cliente
                ↓
2. ClienteFicha abre, seção "Acompanhamento Mensal"
                ↓
3. Clica em "Aportou"
                ↓
4. Modal aparece: "Valor aportado"
                ↓
5. Digita: 1500
   Vê: R$ 15,00 → R$ 150,00 → R$ 1.500,00
                ↓
6. Clica "Confirmar"
                ↓
7. Modal fecha, vê mensagem "Aporte confirmado"
                ↓
8. Seção "Aporte registrado este mês" mostra:
   "Aporte registrado este mês: R$ 1.500,00" (verde)
                ↓
9. Cálculos atualizam automaticamente:
   - Sobra Mensal: R$ 3.500,00
   - Vs. Meta: R$ 2.500,00 (se meta é 1.000)
   - Este Mês: R$ 1.500,00 (verde, pois atingiu meta)
                ↓
10. Clica "Salvar" no final da página
                ↓
11. Dados salvos em Firestore
                ↓
12. Próxima abertura da ficha: valores estão lá ✅
```

---

## 🔄 Fluxo Completo de "Não Aportou"

**Dia 30 do mês: Cliente não aportou**

```
1. Você acessa: Dashboard → Clique no cliente
                ↓
2. ClienteFicha abre, seção "Acompanhamento Mensal"
                ↓
3. Clica em "Não aportou"
                ↓
4. Modal laranja aparece: "Cliente sem aporte"
   Com mensagem: "Quando será o próximo contato?"
                ↓
5. Seleciona data: 15/05/2026 (via date picker)
                ↓
6. Clica "Confirmar"
                ↓
7. Modal fecha, vê mensagem:
   "Próximo contato marcado para 15/05/2026.
    Cliente sem aporte este mês."
                ↓
8. Status muda:
   - Botão "Não aportou" fica vermelho ✓
   - Campo "Próx. contato" mostra: 15/05/2026
                ↓
9. Seção "Aporte registrado este mês" não aparece
   (porque não aportou)
                ↓
10. Cálculos mostram "Sem aporte" em vermelho
                ↓
11. Clica "Salvar"
                ↓
12. Dados salvos, você tem lembrete: 15/05 → contato
```

---

## 📋 Modo Editar vs. Modo Ver

### Modo Ver (Padrão)
```
Salário mensal:
  R$ 5.000,00 (texto apenas, não editável)

Planejamento Financeiro:
  Exibe: RESUMO MENSAL (cálculos automáticos)
         - Sobra Mensal
         - Vs. Meta
         - Este Mês
```

### Modo Editar (Clique em "Editar")
```
Salário mensal:
  [INPUT] ← Você digita aqui

Planejamento Financeiro:
  - 3 campos editáveis (Salário, Despesas, Meta)
  - Resumo Mensal some (aparece só em Modo Ver)
  - Você pode mudar todos os valores
  - Clique "Salvar" para confirmar

Clique "Cancelar" para voltar sem salvar
```

---

## ⚠️ Casos Especiais

### E se eu não preencher "Salário Mensal"?
- Campo "Sobra Mensal" mostra: `—` (travessão)
- "Vs. Meta" também mostra: `—`
- Previsão de Gastos Anuais continua funcionando

### E se eu não tiver dados do FluxoMensal?
- "Despesas Mensais" fica com placeholder: `—`
- Você pode editar manualmente
- Quando FluxoMensal sincronizar, atualiza automaticamente

### E se eu errar o valor do aporte?
1. Clique em "Aportou" novamente
2. Digite o valor correto
3. Clique "Confirmar"
4. Valor antigo é substituído

### E se o cliente aporta 2 vezes no mês?
- Atualmente: último aporte sobrescreve o anterior
- Solução futura: integrar com Carteira para histórico completo
- Por enquanto: registre o **aporte total do mês**

---

## 🎓 Dicas de Uso

✅ **Preencha sempre a meta de aporte**
- Ajuda você a medir performance
- Sistema mostra se está no verde ou vermelho

✅ **Use "Não Aportou" para marcar follow-ups**
- Próximo contato fica registrado
- Você não esquece de contatar

✅ **Sincronize com FluxoMensal**
- Peça para preencher o FluxoMensal
- Despesas vêm automaticamente
- Economia de tempo

✅ **Revise mensalmente**
- Abra a ficha todo mês
- Registre aporte ou "não aportou"
- Veja tendências no Calendário de Aportes

✅ **Use o Resumo Mensal para conversa com cliente**
- Mostre a Sobra Mensal
- Explique por que a Meta é importante
- Negocie metas realistas

---

## 🔗 Integração com Outros Módulos

### FluxoMensal
- **Automatiza:** Despesas Mensais
- **Quando:** FluxoMensal.jsx salva dados
- **Resultado:** ClienteFicha atualiza em tempo real

### Carteira
- **Alimenta:** Calendário de Aportes
- **Quando:** Carteira.jsx registra movimentações
- **Resultado:** Cores verde/vermelho nos meses

### Dashboard
- **Acesso:** Link no cliente
- **Volta:** Clique no logo "P" na navbar
- **Sincronização:** Dados salvos em Firestore

---

## ❓ FAQ Rápido

**P: Meu cliente aportou ontem, onde registro?**
A: Dashboard → Cliente → "Aportou" → Modal → Digite valor → Salvar

**P: Como vejo se o cliente está atingindo a meta?**
A: Modo Ver → Planejamento Financeiro → Resumo Mensal → Verde=Sim, Amarelo=Não

**P: Posso mudar a meta durante o mês?**
A: Sim! Clique "Editar" → Mude "Meta de aporte/mês" → "Salvar"

**P: Os dados salvam automaticamente?**
A: Não, clique "Salvar" no final da página

**P: Posso ver histórico de aportes?**
A: Sim! Calendário de Aportes mostra últimos 12 meses (quando Carteira integrar)

---

## 📞 Suporte

Dúvidas sobre:
- **Formatação:** Ver `formatarValorAporte()` em ClienteFicha.jsx:225
- **Cálculos:** Ver Resumo Mensal em ClienteFicha.jsx:603
- **Calendário:** Ver CalendarioAportes em ClienteFicha.jsx:313
- **Integração:** Ver documentos MELHORIAS_CLIENTE_FICHA.md e TESTE_COMPLETO_MELHORIAS.md

---

**Versão:** 3.3 | Data: 2026-04-14 | Status: ✅ Pronto para Produção

