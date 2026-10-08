# 10S — runbook operacional de produção

**Estado:** preparação para revisão técnica; **não autoriza GO, merge ou deploy**. Referência de código: branch `implantacao/corporate-tech-estrutura-empresa`, HEAD `b5df03e23d3ff7179817836d4b059d0bcab3c63c`, PR #2. Os comandos abaixo são modelos para uma janela futura aprovada; nenhum foi executado em produção nesta preparação. O banco real é desconhecido e pode divergir do DEV.

## 1. Objetivo, arquitetura e responsáveis

Migrar com controle do `Usuario`/login legado para `AuthIdentity` (identidade global de login), `TenantMembership` (acesso empresarial por tenant), `PlatformAdmin` (plataforma sem acesso empresarial implícito), `AccessProfile` (permissões por tenant), termos versionados, `SupportGrant` temporário e `AuditEvent` imutável. `Usuario` e dados de negócio permanecem preservados. Tenant é a fronteira absoluta de dados; Razão Social é estrutura interna do tenant.

| Responsável | Deve aprovar ou executar |
| --- | --- |
| Responsável de produto/negócio 10S | Tenants ativos, responsáveis contratuais, OWNERs, perfis iniciais, janela e aceite funcional. |
| Wanderson/revisor técnico | Diferenças de schema, permissões legadas, conflitos de identidade, plano de migrations/backfill e GO técnico. |
| DBA/operador de infraestrutura | Backup, restore ensaiado, inventário do banco real, locks, execução de migrations e observação. |
| Jurídico/administrador autorizado | PDFs definitivos CONTRATANTE/USUÁRIO, versões, reaceite e publicação. |
| Operador de aplicação | Versão imutável, `ACCESS_AUTH_MODE`, reinício, smoke e rollback de código/configuração. |

Registrar nominalmente responsáveis, substitutos, horários, versão/commit, banco/host/schema esperados, janela de indisponibilidade, canal de incidente e links privados das evidências **fora do Git**. Separar credenciais de leitura e escrita. Não registrar senha, token, hash, CPF/CNPJ, planilha real ou dados HOM-REAL neste documento ou nos logs da janela.

## 2. Pré-requisitos e inventário do alvo

1. Congelar o artefato da aplicação e o commit aprovado. Confirmar PR/revisão, variáveis esperadas, infraestrutura, lista de usuários de smoke e janela de manutenção; pausar escritas concorrentes antes de mudanças de schema/backfill. Manter `ACCESS_AUTH_MODE=legacy` durante as etapas aditivas. O código usa modo legado **somente** quando essa variável é exatamente `legacy`; qualquer outro valor cai no fluxo novo.
2. Com credencial de catálogo **somente leitura**, registrar versão PostgreSQL, banco/schema, extensão, tabelas, colunas, tipos, defaults, nullability, constraints, FKs, índices, triggers, sequências e `_prisma_migrations` (nome, checksum, início/fim, rollback, logs de erro). Conferir locks/transações longas e volume de `usuarios`, `tenants` e tabelas de negócio. Guardar inventário/snapshot estrutural em repositório privado operacional, não no Git.
3. Comparar o catálogo real com `app/prisma/migrations/0_legacy_baseline/migration.sql` **objeto a objeto**, inclusive os quatro SQLs históricos abaixo. O baseline foi validado contra o DEV com “No difference detected”; isso **não** prova equivalência em produção. Revisar também os dados que impediriam uniques/FKs/checks e o histórico de migrations já aplicadas. Se houver diferença, parar e produzir reconciliação revisada; não marcar baseline, aplicar `db push` ou rodar todos os SQLs cegamente.
4. Confirmar que a credencial de produção não está embutida em comando, arquivo versionado ou saída. Usar gerenciador de segredos da operação. Conferir ambiente/host/banco/schema antes de qualquer comando de escrita. O operador e um segundo revisor devem atestar o alvo.

### Baseline e mudanças históricas

