# Fase 2A — reconciliação física e planejamento de identidade

Somente laboratório nesta rodada. Nenhum destes comandos autoriza execução na HOMO ou PROD.
Relatório: `docs/FASE2A-SCHEMA-RECONCILIATION.md` na raiz do repositório.

## Contrato da migration

`20261004_legacy_schema_reconciliation` é uma **barreira de dependência anterior a ACCESS**.
Foi criada em 23/10/2026; o prefixo 20261004 serve à ordenação, não à data de autoria.
As 12 migrations históricas permanecem byte a byte intactas.

Ela aceita somente cinco fingerprints estruturais auditados em PostgreSQL 16:

| Estrutura | Fingerprint MD5 do JSONB de catálogo | Ação |
|---|---|---|
| Legado físico | `0369b3ae642f17e376aee28b8c291277` | Reconciliação transacional |
| Baseline atual recém-aplicado | `5adf61f6f41e6028cff1305e3baa7a42` | No-op verificado |
| Target completo / HOMO | `bc5eaf3cf5026cbf00f2dbfab8ef833d` | No-op verificado |
| Legado reconciliado, antes do ACCESS | `1eef3f2d2ddb08d2a6a5cacb4c067944` | No-op verificado |
| Legado reconciliado, depois do ACCESS | `473c918a3f059a4a410c6702c564fa56` | No-op verificado |

O checksum estrutural é um detector de drift, não uma assinatura criptográfica de confiança.
`catalog.sql` descreve sua construção. Além dele, são verificados ledger/checksums,
ausência de migration não resolvida, proprietário/ACL da view, preservação dos dados e FKs.
Não substituir fingerprints para forçar uma execução: repetir inventário/revisão/laboratório.

UUIDs viram TEXT por cast explícito, sem trocar o valor. CHECKs mantêm a representação UUID
canônica das colunas originalmente UUID; defaults continuam gerando UUID. A view Power BI
continua retornando seu ID como UUID. Somente seu grant preexistente de SELECT a
`powerbi_reader` é restaurado; nenhum role é criado pela migration. ACL inesperada aborta.
Todos os timestamps legados mantêm fuso/precisão. Não há backfill de colunas relacionais novas.
Importações históricas, funções, triggers, checks financeiros, sequência e ações de FKs legadas
permanecem. Não usar `db push` ou um diff automático para apagar essas diferenças intencionais.

Locks: `ACCESS EXCLUSIVE` nas tabelas públicas durante a transação; espera de lock 5s e
statement timeout 5min. A janela e o espaço para rewrite/índices devem ser medidos antes de
qualquer promoção. Falha de DDL/dados reverte a transação; o ledger Prisma pode registrar falha
e deve ser investigado, nunca resolvido automaticamente.

## Reproduzir o laboratório no Windows / Docker Desktop

Não usa `.env.local`, credenciais ou banco DEV. Rede interna, sem portas publicadas.
Os nomes abaixo são exclusivos do laboratório; se já existirem, inspecione os labels e use-os
somente se pertencerem a esta Fase 2A. Não remova ou substitua containers desconhecidos.

```powershell
docker network create --internal 10s-phase2a-lab
docker run -d --name 10s-phase2a-pg --network 10s-phase2a-lab --label purpose=phase2a-isolated-lab -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=phase2a_empty postgres:16.15-alpine@sha256:f4610795587492cd4fb887c2dc3de301b813278bb6f616992061141b5f15ac36
# Builder Linux com dependências do package-lock aprovado; não conecta a banco no build.
# SOURCE_COMMIT deve ser o HEAD completo revisado. Use contexto Git archive limpo, como ops/security/build-clean.ps1.
docker build --target builder --build-arg SOURCE_COMMIT=<SHA_COMPLETO> --build-arg SOURCE_BRANCH=fix/schema-reconciliation-phase2a -t 10s-phase2a:builder <CONTEXTO_GIT_ARCHIVE_APP>
docker run -d --name 10s-phase2a-node --network 10s-phase2a-lab --label purpose=phase2a-isolated-lab --entrypoint sleep 10s-phase2a:builder infinity
# A partir de app; diretório de evidência privado, fora do Git.
node scripts/schema-reconciliation/run-lab.mjs --local-docker-lab C:\Users\ricar\Documents\Codex\phase2a-evidence\nova-rodada
node scripts/schema-reconciliation/run-http-lab.mjs --local-docker-lab C:\Users\ricar\Documents\Codex\phase2a-evidence\nova-rodada <IMAGEM_RUNTIME_LOCAL_REVISADA>
```

`trust` é somente para esse cluster descartável dentro da rede Docker interna, jamais HOMO/PROD.
O runner recusa contexto Docker remoto, rede não interna, portas publicadas, labels errados e nomes
de banco fora do namespace de laboratório. Cria novos bancos por execução; não apaga evidências.
O teste HTTP cria usuários/grants **sintéticos** somente no banco de teste após os checks de zero
concessões das migrations. Senhas aleatórias existem apenas em memória; não há e-mail externo.

As fixtures SQL contêm somente DDL e dados sintéticos. O ledger inicial sintético reproduz
baseline marcado com zero steps e identidade rolled back. Seus INSERTs NÃO são procedimento
operacional para reparar ledger real. Nunca carregar essas fixtures na HOMO/PROD.

Ao encerrar, parar apenas os containers com label `purpose=phase2a-isolated-lab` criados nesta
rodada. Os dumps/evidências privados são preservados. Não limpar volumes de outros ambientes.

## Dry-run de identidade

```powershell
# DATABASE_URL deve ser disponibilizada privadamente pelo operador; não passar na linha de comando.
node scripts/schema-reconciliation/dry-run.mjs NOME_EXATO_DO_BANCO
```

CLI exclusivamente read-only, sem `--apply`. Usa transação REPEATABLE READ / READ ONLY,
confere nome do banco e nunca seleciona senha_hash. Planejador puro não importa cliente DB.
Saída pseudonimizada: referências U/T/G reprodutíveis apenas para o mesmo conjunto ordenado,
papéis/estados, contagens de autoria e motivos. Não persistir entrada com emails/IDs.

Categorias A–E são cumulativas. **E está em todos os grupos**, inclusive A: identidade inequívoca
não equivale a autorização de criar usuário, escolher senha, OWNER, PlatformAdmin, perfil ou membership.
Autoria cross-tenant é preservada, não é um algoritmo de vínculo. A identificação humana dos U/T/G
deve ocorrer em consulta privada autorizada posterior, sem publicar a tabela de correspondência.

## Limitação confirmada

Prisma/JavaScript entrega `Date` em milissegundos; o legado conserva microssegundos.
`updateMany(where: { atualizadoEm: dateJS })` pode não encontrar uma versão que não mudou.
O ensaio retorna `microsecondOptimisticLockMatches: 0`. Não truncar dados para contornar isso.
Bulk/Excel precisam de solução explícita de versionamento e regressão posterior; PROD permanece NO-GO.
