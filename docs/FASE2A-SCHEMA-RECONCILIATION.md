# Fase 2A — reconciliação de schema legado, migrations e plano de identity

Data da rodada: 23/10/2026, America/Sao_Paulo. Parte das evidências usa UTC de 24/10.
Branch local: `fix/schema-reconciliation-phase2a`.
Base aprovada: `origin/homologacao@14d6d7994bb3f89f26bb890ce20b1632e7588444`.
Infra de referência: `674bf1ef398337d97edc35b1fb9d3a5ce7a4e6de`.
Master preservada: `6001373b6ea555fa31c5c71920f5034e236df7bc`.

## 1. Resumo executivo

Reconciliação implementada e ensaiada **somente em PostgreSQL local isolado**, com DDL fiel ao
catálogo PROD e linhas integralmente sintéticas. Nenhum dado real foi clonado para o laboratório.
PROD e HOMO foram consultadas em modo somente leitura. Nenhuma migration, escrita de usuário,
configuração, reinício, deploy ou backfill foi realizado nesses ambientes.

Entrega: uma nova migration de compatibilidade, planejador read-only de identidades, fixtures,
testes de upgrade/restore/HTTP e procedimento operacional. As 12 migrations antigas permanecem
byte a byte iguais aos checksums coletados na HOMO. Não houve `db push`, `migrate reset`,
`resolve --applied`, reaplicação de baseline real ou alteração de master.

**Recomendação:** GO técnico para revisar/autorizar um ensaio controlado na HOMO, onde a migration
é um no-op estrutural verificado. **Não executar sem nova autorização. PROD continua NO-GO.**
Foi reproduzido um bloqueio operacional adicional: timestamps legados com microssegundos não
casam com a versão JavaScript em milissegundos usada no optimistic locking de bulk/Excel.
Os dados foram preservados; essa incompatibilidade NÃO foi ocultada por truncamento.

## 2. Catálogo PROD versus target

[Matriz completa de divergências](phase2a/CATALOG-DELTA.md): objeto, PROD, target, ação, risco,
pré-checagem e rollback. Abrange colunas/tipos/nullability/defaults, PK/FK/unique/check, índices,
enums, triggers/funções, view, sequências e RLS. Não inclui senhas ou linhas de negócio.

| Item | PROD inventariada | Target HOMO | Laboratório após upgrade |
|---|---:|---:|---:|
| Tabelas, incluindo ledger | 20 | 37 | 38 |
| Colunas de tabelas, sem ledger/view | 190 | 359 | Target + preservações legadas |
| View Power BI | 1 | 0 | 1 preservada |
| Colunas físicas UUID legadas | 44 | 0 | 0; valores preservados em TEXT |
| Timestamps legados timestamptz | 22 | Timestamp(3) no modelo correspondente | 22 preservados |
| FKs | 25 | Catálogo detalhado na matriz | 74, todas validadas |
| Tipos enum | 0 | 11 | 11 |
| Migrations concluídas | Baseline, com 0 steps | 12 | 13 |

O ledger PROD registra `0_legacy_baseline` concluída com zero steps e
`20261005_access_identity_membership` com `finished_at=NULL`, `rolled_back_at` preenchido e
zero steps. Não há objetos ACCESS parciais no catálogo observado. Isso não transforma o schema
PROD no baseline atual; a nova barreira trata a divergência explicitamente.

O catálogo do laboratório antes da alteração foi comparado ao remoto: todas as seções
estruturais conferiram. A fixture target também corresponde ao catálogo HOMO. Versões:
PROD PostgreSQL 16.14; HOMO/laboratório 16.15. Fingerprints exatos em
`app/scripts/schema-reconciliation/README.md`. Qualquer drift futuro exige nova auditoria.

PROD contava 8 tenants, 16 usuários e 33 lançamentos; HOMO contava 2 identidades ACTIVE,
2 PlatformAdmins ACTIVE, zero tenants/memberships e 12 migrations. Nenhuma dessas contagens
foi usada para inferir ou criar concessões de acesso.

## 3. Estratégia UUID/TEXT

