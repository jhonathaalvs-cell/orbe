export function firebaseErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "Este e-mail já possui cadastro. Entre na sua conta.",
    "auth/invalid-email": "Informe um e-mail válido.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/weak-password": "Use uma senha com pelo menos 6 caracteres.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "permission-denied": "O Firestore recusou a operação. Publique as regras de segurança incluídas no projeto.",
    "unavailable": "Firebase indisponível no momento. Verifique sua conexão e tente novamente.",
  };
  return messages[error?.code] || "Não foi possível concluir. Confira as configurações do Firebase e tente novamente.";
}
