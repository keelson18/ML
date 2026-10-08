export async function readJsonSafe<T>(response: Response): Promise<{ raw: string; payload: T | null }> {
  const raw = await response.text();
  if (!raw) return { raw, payload: null };
  try {
    return { raw, payload: JSON.parse(raw) as T };
  } catch {
    return { raw, payload: null };
  }
}
