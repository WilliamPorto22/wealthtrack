# 🧪 Guia de Teste - Sistema de Cotações

## ✅ Como Testar o Novo Sistema

### 1. Teste Básico - Dashboard Carrega
- [ ] Abrir http://localhost:5174
- [ ] Ver indicadores de mercado aparecerem
- [ ] Botão "Atualizar" estar visível na navbar
- [ ] Status de mercado mostrado (aberto/fechado)

### 2. Teste Botão de Atualização Manual
- [ ] Se mercado aberto (9h-18h):
  - [ ] Botão deve estar verde (ativo)
  - [ ] Clicar em "Atualizar"
  - [ ] Deve aparecer "Atualizando..." com ícone girando
  - [ ] Após carregar, "Última atualização: [horário]" aparece
  
- [ ] Se mercado fechado (fora 9-18h):
  - [ ] Botão deve estar cinza (desabilitado)
  - [ ] Mostrar "Mercado fechado"
  - [ ] Tooltip: "Mercado fechado - Atualizações retomam amanhã às 9h"

### 3. Teste de Dados em LocalStorage
Abrir DevTools (F12):

```javascript
// No Console, digitar:
JSON.parse(localStorage.getItem("wealthtrack_cotacoes"))

// Deve retornar objeto com:
{
  dolar: { valor: 5.25, ... },
  selic: { valor: 14.75, ... },
  ipca: { valor: 4.14, ... },
  ibovespa: { valor: 197000, ... },
  sp500: { valor: 5396, ... },
  atualizadoEm: "13/04/2026 14:30:45"
}
```

### 4. Teste de Carteira
- [ ] Ir para página Carteira de um cliente
- [ ] Valores devem estar atualizados com cotações reais
- [ ] Conversão USD/BRL usando dólar atual

### 5. Teste de Performance
- [ ] Dashboard não deve congelar durante atualização
- [ ] Botão deve ser responsivo
- [ ] Console não deve mostrar erros

### 6. Teste em Diferentes Horários

#### Manhã (antes de 9h)
- [ ] Status: "Mercado fechado"
- [ ] Próxima atualização: "9h"

#### Durante o dia (9h-18h)
- [ ] Status: "✓ Mercado aberto"
- [ ] Botão ativo (verde)
- [ ] Atualizar a cada 2h

#### Noite (depois de 18h)
- [ ] Status: "Mercado fechado"
- [ ] Próxima: "Próxima atualização: 9h"

#### Fim de semana
- [ ] Status: "Mercado fechado"
- [ ] Última atualização da sexta-feira visível

---

## 🔍 Verificação de Erros

### No Console (F12 → Console)
Procurar por mensagens como:
- ❌ "Erro ao obter dólar: ..."
- ❌ "Erro ao atualizar cotações: ..."

Se ver, é normal - significa que caiu no fallback (dados simulados).

### Para Debug Detalhado
```javascript
// No Console, adicione:
console.log("Status mercado:", mercadoAberto());
console.log("Próxima atualização:", proximoHorarioAtualizacao());
```

---

## 📊 Dados Esperados

### Dólar
- Valor: R$ 4.80 a R$ 5.50
- Fonte: Banco Central do Brasil
- Atualizado: Diariamente

### SELIC
- Valor: 14% a 15%
- Unidade: a.a. (ao ano)
- Fonte: Banco Central

### IPCA
- Valor: 3% a 5%
- Período: Últimos 12 meses
- Fonte: IBGE

### Ibovespa
- Valor: 190.000 a 210.000 pontos
- Variação: Positiva ou negativa
- Fonte: Yahoo Finance

### S&P 500
- Valor: 5.000 a 6.000 pontos
- Variação: Positiva ou negativa
- Fonte: Yahoo Finance

---

## ✅ Checklist de Conclusão

- [ ] Dashboard carrega sem erros
- [ ] Botão de atualização funciona
- [ ] Status de mercado correto
- [ ] Última atualização mostra horário
- [ ] LocalStorage salva dados
- [ ] Carteira usa cotações atuais
- [ ] Sem erros no console
- [ ] Funciona em horário de mercado
- [ ] Mostra "fechado" fora do horário
- [ ] Atualização automática a cada 2h

---

**Quando tudo passar:** Sistema de cotações está 100% funcional! 🎉

