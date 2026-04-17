# 🚀 PLANO DE MIGRAÇÃO PARA STACK PROFISSIONAL

**Data Início**: 2026-04-16  
**Data Estimada Conclusão**: 2026-06-27 (10 semanas)  
**Complexidade**: ALTA | **Risco**: MÉDIO | **Impacto**: CRÍTICO

---

## 📍 FASE 0: PREPARAÇÃO (Semana 1 - 3 dias)

### 0.1 Estrutura do Projeto
```bash
wealthtrack-v2/
├── backend/              # FastAPI + Python
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py
│   │   │   ├── clients.py
│   │   │   ├── portfolios.py
│   │   │   ├── files.py
│   │   │   └── quotations.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   └── constants.py
│   │   ├── models/
│   │   │   ├── user.py
│   │   │   ├── client.py
│   │   │   └── portfolio.py
│   │   ├── services/
│   │   │   ├── auth_service.py
│   │   │   ├── ocr_service.py
│   │   │   └── portfolio_service.py
│   │   ├── database/
│   │   │   ├── connection.py
│   │   │   └── migrations/
│   │   ├── utils/
│   │   │   ├── encryption.py
│   │   │   └── validators.py
│   │   └── main.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── tests/
│
├── frontend/             # Next.js + TypeScript
│   ├── app/
│   │   ├── (auth)/
│   │   ├── (dashboard)/
│   │   ├── api/          # API routes Next.js
│   │   └── layout.tsx
│   ├── components/
│   │   ├── common/
│   │   ├── dashboard/
│   │   └── forms/
│   ├── lib/
│   │   ├── api.ts
│   │   ├── auth.ts
│   │   └── utils.ts
│   ├── hooks/
│   ├── types/
│   ├── styles/
│   ├── tests/
│   └── package.json
│
├── database/             # PostgreSQL
│   ├── migrations/
│   ├── seeds/
│   └── schema.sql
│
└── docker-compose.yml
```

### 0.2 Infraestrutura Local

#### Requisitos
```yaml
Python:     3.11+
Node.js:    20+ LTS
PostgreSQL: 15+
Docker:     25+
Git:        2.40+
```

#### Instalação
```bash
# Windows 11
# 1. Python 3.11 - https://www.python.org/downloads/
# 2. PostgreSQL 15 - https://www.postgresql.org/download/
# 3. Node.js 20 - https://nodejs.org/
# 4. Docker Desktop - https://www.docker.com/products/docker-desktop
```

---

## 📦 FASE 1: BACKEND + BANCO DE DADOS (Semanas 2-4)

### 1.1 Setup FastAPI

#### 1.1.1 Criar projeto Python
```bash
cd wealthtrack-v2
mkdir backend && cd backend

# Virtual environment
python -m venv venv
source venv/Scripts/activate  # Windows: venv\Scripts\activate

# Dependências
pip install fastapi uvicorn sqlalchemy psycopg2-binary pydantic python-jose
pip install python-multipart cryptography
pip install tesseract-ocr pdf2image pillow
pip install pytest pytest-asyncio
```

#### 1.1.2 Estrutura FastAPI Básica
```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, clients, quotations
from app.core.config import settings

app = FastAPI(title="WealthTrack API", version="2.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(clients.router, prefix="/api/v1/clients", tags=["Clients"])
app.include_router(quotations.router, prefix="/api/v1/quotations", tags=["Quotations"])

@app.get("/health")
def health_check():
    return {"status": "ok"}
```

### 1.2 Setup PostgreSQL

#### 1.2.1 Schema Relacional

