import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Componente que protege rotas
 * Redireciona para login se o usuário não estiver autenticado
 */
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0D1321",
        fontFamily: "-apple-system, 'SF Pro Display', sans-serif",
        color: "#F0EBD8"
      }}>
        <div style={{ fontSize: 14, color: "#748CAB" }}>Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return children;
}
