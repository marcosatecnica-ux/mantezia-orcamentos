import React, { useEffect, useMemo, useState } from 'react';

type StatusOrcamento =
  | 'Aguardando aprovação'
  | 'Pronto para enviar'
  | 'Em elaboração'
  | 'Aprovado'
  | 'Convertido em OS'
  | 'Rejeitado'
  | 'Expirado'
  | 'Cancelado';

type ItemOrcamento = {
  descricao: string;
  quantidade: number;
  unitario: number;
};

type ItemRascunho = {
  descricao: string;
  quantidade: number;
  unitario: string;
};

type Orcamento = {
  id: string;
  databaseId: string;
  sourceOrderId: string | null;
  sourceOrderStatus: string | null;
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
  clausulaComercial: string;
  origem: string;
  itens: ItemOrcamento[];
};

type RascunhoOrcamento = {
  diagnostico: string;
  causa: string;
  recomendacao: string;
  validadeIso: string;
  garantiaDias: number;
  prazoExecucaoDias: number | null;
  condicoesPagamento: string;
  observacoes: string;
  clausulaComercial: string;
  desconto: string;
  itens: ItemRascunho[];
};

type OrcamentoApi = {
  id: string;
  code: string;
  source_order_id?: string | null;
  source_order_code?: string | null;
  source_order_status?: string | null;
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
  commercial_clause?: string | null;
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

const statusApiParaTela = (
  status: string
): StatusOrcamento => {
  switch (status) {
    case 'ready_to_send':
      return 'Pronto para enviar';

    case 'pending_approval':
      return 'Aguardando aprovação';

    case 'approved':
      return 'Aprovado';

    case 'converted':
      return 'Convertido em OS';

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

const formatarData = (
  valor?: string | null
) => {
  if (!valor) return '-';

  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat(
    'pt-BR',
    {
      timeZone:'America/Sao_Paulo'
    }
  ).format(data);
};

const moeda = (valor: number) =>
  new Intl.NumberFormat(
    'pt-BR',
    {
      style:'currency',
      currency:'BRL'
    }
  ).format(valor || 0);

// MANTEZIA_ORCAMENTOS_COMPARTILHAMENTO_REAL_20260906
const escaparHtml = (
  valor: unknown
) =>
  String(valor ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');

const normalizarTelefoneWhatsApp = (
  valor: string
) => {
  const digitos =
    String(valor || '')
      .replace(/\D/g,'');

  if (!digitos) {
    return '';
  }

  if (
    digitos.startsWith('55')
  ) {
    return digitos;
  }

  return `55${digitos}`;
};


const numeroParaCampoMoeda = (
  valor: number
) => {
  if (
    !Number.isFinite(valor) ||
    valor <= 0
  ) {
    return '';
  }

  return new Intl.NumberFormat(
    'pt-BR',
    {
      minimumFractionDigits:2,
      maximumFractionDigits:2
    }
  ).format(valor);
};

const campoMoedaParaNumero = (
  valor: string
) => {
  const bruto =
    String(valor || '').trim();

  if (!bruto) {
    return 0;
  }

  const limpo =
    bruto.replace(
      /[^0-9,.-]/g,
      ''
    );

  const normalizado =
    limpo.includes(',')
      ? limpo
          .replace(/\./g,'')
          .replace(',','.')
      : limpo;

  const numero =
    Number(normalizado);

  return Number.isFinite(numero)
    ? numero
    : 0;
};

const formatarCampoMoeda = (
  valor: string
) =>
  numeroParaCampoMoeda(
    campoMoedaParaNumero(valor)
  );

const normalizarTexto = (
  valor: unknown
) =>
  String(valor || '')
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .trim()
    .toLowerCase();

const ehMaoDeObra = (
  descricao: string
) =>
  normalizarTexto(descricao) ===
  'mao de obra';

const garantirMaoDeObra = (
  itens: ItemRascunho[]
) => {
  const jaExiste =
    itens.some(item =>
      ehMaoDeObra(
        item.descricao
      )
    );

  if (jaExiste) {
    return itens;
  }

  return [
    {
      descricao:'Mão de obra',
      quantidade:1,
      unitario:''
    },
    ...itens
  ];
};

const osConcluida = (
  status?: string | null
) => {
  const atual =
    normalizarTexto(status);

  return [
    'concluido',
    'concluida',
    'finalizado',
    'finalizada'
  ].includes(atual);
};

const mapearOrcamento = (
  item: OrcamentoApi
): Orcamento => ({
  id:item.code,

  databaseId:item.id,

  sourceOrderId:
    item.source_order_id || null,

  sourceOrderStatus:
    item.source_order_status || null,

  cliente:item.client_name,

  telefone:
    item.client_phone || '',

  email:
    item.client_email || '',

  equipamento:item.equipment,

  descricao:
    item.technical_diagnosis ||
    item.technical_recommendation ||
    'Diagnóstico técnico ainda não informado.',

  causa:
    item.technical_cause || '',

  recomendacao:
    item.technical_recommendation || '',

  tecnico:
    item.technician_name ||
    'Não informado',

  status:
    statusApiParaTela(
      item.status
    ),

  valor:
    Number(item.total || 0),

  desconto:
    Number(item.discount || 0),

  validade:
    formatarData(
      item.valid_until
    ),

  validadeIso:
    item.valid_until
      ? String(
          item.valid_until
        ).slice(0,10)
      : '',

  garantiaDias:
    Number(
      item.warranty_days ?? 90
    ),

  prazoExecucaoDias:
    item.execution_days == null
      ? null
      : Number(
          item.execution_days
        ),

  condicoesPagamento:
    item.payment_terms || '',

  observacoes:
    item.notes || '',

  clausulaComercial:
    item.commercial_clause || '',

  origem:
    item.source_order_code
      ? `Ordem de Serviço ${item.source_order_code}`
      : 'Criado no Portal de Orçamentos',

  itens:
    Array.isArray(item.items)
      ? item.items.map(i => ({
          descricao:
            i.description,

          quantidade:
            Number(
              i.quantity || 0
            ),

          unitario:
            Number(
              i.unitPrice || 0
            )
        }))
      : []
});

const criarRascunho = (
  selecionado: Orcamento,
  clausulaPadrao: string
): RascunhoOrcamento => ({
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
    selecionado
      .condicoesPagamento,

  observacoes:
    selecionado.observacoes,

  clausulaComercial:
    selecionado
      .clausulaComercial ||
    clausulaPadrao,

  desconto:
    numeroParaCampoMoeda(
      selecionado.desconto
    ),

  itens:
    garantirMaoDeObra(
      selecionado.itens.map(
        item => ({
          descricao:
            item.descricao,

          quantidade:
            item.quantidade,

          unitario:
            numeroParaCampoMoeda(
              item.unitario
            )
        })
      )
    )
});

const statusClass = (
  status: StatusOrcamento
) => {
  if (
    status === 'Aprovado'
  ) {
    return 'status aprovado';
  }

  if (
    status === 'Convertido em OS'
  ) {
    return 'status convertido';
  }

  if (
    status === 'Em elaboração'
  ) {
    return 'status elaboracao';
  }

  if (
    status === 'Pronto para enviar'
  ) {
    return 'status pronto';
  }

  if (
    status === 'Rejeitado' ||
    status === 'Cancelado' ||
    status === 'Expirado'
  ) {
    return 'status rejeitado';
  }

  return 'status aguardando';
};

const statusVisual = (
  orcamento: Orcamento
) => {
  if (
    orcamento.status ===
      'Aprovado' &&
    osConcluida(
      orcamento
        .sourceOrderStatus
    )
  ) {
    return 'Executado / Concluído';
  }

  return orcamento.status;
};

export default function OrcamentoApp() {
  const [
    orcamentos,
    setOrcamentos
  ] =
    useState<Orcamento[]>([]);

  const [
    selecionado,
    setSelecionado
  ] =
    useState<Orcamento | null>(
      null
    );

  const [
    busca,
    setBusca
  ] = useState('');

  const [
    mensagem,
    setMensagem
  ] = useState('');

  const [
    carregando,
    setCarregando
  ] = useState(true);

  const [
    editando,
    setEditando
  ] = useState(false);

  const [
    salvando,
    setSalvando
  ] = useState(false);

  const [
    enviandoId,
    setEnviandoId
  ] =
    useState<string | null>(
      null
    );

  const [
    organizandoIa,
    setOrganizandoIa
  ] = useState(false);

  const [
    mostrarHistorico,
    setMostrarHistorico
  ] = useState(false);

  const [
    configAberta,
    setConfigAberta
  ] = useState(false);

  const [
    clausulaPadrao,
    setClausulaPadrao
  ] = useState('');

  const [
    clausulaPadraoEdicao,
    setClausulaPadraoEdicao
  ] = useState('');

  const [
    salvandoConfig,
    setSalvandoConfig
  ] = useState(false);

  const [
    rascunho,
    setRascunho
  ] =
    useState<
      RascunhoOrcamento | null
    >(null);

  const demonstrar = (
    texto: string
  ) => {
    setMensagem(texto);

    window.setTimeout(
      () => setMensagem(''),
      3000
    );
  };

  const carregarOrcamentos =
    async () => {
      const response =
        await fetch(
          '/api/orcamentos'
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
          `API respondeu ${response.status}`
        );
      }

      const reais:
        Orcamento[] =
        Array.isArray(
          data.orcamentos
        )
          ? data.orcamentos
              .map(
                mapearOrcamento
              )
          : [];

      setOrcamentos(reais);

      return reais;
    };

  useEffect(() => {
    let ativo = true;

    const iniciar =
      async () => {
        try {
          const [
            listaResponse,
            configResponse
          ] =
            await Promise.all([
              fetch(
                '/api/orcamentos'
              ),

              fetch(
                '/api/configuracoes/comercial'
              )
            ]);

          const listaData =
            await listaResponse
              .json();

          const configData =
            await configResponse
              .json();

          if (
            !listaResponse.ok
          ) {
            throw new Error(
              listaData?.error ||
              `API respondeu ${listaResponse.status}`
            );
          }

          if (!ativo) {
            return;
          }

          setOrcamentos(
            Array.isArray(
              listaData.orcamentos
            )
              ? listaData
                  .orcamentos
                  .map(
                    mapearOrcamento
                  )
              : []
          );

          if (
            configResponse.ok
          ) {
            const padrao =
              String(
                configData
                  ?.configuracao
                  ?.defaultCommercialClause ||
                ''
              );

            setClausulaPadrao(
              padrao
            );

            setClausulaPadraoEdicao(
              padrao
            );
          }

        } catch (error) {
          console.error(
            '[Mantezia Orçamentos] Falha ao carregar:',
            error
          );

          if (ativo) {
            setMensagem(
              error instanceof Error
                ? error.message
                : 'Não foi possível carregar os orçamentos.'
            );
          }

        } finally {
          if (ativo) {
            setCarregando(
              false
            );
          }
        }
      };

    void iniciar();

    return () => {
      ativo = false;
    };

  }, []);

  useEffect(() => {
    if (!selecionado) {
      setRascunho(null);
      setEditando(false);
      return;
    }

    setRascunho(
      criarRascunho(
        selecionado,
        clausulaPadrao
      )
    );

    setEditando(
      selecionado.status ===
        'Em elaboração'
    );

  }, [
    selecionado?.databaseId,
    clausulaPadrao
  ]);

  const subtotalRascunho =
    useMemo(
      () => {
        if (!rascunho) {
          return 0;
        }

        return rascunho
          .itens
          .reduce(
            (
              soma,
              item
            ) =>
              soma +
              (
                Number(
                  item.quantidade
                ) || 0
              ) *
              campoMoedaParaNumero(
                item.unitario
              ),
            0
          );
      },
      [rascunho]
    );

  const totalRascunho =
    Math.max(
      0,

      subtotalRascunho -
        campoMoedaParaNumero(
          rascunho
            ?.desconto ||
          ''
        )
    );

  const atualizarItem = (
    index: number,

    campo:
      | 'descricao'
      | 'quantidade'
      | 'unitario',

    valor:
      string | number
  ) => {
    setRascunho(
      atual => {
        if (!atual) {
          return atual;
        }

        return {
          ...atual,

          itens:
            atual.itens.map(
              (
                item,
                i
              ) => {
                if (
                  i !== index
                ) {
                  return item;
                }

                if (
                  ehMaoDeObra(
                    item.descricao
                  ) &&
                  campo ===
                    'descricao'
                ) {
                  return item;
                }

                return {
                  ...item,

                  [campo]:
                    campo ===
                      'quantidade'
                      ? Number(
                          valor
                        )
                      : String(
                          valor
                        )
                };
              }
            )
        };
      }
    );
  };

  const adicionarItem =
    () => {
      setRascunho(
        atual => {
          if (!atual) {
            return atual;
          }

          return {
            ...atual,

            itens:[
              ...atual.itens,

              {
                descricao:'',
                quantidade:1,
                unitario:''
              }
            ]
          };
        }
      );
    };

  const removerItem = (
    index: number
  ) => {
    setRascunho(
      atual => {
        if (!atual) {
          return atual;
        }

        const item =
          atual.itens[index];

        if (
          item &&
          ehMaoDeObra(
            item.descricao
          )
        ) {
          demonstrar(
            'Mão de obra é obrigatória e não pode ser removida.'
          );

          return atual;
        }

        return {
          ...atual,

          itens:
            atual.itens
              .filter(
                (_,i) =>
                  i !== index
              )
        };
      }
    );
  };

  const organizarComIA =
    async () => {
      if (
        !selecionado ||
        !rascunho ||
        organizandoIa ||
        selecionado.status !==
          'Em elaboração'
      ) {
        return;
      }

      setOrganizandoIa(
        true
      );

      try {
        const response =
          await fetch(
            `/api/orcamentos/${selecionado.databaseId}/organizar-ia`,
            {
              method:'POST'
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ||
            'Não foi possível organizar o orçamento com IA.'
          );
        }

        const sugestao =
          data?.sugestao ||
          {};

        setRascunho(
          atual => {
            if (!atual) {
              return atual;
            }

            const descricoes =
              Array.isArray(
                sugestao.itens
              )
                ? sugestao
                    .itens
                    .map(
                      (
                        item:
                          unknown
                      ) =>
                        String(
                          item ||
                          ''
                        ).trim()
                    )
                    .filter(
                      Boolean
                    )
                : [];

            const indicesNaoMaoDeObra =
              atual.itens
                .map(
                  (
                    item,
                    index
                  ) => ({
                    item,
                    index
                  })
                )
                .filter(
                  ({
                    item
                  }) =>
                    !ehMaoDeObra(
                      item
                        .descricao
                    )
                );

            const itens =
              atual.itens.map(
                item => ({
                  ...item
                })
              );

            descricoes.forEach(
              (
                descricao:
                  string,

                posicao:
                  number
              ) => {
                if (
                  ehMaoDeObra(
                    descricao
                  )
                ) {
                  return;
                }

                const alvo =
                  indicesNaoMaoDeObra[
                    posicao
                  ];

                if (alvo) {
                  itens[
                    alvo.index
                  ] = {
                    ...itens[
                      alvo.index
                    ],

                    descricao
                  };

                  return;
                }

                if (
                  !itens.some(
                    item =>
                      normalizarTexto(
                        item.descricao
                      ) ===
                      normalizarTexto(
                        descricao
                      )
                  )
                ) {
                  itens.push({
                    descricao,
                    quantidade:1,
                    unitario:''
                  });
                }
              }
            );

            return {
              ...atual,

              diagnostico:
                String(
                  sugestao
                    .diagnostico ||
                  ''
                ).trim() ||
                atual.diagnostico,

              causa:
                String(
                  sugestao
                    .causa ||
                  ''
                ).trim() ||
                atual.causa,

              recomendacao:
                String(
                  sugestao
                    .recomendacao ||
                  ''
                ).trim() ||
                atual
                  .recomendacao,

              itens:
                garantirMaoDeObra(
                  itens
                )
            };
          }
        );

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
        setOrganizandoIa(
          false
        );
      }
    };

  const salvarOrcamentoCompleto =
    async () => {
      if (
        !selecionado ||
        !rascunho ||
        salvando
      ) {
        return;
      }

      const maoDeObra =
        rascunho.itens.find(
          item =>
            ehMaoDeObra(
              item.descricao
            )
        );

      if (!maoDeObra) {
        demonstrar(
          'Inclua o item obrigatório Mão de obra.'
        );

        return;
      }

      if (
        campoMoedaParaNumero(
          maoDeObra.unitario
        ) <= 0
      ) {
        demonstrar(
          'Informe o valor da Mão de obra antes de salvar.'
        );

        return;
      }

      if (
        rascunho.itens.some(
          item =>
            !item.descricao
              .trim() ||

            Number(
              item.quantidade
            ) <= 0 ||

            campoMoedaParaNumero(
              item.unitario
            ) < 0
        )
      ) {
        demonstrar(
          'Revise os itens do orçamento.'
        );

        return;
      }

      const desconto =
        campoMoedaParaNumero(
          rascunho.desconto
        );

      if (
        desconto < 0 ||
        desconto >
          subtotalRascunho
      ) {
        demonstrar(
          'Desconto inválido.'
        );

        return;
      }

      if (
        rascunho
          .clausulaComercial
          .trim()
          .length < 3
      ) {
        demonstrar(
          'Informe a cláusula comercial.'
        );

        return;
      }

      setSalvando(true);

      try {
        const comercialResponse =
          await fetch(
            `/api/orcamentos/${selecionado.databaseId}`,
            {
              method:'PUT',

              headers:{
                'Content-Type':
                  'application/json'
              },

              body:
                JSON.stringify({
                  validUntil:
                    rascunho
                      .validadeIso ||
                    null,

                  warrantyDays:
                    rascunho
                      .garantiaDias,

                  executionDays:
                    rascunho
                      .prazoExecucaoDias,

                  paymentTerms:
                    rascunho
                      .condicoesPagamento
                      .trim() ||
                    null,

                  notes:
                    rascunho
                      .observacoes
                      .trim() ||
                    null,

                  commercialClause:
                    rascunho
                      .clausulaComercial
                      .trim(),

                  discount:
                    desconto,

                  items:
                    rascunho
                      .itens
                      .map(
                        item => ({
                          description:
                            item
                              .descricao
                              .trim(),

                          quantity:
                            Number(
                              item
                                .quantidade
                            ),

                          unitPrice:
                            campoMoedaParaNumero(
                              item
                                .unitario
                            )
                        })
                      )
                })
            }
          );

        const comercialData =
          await comercialResponse
            .json();

        if (
          !comercialResponse.ok
        ) {
          throw new Error(
            comercialData
              ?.error ||
            'Não foi possível salvar os dados comerciais.'
          );
        }

        const tecnicoResponse =
          await fetch(
            `/api/orcamentos/${selecionado.databaseId}/tecnico`,
            {
              method:'PUT',

              headers:{
                'Content-Type':
                  'application/json'
              },

              body:
                JSON.stringify({
                  technicalDiagnosis:
                    rascunho
                      .diagnostico
                      .trim(),

                  technicalCause:
                    rascunho
                      .causa
                      .trim(),

                  technicalRecommendation:
                    rascunho
                      .recomendacao
                      .trim()
                })
            }
          );

        const tecnicoData =
          await tecnicoResponse
            .json();

        if (
          !tecnicoResponse.ok
        ) {
          throw new Error(
            tecnicoData
              ?.error ||
            'Não foi possível salvar a parte técnica.'
          );
        }

        const statusResponse =
          await fetch(
            `/api/orcamentos/${selecionado.databaseId}/status`,
            {
              method:'PUT',

              headers:{
                'Content-Type':
                  'application/json'
              },

              body:
                JSON.stringify({
                  status:
                    'ready_to_send',

                  changedBy:
                    'Administrativo',

                  reason:
                    'Orçamento elaborado e pronto para envio'
                })
            }
          );

        const statusData =
          await statusResponse
            .json();

        if (
          !statusResponse.ok
        ) {
          throw new Error(
            statusData?.error ||
            'Não foi possível marcar como pronto para enviar.'
          );
        }

        await carregarOrcamentos();

        setSelecionado(null);
        setRascunho(null);
        setEditando(false);

        demonstrar(
          'Orçamento salvo. Agora está pronto para enviar.'
        );

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

  const enviarParaAprovacao =
    async (
      orcamento:
        Orcamento
    ) => {
      if (
        enviandoId ||
        orcamento.status !==
          'Pronto para enviar'
      ) {
        return;
      }

      setEnviandoId(
        orcamento.databaseId
      );

      try {
        const response =
          await fetch(
            `/api/orcamentos/${orcamento.databaseId}/status`,
            {
              method:'PUT',

              headers:{
                'Content-Type':
                  'application/json'
              },

              body:
                JSON.stringify({
                  status:
                    'pending_approval',

                  changedBy:
                    'Administrativo',

                  reason:
                    'Proposta enviada para aprovação'
                })
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ||
            `API respondeu ${response.status}`
          );
        }

        await carregarOrcamentos();

        if (
          selecionado
            ?.databaseId ===
          orcamento.databaseId
        ) {
          setSelecionado(
            null
          );
        }

        demonstrar(
          'Orçamento enviado para aprovação.'
        );

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
        setEnviandoId(null);
      }
    };

  const salvarConfiguracaoComercial =
    async () => {
      if (salvandoConfig) {
        return;
      }

      const valor =
        clausulaPadraoEdicao
          .trim();

      if (
        valor.length < 3
      ) {
        demonstrar(
          'Informe a cláusula comercial padrão.'
        );

        return;
      }

      setSalvandoConfig(true);

      try {
        const response =
          await fetch(
            '/api/configuracoes/comercial',
            {
              method:'PUT',

              headers:{
                'Content-Type':
                  'application/json'
              },

              body:
                JSON.stringify({
                  defaultCommercialClause:
                    valor
                })
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ||
            'Não foi possível salvar a configuração.'
          );
        }

        const salvo =
          String(
            data
              ?.configuracao
              ?.defaultCommercialClause ||
            valor
          );

        setClausulaPadrao(
          salvo
        );

        setClausulaPadraoEdicao(
          salvo
        );

        setConfigAberta(
          false
        );

        demonstrar(
          'Cláusula comercial padrão salva.'
        );

      } catch (error) {
        console.error(
          '[Mantezia Orçamentos] Falha ao salvar configuração comercial:',
          error
        );

        demonstrar(
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar a configuração.'
        );

      } finally {
        setSalvandoConfig(
          false
        );
      }
    };

  const resumoCompartilhamento =
    () => {
      if (!selecionado) {
        return '';
      }

      const itens =
        selecionado.itens
          .map(
            item =>
              `- ${item.quantidade}x ${item.descricao}: ` +
              moeda(
                item.quantidade *
                item.unitario
              )
          )
          .join('\n');

      return [
        `Orçamento ${selecionado.id}`,
        `Cliente: ${selecionado.cliente}`,
        `Equipamento: ${selecionado.equipamento}`,

        selecionado.origem &&
        selecionado.origem !== '-'
          ? `Origem: ${selecionado.origem}`
          : '',

        '',
        `Diagnóstico: ${selecionado.descricao}`,

        selecionado.causa
          ? `Causa: ${selecionado.causa}`
          : '',

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

        selecionado.clausulaComercial
          ? `Cláusula comercial: ${selecionado.clausulaComercial}`
          : '',

        selecionado.observacoes
          ? `Observações: ${selecionado.observacoes}`
          : ''
      ]
        .filter(Boolean)
        .join('\n');
    };


  const gerarPdf = () => {
    if (!selecionado) {
      demonstrar(
        'Selecione um orçamento.'
      );

      return;
    }

    const janela =
      window.open(
        '',
        '_blank'
      );

    if (!janela) {
      demonstrar(
        'O navegador bloqueou a janela do PDF. Libere pop-ups e tente novamente.'
      );

      return;
    }

    const itensHtml =
      selecionado.itens
        .map(
          item => `
            <tr>
              <td>${escaparHtml(
                item.descricao
              )}</td>

              <td>${escaparHtml(
                item.quantidade
              )}</td>

              <td>${escaparHtml(
                moeda(
                  item.unitario
                )
              )}</td>

              <td>${escaparHtml(
                moeda(
                  item.quantidade *
                  item.unitario
                )
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

          <title>
            ${escaparHtml(selecionado.id)}
            - Mantezia Orçamentos
          </title>

          <style>
            * {
              box-sizing:border-box;
            }

            body {
              margin:0;
              padding:36px;
              color:#17324a;
              font-family:
                Arial,
                Helvetica,
                sans-serif;
              font-size:13px;
            }

            .head {
              display:flex;
              justify-content:
                space-between;
              gap:24px;
              padding-bottom:18px;
              border-bottom:
                3px solid #0b7f78;
            }

            h1 {
              margin:0;
              font-size:24px;
            }

            h2 {
              margin:24px 0 8px;
              font-size:13px;
              text-transform:
                uppercase;
              color:#647789;
            }

            .muted {
              color:#6b7d8d;
            }

            .box {
              background:#f6f9fb;
              border:
                1px solid #e1e8ed;
              border-radius:8px;
              padding:12px;
              line-height:1.5;
              white-space:pre-wrap;
            }

            .grid {
              display:grid;
              grid-template-columns:
                1fr 1fr;
              gap:10px 20px;
              margin-top:18px;
            }

            .label {
              display:block;
              font-size:10px;
              font-weight:700;
              color:#7b8d9b;
              text-transform:
                uppercase;
              margin-bottom:3px;
            }

            table {
              width:100%;
              border-collapse:
                collapse;
              margin-top:8px;
            }

            th,
            td {
              border-bottom:
                1px solid #e7ecef;
              padding:9px 6px;
              text-align:left;
            }

            th {
              font-size:10px;
              text-transform:
                uppercase;
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
              border-top:
                1px solid #e5eaee;
              font-size:10px;
              color:#8795a1;
              text-align:center;
            }

            @media print {
              body {
                padding:18px;
              }
            }
          </style>
        </head>

        <body>
          <div class="head">
            <div>
              <h1>
                Mantezia Orçamentos
              </h1>

              <div class="muted">
                Proposta comercial
              </div>
            </div>

            <div style="text-align:right">
              <strong>
                ${escaparHtml(
                  selecionado.id
                )}
              </strong>

              <br/>

              <span class="muted">
                Validade:
                ${escaparHtml(
                  selecionado.validade
                )}
              </span>
            </div>
          </div>

          <div class="grid">
            <div>
              <span class="label">
                Cliente
              </span>

              <strong>
                ${escaparHtml(
                  selecionado.cliente
                )}
              </strong>
            </div>

            <div>
              <span class="label">
                Equipamento
              </span>

              <strong>
                ${escaparHtml(
                  selecionado.equipamento
                )}
              </strong>
            </div>

            <div>
              <span class="label">
                Técnico responsável
              </span>

              ${escaparHtml(
                selecionado.tecnico
              )}
            </div>

            <div>
              <span class="label">
                Origem
              </span>

              ${escaparHtml(
                selecionado.origem
              )}
            </div>
          </div>

          <h2>
            Diagnóstico
          </h2>

          <div class="box">
            ${escaparHtml(
              selecionado.descricao
            )}
          </div>

          ${
            selecionado.causa
              ? `
                <h2>Causa</h2>
                <div class="box">
                  ${escaparHtml(
                    selecionado.causa
                  )}
                </div>
              `
              : ''
          }

          ${
            selecionado.recomendacao
              ? `
                <h2>
                  Serviço recomendado
                </h2>

                <div class="box">
                  ${escaparHtml(
                    selecionado.recomendacao
                  )}
                </div>
              `
              : ''
          }

          <h2>
            Itens da proposta
          </h2>

          <table>
            <thead>
              <tr>
                <th>
                  Descrição
                </th>

                <th>
                  Qtd.
                </th>

                <th>
                  Unitário
                </th>

                <th>
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              ${itensHtml}
            </tbody>
          </table>

          ${
            selecionado.desconto > 0
              ? `
                <div
                  style="
                    margin-top:10px;
                    text-align:right
                  "
                >
                  Desconto:
                  <strong>
                    -
                    ${escaparHtml(
                      moeda(
                        selecionado.desconto
                      )
                    )}
                  </strong>
                </div>
              `
              : ''
          }

          <div class="total">
            Total:
            ${escaparHtml(
              moeda(
                selecionado.valor
              )
            )}
          </div>

          <h2>
            Condições comerciais
          </h2>

          <div class="grid">
            <div>
              <span class="label">
                Garantia
              </span>

              ${escaparHtml(
                selecionado.garantiaDias
              )} dias
            </div>

            <div>
              <span class="label">
                Prazo estimado
              </span>

              ${
                selecionado
                  .prazoExecucaoDias ==
                null
                  ? 'Não informado'
                  : `
                    ${escaparHtml(
                      selecionado
                        .prazoExecucaoDias
                    )} dias
                  `
              }
            </div>

            <div>
              <span class="label">
                Pagamento
              </span>

              ${escaparHtml(
                selecionado
                  .condicoesPagamento ||
                'Não informado'
              )}
            </div>

            <div>
              <span class="label">
                Validade
              </span>

              ${escaparHtml(
                selecionado.validade
              )}
            </div>
          </div>

          ${
            selecionado.clausulaComercial
              ? `
                <h2>
                  Cláusula comercial
                </h2>

                <div class="box">
                  ${escaparHtml(
                    selecionado
                      .clausulaComercial
                  )}
                </div>
              `
              : ''
          }

          ${
            selecionado.observacoes
              ? `
                <h2>
                  Observações
                </h2>

                <div class="box">
                  ${escaparHtml(
                    selecionado
                      .observacoes
                  )}
                </div>
              `
              : ''
          }

          <div class="footer">
            Documento emitido pelo
            Mantezia Orçamentos.
          </div>

          <script>
            window.addEventListener(
              'load',
              () => {
                setTimeout(
                  () => window.print(),
                  250
                );
              }
            );
          </script>
        </body>
      </html>
    `);

    janela.document.close();
  };


  const enviarEmail = () => {
    if (!selecionado) {
      demonstrar(
        'Selecione um orçamento.'
      );

      return;
    }

    if (!selecionado.email) {
      demonstrar(
        'Este cliente não possui e-mail cadastrado.'
      );

      return;
    }

    const assunto =
      `Orçamento ${selecionado.id} - ${selecionado.equipamento}`;

    const body =
      resumoCompartilhamento();

    window.location.href =
      `mailto:${encodeURIComponent(
        selecionado.email
      )}` +
      `?subject=${encodeURIComponent(
        assunto
      )}` +
      `&body=${encodeURIComponent(
        body
      )}`;
  };


  const enviarWhatsApp = () => {
    if (!selecionado) {
      demonstrar(
        'Selecione um orçamento.'
      );

      return;
    }

    const mensagem =
      `Olá, ${selecionado.cliente}.\n\n` +
      resumoCompartilhamento();

    const telefone =
      normalizarTelefoneWhatsApp(
        selecionado.telefone
      );

    const url =
      telefone
        ? `https://wa.me/${telefone}?text=${encodeURIComponent(
            mensagem
          )}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(
            mensagem
          )}`;

    window.open(
      url,
      '_blank',
      'noopener,noreferrer'
    );
  };


  const filtrados =
    useMemo(
      () => {
        const termo =
          busca
            .toLowerCase()
            .trim();

        if (!termo) {
          return orcamentos;
        }

        return orcamentos.filter(
          item =>
            `${
              item.id
            } ${
              item.cliente
            } ${
              item.equipamento
            } ${
              item.status
            }`
              .toLowerCase()
              .includes(
                termo
              )
        );
      },

      [
        busca,
        orcamentos
      ]
    );

  const pendenciasElaboracao =
    filtrados.filter(
      item =>
        item.status ===
        'Em elaboração'
    );

  const prontosEnviar =
    filtrados.filter(
      item =>
        item.status ===
        'Pronto para enviar'
    );

  const aguardandoAprovacaoLista =
    filtrados.filter(
      item =>
        item.status ===
        'Aguardando aprovação'
    );

  const historico =
    filtrados.filter(
      item =>
        ![
          'Em elaboração',
          'Pronto para enviar',
          'Aguardando aprovação'
        ].includes(
          item.status
        )
    );

  const emElaboracao =
    orcamentos.filter(
      item =>
        item.status ===
        'Em elaboração'
    ).length;

  const prontos =
    orcamentos.filter(
      item =>
        item.status ===
        'Pronto para enviar'
    ).length;

  const aguardandoAprovacao =
    orcamentos.filter(
      item =>
        item.status ===
        'Aguardando aprovação'
    ).length;

  const liberados =
    orcamentos.filter(
      item =>
        item.status ===
          'Aprovado' &&
        !osConcluida(
          item.sourceOrderStatus
        )
    ).length;

  const executados =
    orcamentos.filter(
      item =>
        item.status ===
          'Aprovado' &&
        osConcluida(
          item.sourceOrderStatus
        )
    ).length;

  const rejeitados =
    orcamentos.filter(
      item =>
        item.status ===
        'Rejeitado'
    ).length;

  const valorEmAberto =
    orcamentos
      .filter(
        item =>
          [
            'Em elaboração',
            'Pronto para enviar',
            'Aguardando aprovação'
          ].includes(
            item.status
          )
      )
      .reduce(
        (
          soma,
          item
        ) =>
          soma +
          item.valor,

        0
      );

  const selecionar = (
    item: Orcamento
  ) => {
    setSelecionado(item);
    setConfigAberta(false);
  };

  const renderLinha = (
    item: Orcamento
  ) => (
    <div
      key={item.id}

      className={`row ${
        selecionado
          ?.databaseId ===
        item.databaseId
          ? 'selected'
          : ''
      }`}

      onClick={() =>
        selecionar(item)
      }
    >
      <div>
        <div className="osid">
          {item.id}
        </div>

        <div className="client">
          {item.cliente}
        </div>

        <div className="equipment">
          {item.equipamento}
        </div>
      </div>

      <div className="queue-bottom">
        <span
          className={
            statusClass(
              item.status
            )
          }
        >
          {statusVisual(item)}
        </span>

        <span className="value">
          {moeda(item.valor)}
        </span>
      </div>

      {item.status ===
        'Pronto para enviar' && (
        <button
          className="queue-send"

          disabled={
            enviandoId ===
            item.databaseId
          }

          onClick={event => {
            event.stopPropagation();

            void enviarParaAprovacao(
              item
            );
          }}
        >
          {enviandoId ===
          item.databaseId
            ? 'Enviando...'
            : 'Enviar para aprovação'}
        </button>
      )}
    </div>
  );

  return (
    <div className="orc-page">
      <style>{`
        * {
          box-sizing:border-box;
        }

        body {
          margin:0;
          background:#f4f7fb;
          color:#152536;
          font-family:Inter,Arial,sans-serif;
        }

        button,
        input,
        textarea {
          font:inherit;
        }

        button:disabled {
          opacity:.55;
          cursor:not-allowed;
        }

        .orc-page {
          min-height:100vh;
        }

        .topbar {
          height:70px;
          background:white;
          border-bottom:1px solid #e4ebf0;
          display:flex;
          align-items:center;
          justify-content:space-between;
          padding:0 25px;
          position:sticky;
          top:0;
          z-index:5;
        }

        .brand {
          display:flex;
          align-items:center;
          gap:11px;
        }

        .brand img {
          width:37px;
          height:37px;
          border-radius:9px;
        }

        .brand-title {
          font-weight:900;
          color:#173c50;
          font-size:16px;
        }

        .brand-sub {
          color:#8a98a5;
          font-size:10px;
          margin-top:2px;
        }

        .demo-pill {
          background:#edf8f6;
          color:#087b73;
          padding:7px 10px;
          border-radius:999px;
          font-size:10px;
          font-weight:850;
        }

        .layout {
          display:grid;
          grid-template-columns:210px 1fr;
          min-height:calc(100vh - 70px);
        }

        .sidebar {
          background:#123247;
          color:#dfe9ef;
          padding:23px 15px;
        }

        .side-label {
          color:#7990a1;
          text-transform:uppercase;
          letter-spacing:.09em;
          font-size:9px;
          font-weight:850;
          padding:0 10px 8px;
        }

        .navitem {
          padding:10px 11px;
          margin:3px 0;
          border-radius:8px;
          font-size:13px;
          font-weight:650;
        }

        .navitem.active {
          background:#eaf5f4;
          color:#087b73;
        }

        .main {
          padding:26px;
          max-width:1600px;
          width:100%;
          margin:0 auto;
        }

        .heading {
          display:flex;
          justify-content:space-between;
          gap:20px;
          align-items:flex-start;
          margin-bottom:22px;
        }

        .heading-actions {
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          justify-content:flex-end;
        }

        h1 {
          margin:0;
          font-size:27px;
          color:#102a43;
        }

        .subtitle {
          margin-top:6px;
          color:#718096;
          font-size:14px;
        }

        .primary {
          border:0;
          padding:11px 17px;
          background:#07877f;
          color:white;
          border-radius:9px;
          font-weight:750;
          cursor:pointer;
        }

        .secondary {
          background:white;
          color:#315166;
          border:1px solid #d5dfe6;
          padding:9px 11px;
          border-radius:8px;
          font-size:11px;
          font-weight:750;
          cursor:pointer;
        }

        .secondary:hover {
          background:#f7fafc;
        }

        .approve {
          background:#07877f;
          border-color:#07877f;
          color:white;
        }

        .cards {
          display:grid;
          grid-template-columns:
            repeat(
              auto-fit,
              minmax(145px,1fr)
            );
          gap:12px;
          margin-bottom:22px;
        }

        .card {
          background:white;
          border:1px solid #e7edf2;
          border-radius:13px;
          padding:16px;
          box-shadow:
            0 3px 12px
            rgba(31,55,79,.035);
        }

        .card-label {
          font-size:11px;
          color:#7a8c9b;
          font-weight:750;
        }

        .card-value {
          margin-top:8px;
          font-size:24px;
          font-weight:850;
          color:#15364f;
        }

        .card-value.money {
          font-size:18px;
        }

        .config-card {
          margin-bottom:18px;
          background:white;
          border:1px solid #dce8ec;
          border-radius:14px;
          padding:18px;
        }

        .config-card-head {
          display:flex;
          justify-content:space-between;
          gap:12px;
          align-items:center;
          margin-bottom:10px;
        }

        .config-title {
          font-weight:850;
          color:#19384f;
        }

        .config-help {
          color:#718096;
          font-size:12px;
          line-height:1.45;
          margin-bottom:10px;
        }

        .config-actions {
          display:flex;
          gap:8px;
          margin-top:10px;
        }

        .content-grid {
          display:grid;
          grid-template-columns:
            minmax(0,1fr)
            360px;
          gap:18px;
          align-items:start;
        }

        .content-grid >
        .panel:first-child {
          order:2;
          position:sticky;
          top:90px;
          align-self:start;
          max-height:
            calc(100vh - 112px);
          overflow:auto;
        }

        .content-grid >
        .panel:nth-child(2) {
          order:1;
          min-width:0;
        }

        .panel {
          background:white;
          border:1px solid #e5ebf1;
          border-radius:14px;
          overflow:hidden;
        }

        .panel-head {
          padding:16px 18px;
          border-bottom:
            1px solid #edf1f5;
          display:flex;
          justify-content:
            space-between;
          gap:12px;
          align-items:center;
        }

        .panel-title {
          font-weight:800;
          color:#19384f;
        }

        .queue-tabs {
          display:flex;
          gap:6px;
        }

        .queue-tab {
          border:
            1px solid #d7e2e8;
          background:white;
          color:#526d7f;
          border-radius:8px;
          padding:7px 9px;
          font-size:10px;
          font-weight:800;
          cursor:pointer;
        }

        .queue-tab.active {
          background:#eaf5f4;
          border-color:#cde6e2;
          color:#087b73;
        }

        .search {
          width:100%;
          border:
            1px solid #d8e1e8;
          padding:9px 11px;
          border-radius:8px;
          outline:none;
          background:#fbfcfd;
        }

        .queue-tools {
          display:grid;
          gap:9px;
          width:100%;
        }

        .rows {
          padding:8px;
        }

        .queue-group-title {
          padding:12px 9px 6px;
          font-size:9px;
          letter-spacing:.08em;
          color:#8294a2;
          font-weight:900;
        }

        .queue-empty {
          padding:12px 10px;
          color:#9aa8b2;
          font-size:11px;
        }

        .row {
          padding:12px;
          border-radius:10px;
          cursor:pointer;
          border:
            1px solid transparent;
          margin-bottom:6px;
        }

        .row:hover {
          background:#f7fafc;
        }

        .row.selected {
          background:#eef8f7;
          border-color:#cfe8e5;
        }

        .osid {
          font-size:12px;
          font-weight:850;
          color:#21435d;
        }

        .client {
          font-weight:750;
          font-size:12px;
          margin-top:4px;
        }

        .equipment {
          margin-top:2px;
          color:#8493a0;
          font-size:10px;
        }

        .queue-bottom {
          display:flex;
          justify-content:
            space-between;
          gap:8px;
          align-items:center;
          margin-top:8px;
        }

        .status {
          display:inline-flex;
          width:max-content;
          padding:5px 8px;
          border-radius:999px;
          font-size:9px;
          font-weight:850;
        }

        .aguardando {
          background:#fff5da;
          color:#8a6100;
        }

        .elaboracao {
          background:#e8f0ff;
          color:#345e9d;
        }

        .pronto {
          background:#e9f5ff;
          color:#1e628f;
        }

        .aprovado {
          background:#e7f7ed;
          color:#187143;
        }

        .convertido {
          background:#e8f6f5;
          color:#087b73;
        }

        .rejeitado {
          background:#fff0f0;
          color:#a33d3d;
        }

        .value {
          font-weight:800;
          font-size:12px;
          color:#087b73;
        }

        .queue-send {
          width:100%;
          margin-top:9px;
          border:0;
          background:#07877f;
          color:white;
          border-radius:8px;
          padding:8px 9px;
          font-size:10px;
          font-weight:850;
          cursor:pointer;
        }

        .detail {
          padding:20px;
        }

        .empty-workspace {
          min-height:520px;
          display:flex;
          align-items:center;
          justify-content:center;
          text-align:center;
          padding:40px;
        }

        .empty-icon {
          font-size:34px;
          margin-bottom:12px;
        }

        .empty-title {
          font-size:18px;
          font-weight:850;
          color:#25465a;
        }

        .empty-text {
          max-width:440px;
          margin:8px auto 0;
          color:#8393a0;
          font-size:13px;
          line-height:1.5;
        }

        .detail-top {
          display:flex;
          justify-content:
            space-between;
          align-items:flex-start;
          gap:15px;
          margin-bottom:18px;
        }

        .detail-id {
          font-size:20px;
          font-weight:850;
          color:#133850;
        }

        .section {
          border-top:
            1px solid #edf1f5;
          padding-top:15px;
          margin-top:15px;
        }

        .section-title {
          font-size:11px;
          font-weight:850;
          text-transform:uppercase;
          color:#8797a5;
          margin-bottom:10px;
        }

        .section-title-line {
          display:flex;
          align-items:center;
          justify-content:
            space-between;
          gap:12px;
          margin-bottom:10px;
        }

        .section-title-line
        .section-title {
          margin-bottom:0;
        }

        .info-grid {
          display:grid;
          grid-template-columns:
            1fr 1fr;
          gap:12px;
        }

        .label {
          font-size:10px;
          color:#8a98a5;
          font-weight:700;
        }

        .info {
          margin-top:3px;
          font-size:13px;
          font-weight:700;
          color:#304b60;
          white-space:pre-wrap;
        }

        .diagnosis {
          background:#f7fafc;
          border-radius:9px;
          padding:12px;
          font-size:13px;
          color:#455f73;
          line-height:1.45;
          white-space:pre-wrap;
        }

        .edit-input {
          width:100%;
          border:
            1px solid #d4dee6;
          border-radius:8px;
          padding:8px 9px;
          background:white;
          color:#25445a;
          outline:none;
        }

        .edit-input:focus {
          border-color:#07877f;
          box-shadow:
            0 0 0 2px
            rgba(7,135,127,.10);
        }

        .edit-input:disabled {
          background:#f3f6f8;
          color:#657b8a;
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

        .ai-button {
          border:
            1px solid #c9ddd9;
          background:#eef8f7;
          color:#087b73;
          padding:8px 12px;
          border-radius:9px;
          font-size:11px;
          font-weight:850;
          cursor:pointer;
        }

        .ai-warning {
          background:#fff9e8;
          border:
            1px solid #f3df9c;
          color:#735c17;
          padding:10px 12px;
          border-radius:9px;
          font-size:11px;
          line-height:1.4;
        }

        .edit-item {
          display:grid;
          grid-template-columns:
            minmax(150px,1fr)
            80px
            145px
            34px;
          gap:8px;
          margin-bottom:8px;
          align-items:center;
        }

        .money-field {
          display:flex;
          align-items:center;
          border:
            1px solid #d4dee6;
          border-radius:8px;
          background:white;
          overflow:hidden;
        }

        .money-prefix {
          padding:0 8px;
          color:#537082;
          font-size:12px;
          font-weight:800;
          border-right:
            1px solid #e3e9ed;
        }

        .money-field input {
          border:0;
          border-radius:0;
          box-shadow:none !important;
        }

        .danger-mini {
          border:
            1px solid #e6d6d6;
          background:white;
          color:#a14a4a;
          border-radius:8px;
          height:36px;
          cursor:pointer;
          font-weight:900;
        }

        .itemline {
          display:grid;
          grid-template-columns:
            1fr 50px 100px;
          gap:8px;
          padding:9px 0;
          border-bottom:
            1px solid #f0f3f5;
          font-size:12px;
        }

        .total-line {
          display:flex;
          justify-content:
            space-between;
          padding-top:14px;
          font-size:17px;
          font-weight:850;
          color:#0d675f;
        }

        .commercial-clause {
          background:#f8fbfc;
          border:
            1px solid #e3ecef;
          border-radius:9px;
          padding:12px;
          font-size:12px;
          line-height:1.5;
          color:#455f73;
          white-space:pre-wrap;
        }

        .approved-note {
          background:#e7f7ed;
          border:
            1px solid #bfe5cc;
          color:#187143;
          padding:10px 12px;
          border-radius:9px;
          font-size:12px;
          font-weight:800;
        }

        .waiting-note {
          background:#fff9e8;
          border:
            1px solid #f3df9c;
          color:#735c17;
          padding:10px 12px;
          border-radius:9px;
          font-size:12px;
          font-weight:750;
        }

        .actions {
          display:flex;
          flex-wrap:wrap;
          gap:8px;
          margin-top:18px;
        }

        .toast {
          position:fixed;
          right:25px;
          bottom:25px;
          background:#102a43;
          color:white;
          padding:13px 18px;
          border-radius:10px;
          box-shadow:
            0 10px 30px
            rgba(0,0,0,.18);
          font-size:13px;
          font-weight:700;
          z-index:10;
          max-width:420px;
        }

        .footnote {
          margin-top:15px;
          color:#96a4af;
          font-size:10px;
          text-align:right;
        }

        @media (
          max-width:1100px
        ) {
          .content-grid {
            grid-template-columns:
              1fr;
          }

          .content-grid >
          .panel:first-child {
            position:static;
            max-height:none;
          }
        }

        @media (
          max-width:780px
        ) {
          .layout {
            grid-template-columns:
              1fr;
          }

          .sidebar {
            display:none;
          }

          .main {
            padding:16px;
          }

          .topbar {
            padding:0 16px;
          }

          .info-grid {
            grid-template-columns:
              1fr;
          }

          .edit-item {
            grid-template-columns:
              1fr 70px;
          }

          .money-field {
            grid-column:
              1 / -1;
          }

          .heading {
            flex-direction:
              column;
          }
        }
      `}</style>

      <header className="topbar">
        <div className="brand">
          <img
            src="/mantezia-192.png"
            alt="Mantezia"
          />

          <div>
            <div className="brand-title">
              Mantezia Orçamentos
            </div>

            <div className="brand-sub">
              Inteligência que transforma diagnóstico em decisão
            </div>
          </div>
        </div>

        <div className="demo-pill">
          Módulo Orçamentos • Banco conectado
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="side-label">
            Comercial
          </div>

          <div className="navitem active">
            ▣ Visão Geral
          </div>

          <div className="navitem">
            ▤ Orçamentos
          </div>

          <div className="navitem">
            ✓ Aprovações
          </div>

          <div className="navitem">
            ◎ Clientes
          </div>

          <div
            className="side-label"
            style={{
              marginTop:28
            }}
          >
            Integração
          </div>

          <div className="navitem">
            ↔ Ordens de Serviço
          </div>

          <div className="navitem">
            ◈ Indicadores
          </div>

          <div
            className="navitem"

            style={{
              cursor:'pointer'
            }}

            onClick={() =>
              setConfigAberta(
                valor => !valor
              )
            }
          >
            ⚙ Configurações
          </div>
        </aside>

        <main className="main">
          <div className="heading">
            <div>
              <h1>
                Portal de Orçamentos
              </h1>

              <div className="subtitle">
                Propostas comerciais conectadas à operação técnica Mantezia.
              </div>
            </div>

            <div className="heading-actions">
              <button
                className="secondary"

                onClick={() =>
                  setConfigAberta(
                    valor => !valor
                  )
                }
              >
                ⚙ Cláusula padrão
              </button>

              <button
                className="primary"

                onClick={() =>
                  demonstrar(
                    'Novo orçamento — fluxo em conclusão'
                  )
                }
              >
                + Novo orçamento
              </button>
            </div>
          </div>

          {configAberta && (
            <section className="config-card">
              <div className="config-card-head">
                <div className="config-title">
                  Cláusula comercial padrão
                </div>

                <button
                  className="secondary"

                  onClick={() => {
                    setClausulaPadraoEdicao(
                      clausulaPadrao
                    );

                    setConfigAberta(
                      false
                    );
                  }}
                >
                  Fechar
                </button>
              </div>

              <div className="config-help">
                Esta cláusula será copiada para os novos orçamentos.
                Alterar o padrão não modifica propostas antigas e cada
                orçamento poderá ter sua própria redação.
              </div>

              <textarea
                className="edit-input"
                rows={4}
                value={
                  clausulaPadraoEdicao
                }

                onChange={e =>
                  setClausulaPadraoEdicao(
                    e.target.value
                  )
                }
              />

              <div className="config-actions">
                <button
                  className="secondary approve"

                  disabled={
                    salvandoConfig
                  }

                  onClick={() =>
                    void salvarConfiguracaoComercial()
                  }
                >
                  {salvandoConfig
                    ? 'Salvando...'
                    : 'Salvar padrão'}
                </button>
              </div>
            </section>
          )}

          <section className="cards">
            <div className="card">
              <div className="card-label">
                Em elaboração
              </div>

              <div className="card-value">
                {emElaboracao}
              </div>
            </div>

            <div className="card">
              <div className="card-label">
                Prontos para enviar
              </div>

              <div className="card-value">
                {prontos}
              </div>
            </div>

            <div className="card">
              <div className="card-label">
                Aguardando aprovação
              </div>

              <div className="card-value">
                {aguardandoAprovacao}
              </div>
            </div>

            <div className="card">
              <div className="card-label">
                Liberados para execução
              </div>

              <div className="card-value">
                {liberados}
              </div>
            </div>

            <div className="card">
              <div className="card-label">
                Executados / concluídos
              </div>

              <div className="card-value">
                {executados}
              </div>
            </div>

            <div className="card">
              <div className="card-label">
                Rejeitados
              </div>

              <div className="card-value">
                {rejeitados}
              </div>
            </div>

            <div className="card">
              <div className="card-label">
                Valor em aberto
              </div>

              <div className="card-value money">
                {moeda(
                  valorEmAberto
                )}
              </div>
            </div>
          </section>

          <div className="content-grid">
            <section className="panel">
              <div
                className="panel-head"

                style={{
                  flexDirection:
                    'column',

                  alignItems:
                    'stretch'
                }}
              >
                <div className="queue-tools">
                  <div
                    style={{
                      display:'flex',

                      justifyContent:
                        'space-between',

                      gap:10,

                      alignItems:
                        'center'
                    }}
                  >
                    <div className="panel-title">
                      {mostrarHistorico
                        ? 'Histórico'
                        : 'Pendências'}
                    </div>

                    <div className="queue-tabs">
                      <button
                        className={`queue-tab ${
                          !mostrarHistorico
                            ? 'active'
                            : ''
                        }`}

                        onClick={() =>
                          setMostrarHistorico(
                            false
                          )
                        }
                      >
                        Pendências
                      </button>

                      <button
                        className={`queue-tab ${
                          mostrarHistorico
                            ? 'active'
                            : ''
                        }`}

                        onClick={() =>
                          setMostrarHistorico(
                            true
                          )
                        }
                      >
                        Histórico
                      </button>
                    </div>
                  </div>

                  <input
                    className="search"
                    placeholder="Buscar orçamento..."
                    value={busca}

                    onChange={e =>
                      setBusca(
                        e.target.value
                      )
                    }
                  />
                </div>
              </div>

              <div className="rows">
                {carregando ? (
                  <div className="queue-empty">
                    Carregando...
                  </div>

                ) : mostrarHistorico ? (
                  historico.length > 0
                    ? historico.map(
                        renderLinha
                      )

                    : (
                      <div className="queue-empty">
                        Nenhum item no histórico.
                      </div>
                    )

                ) : (
                  <>
                    <div className="queue-group-title">
                      AGUARDANDO ELABORAÇÃO
                    </div>

                    {pendenciasElaboracao
                      .length > 0
                      ? pendenciasElaboracao
                          .map(
                            renderLinha
                          )

                      : (
                        <div className="queue-empty">
                          Nenhum orçamento aguardando elaboração.
                        </div>
                      )}

                    <div className="queue-group-title">
                      PRONTOS PARA ENVIAR
                    </div>

                    {prontosEnviar
                      .length > 0
                      ? prontosEnviar.map(
                          renderLinha
                        )

                      : (
                        <div className="queue-empty">
                          Nenhum orçamento pronto para enviar.
                        </div>
                      )}

                    <div className="queue-group-title">
                      AGUARDANDO APROVAÇÃO
                    </div>

                    {aguardandoAprovacaoLista
                      .length > 0
                      ? aguardandoAprovacaoLista
                          .map(
                            renderLinha
                          )

                      : (
                        <div className="queue-empty">
                          Nenhum orçamento aguardando aprovação.
                        </div>
                      )}
                  </>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div className="panel-title">
                  {selecionado
                    ? 'Detalhes da proposta'
                    : 'Área de trabalho'}
                </div>

                {selecionado && (
                  <span
                    className={
                      statusClass(
                        selecionado
                          .status
                      )
                    }
                  >
                    {statusVisual(
                      selecionado
                    )}
                  </span>
                )}
              </div>

              {!selecionado ||
              !rascunho ? (
                <div className="empty-workspace">
                  <div>
                    <div className="empty-icon">
                      ▤
                    </div>

                    <div className="empty-title">
                      Nenhum orçamento aberto
                    </div>

                    <div className="empty-text">
                      Escolha manualmente uma solicitação na fila lateral
                      para elaborar ou consultar. Depois de salvar, esta
                      área volta a ficar vazia.
                    </div>
                  </div>
                </div>

              ) : (
                <div className="detail">
                  <div className="detail-top">
                    <div>
                      <div className="detail-id">
                        {selecionado.id}
                      </div>

                      <div className="subtitle">
                        Validade: {selecionado.validade}
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign:'right'
                      }}
                    >
                      <div className="label">
                        VALOR TOTAL
                      </div>

                      <div
                        style={{
                          fontSize:22,
                          fontWeight:900,
                          color:'#087b73'
                        }}
                      >
                        {editando
                          ? moeda(
                              totalRascunho
                            )
                          : moeda(
                              selecionado
                                .valor
                            )}
                      </div>
                    </div>
                  </div>

                  <div className="section">
                    <div className="section-title">
                      Cliente e atendimento
                    </div>

                    <div className="info-grid">
                      <div>
                        <div className="label">
                          CLIENTE
                        </div>

                        <div className="info">
                          {selecionado.cliente}
                        </div>
                      </div>

                      <div>
                        <div className="label">
                          TÉCNICO RESPONSÁVEL
                        </div>

                        <div className="info">
                          {selecionado.tecnico}
                        </div>
                      </div>

                      <div>
                        <div className="label">
                          EQUIPAMENTO
                        </div>

                        <div className="info">
                          {selecionado.equipamento}
                        </div>
                      </div>

                      <div>
                        <div className="label">
                          ORIGEM
                        </div>

                        <div className="info">
                          {selecionado.origem}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="section">
                    <div className="section-title-line">
                      <div className="section-title">
                        Diagnóstico técnico
                      </div>

                      {selecionado.status ===
                        'Em elaboração' && (
                        <button
                          className="ai-button"

                          disabled={
                            organizandoIa
                          }

                          onClick={() =>
                            void organizarComIA()
                          }
                        >
                          {organizandoIa
                            ? '✨ Organizando...'
                            : '✨ Organizar com IA'}
                        </button>
                      )}
                    </div>

                    {editando ? (
                      <div className="technical-editor">
                        <label>
                          <span className="label">
                            DIAGNÓSTICO
                          </span>

                          <textarea
                            className="edit-input"
                            rows={4}
                            value={
                              rascunho
                                .diagnostico
                            }

                            onChange={e =>
                              setRascunho(
                                atual =>
                                  atual
                                    ? {
                                        ...atual,

                                        diagnostico:
                                          e.target.value
                                      }
                                    : atual
                              )
                            }
                          />
                        </label>

                        <label>
                          <span className="label">
                            CAUSA
                          </span>

                          <textarea
                            className="edit-input"
                            rows={3}
                            value={
                              rascunho.causa
                            }

                            onChange={e =>
                              setRascunho(
                                atual =>
                                  atual
                                    ? {
                                        ...atual,

                                        causa:
                                          e.target.value
                                      }
                                    : atual
                              )
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
                              rascunho
                                .recomendacao
                            }

                            onChange={e =>
                              setRascunho(
                                atual =>
                                  atual
                                    ? {
                                        ...atual,

                                        recomendacao:
                                          e.target.value
                                      }
                                    : atual
                              )
                            }
                          />
                        </label>

                        <div className="ai-warning">
                          A IA organiza somente a informação técnica.
                          Valores, mão de obra e condições comerciais
                          continuam sob responsabilidade da assistência.
                        </div>
                      </div>

                    ) : (
                      <div className="technical-read">
                        <div>
                          <div className="label">
                            DIAGNÓSTICO
                          </div>

                          <div className="diagnosis">
                            {selecionado.descricao}
                          </div>
                        </div>

                        {selecionado.causa && (
                          <div>
                            <div className="label">
                              CAUSA
                            </div>

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
                    <div className="section-title">
                      Itens do orçamento
                    </div>

                    {editando ? (
                      <>
                        {rascunho.itens.map(
                          (
                            item,
                            index
                          ) => {
                            const maoDeObra =
                              ehMaoDeObra(
                                item.descricao
                              );

                            return (
                              <div
                                className="edit-item"

                                key={`${index}-${
                                  maoDeObra
                                    ? 'mao'
                                    : 'item'
                                }`}
                              >
                                <input
                                  className="edit-input"
                                  value={
                                    item.descricao
                                  }
                                  disabled={
                                    maoDeObra
                                  }
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
                                  value={
                                    item.quantidade
                                  }

                                  onChange={e =>
                                    atualizarItem(
                                      index,
                                      'quantidade',
                                      e.target.value
                                    )
                                  }
                                />

                                <div className="money-field">
                                  <span className="money-prefix">
                                    R$
                                  </span>

                                  <input
                                    className="edit-input"
                                    type="text"
                                    inputMode="decimal"
                                    placeholder=""
                                    value={
                                      item.unitario
                                    }

                                    onChange={e =>
                                      atualizarItem(
                                        index,
                                        'unitario',
                                        e.target.value
                                      )
                                    }

                                    onBlur={e =>
                                      atualizarItem(
                                        index,
                                        'unitario',
                                        formatarCampoMoeda(
                                          e.target.value
                                        )
                                      )
                                    }
                                  />
                                </div>

                                <button
                                  className="danger-mini"

                                  title={
                                    maoDeObra
                                      ? 'Mão de obra é obrigatória'
                                      : 'Remover item'
                                  }

                                  disabled={
                                    maoDeObra
                                  }

                                  onClick={() =>
                                    removerItem(
                                      index
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            );
                          }
                        )}

                        <button
                          className="secondary"

                          onClick={
                            adicionarItem
                          }
                        >
                          + Adicionar item
                        </button>

                        <div
                          style={{
                            marginTop:14,
                            display:'grid',
                            gap:8
                          }}
                        >
                          <div
                            style={{
                              display:'flex',

                              justifyContent:
                                'space-between'
                            }}
                          >
                            <span>
                              Subtotal
                            </span>

                            <strong>
                              {moeda(
                                subtotalRascunho
                              )}
                            </strong>
                          </div>

                          <div
                            style={{
                              display:'grid',

                              gridTemplateColumns:
                                '1fr 160px',

                              gap:10,

                              alignItems:
                                'center'
                            }}
                          >
                            <strong>
                              Desconto
                            </strong>

                            <div className="money-field">
                              <span className="money-prefix">
                                R$
                              </span>

                              <input
                                className="edit-input"
                                type="text"
                                inputMode="decimal"

                                value={
                                  rascunho
                                    .desconto
                                }

                                onChange={e =>
                                  setRascunho(
                                    atual =>
                                      atual
                                        ? {
                                            ...atual,

                                            desconto:
                                              e.target.value
                                          }
                                        : atual
                                  )
                                }

                                onBlur={e =>
                                  setRascunho(
                                    atual =>
                                      atual
                                        ? {
                                            ...atual,

                                            desconto:
                                              formatarCampoMoeda(
                                                e.target.value
                                              )
                                          }
                                        : atual
                                  )
                                }
                              />
                            </div>
                          </div>
                        </div>

                        <div className="total-line">
                          <span>
                            Total da proposta
                          </span>

                          <span>
                            {moeda(
                              totalRascunho
                            )}
                          </span>
                        </div>
                      </>

                    ) : (
                      <>
                        {selecionado.itens
                          .length > 0 ? (
                          selecionado
                            .itens
                            .map(
                              (
                                item,
                                index
                              ) => (
                                <div
                                  className="itemline"
                                  key={index}
                                >
                                  <div>
                                    {item.descricao}
                                  </div>

                                  <div>
                                    {item.quantidade}x
                                  </div>

                                  <div
                                    style={{
                                      textAlign:
                                        'right'
                                    }}
                                  >
                                    {moeda(
                                      item.unitario *
                                      item.quantidade
                                    )}
                                  </div>
                                </div>
                              )
                            )

                        ) : (
                          <div className="queue-empty">
                            Nenhum item informado.
                          </div>
                        )}

                        {selecionado.desconto >
                          0 && (
                          <div
                            style={{
                              display:'flex',

                              justifyContent:
                                'space-between',

                              paddingTop:10,

                              fontSize:12
                            }}
                          >
                            <span>
                              Desconto
                            </span>

                            <strong>
                              - {moeda(
                                selecionado
                                  .desconto
                              )}
                            </strong>
                          </div>
                        )}

                        <div className="total-line">
                          <span>
                            Total da proposta
                          </span>

                          <span>
                            {moeda(
                              selecionado.valor
                            )}
                          </span>
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
                          <div className="label">
                            VALIDADE
                          </div>

                          <input
                            className="edit-input"
                            type="date"

                            value={
                              rascunho
                                .validadeIso
                            }

                            onChange={e =>
                              setRascunho(
                                atual =>
                                  atual
                                    ? {
                                        ...atual,

                                        validadeIso:
                                          e.target.value
                                      }
                                    : atual
                              )
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

                            value={
                              rascunho
                                .garantiaDias
                            }

                            onChange={e =>
                              setRascunho(
                                atual =>
                                  atual
                                    ? {
                                        ...atual,

                                        garantiaDias:
                                          Number(
                                            e.target.value
                                          )
                                      }
                                    : atual
                              )
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
                              rascunho
                                .prazoExecucaoDias ??
                              ''
                            }

                            onChange={e =>
                              setRascunho(
                                atual =>
                                  atual
                                    ? {
                                        ...atual,

                                        prazoExecucaoDias:
                                          e.target.value ===
                                            ''
                                            ? null
                                            : Number(
                                                e.target.value
                                              )
                                      }
                                    : atual
                              )
                            }
                          />
                        </div>

                        <div>
                          <div className="label">
                            PAGAMENTO
                          </div>

                          <input
                            className="edit-input"

                            value={
                              rascunho
                                .condicoesPagamento
                            }

                            placeholder="Ex.: 50% entrada + 50% entrega"

                            onChange={e =>
                              setRascunho(
                                atual =>
                                  atual
                                    ? {
                                        ...atual,

                                        condicoesPagamento:
                                          e.target.value
                                      }
                                    : atual
                              )
                            }
                          />
                        </div>

                        <div
                          style={{
                            gridColumn:
                              '1 / -1'
                          }}
                        >
                          <div className="label">
                            CLÁUSULA COMERCIAL
                          </div>

                          <textarea
                            className="edit-input"
                            rows={4}

                            value={
                              rascunho
                                .clausulaComercial
                            }

                            onChange={e =>
                              setRascunho(
                                atual =>
                                  atual
                                    ? {
                                        ...atual,

                                        clausulaComercial:
                                          e.target.value
                                      }
                                    : atual
                              )
                            }
                          />
                        </div>

                        <div
                          style={{
                            gridColumn:
                              '1 / -1'
                          }}
                        >
                          <div className="label">
                            OBSERVAÇÕES
                          </div>

                          <textarea
                            className="edit-input"
                            rows={3}

                            value={
                              rascunho
                                .observacoes
                            }

                            onChange={e =>
                              setRascunho(
                                atual =>
                                  atual
                                    ? {
                                        ...atual,

                                        observacoes:
                                          e.target.value
                                      }
                                    : atual
                              )
                            }
                          />
                        </div>
                      </div>

                    ) : (
                      <div className="info-grid">
                        <div>
                          <div className="label">
                            VALIDADE
                          </div>

                          <div className="info">
                            {selecionado.validade}
                          </div>
                        </div>

                        <div>
                          <div className="label">
                            GARANTIA
                          </div>

                          <div className="info">
                            {selecionado
                              .garantiaDias} dias
                          </div>
                        </div>

                        <div>
                          <div className="label">
                            PRAZO ESTIMADO
                          </div>

                          <div className="info">
                            {selecionado
                              .prazoExecucaoDias ==
                            null
                              ? 'Não informado'
                              : `${selecionado.prazoExecucaoDias} dias`}
                          </div>
                        </div>

                        <div>
                          <div className="label">
                            PAGAMENTO
                          </div>

                          <div className="info">
                            {selecionado
                              .condicoesPagamento ||
                              'Não informado'}
                          </div>
                        </div>

                        <div
                          style={{
                            gridColumn:
                              '1 / -1'
                          }}
                        >
                          <div className="label">
                            CLÁUSULA COMERCIAL
                          </div>

                          <div className="commercial-clause">
                            {selecionado
                              .clausulaComercial ||
                              'Não informada'}
                          </div>
                        </div>

                        {selecionado.observacoes && (
                          <div
                            style={{
                              gridColumn:
                                '1 / -1'
                            }}
                          >
                            <div className="label">
                              OBSERVAÇÕES
                            </div>

                            <div className="info">
                              {selecionado
                                .observacoes}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="actions">
                    {selecionado.status ===
                      'Em elaboração' && (
                      editando ? (
                        <>
                          <button
                            className="secondary approve"

                            disabled={
                              salvando
                            }

                            onClick={() =>
                              void salvarOrcamentoCompleto()
                            }
                          >
                            {salvando
                              ? 'Salvando...'
                              : 'Salvar orçamento'}
                          </button>

                          <button
                            className="secondary"

                            disabled={
                              salvando
                            }

                            onClick={() => {
                              setRascunho(
                                criarRascunho(
                                  selecionado,
                                  clausulaPadrao
                                )
                              );

                              setEditando(
                                false
                              );
                            }}
                          >
                            Cancelar edição
                          </button>
                        </>

                      ) : (
                        <button
                          className="secondary approve"

                          onClick={() =>
                            setEditando(
                              true
                            )
                          }
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

                    {selecionado.status ===
                      'Pronto para enviar' && (
                      <div className="waiting-note">
                        Este orçamento está pronto. Use “Enviar para
                        aprovação” na própria fila lateral.
                      </div>
                    )}

                    {selecionado.status ===
                      'Aguardando aprovação' && (
                      <div className="waiting-note">
                        Aguardando a decisão do cliente. Aprovação e
                        rejeição são recebidas pela integração do Portal
                        do Cliente.
                      </div>
                    )}

                    {selecionado.status ===
                      'Aprovado' && (
                      <div className="approved-note">
                        {osConcluida(
                          selecionado
                            .sourceOrderStatus
                        )
                          ? '✓ Orçamento aprovado e serviço executado/concluído na OS de origem.'
                          : '✓ Orçamento aprovado. A mesma OS de origem está liberada para continuar a execução.'}
                      </div>
                    )}
                  </div>

                  <div className="footnote">
                    Mantezia Orçamentos • Dados armazenados no banco
                    próprio
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>

      {mensagem && (
        <div className="toast">
          {mensagem}
        </div>
      )}
    </div>
  );
}