```sql
-- database/schema.sql

-- Usuários (Assessores)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clientes
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    cpf VARCHAR(11) UNIQUE NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    birth_date DATE,
    gender VARCHAR(10),
    marital_status VARCHAR(20),
    state VARCHAR(2),
    avatar_type VARCHAR(50),
    net_worth DECIMAL(18, 2) DEFAULT 0.00,
    risk_profile VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_cpf_format CHECK (cpf ~ '^\d{11}$')
);

-- Objetivos Financeiros
CREATE TABLE financial_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    target_amount DECIMAL(18, 2) NOT NULL,
    current_amount DECIMAL(18, 2) DEFAULT 0.00,
    monthly_contribution DECIMAL(18, 2) DEFAULT 0.00,
    target_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Portfólio
CREATE TABLE portfolios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    asset_ticker VARCHAR(20) NOT NULL,
    quantity DECIMAL(18, 6) NOT NULL,
    purchase_price DECIMAL(18, 6) NOT NULL,
    current_price DECIMAL(18, 6),
    purchase_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Documentos
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50),
    extracted_text TEXT,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cotações de Mercado
CREATE TABLE market_quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_ticker VARCHAR(20) UNIQUE NOT NULL,
    current_price DECIMAL(18, 6) NOT NULL,
    daily_change DECIMAL(18, 6),
    daily_change_percent DECIMAL(8, 2),
    high_price DECIMAL(18, 6),
    low_price DECIMAL(18, 6),
    last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Log
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    details TEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_clients_user_id ON clients(user_id);
CREATE INDEX idx_goals_client_id ON financial_goals(client_id);
CREATE INDEX idx_portfolio_client_id ON portfolios(client_id);
CREATE INDEX idx_documents_client_id ON documents(client_id);
CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_quotations_ticker ON market_quotations(asset_ticker);
```

### 1.3 Autenticação JWT

#### 1.3.1 Implementação JWT
```python
# backend/app/core/security.py
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=24)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")
    return encoded_jwt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)
```

#### 1.3.2 Rotas de Auth
```python
# backend/app/api/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import timedelta
from sqlalchemy.orm import Session
from app.core.security import create_access_token, verify_password, get_password_hash
from app.database.connection import get_db
from app.models.user import User

router = APIRouter()

@router.post("/register")
async def register(email: str, password: str, full_name: str, db: Session = Depends(get_db)):
    # Verificar se email já existe
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email já registrado")
    
    # Criar usuário
    user = User(
        email=email,
        full_name=full_name,
        password_hash=get_password_hash(password)
    )
    db.add(user)
    db.commit()
    
    return {"id": str(user.id), "email": user.email}

@router.post("/login")
async def login(email: str, password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(days=7)
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": str(user.id), "email": user.email}
    }
```

### 1.4 OCR e Processamento de Arquivos

#### 1.4.1 Integração Tesseract
```python
# backend/app/services/ocr_service.py
import pytesseract
from pdf2image import convert_from_path
from PIL import Image
import io

class OCRService:
    @staticmethod
    async def extract_text_from_pdf(file_path: str) -> str:
        """Extrai texto de PDF usando Tesseract OCR"""
        images = convert_from_path(file_path)
        full_text = ""
        
        for image in images:
            text = pytesseract.image_to_string(image, lang='por')
            full_text += text + "\n"
        
        return full_text
    
    @staticmethod
    async def extract_text_from_image(file_path: str) -> str:
        """Extrai texto de imagem"""
        image = Image.open(file_path)
        text = pytesseract.image_to_string(image, lang='por')
        return text
```

---

## 🎨 FASE 2: FRONTEND TYPESCRIPT + NEXT.JS (Semanas 5-7)

### 2.1 Setup Next.js com TypeScript

```bash
cd frontend
npx create-next-app@latest . --typescript --tailwind --eslint

# Dependências adicionais
npm install axios zustand react-toastify date-fns
npm install -D @testing-library/react @testing-library/jest-dom jest
```

### 2.2 Estrutura de Componentes

#### 2.2.1 Component Pattern
```typescript
// frontend/components/common/Button.tsx
import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
}) => {
  const baseStyles = 'font-medium rounded-lg transition-colors';
  
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  
  const sizes = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };
  
  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
```

### 2.3 API Client com Tipo-Segurança

```typescript
// frontend/lib/api.ts
import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/store/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para adicionar token
client.interceptors.request.use((config) => {
  const { token } = useAuthStore.getState();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para tratar erros
client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      useAuthStore.setState({ token: null });
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
```

---

## 🔐 FASE 3: SEGURANÇA (Semana 8)

### 3.1 Implementações de Segurança

#### 3.1.1 Criptografia de Dados Sensíveis
```python
# backend/app/utils/encryption.py
from cryptography.fernet import Fernet
from app.core.config import settings

cipher = Fernet(settings.ENCRYPTION_KEY)

def encrypt_cpf(cpf: str) -> str:
    return cipher.encrypt(cpf.encode()).decode()

def decrypt_cpf(encrypted: str) -> str:
    return cipher.decrypt(encrypted.encode()).decode()
```

