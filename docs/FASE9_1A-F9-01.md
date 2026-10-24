# Fase 9.1A — F9-01 implementado e validado localmente

Estado: **F9-01 IMPLEMENTADO E VALIDADO LOCALMENTE**. Candidato parcial local, **não candidato de promoção**. Base: `5fa0106d80bf0abf6ecc6ca219fbcff63c1359ee`. Branch: `fix/f9-01-historical-backup`.

Sem migration, backfill ou alteração de FK. Sem publicação em HOMOLOG, push, mudança de master ou acesso a PROD. F9-02 e os demais bloqueadores não fazem parte deste commit. A composição de um candidato consolidado depende de decisão posterior.

## Causa e contrato final

O motor tratava qualquer FK para `usuarios` como obrigatoriamente interna ao tenant. Isso bloqueava sete tenants históricos, embora os usuários referenciados existissem e as FKs físicas permitissem a relação. Foram confirmados 31 `lancamentos.criado_por` externos e dois `layouts_colunas.usuario_id` externos.

A exceção agora é restrita a essas duas relações. Autoria/propriedade histórica não concede autorização atual. Outras FKs continuam limitadas ao tenant e a proteção contra efeitos cascata em outros tenants permanece.

- IDs, autoria, proprietário do layout, timestamps, valores, sequência e relações são restaurados sem substituição.
- Usuários externos, identities, memberships, mappings, perfis, PlatformAdmin e SupportOperator nunca são reconstruídos pelo restore.
- O alvo histórico precisa continuar existindo. A operação falha se ele estiver ausente.
- O restore bloqueia a chave do usuário referenciado durante a transação (`FOR KEY SHARE`), sem modificar esse usuário.
- `revisao` avança para invalidar edições anteriores, conforme decisão humana da Fase 9.1A. Não é dado histórico imutável.

`layouts_colunas.usuario_id` continua sendo a chave de proprietário usada pelas consultas existentes. Não houve mudança para tornar automaticamente um layout de outro usuário legado visível após consolidação de identidade.

## Formato 1 → 2

Novos arquivos: **`10s-tenant-backup/2`**. O formato anterior continua detectado como **`10s-tenant-backup/1`**, com compatibilidade restrita e explícita.

O v2 inclui `historicalReferences`:

- `version: 1` (versão do manifesto, distinta da versão do arquivo);
- `instanceId`, `keyId`, `backupId`;
- `bindings`: somente `{table, column, recordId, userId}` para referências externas necessárias;
- `signature`: HMAC-SHA-256.

O tenant já está no corpo autenticado. O manifesto não exporta nome, e-mail, papel, credencial ou tenant de origem do usuário externo. Os únicos IDs de usuário nele contidos já fazem parte das linhas daquele backup.

A assinatura cobre o corpo completo e os metadados/bindings do manifesto, com separador de domínio `10s-tenant-backup-provenance/v1`. Exclui apenas o campo da própria assinatura e o checksum externo para evitar circularidade. O checksum SHA-256 existente continua validando integridade do arquivo completo; recalculá-lo não permite falsificar a assinatura. Comparação de assinatura usa `timingSafeEqual`.

Preview e restore verificam assinatura, origem, chave, bindings exatos, schema, referências atuais, permissões e existência dos alvos. O servidor não oferece endpoint para assinar um arquivo fornecido pelo usuário; só assina snapshots emitidos de dados do banco.

### Arquivos v1

- FKs normais mantêm todas as validações anteriores.
- Referência externa só é aceita se a tupla exata (tenant, tabela, ID do registro, coluna, usuário) ainda existir no banco confiável.
- Se a linha foi excluída ou mudou de autor/proprietário, retorna `HISTORY_UNPROVEN`, com orientação funcional de reconciliação; nenhum usuário/vínculo é inventado.
- Não existe conversão automática v1→v2 nem assinatura de uploads antigos.
- V1 contendo manifesto v2 é rejeitado. Versão desconhecida é rejeitada.
- Remover a assinatura e declarar um arquivo como v1 não preserva a prova: ele volta a exigir o vínculo exato atual.
- Backups v1 de ledger incompatível continuam bloqueados; a compatibilidade de formato não ignora schema.

## Configuração privada necessária antes de qualquer ativação futura

Nenhuma variável foi configurada na HOMOLOG ou em PROD nesta fase. O código falha de modo fechado sem configuração válida; isso é requisito operacional para composição/ativação futura, não autorização para deploy agora.

