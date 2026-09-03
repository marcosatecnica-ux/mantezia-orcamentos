import 'dotenv/config';
import express from 'express';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

const app = express();
const PORT = Number(process.env.PORT || 3100);

app.use(express.json({ limit: '10mb' }));

const databaseUrl = process.env.DATABASE_URL?.trim();
const operacionalUrl =
  process.env.OPERACIONAL_MANTEZIA_URL?.replace(/\/$/, '');

const orcamentosIntegrationKey =
  process.env.ORCAMENTOS_INTEGRATION_KEY?.trim();

const openaiApiKey =
  process.env.OPENAI_API_KEY?.trim();

const openaiModel =
  process.env.OPENAI_MODEL?.trim();

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl:
        process.env.DATABASE_SSL === 'true'
          ? { rejectUnauthorized: false }
          : undefined
    })
  : null;

app.get('/api/health', async (_req, res) => {
  if (!pool) {
    return res.status(503).json({
      status: 'erro',
      module: 'mantezia-orcamentos',
      version: '0.1.0',
      database: 'não configurado',
      timestamp: new Date().toISOString()
    });
  }

  try {
    await pool.query('select 1');

    return res.json({
      status: 'ok',
      module: 'mantezia-orcamentos',
      version: '0.1.0',
      database: 'PostgreSQL conectado',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(
      '[Mantezia Orçamentos] PostgreSQL indisponível:',
      error instanceof Error ? error.message : error
    );

    return res.status(503).json({
      status: 'erro',
      module: 'mantezia-orcamentos',
      version: '0.1.0',
      database: 'PostgreSQL indisponível',
      timestamp: new Date().toISOString()
    });
  }
});


app.get('/api/orcamentos', async (_req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'Banco de dados não configurado.'
    });
  }

  const organizationId = process.env.COMPANY_ID?.trim();
  const environment = process.env.COMPANY_ENVIRONMENT?.trim();

  if (!organizationId) {
    return res.status(503).json({
      error: 'COMPANY_ID não configurado.'
    });
  }

  try {
    const result = await pool.query(
      `
      select
        q.id,
        q.code,
        q.source_order_id,
        q.source_order_code,
        q.client_id,
        q.client_name,
        q.client_phone,
        q.client_email,
        q.address,
        q.equipment,
        q.equipment_details,
        q.technician_id,
        q.technician_name,
        q.technical_diagnosis,
        q.technical_cause,
        q.technical_recommendation,
        q.status,
        q.valid_until,
        q.warranty_days,
        q.execution_days,
        q.payment_terms,
        q.notes,
        q.subtotal,
        q.discount,
        q.total,
        q.approved_at,
        q.rejected_at,
        q.converted_order_id,
        q.converted_order_code,
        q.created_at,
        q.updated_at,
        coalesce(
          (
            select json_agg(
              json_build_object(
                'id', i.id,
                'description', i.description,
                'quantity', i.quantity,
                'unitPrice', i.unit_price,
                'total', i.total,
                'sortOrder', i.sort_order
              )
              order by i.sort_order, i.created_at
            )
            from orcamentos.quote_items i
            where i.quote_id = q.id
          ),
          '[]'::json
        ) as items
      from orcamentos.quotes q
      where q.organization_id = $1
      order by q.created_at desc
      `,
      [organizationId]
    );

    return res.json({
      organizationId,
      environment,
      total: result.rowCount,
      orcamentos: result.rows
    });
  } catch (error) {
    console.error(
      '[Mantezia Orçamentos] Erro ao listar orçamentos:',
      error instanceof Error ? error.message : error
    );

    return res.status(503).json({
      error: 'Não foi possível carregar os orçamentos.'
    });
  }
});

