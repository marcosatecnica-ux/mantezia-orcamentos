-- MANTEZIA OFICINA 0.3.6 — EXECUTAR SOMENTE NO BANCO DESCARTAVEL DE HOMOLOGACAO, FUTURAMENTE.
-- NUNCA no Supabase de producao sem homologacao e janela de migracao aprovada.
-- A instalacao local dos fontes NAO executa este arquivo.
BEGIN;
CREATE SCHEMA IF NOT EXISTS mantezia_oficina_private;
REVOKE ALL ON SCHEMA mantezia_oficina_private FROM PUBLIC;

-- Legado 0.3.4: um tecnico e um cliente por OS (autoridade de vinculacao).
CREATE TABLE IF NOT EXISTS mantezia_oficina_private.claims (
    ambiente text NOT NULL, ordem_id text NOT NULL,
    tecnico_id text NOT NULL, tecnico_nome text NOT NULL,
    assumida_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(ambiente, ordem_id)
);
CREATE TABLE IF NOT EXISTS mantezia_oficina_private.customer_links (
    ambiente text NOT NULL, ordem_id text NOT NULL,
    cliente_id text NOT NULL, vinculado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(ambiente, ordem_id)
);

-- Fonte de verdade: cada OS da Oficina em sua linha, com revisao otimista.
CREATE TABLE IF NOT EXISTS mantezia_oficina_private.orders (
    ambiente text NOT NULL,
    ordem_id text NOT NULL,
    conteudo jsonb NOT NULL CHECK(jsonb_typeof(conteudo)='object'),
    revisao bigint NOT NULL DEFAULT 1 CHECK(revisao>=1),
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(ambiente, ordem_id)
);
CREATE INDEX IF NOT EXISTS idx_oficina_orders_ambiente_atualizado
  ON mantezia_oficina_private.orders(ambiente,atualizado_em DESC);

-- Envio garantido: outbox por OS, com reserva e retry entre varias replicas.
CREATE TABLE IF NOT EXISTS mantezia_oficina_private.outbox (
    ambiente text NOT NULL,
    ordem_id text NOT NULL,
    payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
    criado_em timestamptz NOT NULL DEFAULT now(),
    enviado_em timestamptz,
    orcamento_id text,
    tentativas integer NOT NULL DEFAULT 0,
    reservado_ate timestamptz,
    proxima_tentativa timestamptz NOT NULL DEFAULT now(),
    ultimo_erro text,
    PRIMARY KEY(ambiente,ordem_id),
    FOREIGN KEY(ambiente,ordem_id)
      REFERENCES mantezia_oficina_private.orders(ambiente,ordem_id)
);
CREATE INDEX IF NOT EXISTS idx_oficina_outbox_pendentes
  ON mantezia_oficina_private.outbox(ambiente,proxima_tentativa,criado_em)
  WHERE enviado_em IS NULL;

-- Importacao apenas de OS legadas, se existirem no estado original.
-- Use banco desligado para escrita durante esta migracao.
-- O JSON antigo permanece intocado para recuperacao e auditoria.
DO $migracao$
BEGIN
  IF to_regclass('public.mantezia_mvp_state') IS NOT NULL THEN
    INSERT INTO mantezia_oficina_private.orders (ambiente,ordem_id,conteudo)
    SELECT substring(s.chave from 11), v.ordem->>'id', v.ordem
      FROM public.mantezia_mvp_state s
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.conteudo->'oficinaOrdens')='array'
          THEN s.conteudo->'oficinaOrdens' ELSE '[]'::jsonb END
      ) AS v(ordem)
      WHERE left(s.chave,10)='principal:'
        AND (v.ordem->>'id') ~ '^[A-Za-z0-9_-]{20,64}$'
    ON CONFLICT (ambiente,ordem_id) DO NOTHING;
  END IF;
END $migracao$;

REVOKE ALL ON TABLE mantezia_oficina_private.claims FROM PUBLIC;
REVOKE ALL ON TABLE mantezia_oficina_private.customer_links FROM PUBLIC;
REVOKE ALL ON TABLE mantezia_oficina_private.orders FROM PUBLIC;
REVOKE ALL ON TABLE mantezia_oficina_private.outbox FROM PUBLIC;
ALTER TABLE mantezia_oficina_private.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE mantezia_oficina_private.customer_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE mantezia_oficina_private.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE mantezia_oficina_private.outbox ENABLE ROW LEVEL SECURITY;
COMMIT;

-- O papel privado de banco utilizado no backend precisa possuir acesso apropriado.
-- Nao adicionar policies anon/authenticated nem conceder grants a PUBLIC.
-- EXECUTE no futuro, num banco isolado, apos garantir o papel e os backups.