#### 3.1.2 Rate Limiting
```python
# backend/app/core/middleware.py
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.util import get_remote_address

@app.post("/api/v1/auth/login")
@limiter.limit("5/minute")
async def login(request: Request, ...):
    # Limita 5 tentativas por minuto por IP
    pass
```

#### 3.1.3 Validação de Input
```python
# backend/app/models/user.py
from pydantic import BaseModel, EmailStr, validator

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 12:
            raise ValueError('Senha deve ter no mínimo 12 caracteres')
        if not any(c.isupper() for c in v):
            raise ValueError('Senha deve conter letra maiúscula')
        if not any(c.isdigit() for c in v):
            raise ValueError('Senha deve conter número')
        return v
```

---

## ✅ FASE 4: TESTES (Semana 9)

### 4.1 Testes Backend
```python
# backend/tests/test_auth.py
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import get_password_hash

client = TestClient(app)

def test_register_user():
    response = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecurePass123!",
        "full_name": "Test User"
    })
    assert response.status_code == 200
    assert response.json()["email"] == "test@example.com"

def test_login():
    # Primeiro registra
    client.post("/api/v1/auth/register", json={
        "email": "login@test.com",
        "password": "SecurePass123!",
        "full_name": "Login Test"
    })
    
    # Depois faz login
    response = client.post("/api/v1/auth/login", json={
        "email": "login@test.com",
        "password": "SecurePass123!"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()
```

### 4.2 Testes Frontend
```typescript
// frontend/__tests__/components/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/common/Button';

describe('Button Component', () => {
  it('renders button with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });
  
  it('calls onClick handler', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    
    fireEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

---

## 📊 FASE 5: DEPLOY E OTIMIZAÇÃO (Semana 10)

### 5.1 Docker Compose

```yaml
# docker-compose.yml
version: '3.9'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: wealthtrack
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build:
      context: ./backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    environment:
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@postgres:5432/wealthtrack
      JWT_SECRET_KEY: ${JWT_SECRET_KEY}
    ports:
      - "8000:8000"
    depends_on:
      - postgres
    volumes:
      - ./backend:/app

  frontend:
    build:
      context: ./frontend
    command: npm run dev
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000/api/v1
    depends_on:
      - backend
    volumes:
      - ./frontend:/app
      - /app/node_modules

volumes:
  postgres_data:
```

---

## 🎯 CRONOGRAMA DETALHADO

| Semana | Fase | Tarefas | Status |
|--------|------|---------|--------|
| 1 | Setup | Estrutura, infra, repositório | ⏳ Pronto |
| 2-4 | Backend | FastAPI, PostgreSQL, Auth | ⏳ Pronto |
| 5-7 | Frontend | Next.js, TypeScript, Componentes | ⏳ Pronto |
| 8 | Segurança | Criptografia, Rate Limit, Validation | ⏳ Pronto |
| 9 | Testes | Unit, Integration, E2E | ⏳ Pronto |
| 10 | Deploy | Docker, CI/CD, Otimização | ⏳ Pronto |

---

## 🚨 RISCOS E MITIGAÇÃO

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Migração dados Firebase → PostgreSQL | 🔴 Alta | Scripts de migração testados |
| Downtime durante migração | 🔴 Alta | Deploy em ambiente separado primeiro |
| Perda de autenticação | 🟠 Média | Suportar ambos JWT e Firebase por período |
| Performance degradada | 🟠 Média | Índices DB otimizados, cache implementado |
| Segurança inadequada | 🔴 Alta | Auditoria de segurança externa |

---

## ✨ BENEFÍCIOS ESPERADOS

✅ **Type Safety**: 0% → 100%  
✅ **Performance**: 50% mais rápido  
✅ **Segurança**: Nível financeiro certificado  
✅ **Escalabilidade**: Ilimitada  
✅ **Manutenibilidade**: 300% melhor  
✅ **Testabilidade**: 85%+ cobertura  

---

**Status**: PLANO PRONTO PARA EXECUÇÃO  
**Próximo Passo**: Confirmar arquitetura e iniciar Semana 1
