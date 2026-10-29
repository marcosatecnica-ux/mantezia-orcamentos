import type { Express, Request, Response } from 'express';
import type { Pool } from 'pg';
import { readOficinaAccess, denyOficina, oficinaUnavailable } from './oficina-access';

export function registerOficinaGuard(app: Express, options: {
  pool: Pool | null;
  keyValid: (req: Request) => boolean;
  env?: NodeJS.ProcessEnv;
  readAccess?: typeof readOficinaAccess;
}) {
  const { pool, keyValid, env = process.env, readAccess = readOficinaAccess } = options;
  const authorize = async (req: Request, res: Response, requireActive = true) => {
    if (!keyValid(req)) { res.status(401).json({ error: 'Oficina exige servidor autorizado.' }); return false; }
    if (!pool || !env.COMPANY_ID?.trim()) { denyOficina(res, oficinaUnavailable()); return false; }
    // A organização configurada no servidor determina o ambiente; o payload não o escolhe.
    const organization = await pool.query('select environment_code from orcamentos.organizations where id=$1', [env.COMPANY_ID.trim()]);
    if (organization.rowCount !== 1) { denyOficina(res, oficinaUnavailable()); return false; }
    // O header só é aceito junto da chave interna e deve concordar com o banco local.
    if (req.headers['x-mantezia-environment'] !== organization.rows[0].environment_code) {
      res.status(403).json({ error: 'Empresa de origem não corresponde ao Orçamentos.' }); return false;
    }
    if (!requireActive) return true;
    const access = organization.rowCount === 1
      ? await readAccess(organization.rows[0].environment_code, env) : oficinaUnavailable();
    return !denyOficina(res, access);
  };

  app.use('/api/orcamentos', async (req, res, next) => {
    try {
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        // A listagem comum não inclui Oficina. Consultas internas que a incluem
        // precisam provar também o tenant, sem exigir produto ativo para histórico.
        if (req.headers['x-mantezia-environment'] && !(await authorize(req, res, false))) return;
        return next();
      }
      if (!pool || !env.COMPANY_ID?.trim()) return next(); // Rotas existentes já falham sem banco/empresa.
      // Para edição, a classificação vem da proposta persistida e não do navegador.
      const quoteId = req.path.split('/').filter(Boolean)[0];
      let oficina = false;
      if (quoteId) {
        const quote = await pool.query('select source_order_code from orcamentos.quotes where id=$1 and organization_id=$2',
          [quoteId, env.COMPANY_ID.trim()]);
        oficina = quote.rows.some(row => String(row.source_order_code || '').startsWith('OF-'));
      } else {
        oficina = String(req.body?.sourceOrderCode || '').startsWith('OF-');
        // Impede reclassificar como comum uma origem de Oficina já persistida.
        if (req.body?.sourceOrderId) {
          const existing = await pool.query('select source_order_code from orcamentos.quotes where source_order_id::text=$1 and organization_id=$2',
            [String(req.body.sourceOrderId), env.COMPANY_ID.trim()]);
          oficina ||= existing.rows.some(row => String(row.source_order_code || '').startsWith('OF-'));
        }
      }
      if (oficina && !(await authorize(req, res))) return;
      return next();
    } catch { denyOficina(res, oficinaUnavailable()); }
  });

  app.use('/internal/oficina', async (req, res, next) => {
    // Consultas autenticadas ao histórico permanecem disponíveis, inclusive as POST.
    const reads = ['/consultar-orcamentos', '/cliente-orcamentos', '/gestao-orcamentos', '/fila-aprovados'];
    try {
      if (!(await authorize(req, res, !(req.method === 'POST' && reads.includes(req.path))))) return;
      return next();
    } catch { denyOficina(res, oficinaUnavailable()); }
  });
}
