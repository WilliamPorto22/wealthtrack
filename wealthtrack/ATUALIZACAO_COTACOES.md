# Sistema de Atualização de Cotações - 3 em 3 Horas

## 📊 Como Funciona

O sistema agora atualiza automaticamente as cotações de mercado a cada **3 horas**:

- ✅ **Dólar**
- ✅ **SELIC**
- ✅ **IPCA**
- ✅ **Ibovespa**
- ✅ **S&P 500**

---

## 🔄 Funcionamento Técnico

### Local onde as cotações são armazenadas:
```javascript
localStorage: "wealthtrack_cotacoes"  // Dados das cotações
localStorage: "wealthtrack_cotacoes_timestamp"  // Última atualização
```

### Componentes envolvidos:
1. **Dashboard.jsx** - Usa as cotações e as exibe
2. **src/services/cotacoes.js** - Serviço de gerenciamento de cotações

### Fluxo de atualização:
```
1. Página carrega
   ↓
2. Verifica localStorage (cotações anteriores)
   ↓
3. Se mais de 3 horas passaram → Atualiza
   ↓
4. Guarda nova data/hora em localStorage
   ↓
5. Dashboard exibe cotações atualizadas
   ↓
6. Cada 3 horas → Voltar ao passo 3
```

---

## 🚀 Integração com API Real

Para usar cotações **reais** em vez de simuladas, siga estes passos:

### Opção 1: Alpha Vantage (Recomendado - Grátis)
```bash
npm install axios
```

**Editar `src/services/cotacoes.js`:**
```javascript
import axios from 'axios';

const API_KEY = "sua_chave_aqui"; // Obter em https://www.alphavantage.co/

export async function atualizarCotacoes() {
  try {
    // Dólar
    const dolar = await axios.get(
      `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=BRL&apikey=${API_KEY}`
    );
    
    // Ibovespa
    const ibovespa = await axios.get(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBOV.SA&apikey=${API_KEY}`
    );
    
    // S&P 500
    const sp500 = await axios.get(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=^GSPC&apikey=${API_KEY}`
    );

    // Processar dados e armazenar...
    const cotacoesAtualizadas = {
      dolar: {
        label: "Dólar",
        valor: `R$ ${dolar.data.rate}`,
        // ...
      },
      // ...
    };

    localStorage.setItem("wealthtrack_cotacoes", JSON.stringify(cotacoesAtualizadas));
    localStorage.setItem("wealthtrack_cotacoes_timestamp", Date.now().toString());
    
    return cotacoesAtualizadas;
  } catch (e) {
    console.error("Erro ao atualizar cotações:", e);
    return obterCotacoes();
  }
}
```

### Opção 2: Usar Backend Próprio
Se você tem um backend, crie um endpoint:

```javascript
// Backend (Node.js/Express)
app.get('/api/cotacoes', async (req, res) => {
  // Buscar cotações de API
  const cotacoes = await buscarCotacoes();
  res.json(cotacoes);
});

// Dashboard.jsx
useEffect(() => {
  const atualizarCotacoes = async () => {
    const response = await fetch('/api/cotacoes');
    const cotacoes = await response.json();
    setMercado(cotacoes);
  };
  
  atualizarCotacoes();
  const intervalo = setInterval(atualizarCotacoes, 10800000); // 3 horas
  
  return () => clearInterval(intervalo);
}, []);
```

### Opção 3: Rapid API (Melhor qualidade)
```bash
npm install rapidapi-connect
```

---

## 📍 Onde as cotações aparecem

### 1. Na Dashboard Principal
Na seção de indicadores de mercado (abaixo do banner de "Minha Custódia Total"):

```
┌─────────────────────────────────────┐
│ 💼 Minha Custódia Total             │ ← NOVO!
│    R$ 1.657.319,62                  │
│    Patrimônio administrado...        │
└─────────────────────────────────────┘

┌─────────┬─────────┬─────────┬─────────┬─────────┐
│ Dólar   │ SELIC   │ IPCA    │Ibovespa │ S&P 500 │
│ R$5,08  │ 14,75%  │ 4,14%   │ 197.000 │ 5.396   │
│-1,0%    │ a.a.    │12 meses │+21% ano │+10% ano │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

---

## ⚙️ Configuração Manual

Se quiser alterar o intervalo de atualização:

**Em `Dashboard.jsx`, altere:**
```javascript
// 3 horas = 10800000 ms
const intervalo = setInterval(atualizarCotacoes, 10800000);

// Para 1 hora = 3600000 ms
// const intervalo = setInterval(atualizarCotacoes, 3600000);

// Para 30 minutos = 1800000 ms
// const intervalo = setInterval(atualizarCotacoes, 1800000);
```

---

## 🔍 Testando

### Ver cotações armazenadas:
```javascript
// No console do navegador:
JSON.parse(localStorage.getItem("wealthtrack_cotacoes"))
```

### Limpar cache (forçar atualização):
```javascript
// No console:
localStorage.removeItem("wealthtrack_cotacoes");
localStorage.removeItem("wealthtrack_cotacoes_timestamp");
// Recarregar página
```

---

## 📱 Custódia Total

### Como é calculada:
```javascript
Custódia Total = Soma de todos os patrimônios dos clientes

Exemplo:
Cliente A: R$ 500.000
Cliente B: R$ 1.000.000
Cliente C: R$ 157.319,62
─────────────────────
Total:     R$ 1.657.319,62
```

### Onde aparece:
- **Dashboard Principal** - Banner destacado em ouro
- **Relatórios** - Pode ser adicionado em futuras páginas

---

## ✅ Funcionalidades Implementadas

- ✅ Atualização automática a cada 3 horas
- ✅ Armazenamento em localStorage
- ✅ Serviço centralizado (`src/services/cotacoes.js`)
- ✅ Banner "Minha Custódia Total" destacado
- ✅ KPI "Clientes Ativos" (com patrimônio > 0)
- ✅ KPI "Total Cadastrado" (todos os clientes)
- ✅ Responsividade completa (mobile, tablet, desktop)

---

## 🎯 Próximos Passos

1. **Obter chave de API** (Alpha Vantage grátis em alphavantage.co)
2. **Integrar cotações reais** substituindo a simulação
3. **Testar atualização** por 3+ horas
4. **Adicionar gráficos** de variação histórica (opcional)

---

## 💡 Dica

Se quiser ver as cotações atualizando em tempo real para testes, altere o intervalo para 30 segundos:

```javascript
const INTERVALO_TESTE = 30 * 1000; // 30 segundos
const intervalo = setInterval(atualizarCotacoes, INTERVALO_TESTE);
```

Depois mude para 3 horas em produção.