O baseline já inclui o estado estrutural de Estrutura Empresa, Pessoas, Dimensões Financeiras/Cadastrais, Portfólio, Fluxo de Caixa e Lançamentos observado no DEV. **Não há migrations Prisma individuais para cada uma dessas fases**; parte foi materializada historicamente com `db push` e SQL manual. O baseline cria tabelas de negócio, índices e FKs: é apropriado para um banco **vazio**, não para executar sobre produção existente. Se o catálogo real for equivalente e ainda não houver registro do baseline, registrar apenas a marcação de histórico, com aprovação do DBA:

```sh
# Executar na pasta app, com prisma.config.ts apontando para o alvo revisado.
# Somente após laudo de equivalência e backup validado:
node node_modules/prisma/build/index.js migrate resolve --applied 0_legacy_baseline
node node_modules/prisma/build/index.js migrate status
```

Não usar `migrate resolve --applied` para esconder drift. Se o banco já registra o baseline, conferir checksum e estado em vez de marcá-lo de novo. Se existirem migrations ACCESS parcialmente aplicadas ou ordem/checksums diferentes, parar para avaliação específica do DBA; não editar `_prisma_migrations` à mão. Após todos os passos, comparar o schema resultante com `app/prisma/schema.prisma` usando um diff revisado e catálogo; o schema **atual** inclui ACCESS e não serve como alvo de comparação para o baseline legado pré-ACCESS.

| SQL histórico | Propósito/risco | Conduta no banco real |
| --- | --- | --- |
| `manual_seq_por_tenant.sql` | Remove default de `lancamentos.seq` e faz `DROP SEQUENCE IF EXISTS lancamentos_seq_seq`; preserva linhas, mas elimina objeto. | Conferir geração por tenant, dependências e existência da sequência. Aplicar só em plano de reconciliação aprovado, com backup/restore. |
| `manual_prod22_product_groups.sql` | Tabelas/colunas/índices/FKs de Grupo; relaxa `NOT NULL` legado. | Conferir objetos e dados de Produto/Tipo. Não reaplicar se já incorporado. |
| `manual_port1_product_sequences.sql` | Tabela/unique de sequência de produtos por tenant. | Conferir existência, estrutura e sequência antes de decidir. |
| `manual_add_titulo_tabela_status.sql` | Coluna de configuração em `tenants`. | Conferir coluna/default antes de decidir. |

Esses SQLs não formam uma migration automática única e não cobrem todo o histórico. Diferença estrutural entre produção e baseline é **NO-GO até reconciliação versionada/revisada**. A baseline incorpora essas formas de DDL no DEV; nunca executar baseline **e** SQLs manuais como duplicata.

## 3. Inventário completo das migrations versionadas

Ordem abaixo: a sequência que o ensaio de schema novo comprovou para `prisma migrate deploy`. “Rollback” indica resposta operacional preferida; restore físico só após avaliação de janela e preservação de evidências. Nenhuma migration ACCESS elimina tabela ou coluna de negócio; uma substitui constraint/trigger, e as de compatibilidade escrevem dados.

