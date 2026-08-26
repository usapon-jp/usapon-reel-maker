export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {error?: string} | null;
    throw new Error(payload?.error ?? `通信に失敗しました (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function uploadFile<T>(url: string, file: File, extra?: Record<string, string>): Promise<T> {
  const form = new FormData();
  form.set('file', file);
  for (const [key, value] of Object.entries(extra ?? {})) form.set(key, value);
  return api<T>(url, {method: 'POST', body: form});
}
