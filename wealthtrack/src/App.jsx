import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ClienteFicha from "./pages/ClienteFicha";
import Objetivos from "./pages/Objetivos";
import ObjetivoDetalhes from "./pages/ObjetivoDetalhes";
import Carteira from "./pages/Carteira";
import FluxoMensal from "./pages/FluxoMensal";
import Diagnostico from "./pages/Diagnostico";
import { ProtectedRoute } from "./components/ProtectedRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login - sem proteção */}
        <Route path="/" element={<Login />} />

        {/* Rotas protegidas - requer autenticação */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cliente/:id"
          element={
            <ProtectedRoute>
              <ClienteFicha />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cliente/:id/objetivos"
          element={
            <ProtectedRoute>
              <Objetivos />
            </ProtectedRoute>
          }
        />
        <Route
          path="/objetivo/:clienteId/:objetivoIndex"
          element={
            <ProtectedRoute>
              <ObjetivoDetalhes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cliente/:id/carteira"
          element={
            <ProtectedRoute>
              <Carteira />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cliente/:id/fluxo"
          element={
            <ProtectedRoute>
              <FluxoMensal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cliente/:id/diagnostico"
          element={
            <ProtectedRoute>
              <Diagnostico />
            </ProtectedRoute>
          }
        />

        {/* Rota padrão - redireciona para login */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