| Ordem / migration | Propósito e dependência | Aditiva / DROP / backfill | Risco e rollback operacional |
| --- | --- | --- | --- |
| 0 `0_legacy_baseline` | Estado legado completo, incluindo Empresa, lançamentos e estrutura atual. | **Não aditiva em banco existente**; DDL de criação; sem backfill. | Alto. Só `resolve --applied` após equivalência; divergência = parar. Restore de backup se DDL indevido for executado. |
| 1 `20261005_access_identity_membership` | Enums e tabelas identity, membership, PlatformAdmin, mapping; uniques, checks e FKs, inclusive tenant. Depende de `tenants` e `usuarios`. | Aditiva; sem DROP; backfill externo ACCESS-2/3B. | Médio: locks/constraints e identidade duplicada no backfill. Manter auth legado; preservar tabelas, corrigir causa ou restaurar snapshot. |
| 2 `20261005_access_profiles` | Perfis, `profile_id` nullable e perfil `ACESSO LEGADO`; atualiza memberships. Depende da 1. | Aditiva com `INSERT`/`UPDATE`; sem DROP; seed/backfill interno. | Médio: permissões concedidas. Comparar contagens/perfis; voltar ao auth legado; dados não são apagados automaticamente. |
| 3 `20261005_access_profiles_config_compat` | Permissões de Configurações aos perfis legados. Depende da 2. | `UPDATE`; sem DROP; sem backfill separado. | Médio: revisão explícita das concessões. Parar se matriz divergir; não editar arrays às cegas. |
| 4 `20261005_access_profiles_member_compat` | Perfil `ACESSO LEGADO MEMBRO`, reatribui membros. Depende da 2/3. | `INSERT`/`UPDATE`; sem DROP; seed interno. | Médio: observar acesso de membro e contagens. O DEV histórico aplicou 4 antes de 3; o deploy limpo aplica 3 antes de 4. Conferir histórico/checksums reais. |
| 5 `20261005_access4b_owner_events` | Eventos de designação OWNER; depende de memberships. | Aditiva; sem DROP; **não** designa OWNER. | Baixo para DDL, alto para decisão humana. Sem OWNER apto = NO-GO da ativação. |
| 6 `20261005_access4b_permissions` | Acrescenta criar/editar/desativar/importar/exportar de Tarefas e 5 telas de Estrutura Empresa aos perfis legados. | `UPDATE`; sem DROP; seed interno. | Alto em autorização: concedido no DEV para compatibilidade, **aprovação humana de produção ainda exigida**. Se inesperado, manter legacy e suspender ativação. |
| 7 `20261005_access5a_versioned_terms` | Responsável contratual, documentos, versões e aceites, FKs/índices/triggers. Depende de identities/memberships. | Aditiva; sem DROP; sem PDFs ou responsáveis semeados. | Médio: exige storage privado e documentos oficiais. Não publicar termos sem jurídico/restore do volume. |
| 8 `20261005_access5a_z_integrity` | FK composta do aceite e reforço de trigger de versão. Depende da 7. | Faz `DROP CONSTRAINT` e `DROP TRIGGER` **substituídos imediatamente**, sem DROP de dados; sem backfill. | Médio: validar FK e imutabilidade. Falha parcial = parar/revisar migration e restore; não remover trigger manualmente. |
| 9 `20261005_access5b_support_grants` | Grants, eventos, escopo temporal e FKs tenant. Depende de OWNER/membership e PlatformAdmin. | Aditiva; sem DROP; sem backfill. | Médio: não habilitar suporte sem OWNER e trilha. Suspender concessões, preservar eventos. |
| 10 `20261005_access5c_audit_events` | `AuditEvent`, índices/FKs e trigger de bloqueio UPDATE/DELETE. Depende de identidade/tenant. | Aditiva; sem DROP; sem backfill histórico. | Alto para operação auditada: falha de auditoria pode bloquear mutação. Preservar eventos, alternar auth/serviço conforme incidente. |

Inspecionar cada `migration.sql` na revisão e registrar checksum, duração e lock esperado. O `migrate deploy` aplica **todas as pendentes**; não oferece pausa interativa entre cada diretório. Para exigir checkpoints entre grupos, preparar previamente artefatos/revisões de migration ou plano SQL controlado homologado em clone, com registro de `_prisma_migrations` coerente. Não improvisar execução manual no dia. A sequência acima foi simulada em schema descartável; não equivale a aprovação do DDL no banco real.

## 4. Fase 0 — backup e restauração

