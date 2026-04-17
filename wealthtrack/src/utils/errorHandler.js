/**
 * Utilitários para tratamento de erros
 * Converte erros em mensagens amigáveis ao usuário
 */

export function getErrorMessage(error) {
  // Erros do Firebase
  if (error.code === "auth/user-not-found") {
    return "Usuário não encontrado";
  }
  if (error.code === "auth/wrong-password") {
    return "Senha incorreta";
  }
  if (error.code === "auth/email-already-in-use") {
    return "E-mail já registrado";
  }
  if (error.code === "auth/weak-password") {
    return "Senha muito fraca";
  }
  if (error.code === "auth/invalid-email") {
    return "E-mail inválido";
  }
  if (error.code === "permission-denied") {
    return "Sem permissão para acessar";
  }

  // Erros de rede
  if (error.message && error.message.includes("Failed to fetch")) {
    return "Erro de conexão. Verifique sua internet";
  }

  // Erros genéricos
  if (error.message) {
    return error.message;
  }

  return "Erro desconhecido. Tente novamente";
}

/**
 * Log de erro com contexto
 */
export function logError(context, error) {
  console.error(`[${context}]`, {
    message: error.message,
    code: error.code,
    timestamp: new Date().toISOString(),
  });

  // Em produção, enviar para serviço de logging
  // ex: Sentry, DataDog, etc
}

/**
 * Wrapper para operações assíncronas com tratamento de erro
 */
export async function safeAsync(operation, context = "Operation") {
  try {
    return await operation();
  } catch (error) {
    logError(context, error);
    throw new Error(getErrorMessage(error));
  }
}
