# 📱 INTEGRAÇÃO NAVBAR PADRÃO

## Como Usar em Cada Página

A Navbar agora é um componente único reutilizável. Todas as páginas devem usá-la de forma consistente.

### Import Padrão

```jsx
import { Navbar } from "../components/Navbar";
```

---

## 1️⃣ DASHBOARD

```jsx
import { Navbar } from "../components/Navbar";

export default function Dashboard() {
  const [busca, setBusca] = useState("");

  return (
    <>
      <Navbar
        showSearch={true}
        searchValue={busca}
        onSearchChange={setBusca}
        actionButtons={[
          {
            label: "Atualizar",
            icon: "↻",
            onClick: () => atualizarCotacoes(),
            disabled: atualizando,
            variant: "secondary",
          },
        ]}
      />

      <div className="dashboard-content">
        {/* Conteúdo aqui */}
      </div>
    </>
  );
}
```

### Props Usadas:
- `showSearch={true}` - Mostra campo de busca
- `searchValue={busca}` - Valor da busca
- `onSearchChange={setBusca}` - Callback quando busca muda
- `actionButtons={[...]}` - Botões customizados

---

## 2️⃣ CLIENTE FICHA

```jsx
import { Navbar } from "../components/Navbar";

export default function ClienteFicha() {
  const { id } = useParams();
  const [modo, setModo] = useState("ver");

  return (
    <>
      <Navbar
        title={snap.nome || "Novo Cliente"}
        actionButtons={[
          {
            label: modo === "ver" ? "Editar" : "Salvar",
            onClick: modo === "ver" ? () => setModo("editar") : salvar,
            variant: modo === "editar" ? "primary" : "secondary",
          },
        ]}
      />

      <div className="cliente-content">
        {/* Conteúdo aqui */}
      </div>
    </>
  );
}
```

### Props Usadas:
- `title="Nome do Cliente"` - Título na navbar
- `actionButtons={[...]}` - Botões de ação (Editar/Salvar)

---

## 3️⃣ CARTEIRA

```jsx
import { Navbar } from "../components/Navbar";

export default function Carteira() {
  const { id } = useParams();
  const [modo, setModo] = useState("ver");

  return (
    <>
      <Navbar
        title="Carteira de Investimentos"
        actionButtons={[
          {
            label: "Upload",
            icon: "↑",
            onClick: () => fileInputRef.current?.click(),
            disabled: uploading,
          },
          {
            label: modo === "ver" ? "Editar" : "Salvar",
            onClick: modo === "ver" ? () => setModo("editar") : salvar,
            variant: modo === "editar" ? "primary" : "secondary",
          },
        ]}
      />

      <div className="carteira-content">
        {/* Conteúdo aqui */}
      </div>
    </>
  );
}
```

---

## 4️⃣ OBJETIVOS

```jsx
import { Navbar } from "../components/Navbar";

export default function Objetivos() {
  const { id } = useParams();

  return (
    <>
      <Navbar
        title="Objetivos Financeiros"
        actionButtons={[
          {
            label: "+ Novo",
            onClick: adicionarObjetivo,
            variant: "primary",
          },
        ]}
      />

      <div className="objetivos-content">
        {/* Conteúdo aqui */}
      </div>
    </>
  );
}
```

---

## 5️⃣ FLUXO MENSAL

```jsx
import { Navbar } from "../components/Navbar";

export default function FluxoMensal() {
  const { id } = useParams();
  const [modo, setModo] = useState("ver");

  return (
    <>
      <Navbar
        title="Fluxo Mensal"
        actionButtons={[
          {
            label: modo === "ver" ? "Editar" : "Salvar",
            onClick: modo === "ver" ? () => setModo("editar") : salvar,
            variant: modo === "editar" ? "primary" : "secondary",
          },
        ]}
      />

      <div className="fluxo-content">
        {/* Conteúdo aqui */}
      </div>
    </>
  );
}
```

---

## 6️⃣ LOGIN (Sem Navbar)

```jsx
export default function Login() {
  // Login NÃO usa Navbar, pois é pública e pré-autenticação
  return (
    <div className="login-container">
      <div className="login-wrapper">
        {/* Logo vai aqui usando <Logo variant="login" /> */}
        {/* Conteúdo de login */}
      </div>
    </div>
  );
}
```

---

## Interface da Navbar

```typescript
interface NavbarProps {
  // Título opcional (ex: "Nome do Cliente")
  title?: string;

  // Mostrar campo de busca?
  showSearch?: boolean;

  // Valor da busca
  searchValue?: string;

  // Callback quando busca muda
  onSearchChange?: (value: string) => void;

  // Botões customizados
  actionButtons?: Array<{
    label: string;           // Texto do botão
    icon?: string;          // Ícone/emoji
    onClick: () => void;    // Função ao clicar
    disabled?: boolean;     // Desabilitado?
    variant?: "primary" | "secondary";  // Estilo
    title?: string;         // Tooltip
  }>;
}
```

---

## Características da Navbar

✅ **Logo padronizado** - Porto Invest em todas as páginas  
✅ **Data do dia** - Atualizada automaticamente  
✅ **Busca** - Opcional, configurable  
✅ **Botões customizados** - Cada página define seus botões  
✅ **Logout** - Sempre presente  
✅ **Responsivo** - Desktop, tablet, mobile  
✅ **Sticky** - Permanece no topo ao scrollar  

---

## Estilos Customizados

Toda a estilização está em `/src/styles/navbar.css`.

Para customizar cores, edite as variáveis CSS:

```css
:root {
  --navbar-bg: #07090f;
  --navbar-border: rgba(255, 255, 255, 0.07);
  --text-primary: #f0f4ff;
  --accent-primary: #c9a84c;
  --accent-secondary: #60a5fa;
}
```

---

## Variantes de Buttons

```jsx
// Botão Primário (CTA - Call To Action)
{
  label: "Salvar",
  variant: "primary",  // Dourado
  onClick: salvar,
}

// Botão Secundário (Ação normal)
{
  label: "Editar",
  variant: "secondary",  // Azul
  onClick: editar,
}

// Botão com Ícone
{
  label: "Upload",
  icon: "↑",
  onClick: upload,
}

// Botão Desabilitado
{
  label: "Salvando...",
  disabled: true,
  onClick: () => {},
}
```

---

## Checklist de Implementação

- [ ] Importar `<Navbar />` em Dashboard
- [ ] Importar `<Navbar />` em ClienteFicha
- [ ] Importar `<Navbar />` em Carteira
- [ ] Importar `<Navbar />` em Objetivos
- [ ] Importar `<Navbar />` em ObjetivoDetalhes
- [ ] Importar `<Navbar />` em FluxoMensal
- [ ] Testar responsividade em mobile
- [ ] Testar responsividade em tablet
- [ ] Verificar alinhamento do logo
- [ ] Testar busca (se implementada)
- [ ] Testar botões customizados
- [ ] Testar logout
- [ ] Remover Navbars antigas de cada página

---

## Próximas Etapas

1. ✅ Componente Navbar criado
2. ✅ Componente Logo criado
3. ✅ Estilos CSS prontos
4. ⏳ Aguardar envio dos arquivos do logo
5. ⏳ Integrar em todas as páginas
6. ⏳ Testar em todos os dispositivos

---

**Status**: 🟡 Pronto para integração  
**Bloqueador**: Arquivos do logo (aguardando envio)