1. Antes de qualquer `resolve`, migration, backfill ou publicação de termo, tirar **backup completo consistente** do PostgreSQL (dados, schema, roles/configuração pertinentes e `_prisma_migrations`) pelo mecanismo homologado do host; preservar WAL/PITR quando disponível. Tirar também cópia do volume privado de PDFs de termos e manifesto SHA-256. Não gravar dump/PDF no Git.
2. Registrar UTC de início/fim, versão do banco, host, banco, tamanho, hash/manifesto, localização cifrada, retenção, responsável e ponto de recuperação. Testar leitura do backup e **restore em instância isolada**; comparar contagens agregadas e objetos essenciais. Um arquivo existente sem restore verificado **não** é backup válido para GO.
3. Manter janela de retenção que cubra rollout e observação. Definir RPO/RTO aceitos pelo negócio e procedimento de congelar escritas antes de restauração. Restore de produção pode perder transações feitas após snapshot; exigir decisão de incidente e preservação separada de eventos jurídicos/auditoria posteriores.

Modelo de execução pelo DBA, ajustado ao ambiente e sem senha na linha de comando: `pg_dump` em formato custom, `pg_restore --list` e `pg_restore` em banco **isolado**, ou snapshot/PITR gerenciado com teste equivalente. Não executar `pg_restore --clean` no banco ativo como rollback reflexo. Confirmar espaço, I/O e permissões antes da janela.

## 5. Fase 1 — inventário somente leitura e decisões GO/NO-GO

**Pré-migration:** o `app/scripts/access-final/dry-run.mjs` exige tabelas ACCESS e não funciona no legado puro. Usar inventário legado aprovado pelo DBA (SELECT-only no catálogo, `tenants`, `usuarios` e agregados de integridade), sob transação `READ ONLY`, com `statement_timeout` e nome de banco conferido. Levantar total/ativos/inativos de tenants/usuários; distribuição por papel e `admin_global`; colisões de e-mail após `lower(trim(email))` globais e por tenant; divergência de grafia/nome/hashes **somente em contagens**; FKs inválidas, nullability, dados que impedem constraints e histórico de migrations. Não imprimir linhas pessoais nem hashes. Se não houver consulta revisada para o schema real, **NO-GO**.

**Após migrations aditivas, antes de backfill:** rodar o script ACCESS-FINAL com credencial `SELECT` e alvo exato. Ele valida nome do banco, inicia `BEGIN READ ONLY`, usa `statement_timeout=30s`, confirma transação read-only e devolve apenas agregados de candidatos/conflitos, owners, mappings, identities e PlatformAdmins. Conexão também deve ser limitada no banco, não apenas no script.

```sh
# Na pasta app; arquivo privado fora do Git, com DATABASE_URL SELECT-only.
node --env-file=<env-privado> scripts/access-final/dry-run.mjs --expect-database=<nome-exato>
```

Guardar a saída agregada em canal privado, conferir contra inventário pré-migration e repetir após cada backfill. O script **não compara DDL legado com baseline** e não substitui decisão humana. Em DEV histórico, o relatório indicou tenants sem OWNER; números DEV não se transferem para produção.

| GO somente se | NO-GO imediato se |
| --- | --- |
| Backup e restore verificados; alvo/versão congelados; baseline equivalente ou reconciliação revisada; migrations/checksums sem drift; locks/janela aceitos. | Backup ausente/inválido, drift estrutural, migration parcial/alterada, FK/dado incompatível ou lock fora da janela. |
| Todos os conflitos de identidade classificados e decididos; PlatformAdmins e OWNERs legítimos nominados; responsible contratual e perfis aprovados. | Duplicidade ambígua, e-mail compartilhado sem decisão, promoção inferida, tenant ativo sem OWNER requerido ou concessão legada não aprovada. |
| PDFs jurídicos definitivos/versões/reaceite aprovados, storage privado persistente e restore testado; smoke e rollback prontos. | PDF/storage ausente, permissões erradas, evidência de auditoria indisponível, teste negativo falho ou isolamento tenant duvidoso. |

### Decisões que nenhum script pode inferir

Registrar, para **cada tenant**, status ativo, OWNER(s) com membership válido, responsável contratual, perfil inicial de cada membro e eventual usuário a inativar. Registrar PlatformAdmin(s) legítimos fora dos tenants, método de autenticação e contato de emergência. Resolver explicitamente colisões de e-mail, conta compartilhada, identidades com credenciais divergentes e vínculo antigo ambíguo. Aprovar matriz exata das permissões `ACESSO LEGADO` e `ACESSO LEGADO MEMBRO`. Nenhum papel `admin_global` antigo vira automaticamente autorização humana suficiente; nenhuma identidade recebe tenant por semelhança de nome/e-mail.

