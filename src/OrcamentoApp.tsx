import React, { useEffect, useMemo, useState } from 'react';

type StatusOrcamento =
  | 'Aguardando aprovação'
  | 'Em elaboração'
  | 'Aprovado'
  | 'Convertido em OS'
  | 'Rejeitado'
  | 'Expirado'
  | 'Cancelado';

type Orcamento = {
  id: string;
  databaseId: string;
  cliente: string;
  equipamento: string;
  descricao: string;
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
  equipment: string;
  technician_name?: string | null;
  technical_diagnosis?: string | null;
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
  equipamento: '',
  descricao: '',
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
  equipamento: item.equipment,
  descricao:
    item.technical_diagnosis ||
    item.technical_recommendation ||
    'Diagnóstico técnico ainda não informado.',
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

const statusClass = (status: StatusOrcamento) => {
  if (status === 'Aprovado') return 'status aprovado';
  if (status === 'Convertido em OS') return 'status convertido';
  if (status === 'Em elaboração') return 'status elaboracao';

  if (
    status === 'Rejeitado' ||
    status === 'Cancelado' ||
    status === 'Expirado'
  ) {
    return 'status elaboracao';
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

  const enviarParaAprovacao = async () => {
    if (
      !selecionado.databaseId ||
      enviandoAprovacao ||
      selecionado.status !== 'Em elaboração'
    ) return;

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
  const salvarOrcamento = async () => {
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
      const response = await fetch(
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
            paymentTerms:
              rascunho.condicoesPagamento.trim() || null,
            notes:
              rascunho.observacoes.trim() || null,
            discount: Number(rascunho.desconto) || 0,
            items: rascunho.itens.map(item => ({
              description: item.descricao.trim(),
              quantity: Number(item.quantidade),
              unitPrice: Number(item.unitario)
            }))
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

  const total = orcamentos.reduce(
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

  const convertidos = orcamentos.filter(
    item => item.status === 'Convertido em OS'
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
        .layout { display:grid; grid-template-columns:250px 1fr; min-height:calc(100vh - 72px); }
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
        .cards { display:grid; grid-template-columns:repeat(5,1fr); gap:14px; margin-bottom:22px; }
        .card {
          background:white; border:1px solid #e7edf2; border-radius:13px;
          padding:17px; box-shadow:0 3px 12px rgba(31,55,79,.035);
        }
        .card-label { font-size:12px; color:#7a8c9b; font-weight:700; }
        .card-value { margin-top:8px; font-size:25px; font-weight:850; color:#15364f; }
        .card-value.money { font-size:20px; }
        .content-grid { display:grid; grid-template-columns:minmax(480px,1.08fr) minmax(430px,.92fr); gap:18px; }
        .panel { background:white; border:1px solid #e5ebf1; border-radius:14px; overflow:hidden; }
        .panel-head { padding:17px 18px; border-bottom:1px solid #edf1f5; display:flex; justify-content:space-between; align-items:center; }
        .panel-title { font-weight:800; color:#19384f; }
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
        .convertido { background:#e8f6f5; color:#087b73; }
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
        }
        @media (max-width:780px) {
          .layout { grid-template-columns:1fr; }
          .sidebar { display:none; }
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
        <aside className="sidebar">
          <div className="side-label">Comercial</div>
          <div className="navitem active">▣ Visão Geral</div>
          <div className="navitem">▤ Orçamentos</div>
          <div className="navitem">✓ Aprovações</div>
          <div className="navitem">◎ Clientes</div>

          <div className="side-label" style={{marginTop:28}}>Integração</div>
          <div className="navitem">↔ Ordens de Serviço</div>
          <div className="navitem">◈ Indicadores</div>
          <div className="navitem">⚙ Configurações</div>
        </aside>

        <main className="main">
          <div className="heading">
            <div>
              <h1>Portal de Orçamentos</h1>
              <div className="subtitle">
                Propostas comerciais conectadas à operação técnica Mantezia.
              </div>
            </div>
            <button className="primary" onClick={() => demonstrar('Novo orçamento — fluxo em conclusão')}>
              + Novo orçamento
            </button>
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
              <div className="card-label">Aprovados</div>
              <div className="card-value">{aprovados}</div>
            </div>
            <div className="card">
              <div className="card-label">Convertidos em OS</div>
              <div className="card-value">{convertidos}</div>
            </div>
            <div className="card">
              <div className="card-label">Valor em propostas</div>
              <div className="card-value money">{moeda(total)}</div>
            </div>
          </section>

          <div className="content-grid">
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title">Orçamentos recentes</div>
                <input
                  className="search"
                  placeholder="Buscar cliente ou orçamento..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                />
              </div>

              <div className="rows">
                {filtrados.map(item => (
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
                      <span className={statusClass(item.status)}>{item.status}</span>
                    </div>
                    <div className="value">{moeda(item.valor)}</div>
                  </div>
                ))}
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
                  <div className="section-title">Diagnóstico técnico</div>
                  <div className="diagnosis">{selecionado.descricao}</div>
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
                          onClick={salvarOrcamento}
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
                    onClick={() =>
                      demonstrar(
                        'Prévia do PDF preparada'
                      )
                    }
                  >
                    Gerar PDF
                  </button>

                  <button
                    className="secondary"
                    onClick={() =>
                      demonstrar(
                        'Envio por e-mail preparado'
                      )
                    }
                  >
                    Enviar por e-mail
                  </button>

                  <button
                    className="secondary"
                    onClick={() =>
                      demonstrar(
                        'Compartilhamento por WhatsApp preparado'
                      )
                    }
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

                  <button
                    className="secondary"
                    onClick={() =>
                      demonstrar(
                        'Conversão em OS será liberada após aprovação'
                      )
                    }
                  >
                    Converter em OS
                  </button>
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



