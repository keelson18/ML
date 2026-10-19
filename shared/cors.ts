export function resolveCorsOrigin(requestOrigin: string | null, configuredOrigins: string, allowLoopbackPorts = false): string | undefined {
  if (!requestOrigin) return undefined;

  let requested: URL;
  try {
    requested = new URL(requestOrigin);
  } catch {
    return undefined;
  }
  if (requested.origin !== requestOrigin) return undefined;

  const allowlist = configuredOrigins.split(',').map((origin) => origin.trim()).filter(Boolean);
  for (const configured of allowlist) {
    try {
      if (new URL(configured).origin === requested.origin) return requested.origin;
    } catch {
      continue;
    }
  }

  if (allowLoopbackPorts && requested.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(requested.hostname)) {
    return requested.origin;
  }

  return undefined;
}
