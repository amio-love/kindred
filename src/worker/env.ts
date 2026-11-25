export interface Env {
  DB: D1Database
  ASSETS: Fetcher
}

export const SESSION_COOKIE_NAME = 'kindred_session'

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function randomToken(prefix: string, byteLength = 24): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${prefix}${hex}`
}

export function randomShareCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => alphabet[b % alphabet.length]!)
    .join('')
}

export function parseSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=')
    if (rawKey === SESSION_COOKIE_NAME) {
      const value = rest.join('=').trim()
      return value ? decodeURIComponent(value) : null
    }
  }
  return null
}

export function buildSessionCookie(token: string, requestUrl: string): string {
  const isHttps = requestUrl.startsWith('https://')
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=2592000',
  ]
  if (isHttps) parts.push('Secure')
  return parts.join('; ')
}

export function buildClearSessionCookie(requestUrl: string): string {
  const isHttps = requestUrl.startsWith('https://')
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (isHttps) parts.push('Secure')
  return parts.join('; ')
}
