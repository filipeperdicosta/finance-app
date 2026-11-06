// Regras e mensagens (PT) para recuperar / alterar a password.
// Funções puras — sem React nem Supabase — para se poderem testar em Node.

export const MIN_PASSWORD_LENGTH = 8

// Devolve a primeira queixa (pela ordem do formulário) ou null se estiver tudo bem.
// `actual` só se passa ao alterar a password nas Definições; no fluxo de recuperação
// (link do email) não existe password actual, por isso omite-se.
export function validateNewPassword(
  { nova, confirmar, actual }: { nova: string; confirmar: string; actual?: string },
): string | null {
  if (actual !== undefined && actual === '') return 'Escreve a password actual.'
  if (nova.length < MIN_PASSWORD_LENGTH) return `A nova password precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
  if (nova !== confirmar) return 'As duas passwords não coincidem.'
  if (actual !== undefined && nova === actual) return 'A nova password tem de ser diferente da actual.'
  return null
}

type AuthErrorLike = { code?: string; name?: string; status?: number; message?: string; reasons?: string[] }

// Traduz os erros do Supabase Auth que podem aparecer nestes fluxos. Nota: `invalid_credentials`
// só chega aqui ao confirmar a password actual (o login normal mostra a sua própria mensagem).
// Um erro desconhecido mostra a mensagem original, para o diagnóstico não ficar escondido.
export function authErrorPT(err: unknown): string {
  const e: AuthErrorLike = err && typeof err === 'object' ? (err as AuthErrorLike) : {}
  const msg = typeof e.message === 'string' ? e.message : ''
  const code = e.code ?? ''
  const low = msg.toLowerCase()

  // "For security purposes, you can only request this after 52 seconds." — espera por pedido
  const secs = low.includes('security purposes') ? low.match(/(?:after|every) (\d+) seconds?/)?.[1] : undefined

  if (code === 'invalid_credentials') return 'A password actual está errada.'
  if (secs) return `Aguarda ${secs} segundos antes de pedir outro link.`
  if (code === 'over_email_send_rate_limit') return 'O limite de emails do Supabase foi atingido. Tenta mais tarde (pode demorar até uma hora).'
  if (code === 'over_request_rate_limit' || e.status === 429 || low.includes('rate limit')) {
    return 'Muitas tentativas seguidas. Aguarda um minuto e tenta outra vez.'
  }
  if (code === 'email_address_not_authorized') {
    return 'Este email não pode receber mensagens: o serviço de email gratuito do Supabase só envia para membros da organização. É preciso configurar um servidor de email próprio (SMTP).'
  }
  if (code === 'same_password') return 'A nova password tem de ser diferente da actual.'
  if (code === 'weak_password') {
    return e.reasons?.includes('pwned')
      ? 'Essa password já apareceu em fugas de dados conhecidas. Escolhe outra.'
      : 'Password demasiado fraca. Usa mais caracteres e mistura letras, números e símbolos.'
  }
  if (
    code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found' || code === 'bad_code_verifier' ||
    low.includes('invalid or has expired')
  ) return 'O link expirou ou já foi usado. Pede um novo link.'
  if (code === 'pkce_code_verifier_not_found' || e.name === 'AuthPKCECodeVerifierMissingError') {
    return 'Este link só funciona no aparelho e no browser onde o pediste. Pede um novo link a partir deste aparelho.'
  }
  if (code === 'session_not_found' || e.name === 'AuthSessionMissingError') return 'A sessão expirou. Entra outra vez ou pede um novo link.'
  if (code === 'reauthentication_needed') return 'Por segurança, termina a sessão, entra outra vez e tenta de novo.'
  return msg ? `Não foi possível concluir (${msg}). Tenta outra vez.` : 'Não foi possível concluir. Tenta outra vez.'
}