Configurar exclusivamente em runtime, por gerenciador privado de secrets:

| Variável | Contrato |
|---|---|
| `TENANT_BACKUP_INSTANCE_ID` | Identificador estável desta instalação, diferente entre DEV/HOMOLOG/PROD; 1–80 caracteres alfanuméricos, `_` ou `-`. |
| `TENANT_BACKUP_SIGNING_KEY_ID` | ID da chave ativa para novas assinaturas. |
| `TENANT_BACKUP_SIGNING_KEYS` | JSON privado que associa IDs a chaves de 32 bytes aleatórios, representados por 64 caracteres hexadecimais minúsculos. |

Não usar chave fixa de exemplo, fallback, segredo de autenticação, argumento de build, variável pública ou arquivo versionado. `backupConfig()` lê o keyring apenas em runtime. Reuso literal de NEXTAUTH_SECRET/AUTH_SECRET é recusado. O laboratório usa chaves efêmeras aleatórias em memória; nenhuma chave real foi criada ou persistida por esta implementação.

Rotação: cadastrar a nova chave mantendo as anteriores, trocar apenas o ID ativo, emitir/verificar um backup controlado. Guardar as chaves antigas pelo período de retenção dos backups e validar restauração antes de retirá-las. Uma chave removida ou uma instalação diferente torna a prova inválida. Não há fallback ou migração silenciosa. O keyring deve integrar o backup privado de infraestrutura; não o backup empresarial. Recuperação integral de instalação continua sendo procedimento master, com restauração controlada da identidade da instalação e secrets.

Ausência de configuração retorna `BACKUP_SIGNING_CONFIG`. Prova adulterada retorna `HISTORY_PROOF`; alvo ausente retorna `HISTORY_TARGET_MISSING`. As mensagens não expõem o usuário externo nem segredo. O endpoint de consulta de recibo continua independente da configuração de assinatura.

## Transação, auditoria e concorrência

Preservados: snapshot consistente, ledger explícito de 17 migrations/checksums, limite de 8 MiB, allowlist de tabelas/colunas, documentos privados, igualdade das referências de acesso, OWNER para restore, lock por tenant, prévia stale, backup privado anterior ao replace, restauração atômica e recibo idempotente.

O recibo registra a versão do arquivo restaurado (v1 ou v2). Contém apenas checksums, versão, contagem e attempt; não contém o manifesto, dados de usuário, valores, token ou chave. Timeout/perda da confirmação do COMMIT continua resultado não confirmado; consultar o recibo antes de repetir. A revisão técnica operacional avança e uma sessão anterior recebe conflito.

## Validação realizada

### Laboratório PostgreSQL isolado — 101 verificações aprovadas

Runner versionado: `app/scripts/phase91/restore-lab.cjs`. Exige flag de laboratório, hostname do clone e nome de banco limitado à família `phase91_restore`. Clones privados em rede Docker interna, sem portas publicadas e sem envio de e-mail. Banco fonte: clone já migrado/reconciliado da Fase 9, nunca PROD. Nenhuma migration foi executada.

| Prova | Resultado |
|---|---|
| Restore completo dos 8 tenants, incluindo os 7 antes bloqueados | PASS |
| 31 autorias externas e 2 proprietários de layouts | Preservados |
| Linhas de T04 apagadas na cópia de teste e recuperadas pelo v2 | PASS |
| Mesmo arquivo v1 sem linha atual suficiente | Bloqueado |
| IDs, timestamps, seq, valores e relações, excluindo só revisão técnica | Iguais antes/depois |
| Digests dos tenants vizinhos | Iguais |
| Tabelas de identidade/membership/perfis/mappings/usuários/grants | Digests iguais |
| Dados empresariais/usuários externos no conteúdo exportado | Ausentes |
| Manifesto, autoria, proprietário, assinatura e lista de referências adulterados | Preview e restore rejeitados |
| Alvo inexistente com arquivo de teste autenticado pelo emissor do laboratório | Consulta real ao PostgreSQL rejeita |
| Falha SQL após DELETE e antes de INSERT | Rollback integral; sem recibo de sucesso |
| COMMIT concluído com confirmação perdida | Recibo recuperável; retry não repete restore |
| Revisão técnica após restore | Avança |
| Sessão autenticada antes do restore tentando PUT com revisão antiga | HTTP 409; nenhum valor alterado |
| Key lock do usuário histórico e concorrência de writer no tenant | Bloqueios confirmados |
| Prévia stale | Rejeitada |
| Fixtures sintéticas NULL/zero previsto/status automático | Restore preserva contrato |
| MEMBER, PlatformAdmin sem vínculo, membership/identity inativos | Restore/backup negados conforme o guard |
| Tentativa HTTP de entrar em outro tenant após restore | HTTP 403 |
| Auditoria | Metadados limitados ao recibo técnico |