Escolha: converter fisicamente as 44 colunas UUID históricas para TEXT com `USING coluna::text`,
mantendo cada valor canônico e todas as referências. Não gerar novos IDs, recriar entidades,
mover tenants ou remapear autoria. CHECKs preservam a representação UUID canônica e os defaults
anteriores continuam gerando UUID. Não se aplica essa restrição a IDs novos exclusivos do ACCESS.

Motivo: a sequência ACCESS histórica usa TEXT nas FKs para tenants/usuários. Preservar UUID
fisicamente exigiria outra linhagem ACCESS, alteração de migrations publicadas ou artifícios
de casts/ledger. Nenhuma dessas alternativas foi aplicada. A conversão explícita resolve a
compatibilidade mantendo a identidade lógica; seu custo físico exige janela de manutenção.

As FKs legadas são removidas apenas dentro da transação, restauradas com a definição original,
incluindo ações ON DELETE/UPDATE, adicionadas NOT VALID e imediatamente validadas. Não há janela
externa sem FK: locks impedem escrita até o commit. Constraints novas também são validadas.

`vw_powerbi_lancamentos` precisa ser recriada na mesma transação, sem CASCADE. Seu ID continua
UUID por cast explícito; definição, resultado, proprietário e ACL são verificados. O grant de
SELECT preexistente para `powerbi_reader` é restaurado somente se já existia. Nenhum role é
criado pela migration. ACL, comentários, dependência ou proprietário inesperados interrompem
o procedimento. O proprietário deve ser o usuário executor autorizado, como observado na PROD.

## 4. Migration de reconciliação proposta

Arquivo: `app/prisma/migrations/20261004_legacy_schema_reconciliation/migration.sql`.
Criada nesta rodada; o prefixo 20261004 é uma barreira de ordenação **antes** de ACCESS-2,
não uma indicação de que a migration existia nessa data. A ordem foi validada pelo Prisma 7.8
real, inclusive com a entrada histórica de identidade rolled back.

Fluxo transacional:

1. Fixar `public,pg_catalog`, timezone UTC, lock timeout 5s e statement timeout 5min.
2. Validar baseline no ledger, checksums históricos e ausência de migration pendente não resolvida.
3. Bloquear tabelas públicas em ACCESS EXCLUSIVE e comparar o fingerprint do catálogo.
4. Baseline atual, target HOMO ou estado reconciliado reconhecido: no-op verificado.
5. Legado reconhecido: fotografar contagens e digests de **todas as colunas antigas** por tabela.
6. Preservar a view/ACL; converter tipos explicitamente; restaurar/validar FKs.
7. Criar as quatro tabelas de portfólio ausentes, 17 colunas ausentes nas tabelas existentes,
   índices e constraints necessários, sem inferir valores relacionais.
8. Comparar cada contagem/digest anterior, validar constraints e fingerprint resultante; commit.

Depois, o `migrate deploy` normal aplica as migrations ACCESS pendentes e registra a nova barreira.
Não há concessão: como não existem memberships antes do ACCESS, os seeds históricos de perfis
legados não encontram vínculos para receber perfis/permissões. Isso foi confirmado no laboratório.

Esta migration não busca igualdade destrutiva com o baseline: conserva `importacoes`, a view,
22 timestamptz, defaults UUID, checks financeiros, triggers, índices extras e ações de FK legadas.
Não aceitar um `migrate diff`/`db push` futuro que elimine essas preservações sem revisão explícita.

## 5. Resultados no laboratório

Rede Docker interna `10s-phase2a-lab`, sem portas publicadas ou conexão aos bancos DEV/HOMO/PROD.
PostgreSQL 16.15 fixado por digest. Bancos novos identificados por `phase2a_<rodada>_*`.
Fixtures de schema contêm somente DDL; fixture de dados inclui UUIDs, datas com microssegundos,
todos os cadastros históricos, checks/FKs, emails ambíguos/inativos e autoria cross-tenant.

Resultado do upgrade: 38 tabelas, 74 FKs validadas, 65 checks, 11 tipos enum, 13 migrations
concluídas e nenhuma falha não resolvida. A entrada histórica rolled back foi mantida, sem
falsificar ledger. `migrate status`: **Database schema is up to date**.

