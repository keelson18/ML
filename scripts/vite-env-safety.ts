const SERVER_ONLY_CLIENT_NAME = /(?:SERVICE_ROLE|SECRET|PRIVATE_KEY|PASSWORD|ACCESS_TOKEN)/i;

/** Stops Vite before it can inline server credentials into browser code. */
export function assertSafeViteEnvironment(env: Record<string, string | undefined>): void {
  const serverKeys = [env.SUPABASE_SECRET_KEY, env.SUPABASE_SERVICE_ROLE_KEY]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const exposedNames = Object.entries(env)
    .filter(([name, value]) => name.startsWith('VITE_') && (
      SERVER_ONLY_CLIENT_NAME.test(name)
      || Boolean(value && serverKeys.includes(value))
    ))
    .map(([name]) => name);

  if (exposedNames.length > 0) {
    throw new Error(
      `Refusing to start Vite: server-only environment variable(s) would be exposed to the browser: ${exposedNames.join(', ')}. Use public client credentials and rotate any service-role key that may have been exposed.`,
    );
  }
}
