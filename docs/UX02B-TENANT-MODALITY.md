# UX 02B — Porta de entrada PF/PJ

Escopo: implementação e prova LOCAL. Aplicação de migration e publicação em HOMOLOG dependem de autorização específica de Ricardo. PROD não faz parte desta janela.

## Contrato funcional

Fluxo: convite operacional → ativação/login → Termo do Usuário → escolha PF/PJ pelo OWNER ativo → Fase 12A existente (Sou eu / Outra pessoa) → termo contratual → operação.

Uma identidade pode participar de vários tenants PF/PJ. A modalidade pertence ao tenant, não à identidade, ao login ou ao papel. A confirmação altera somente a classificação do tenant e grava sua auditoria; não cria identidade, tenant, perfil, Usuario, mapping ou membership. Novos vínculos continuam dependendo dos convites e permissões existentes.

| Estado | modalidade | escolha_modalidade_pendente | Comportamento |
|---|---|---|---|
| Tenant existente | NULL | false | Continua funcionando sem classificação automática |
| Novo tenant pelo provisionamento administrativo | NULL | true | OWNER escolhe após seu Termo do Usuário |
| Escolha confirmada | PF ou PJ | false | Continua a Fase 12A |

Somente OWNER com identity, membership e tenant ativos pode confirmar. PlatformAdmin sem membership, ADMIN, MEMBER, Assessoria e SupportGrant não substituem essa autorização. O tenant é obtido do contexto autenticado por ID: o endpoint não aceita tenantId no corpo. Revalidação dentro da transação serializável e lock da Fase 12A; duas escolhas concorrentes não podem sobrescrever uma à outra. Mesma escolha já confirmada é idempotente; reclassificação ou tentativa de classificar tenant antigo é rejeitada.

O bloqueio também existe no servidor: operação empresarial, designação/indicação contratual e aceite do Contratante não pulam modalidade pendente. Termo do Usuário permanece individual/global. Nenhum PDF, hash, regra de aceite, papel, permissão ou motor financeiro foi alterado.

## E-mail administrativo: dependências revisadas

Tenant.email é contato cadastral. A única restrição de identificação operacional encontrada era o teste de duplicidade no POST /api/tenants, além do índice UNIQUE de banco. Esse POST passa a consultar slug. O PATCH administrativo deixa de apresentar conflito como e-mail duplicado. A busca hierárquica usa e-mail somente como texto de pesquisa.

Resolução/autorização continua usando Tenant.id/slug e FKs tenant_id; cookies de contexto, convites, memberships, termos, assessoria, suporte, backups, cargas e dados empresariais usam IDs. Não foi encontrada consulta runtime tenant.findUnique por email. AuthIdentity.email continua UNIQUE; Usuario e os vínculos mantêm seus contratos existentes. A migration aborta caso encontre dependência inesperada por FK do e-mail, índice diferente ou constraint vinculada ao índice.

## Migration incremental proposta

Nome: `20261030_tenant_modality`.

SHA-256 dos bytes LF (mesmo SQL nos catálogos HOMOLOG e production):

`570f9d7d3e5df8b155ed6931fbf75658730ff5e030e1faf932f3b5ccf9c04934`

DDL efetivo, dentro de transação explícita e após guardas:

```sql
ALTER TABLE public.tenants
  ADD COLUMN modalidade varchar(2),
  ADD COLUMN escolha_modalidade_pendente boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT tenants_modalidade_check
    CHECK (modalidade IS NULL OR modalidade IN ('PF','PJ')),
  ADD CONSTRAINT tenants_modalidade_pending_check
    CHECK (NOT escolha_modalidade_pendente OR modalidade IS NULL);
DROP INDEX public.tenants_email_key;
```

Entre o ADD COLUMN e o DROP INDEX, o SQL define `ALTER TABLE public.tenants ALTER COLUMN escolha_modalidade_pendente SET DEFAULT true`. Os registros antigos conservam o false inicial; todo INSERT futuro fica pendente por padrão, inclusive por um consumidor que ainda não envie esse campo. O provisionamento oficial também envia true explicitamente. Isso não atribui PF/PJ a ninguém.

O arquivo completo contém BEGIN/COMMIT, search_path fixo, lock_timeout=5s, statement_timeout=60s, guarda PG18, validação exata dos nomes/checksums do ledger anterior H5 ou P4, rejeição de migration parcial/desconhecida/duplicada e validação do índice/FKs. A linha provisória que o Prisma cria para a própria migration é excluída da leitura do ledger anterior. Não há UPDATE, backfill, seed, mudança histórica ou alteração do UNIQUE de AuthIdentity.email. Colunas com default constante usam o mecanismo de metadata do PostgreSQL; o ensaio compara os registros antigos excluindo somente os novos campos.

