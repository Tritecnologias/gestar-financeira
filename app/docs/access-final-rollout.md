# ACCESS-FINAL — homologação local e pacote de rollout

Data: 2026-10-05. Branch: `implantacao/corporate-tech-estrutura-empresa`. Base inicial: `f498052dbe0abb2b4751d3a80dd3ab1e49418772`. Este documento não autoriza deploy. Nenhuma operação foi feita em produção, nem nos 405 lançamentos HOM-REAL.

## Veredito

**NÃO PRONTO para produção.** O código e a sequência de migrations passaram na simulação local, mas faltam inventário/diff e dry-run **no banco real**, decisões humanas sobre identidades repetidas, PlatformAdmins e OWNERs, documentos jurídicos revisados e volume privado persistente de termos. A homologação visual Dark/Clean/mobile das telas ACCESS-5B/5C também segue pendente: inspeção por navegador foi bloqueada pela política da ferramenta nesta sessão. HTML/HTTP e build não substituem essa inspeção. O pacote está pronto para revisão técnica e preparação de janela, não para acioná-la.

### Evidências locais

| Verificação | Resultado | Limite |
| --- | --- | --- |
| `prisma validate` e `migrate status` no DEV | Schema válido; 11 migrations aplicadas | Produção não inspecionada |
| `pnpm build` e `tsc --noEmit` | Passaram | Aviso existente de `middleware` depreciado |
| `node --test tests/access*.test.mjs tests/email.test.mjs tests/tenant-isolation.test.mjs` | 16 passaram, 4 testes legados marcados `SKIP` | Os cenários HTTP novos abaixo cobrem parte relevante, mas não todos os antigos |
| ACCESS-4B guard inventory | 91 handlers mapeados; 10 layouts de página; 131 handlers com guard explícito | Inventário estático; autorização efetiva requer testes HTTP |
| `scripts/access-final/simulate-dev.mjs` | 30 verificações em schema descartável | Inclui baseline legado sintético, 11 migrations sequenciais, backfill idempotente, login HTTP, perfis, tenant e bloqueios |
| `prisma migrate deploy` em schema novo descartável | Passou; ordem registrada bate com dependências | Não prova aderência do schema legado de produção à baseline |
| ACCESS-5A | 61 verificações HTTP/DB em schema descartável | PDF fixture privado removido no fim |
| ACCESS-5B/5C | 90 verificações HTTP/DB em schema descartável | Inclui grants, termos, isolamento, auditoria e falha fechada de mutação crítica |
| HOM-REAL | Contagem somente leitura: 405 lançamentos no tenant de homologação PF | Nenhum deles foi escrito por estes testes |

O `scripts/access-final/dry-run.mjs` foi executado no DEV em `BEGIN READ ONLY` e reportou 2 tenants ativos, 2 usuários legados, 2 identidades, 2 memberships, 1 PlatformAdmin e 2 mapeamentos íntegros; 0 conflitos pendentes. **Ambos os tenants ativos estão sem OWNER.** Isso é NO-GO local para habilitar o novo fluxo contratual sem designação explícita. Esses números não são inferência para produção. O relatório contém apenas contagens, papéis e distribuição de hashes distintos por grupo duplicado; nunca e-mails, nomes ou hashes.

## Commits locais ainda não publicados no início da auditoria

Último HEAD remoto observado: `d9a3f1517427c21a3d0c730a4bfa54349fd489b1`. A árvore estava limpa e os 16 commits abaixo formavam uma sequência contínua, sem squash:

| Fase | Commits, em ordem |
| --- | --- |
| ACCESS-4 | `d479e72187558216c3309f97b284d5d36977ef4c`, `f60035047fd0338c5c2ee55b15485647c31d5900`, `c78e9766ee88815ee3824503f48869f7be3a3b13` |
| ACCESS-4B | `0b5d4ae9cc24bcec226ef2dedf1ae5d705521b66`, `8e9f1b4edbf0dd9d5995820a2067c8d86943c690` |
| ACCESS-4C | `199eb3b64541cd3517c37dfb52d583b435437d67` |
| ACCESS-5A | `6754b6138edcd130dc1b87a1aec5252567023e55`, `86bad2f7dbbf9647e1147789bc6da42fef6baac2`, `a3db074cbb46094df1e3cf2f4147de9b456eeea4` |
| ACCESS-5B | `6faf945f981be09a4da7f25dcbd40e5457ce9b7f`, `785d686d87668dcef668811f66d586ccd3a345af`, `84d4d7097a67d6f0352738f09b6d85a3d2c6a861` |
| ACCESS-5C | `1d665bddbc1d6517f0812603eaa7c43858236c4f`, `e6a65e44c7503e4c89e72a6892d4ad7fa906d61e`, `cb0af5938d610e4940e6f3d66d9e4bc35cc34a8e`, `f498052dbe0abb2b4751d3a80dd3ab1e49418772` |