app.post('/api/orcamentos', async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'Banco de dados não configurado.'
    });
  }

  const organizationId = process.env.COMPANY_ID?.trim();

  if (!organizationId) {
    return res.status(503).json({
      error: 'COMPANY_ID não configurado.'
    });
  }

  const clientId =
    String(req.body?.clientId || '').trim() || null;

  const clientName = String(req.body?.clientName || '').trim();
  const clientPhone = String(req.body?.clientPhone || '').trim() || null;
  const clientEmail = String(req.body?.clientEmail || '').trim() || null;
  const address = String(req.body?.address || '').trim() || null;

  const equipment = String(req.body?.equipment || '').trim();
  const equipmentDetails =
    String(req.body?.equipmentDetails || '').trim() || null;

  const technicianId =
    String(req.body?.technicianId || '').trim() || null;

  const technicianName =
    String(req.body?.technicianName || '').trim() || null;

  const technicalDiagnosis =
    String(req.body?.technicalDiagnosis || '').trim() || null;

  const technicalCause =
    String(req.body?.technicalCause || '').trim() || null;

  const technicalRecommendation =
    String(req.body?.technicalRecommendation || '').trim() || null;

  const validUntil =
    String(req.body?.validUntil || '').trim() || null;

  const paymentTerms =
    String(req.body?.paymentTerms || '').trim() || null;

  const notes =
    String(req.body?.notes || '').trim() || null;

  const sourceOrderId =
    String(req.body?.sourceOrderId || '').trim() || null;

  const sourceOrderCode =
    String(req.body?.sourceOrderCode || '').trim() || null;

  const warrantyDays = Math.max(
    0,
    Number(req.body?.warrantyDays ?? 90) || 0
  );

  const executionDays =
    req.body?.executionDays == null ||
    req.body?.executionDays === ''
      ? null
      : Math.max(0, Number(req.body.executionDays) || 0);

  if (clientName.length < 2) {
    return res.status(400).json({
      error: 'Informe o cliente.'
    });
  }

  if (equipment.length < 2) {
    return res.status(400).json({
      error: 'Informe o equipamento.'
    });
  }

  const rawItems = Array.isArray(req.body?.items)
    ? req.body.items
    : [];

  const items = rawItems.map((item: any, index: number) => {
    const description =
      String(item?.description || '').trim();

    const quantity =
      Number(item?.quantity ?? 1);

    const unitPrice =
      Number(item?.unitPrice ?? 0);

    return {
      description,
      quantity,
      unitPrice,
      sortOrder: index
    };
  });

  if (
    items.some(item =>
      !item.description ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      !Number.isFinite(item.unitPrice) ||
      item.unitPrice < 0
    )
  ) {
    return res.status(400).json({
      error: 'Há itens inválidos no orçamento.'
    });
  }

  const subtotal = Number(
    items
      .reduce(
        (sum, item) =>
          sum + item.quantity * item.unitPrice,
        0
      )
      .toFixed(2)
  );

  const discount = Number(
    Number(req.body?.discount || 0).toFixed(2)
  );

  if (
    !Number.isFinite(discount) ||
    discount < 0 ||
    discount > subtotal
  ) {
    return res.status(400).json({
      error: 'Desconto inválido.'
    });
  }

  const total = Number(
    (subtotal - discount).toFixed(2)
  );

  const client = await pool.connect();

  try {
    await client.query('begin');

    // Evita que duas requisições simultâneas gerem o mesmo código.
    await client.query(
      `select pg_advisory_xact_lock(hashtext($1))`,
      [`mantezia-orcamentos:${organizationId}`]
    );

    const year = new Date().getFullYear();

    const counter = await client.query(
      `
      select
        coalesce(
          max(split_part(code, '-', 3)::integer),
          0
        ) + 1 as next_number
      from orcamentos.quotes
      where organization_id = $1
        and code like $2
        and code ~ '^ORC-[0-9]{4}-[0-9]+$'
      `,
      [
        organizationId,
        `ORC-${year}-%`
      ]
    );

    const nextNumber =
      Number(counter.rows[0]?.next_number || 1);

    const code =
      `ORC-${year}-${String(nextNumber).padStart(4, '0')}`;

    const quote = await client.query(
      `
      insert into orcamentos.quotes (
        organization_id,
        code,
        source_order_id,
        source_order_code,
        client_id,
        client_name,
        client_phone,
        client_email,
        address,
        equipment,
        equipment_details,
        technician_id,
        technician_name,
        technical_diagnosis,
        technical_cause,
        technical_recommendation,
        status,
        valid_until,
        warranty_days,
        execution_days,
        payment_terms,
        notes,
        subtotal,
        discount,
        total
      )
      values (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13,$14,$15,$16,
        'draft',$17,$18,$19,$20,$21,
        $22,$23,$24
      )
      returning *
      `,
      [
        organizationId,
        code,
        sourceOrderId,
        sourceOrderCode,
        clientId,
        clientName,
        clientPhone,
        clientEmail,
        address,
        equipment,
        equipmentDetails,
        technicianId,
        technicianName,
        technicalDiagnosis,
        technicalCause,
        technicalRecommendation,
        validUntil,
        warrantyDays,
        executionDays,
        paymentTerms,
        notes,
        subtotal,
        discount,
        total
      ]
    );

    const quoteId = quote.rows[0].id;

    const savedItems = [];

    for (const item of items) {
      const result = await client.query(
        `
        insert into orcamentos.quote_items (
          quote_id,
          description,
          quantity,
          unit_price,
          sort_order
        )
        values ($1,$2,$3,$4,$5)
        returning
          id,
          description,
          quantity,
          unit_price,
          total,
          sort_order
        `,
        [
          quoteId,
          item.description,
          item.quantity,
          item.unitPrice,
          item.sortOrder
        ]
      );

      savedItems.push(result.rows[0]);
    }

    await client.query(
      `
      insert into orcamentos.quote_status_history (
        quote_id,
        previous_status,
        new_status,
        changed_by,
        reason
      )
      values ($1, null, 'draft', $2, $3)
      `,
      [
        quoteId,
        technicianName || 'Mantezia Orçamentos',
        sourceOrderId
          ? 'Orçamento originado de Ordem de Serviço'
          : 'Orçamento criado diretamente'
      ]
    );

    await client.query('commit');

    return res.status(201).json({
      ok: true,
      orcamento: {
        ...quote.rows[0],
        items: savedItems
      }
    });
  } catch (error: any) {
    await client.query('rollback');

    if (
      error?.code === '23505' &&
      sourceOrderId
    ) {
      return res.status(409).json({
        error:
          'Esta Ordem de Serviço já possui um orçamento.'
      });
    }

    console.error(
      '[Mantezia Orçamentos] Erro ao criar orçamento:',
      error instanceof Error ? error.message : error
    );

    return res.status(503).json({
      error: 'Não foi possível criar o orçamento.'
    });
  } finally {
    client.release();
  }
});
app.put('/api/orcamentos/:id', async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'Banco de dados não configurado.'
    });
  }

  const organizationId =
    process.env.COMPANY_ID?.trim();

  if (!organizationId) {
    return res.status(503).json({
      error: 'COMPANY_ID não configurado.'
    });
  }

  const quoteId =
    String(req.params.id || '').trim();

  const validUntil =
    String(req.body?.validUntil || '').trim() || null;

  const warrantyDays =
    Math.max(
      0,
      Number(req.body?.warrantyDays ?? 90) || 0
    );

  const executionDays =
    req.body?.executionDays == null ||
    req.body?.executionDays === ''
      ? null
      : Math.max(
          0,
          Number(req.body.executionDays) || 0
        );

  const paymentTerms =
    String(req.body?.paymentTerms || '').trim() || null;

  const notes =
    String(req.body?.notes || '').trim() || null;

  const rawItems =
    Array.isArray(req.body?.items)
      ? req.body.items
      : [];

  const items = rawItems.map(
    (item: any,index: number) => ({
      description:
        String(item?.description || '').trim(),
      quantity:
        Number(item?.quantity ?? 1),
      unitPrice:
        Number(item?.unitPrice ?? 0),
      sortOrder:index
    })
  );

  if (
    items.some(item =>
      !item.description ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      !Number.isFinite(item.unitPrice) ||
      item.unitPrice < 0
    )
  ) {
    return res.status(400).json({
      error:'Há itens inválidos no orçamento.'
    });
  }

  const subtotal = Number(
    items
      .reduce(
        (sum,item) =>
          sum +
          item.quantity * item.unitPrice,
        0
      )
      .toFixed(2)
  );

  const discount = Number(
    Number(req.body?.discount || 0).toFixed(2)
  );

  if (
    !Number.isFinite(discount) ||
    discount < 0 ||
    discount > subtotal
  ) {
    return res.status(400).json({
      error:'Desconto inválido.'
    });
  }

  const total = Number(
    (subtotal - discount).toFixed(2)
  );

  const client = await pool.connect();

  try {
    await client.query('begin');

    const existente = await client.query(
      `
      select id, status
      from orcamentos.quotes
      where id = $1
        and organization_id = $2
      for update
      `,
      [quoteId,organizationId]
    );

    if (!existente.rowCount) {
      await client.query('rollback');

      return res.status(404).json({
        error:'Orçamento não encontrado.'
      });
    }

    if (existente.rows[0].status !== 'draft') {
      await client.query('rollback');

      return res.status(409).json({
        error:
          'Somente orçamentos em elaboração podem ser editados.'
      });
    }

    await client.query(
      `
      update orcamentos.quotes
      set
        valid_until = $3,
        warranty_days = $4,
        execution_days = $5,
        payment_terms = $6,
        notes = $7,
        subtotal = $8,
        discount = $9,
        total = $10
      where id = $1
        and organization_id = $2
      `,
      [
        quoteId,
        organizationId,
        validUntil,
        warrantyDays,
        executionDays,
        paymentTerms,
        notes,
        subtotal,
        discount,
        total
      ]
    );

    await client.query(
      `
      delete from orcamentos.quote_items
      where quote_id = $1
      `,
      [quoteId]
    );

    for (const item of items) {
      await client.query(
        `
        insert into orcamentos.quote_items (
          quote_id,
          description,
          quantity,
          unit_price,
          sort_order
        )
        values ($1,$2,$3,$4,$5)
        `,
        [
          quoteId,
          item.description,
          item.quantity,
          item.unitPrice,
          item.sortOrder
        ]
      );
    }

    const quote = await client.query(
      `
      select
        id,
        code,
        source_order_id,
        source_order_code,
        client_id,
        client_name,
        equipment,
        technician_name,
        technical_diagnosis,
        technical_recommendation,
        status,
        valid_until,
        warranty_days,
        execution_days,
        payment_terms,
        notes,
        subtotal,
        discount,
        total
      from orcamentos.quotes
      where id = $1
        and organization_id = $2
      `,
      [quoteId,organizationId]
    );

    const itensAtualizados =
      await client.query(
        `
        select
          id,
          description,
          quantity,
          unit_price as "unitPrice",
          total,
          sort_order as "sortOrder"
        from orcamentos.quote_items
        where quote_id = $1
        order by sort_order, created_at
        `,
        [quoteId]
      );

    await client.query('commit');

    return res.json({
      ok:true,
      orcamento:{
        ...quote.rows[0],
        items:itensAtualizados.rows
      }
    });
  } catch (error) {
    await client.query('rollback');

    console.error(
      '[Mantezia Orçamentos] Erro ao atualizar orçamento:',
      error instanceof Error
        ? error.message
        : error
    );

    return res.status(503).json({
      error:'Não foi possível salvar o orçamento.'
    });
  } finally {
    client.release();
  }
});
app.put('/api/orcamentos/:id/tecnico', async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'Banco de dados não configurado.'
    });
  }

  const organizationId =
    process.env.COMPANY_ID?.trim();

  if (!organizationId) {
    return res.status(503).json({
      error: 'COMPANY_ID não configurado.'
    });
  }

  const quoteId =
    String(req.params.id || '').trim();

  const technicalDiagnosis =
    String(req.body?.technicalDiagnosis || '').trim();

  const technicalCause =
    String(req.body?.technicalCause || '').trim();

  const technicalRecommendation =
    String(req.body?.technicalRecommendation || '').trim();

  if (technicalDiagnosis.length < 3) {
    return res.status(400).json({
      error: 'Informe o diagnóstico técnico.'
    });
  }

  try {
    const result = await pool.query(
      `
      update orcamentos.quotes
      set
        technical_diagnosis = $3,
        technical_cause = $4,
        technical_recommendation = $5,
        updated_at = now()
      where id = $1
        and organization_id = $2
        and status = 'draft'
      returning
        id,
        technical_diagnosis,
        technical_cause,
        technical_recommendation
      `,
      [
        quoteId,
        organizationId,
        technicalDiagnosis,
        technicalCause,
        technicalRecommendation
      ]
    );

    if (!result.rowCount) {
      return res.status(409).json({
        error:
          'Somente orçamentos em elaboração podem ser alterados.'
      });
    }

    return res.json({
      ok:true,
      orcamento:result.rows[0]
    });

  } catch (error) {
    console.error(
      '[Mantezia Orçamentos] Falha ao salvar parte técnica:',
      error
    );

    return res.status(500).json({
      error:'Não foi possível salvar a parte técnica.'
    });
  }
});


