# ACCESS-2 — migration aditiva

Esta migration parte de um banco com o schema legado já materializado ou da
`0_legacy_baseline` aplicada em um banco novo. Ela cria
`auth_identities`, `tenant_memberships`, `platform_admins` e
`legacy_user_access_maps`, dois enums e um índice único adicional em `usuarios`.
Não modifica registros existentes. O histórico anterior do projeto foi criado
por `db push` e SQLs manuais. A baseline versionada foi comparada ao DEV, mas
exige comparação própria antes de ser adotada em qualquer outro ambiente.

Antes de aplicar, conferir o banco de destino, backup, ausência das quatro
tabelas e comparação do schema atual com o schema Prisma. No DEV, o diff deve
mostrar apenas as adições acima. Usar `prisma migrate deploy`; não usar
`migrate dev` neste banco existente. A aplicação ainda lê `Usuario`.

## Reversão

O rollback operacional imediato é parar o backfill e ignorar as novas tabelas:
o login, as sessões, as APIs e as referências históricas continuam em
`Usuario`. Para desfazer fisicamente a migration, primeiro exportar e conferir
qualquer dado criado nas quatro tabelas e registrar o estado de
`_prisma_migrations`. Em uma janela controlada, apagar **somente** as quatro
tabelas ACCESS-2 em ordem de dependência (`legacy_user_access_maps`,
`platform_admins`, `tenant_memberships`, `auth_identities`), os dois enums e o
índice `usuarios_id_tenant_id_key`. Ajustar o histórico Prisma na mesma janela
segundo o procedimento aprovado para o ambiente. Não usar `CASCADE` nem
`migrate reset`; não executar esse rollback em produção sem backup e revisão.

O backfill é idempotente e preserva `Usuario`. Para refazê-lo no DEV, remover
somente os registros ACCESS-2 criados por ele depois de verificar seus mappings;
nenhum `Usuario`, lançamento, layout ou dado empresarial deve ser apagado.
