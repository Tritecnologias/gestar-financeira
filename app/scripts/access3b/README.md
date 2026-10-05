# ACCESS-3B — PlatformAdmin no DEV local

Executar na pasta `app`, com o PostgreSQL local em `127.0.0.1:55432` e o banco
`gestar_vf_dev`:

```powershell
node --env-file=.env.local --experimental-strip-types scripts/access3b/dry-run.mjs
node --env-file=.env.local --experimental-strip-types scripts/access3b/backfill.mjs
node --env-file=.env.local --experimental-strip-types scripts/access3b/dry-run.mjs
```

O dry-run apenas conta casos, sem divulgar nomes, emails ou hashes. O backfill
recalcula o plano dentro de uma transação serializável. Para cada `Usuario` com
`papel=admin_global` inequivocamente seguro e ainda sem mapping, cria uma
`AuthIdentity`, um `PlatformAdmin` e um `LegacyUserAccessMap` apontando para o
PlatformAdmin. Não cria `TenantMembership`, não altera `Usuario` e não remove
nenhum dado. A conta ou o tenant de origem inativo resulta em identidade e
concessão de plataforma inativas. Uma segunda execução cria zero registros.

Emails duplicados, colisão com identidade existente, mapping divergente ou
incompleto ficam para revisão manual. O banco exige exatamente um destino por
mapping: `membership_id` ou `platform_admin_id`. A rotina não converte
silenciosamente um mapping empresarial em concessão de plataforma.

`PlatformAdmin ACTIVE` permite a administração da plataforma, sem conceder
acesso aos dados financeiros de tenants. O seletor empresarial continua
mostrando somente memberships ativos. Uma identidade pode ter ambos os papéis:
a concessão de plataforma é independente do papel em cada tenant. Um admin de
tenant não pode criar `admin_global` nem editar/desativar uma identidade que
possua PlatformAdmin por meio das APIs legadas de usuários.

## Rollback

`Usuario.admin_global` e suas credenciais permanecem intactos. O modo
`ACCESS_AUTH_MODE=legacy` usa o login e os guards legados; a concessão
`PlatformAdmin` criada pelo backfill não é consultada nesse modo. A mudança
de modo requer reiniciar o servidor da aplicação. Não apagar mappings,
identidades ou concessões automaticamente: qualquer reversão de dados exige
inventário dos vínculos criados e revisão separada. Nenhuma rotina deste
diretório deve ser executada em produção.

## Testes

```powershell
node --experimental-strip-types --test tests/access3b-analysis.test.mjs
$env:ACCESS3B_TEST_BASE_URL='http://127.0.0.1:3000'
node --env-file=.env.local --experimental-strip-types --test tests/access3b-platform-admin.test.mjs
```

O teste integrado exige DEV local sem `admin_global` preexistente, cria fixtures
temporárias, verifica login e isolamento e as remove ao final.