Plano de catálogo: HOMOLOG 5→6; perfil PROD 4→5 ensaiado somente no laboratório, sem autorização para aplicação remota. A migration usa a tabela tenants existente; não cria novas tabelas/roles nem pede ampliação da ACL runtime.

## Backup v3

Formato continua `10s-tenant-backup/3`, com HMAC, proveniência, referências históricas e demais validações existentes. Manifestos atuais incluem o checksum real da migration nova: H6 ou P5 conforme o perfil.

Backups empresariais não administram modalidade nem pendência de onboarding. Snapshot/restore continua selecionando explicitamente os campos empresariais já contratados; não exporta nem escreve os dois novos campos. Restore mantém a governança atual, inclusive NULL legado ou escolha ainda pendente. Dump completo da plataforma inclui naturalmente as colunas.

Compatibilidade é explícita e somente para frente dentro do mesmo perfil: H5→H6 e P4→P5, além dos avanços previamente aprovados. Não há cruzamento entre os dois históricos, downgrade, conversão, reassinatura ou aceitação de ledger/checksum desconhecido. Mantidas as rejeições de formato antigo e HMAC adulterado.

## Plano de HOMOLOG — NÃO EXECUTAR SEM AUTORIZAÇÃO

1. Reconfirmar application/hostname HOMOLOG, SHA em execução, DB gestar_homolog_pg18/public PG18, runtime/migrator separados, auto-deploy OFF, fila vazia, volumes e ledger H5 com todos os checksums. Conferir PROD/master apenas por evidência de leitura, sem alterar.
2. Fixar o SHA local aprovado e revisar o delta. UX01 aprovada foi preservada byte a byte; a branch local incorpora também a base atual de master com o catálogo separado de produção. Não usar HEAD mutável nem promover master.
3. Criar backup privado novo do banco HOMOLOG, volumes de termos/backups e inventário de secrets sem expor seus valores. Validar pg_restore --list, SHA-256 e restore integral em banco isolado; comparar dados e ledger antes/depois. Sem prova de recuperação, abortar.
4. Coordenar janela curta sem provisionamento/escolhas: aplicação antiga pode criar tenants sem a pendência nova. Preparar artefato novo validado e migrar antes de liberá-lo. Não manter escritores antigos após a janela. Auto-deploy continua OFF.
5. Pelo migrator HOMOLOG, com canal administrativo preservado, executar somente `node node_modules/prisma/build/index.js migrate status` e, após guarda, `node node_modules/prisma/build/index.js migrate deploy` usando catálogo H6 do artefato fixado. Nunca db push, reset, resolve, migration histórica ou catálogo production.
6. Em qualquer erro, parar. Transação de DDL deve reverter integralmente; preservar logs/linha de falha do Prisma e investigar separadamente. Não marcar aplicada manualmente.
7. Confirmar H6, checksums exatos, zero failed/pending, duas colunas/checks, ausência de tenants_email_key, UNIQUE de identity intacto, roles/ACL e todas as linhas antigas preservadas (novos campos NULL/false). Publicar somente HOMOLOG no SHA aprovado; conferir SOURCE_COMMIT/digest e smoke.
8. Usar somente tenants/identidades sintéticos para aceite de Ricardo: PF; PJ; mesmo login com segundo tenant; e-mail administrativo repetido; legado sem classificação; negações de papel e ambos os caminhos da Fase 12A. Preservar tenants reais e a UX01.

### Rollback

Antes de qualquer escrita nova, restaurar snapshot validado em destino isolado e planejar recuperação coordenada se necessário. Não executar down migration automática. Depois que contatos se repetirem, recriar o UNIQUE antigo pode falhar ou apagar uma possibilidade legítima; não deduplicar ou reclassificar dados para fazê-lo passar.

Rollback somente do código para a versão anterior foi projetado como compatível com colunas aditivas, mas a versão antiga não implementa a nova pendência e poderá criar tenants sem ela. Portanto manter provisionamento de novos tenants suspenso e preservar os campos/dados até decisão explícita; preferir correção adiante. Se for necessário restaurar o banco, não perder escritas da janela nem alterar PROD. O plano será revalidado com o snapshot e artefato reais antes da autorização.

## Validação local

