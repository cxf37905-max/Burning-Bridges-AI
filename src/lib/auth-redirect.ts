export function authRedirect(path?: string | null) {
  if (
    !path ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    /\p{Cc}/u.test(path)
  )
    return '/#studio';
  return path;
}

export function authCallbackUrl(
  path: string | null | undefined,
  origin: string
) {
  return new URL(authRedirect(path), origin).href;
}