## 6. Fase 2 — migrations no alvo aprovado

Executar somente após backup e laudo de baseline. O operador usa credencial DDL aprovada em ambiente/host/schema conferidos. Registrar horário de cada passo e consultar logs/locks. Sem DDL paralelo ou `db push`.

```sh
# Na pasta app, DATABASE_URL do alvo aprovado injetada pelo gerenciador de segredos.
node node_modules/prisma/build/index.js migrate status
# Se e somente se o banco legado existente corresponder ao baseline e ele ainda não estiver registrado:
node node_modules/prisma/build/index.js migrate resolve --applied 0_legacy_baseline
node node_modules/prisma/build/index.js migrate status
# Aplicar o plano de migrations ACCESS já aprovado e ensaiado para ESTE banco.
node node_modules/prisma/build/index.js migrate deploy
node node_modules/prisma/build/index.js migrate status
```

Resultado esperado: baseline marcado sem executar seu DDL no banco existente; 10 migrations ACCESS concluídas exatamente na ordem da seção 3, sem pendência/falha; índices/FKs/triggers presentes; contagens de `usuarios`/tenants/lançamentos inalteradas pela parte estrutural. As migrations 2/3/4/6 alteram perfis/memberships, portanto comparar permissões e contagens antes/depois. O DBA valida catálogo, checksums, uniques/FKs/trigger e ausência de erro antes do checkpoint seguinte. Se o banco já tiver parte do histórico, **não** rodar o bloco como receita: revisar quais estão aplicadas e seus checksums. Uma falha interrompe a fase; não usar `migrate resolve` para fingir sucesso.

## 7. Fase 3 — backfill e readiness

O `app/scripts/access2/backfill.mjs` e `app/scripts/access3b/backfill.mjs` são **DEV local only**: exigem host `127.0.0.1:55432` e banco `gestar_vf_dev`. **Não podem ser apontados para produção, nem contornados mudando URL/guard.** Antes do GO, construir/revisar/homologar um procedimento operacional específico de produção que replique os invariantes abaixo, em clone do banco real, com lote, checkpoints, idempotência, limite de duração, logs agregados e rollback ensaiado. A falta desse executor aprovado é um **bloqueador atual**.

| Etapa | Pré-condição e execução requerida | Checagem/reexecução/rollback |
| --- | --- | --- |
| ACCESS-2 empresarial | Dry-run agregado sem conflito não decidido; para cada `Usuario` seguro criar `AuthIdentity` + `TenantMembership` + `LegacyUserAccessMap` na **mesma transação serializável**, sem alterar `Usuario`; nunca fundir e-mails automaticamente. | Reexecutar deve criar zero novos vínculos; mapping divergente vira conflito. Comparar `Usuario` e totais por tenant antes/depois. Em falha, manter auth legado; não apagar mappings sem inventário. |
| ACCESS-3B plataforma | Plataforma aprovada nominalmente; `admin_global` seguro só com decisão humana, fora do membership empresarial. | Criar `PlatformAdmin` + mapping em transação idempotente; colisões ficam para revisão. Reexecução zero; legacy continua disponível. |
| Perfis | Migrations semeiam perfis legados e `profile_id` nullable. Revisar matriz; provisionar perfis adicionais aprovados pelo OWNER. | Conferir vínculo perfil/tenant, grants efetivos e 403 negativos. Não conceder permissão para fazer smoke passar. |
| OWNER | Definição explícita por tenant ativo; evento de designação auditável. | Confirmar pelo menos um OWNER legítimo e proteção do último OWNER. Não promover pelo cargo histórico. |
| Responsável contratual | Pessoa e tenant aprovados; cadastrar pelo fluxo oficial. | Conferir escopo do tenant e trilha; nenhuma inferência automática. |

