# Roadmap Detalhado de Refatoração

## 📍 Carteira.jsx - Linhas Específicas a Refatorar

### 1. GraficoPizza Component (Linhas 49-95)
**Estilos inline para extrair:**
- Linha 51: `style={{width:180,height:180,borderRadius:"50%",...}}`
- Linha 77: `style={{...noEdit,flexShrink:0}}`
- Linha 89-91: `<text>` SVG styles

**Classes CSS a criar:**
```css
.grafico-pizza { width: 180px; height: 180px; border-radius: 50%; ... }
.grafico-pizza-empty { display: flex; align-items: center; justify-content: center; ... }
.grafico-pizza-svg { flex-shrink: 0; user-select: none; }
```

**Refatoração:**
```jsx
// ANTES
<div style={{width:180,height:180,borderRadius:"50%",...}}>
  <GraficoPizza />
</div>

// DEPOIS
<div className="grafico-pizza">
  <GraficoPizza />
</div>
```

---

### 2. Carteira Header (Linhas 300-312)
**Estilos a converter:**
- Linha 300: Back button style (display flex, gap, etc)
- Linha 306: Header div com flex, gap, paddingBottom, borderBottom
- Linha 309-311: Text styles

**Classes a criar:**
```css
.carteira-back-btn { /* flex layout, gap, colors */ }
.carteira-header { display: flex; gap: 14px; padding-bottom: 20px; border-bottom: ... }
.carteira-header-label { font-size: 11px; color: var(--text-muted); ... }
.carteira-header-title { font-size: 20px; font-weight: 300; color: var(--text-primary); }
```

---

### 3. Feedback Message (Linhas 315-320)
**Estilos a converter:**
- Linha 316: Alert style com background condicional

**Classes a criar:**
```css
.alert-feedback {
  border-radius: 10px;
  padding: 13px 16px;
  font-size: 12px;
  line-height: 1.5;
  margin-bottom: 20px;
}

.alert-feedback.success { background: rgba(34,197,94,0.08); border: 0.5px solid rgba(34,197,94,0.2); color: #22c55e; }
.alert-feedback.error { background: rgba(239,68,68,0.08); border: 0.5px solid rgba(239,68,68,0.2); color: #ef4444; }
```

---

### 4. KPI Cards (Linhas 334-345)
**Status:** Parcialmente pronto - usar `.kpi-card`

```jsx
// ANTES
<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,...}}>

// DEPOIS
<div className="grid-assets">  {/* Reutilizar grid responsivo */}
```

---

### 5. Gráfico + Tabela Layout (Linhas 348-369)
**Maior desafio - responsividade:**

**Estilos a converter:**
- Linha 348: `style={{display:"flex",gap:24,...}}`
- Linha 351: Gráfico card
- Linha 372: Tabela flex container

**Classe responsiva a criar:**
```css
.carteira-chart-table {
  display: flex;
  flex-direction: column;  /* Mobile: vertical */
  gap: var(--spacing-2xl);
  align-items: flex-start;
}

@media (min-width: 768px) {
  .carteira-chart-table {
    flex-direction: row;  /* Desktop: horizontal */
  }
}

.carteira-chart {
  flex-shrink: 0;
  width: 100%;
  max-width: 280px;
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-radius: 14px;
  padding: 20px;
}

.carteira-table {
  flex: 1;
  width: 100%;
}

@media (min-width: 768px) {
  .carteira-chart {
    max-width: none;
  }
}
```

---

### 6. Tabela de Ativos (Linhas 373-400+)
**Estilos inline complexos:**
- Linha 375: Grid header `gridTemplateColumns:"1fr auto auto auto"`
- Linha 387: Grid row

**Classe responsiva:**
```css
.assets-table {
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}

/* Desktop: 4 columns */
.assets-table-header,
.assets-table-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 0;
  padding: 12px 18px;
  align-items: center;
}

/* Mobile: Stack verticalmente */
@media (max-width: 480px) {
  .assets-table-header {
    display: none;  /* Esconder header em mobile */
  }
  
  .assets-table-row {
    grid-template-columns: 1fr;
    border-bottom: 0.5px solid var(--border);
    padding: 16px;
    gap: 12px;
  }
}
```

---

## 📍 Objetivos.jsx - Linhas Específicas a Refatorar

### 1. Objetivo Types Grid (Linhas 268-276)
**Estrutura:**
```jsx
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",...}}>
```

**Refatoração simples:**
```jsx
<div className="grid-objectives">
```

Já existe em `responsive.css`:
```css
.grid-objectives { grid-template-columns: 1fr; }
@media (min-width: 480px) { grid-template-columns: repeat(2, 1fr); }
```

---

### 2. Objetivo Cards (Linhas ~300-320)
**Estilos com cores dinâmicas:**
```jsx
<div style={{background:c.cor+"12",border:`0.5px solid ${c.cor+"30"}`,...}}>
```

