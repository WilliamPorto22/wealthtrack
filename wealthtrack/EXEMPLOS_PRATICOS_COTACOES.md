# 📚 Exemplos Práticos - Sistema de Cotações

## 1️⃣ Exemplo: Carregamento do Dashboard

### O Que Acontece
```
1. Usuário abre Dashboard (14:45)
2. App verifica: mercadoAberto() → true (entre 9h-18h)
3. Chamada: obterTodasAsCotacoes()
4. APIs retornam:
   - Dólar: R$ 5.25 (BC Brasil)
   - SELIC: 14.75% a.a. (BC Brasil)
   - IPCA: 4.14% (IBGE - últimos 12 meses)
   - Ibovespa: 197.450 pontos (+21% no ano)
   - S&P 500: 5.396 pontos (+10% no ano)
5. Dados salvos em localStorage
6. Dashboard exibe indicadores
7. Próxima atualização agendada para: 16:45
```

### O Dashboard Mostra
```
┌─ STATUS ────────────────────────────┐
│ ✓ Mercado aberto (9h-18h)          │
│ Última atualização: 14:45:32       │
└─────────────────────────────────────┘

┌─────────┬─────────┬────────┬──────────┬─────────┐
│ DÓLAR   │ SELIC   │ IPCA   │IBOVESPA  │ S&P 500 │
│ R$ 5,25 │ 14,75%  │ 4,14%  │ 197.450  │ 5.396   │
│ Banco C │ a.a.    │12 meses│ +21% ano │+10% ano │
└─────────┴─────────┴────────┴──────────┴─────────┘

[↻ Atualizar]  ← Botão para atualizar manualmente
```

---

## 2️⃣ Exemplo: Cálculo de Carteira

### Cliente: João Silva
```
Patrimônio em Investimentos:

├─ Tesouro Direto (Pré-fixado)
│  └─ R$ 50.000,00
│
├─ Ações Petrobras
│  └─ 100 ações × R$ 28,50 = R$ 2.850,00
│
├─ Fundo Imobiliário (FII)
│  └─ 500 cotas × R$ 85,00 = R$ 42.500,00
│
└─ Investimento em ETF S&P 500
   └─ 10 cotas × R$ 500 USD/cota
   └─ 10 × 500 × R$ 5,25 (Dólar atual) = R$ 26.250,00

TOTAL: R$ 50.000 + R$ 2.850 + R$ 42.500 + R$ 26.250 = R$ 121.600,00
```

**Quando Dólar Muda:**
- Antes: 1 USD = R$ 5,00 → ETF = R$ 25.000
- Depois: 1 USD = R$ 5,25 → ETF = R$ 26.250
- **Aumento no patrimônio:** R$ 1.250 (automático!)

---

## 3️⃣ Exemplo: Atualização Automática Durante o Dia

### Linha do Tempo (Dia 13 de Abril, Sexta)

```
09:00 → Mercado abre
        Dashboard: ✓ Mercado aberto
        Atualiza cotações
        Próxima: 11:00
        
11:00 → Atualização automática
        Dólar: R$ 5,25 → R$ 5,27 (↑)
        Ibovespa: 197.450 → 197.850 (↑)
        
13:00 → Atualização automática
        Dólar: R$ 5,27 → R$ 5,24 (↓)
        SELIC: 14,75% (→ sem mudança)
        
15:00 → Atualização automática
        S&P 500: 5.396 → 5.420 (↑)
        
17:00 → Atualização automática
        Última do dia
        
18:00 → Mercado fecha
        Dashboard: Mercado fechado
        Próxima: 09:00 (segunda)
        (Sem atualizações até segunda)
        
18:45 → Usuário clica "Atualizar"
        Botão desabilitado (cinza)
        Mostra: "Mercado fechado - Retoma amanhã às 9h"
```

---

## 4️⃣ Exemplo: Fim de Semana

### Sábado, 14 de Abril

```
Sistema verifica: mercadoAberto()
├─ É sábado? SIM
├─ Entre 9h-18h? NÃO IMPORTA
└─ Resultado: MERCADO FECHADO

Dashboard mostra:
┌─────────────────────────────────────┐
│ Mercado fechado · Próxima: 09:00    │
│ Última atualização: 17:00 (Sexta)   │
└─────────────────────────────────────┘

Botão "Atualizar" fica cinza (desabilitado)

Dados mostrados: Última cotação de sexta-feira
```

---

## 5️⃣ Exemplo: Verificação Manual de LocalStorage

### No Console do Navegador (F12)

