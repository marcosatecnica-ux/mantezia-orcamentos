import React, { useEffect, useMemo, useState } from 'react';

type StatusOrcamento =
  | 'Aguardando aprovação'
  | 'Em elaboração'
  | 'Aprovado'
  | 'Rejeitado'
  | 'Expirado'
  | 'Cancelado';

type Orcamento = {
  id: string;
  databaseId: string;
  cliente: string;
  telefone: string;
  email: string;
  equipamento: string;
  descricao: string;
  causa: string;
  recomendacao: string;
  tecnico: string;
  status: StatusOrcamento;
  valor: number;
  desconto: number;
  validade: string;
  validadeIso: string;
  garantiaDias: number;
  prazoExecucaoDias: number | null;
  condicoesPagamento: string;
  observacoes: string;
  origem: string;
  itens: {
    descricao: string;
    quantidade: number;
    unitario: number;
  }[];
};

type RascunhoOrcamento = {
  diagnostico?: string;
  causa?: string;
  recomendacao?: string;
  validadeIso: string;
  garantiaDias: number;
  prazoExecucaoDias: number | null;
  condicoesPagamento: string;
  observacoes: string;
  desconto: number;
  itens: {
    descricao: string;
    quantidade: number;
    unitario: number;
  }[];
};

type OrcamentoApi = {
  id: string;
  code: string;
  source_order_id?: string | null;
  source_order_code?: string | null;
  client_name: string;
  client_phone?: string | null;
  client_email?: string | null;
  equipment: string;
  technician_name?: string | null;
  technical_diagnosis?: string | null;
  technical_cause?: string | null;
  technical_recommendation?: string | null;
  status: string;
  valid_until?: string | null;
  warranty_days?: number | string | null;
  execution_days?: number | string | null;
  payment_terms?: string | null;
  notes?: string | null;
  discount?: number | string | null;
  total: number | string;
  items?: {
    id: string;
    description: string;
    quantity: number | string;
    unitPrice: number | string;
    total: number | string;
    sortOrder: number;
  }[];
};

const ORCAMENTO_VAZIO: Orcamento = {
  id: '',
  databaseId: '',
  cliente: '',
  telefone: '',
  email: '',
  equipamento: '',
  descricao: '',
  causa: '',
  recomendacao: '',
  tecnico: '',
  status: 'Em elaboração',
  valor: 0,
  desconto: 0,
  validade: '-',
  validadeIso: '',
  garantiaDias: 90,
  prazoExecucaoDias: null,
  condicoesPagamento: '',
  observacoes: '',
  origem: '-',
  itens: []
};

const statusApiParaTela = (status: string): StatusOrcamento => {
  switch (status) {
    case 'pending_approval':
      return 'Aguardando aprovação';
    case 'approved':
      return 'Aprovado';
    case 'converted':
      return 'Aprovado';
    case 'rejected':
      return 'Rejeitado';
    case 'expired':
      return 'Expirado';
    case 'cancelled':
      return 'Cancelado';
    case 'draft':
    default:
      return 'Em elaboração';
  }
};

const formatarData = (valor?: string | null) => {
  if (!valor) return '-';

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  }).format(data);
};

const mapearOrcamento = (item: OrcamentoApi): Orcamento => ({
  id: item.code,
  databaseId: item.id,
  cliente: item.client_name,
  telefone: item.client_phone || '',
  email: item.client_email || '',
  equipamento: item.equipment,
  descricao:
    item.technical_diagnosis ||
    item.technical_recommendation ||
    'Diagnóstico técnico ainda não informado.',
  causa: item.technical_cause || '',
  recomendacao: item.technical_recommendation || '',
  tecnico: item.technician_name || 'Não informado',
  status: statusApiParaTela(item.status),
  valor: Number(item.total || 0),
  desconto: Number(item.discount || 0),
  validade: formatarData(item.valid_until),
  validadeIso: item.valid_until ? String(item.valid_until).slice(0,10) : '',
  garantiaDias: Number(item.warranty_days ?? 90),
  prazoExecucaoDias:
    item.execution_days == null
      ? null
      : Number(item.execution_days),
  condicoesPagamento: item.payment_terms || '',
  observacoes: item.notes || '',
  origem: item.source_order_code
    ? `Ordem de Serviço ${item.source_order_code}`
    : 'Criado no Portal de Orçamentos',
  itens: Array.isArray(item.items)
    ? item.items.map(i => ({
        descricao: i.description,
        quantidade: Number(i.quantity || 0),
        unitario: Number(i.unitPrice || 0)
      }))
    : []
});
const moeda = (valor: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);

const escaparHtml = (valor: unknown) =>
  String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const normalizarTelefoneWhatsApp = (valor: string) => {
  const digitos = valor.replace(/\D/g, '');

  if (!digitos) return '';

  if (digitos.startsWith('55')) return digitos;

  return `55${digitos}`;
};

const statusClass = (status: StatusOrcamento) => {
  if (status === 'Aprovado') return 'status aprovado';
  if (status === 'Em elaboração') return 'status elaboracao';

  if (
    status === 'Rejeitado' ||
    status === 'Cancelado' ||
    status === 'Expirado'
  ) {
    return 'status rejeitado';
  }

  return 'status aguardando';
};