app.post('/api/orcamentos/:id/organizar-ia', async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error:'Banco de dados não configurado.'
    });
  }

  if (!openaiApiKey || !openaiModel) {
    return res.status(503).json({
      error:
        'IA do Mantezia Orçamentos ainda não está configurada.'
    });
  }

  const organizationId =
    process.env.COMPANY_ID?.trim();

  if (!organizationId) {
    return res.status(503).json({
      error:'COMPANY_ID não configurado.'
    });
  }

  const quoteId =
    String(req.params.id || '').trim();

  try {
    const quoteResult = await pool.query(
      `
      select
        id,
        code,
        equipment,
        technical_diagnosis,
        technical_cause,
        technical_recommendation,
        status
      from orcamentos.quotes
      where id = $1
        and organization_id = $2
      `,
      [quoteId,organizationId]
    );

    if (!quoteResult.rowCount) {
      return res.status(404).json({
        error:'Orçamento não encontrado.'
      });
    }

    const quote = quoteResult.rows[0];

    if (quote.status !== 'draft') {
      return res.status(409).json({
        error:
          'A IA só pode organizar orçamentos em elaboração.'
      });
    }

    const itemsResult = await pool.query(
      `
      select
        description,
        quantity
      from orcamentos.quote_items
      where quote_id = $1
      order by sort_order, created_at
      `,
      [quoteId]
    );

    /*
      IMPORTANTE:
      nenhum valor monetário é enviado para a IA.
      Ela recebe apenas informação técnica.
    */
    const contexto = {
      equipamento:
        String(quote.equipment || ''),
      diagnostico:
        String(quote.technical_diagnosis || ''),
      causa:
        String(quote.technical_cause || ''),
      recomendacao:
        String(quote.technical_recommendation || ''),
      itens:
        itemsResult.rows.map(item => ({
          descricao:String(item.description || ''),
          quantidade:Number(item.quantity || 1)
        }))
    };

    const aiResponse = await fetch(
      'https://api.openai.com/v1/responses',
      {
        method:'POST',
        headers:{
          'content-type':'application/json',
          'authorization':`Bearer ${openaiApiKey}`
        },
        body:JSON.stringify({
          model:openaiModel,
          store:false,
          instructions:
            'Você organiza propostas técnicas de assistência ' +
            'Mantezia. Preserve os fatos fornecidos. Não invente ' +
            'defeitos, peças ou serviços. Não calcule, sugira, ' +
            'avalie ou altere preços. Organize o diagnóstico, a ' +
            'causa, a recomendação técnica e descrições claras ' +
            'dos itens. Responda em português do Brasil.',
          input:
            'Organize estes dados técnicos para um orçamento. ' +
            'Não inclua preços ou valores monetários:\n' +
            JSON.stringify(contexto),
          text:{
            format:{
              type:'json_schema',
              name:'orcamento_mantezia_organizado',
              strict:true,
              schema:{
                type:'object',
                additionalProperties:false,
                properties:{
                  diagnostico:{type:'string'},
                  causa:{type:'string'},
                  recomendacao:{type:'string'},
                  itens:{
                    type:'array',
                    items:{type:'string'}
                  }
                },
                required:[
                  'diagnostico',
                  'causa',
                  'recomendacao',
                  'itens'
                ]
              }
            }
          }
        }),
        signal:AbortSignal.timeout(30000)
      }
    );

    const aiData = await aiResponse.json() as any;

    if (!aiResponse.ok) {
      console.error(
        '[Mantezia Orçamentos] OpenAI respondeu:',
        aiResponse.status,
        aiData?.error?.message || aiData
      );

      return res.status(502).json({
        error:
          'A IA não conseguiu organizar o orçamento agora.'
      });
    }

    const outputText =
      typeof aiData?.output_text === 'string'
        ? aiData.output_text
        : Array.isArray(aiData?.output)
          ? aiData.output
              .flatMap((item:any) =>
                Array.isArray(item?.content)
                  ? item.content
                  : []
              )
              .filter(
                (item:any) =>
                  item?.type === 'output_text' &&
                  typeof item?.text === 'string'
              )
              .map((item:any) => item.text)
              .join('')
          : '';

    if (!outputText.trim()) {
      return res.status(502).json({
        error:
          'A IA respondeu sem conteúdo utilizável.'
      });
    }

    const sugestao = JSON.parse(outputText);

    return res.json({
      ok:true,
      sugestao
    });

  } catch (error) {
    console.error(
      '[Mantezia Orçamentos] Falha na organização com IA:',
      error
    );

    return res.status(502).json({
      error:
        'Não foi possível organizar o orçamento com IA.'
    });
  }
});

