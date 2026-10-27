# PG18 BASELINE V1

## Decisão e fontes

Fase 10B, 27/10/2026. Instalação nova e vazia, sem migração de dados antigos.
f670a43336052d9620fc51a33e9d74ad67ed0f85 permanece imutável como história anterior.
A história ativa será substituída por uma baseline PG18; não haverá duas linhagens ativas.
Não executar esta baseline sobre PROD antiga, HOMOLOG PG16 ou o ensaio PG18 existente.

O contrato canônico é o resultado de **fresh install das 19 migrations do f670**:
schema Prisma mais os objetos SQL efetivamente criados nessa trajetória. A derivação
usou PostgreSQL16.15 descartável local, sem dados/credenciais/volumes de ambiente real.
As 19 entradas e checksums foram conferidos; todas as tabelas ficaram vazias.

## Especificação estrutural anterior à geração

pg18/schema19-canonical.json contém a especificação completa, por objeto:
377 colunas (tipo/default/nullability), 140 constraints PK/FK/UNIQUE/CHECK,
132 índices, 37 triggers, 5 funções, 38 tabelas, 11 enums com 37 valores e
1 sequência. Não há views nem policies no fresh install homologado.
O catálogo exclui somente a tabela administrativa _prisma_migrations.

As funções preservadas são:

- access5a_prevent_evidence_change: imutabilidade das evidências de aceite;
- access5a_protect_version: proteção das versões jurídicas publicadas;
- bump_lancamento_revision: avanço técnico de revisão;
- forbid_audit_event_mutation: auditoria append-only;
- guard_tenant_restore_write: coordenação entre escritores e restore.

Preservar integralmente as 37 associações de triggers e todas as FKs, incluindo
tenant nas chaves compostas. Histórico externo de autoria/proprietário continua
sujeito à prova HMAC; não concede acesso.

O CHECK de lancamentos.valor permite NULL/zero/positivo e rejeita negativo.
data_lanc, descricao, valor e tipo são opcionais.
status continua NOT NULL/default realizado; não é backfill nem inferência de baixa.
revisao permanece NOT NULL/default zero, não negativa e incrementada pelo banco.
A sequência tarefas_seq_seq e seu vínculo/default são preservados.

Identity, Membership, PlatformAdmin, SupportOperator, grants, audit, import receipts,
metadados de termos e restore locks são estrutura, não seeds de acesso.
Nenhuma identidade, perfil, grant ou tenant será criado pela baseline.

## Objetos exclusivos do legado

A reconciliação antiga tinha preservações adicionais para bases históricas UUID.
importacoes, vw_powerbi_lancamentos, checks UUID e triggers exclusivamente legados
não existem no fresh install do f670 e não serão inventados na instalação limpa.
Não executar database/init.sql, seed.sql, backfills históricos ou bootstrap Power BI.
Nenhum LOGIN ou credencial Power BI faz parte da baseline.

## Ownership e ACL

Objetos pertencem ao migrator executor. A baseline não incorpora donos de outro
ambiente, senhas ou grants para pessoas. O provisionamento operacional deve separar:
migrator proprietário; runtime não proprietário e sem DDL/flags elevados;
admin de recuperação independente.

Runtime recebe USAGE no schema, operações necessárias nas tabelas de aplicação,
USAGE/SELECT nas sequências e execução das funções necessárias; audit recebe apenas
SELECT/INSERT, e ledger apenas SELECT. Nenhuma escrita em ledger, CREATE em public,
SUPERUSER, CREATEDB, CREATEROLE, REPLICATION ou BYPASSRLS.
Triggers continuam exigíveis mesmo para escritores SQL diretos.
ACLs de objetos novos devem acompanhar o migrator por default privileges restritas
e ser revalidadas por migration futura. Não assumir que ACL substitui guards de tenant.

## Construção revisável

A captura schema-only é um insumo de comparação, não um dump operacional aplicado
cegamente. Selecionar somente DDL final de tipos/funções/tabelas/sequência/default/
índices/constraints/triggers, confrontado com o catálogo canônico e migrations fonte.
Excluir comandos de sessão do dump, tokens psql restrict, owners, ACLs ambientais,
ledger, dados, seed, caminhos e transformações de versões anteriores.
Adicionar guarda PG18/banco vazio, transação, lock timeout e statement timeout.
Comparar todos os objetos após aplicar em PG18, com NOT NULL explícitas verificadas.

## Backup

Nova época usa 10s-tenant-backup/3, com ledger real da baseline e checksum exato.
Backups /1 e /2 falham fechado, sem conversão/reassinatura. HMAC continua cobrindo
conteúdo, ledger e historicalReferences. Backups antigos e f670 permanecem intactos.

