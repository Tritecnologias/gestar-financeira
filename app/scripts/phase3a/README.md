# Fase 3A — procedimento limitado à HOMO

Não faz parte da imagem da aplicação. Não usar seed global, npm postinstall ou hooks de deploy.

Pré-condições: backup completo privado e restore conferido, SHA/branch HOMO e fingerprint target verificados por SSH, 13 migrations concluídas, zero tenants/memberships, duas identidades PlatformAdmin existentes. `guardEnvironment` aceita somente a URL exclusiva da HOMO ou laboratório Docker com nomes exatos. O operador deve também comparar PROD/infra antes/depois.

O wrapper privado monta/copia estes scripts em `/app/phase3a`, fornece `permissions.json` derivado de `ALL_PERMISSIONS` do mesmo commit e define `PHASE3A_EXPECTED_SHA`. `node /app/phase3a/run.cjs` faz dry-run. `--apply` é uma operação autorizada específica, nunca automática. O laboratório usa `PHASE3A_LAB=1` e identidades inteiramente sintéticas; nenhum login de Ricardo é realizado pelo programa.

Plano: dois tenants, quatro perfis (ADMINISTRAÇÃO completa e CONSULTA com telas de leitura, sem saldos/ações/administração de acessos), seis novas identidades sintéticas, oito memberships finais. Ricardo principal recebe OWNER/ADMINISTRAÇÃO no MODO DEV e MEMBER/CONSULTA no MODO DEV ISOLAMENTO. Institucional permanece sem membership. Não são criados novos PlatformAdmins na HOMO.

O runtime exige Usuario para autoria e LegacyUserAccessMap para cada membership. Para Ricardo, o procedimento cria explicitamente esses registros com hash aleatório inutilizável, sem ler/copiar/alterar sua credencial de AuthIdentity. Não é backfill de usuários históricos nem mapping de PlatformAdmin.

Para fixtures sintéticas, emite convites técnicos com token apenas em memória, sem SMTP e sem destinatário real (`example.invalid`), e os consome pela API oficial de ativação. Senhas aleatórias independentes ficam somente em memória durante os testes; não são fixas, registradas, retornadas ao operador ou persistidas em arquivo. A identidade sem membership é fixture explícita. Um vínculo sintético termina INACTIVE para testar revogação. Nenhum lançamento financeiro é criado.

Provisionamento inicial é transacional/serializável, com advisory lock, guardas repetidas e AuditEvents SYSTEM. Ativações posteriores são as transações da API. Falha nos testes não apaga auditoria ou dados para fingir sucesso: interromper, inventariar e diagnosticar. Rerun em base já provisionada é bloqueado, sem duplicar ou alterar permissões. Não remover tenants, convites ou auditoria como limpeza silenciosa.

O teste de SupportGrant usa somente PlatformAdmin sintético do laboratório local; não empresta a sessão institucional na HOMO. Exercita aprovação, escopo, leitura, revogação, expiração e prova que não cria membership. A HOMO permanece sem grant permanente de técnico.

Rollback de aplicação: imagem anterior preservada no backup da rodada. Provisionamento não é revertido pelo rollback de imagem. Para revogar acesso, preferir ações administrativas auditadas; restauração de banco exige decisão explícita, backup novo e avaliação das escritas posteriores. Nunca remover ledger, apagar AuditEvents, usar reset ou restaurar sobre o banco ativo automaticamente.

Pendência preservada: optimistic locking bulk/Excel × microssegundos PostgreSQL × milissegundos JavaScript, a resolver somente na fase operacional/Excel.
