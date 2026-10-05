# ACCESS-3C — acesso administrativo no DEV local

O login por `AuthIdentity` é independente de `PlatformAdmin` e de
`TenantMembership`. Uma identidade pode administrar a plataforma e manter
somente os vínculos empresariais explicitamente autorizados. O seletor de tenant
lista os vínculos ativos; a concessão de plataforma não cria acesso empresarial.

Para habilitar o administrador DEV existente, na pasta `app`, defina
`ACCESS3C_ADMIN_EMAIL` na sessão do terminal e execute:

```powershell
node --env-file=.env.local --experimental-strip-types scripts/access3c/grant-dev-platform-admin.mjs
node --env-file=.env.local --experimental-strip-types scripts/access3c/grant-dev-platform-admin.mjs --apply
node --env-file=.env.local --experimental-strip-types scripts/access3c/grant-dev-platform-admin.mjs
```

O comando exige o PostgreSQL DEV local `gestar_vf_dev` na porta `55432`,
identidade ativa, membership administrativo ativo no tenant `Dez Soluções DEV`,
tenant ativo e mapping legado íntegro. A aplicação é idempotente e transacional.
Não cria identidade, usuário, membership nem credencial. O resultado não imprime
email, senha, hash ou token. Não executar em produção.

Depois, testar login com a credencial privada já existente, Administração da
Plataforma e `/api/tenants`. A conta deve ver apenas `Dez Soluções DEV` como
tenant empresarial. Para testar uma sessão antiga, sair e entrar novamente;
uma sessão com identidade válida é revalidada contra os vínculos atuais.