Após cada lote: executar dry-run read-only, reconciliar `safe`, `conflict`, `alreadyMapped`, identities, memberships, mappings e PlatformAdmins com plano aprovado; parar na primeira divergência. Casos em conflito ficam sem migração automática até resolução assinada. Preservar instantâneo de contagens e IDs técnicos em cofre privado. Não alterar `tenantId` para “mover” dados, nem usar HOM-REAL como fixture de escrita.

## 8. Fase 4 — termos, ativação de auth, suporte e auditoria

**Termos.** Jurídico entrega PDF CONTRATANTE e PDF USUÁRIO definitivos, versão, público, `requiresReaccept`, data e responsável pela publicação. `TERM_STORAGE_DIR` deve ser caminho absoluto em volume privado e persistente, fora de `public`/`.next`, legível/escrevível apenas pelo processo autorizado, com backup e restore próprio, integridade SHA-256 e sem inclusão no bundle. Em produção a aplicação rejeita variável ausente. Publicar/ativar versões pelo fluxo autorizado e testar aceite, reaceite e download. Sem PDFs jurídicos, o código não oferece um switch documentado para desligar seletivamente o enforcement; **GO do ACCESS completo é bloqueado**. Um rollout técnico restrito sem usuários só poderia existir mediante decisão separada de negócio/jurídico e plano formal; não presumir.

**Ativação.** Só depois de migrations, backfill reconciliado, OWNER/PlatformAdmin/responsável aprovados, termos/storage e smoke de staging: configurar explicitamente `ACCESS_AUTH_MODE=identity` no deployment aprovado, reiniciar a aplicação e invalidar/retestar sessões antigas. Fazer canário com contas de teste autorizadas antes de abrir tráfego geral. Não trocar a variável antecipadamente e não deixar valor vazio por acidente (vazio = modo novo).

**SupportGrant.** PlatformAdmin solicita; OWNER do tenant aprova escopo e duração; acesso começa apenas após aprovação e continua separado de membership. Testar pendente, ativo, limitado por módulo/ação/tenant, expiração, revogação e encerramento. Conferir eventos e auditoria; jamais criar bypass operacional ou grant automático. Revisar limites efetivos no código e na UI da versão congelada.

**Auditoria.** Confirmar tabela, índices, FKs tenant e trigger `AuditEvent` append-only. Em ambiente de homologação isolado, provar que UPDATE/DELETE são bloqueados; em produção, **não** executar tentativa destrutiva em registro real. No smoke real, observar criação/consulta de eventos de login, seleção de tenant, administração, termos e suporte por ações autorizadas e contas de teste. Falha em gravar evento crítico deve bloquear a mutação correspondente; não desligar trigger para “destravar”. A trilha não faz backfill de ações anteriores nem substitui AUDIT-2 futuro.

## 9. Smoke pós-deploy e liberação de tráfego

Executar com contas homologadoras e dados fictícios no tenant destinado ao teste; operações de escrita só se aprovadas na janela, com limpeza controlada. Registrar resultado HTTP/UI, horário e auditoria sem credenciais ou conteúdo privado.

| Papel / área | Positivos mínimos | Negativos mínimos |
| --- | --- | --- |
| PlatformAdmin | Login, Plataforma: tenants, identidades, memberships, termos, suporte e auditoria. | Sem membership/grant não acessa dados empresariais. |
| OWNER | Login no tenant certo, usuários/perfis, responsável contratual, aprovar/revogar suporte, auditoria do tenant. | Não alcança outro tenant nem plataforma; último OWNER protegido. |
| ADMIN | Menu e CRUD conforme perfil, tenant correto. | Sem ações OWNER/PlatformAdmin não concedidas. |
| Usuário comum | Login, aceite do termo/reaceite quando exigido, menu/ação conforme perfil. | Escrita sem permissão = 403; termo pendente bloqueia. |
| Multi-tenant | Uma identity com dois memberships, troca de tenant, papel/perfil recalculados; logout/relogin. | Tenant sem membership, tenant inativo ou revogado = 403; nenhuma leitura cross-tenant. |
| Suporte | Solicitação, aprovação OWNER, escopo, evento, expiração e revogação. | Grant pendente, expirado, revogado, fora de escopo ou outro tenant = 403. |

