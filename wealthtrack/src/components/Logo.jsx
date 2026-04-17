/**
 * Componente Logo Reutilizável
 * Variantes:
 * - navbar: Logo pequenininho na navbar (altura 40px)
 * - login: Logo grande na página de login (altura 80px)
 * - icon-only: Apenas o ícone/símbolo (PI)
 */
export function Logo({ variant = "navbar", className = "" }) {
  const logoVariants = {
    navbar: {
      height: "40px",
      width: "auto",
      className: "logo-navbar",
    },
    login: {
      height: "80px",
      width: "auto",
      className: "logo-login",
    },
    "icon-only": {
      height: "32px",
      width: "32px",
      className: "logo-icon",
    },
  };

  const config = logoVariants[variant] || logoVariants.navbar;

  return (
    <div className={`logo logo-${variant} ${className}`}>
      {/* NOTA: Quando o logo for enviado, ele será colocado aqui */}

      {variant === "navbar" && (
        <div className="logo-navbar-container">
          {/* Logo Icon - Placeholder até enviar o arquivo real */}
          <div style={{
            height: "28px",
            width: "28px",
            background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontSize: "16px",
            fontWeight: "bold",
            flexShrink: 0
          }}>P</div>
          {/* Logo Text */}
          <span style={{
            fontSize: "14px",
            fontWeight: "600",
            color: "#F0EBD8",
            letterSpacing: "-0.5px"
          }}>Porto Invest</span>
        </div>
      )}

      {variant === "login" && (
        <div className="logo-login-container">
          {/* Logo completo centralizado */}
          <img
            src="/assets/logo/logo-full.svg"
            alt="Porto Invest"
            className="logo-full-img"
            style={{ height: "80px", width: "auto" }}
          />
        </div>
      )}

      {variant === "icon-only" && (
        <img
          src="/assets/logo/logo-icon.svg"
          alt="PI"
          className="logo-icon-img"
          style={{ height: "32px", width: "32px" }}
        />
      )}

      {/* FALLBACK: Placeholder visual enquanto logo não é enviado */}
      <style>{`
        .logo {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .logo-navbar-container {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .logo-navbar-container:hover {
          opacity: 0.8;
        }

        .logo-login-container {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Placeholder visual enquanto imagem carrega */
        .logo-icon-img[src=""],
        .logo-text-img[src=""],
        .logo-full-img[src=""] {
          background: linear-gradient(135deg, #1a3560 0%, #0d2040 100%);
          border-radius: 8px;
          animation: shimmer 2s infinite;
        }

        @keyframes shimmer {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/**
 * USO:
 *
 * // Na Navbar
 * <Logo variant="navbar" />
 *
 * // Na página de login
 * <Logo variant="login" />
 *
 * // Apenas o ícone
 * <Logo variant="icon-only" />
 */