export default function OrcamentoApp() {
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [selecionado, setSelecionado] =
    useState<Orcamento>(ORCAMENTO_VAZIO);

  const [busca, setBusca] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviandoAprovacao, setEnviandoAprovacao] = useState(false);
  const [organizandoIa, setOrganizandoIa] = useState(false);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [rascunho, setRascunho] = useState<RascunhoOrcamento>({
    validadeIso: '',
    garantiaDias: 90,
    prazoExecucaoDias: null,
    condicoesPagamento: '',
    observacoes: '',
    desconto: 0,
    itens: []
  });

  useEffect(() => {
    let ativo = true;

    const carregarOrcamentos = async () => {
      try {
        const response = await fetch('/api/orcamentos');

        if (!response.ok) {
          throw new Error(
            `API respondeu ${response.status}`
          );
        }

        const data = await response.json();

        const reais: Orcamento[] =
          Array.isArray(data.orcamentos)
            ? data.orcamentos.map(mapearOrcamento)
            : [];

        if (!ativo) return;

        setOrcamentos(reais);

        setSelecionado(atual => {
          if (
            atual.databaseId &&
            reais.some(item => item.databaseId === atual.databaseId)
          ) {
            return (
              reais.find(
                item => item.databaseId === atual.databaseId
              ) || reais[0] || ORCAMENTO_VAZIO
            );
          }

          return reais[0] || ORCAMENTO_VAZIO;
        });
      } catch (error) {
        console.error(
          '[Mantezia Orçamentos] Falha ao carregar:',
          error
        );

        if (ativo) {
          setMensagem(
            'Não foi possível carregar os orçamentos.'
          );
        }
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    };

    void carregarOrcamentos();

    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    setRascunho({
      diagnostico: selecionado.descricao,
      causa: selecionado.causa,
      recomendacao: selecionado.recomendacao,
      validadeIso: selecionado.validadeIso,
      garantiaDias: selecionado.garantiaDias,
      prazoExecucaoDias: selecionado.prazoExecucaoDias,
      condicoesPagamento: selecionado.condicoesPagamento,
      observacoes: selecionado.observacoes,
      desconto: selecionado.desconto,
      itens: selecionado.itens.map(item => ({...item}))
    });
    setEditando(false);
  }, [selecionado.databaseId]);

  const subtotalRascunho = useMemo(
    () =>
      rascunho.itens.reduce(
        (soma,item) =>
          soma +
          (Number(item.quantidade) || 0) *
          (Number(item.unitario) || 0),
        0
      ),
    [rascunho.itens]
  );

  const totalRascunho = Math.max(
    0,
    subtotalRascunho - (Number(rascunho.desconto) || 0)
  );

  const atualizarItem = (
    index: number,
    campo: 'descricao' | 'quantidade' | 'unitario',
    valor: string | number
  ) => {
    setRascunho(atual => ({
      ...atual,
      itens: atual.itens.map((item,i) =>
        i === index
          ? {
              ...item,
              [campo]:
                campo === 'descricao'
                  ? String(valor)
                  : Number(valor)
            }
          : item
      )
    }));
  };

  const adicionarItem = () => {
    setRascunho(atual => ({
      ...atual,
      itens: [
        ...atual.itens,
        {
          descricao: '',
          quantidade: 1,
          unitario: 0
        }
      ]
    }));
  };

  const removerItem = (index: number) => {
    setRascunho(atual => ({
      ...atual,
      itens: atual.itens.filter((_,i) => i !== index)
    }));
  };

  const organizarComIA = async () => {
    if (
      !selecionado.databaseId ||
      organizandoIa ||
      selecionado.status !== 'Em elaboração'
    ) return;

    setOrganizandoIa(true);

    try {
      const response = await fetch(
        `/api/orcamentos/${selecionado.databaseId}/organizar-ia`,
        { method: 'POST' }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
          'Não foi possível organizar o orçamento com IA.'
        );
      }

      const sugestao = data?.sugestao || {};

      setRascunho(atual => {
        const descricoes = Array.isArray(sugestao.itens)
          ? sugestao.itens
              .map((item: unknown) => String(item || '').trim())
              .filter(Boolean)
          : [];

        const itens =
          descricoes.length > 0
            ? descricoes.map((descricao: string,index: number) => {
                const existente = atual.itens[index];

                return {
                  descricao,
                  quantidade: existente?.quantidade ?? 1,
                  unitario: existente?.unitario ?? 0
                };
              })
            : atual.itens;

        return {
          ...atual,
          diagnostico:
            String(sugestao.diagnostico || '').trim() ||
            selecionado.descricao,
          causa:
            String(sugestao.causa || '').trim() ||
            selecionado.causa,
          recomendacao:
            String(sugestao.recomendacao || '').trim() ||
            selecionado.recomendacao,
          itens
        };
      });

      setEditando(true);

      demonstrar(
        'IA organizou a parte técnica. Revise antes de salvar.'
      );

    } catch (error) {
      console.error(
        '[Mantezia Orçamentos] Falha na organização com IA:',
        error
      );

      demonstrar(
        error instanceof Error
          ? error.message
          : 'Não foi possível organizar com IA.'
      );

    } finally {
      setOrganizandoIa(false);
    }
  };


  const salvarOrcamentoCompleto = async () => {
    if (!selecionado.databaseId || salvando) return;

    if (
      rascunho.itens.some(
        item =>
          !item.descricao.trim() ||
          Number(item.quantidade) <= 0 ||
          Number(item.unitario) < 0
      )
    ) {
      demonstrar('Revise os itens do orçamento.');
      return;
    }

    if (
      Number(rascunho.desconto) < 0 ||
      Number(rascunho.desconto) > subtotalRascunho
    ) {
      demonstrar('Desconto inválido.');
      return;
    }

    setSalvando(true);

    try {
      const comercialResponse = await fetch(
        `/api/orcamentos/${selecionado.databaseId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            validUntil: rascunho.validadeIso || null,
            warrantyDays: rascunho.garantiaDias,
            executionDays: rascunho.prazoExecucaoDias,
            paymentTerms: rascunho.condicoesPagamento,
            notes: rascunho.observacoes,
            discount: rascunho.desconto,
            items: rascunho.itens.map(item => ({
              description: item.descricao,
              quantity: item.quantidade,
              unitPrice: item.unitario
            }))
          })
        }
      );

      const comercialData = await comercialResponse.json();

      if (!comercialResponse.ok) {
        throw new Error(
          comercialData?.error ||
          'Não foi possível salvar os dados comerciais.'
        );
      }

      const tecnicoResponse = await fetch(
        `/api/orcamentos/${selecionado.databaseId}/tecnico`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            technicalDiagnosis:
              rascunho.diagnostico ??
              selecionado.descricao,
            technicalCause:
              rascunho.causa ??
              selecionado.causa,
            technicalRecommendation:
              rascunho.recomendacao ??
              selecionado.recomendacao
          })
        }
      );

      const tecnicoData = await tecnicoResponse.json();

      if (!tecnicoResponse.ok) {
        throw new Error(
          tecnicoData?.error ||
          'Não foi possível salvar a parte técnica.'
        );
      }

      const listaResponse = await fetch('/api/orcamentos');
      const listaData = await listaResponse.json();

      if (!listaResponse.ok) {
        throw new Error(
          listaData?.error ||
          'Orçamento salvo, mas não foi possível atualizar a tela.'
        );
      }

      const encontrado = Array.isArray(listaData.orcamentos)
        ? listaData.orcamentos.find(
            (item: OrcamentoApi) =>
              item.id === selecionado.databaseId
          )
        : null;

      if (encontrado) {
        const atualizado = mapearOrcamento(encontrado);

        setOrcamentos(lista =>
          lista.map(item =>
            item.databaseId === atualizado.databaseId
              ? atualizado
              : item
          )
        );

        setSelecionado(atualizado);
      }

      setEditando(false);
      demonstrar('Orçamento salvo com sucesso.');

    } catch (error) {
      console.error(
        '[Mantezia Orçamentos] Falha ao salvar:',
        error
      );

      demonstrar(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar o orçamento.'
      );

    } finally {
      setSalvando(false);
    }
  };

  const enviarParaAprovacao = async () => {
    if (
      !selecionado.databaseId ||
      enviandoAprovacao ||
      selecionado.status !== 'Em elaboração'
    ) return;

    if (
      selecionado.itens.length === 0 ||
      selecionado.valor <= 0
    ) {
      demonstrar(
        'Salve pelo menos um item com valor antes de enviar para aprovação.'
      );
      return;
    }

    setEnviandoAprovacao(true);

    try {
      const response = await fetch(
        `/api/orcamentos/${selecionado.databaseId}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'pending_approval',
            changedBy: 'Administrativo',
            reason: 'Proposta enviada para aprovação'
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || `API respondeu ${response.status}`
        );
      }

      const atualizado = mapearOrcamento(data.orcamento);

      setOrcamentos(lista =>
        lista.map(item =>
          item.databaseId === atualizado.databaseId
            ? atualizado
            : item
        )
      );

      setSelecionado(atualizado);
      setEditando(false);

      demonstrar('Orçamento enviado para aprovação.');
    } catch (error) {
      console.error(
        '[Mantezia Orçamentos] Falha ao enviar para aprovação:',
        error
      );

      demonstrar(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar para aprovação.'
      );
    } finally {
      setEnviandoAprovacao(false);
    }
  };
  const resumoCompartilhamento = () => {
    const itens = selecionado.itens
      .map(
        item =>
          `- ${item.quantidade}x ${item.descricao}: ` +
          moeda(item.quantidade * item.unitario)
      )
      .join('\n');

    return [
      `Orçamento ${selecionado.id}`,
      `Cliente: ${selecionado.cliente}`,
      `Equipamento: ${selecionado.equipamento}`,
      selecionado.origem && selecionado.origem !== '-'
        ? `Origem: ${selecionado.origem}`
        : '',
      '',
      `Diagnóstico: ${selecionado.descricao}`,
      selecionado.causa ? `Causa: ${selecionado.causa}` : '',
      selecionado.recomendacao
        ? `Serviço recomendado: ${selecionado.recomendacao}`
        : '',
      '',
      itens,
      selecionado.desconto > 0
        ? `Desconto: - ${moeda(selecionado.desconto)}`
        : '',
      `Total: ${moeda(selecionado.valor)}`,
      `Validade: ${selecionado.validade}`,
      `Garantia: ${selecionado.garantiaDias} dias`,
      selecionado.prazoExecucaoDias == null
        ? ''
        : `Prazo estimado: ${selecionado.prazoExecucaoDias} dias`,
      selecionado.condicoesPagamento
        ? `Pagamento: ${selecionado.condicoesPagamento}`
        : '',
      selecionado.observacoes
        ? `Observações: ${selecionado.observacoes}`
        : ''
    ]
      .filter(Boolean)
      .join('\n');
  };

  const gerarPdf = () => {
    if (!selecionado.databaseId) {
      demonstrar('Selecione um orçamento.');
      return;
    }

    const janela = window.open('', '_blank');

    if (!janela) {
      demonstrar(
        'O navegador bloqueou a janela do PDF. Libere pop-ups e tente novamente.'
      );
      return;
    }

    const itensHtml = selecionado.itens
      .map(
        item => `
          <tr>
            <td>${escaparHtml(item.descricao)}</td>
            <td>${escaparHtml(item.quantidade)}</td>
            <td>${escaparHtml(moeda(item.unitario))}</td>
            <td>${escaparHtml(
              moeda(item.quantidade * item.unitario)
            )}</td>
          </tr>
        `
      )
      .join('');

    janela.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>${escaparHtml(selecionado.id)} - Mantezia Orçamentos</title>
          <style>
            * { box-sizing:border-box; }
            body {
              margin:0;
              padding:36px;
              color:#17324a;
              font-family:Arial,Helvetica,sans-serif;
              font-size:13px;
            }
            .head {
              display:flex;
              justify-content:space-between;
              gap:24px;
              padding-bottom:18px;
              border-bottom:3px solid #0b7f78;
            }
            h1 { margin:0; font-size:24px; }
            h2 {
              margin:24px 0 8px;
              font-size:13px;
              text-transform:uppercase;
              color:#647789;
            }
            .muted { color:#6b7d8d; }
            .box {
              background:#f6f9fb;
              border:1px solid #e1e8ed;
              border-radius:8px;
              padding:12px;
              line-height:1.5;
            }
            .grid {
              display:grid;
              grid-template-columns:1fr 1fr;
              gap:10px 20px;
              margin-top:18px;
            }
            .label {
              display:block;
              font-size:10px;
              font-weight:700;
              color:#7b8d9b;
              text-transform:uppercase;
              margin-bottom:3px;
            }
            table {
              width:100%;
              border-collapse:collapse;
              margin-top:8px;
            }
            th,td {
              border-bottom:1px solid #e7ecef;
              padding:9px 6px;
              text-align:left;
            }
            th {
              font-size:10px;
              text-transform:uppercase;
              color:#718394;
            }
            td:nth-child(2),
            td:nth-child(3),
            td:nth-child(4),
            th:nth-child(2),
            th:nth-child(3),
            th:nth-child(4) {
              text-align:right;
            }
            .total {
              margin-top:14px;
              text-align:right;
              font-size:20px;
              font-weight:800;
              color:#0b716b;
            }
            .footer {
              margin-top:30px;
              padding-top:12px;
              border-top:1px solid #e5eaee;
              font-size:10px;
              color:#8795a1;
              text-align:center;
            }
            @media print {
              body { padding:18px; }
            }
          </style>
        </head>
        <body>
          <div class="head">
            <div>
              <h1>Mantezia Orçamentos</h1>
              <div class="muted">Proposta comercial</div>
            </div>
            <div style="text-align:right">
              <strong>${escaparHtml(selecionado.id)}</strong><br/>
              <span class="muted">Validade: ${escaparHtml(
                selecionado.validade
              )}</span>
            </div>
          </div>

          <div class="grid">
            <div>
              <span class="label">Cliente</span>
              <strong>${escaparHtml(selecionado.cliente)}</strong>
            </div>
            <div>
              <span class="label">Equipamento</span>
              <strong>${escaparHtml(selecionado.equipamento)}</strong>
            </div>
            <div>
              <span class="label">Técnico responsável</span>
              ${escaparHtml(selecionado.tecnico)}
            </div>
            <div>
              <span class="label">Origem</span>
              ${escaparHtml(selecionado.origem)}
            </div>
          </div>

          <h2>Diagnóstico</h2>
          <div class="box">${escaparHtml(selecionado.descricao)}</div>

          ${
            selecionado.causa
              ? `<h2>Causa</h2><div class="box">${escaparHtml(
                  selecionado.causa
                )}</div>`
              : ''
          }

          ${
            selecionado.recomendacao
              ? `<h2>Serviço recomendado</h2><div class="box">${escaparHtml(
                  selecionado.recomendacao
                )}</div>`
              : ''
          }

          <h2>Itens da proposta</h2>
          <table>
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Qtd.</th>
                <th>Unitário</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${itensHtml}</tbody>
          </table>

          ${
            selecionado.desconto > 0
              ? `<div style="margin-top:10px;text-align:right">
                  Desconto: <strong>- ${escaparHtml(
                    moeda(selecionado.desconto)
                  )}</strong>
                </div>`
              : ''
          }

          <div class="total">
            Total: ${escaparHtml(moeda(selecionado.valor))}
          </div>

          <h2>Condições comerciais</h2>
          <div class="grid">
            <div>
              <span class="label">Garantia</span>
              ${escaparHtml(selecionado.garantiaDias)} dias
            </div>
            <div>
              <span class="label">Prazo estimado</span>
              ${
                selecionado.prazoExecucaoDias == null
                  ? 'Não informado'
                  : `${escaparHtml(
                      selecionado.prazoExecucaoDias
                    )} dias`
              }
            </div>
            <div>
              <span class="label">Pagamento</span>
              ${escaparHtml(
                selecionado.condicoesPagamento || 'Não informado'
              )}
            </div>
            <div>
              <span class="label">Validade</span>
              ${escaparHtml(selecionado.validade)}
            </div>
          </div>

          ${
            selecionado.observacoes
              ? `<h2>Observações</h2><div class="box">${escaparHtml(
                  selecionado.observacoes
                )}</div>`
              : ''
          }

          <div class="footer">
            Documento emitido pelo Mantezia Orçamentos.
          </div>

          <script>
            window.addEventListener('load', () => {
              setTimeout(() => window.print(), 250);
            });
          </script>
        </body>
      </html>
    `);

    janela.document.close();
  };

  const enviarEmail = () => {
    if (!selecionado.databaseId) {
      demonstrar('Selecione um orçamento.');
      return;
    }

    if (!selecionado.email) {
      demonstrar('Este cliente não possui e-mail cadastrado.');
      return;
    }

    const assunto = `Orçamento ${selecionado.id} - ${selecionado.equipamento}`;
    const body = resumoCompartilhamento();

    window.location.href =
      `mailto:${encodeURIComponent(selecionado.email)}` +
      `?subject=${encodeURIComponent(assunto)}` +
      `&body=${encodeURIComponent(body)}`;
  };

  const enviarWhatsApp = () => {
    if (!selecionado.databaseId) {
      demonstrar('Selecione um orçamento.');
      return;
    }

    const mensagem =
      `Olá, ${selecionado.cliente}.\n\n` +
      resumoCompartilhamento();

    const telefone =
      normalizarTelefoneWhatsApp(selecionado.telefone);

    const url = telefone
      ? `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(mensagem)}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const filtrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();

    if (!termo) {
      return orcamentos;
    }

    return orcamentos.filter(item =>
      `${item.id} ${item.cliente} ${item.equipamento} ${item.status}`
        .toLowerCase()
        .includes(termo)
    );
  }, [busca, orcamentos]);

  const itensLista = filtrados.filter(item =>
    mostrarHistorico
      ? !['Em elaboração','Aguardando aprovação'].includes(item.status)
      : ['Em elaboração','Aguardando aprovação'].includes(item.status)
  );

  const totalEmAberto = orcamentos
    .filter(item =>
      ['Em elaboração','Aguardando aprovação'].includes(item.status)
    )
    .reduce(
      (soma, item) => soma + item.valor,
      0
    );

  const emElaboracao = orcamentos.filter(
    item => item.status === 'Em elaboração'
  ).length;

  const aguardandoAprovacao = orcamentos.filter(
    item => item.status === 'Aguardando aprovação'
  ).length;

  const aprovados = orcamentos.filter(
    item => item.status === 'Aprovado'
  ).length;

  const rejeitados = orcamentos.filter(
    item => item.status === 'Rejeitado'
  ).length;
  const demonstrar = (texto: string) => {
    setMensagem(texto);
    window.setTimeout(() => setMensagem(''), 2600);
  };

  return (
    <div className="orc-page">
      <style>{`
        * { box-sizing: border-box; }
        body { margin:0; background:#f4f7fb; color:#152536; font-family:Inter,Arial,sans-serif; }
        button,input,textarea { font:inherit; }
        .edit-input {
          width:100%; border:1px solid #d4dee6; border-radius:8px;
          padding:8px 9px; background:white; color:#25445a;
          outline:none;
        }
        .edit-input:focus {
          border-color:#07877f;
          box-shadow:0 0 0 2px rgba(7,135,127,.10);
        }
        .edit-item {
          display:grid;
          grid-template-columns:minmax(150px,1fr) 70px 115px 34px;
          gap:7px; align-items:center; margin-bottom:8px;
        }
        .danger-mini {
          border:0; background:#fff0f0; color:#b42318;
          width:34px; height:34px; border-radius:8px;
          cursor:pointer; font-weight:900;
        }
        .orc-page { min-height:100vh; }
        .topbar {
          height:72px; padding:0 28px; background:#102a43; color:white;
          display:flex; align-items:center; justify-content:space-between;
          box-shadow:0 2px 12px rgba(16,42,67,.18);
        }
        .brand { display:flex; gap:12px; align-items:center; }
        .brand img { width:44px; height:44px; object-fit:contain; }
        .brand-title { font-size:21px; font-weight:800; letter-spacing:.2px; }
        .brand-sub { font-size:12px; color:#b9c9d8; margin-top:2px; }
        .demo-pill {
          border:1px solid rgba(255,255,255,.25); border-radius:999px;
          padding:8px 13px; font-size:12px; color:#d9e7f2;
        }
        .layout { min-height:calc(100vh - 72px); }
        .sidebar { background:white; border-right:1px solid #e5ebf1; padding:24px 16px; }
        .side-label { color:#8795a3; font-size:11px; font-weight:800; text-transform:uppercase; margin:8px 12px 12px; }
        .navitem {
          padding:11px 13px; border-radius:10px; margin-bottom:5px; color:#455d70;
          font-size:14px; font-weight:650;
        }
        .navitem.active { background:#eaf5f4; color:#087b73; }
        .main { padding:26px; max-width:1600px; width:100%; margin:0 auto; }
        .heading { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; margin-bottom:22px; }
        h1 { margin:0; font-size:27px; color:#102a43; }
        .subtitle { margin-top:6px; color:#718096; font-size:14px; }
        .primary {
          border:0; padding:11px 17px; background:#07877f; color:white;
          border-radius:9px; font-weight:750; cursor:pointer;
        }
        .heading-note {
          max-width:360px;
          padding:10px 13px;
          border:1px solid #d8e5e3;
          background:#eef8f7;
          color:#43625f;
          border-radius:10px;
          font-size:11px;
          line-height:1.4;
          font-weight:700;
        }
        .cards { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-bottom:22px; }
        .card {
          background:white; border:1px solid #e7edf2; border-radius:13px;
          padding:17px; box-shadow:0 3px 12px rgba(31,55,79,.035);
        }
        .card-label { font-size:12px; color:#7a8c9b; font-weight:700; }
        .card-value { margin-top:8px; font-size:25px; font-weight:850; color:#15364f; }
        .card-value.money { font-size:20px; }
        .content-grid {
          display:grid;
          grid-template-columns:minmax(0,1fr) 360px;
          gap:18px;
          align-items:start;
        }

        .content-grid > .panel:first-child {
          order:2;
          position:sticky;
          top:90px;
          align-self:start;
          max-height:calc(100vh - 112px);
          overflow:auto;
        }

        .content-grid > .panel:nth-child(2) {
          order:1;
          min-width:0;
        }

        .content-grid > .panel:first-child .panel-head {
          flex-direction:column;
          align-items:stretch;
          gap:10px;
        }

        .content-grid > .panel:first-child .search {
          width:100%;
        }

        .content-grid > .panel:first-child .row {
          grid-template-columns:1fr;
          gap:6px;
          border-bottom:1px solid #edf1f5;
        }

        .content-grid > .panel:first-child .value {
          text-align:left;
          color:#087b73;
        }
        .panel { background:white; border:1px solid #e5ebf1; border-radius:14px; overflow:hidden; }
        .panel-head { padding:17px 18px; border-bottom:1px solid #edf1f5; display:flex; justify-content:space-between; align-items:center; }
        .panel-title { font-weight:800; color:#19384f; }
        .panel-head-tools {
          display:flex;
          gap:8px;
          align-items:center;
        }
        .list-toggle {
          border:0;
          background:transparent;
          color:#087b73;
          font-size:10px;
          font-weight:850;
          cursor:pointer;
          padding:4px 0;
        }
        .empty-state {
          padding:24px 14px;
          text-align:center;
          color:#81909c;
          font-size:12px;
        }
        .search {
          width:230px; border:1px solid #d8e1e8; padding:9px 11px;
          border-radius:8px; outline:none; background:#fbfcfd;
        }
        .rows { padding:7px; }
        .row {
          display:grid; grid-template-columns:1.2fr 1.5fr .9fr .8fr;
          gap:10px; padding:14px 12px; border-radius:10px; align-items:center;
          cursor:pointer; border:1px solid transparent;
        }
        .row:hover { background:#f7fafc; }
        .row.selected { background:#eef8f7; border-color:#cfe8e5; }
        .osid { font-size:13px; font-weight:800; color:#21435d; }
        .client { font-weight:700; font-size:13px; }
        .equipment { margin-top:3px; color:#8493a0; font-size:11px; }
        .status { display:inline-flex; width:max-content; padding:5px 8px; border-radius:999px; font-size:10px; font-weight:800; }
        .aguardando { background:#fff5da; color:#8a6100; }
        .elaboracao { background:#e8f0ff; color:#345e9d; }
        .aprovado { background:#e7f7ed; color:#187143; }
        .rejeitado { background:#fdecec; color:#a12d2d; }
        .value { text-align:right; font-weight:800; font-size:13px; }
        .detail { padding:20px; }
        .detail-top { display:flex; justify-content:space-between; align-items:flex-start; gap:15px; margin-bottom:18px; }
        .detail-id { font-size:20px; font-weight:850; color:#133850; }
        .section { border-top:1px solid #edf1f5; padding-top:15px; margin-top:15px; }
        .section-title { font-size:11px; font-weight:850; text-transform:uppercase; color:#8797a5; margin-bottom:10px; }
        .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .label { font-size:10px; color:#8a98a5; font-weight:700; }
        .info { margin-top:3px; font-size:13px; font-weight:700; color:#304b60; }
        .diagnosis { background:#f7fafc; border-radius:9px; padding:12px; font-size:13px; color:#455f73; line-height:1.45; }

        .section-title-line {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          margin-bottom:10px;
        }

        .section-title-line .section-title {
          margin-bottom:0;
        }

        .ai-button {
          border:1px solid #c9ddd9;
          background:#eef8f7;
          color:#087b73;
          padding:8px 12px;
          border-radius:9px;
          font-size:11px;
          font-weight:850;
          cursor:pointer;
        }

        .ai-button:hover {
          background:#ddf2ef;
        }

        .ai-button:disabled {
          opacity:.55;
          cursor:not-allowed;
        }

        .technical-editor,
        .technical-read {
          display:grid;
          gap:10px;
        }

        .technical-editor label {
          display:grid;
          gap:5px;
        }

        .ai-warning {
          background:#fff9e8;
          border:1px solid #f3df9c;
          color:#735c17;
          padding:10px 12px;
          border-radius:9px;
          font-size:11px;
          line-height:1.4;
        }

        .approved-note {
          background:#e7f7ed;
          border:1px solid #bfe5cc;
          color:#187143;
          padding:10px 12px;
          border-radius:9px;
          font-size:12px;
          font-weight:800;
        }
        .pending-note {
          background:#fff7df;
          border:1px solid #eedb9b;
          color:#725a13;
          padding:10px 12px;
          border-radius:9px;
          font-size:12px;
          font-weight:750;
          line-height:1.4;
        }
        .itemline { display:grid; grid-template-columns:1fr 50px 100px; gap:8px; padding:9px 0; border-bottom:1px solid #f0f3f5; font-size:12px; }
        .total-line { display:flex; justify-content:space-between; padding-top:14px; font-size:17px; font-weight:850; color:#0d675f; }
        .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; }
        .secondary {
          background:white; color:#315166; border:1px solid #d5dfe6;
          padding:9px 11px; border-radius:8px; font-size:11px; font-weight:750; cursor:pointer;
        }
        .secondary:hover { background:#f7fafc; }
        .approve { background:#07877f; border-color:#07877f; color:white; }
        .toast {
          position:fixed; right:25px; bottom:25px; background:#102a43; color:white;
          padding:13px 18px; border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,.18);
          font-size:13px; font-weight:700; z-index:10;
        }
        .footnote { margin-top:15px; color:#96a4af; font-size:10px; text-align:right; }
        @media (max-width:1100px) {
          .cards { grid-template-columns:repeat(2,1fr); }
          .content-grid { grid-template-columns:1fr; }
          .content-grid > .panel:first-child {
            position:static;
            max-height:none;
          }
        }
        @media (max-width:780px) {
          .layout { min-height:calc(100vh - 72px); }
          .main { padding:16px; }
          .topbar { padding:0 16px; }
          .cards { grid-template-columns:1fr 1fr; }
          .row { grid-template-columns:1fr 1fr; }
          .search { width:160px; }
          .heading { align-items:center; }
        }
      `}</style>

      <header className="topbar">
        <div className="brand">
          <img src="/mantezia-192.png" alt="Mantezia" />
          <div>
            <div className="brand-title">Mantezia Orçamentos</div>
            <div className="brand-sub">Inteligência que transforma diagnóstico em decisão</div>
          </div>
        </div>
        <div className="demo-pill">Módulo Orçamentos • Banco conectado</div>
      </header>

      <div className="layout">
        <main className="main">
          <div className="heading">
            <div>
              <h1>Portal de Orçamentos</h1>
              <div className="subtitle">
                Propostas comerciais conectadas à operação técnica Mantezia.
              </div>
            </div>
            <div className="heading-note">
              Os orçamentos operacionais são criados a partir das OS.
              Assim, cliente, equipamento e histórico permanecem vinculados
              ao mesmo atendimento.
            </div>
          </div>

          <section className="cards">
            <div className="card">
              <div className="card-label">Em elaboração</div>
              <div className="card-value">{emElaboracao}</div>
            </div>
            <div className="card">
              <div className="card-label">Aguardando aprovação</div>
              <div className="card-value">{aguardandoAprovacao}</div>
            </div>
            <div className="card">
              <div className="card-label">Liberados para execução</div>
              <div className="card-value">{aprovados}</div>
            </div>
            <div className="card">
              <div className="card-label">Rejeitados</div>
              <div className="card-value">{rejeitados}</div>
            </div>
            <div className="card">
              <div className="card-label">Valor em aberto</div>
              <div className="card-value money">{moeda(totalEmAberto)}</div>
            </div>
          </section>

          <div className="content-grid">
            <section className="panel">
              <div className="panel-head">
                <div style={{
                  display:'flex',
                  alignItems:'center',
                  justifyContent:'space-between',
                  gap:10
                }}>
                  <div className="panel-title">
                    {mostrarHistorico ? 'Histórico' : 'Pendências'}
                  </div>

                  <button
                    type="button"
                    className="list-toggle"
                    onClick={() => {
                      setMostrarHistorico(atual => !atual);
                      setBusca('');
                    }}
                  >
                    {mostrarHistorico ? 'Ver pendências' : 'Ver histórico'}
                  </button>
                </div>

                <input
                  className="search"
                  placeholder={
                    mostrarHistorico
                      ? 'Buscar no histórico...'
                      : 'Buscar pendência...'
                  }
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                />
              </div>

              <div className="rows">
                {itensLista.length === 0 ? (
                  <div className="empty-state">
                    {mostrarHistorico
                      ? 'Nenhum orçamento no histórico.'
                      : 'Nenhum orçamento aguardando ação.'}
                  </div>
                ) : (
                  itensLista.map(item => (
                    <div
                      key={item.id}
                      className={`row ${selecionado.id === item.id ? 'selected' : ''}`}
                      onClick={() => setSelecionado(item)}
                    >
                      <div className="osid">{item.id}</div>
                      <div>
                        <div className="client">{item.cliente}</div>
                        <div className="equipment">{item.equipamento}</div>
                      </div>
                      <div>
                        <span className={statusClass(item.status)}>
                          {item.status}
                        </span>
                      </div>
                      <div className="value">{moeda(item.valor)}</div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div className="panel-title">Detalhes da proposta</div>
                <span className={statusClass(selecionado.status)}>
                  {selecionado.status}
                </span>
              </div>

              <div className="detail">
                <div className="detail-top">
                  <div>
                    <div className="detail-id">{selecionado.id}</div>
                    <div className="subtitle">Validade: {selecionado.validade}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div className="label">VALOR TOTAL</div>
                    <div style={{fontSize:22,fontWeight:900,color:'#087b73'}}>
                      {moeda(selecionado.valor)}
                    </div>
                  </div>
                </div>

                <div className="section">
                  <div className="section-title">Cliente e atendimento</div>
                  <div className="info-grid">
                    <div>
                      <div className="label">CLIENTE</div>
                      <div className="info">{selecionado.cliente}</div>
                    </div>
                    <div>
                      <div className="label">TÉCNICO RESPONSÁVEL</div>
                      <div className="info">{selecionado.tecnico}</div>
                    </div>
                    <div>
                      <div className="label">EQUIPAMENTO</div>
                      <div className="info">{selecionado.equipamento}</div>
                    </div>
                    <div>
                      <div className="label">ORIGEM</div>
                      <div className="info">{selecionado.origem}</div>
                    </div>
                  </div>
                </div>

                <div className="section">
                  <div className="section-title-line">
                    <div className="section-title">
                      Diagnóstico técnico
                    </div>

                    <button
                      className="ai-button"
                      disabled={
                        organizandoIa ||
                        selecionado.status !== 'Em elaboração'
                      }
                      title={
                        selecionado.status === 'Em elaboração'
                          ? 'Organizar diagnóstico, causa, serviço e itens com IA'
                          : 'A IA fica disponível enquanto o orçamento está em elaboração'
                      }
                      onClick={() => void organizarComIA()}
                    >
                      {organizandoIa
                        ? '✨ Organizando...'
                        : selecionado.status === 'Em elaboração'
                          ? '✨ Organizar com IA'
                          : '✨ IA disponível na elaboração'}
                    </button>
                  </div>

                  {editando ? (
                    <div className="technical-editor">
                      <label>
                        <span className="label">DIAGNÓSTICO</span>
                        <textarea
                          className="edit-input"
                          rows={4}
                          value={
                            rascunho.diagnostico ??
                            selecionado.descricao
                          }
                          onChange={e =>
                            setRascunho(atual => ({
                              ...atual,
                              diagnostico:e.target.value
                            }))
                          }
                        />
                      </label>

                      <label>
                        <span className="label">CAUSA</span>
                        <textarea
                          className="edit-input"
                          rows={3}
                          value={
                            rascunho.causa ??
                            selecionado.causa
                          }
                          onChange={e =>
                            setRascunho(atual => ({
                              ...atual,
                              causa:e.target.value
                            }))
                          }
                        />
                      </label>

                      <label>
                        <span className="label">
                          SERVIÇO RECOMENDADO
                        </span>
                        <textarea
                          className="edit-input"
                          rows={3}
                          value={
                            rascunho.recomendacao ??
                            selecionado.recomendacao
                          }
                          onChange={e =>
                            setRascunho(atual => ({
                              ...atual,
                              recomendacao:e.target.value
                            }))
                          }
                        />
                      </label>

                      <div className="ai-warning">
                        A IA organiza apenas a informação técnica.
                        Valores e condições comerciais continuam sob
                        responsabilidade da assistência.
                      </div>
                    </div>
                  ) : (
                    <div className="technical-read">
                      <div>
                        <div className="label">DIAGNÓSTICO</div>
                        <div className="diagnosis">
                          {selecionado.descricao}
                        </div>
                      </div>

                      {selecionado.causa && (
                        <div>
                          <div className="label">CAUSA</div>
                          <div className="diagnosis">
                            {selecionado.causa}
                          </div>
                        </div>
                      )}

                      {selecionado.recomendacao && (
                        <div>
                          <div className="label">
                            SERVIÇO RECOMENDADO
                          </div>
                          <div className="diagnosis">
                            {selecionado.recomendacao}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="section">
                  <div className="section-title">Itens do orçamento</div>

                  {editando ? (
                    <>
                      {rascunho.itens.map((item,index) => (
                        <div className="edit-item" key={index}>
                          <input
                            className="edit-input"
                            value={item.descricao}
                            placeholder="Descrição do item"
                            onChange={e =>
                              atualizarItem(
                                index,
                                'descricao',
                                e.target.value
                              )
                            }
                          />

                          <input
                            className="edit-input"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.quantidade}
                            onChange={e =>
                              atualizarItem(
                                index,
                                'quantidade',
                                e.target.value
                              )
                            }
                          />

                          <input
                            className="edit-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitario}
                            onChange={e =>
                              atualizarItem(
                                index,
                                'unitario',
                                e.target.value
                              )
                            }
                          />

                          <button
                            className="danger-mini"
                            title="Remover item"
                            onClick={() => removerItem(index)}
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      <button
                        className="secondary"
                        onClick={adicionarItem}
                      >
                        + Adicionar item
                      </button>

                      <div style={{
                        marginTop:14,
                        display:'grid',
                        gap:8
                      }}>
                        <div style={{
                          display:'flex',
                          justifyContent:'space-between'
                        }}>
                          <span>Subtotal</span>
                          <strong>
                            {moeda(subtotalRascunho)}
                          </strong>
                        </div>

                        <div style={{
                          display:'grid',
                          gridTemplateColumns:'1fr 130px',
                          gap:10,
                          alignItems:'center'
                        }}>
                          <strong>Desconto</strong>

                          <input
                            className="edit-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={rascunho.desconto}
                            onChange={e =>
                              setRascunho(atual => ({
                                ...atual,
                                desconto:
                                  Number(e.target.value)
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="total-line">
                        <span>Total da proposta</span>
                        <span>{moeda(totalRascunho)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {selecionado.itens.map((item,index) => (
                        <div className="itemline" key={index}>
                          <div>{item.descricao}</div>
                          <div>{item.quantidade}x</div>
                          <div style={{textAlign:'right'}}>
                            {moeda(
                              item.unitario *
                              item.quantidade
                            )}
                          </div>
                        </div>
                      ))}

                      {selecionado.desconto > 0 && (
                        <div style={{
                          display:'flex',
                          justifyContent:'space-between',
                          paddingTop:10,
                          fontSize:12
                        }}>
                          <span>Desconto</span>
                          <strong>
                            - {moeda(selecionado.desconto)}
                          </strong>
                        </div>
                      )}

                      <div className="total-line">
                        <span>Total da proposta</span>
                        <span>{moeda(selecionado.valor)}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="section">
                  <div className="section-title">
                    Condições comerciais
                  </div>

                  {editando ? (
                    <div className="info-grid">
                      <div>
                        <div className="label">VALIDADE</div>
                        <input
                          className="edit-input"
                          type="date"
                          value={rascunho.validadeIso}
                          onChange={e =>
                            setRascunho(atual => ({
                              ...atual,
                              validadeIso:e.target.value
                            }))
                          }
                        />
                      </div>

                      <div>
                        <div className="label">
                          GARANTIA (DIAS)
                        </div>
                        <input
                          className="edit-input"
                          type="number"
                          min="0"
                          value={rascunho.garantiaDias}
                          onChange={e =>
                            setRascunho(atual => ({
                              ...atual,
                              garantiaDias:
                                Number(e.target.value)
                            }))
                          }
                        />
                      </div>

                      <div>
                        <div className="label">
                          PRAZO ESTIMADO (DIAS)
                        </div>
                        <input
                          className="edit-input"
                          type="number"
                          min="0"
                          value={
                            rascunho.prazoExecucaoDias ?? ''
                          }
                          onChange={e =>
                            setRascunho(atual => ({
                              ...atual,
                              prazoExecucaoDias:
                                e.target.value === ''
                                  ? null
                                  : Number(e.target.value)
                            }))
                          }
                        />
                      </div>

                      <div>
                        <div className="label">PAGAMENTO</div>
                        <input
                          className="edit-input"
                          value={rascunho.condicoesPagamento}
                          placeholder="Ex.: 50% entrada + 50% entrega"
                          onChange={e =>
                            setRascunho(atual => ({
                              ...atual,
                              condicoesPagamento:
                                e.target.value
                            }))
                          }
                        />
                      </div>

                      <div style={{gridColumn:'1 / -1'}}>
                        <div className="label">OBSERVAÇÕES</div>
                        <textarea
                          className="edit-input"
                          rows={3}
                          value={rascunho.observacoes}
                          onChange={e =>
                            setRascunho(atual => ({
                              ...atual,
                              observacoes:e.target.value
                            }))
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="info-grid">
                      <div>
                        <div className="label">VALIDADE</div>
                        <div className="info">
                          {selecionado.validade}
                        </div>
                      </div>

                      <div>
                        <div className="label">GARANTIA</div>
                        <div className="info">
                          {selecionado.garantiaDias} dias
                        </div>
                      </div>

                      <div>
                        <div className="label">
                          PRAZO ESTIMADO
                        </div>
                        <div className="info">
                          {selecionado.prazoExecucaoDias == null
                            ? 'Não informado'
                            : `${selecionado.prazoExecucaoDias} dias`}
                        </div>
                      </div>

                      <div>
                        <div className="label">PAGAMENTO</div>
                        <div className="info">
                          {selecionado.condicoesPagamento ||
                            'Não informado'}
                        </div>
                      </div>

                      {selecionado.observacoes && (
                        <div style={{gridColumn:'1 / -1'}}>
                          <div className="label">
                            OBSERVAÇÕES
                          </div>
                          <div className="info">
                            {selecionado.observacoes}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="actions">
                  {selecionado.status === 'Em elaboração' && (
                    editando ? (
                      <>
                        <button
                          className="secondary approve"
                          disabled={salvando}
                          onClick={salvarOrcamentoCompleto}
                        >
                          {salvando
                            ? 'Salvando...'
                            : 'Salvar orçamento'}
                        </button>

                        <button
                          className="secondary"
                          disabled={salvando}
                          onClick={() => {
                            setRascunho({
                              diagnostico:
                                selecionado.descricao,
                              causa:
                                selecionado.causa,
                              recomendacao:
                                selecionado.recomendacao,
                              validadeIso:
                                selecionado.validadeIso,
                              garantiaDias:
                                selecionado.garantiaDias,
                              prazoExecucaoDias:
                                selecionado.prazoExecucaoDias,
                              condicoesPagamento:
                                selecionado.condicoesPagamento,
                              observacoes:
                                selecionado.observacoes,
                              desconto:
                                selecionado.desconto,
                              itens:
                                selecionado.itens.map(
                                  item => ({...item})
                                )
                            });
                            setEditando(false);
                          }}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        className="secondary approve"
                        onClick={() => setEditando(true)}
                      >
                        Editar orçamento
                      </button>
                    )
                  )}

                  <button
                    className="secondary"
                    onClick={gerarPdf}
                  >
                    Gerar PDF
                  </button>

                  <button
                    className="secondary"
                    onClick={enviarEmail}
                  >
                    Enviar por e-mail
                  </button>

                  <button
                    className="secondary"
                    onClick={enviarWhatsApp}
                  >
                    WhatsApp
                  </button>

                  {selecionado.status === 'Em elaboração' && (
                    <button
                      className="secondary approve"
                      disabled={enviandoAprovacao || editando}
                      onClick={enviarParaAprovacao}
                    >
                      {enviandoAprovacao
                        ? 'Enviando...'
                        : 'Enviar para aprovação'}
                    </button>
                  )}

                  {selecionado.status === 'Aguardando aprovação' && (
                    <div className="pending-note">
                      Aguardando a decisão do cliente no Portal do Cliente.
                      Aprovação e rejeição são registradas pelo acesso
                      autenticado do próprio cliente.
                    </div>
                  )}

                  {selecionado.status === 'Aprovado' && (
                    <div className="approved-note">
                      ✓ Orçamento aprovado. A mesma OS de origem foi
                      liberada para continuar a execução.
                    </div>
                  )}
                </div>

                <div className="footnote">
                  Mantezia Orçamentos • Dados armazenados no banco próprio
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      {mensagem && <div className="toast">{mensagem}</div>}
    </div>
  );
}