**Refatoração com data attributes:**
```jsx
<div className="objetivo-card" data-color={c.key} style={{...}}>
```

```css
.objetivo-card {
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-radius: 14px;
  padding: 20px;
  cursor: pointer;
}

[data-color="economia"] { border-color: #2563eb; background: rgba(37,99,235,0.08); }
[data-color="educacao"] { border-color: #22c55e; background: rgba(34,197,94,0.08); }
[data-color="viagem"] { border-color: #a855f7; background: rgba(168,85,247,0.08); }
/* ... etc */
```

---

### 3. Recalibration Modal (Linhas ~400-450)
**Grande refatoração com nested inputs:**

**Classes a criar:**
```css
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-radius: 16px;
  padding: 28px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header { font-size: 18px; font-weight: 300; margin-bottom: 16px; }
.modal-subtitle { font-size: 12px; color: var(--text-secondary); margin-bottom: 20px; }

@media (max-width: 480px) {
  .modal-content {
    width: 95%;
    padding: 20px;
  }
}
```

---

## 📍 ClienteFicha.jsx - Linhas Específicas a Refatorar

### 1. CARD_STYLE Constant (Linhas ~265-275)
**Maior volume de estilos:**
```javascript
const CARD_STYLE = { ... }  // 10+ propriedades
```

**Refatoração:**
Remover constant, usar classe `.card` que já existe em `components.css`

---

### 2. Custom Select Component (Linhas ~92-130)
**Complex component com estilos inline:**

**Classes a criar:**
```css
.custom-select-wrapper {
  position: relative;
  width: 100%;
}

.custom-select-trigger {
  background: rgba(255,255,255,0.04);
  border: 0.5px solid rgba(255,255,255,0.1);
  border-radius: var(--radius-md);
  padding: 13px 16px;
  font-size: 15px;
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.custom-select-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg-card);
  border: 0.5px solid var(--border);
  border-radius: var(--radius-md);
  margin-top: 4px;
  z-index: 10;
  max-height: 300px;
  overflow-y: auto;
}

.custom-select-option {
  padding: 13px 16px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  border-bottom: 0.5px solid var(--border);
}

.custom-select-option:hover,
.custom-select-option.selected {
  background: rgba(201,168,76,0.1);
  color: var(--text-primary);
}
```

---

### 3. Tabs/Abas (Linhas ~150-200)
**Se houver tab navigation:**

**Classes a criar:**
```css
.tabs-nav {
  display: flex;
  border-bottom: 0.5px solid var(--border);
  gap: 0;
  margin-bottom: 20px;
  overflow-x: auto;
}

.tabs-nav-item {
  padding: 14px 20px;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  color: var(--text-secondary);
  white-space: nowrap;
  transition: all 0.2s;
}

.tabs-nav-item.active {
  border-bottom-color: var(--gold);
  color: var(--gold);
}

.tabs-content {
  display: none;
}

.tabs-content.active {
  display: block;
}
```

---

### 4. Modal de Novo Objetivo (Linhas ~250-350)
**Reutilizar `.modal-overlay` e `.modal-content` de Objetivos**

---

### 5. Inputs Customizados (Linhas ~65-90)
**Componentes InputMoeda, InputTexto, TextareaLocal:**

Já têm estilos em `theme.js` (C.input, C.label)
Apenas remover estilos inline locais e usar classes

---

## ⚡ Ordem Recomendada de Refatoração

1. **Carteira.jsx** (2-3h) - Mais visual, menos lógica
2. **Objetivos.jsx** (3-4h) - Grids e cards, media queries simples
3. **ClienteFicha.jsx** (4-5h) - Maior, modal complexo, custom select

---

## 🔄 Template de Refatoração Rápida

Para cada componente:

1. **Identificar** - Linhas com `style={{...}}`
2. **Extrair** - Copiar para `.css` file
3. **Nomear** - Classes descritivas e semânticas
4. **Substituir** - `style={{...}}` → `className="..."`
5. **Testar** - Desktop → Tablet → Mobile
6. **Validar** - Sem console errors, layout responsivo

---

## 📊 Progresso Esperado

Após completar Carteira + Objetivos + ClienteFicha:

✅ 100% de páginas responsivas
✅ 0 estilos inline (tudo em CSS)
✅ Mobile-first design implementado
✅ 3 breakpoints funcionando perfeitamente
✅ Fácil manutenção de estilos no futuro

---

## 🎯 KPIs de Sucesso

- [ ] Não há overlapping de elementos em mobile (375px)
- [ ] Grids se comportam corretamente (1 col mobile, 2+ col tablet/desktop)
- [ ] Padding/margin se ajustam por breakpoint
- [ ] Sem console errors ou warnings
- [ ] Todos os inputs são tap-friendly (min 44px height)
- [ ] Fontes legíveis em todos os tamanhos
- [ ] Scroll horizontal não aparece desnecessariamente
