export function authRedirect(path?: string | null) {
  if (
    !path ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\')
  )
    return '/#studio';
  return path;
}
