# ACCESS-4B — matriz de autorização

Classificação: **A** = rota e API protegidas no servidor; **B** = indicação
apenas na interface; **C** = sem guard; **D** = acesso intencionalmente público ou
limitado à sessão. O inventário `scripts/access4b/audit-handlers.mjs` verifica
117 handlers fora do protocolo de autenticação. O mapeamento detalhado de 91
handlers de negócio está em `scripts/access4b/guard-routes.mjs`; dez páginas
cliente são verificadas por `scripts/access4b/guard-pages.mjs`.

| Recurso | Permissão | UI | Rota | API | Estado |
| --- | --- | --- | --- | --- | --- |
| Tarefas | `acao.tarefas.view/create/edit/delete` | Menu filtrado; controles legados ainda visíveis | Layout exige view | Tarefas e status exigem ação | A no servidor |
| Dimensão da Empresa | `estrutura.empresa.view/create/edit/delete/import/export` | Menu filtrado; controles legados ainda visíveis | Layout exige view | Empresa, bancos, áreas, centros e Excel exigem ação | A no servidor |
| Pessoas | `estrutura.pessoas.view/create/edit/delete/import/export` | Menu filtrado; controles legados ainda visíveis | Layout exige view | Pessoas, próximo código e Excel exigem ação | A no servidor |
| Dimensões Financeiras | `estrutura.financeiras.view/create/edit/delete/import/export` | Menu filtrado; controles legados ainda visíveis | Layout exige view | Categorias, contas, DRE legado e Excel exigem ação | A no servidor |
| Dimensões Cadastrais | `estrutura.cadastrais.view/create/edit/delete/import/export` | Menu filtrado; controles legados ainda visíveis | Layout exige view | Clientes, fornecedores e Excel exigem ação | A no servidor |
| Portfólio | `estrutura.portfolio.view/create/edit/delete/import/export` | Menu filtrado; controles legados ainda visíveis | Layout exige view | Grupo, tipo, linha, item e Excel exigem ação | A no servidor |
| Dimensões Comerciais | `estrutura.comerciais.view` | Menu filtrado | Layout exige view | Sem API operacional nesta tela | A |
| Fluxo — Visão Geral | `fluxo.visao.view/saldos` | Menu filtrado | Página exige view | Resumo e dashboard KPI exigem saldos antes do payload | A |
| Fluxo — Lançamentos | `fluxo.lancamentos.view/create/edit/delete/import/export/bulk_edit` | Menu filtrado; parte dos controles ainda visível | Página exige view | Todos os fluxos de gravação, lote, Excel e leitura exigem ação | A no servidor |
| Fluxo — Relatórios | `fluxo.relatorios.view` | Menu filtrado | Layout exige view | Relatório exige view | A |
| Fluxo — Análises | `fluxo.analises.view` | Menu filtrado | Layout exige view | Análises exigem view | A |
| Acessos / Usuários | `acessos.usuarios.view/manage` + OWNER/ADMIN | Botões condicionais | Página exige view | Memberships exigem view/manage; último OWNER protegido | A |
| Perfis de Acesso | `acessos.perfis.view/manage` + OWNER/ADMIN | Árvore editável só com manage | Página exige view | Perfil/catálogo exigem view/manage | A |
| Plataforma | PlatformAdmin ativo | Interface separada | Página exige PlatformAdmin | Tenants, identidades, memberships e OWNER exigem PlatformAdmin | A |
| Configurações | `sistema.configuracoes.view/manage` | Alteração de logo condicional | Página exige view | Logo exige view/manage | A |

Consultas de referência reutilizadas possuem alternativas **somente de
leitura** explícitas: Centros de Custo podem ser lidos pela Dimensão de Pessoas;
Categorias/Contas por Dimensões Cadastrais ou Lançamentos; Clientes e
Fornecedores por Lançamentos. Essas alternativas não concedem criação ou
edição do cadastro de origem. Banco e Dados Empresariais exigem a Dimensão da
Empresa.

**B (UI):** páginas operacionais antigas ainda mostram alguns botões de
escrita a perfis somente de leitura. A API nega a ação antes de validar ou
gravar dados; ocultar/desabilitar todos esses controles é uma melhoria de UX,
sem lacuna de autorização. **C:** nenhum handler empresarial do inventário
ficou sem guard explícito. **D:** `/login`, NextAuth e arquivos estáticos são
públicos; `/api/access/context`, `/api/tenants` e `/api/tenants/switch` são
limitados à própria identidade/membership. Telas marcadas como desabilitadas
na Sidebar são placeholders estáticos sob o layout autenticado, sem leitura ou
escrita empresarial.

O endpoint de saldos da Visão Geral e o KPI legado do dashboard não enviam
valores sem `fluxo.visao.saldos`. Relatórios e Análises contêm valores como
parte do próprio recurso e exigem sua permissão de visualização. Não há
mascaramento apenas por CSS.

O PlatformAdmin vê a contagem de OWNER ativo por tenant e pode designar um
responsável por ação explícita. A operação promove/reactiva um vínculo já
existente ou cria um novo vínculo, em transação, e registra ator, tenant,
destinatário e estado anterior em `access_owner_events`. A interface não
escolhe OWNER por inferência. A API de membership bloqueia rebaixar ou
desativar o último OWNER ativo; não existe API de remoção física de membership.