Antes dos testes específicos de login, as migrations deixaram **zero AuthIdentity,
PlatformAdmin, TenantMembership, AccessProfile e LegacyUserAccessMap**. Não houve backfill.
Os testes HTTP posteriores criaram exclusivamente contas/grants sintéticos nesse laboratório.

Foram exercitados: upgrade legado; instalação do zero; no-op target com 2 PAs sintéticos;
rerun no estado reconciliado; drift de coluna; migration parcial; checksum alterado; ACL de
view inesperada; integridade FK/check/SEQ; 36 modelos Prisma; restore integral e dry-run.

## 6. Preservação de IDs, datas e autoria

Contagem e digest, ordenados pelo ID, de todas as colunas originais de cada tabela conferiram
antes/depois, inclusive valores financeiros, hashes sintéticos inutilizáveis, JSONs e referências.
A comparação da view e sua leitura como `powerbi_reader` também passaram. Nenhuma perda de linha.

DATE não foi transformado. Os 22 timestamptz conservam instantâneos e microssegundos; não houve
cast para timestamp(3), arredondamento ou ajuste implícito de timezone. A comparação usa UTC
para representação consistente, sem modificar os valores armazenados.

**Regra histórica:** `criado_por` permanece o mesmo ID, mesmo quando o usuário autor pertence
a outro tenant. Não usar e-mail, papel atual, membership futura ou conta administrativa para
“corrigir” autoria. O inventário read-only contou 31 ocorrências na PROD; nenhuma foi alterada.

**Limite comprovado:** bulk/Excel usam `updateMany` com `atualizadoEm` vindo de `Date` JS.
No registro sintético com microssegundos, o filtro exato encontrou zero linhas, apesar de a
versão lógica não ter mudado. Leitura e atualização por ID funcionaram. Resolver posteriormente
com contrato de versionamento que preserve precisão; não reduzir precisão de dados existentes.

## 7. Plano ACCESS

Base física após a sequência: AuthIdentity, TenantMembership, PlatformAdmin, perfis,
LegacyUserAccessMap, owner events, termos/versões/aceites, responsáveis contratuais,
SupportGrant/eventos, AuditEvent e convites. As migrations de integridade/imutabilidade permanecem.

Schema pronto não autoriza ativar identity em PROD nem migrar usuários automaticamente.
Modo de autenticação dos ambientes não foi alterado. HOMO continua identity; nenhuma configuração
PROD foi escrita. Manter o rollback operacional de aplicação/configuração separado do schema.

## 8. Dry-run de identidades

Planejador puro: `identity-plan.mjs`; inventário: `identity-inventory.sql`; CLI:
`dry-run.mjs NOME_EXATO_DO_BANCO`. Transação REPEATABLE READ / READ ONLY, sem `--apply`, sem carregar
`.env`, sem URL em argumento e sem selecionar senha_hash. A conexão deve ser fornecida privadamente.

Execução read-only em PROD: 16 usuários, 14 grupos normalizados. Relatório persistido apenas com
referências pseudônimas U/T/G, papel/estado e contagens de autoria; não inclui emails, nomes,
IDs brutos, senhas ou hashes. Categorias cumulativas:

| Categoria | Grupos | Significado |
|---|---:|---|
| A | 3 | Candidato inequívoco ativo, ainda sem autorização de criação/concessão |
| B | 2 | Mesmo email normalizado em múltiplos tenants |
| C | 11 | Conta com papel administrativo legado |
| D | 0 | Conflito formal detectado nesta amostra |
| E | 14 | Exige decisão humana antes de qualquer escrita |

Não somar categorias: um grupo pode estar em B, C e E. Zero conflitos D não comprova identidade
civil única, legitimidade de acesso ou igualdade de senhas. O planejador não lê nem escolhe hashes.

## 9. Conflitos e decisões humanas

Confirmar quem é a pessoa real por trás dos grupos duplicados, quais tenants pertencem a ela,
quais papéis continuam legítimos, qual perfil mínimo deve ser usado e qual fluxo de ativação
será adotado. Usuário/tenant inativo não é ativado implicitamente. OWNER requer designação explícita.