```javascript
// Verificar dados salvos
JSON.parse(localStorage.getItem("wealthtrack_cotacoes"))

// Resultado esperado:
{
  dolar: {
    valor: 5.25,
    data: "13/04/2026",
    fonte: "Banco Central do Brasil"
  },
  selic: {
    valor: 14.75,
    data: "13/04/2026",
    unidade: "a.a.",
    fonte: "Banco Central do Brasil"
  },
  ipca: {
    valor: 4.14,
    data: "12 meses",
    fonte: "IBGE"
  },
  ibovespa: {
    valor: 197450,
    variacao: 21,
    data: "13/04/2026",
    fonte: "Yahoo Finance"
  },
  sp500: {
    valor: 5396,
    variacao: 10,
    data: "13/04/2026",
    fonte: "Yahoo Finance"
  },
  atualizadoEm: "13/04/2026 14:45:32",
  horarioBR: "13/04/2026 14:45:32"
}
```

---

## 6️⃣ Exemplo: Se API Falhar

### Cenário: Banco Central fora do ar

```javascript
// Tentativa: obterDolar()
// API: https://api.bcb.gov.br (fora do ar)
// Resultado: ERRO

// Sistema responde com:
1. Log console: "Erro ao obter dólar: ..."
2. Tenta localStorage: ✓ Encontrado
3. Usa valor de 2h atrás: R$ 5,25
4. Usuário vê: "R$ 5,25" (com nota: pode estar desatualizado)

// Se localStorage também vazio:
5. Usa fallback (valor padrão + variação aleatória)
6. Mostra: "R$ 5,08" com nota: [Simulado]
```

---

## 7️⃣ Exemplo: Integração com Carteira

### Cliente visualiza página de Carteira

```
┌─ CARTEIRA DE JOÃO SILVA ──────────────┐
│                                       │
│ Patrimônio Total: R$ 121.600,00      │
│ Última atualização: 14:45 (hoje)     │
│                                       │
├─ Composição por Classe ──────────────┤
│                                       │
│ Renda Fixa (60%) ──────── R$ 92.960 │
│ Ações (15%) ───────────── R$ 18.240 │
│ Fundos Imobiliários (20%) R$ 24.320 │
│ Internacional (5%) ─────── R$ 6.080 │
│                                       │
├─ Rentabilidade ──────────────────────┤
│                                       │
│ No Período: +5,2%                    │
│ vs Ibovespa: -3,1% (melhor)         │
│ vs S&P 500: +2,1% (comparável)      │
│                                       │
└───────────────────────────────────────┘
```

**Quando Dólar é Atualizado (14:00 → 15:00):**
- Parte em USD (ETF S&P 500) recalcula automaticamente
- Novo total: Pode aumentar ou diminuir
- Comparação com índices atualiza

---

## 8️⃣ Exemplo: Histórico de Atualizações

```
Histórico do Dia 13/04/2026:

├─ 09:00 | Dólar: 5,20 → Ibovespa: 196.500
├─ 11:00 | Dólar: 5,25 → Ibovespa: 197.100
├─ 13:00 | Dólar: 5,22 → Ibovespa: 197.200
├─ 15:00 | Dólar: 5,27 → Ibovespa: 197.450
└─ 17:00 | Dólar: 5,25 → Ibovespa: 197.300 [FINAL]

Variação do Dia:
├─ Dólar: 5,20 → 5,25 = +1,0% ✓
└─ Ibovespa: 196.500 → 197.300 = +0,4% ✓
```

---

## 9️⃣ Exemplo: Alert ao Cliente

### Cliente Recebe Notificação

```
Às 11:00, Dólar sobe significativamente:

┌─ ⚠️ ALERTA ─────────────────────────────┐
│                                         │
│ Dólar teve grande variação:            │
│ 5,20 → 5,27 (+1,3%)                    │
│                                         │
│ Impacto na sua carteira:                │
│ +R$ 350,00 (ETF S&P 500)               │
│                                         │
│ Seu patrimônio total: R$ 121.950       │
│                                         │
│ [Ver Carteira Atualizada]              │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🔟 Exemplo: Código de Uso (Para Desenvolvedores)

```javascript
import { 
  obterTodasAsCotacoes, 
  mercadoAberto, 
  proximoHorarioAtualizacao 
} from '../services/cotacoesReais';

// Verificar se mercado aberto
if (mercadoAberto()) {
  console.log('Mercado aberto - buscando cotações...');
  
  const cotacoes = await obterTodasAsCotacoes();
  console.log('Dólar:', cotacoes.dolar.valor);
  console.log('Ibovespa:', cotacoes.ibovespa.valor);
}

// Calcular próxima atualização
const proxima = proximoHorarioAtualizacao();
console.log('Próxima atualização:', proxima);

// Usar em React
const [cotacoes, setCotacoes] = useState(null);

useEffect(async () => {
  const dados = await obterTodasAsCotacoes();
  setCotacoes(dados);
}, []); // Carrega na primeira renderização
```

---

**🎯 Pronto! O sistema de cotações está funcionando com dados reais!**

Qualquer dúvida, consulte `ATUALIZACAO_COTACOES_REAIS.md` para documentação completa.

