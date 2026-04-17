import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";

/**
 * Hook customizado para gerenciar autenticação
 * Verifica se o usuário está logado e fornece dados de autenticação
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      try {
        setUser(currentUser);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return { user, loading, error, isAuthenticated: !!user };
}