Ricardo: PlatformAdmin é concessão de plataforma; memberships são concessões empresariais
independentes. Pode haver vários memberships legítimos, cada um aprovado para seu tenant.
A conta principal e a institucional continuam identidades distintas, não aliases.
As 2 identidades da HOMO não autorizam copiar credenciais ou criar vínculos em PROD.
Nenhuma membership nasce porque Ricardo ou Wanderson é PlatformAdmin.

Não enviar tabela de correspondência de pessoas, dados financeiros, hashes ou credenciais ao Git.
As referências pseudônimas exigem consulta privada autorizada para a revisão humana posterior.

## 10. Plano de backfill — sem executor de escrita nesta fase

1. Inventário congelado e catálogo íntegro; hash do relatório e backup privado verificado.
2. Manifesto humano aprovado: identidade por pessoa, status, tenant, papel, perfil e mapping exatos.
3. Separar aprovação de PlatformAdmin de aprovação de membership/OWNER/perfil empresarial.
4. Definir senha por fluxo individual de ativação/recuperação autorizado; não escolher um hash
   entre usuários duplicados nem assumir que suas credenciais são intercambiáveis.
5. Projetar executor futuro serializável, idempotente por identidade/vínculo aprovados, com
   conferência de estado antes de gravar, diário de IDs criados e auditoria sem segredos.
6. Não alterar Usuario.id, tenant_id ou autoria histórica. Mapping referencia o registro exato
   revisado; não faz lookup oportunista por email na hora da gravação.
7. Ensaiar login zero/um/múltiplos tenants, isolamento, revogação, perfis e rollback antes de
   decidir a troca de modo. Conflito aborta; não “corrigir” silenciosamente.

Nenhuma rotina DEV existente de backfill foi executada contra PROD/HOMO. Não há um novo `--apply`
de backfill nesta entrega. Nenhum MODO DEV foi provisionado.

## 11. Rollback em três camadas

**A — aplicação/configuração:** registrar imagem/digest, SHA, modo ACCESS e configuração privada
anterior. Retornar imagem e modo somente dentro de uma autorização operacional futura.
Isso **não desfaz DDL**. Um rollback para código que exige schema antigo depende da camada B.

**B — schema/migrations:** backup custom completo antes da mudança, roles/ACLs/owners inventariados,
leitura por pg_restore e SHA-256. Na janela, interromper escritas da aplicação e integrações;
validar ausência de escritores. Reconciliar em transação; falha de precheck/lock/DDL aborta.
Não avançar para as demais migrations após falha, não usar resolve automático.

Procedimento de restauração ensaiado, apenas em banco novo de laboratório:

```text
pg_dump -Fc -d BANCO_LAB_ANTES > backup-privado.dump
pg_restore --list backup-privado.dump
sha256(backup-privado.dump)
CREATE DATABASE BANCO_LAB_RESTORE;
pg_restore --exit-on-error --no-owner -d BANCO_LAB_RESTORE backup-privado.dump
comparar catálogo + IDs/colunas/datas/autoria + ledger + ACL/resultados da view
```

O runner usa docker exec e buffers binários, não redirecionamento textual PowerShell para dumps.
Backup sintético final e SHA: `phase2a-evidence/lab-verified-final/report.json` e
`synthetic-before.dump`. SHA-256: `5f44ba7f67b78e4459d05c705aa6dcfc5387970460f04b71312ef13d4419eafc`.
O restore após upgrade recuperou schema UUID, dados, ledger e ACL.
Os roles já existiam no cluster isolado; em outra infraestrutura, restaurar roles/ownership
revisados antes das ACLs. Não transportar roles ou grants de forma indiscriminada.

Futuro ambiente real: restaurar primeiro em **banco separado**, validar, manter o banco com
problema preservado e só então autorizar troca da aplicação. Não emitir `DROP DATABASE` ou reset
em PROD. Dimensionar disco, tempo de dump/restore e janela com inventário real atualizado.

**C — dados/backfill:** nenhum backfill foi feito. Futuro executor precisa de diário e auditoria;
rollback desativa/reverte apenas as concessões aprovadas/criadas, respeitando referências e
trilha imutável. Não apagar evidências de segurança para “limpar” rollback.

Qualquer escrita após o backup exige reconciliação explícita antes de restore/cutover.
Não retornar ao snapshot e perder silenciosamente escritas posteriores. Falha de preservação,
ACL, FK, ledger, acesso ou divergência de catálogo é critério de abortar a promoção.

