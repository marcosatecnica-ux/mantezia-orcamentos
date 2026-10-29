export type OficinaAccess = {
  oficinaAtiva: boolean;
  estado: 'ativa' | 'desativada' | 'indisponivel';
  code?: 'OFICINA_DESATIVADA' | 'OFICINA_AUTORIZACAO_INDISPONIVEL';
  error?: string;
};

export const oficinaUnavailable = (): OficinaAccess => ({ oficinaAtiva: false, estado: 'indisponivel',
  code: 'OFICINA_AUTORIZACAO_INDISPONIVEL',
  error: 'Não foi possível confirmar a autorização da Oficina. Novas operações estão bloqueadas; o histórico continua disponível.' });

// Sem cache positivo: cada operação confirma a autorização na mesma Central.
// environment é obtido da configuração/organização do servidor, nunca do corpo HTTP.
export async function readOficinaAccess(environment: string | undefined,
  env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch): Promise<OficinaAccess> {
  try {
    const base = env.CENTRAL_MANTEZIA_URL?.trim().replace(/\/+$/, '');
    const key = env.CENTRAL_INTEGRATION_KEY?.trim();
    if (!base || !key || !environment?.trim()) return oficinaUnavailable();
    const url = new URL(base);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      return oficinaUnavailable();
    }
    const response = await request(`${base}/api/integration/oficina/${encodeURIComponent(environment)}`, {
      headers: { 'x-mantezia-key': key }, redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return oficinaUnavailable();
    const data = await response.json();
    if (data?.environment !== environment || typeof data?.companyId !== 'string' || !data.companyId ||
        typeof data?.oficinaAtiva !== 'boolean') return oficinaUnavailable();
    return data.oficinaAtiva
      ? { oficinaAtiva: true, estado: 'ativa' }
      : { oficinaAtiva: false, estado: 'desativada', code: 'OFICINA_DESATIVADA',
          error: 'Mantezia Oficina desativada para esta empresa. O histórico permanece disponível. Procure a administração.' };
  } catch { return oficinaUnavailable(); }
}

export function denyOficina(res: { status(code: number): any }, access: OficinaAccess): boolean {
  if (access.oficinaAtiva) return false;
  res.status(access.estado === 'desativada' ? 403 : 503).json(access);
  return true;
}
