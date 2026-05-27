const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..', 'src', 'app', '(app)');

const pages = [
  ['fluxo-caixa/relatorios',               'Relatórios',             'Fluxo de Caixa'],
  ['fluxo-caixa/dashboards',               'Dashboards',             'Fluxo de Caixa'],
  ['acao/tarefas',                          'Tarefas',                'Ação'],
  ['acao/5w2h',                             '5W2H',                   'Ação'],
  ['acao/calendario',                       'Calendário',             'Ação'],
  ['acao/cronograma',                       'Cronograma',             'Ação'],
  ['estrutura/dimensao-empresa',            'Dimensão da Empresa',    'Estrutura Empresa'],
  ['estrutura/dimensao-pessoas',            'Dimensão de Pessoas',    'Estrutura Empresa'],
  ['estrutura/dimensoes-financeiras',       'Dimensões Financeiras',  'Estrutura Empresa'],
  ['estrutura/dimensoes-cadastrais',        'Dimensões Cadastrais',   'Estrutura Empresa'],
  ['estrutura/dimensao-produtos',           'Dimensão Produtos/Serv', 'Estrutura Empresa'],
  ['estrutura/dimensoes-comerciais',        'Dimensões Comerciais',   'Estrutura Empresa'],
  ['orcamento/vendas-produto',              'Vendas por Produto',     'Orçamento Empresarial'],
  ['orcamento/folha',                       'Folha',                  'Orçamento Empresarial'],
  ['orcamento/opex',                        'Opex',                   'Orçamento Empresarial'],
  ['orcamento/capex',                       'Capex',                  'Orçamento Empresarial'],
  ['relacionamento/fornecedores',           'Contato Fornecedores',   'Relacionamento'],
  ['relacionamento/clientes',               'Contato Clientes',       'Relacionamento'],
  ['compras/estoque',                       'Estoque',                'Compras'],
  ['compras/solicitacao',                   'Solicitação de Compras', 'Compras'],
  ['custos/calculos',                       'Cálculos',               'Custos e Preço de Venda'],
  ['custos/matriz-bcg',                     'Matriz BCG',             'Custos e Preço de Venda'],
  ['pipeline/performance-comercial',        'Performance Comercial',  'Pipeline de Vendas'],
  ['plano-negocios/analise-situacional',    'Análise Situacional',    'Plano de Negócios'],
  ['plano-negocios/analise-swot',           'Análise SWOT',           'Plano de Negócios'],
];

for (const [route, title, group] of pages) {
  const dir = path.join(base, route);
  fs.mkdirSync(dir, { recursive: true });

  const content = `import type { Metadata } from 'next';

export const metadata: Metadata = { title: '${title} – Gestar Financeira' };

export default function Page() {
  return (
    <div>
      <header className="topbar">
        <div>
          <h1 className="page-title">${title}</h1>
          <p className="page-sub">${group}</p>
        </div>
      </header>
      <div style={{ padding: '60px 28px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>${title}</div>
        <div style={{ fontSize: 13 }}>Esta tela está em desenvolvimento. Em breve disponível.</div>
      </div>
    </div>
  );
}
`;

  fs.writeFileSync(path.join(dir, 'page.tsx'), content, 'utf8');
  console.log('✓ ' + route);
}

console.log('\nTodas as páginas criadas com sucesso!');