## 12. Testes e evidências

| Verificação | Resultado |
|---|---|
| Unitários puros, incluindo 6 novos de planejamento | 85 PASS, zero falhas/skip na seleção explícita |
| Laboratório final | 15 cenários PASS |
| Modelos Prisma | 36 consultados; relações/aggregates válidos |
| Prisma status | 13 migrations, up to date, sem falha não resolvida |
| Checksums históricos | 12/12 inalterados |
| PostgreSQL antes/depois | Zero linha perdida/tenant movido/autoria remapeada |
| Backup/restore | Dump lido, SHA-256 registrado, restore após upgrade conferido |
| HTTP com runtime Linux construído | 6 handlers 200; PA/identidade sem membership sem acesso financeiro; cross-tenant 403 |
| TypeScript Windows e Linux | PASS |
| Build Linux + verificador de artefato | PASS, Git archive do commit `c747b6550d14a633c2e1a4fe41f47f50dd8e9059` |
| Runtime CLI migrate deploy/status | PASS contra clone sintético do legado |
| git diff --check | PASS |
| Precisão de versão bulk/Excel | Bloqueio reproduzido; não corrigido nem mascarado |

Imagem local: `10s-phase2a:c747b65`; image config
`sha256:363fa4446d6cd6f2c7156b75543040838971b289f21583d2095f97ab672d527f`.
Build usa Node 20.20.2, Next 16.2.5 e Prisma 7.8, sem upgrade de dependências.
Não houve npm install/ci no checkout; Docker reutilizou a camada `npm ci` do lockfile aprovado.
Documentação posterior não altera código/SQL testados; nenhuma imagem foi publicada/deployada.

Uma tentativa inicial da suíte genérica incluiu `tenant-isolation.test.mjs`, que carrega
`.env.local` por conta própria. Sua primeira consulta foi bloqueada por EACCES; não houve escrita
DEV nem repetição com mais permissões. Os cinco testes históricos dependentes de DEV foram
excluídos da seleção pura e substituídos pelos ensaios isolados descritos aqui. Não os declarar
aprovados nesta rodada.

Evidências privadas preservadas fora do Git em
`C:\Users\ricar\Documents\Codex\phase2a-evidence`: catálogos remotos, schema-only dumps,
dry-run pseudônimo, `lab-verified-final`, `lab-built-image`, build log e guarda final remota.
O diretório anterior `audit-macro-20261023` foi preservado.

## 13. Riscos e limites

- Conversão de 44 colunas/índices exige locks, WAL e espaço. Laboratório pequeno não estima janela real.
- Fingerprint estrito pode bloquear índice/DDL benigno; é proteção deliberada. Não afrouxar sem reensaio.
- A versão timestamp usada por bulk/Excel ainda tem incompatibilidade comprovada com microssegundos.
- CHECK legado `valor > 0` permanece: não alterar regra financeira como efeito colateral do schema.
- Não fechar equivalência operacional completa com target: defaults/triggers/FKs legadas preservados
  exigem regressão funcional posterior, incluindo importação, edição em massa, deletes e concorrência.
- A view tem consumidor externo Power BI; manter resultado UUID e ACL não substitui homologação do consumidor.
- Dados sintéticos cobrem divergências conhecidas; não substituem nova pré-checagem na janela real.
- Guardas de tenant/perfil e decisão humana continuam necessárias; schema por si só não dá legitimidade a acessos.

## 14. Gaps afetados

| Gap | Situação nesta fase |
|---|---|
| G03 | Reconciliação executável e ensaiada; implantação/precisão operacional continuam pendentes |
| G04 | Desenho/dry-run de identidade pronto; sem backfill ou ativação PROD |
| G05 / G11 | Base física ACCESS comprovada no laboratório |
| G16 | Preservação de autoria demonstrada; sem remapeamento |
| G17 | Concessões não inferidas; plano exige aprovação por vínculo/perfil |
| G22 | Base de regressão isolada, backup/restore e smoke HTTP preparados |