## Sequência técnica das migrations

| Ordem | Migration | Efeito / dependência |
| --- | --- | --- |
| 0 | `0_legacy_baseline` | DDL do legado. **Em banco existente, comparar schema antes de `migrate resolve --applied`; nunca executar cegamente.** |
| 1 | `20261005_access_identity_membership` | Enums, AuthIdentity, TenantMembership, PlatformAdmin, LegacyUserAccessMap, índices e FKs compostas. Nenhum backfill implícito. |
| 2 | `20261005_access_profiles` | AccessProfile, `profile_id` nullable, perfil de compatibilidade e atualização dos memberships existentes. |
| 3 | `20261005_access_profiles_config_compat` | Acrescenta permissões de configuração aos perfis legados existentes. |
| 4 | `20261005_access_profiles_member_compat` | Perfil de compatibilidade específico de membros e reatribuição controlada. |
| 5 | `20261005_access4b_owner_events` | Registro da designação explícita de OWNER. Não promove ninguém automaticamente. |
| 6 | `20261005_access4b_permissions` | Acrescenta ações de Tarefas e Estrutura Empresa aos perfis legados por compatibilidade. Revisar concessões antes de produção. |
| 7 | `20261005_access5a_versioned_terms` | Responsável contratual, catálogo/versões/aceites, índices, FKs e triggers de imutabilidade. |
| 8 | `20261005_access5a_z_integrity` | Substitui FK simples do aceite por FK composta e reforça trigger de versão. É DROP **da constraint/trigger anterior**, seguido de recriação; não DROP de dados/tabelas. |
| 9 | `20261005_access5b_support_grants` | Grants/eventos e FKs de escopo/tenant. |
| 10 | `20261005_access5c_audit_events` | AuditEvent, índices/FKs e trigger que bloqueia UPDATE/DELETE. Sem retroatividade. |

O teste de migration usa schema PostgreSQL descartável e `search_path` restrito somente a ele, impedindo resolução acidental de tabelas `public`. Aplicou baseline, carregou 6 usuários sintéticos (incluindo duplicidade entre tenants), aplicou as 10 migrations ACCESS e comprovou: 3 candidatos empresariais seguros, 2 em conflito mantidos sem fusão, 1 `admin_global` tratado pela regra específica, segunda execução sem duplicação, nenhum OWNER inferido e legado intacto. Também confirmou que o engine Prisma aplica as 11 migrations na ordem de dependência em schema novo. **A comparação baseline × banco real ainda é obrigatória.**

No DEV histórico, `access_profiles_member_compat` foi registrada antes de `access_profiles_config_compat` por implantação incremental anterior; no deploy limpo do Prisma, a ordem foi `config_compat` antes de `member_compat`. Os dois caminhos passaram, mas essa diferença deve constar da conferência de checksums e contagens no ambiente alvo. Não ordenar migrations manualmente pelo nome do diretório em scripts de rollout.

Migrations ACCESS são majoritariamente aditivas e usam `RESTRICT` nas novas relações. Índices únicos/compostos impõem identidade por e-mail normalizado, vínculo único identidade+tenant e coerência tenant nos mappings, perfis, termos, grants e auditoria. As migrations de compatibilidade atualizam dados; devem ter contagens antes/depois e aprovação explícita. Não foi identificado DROP inesperado de tabela ou coluna de negócio. O histórico de `Usuario` permanece.

## Backfill e identidade

`access2/backfill.mjs` compara a linha atual ao dry-run, usa transação serializável, cria identidade + membership + mapping como unidade e verifica que `Usuario` não mudou. Reexecução encontra `alreadyMapped`; drift vira conflito. E-mails repetidos nunca são unidos automaticamente. `admin_global` não vira membership empresarial. `access3b/migration.mjs` também é serializável e idempotente; só aplica a regra explícita de `admin_global` único, íntegro e sem colisão para criar PlatformAdmin/mapping. A elegibilidade da regra **não substitui a validação humana de quem será PlatformAdmin em produção**. OWNER e responsável contratual exigem designação humana; nenhum script os infere.

