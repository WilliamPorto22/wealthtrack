import { useNavigate } from "react-router-dom";
import { LogoutButton } from "./LogoutButton";
import { Logo } from "./Logo";
import "../styles/navbar.css";

/**
 * Navbar padronizada para todas as páginas
 * - Logo consistente
 * - Data do dia
 * - Botões de ação
 * - Logout
 */
export function Navbar({
  showSearch = false,
  searchValue = "",
  onSearchChange = null,
  actionButtons = [],
  title = null,
  showLogout = false,
}) {
  const navigate = useNavigate();

  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <nav className="navbar navbar-container">
      {/* Logo + Branding */}
      <div className="navbar-brand" onClick={() => navigate("/dashboard")}>
        <Logo variant="navbar" />
      </div>

      {/* Center: Data + Search */}
      <div className="navbar-center">
        {showSearch && onSearchChange && (
          <div className="navbar-search">
            <input
              type="text"
              className="navbar-search-input"
              placeholder="Pesquisar..."
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            <svg
              className="navbar-search-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
          </div>
        )}

        <span className="navbar-date">{hoje}</span>
      </div>

      {/* Right: Ações + Logout */}
      <div className="navbar-actions">
        {actionButtons.map((btn, idx) => (
          <button
            key={idx}
            className={`navbar-action-btn ${btn.variant || ""}`}
            onClick={btn.onClick}
            disabled={btn.disabled}
            title={btn.title}
          >
            {btn.icon && <span className="navbar-btn-icon">{btn.icon}</span>}
            {btn.label && <span className="navbar-btn-label">{btn.label}</span>}
          </button>
        ))}

        {showLogout && <LogoutButton />}
      </div>
    </nav>
  );
}