**Negócio, leitura mínima:** abrir Estrutura Empresa, Pessoas, Dimensões Financeiras, Cadastrais, Portfólio, Fluxo de Caixa, Lançamentos, Relatórios e Análises; conferir contagens/totais de referência **apenas** se o responsável autorizou a comparação agregada. Verificar assets, 5xx, Prisma, tenant context, Dark/Clean, desktop e mobile nas jornadas críticas. Não alterar lançamentos privados de homologação. Smoke é reprovado por vazamento cross-tenant, 403 inesperado em jornada essencial, bypass de termo, mutação sem auditoria, PDF inacessível ou regressão operacional impeditiva.

## 10. Rollback por estágio

| Estágio/problema | Ação operacional preferida | Limite/condição |
| --- | --- | --- |
| Antes de DDL/backfill: falha de inventário/backup | NO-GO; manter código e auth legado. | Nenhuma mudança no banco. |
| Durante migrations: drift, lock, falha parcial | Congelar escrita/rollout; manter `legacy`; diagnosticar `_prisma_migrations`, catálogo e logs. Restore em clone para decidir correção ou PITR. | Não usar `resolve` nem DROP de constraints/triggers às cegas. Migrations já concluídas podem permanecer se legacy funciona. |
| Após migrations, antes do backfill: problema na aplicação | Voltar artefato/configuração para versão aprovada com `ACCESS_AUTH_MODE=legacy`, reiniciar e smoke legado. | Preservar tabelas novas; restaurar banco só se incompatibilidade real exigir. |
| Após backfill, antes do auth novo: conflito | Parar lotes, manter legacy, investigar mappings; reexecutar só após decisão. | `Usuario` permanece intacto; não apagar identities/mappings automaticamente. |
| Após auth novo: login/403/tenant crítico | Fechar tráfego, configurar `ACCESS_AUTH_MODE=legacy`, reiniciar instâncias, exigir novo login, verificar smoke legado e manter evidências. | Confirmar que versão implantada ainda suporta legacy e que `Usuario`/credenciais estão íntegros. Ensaiar esse caminho em staging antes do GO. |
| Após termos/grants/auditoria: falha jurídica/de segurança | Suspender novas publicações/grants, revogar suporte se necessário; preservar PDF, `TermAcceptance`, `SupportGrantEvent`, `AuditEvent`; considerar rollback de auth. | Restore físico exige decisão sobre evidência posterior ao snapshot e possível perda de escritas. Nunca apagar trilha para corrigir erro. |

**Teste de rollback requerido antes de produção:** em clone/staging, com auth novo já funcional, alternar para `legacy`, reiniciar, provar login/tenant/negativos, voltar a `identity`, reiniciar e repetir; registrar tempos. O ensaio local desta preparação cobriu migrations/backfill/auth novo, mas **não** esse ciclo HTTP de retorno ao legacy, logo ele permanece pendente e é critério de NO-GO. Não fazer DROP das tabelas ACCESS como primeiro rollback.

## 11. Janela, observação e critérios de decisão

Estimar após medir clone com volume semelhante ao real. Faixas iniciais **de planejamento, não SLA**: backup + restore de verificação 30–120 min (dominado por volume/I/O); inventário/diff e decisão 30–90 min; dry-run agregado 5–20 min; migrations 10–45 min **após** reconciliação; backfill 15–60 min conforme usuários/conflitos; termos/storage 15–45 min após PDFs aprovados; auth/canário/smoke 30–90 min; rollback operacional de auth 10–30 min mais reautenticação/smoke. Reservar janela com margem de pelo menos o dobro do tempo medido em clone e tempo para restauração total se preciso. No DEV sintético, o ensaio de 11 migrations + 30 checks terminou em segundos/dezenas de segundos; isso **não mede** backup nem dados/locks de produção.

