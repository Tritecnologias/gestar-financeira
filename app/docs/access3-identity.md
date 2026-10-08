# ACCESS-3 — login e contexto por membership

## Modo de autenticação

O modo padrão usa `AuthIdentity` para a credencial e revalida `TenantMembership` e `Tenant` no banco. `ACCESS_AUTH_MODE=identity` é equivalente ao padrão. O rollback é **explícito**: definir `ACCESS_AUTH_MODE=legacy` no ambiente do processo e reiniciar a aplicação. Não há tentativa automática do login legado quando a identidade falta, está inativa ou a senha falha. Ao trocar o modo, sessões emitidas no outro modo são rejeitadas; é preciso entrar novamente. Não remover as tabelas ACCESS-2 nem os registros `Usuario`/`LegacyUserAccessMap` durante o rollback.

## Contexto da sessão

O JWT identifica a `AuthIdentity`, o modo de autenticação e um nonce da autenticação. O tenant selecionado fica em cookie HttpOnly, associado à identidade e ao nonce. Esse valor nunca concede acesso sozinho: cada operação empresarial reconsulta identidade ativa, membership ativo, tenant ativo e mapping explícito para `Usuario`. O papel efetivo vem do membership da requisição, e não do JWT ou de um payload do navegador. A API `GET /api/access/context` retorna somente o contexto efetivo revalidado.

- Zero memberships ativos: login válido, acesso empresarial bloqueado.
- Um membership ativo: contexto resolvido automaticamente, desde que não haja contexto da mesma sessão revogado.
- Vários memberships ativos: escolha obrigatória em `/selecionar-tenant`; o seletor do rodapé lista apenas memberships ativos da identidade.
- Ao trocar tenant: identidade e senha permanecem as mesmas; papel e acesso são reavaliados no banco.
- Um mapping legado ausente ou inativo bloqueia o contexto operacional. Nunca se procura `Usuario` por email como substituto.

O fluxo deixa a etapa entre autenticação e seleção de tenant disponível para futura `TermAcceptance`, sem implementá-la nesta fase.

## Administração e limites de transição

`PlatformAdmin` é separado de `TenantMembership`. Sem membership, pode usar `/plataforma` e as APIs de administração, mas não recebe contexto empresarial. A criação de `Usuario` pela administração existente grava `AuthIdentity`, `TenantMembership` e `LegacyUserAccessMap` na mesma transação. Mudanças de papel/status sincronizam o membership. Nome, email e senha de identidade com mais de um membership são bloqueados no formulário legado, pois afetam todos os tenants. A vinculação de uma identidade existente a outro tenant requer fluxo administrativo próprio em fase posterior.

O acesso operacional antigo de `admin_global` a qualquer tenant existe somente no **modo legado explícito** via `tenant_override`. Não há `SupportGrant` nesta fase. Antes de usar o modo de identidade em outro ambiente, é necessário migrar/provisionar os administradores da plataforma de forma controlada; ACCESS-2 não converteu `admin_global` automaticamente. A tela administrativa antiga não concede `PlatformAdmin` a partir de um papel empresarial.

## Validação local

Em DEV, executar testes ACCESS-1A, ACCESS-2 e ACCESS-3, inclusive o teste HTTP com duas instâncias em portas separadas (`ACCESS_AUTH_MODE=identity` e `ACCESS_AUTH_MODE=legacy`). A fixture Renan deve ser removida ao final. A mudança de modo é configuração de processo; não altera schema, migrations ou dados existentes.
