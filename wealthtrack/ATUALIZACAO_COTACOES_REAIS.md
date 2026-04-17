# 📊 Sistema de Cotações em Tempo Real - WealthTrack v3.2

## 🎯 Visão Geral

O WealthTrack agora atualiza automaticamente os dados de mercado **a cada 2 horas** durante o horário de funcionamento do mercado brasileiro (**9h às 18h**), **segunda a sexta-feira**.

---

## 🔄 Atualização Automática

### Horário de Atualização
- **Início:** 9h (abertura do mercado)
- **Fim:** 18h (fechamento do mercado)
- **Intervalo:** A cada 2 horas
- **Dias:** Segunda a sexta (dias úteis)

### Quando NÃO atualiza
- Sábado, domingo e feriados
- Entre 18h e 9h (mercado fechado)
- Feriados brasileiros

---

## 📈 Fontes de Dados

### 1. **Dólar (USD/BRL)**
- **Fonte:** Banco Central do Brasil (Oficial)
- **API:** https://api.bcb.gov.br/dados/series/1/dados
- **Precisão:** Taxa de câmbio oficial
- **Atualização:** Diária

### 2. **SELIC (Taxa de Juros Básica)**
- **Fonte:** Banco Central do Brasil
- **API:** https://api.bcb.gov.br/dados/series/432/dados
- **Unidade:** a.a. (ao ano)
- **Precisão:** Oficial

### 3. **IPCA (Inflação)**
- **Fonte:** IBGE (Instituto Brasileiro de Geografia e Estatística)
- **API:** https://api.sidra.ibge.gov.br
- **Período:** Últimos 12 meses
- **Precisão:** Oficial

### 4. **Ibovespa (Índice de Bolsa Brasileira)**
- **Fonte:** Yahoo Finance
- **Símbolo:** ^BVSP
- **Dados:** Preço de fechamento + Variação anual
- **Liquidez:** Tempo real

### 5. **S&P 500 (Índice de Bolsa Americana)**
- **Fonte:** Yahoo Finance
- **Símbolo:** ^GSPC
- **Dados:** Preço de fechamento + Variação anual
- **Liquidez:** Tempo real

---

## 🔘 Botão de Atualização Manual

### Localização
Localizado na **navbar** (barra de navegação) ao lado da busca de clientes.

### Funcionalidades
✅ **Verde (Mercado Aberto):** Clique para atualizar imediatamente
⚫ **Cinza (Mercado Fechado):** Desabilitado (retoma amanhã às 9h)

### Ícone
- Apresenta ícone de sincronização (↻)
- Mostra "Atualizando..." enquanto processa
- Roda animação de carregamento

---

## 💾 Armazenamento de Dados

### LocalStorage
Os dados são salvos localmente para:
- **Fallback:** Se a API falhar
- **Offline:** Usar última versão conhecida
- **Performance:** Evitar requisições repetidas

### Estrutura Salva
```javascript
{
  dolar: { valor: 5.25, data: "13/04/2026", fonte: "Banco Central" },
  selic: { valor: 14.75, data: "13/04/2026", unidade: "a.a." },
  ipca: { valor: 4.14, data: "12 meses", fonte: "IBGE" },
  ibovespa: { valor: 197000, variacao: 21, fonte: "Yahoo Finance" },
  sp500: { valor: 5396, variacao: 10, fonte: "Yahoo Finance" },
  atualizadoEm: "13/04/2026 14:30:45",
  horarioBR: "13/04/2026 14:30:45" (Horário de Brasília)
}
```

---

## 🎨 Indicadores Visuais

### Status de Mercado
```
✓ Mercado aberto (9h-18h)     [Verde]
Mercado fechado · Próxima: 9h [Cinza]
```

### Última Atualização
Mostra a hora exata da última atualização em tempo real.

### Dados nos Cards
Cada cotação mostra:
- **Valor principal** (ex: R$ 5,25)
- **Fonte ou período** (ex: "Banco Central")
- **Variação** (quando disponível)

---

## 🛠️ Configuração e Customização

