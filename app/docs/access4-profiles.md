# ACCESS-4 — perfis de acesso

`AuthIdentity` identifica o login. `TenantMembership` liga uma identidade a um
tenant e guarda o papel estrutural `OWNER`, `ADMIN` ou `MEMBER`. Cada vínculo
possui um perfil principal do mesmo tenant. O perfil contém permissões
configuráveis; papel e perfil têm funções diferentes. A FK composta impede
associar um perfil de outro tenant.

O catálogo em `src/lib/access-catalog.ts` cobre as telas reais da navegação.
Permissões de ação exigem a permissão de visualização da tela. O servidor lê o
membership e o perfil atual em cada verificação e nega permissões ausentes ou
desconhecidas. `OWNER` mantém as permissões administrativas essenciais;
`ADMIN` só pode administrar memberships `MEMBER`. A transação impede remover o
último `OWNER` ativo. O menu oculta telas sem permissão, mas isso não substitui
os guards de rota e API.

O vertical protegido integralmente nesta fase é Fluxo de Caixa: Visão Geral
e Lançamentos, incluindo escrita, lote, importação e exportação. O endpoint de
resumo financeiro nega a resposta antes de calcular ou devolver saldos quando
falta `fluxo.visao.saldos`. A tela de Configurações e a alteração de logo
também usam permissões próprias. As demais telas do catálogo ainda requerem
guards de rota e API antes de serem consideradas protegidas ponta a ponta.
Escopo por Razão Social, Centro de Custo ou registro permanece evolução futura.

A implantação exige as três migrations aditivas `20261005_access_profiles`,
`20261005_access_profiles_member_compat` e
`20261005_access_profiles_config_compat` em ordem. Os perfis legados preservam
o acesso existente. Em DEV, `scripts/access4/seed-dev-profiles.mjs` cria cinco
exemplos configuráveis apenas no tenant Dez Soluções DEV, sem atribuir novos
memberships. `scripts/access4/test-dev.mjs` cria e remove fixtures temporárias
para testar papéis, troca de tenant, isolamento, proteção de OWNER e o vertical
financeiro. Consulte o README da primeira migration para o rollback.

Tenants históricos sem `OWNER` não são promovidos automaticamente. Um
PlatformAdmin deve revisar e designar o responsável legítimo na interface de
plataforma antes de depender da gestão pelo próprio tenant. Nenhum dado privado
de homologação integra os scripts ou migrations.