Rodada concluída em 30/10/2026, exclusivamente em contêiner PG18.6 LOCAL novo, network none, sem portas publicadas, sem SMTP e sem dados reais. URLs/bancos DEV do host não foram usados nos ensaios finais. Os catálogos históricos foram executados sem alteração; o banco de laboratório foi nomeado gestar_vf_dev somente dentro desse namespace isolado para respeitar a guarda DEV de convites existente.

- 63 testes unitários: PASS, zero skips. Incluem modalidade, checksums/ledger, backup/proveniência, Fase12A, convites, assessoria, suporte/offboarding e autorização.
- 2 regressões reais Prisma/PostgreSQL: PASS, zero skips; isolamento de leitura/escrita, unicidade de vínculo, revogação de um vínculo sem afetar outro e FKs de compatibilidade.
- 115 verificações HTTP/Prisma: PASS no artefato Linux compilado. PF; PJ; identidade existente entrando em segundo tenant; contato administrativo compartilhado; login único; tenant antigo operacional sem classificação; termos antes da escolha; F12A SELF/OTHER; liberação de ambas as sessões; MEMBER/ADMIN/PA e revogados negados; corpo/origin inválidos; concorrência 200/409 com um só evento; idempotência; nenhum acesso implícito; vizinho intacto; backup v3 H6 via HTTP e preview; restore/replay de PF, PJ e pendência; backup H5 autêntico restaurado em H6; HMAC/adulteração/injeção de modalidade rejeitados.
- 76 verificações de navegador: PASS. OWNER e MEMBER, desktop 1366px, tablet 768px, mobile 390px, Claro/Escuro, teclado, touch, nome do tenant, ativo institucional original, sem overflow nem erro JS. Doze screenshots locais; inspeção visual de desktop Claro e mobile Escuro realizada.
- Migration final: H5→H6 e P4→P5 em bases sintéticas; ambas completas, checksums exatos, sem failed/pending. Registros antigos equivalentes excluindo somente as novas colunas, com modalidade NULL/pendência false. INSERT futuro fica pendente true por default. Valores inválidos e combinação selecionada+pendente rejeitados; runtime continua sem ownership/DDL/schema CREATE/escrita no ledger. Guardas de índice/FK/ledger e lock timeout com rollback integral comprovadas.
- Build Linux limpo + TypeScript + artifact verifier: PASS. Um tsc inicial no Windows encontrou types gerados antigos em .next/dev; a validação autoritativa foi realizada em build Linux limpo, sem alterar serviços locais ou configuração TypeScript para esconder erro. Nenhum teste foi relaxado para produzir PASS.
- A disputa concorrente revelou P2010 com SQLSTATE 40001 dentro de driverAdapterError.cause do Prisma7. O endpoint novo reconhece estritamente esse formato (ou P2034/deadlock) como 409. Falhas desconhecidas ou de privilégio continuam 500 sanitizado. Prova HTTP repetida com a implementação corrigida.
- git diff --check e revisão dos arquivos: PASS. Arquivos da UX01 permanecem idênticos aos aprovados em cac72187ce0467b61cae86b20969776eae62ca3e.

Evidências privadas de dados exclusivamente sintéticos: C:/Users/ricar/Documents/Codex/ux02b-tenant-modality (UNIT-FINAL.log, PRISMA-FINAL.log, HTTP.json, VISUAL.json, MIGRATIONS.json, FINAL-SQL-GUARDS.json e screenshots). Senhas sintéticas e chaves de laboratório permaneceram em memória/env do contêiner; não constam nos relatórios/Git. Nenhum secret real foi carregado ou copiado para esse laboratório.

Arquivos centrais: schema.prisma; migration.sql nos dois catálogos; tenant-modality-state.ts; tenant-modality.ts; endpoint /api/onboarding/modalidade; página /onboarding/modalidade; TenantModalityClient.tsx/CSS; integração do gate em tenant.ts/onboarding/Fase12A/aceite contratual; POST/PATCH de tenants; schema-contract.mjs; três testes tenant-modality.* e este relatório.

Branch local: feat/ux02b-tenant-modality. Base: master 28ea8f44b860e9094ee89ec2852802de685bb4fc mais cherry-pick local da UX01 aprovada (2e0964a18c874015b872697e8e36578703f1b5db). O SHA definitivo será entregue no fechamento junto à confirmação do artefato. Nenhum push, migration ou publicação remota foi executado.

Status: UX02B IMPLEMENTADA E VALIDADA LOCALMENTE — AGUARDANDO AUTORIZAÇÃO ESPECÍFICA PARA MIGRATION/PUBLICAÇÃO SOMENTE EM HOMOLOG. PROD, master, landing e UX01 preservadas.