app.put('/api/orcamentos/:id/status', async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      error: 'Banco de dados não configurado.'
    });
  }

  const organizationId =
    process.env.COMPANY_ID?.trim();

  if (!organizationId) {
    return res.status(503).json({
      error: 'COMPANY_ID não configurado.'
    });
  }

  const quoteId =
    String(req.params.id || '').trim();

  const novoStatus =
    String(req.body?.status || '').trim();

  const changedBy =
    String(req.body?.changedBy || '').trim() ||
    'Mantezia Orçamentos';

  const reason =
    String(req.body?.reason || '').trim() || null;

  const permitidos = [
    'pending_approval',
    'approved',
    'rejected'
  ];

  if (!permitidos.includes(novoStatus)) {
    return res.status(400).json({
      error: 'Status inválido para esta operação.'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('begin');

    const atual = await client.query(
      `
      select id, status, code, source_order_id, source_order_code
      from orcamentos.quotes
      where id = $1
        and organization_id = $2
      for update
      `,
      [quoteId,organizationId]
    );

    if (!atual.rowCount) {
      await client.query('rollback');

      return res.status(404).json({
        error:'Orçamento não encontrado.'
      });
    }

    const statusAnterior =
      atual.rows[0].status;

    const transicaoValida =
      (
        novoStatus === 'pending_approval' &&
        statusAnterior === 'draft'
      ) ||
      (
        ['approved','rejected'].includes(novoStatus) &&
        statusAnterior === 'pending_approval'
      );

    if (!transicaoValida) {
      await client.query('rollback');

      return res.status(409).json({
        error:
          'Transição de status não permitida para este orçamento.'
      });
    }

    if (novoStatus === 'approved') {
      if (!operacionalUrl || !orcamentosIntegrationKey) {
        await client.query('rollback');

        return res.status(503).json({
          error:
            'Integração com o Mantezia Operacional não configurada.'
        });
      }

      const sourceOrderId =
        String(atual.rows[0].source_order_id || '').trim();

      const sourceOrderCode =
        String(atual.rows[0].source_order_code || '').trim();

      const orcamentoCode =
        String(atual.rows[0].code || '').trim();

      if (!sourceOrderId) {
        await client.query('rollback');

        return res.status(409).json({
          error:
            'Este orçamento não possui uma OS de origem vinculada.'
        });
      }

      try {
        const responseOperacional = await fetch(
          `${operacionalUrl}/internal/orcamentos/liberar-execucao`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-mantezia-integration-key':
                orcamentosIntegrationKey
            },
            body: JSON.stringify({
              sourceOrderId,
              sourceOrderCode,
              orcamentoId: quoteId,
              orcamentoCode
            }),
            signal: AbortSignal.timeout(10_000)
          }
        );

        const retornoOperacional =
          await responseOperacional
            .json()
            .catch(() => null) as any;

        if (!responseOperacional.ok) {
          await client.query('rollback');

          return res.status(
            responseOperacional.status === 409
              ? 409
              : 502
          ).json({
            error:
              retornoOperacional?.error ||
              'O Operacional não conseguiu liberar a OS para execução.'
          });
        }
      } catch (error) {
        await client.query('rollback');

        console.error(
          '[Mantezia Orçamentos] Falha ao liberar OS no Operacional:',
          error
        );

        return res.status(502).json({
          error:
            'Não foi possível comunicar com o Mantezia Operacional.'
        });
      }
    }

    await client.query(
      `
      update orcamentos.quotes
      set
        status = $3,
        approved_at = case
          when $3 = 'approved' then now()
          else approved_at
        end,
        rejected_at = case
          when $3 = 'rejected' then now()
          else rejected_at
        end
      where id = $1
        and organization_id = $2
      `,
      [
        quoteId,
        organizationId,
        novoStatus
      ]
    );

    await client.query(
      `
      insert into orcamentos.quote_status_history (
        quote_id,
        previous_status,
        new_status,
        changed_by,
        reason
      )
      values ($1,$2,$3,$4,$5)
      `,
      [
        quoteId,
        statusAnterior,
        novoStatus,
        changedBy,
        reason
      ]
    );

    const quote = await client.query(
      `
      select
        q.id,
        q.code,
        q.source_order_id,
        q.source_order_code,
        q.client_name,
        q.equipment,
        q.technician_name,
        q.technical_diagnosis,
        q.technical_recommendation,
        q.status,
        q.valid_until,
        q.warranty_days,
        q.execution_days,
        q.payment_terms,
        q.notes,
        q.subtotal,
        q.discount,
        q.total,
        coalesce(
          (
            select json_agg(
              json_build_object(
                'id', i.id,
                'description', i.description,
                'quantity', i.quantity,
                'unitPrice', i.unit_price,
                'total', i.total,
                'sortOrder', i.sort_order
              )
              order by i.sort_order, i.created_at
            )
            from orcamentos.quote_items i
            where i.quote_id = q.id
          ),
          '[]'::json
        ) as items
      from orcamentos.quotes q
      where q.id = $1
        and q.organization_id = $2
      `,
      [quoteId,organizationId]
    );

    await client.query('commit');

    return res.json({
      ok:true,
      orcamento:quote.rows[0]
    });
  } catch (error) {
    await client.query('rollback');

    console.error(
      '[Mantezia Orçamentos] Erro ao atualizar status:',
      error instanceof Error
        ? error.message
        : error
    );

    return res.status(503).json({
      error:'Não foi possível atualizar o status do orçamento.'
    });
  } finally {
    client.release();
  }
});
const distDir = path.join(process.cwd(), 'dist');

app.use(express.static(distDir));

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[Mantezia Orçamentos] v0.1.0 ativo na porta ${PORT}`
  );
});
