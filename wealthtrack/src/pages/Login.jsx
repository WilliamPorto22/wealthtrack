import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { T, C } from "../theme";
import { isValidEmail, getValidationError } from "../utils/validators";
import { getErrorMessage, logError } from "../utils/errorHandler";
import { Message } from "../components/Message";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const navigate = useNavigate();

  function validarFormulario() {
    // Validar email
    const emailErr = getValidationError("Email", email, "email");
    setEmailError(emailErr || "");

    // Validar senha
    if (!senha || senha.length < 6) {
      setErro("Senha deve ter no mínimo 6 caracteres");
      return false;
    }

    if (emailErr) {
      setErro("Corrija os erros antes de continuar");
      return false;
    }

    return true;
  }

  async function entrar() {
    setErro("");
    setEmailError("");

    if (!validarFormulario()) return;

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), senha);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      const mensagem = getErrorMessage(e);
      setErro(mensagem);
      logError("Login", e);
    }
    setLoading(false);
  }

  function onKey(e) {
    if (e.key === "Enter" && !loading) entrar();
  }

  return (
    <div className="login-container">
      <div className="login-wrapper">

        {/* Logo */}
        <div className="login-logo-section">
          <div className="login-logo-content">
            <div className="login-logo">
              <span>WP</span>
            </div>
            <div>
              <div className="login-brand-name">William Porto</div>
              <div className="login-brand-subtitle">Assessor de Investimentos</div>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="login-card">
          <div className="login-header">
            <div className="login-title">Acesso à plataforma</div>
            <div className="login-subtitle">Ambiente exclusivo de gestão patrimonial</div>
          </div>

          <div className="form-group">
            <label className="form-label">E-mail</label>
            <input
              className="form-input"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e=>{setEmail(e.target.value);setEmailError("");}}
              onKeyDown={onKey}
              disabled={loading}
              style={{
                borderColor: emailError ? "#ef4444" : undefined,
                opacity: loading ? 0.6 : 1,
              }}
            />
            {emailError && <div style={{fontSize:11,color:"#ef4444",marginTop:4}}>{emailError}</div>}
          </div>

          <div className="form-group">
            <label className="form-label">Senha</label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={senha}
              onChange={e=>setSenha(e.target.value)}
              onKeyDown={onKey}
              disabled={loading}
              style={{opacity: loading ? 0.6 : 1}}
            />
          </div>

          {erro && <Message text={erro} type="error" duration={5000} onClose={()=>setErro("")} />}

          <div className="login-button-wrapper">
            <button className="btn btn-primary" onClick={entrar} disabled={loading}>
              {loading ? "Acessando..." : "Entrar"}
            </button>
          </div>

          <div className="login-footer">
            Acesso seguro · Dados protegidos
          </div>
        </div>
      </div>
    </div>
  );
}