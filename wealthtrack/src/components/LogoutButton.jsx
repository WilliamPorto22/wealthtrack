import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { logError } from "../utils/errorHandler";

/**
 * Botão de logout reutilizável
 */
export function LogoutButton({ style = {}, className = "" }) {
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await signOut(auth);
      navigate("/", { replace: true });
    } catch (error) {
      logError("Logout", error);
      console.error("Erro ao fazer logout:", error);
    }
  }

  return (
    <button
      className={className}
      onClick={handleLogout}
      style={{
        background: "rgba(239, 68, 68, 0.1)",
        border: "0.5px solid rgba(239, 68, 68, 0.3)",
        borderRadius: 6,
        color: "#ef4444",
        fontSize: 10,
        padding: "6px 14px",
        cursor: "pointer",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        fontFamily: "inherit",
        ...style,
      }}
      title="Sair da plataforma"
    >
      Logout
    </button>
  );
}