O dry-run futuro deve ser executado com credencial de banco **somente SELECT**, após migrations aprovadas, por exemplo: `node --env-file=<arquivo-privado> scripts/access-final/dry-run.mjs --expect-database=<nome-exato>`. O script exige o nome esperado, abre `BEGIN READ ONLY`, fixa `statement_timeout`, usa schema explícito quando informado, imprime somente agregados e encerra a transação. Validar previamente o escopo de conexão. **Não foi executado em produção.** Preservar o JSON agregado em canal privado de revisão; não versionar dumps.

## Matriz de homologação ACCESS

| Área | Evidência / resultado | Lacuna |
| --- | --- | --- |
| Login/sessão | HTTP real da identidade migrada; seleção de tenant permitida e outro tenant negado. ACCESS-5B também testa login válido/negado e eventos. | Logout, reload e revogação de sessão em todas as combinações precisam de roteiro manual final. |
| OWNER/ADMIN | OWNER, último OWNER, gestão de perfil, responsável e aprovações aparecem nos testes 5A/5B; ADMIN não ganha plataforma. | Repetir jornada completa com contas homologadoras e UI antes do GO. |
| Operacional/gerente | Uma identidade com perfis separados HIGH/THE HOME; acesso ao saldo é independente; revogar HIGH preserva THE HOME. | Conferir menus e campos sensíveis visualmente em ambos. |
| CONSULTA/RH | HTTP: CONSULTA lê Lançamentos e recebe 403 na escrita; RH lê Pessoas e recebe 403 em Lançamentos. | Revisão manual de todas as telas do catálogo. |
| PlatformAdmin | Sem membership, API de plataforma 200 e operação empresarial negada. Grant não cria membership. | Designar e conferir legítimos administradores em produção. |
| SupportGrant | Teste 5B cobre solicitação, PENDING, aprovação OWNER, READ_ONLY, OPERATIONAL, escopo, expiração, revogação, encerramento e negativas. | Inspeção visual de solicitação/aprovação/modo suporte/revogação em Dark/Clean/mobile. |
| Termos | Teste 5A cobre versões, PDF privado, SHA-256, aceite próprio, reaceite e histórico; 5B cobre bloqueio associado ao acesso. | PDFs oficiais revisados e volume persistente ainda não preparados. |
| Auditoria | Teste 5C cobre append-only, FK tenant, consultas separadas, before/after, eventos negados, sem senha/hash, e rollback de mutação crítica se auditoria falhar. | AUDIT-2 de ações empresariais é roadmap, não promessa deste pacote. |
| Guarda API/UI | 131 handlers com guard explícito, 10 layouts protegidos, catálogo de permissões reavaliado por sessão. | Inventário estático não equivale a pentest; testar URL/API direta na janela. |
| Desempenho | Os testes HTTP concluíram sem falha óbvia de carregamento. | Sem benchmark quantitativo, carga ou análise de N+1; smoke de produção obrigatório. |

As tentativas de tenantId arbitrário, perfil cross-tenant, membro inativo, grant expirado/revogado, ausência de aceite e PlatformAdmin sem grant estão cobertas pelos testes isolados de fases anteriores e 5B/5C, com o limite de não representar cada estado de produção. A UI Dark/Clean em 1920×1080, 1536×864, 1366×768, 1024×768 e 414×896 **não foi homologada visualmente nesta auditoria** por bloqueio da ferramenta de navegador. É pendência bloqueante de aceitação visual, não evidência de regressão observada.

## Rollout controlado e decisões GO/NO-GO