### Alterar Intervalo de Atualização
Editar `src/services/cotacoesReais.js`:

```javascript
const INTERVALO_ATUALIZACAO = 2 * 60 * 60 * 1000; // 2 horas
// Mude para:
const INTERVALO_ATUALIZACAO = 1 * 60 * 60 * 1000; // 1 hora
```

### Alterar Horário do Mercado
```javascript
const HORARIO_MERCADO = { inicio: 9, fim: 18 };
// Mude para:
const HORARIO_MERCADO = { inicio: 8, fim: 20 };
```

### Adicionar Novas Cotações
1. Criar função em `cotacoesReais.js`:
```javascript
export async function obterOuro() {
  // Implementar busca da API
}
```

2. Importar em `Dashboard.jsx`
3. Adicionar ao `formatarCotacoes()`

---

## ⚙️ Fluxo de Funcionamento

```
┌─────────────────────────────────────────┐
│  9h - Mercado Abre                      │
│  ↓                                      │
│  Dashboard carrega cotações reais       │
│  ↓                                      │
│  Intervalo de 2h configurado            │
│  ↓                                      │
│  Cada 2h: Atualiza cotações via APIs    │
│  ↓                                      │
│  18h - Mercado Fecha                    │
│  ↓                                      │
│  Intervalo pausado (verifica cada min)  │
│  ↓                                      │
│  9h Próximo Dia - Reinicia ciclo        │
└─────────────────────────────────────────┘
```

---

## 🔒 Tratamento de Erros

### Se API falhar:
1. Tenta usar dados do localStorage
2. Se localStorage vazio: mostra valores padrão
3. Loga erro no console para debug
4. Tenta novamente na próxima atualização

### Fallback (Valores Padrão)
Quando nenhuma fonte disponível:
- Dólar: R$ 5,08 + variação aleatória
- IPCA: 4,14%
- Ibovespa: 197.000 + variação aleatória
- S&P 500: 5.396 + variação aleatória

---

## 📱 Integração com Carteira

Os dados de cotações são **críticos** para:
- ✅ Calcular patrimônio total (conversão de moedas)
- ✅ Atualizar valor de investimentos em USD
- ✅ Comparar performance com índices
- ✅ Gerar alertas de mudanças significativas

### Como os clientes veem:
1. Dashboard mostra cotações em tempo real
2. Ao visualizar carteira: valores atualizados
3. Comparação com índices (IBOV, S&P 500)
4. Rentabilidade relativa ao mercado

---

## 🚀 Próximos Passos (Opcionais)

1. **Adicionar Ouro e Petróleo** - Mais ativos internacionais
2. **Gráficos Históricos** - Ver evolução das cotações
3. **Alertas Automáticos** - Notificar grandes variações
4. **API Própria** - Cache no backend para melhor performance
5. **Integração com Alertas** - Avisar cliente quando cotação atingir alvo

---

## 📞 Troubleshooting

### "Cotações não atualizam"
1. Verificar se é dia útil (seg-sex)
2. Verificar horário (9h-18h)
3. Clicar botão "Atualizar" manualmente
4. Abrir DevTools → Console → ver erros

### "Mercado fechado"
- **Normal:** Fora do horário 9-18h
- **Próxima atualização:** Amanhã às 9h
- **Alternativa:** Clique o botão quando mercado abrir

### "Valores muito antigos"
1. Limpar localStorage: DevTools → Application → localStorage → limpar
2. Recarregar página (Ctrl+F5)
3. Clicar "Atualizar" manualmente

---

## 📅 Histórico de Atualizações

| Data | Versão | Mudança |
|------|--------|---------|
| 13/04/2026 | 3.2 | Sistema de cotações em tempo real com atualização a cada 2h |
| 13/04/2026 | 3.1 | Refatoração responsiva do design |
| 13/04/2026 | 3.0 | Design XP Investimentos implementado |

---

**Status:** ✅ Operacional | **Próxima Atualização:** Automática a cada 2h | **Horário:** 9h-18h

🎉 **WealthTrack agora com cotações de mercado em tempo real!**