Não fechados: G06 CRUD global, G07 MODO DEV, G08 SMTP, G09 storage de termos, G10 upload,
G13 operação, G14/G15 Excel e G21 DRE/CONT. A descoberta de precisão alimenta a etapa operacional/Excel.

## 15. Plano para aplicar primeiro na HOMO — NÃO EXECUTADO

1. Ricardo/ChatGPT revisam este relatório e autorizam explicitamente integração, build/deploy e migration HOMO.
2. Reconfirmar branch, SHAs, working tree e imagem; comparar fingerprints atuais e os 12 checksums.
3. Preparar artefato limpo da revisão aprovada, sem antecipar promoção para master/PROD.
4. Registrar rollback de imagem/config; snapshot privado HOMO completo, SHA-256 e restore em banco isolado.
5. Confirmar exclusivamente `gestar_financeira_homolog/public`, 12 migrations, 2 PAs ACTIVE,
   zero vínculos/tenants inesperados, ACCESS_AUTH_MODE=identity e nenhum hook automático de migration.
6. Na janela autorizada, executar no artefato HOMO aprovado, em `/app`:

```text
node node_modules/prisma/build/index.js migrate status
node node_modules/prisma/build/index.js migrate deploy
node node_modules/prisma/build/index.js migrate status
```

7. Esperado: só a nova migration pendente; catálogo target reconhecido, no-op estrutural,
   ledger passa a 13. Comparar catálogo/dados/ACLs antes/depois. Não criar usuários/tenants/memberships.
8. Validar imagem/SHA/callbacks, identidade/PlatformAdmin existentes e smoke autorizado;
   Ricardo testa manualmente as duas contas. Não testar suas credenciais por automação.
9. Falha de guarda/status/catalogo: parar; não improvisar SQL ou resolver ledger manualmente.
10. Documentar aceite HOMO; PROD permanece outra etapa, com nova autorização e bloqueios resolvidos.

Esse no-op na HOMO valida a integração da linhagem, mas não substitui o upgrade UUID do laboratório.
Nenhum passo acima foi iniciado remotamente nesta Fase 2A.

## 16. Itens que dependem de Ricardo

- Revisão do relatório e autorização específica para a etapa HOMO.
- Confirmação humana das identidades/grupos duplicados e vínculos empresariais legítimos.
- Designação explícita de OWNER e PlatformAdmin, separada das memberships/perfis.
- Aprovação do fluxo individual de credencial/ativação; nenhum segredo pelo chat/Git.
- Aceite dos testes manuais e dos critérios de bloqueio; não antecipar criação de MODO DEV.

## 17. Itens que dependem de Wanderson

- Revisar a estratégia física, janela/locks/WAL/disk, view/consumidor Power BI e rollback real.
- Revisar o ledger legado, barreira de ordenação e preservações intencionais versus Prisma.
- Aprovar solução de versionamento que preserve microssegundos antes de operação bulk/Excel em PROD.
- Planejar promoção somente depois das demais fases, autorização e regressão HOMO concluídas.

Nenhuma ação ou mensagem foi solicitada a Wanderson nesta rodada. Produção continua fora do laboratório.

## 18. GO/NO-GO, commits e encerramento

**GO para revisão e solicitação de autorização da próxima etapa HOMO. NÃO executar automaticamente.**
**NO-GO para PROD**, ativação/backfill real, MODO DEV ou próxima fase sem decisão posterior.

Commits locais separados:

1. `61fa1ac` — migration/reconciliação e catálogo.
2. `b30b296` — dry-run/planejamento de identidade.
3. `c747b65` — fixtures, testes de upgrade/restore/HTTP/planejamento; fonte do build Linux.
4. Commit de documentação desta entrega — relatório, matriz e roteiro operacional.

Sem push, merge ou integração em homologacao. Sem alteração de master, PROD ou HOMO.
Guarda remota final confirmou HOMO no SHA `14d6d799...`, banco exclusivo, modo identity;
PROD `gestar_app` mantém a mesma imagem e início de 17/10, e os containers não foram reiniciados.
Referências remotas homologacao/master continuam nos SHAs iniciais.

Working tree deve terminar limpa após o commit de documentação. Preservar evidências privadas,
parar somente os containers locais de laboratório desta rodada e encerrar sem iniciar a próxima fase.