Manter observação ativa por pelo menos 2 horas após liberar tráfego e acompanhamento reforçado por 24 horas, com responsável de plantão e snapshot/restore disponíveis. Comparar com baseline operacional: taxa de login falho, 401/403 inesperado, 5xx, falhas Prisma/migration/tenant context, pendências de termo, PDFs inacessíveis/hash, grants ativos/expirados/revogados e eventos de auditoria. **Continuar** somente se smoke e sinais estiverem estáveis; **corrigir pontualmente** apenas problema isolado com diagnóstico, sem relaxar guards; **rollback** por vazamento cross-tenant, bypass de permissão/termo, login essencial indisponível, auditoria crítica falha ou perda de dados. Incidente e decisão ficam registrados no canal privado.

## 12. Ensaio local e evidência desta preparação

Em 2026-10-07, `node --env-file=.env.local scripts/access-final/simulate-dev.mjs` foi executado **somente** contra `127.0.0.1:55432/gestar_vf_dev`. O script exige exatamente esse host/porta/banco; criou schemas aleatórios `accessfinal_test_*`/`accessfinal_probe_*`, aplicou baseline + 10 migrations ACCESS, fixtures sintéticas (seis usuários), backfill, dry-run agregado e smoke HTTP do auth novo/tenant/perfis. Resultado: **`Prisma fresh-schema migrate deploy: PASS`; 30 verificações passaram; fixtures/schemas removidos**. Não escreveu HOM-REAL nem produção. A primeira tentativa em sandbox recebeu `EACCES` para conexão local; repetição com acesso local autorizado passou. O script não mede backup/restore real, drift de produção, PDFs oficiais, volume real, nem rollback HTTP para legacy. Esses itens continuam na lista de aprovação da janela.

Arquivos fonte para revisão: [`app/docs/access-final-rollout.md`](../app/docs/access-final-rollout.md), [`app/scripts/access-final/dry-run.mjs`](../app/scripts/access-final/dry-run.mjs), [`app/scripts/access-final/simulate-dev.mjs`](../app/scripts/access-final/simulate-dev.mjs), [`app/scripts/access2/README.md`](../app/scripts/access2/README.md), [`app/scripts/access3b/README.md`](../app/scripts/access3b/README.md), [`app/prisma/migrations`](../app/prisma/migrations), [`app/src/lib/auth.ts`](../app/src/lib/auth.ts) e [`app/src/lib/term-storage.ts`](../app/src/lib/term-storage.ts).

## 13. Aprovação final

- [ ] Catálogo real × baseline e 4 SQLs históricos revisados; plano de reconciliação sem drift.
- [ ] Backup integral **e restore** testados; RPO/RTO e operador definidos.
- [ ] Dry-run legado somente leitura e ACCESS-FINAL pós-migration com agregados aprovados.
- [ ] Executor de **backfill de produção** aprovado e ensaiado em clone; conflitos decididos.
- [ ] PlatformAdmins, OWNERs, responsáveis, tenants ativos e perfis aprovados nominalmente no [mapa administrativo](GO-LIVE-ADMIN-MAP.md), com identidades exatas em ata privada.
- [ ] Permissões dos perfis legados revisadas; isolamento de dois tenants autenticados testado.
- [ ] PDFs oficiais, versão/reaceite e storage privado persistente com backup/restore.
- [ ] Staging: migrations, auth novo, termos, suporte, auditoria, smoke e **rollback para legacy** aprovados.
- [ ] Janela, monitoramento, contatos, ponto de decisão e autorização GO assinados.

**Situação nesta data: NO-GO para produção.** Pendem inventário/dry-run do banco real, reconciliação do baseline, executor de backfill próprio de produção, decisões humanas, PDFs/storage e ensaio de rollback HTTP. Este documento não substitui essas aprovações. Nenhum merge, deploy ou mudança de produção foi realizado.