| Fase | Ação | GO se | NO-GO se |
| --- | --- | --- | --- |
| 0 — preparação | Congelar versão, inventário de banco/schema/migrations, backup integral e snapshot restaurável, checar 405 HOM-REAL somente leitura. | Restore ensaiado e janela/contatos definidos. | Backup ou baseline sem confirmação. |
| 1 — aditivo | Comparar baseline com produção; marcar baseline aplicada apenas se equivalente; aplicar ACCESS na ordem; verificar checksums, FKs, índices e contagens de perfis. | `migrate status` limpo e nenhuma escrita empresarial inesperada. | Drift, migration parcial, lock excessivo ou concessão de compatibilidade não aprovada. |
| 2 — dry-run | Rodar relatório agregado SELECT-only no banco real; guardar saída privadamente. | Contagens reconciliadas com inventário; conflitos classificados. | Duplicidade, hash/nome divergente ou origem ambígua sem decisão. |
| 3 — decisões | Aprovar resolução caso a caso, PlatformAdmins legítimos, OWNER e responsável contratual por tenant; revisar perfis legados. | Registro formal dos responsáveis e escopos. | Promoção inferida por e-mail ou papel antigo. |
| 4 — backfill | Executar em lote controlado, transação/contagens antes e depois, rerun de idempotência. | `safe=0` remanescente ou exceções explicitamente bloqueadas; `Usuario` intacto. | Cross-tenant, mapping incorreto ou alteração de legado. |
| 5 — novo auth | Provisionar PDFs oficiais e `TERM_STORAGE_DIR`; ativar `ACCESS_AUTH_MODE=identity` após smoke de staging e revisão de Wanderson. | Login, tenant, termos e perfis reais conferidos. | Sem OWNER, storage ou aceite confiável. |
| 6 — smoke | Login/logout/relogin, troca, revogação, perfis, campos sensíveis, suporte, auditoria, APIs negativas, Dark/Clean/mobile. | Todas as jornadas críticas aprovadas. | 403 indevido, vazamento, bypass, perda de documento ou regressão visual impeditiva. |
| 7 — observação | Monitorar erros de login, falhas de auditoria, grants ativos, performance e integridade dos PDFs com equipe responsável. | Métricas estáveis e rollback disponível. | Crescimento anormal, falhas de escrita auditada ou indisponibilidade. |

`TERM_STORAGE_DIR` em produção deve ser caminho absoluto em volume **privado e persistente**, fora de `public` e `.next`, com permissão mínima ao processo, backup, teste de restore e integridade SHA-256. Nunca incluir PDFs no bundle ou Git. A aplicação rejeita ausência do diretório configurado em produção e caminhos públicos. Verificar a posse/permissões do volume no host real antes de publicar termos.

## Rollback por estágio

- **Antes de ativar o novo auth:** retornar o código/configuração anterior. Tabelas ACCESS aditivas podem permanecer sem uso; não fazer DROP como reação inicial.
- **Após migrations e antes do backfill:** manter snapshot e registros de migration. Se houver falha, interromper rollout, diagnosticar e restaurar backup em ambiente separado antes de qualquer correção manual. Não desfazer triggers/constraints sem plano aprovado.
- **Após backfill:** preservar `Usuario` e `LegacyUserAccessMap`; usar `ACCESS_AUTH_MODE=legacy` no processo e reiniciar, obrigando novo login. Sessões do modo anterior não são aceitas no outro. Reverter código sem apagar mappings ou evidência jurídica.
- **Após ativar termos/grants/auditoria:** suspender novas concessões e publicações; preservar `TermAcceptance`, PDFs, `SupportGrantEvent` e `AuditEvent`. Falhas críticas de auditoria devem bloquear mutações administrativas. Fazer restore completo somente com decisão sobre perda de evidência e janela de dados.
- **Retorno à identidade:** só após corrigir a causa e repetir dry-run/smoke. Nunca usar `UPDATE tenantId` para mover identidades ou dados empresariais.

## Revisão requerida de Wanderson

1. Confrontar baseline e migrations com schema **real**, plano de lock, ordem e checksums; aprovar atualizações de permissões legadas.
2. Revisar relatório read-only de produção e decisões explícitas de duplicidade, `admin_global`/PlatformAdmin, OWNER e responsável contratual.
3. Revisar isolamento cross-tenant ponta a ponta, matrizes módulo/tela/ação/API/UI/campo sensível e escopo do SupportGrant.
4. Aprovar documentos jurídicos, versionamento/reaceite, volume `TERM_STORAGE_DIR`, backup/restore e retenção de auditoria.
5. Acompanhar smoke de produção e autorizar GO apenas após testes HTTP, negativos e visuais completos. Sem merge/deploy nesta fase.

**Backlog não bloqueante:** AUDIT-2 de mutações empresariais, métricas de performance/carga, acabamento visual fino, substituição futura da convenção `middleware` depreciada. Esses itens não justificam ampliar o escopo ACCESS-FINAL agora.