## Resultado local — 27/10/2026

A especificação acima foi produzida antes da geração. A baseline definitiva é
`20261027_pg18_baseline`, SHA-256
`54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8`.
O ledger contém exatamente essa migration completa. Não usar resolve, db push,
edição do ledger ou aplicação desta baseline em banco não vazio.

PostgreSQL 18.6: nove provas estruturais passaram, incluindo replay normal sem
escrita, rejeição de schema inicial diferente de public, objeto inesperado, ledger
antigo e reexecução SQL manual; falha DDL tardia reverte toda a baseline.
As dez seções do catálogo são iguais ao fresh install f670. As 251 constraints
NOT NULL explícitas do PG18 foram verificadas nos dois sentidos, válidas e exigíveis.
Fingerprint semântico:
`5ab959cc0f8e64c0d22dc8e5c2faa506df34e96d730aa49f483da2ca550fa8d5`.

Regressão final com os bytes/checksum acima, PostgreSQL + Prisma + HTTP reais:

| Bloco | Resultado |
| --- | --- |
| Testes Node | 212 PASS, 0 falhas, 3 skips condicionais legados |
| Backup/preview/restore | 51 PASS |
| Excel I1 | 39 PASS |
| Excel I2–I6 | 264 PASS |
| Financeiro, NULL/zero, relatórios/análises, exports, stale409 | 36 PASS |
| SupportOperator/grants/revogação/offboarding/termos | 36 PASS |
| Restore histórico sintético/HMAC/isolamento | 102 PASS |

Os skips não são declarados aprovados; auth/sessão, memberships e isolamento foram
exercitados adicionalmente via HTTP e Prisma. O laboratório histórico reproduz
oito tenants sintéticos, 31 referências externas de autoria e dois proprietários
de layout; não transporta dados de ambientes reais. Nenhum teste foi relaxado.
Os adaptadores registram o digest do runner original e exigem substituições exatas
de ambiente/ledger/versão. Relatórios e análises atuais respondem 200 com NULL/zero;
F9-07 continua fora do escopo.

Build Linux/TypeScript do laboratório passou. O artefato de publicação deve ser
construído novamente a partir do commit limpo, com SOURCE_COMMIT real, verificador
de artefato e digest registrados; a imagem de laboratório não é o candidato publicado.

## Operação LOCAL e HOMOLOG

O compose da raiz agora é exclusivamente LOCAL PG18: projeto `dez-local-pg18`,
DB `gestar_local_pg18`, porta PostgreSQL loopback 55439, aplicação loopback 3008,
volumes novos. Não executar esse compose na PROD antiga. Nunca trocar imagem
PG16 por PG18 sobre o mesmo volume. Não carrega init.sql nem seeds antigos.

Scripts em `app/scripts/pg18` exercitam apenas laboratórios Docker Desktop
descartáveis com guardas de host/banco/rede. `runtime-acl.sql` é provisionamento
operacional separado da migration; validar ACL novamente após mudanças futuras.
O banco vazio da montagem preliminar local foi preservado como
`gestar_local_pg18_draft`; não está conectado à aplicação. O banco ativo foi
instalado do zero com os bytes definitivos, sem editar o ledger.

Secrets LOCAL e HOMOLOG são distintos, protegidos fora do Git por DPAPI do usuário
Windows em `phase10b-pg18/custody`, no diretório operacional privado. A recuperação
depende desse perfil Windows; isto não substitui o futuro cofre institucional PROD.
Nunca imprimir/exportar o conteúdo descriptografado. Hashes de contas humanas
não pertencem ao cofre nem às evidências: transferência autorizada somente em memória.

Nova HOMOLOG: serviço/volume PG18 próprios, DB `gestar_homolog_pg18/public`,
runtime/migrator/admin separados, storage/HMAC/auth novos, sem SMTP herdado.
Somente as duas identidades administrativas expressamente aprovadas podem ser
copiadas, com suas concessões PlatformAdmin e hashes, sem memberships, empresas,
dados de negócio, termos, sessões, tokens, grants ou backups antigos.
PlatformAdmin não concede acesso empresarial. MODO DEV novo e vínculos humanos
dependem de aprovação específica; não inferir acesso pela cópia administrativa.

PROD antiga, ensaio PROD PG18 e HOMOLOG PG16 ficam preservados. A substituta precisa
passar nas guardas, publicar SHA/digest verificável e receber aceite humano.
Auto-deploy permanece controlado/desabilitado. O resultado local não representa
homologação pública concluída nem autoriza qualquer cutover PROD.