Para testar sessão HTTP, a credencial de uma identidade já existente foi substituída por credencial sintética aleatória **somente na nova cópia descartável**, antes do baseline de comparação. Nenhuma identity ou membership foi criada. Senhas reais não foram testadas. As rotas de auth/lançamentos usadas são as inalteradas da imagem-base; o motor de backup novo foi executado diretamente contra a mesma cópia. Não foi feito deploy da aplicação nova nem aceite visual/HTTP do novo endpoint de backup nesta rodada.

A primeira execução interrompeu no harness: a asserção de rejeição v1 fornecia uma prévia inválida e recebia `STALE_PREVIEW` antes da validação pretendida. Corrigido apenas o harness para apresentar uma prévia legítima. Segunda execução: 88 checks; terceira, ampliada para locks/isolamento: 100 checks. Na revisão foi identificado que o teste HTTP antigo enviava a revisão sem prefixo `v1:`, podendo obter 409 por formato. A quarta execução corrigiu essa prova: token válido aceito antes do restore (HTTP 200), o mesmo token recusado depois com a mensagem específica de conflito, sem alteração de dado. Resultado final: **101 checks**. As execuções anteriores não são usadas para comprovar stale write. Evidências anteriores preservadas. Containers de teste foram parados; cópias privadas mantidas.

### Verificações locais

- 37 testes aprovados: formato/proveniência, access-policy, correlação segura de auditoria, navegação administrativa, contrato operacional/concorrência e campos opcionais de lançamentos.
- TypeScript: aprovado (`node node_modules/typescript/bin/tsc --noEmit`).
- Build Next.js com Webpack: aprovado, 111 páginas processadas, banco explicitamente inacessível e e-mail desabilitado durante build.
- `git diff --check`: aprovado.

Limitações de ambiente registradas: a primeira tentativa Turbopack falhou ao criar junction no Windows; Webpack sob sandbox falhou com EPERM. Webpack fora dessa restrição concluiu. Permanecem avisos preexistentes de middleware/depreciação. Um teste antigo específico do banco DEV local (`tenant-isolation.test.mjs`) não conseguiu conectar por EACCES; não foi executado contra outro banco nem marcado como aprovado. Dois testes antigos dependentes de opt-in de sessão ficaram SKIP. A suíte final de 37 testes não depende desses fixtures DEV, e os guards/isolamento exigidos nesta fase foram provados no clone autorizado.

## Arquivos do pacote

- `app/src/lib/backup/provenance.mjs`: emissão/verificação e configuração.
- `app/src/lib/backup/engine.mjs`: exceção exata, verificação e key locks.
- `app/src/lib/backup/format.mjs`: versões explícitas e detecção de manifesto.
- `app/src/lib/backup-service.ts`: configuração runtime privada.
- `app/.env.example`: nomes e contrato, sem secrets.
- `app/tests/backup-provenance.test.mjs`: casos adversariais.
- `app/tests/backup-format.test.mjs`: mantém cobertura explícita do formato legado.
- `app/scripts/phase7/tenant-lab.cjs`: emissor de fixture compatível com v2; não executado nesta rodada contra banco histórico.
- `app/scripts/phase91/restore-lab.cjs`: provas de restore histórico e concorrência.
- Este relatório e evidência técnica minimizada em `docs/evidence/f9-01-lab.json`.

Sem alteração de Prisma/schema/migrations, endpoints de autoria/layout, consultas de Power BI, contrato Excel ou regras financeiras. Dados e backups reais derivados do clone, mapping privado, keyring e credenciais não fazem parte do Git.

**Parada:** commit local parcial apenas. Não publicar em `origin/homologacao`, não promover, não iniciar F9-02. A ativação operacional e a composição do candidato consolidado continuam pendentes de decisão posterior.
