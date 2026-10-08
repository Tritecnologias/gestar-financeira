# ACCESS-4 — perfis de acesso

Migration aditiva: `access_profiles` e `tenant_memberships.profile_id`. A FK
composta impede atribuir perfil de outro tenant. Cada vínculo possui no máximo
um perfil principal. Os vínculos existentes recebem um perfil explícito
`ACESSO LEGADO` por tenant para evitar perda de acesso na ativação. A migration
seguinte `20261005_access_profiles_member_compat` separa os MEMBERS legados e
preserva a restrição antiga de exclusão de lançamentos. A migration
`20261005_access_profiles_config_compat` preserva o acesso existente à tela de
Configurações. Aplicar as três antes de ativar o ACCESS-4. Novos vínculos
exigem atribuição de perfil.

Aplicar somente depois de conferir o destino e fazer backup. No DEV local,
usar `prisma migrate deploy`; não usar `db push`. A migration não altera
identidades, credenciais, PlatformAdmin, lançamentos ou dados empresariais.

Rollback operacional: reverter a aplicação para o commit anterior; as tabelas
aditivas podem permanecer sem serem lidas. Para reversão física controlada,
conferir backup e vínculos novos, remover a FK
`tenant_memberships_profile_id_tenant_id_fkey`, a coluna `profile_id` e a tabela
`access_profiles` nessa ordem, sem `CASCADE`. Ajustar `_prisma_migrations`
somente em procedimento de banco aprovado. Não executar reversão física em
produção sem análise dos perfis e memberships criados após a implantação.
