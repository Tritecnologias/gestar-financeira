# Fase 11B — Acesso de Assessoria e cenário sintético

Estado: implementação e provas LOCAL concluídas; publicação HOMOLOG e aceite manual pendentes. Nenhuma autorização de publicação PROD ou provisionamento real nesta rodada.

## Contrato

Assessoria é uma autorização própria entre tenant e AuthIdentity ativa. Não cria Usuario, Membership, perfil, PlatformAdmin ou SupportOperator. A escolha explícita de contexto não soma permissões de outros vínculos. Identidade, tenant, status, início, validade opcional e revogação são revalidados nas requisições; as permissões são reconsultadas no servidor. Endpoints fora da lista empresarial falham fechados.

OWNER concede/revoga. ADMIN/MEMBER dependem da permissão explícita de gerenciar assessoria e só podem delegar permissões que já possuem. O cadastro não provisiona a identidade destinatária. Escopo é uma lista explícita de permissões das telas Ação, Estrutura Empresa e Fluxo de Caixa; governança, credenciais, backups, suporte e administração global não são delegáveis por esse contrato.

Finalidade, aprovador, datas e permissões ficam imutáveis após a concessão. Alteração exige revogação e nova autorização. Não há exclusão/reativação de grants. Expiração bloqueia o uso; revogação bloqueia a próxima requisição inclusive em sessão já emitida. O histórico permanece.

Múltiplos OWNER continuam permitidos. Responsável contratual é uma designação separada e única. Assessoria pode aceitar termos individuais próprios; não aceita contrato pela empresa nem assume responsabilidade contratual.

## Autoria e auditoria

Novos lançamentos feitos via assessoria usam `criado_por_identity_id`; layouts usam `identity_id`. As referências legadas existentes continuam intactas. Constraints impedem dois autores/proprietários simultâneos. A referência histórica nunca autoriza acesso atual.

O modo `ADVISORY` registra identidade, tenant, grant, rota/operação, resultado HTTP e horário, sem corpo, parâmetros, cookies ou credenciais. Há registro durável de autorização antes do handler e registro do resultado depois. Falha de auditoria depois de possível gravação informa resultado não confirmado, sem presumir rollback nem recomendar repetição cega. Auditoria continua append-only.

## Migration e backup

Migration incremental: `20261027_z_advisory_access`, após `20261027_pg18_baseline`. SHA-256 do SQL: `29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2`.

Exige PG18 e checksum exato da baseline, transação, lock timeout de 5s e statement timeout de 60s. Não contém backfill nem provisionamento. Runtime recebe somente ACL necessária da nova tabela; não recebe DDL, ownership, DELETE de grants ou escrita no ledger. Migrator permanece separado.

Formato permanece `10s-tenant-backup/3`, com contrato explícito de duas migrations e novas colunas de autoria. Backups da baseline isolada são incompatíveis; não converter nem reassinar. HMAC/proveniência, referências históricas, revisão técnica, idempotência e isolamento permanecem. Grants, identidades, memberships e auditoria não fazem parte das tabelas restauráveis. IDs/status de identidades referenciadas são usados somente para reconciliação fail-closed; credenciais não são exportadas. Uma revogação não é desfeita por restore empresarial.

Antes da HOMOLOG: snapshot privado novo de banco/volumes e prova de restauração isolada, guarda de ambiente, migration com migrator e ACL mínima. Rollback estrutural exige snapshot e artefato anterior coordenados; não executar aplicação antiga sobre schema novo como rollback presumido.

## MODO DEV — CENÁRIO PADRÃO V1

Fixture versionada em `app/scripts/fixtures/modo-dev-v1.cjs`: cadastros, centro de custo, categorias, contas, cliente/fornecedor e sete lançamentos sintéticos com ausência, zero, centavo, previsto e realizado. Recibo determinístico impede reaplicação e sobrescrita de edições posteriores. IDs incorporam o tenant, sem compartilhar ambientes.

Execução nesta fase aceita somente `phase11b_lab` e `gestar_homolog_pg18`, em tenant MODO DEV existente e com OWNER ativo explicitamente informado. PROD é bloqueada. A extensão futura para PROD depende de nova autorização e revisão; nenhum tenant real ou pessoa real será criado por este carregador.

## Validação e aceite

Resultados locais: 221 testes unitários/regressivos passaram, zero falhas; quatro testes legados dependentes de outras bases não executados. Isolamento Prisma real passou separadamente no PG18 com runtime restrito; a limpeza de tenants sintéticos usa canal de laboratório separado, sem ampliar ACL do runtime.

Doze provas HTTP passaram: capacidades globais sem acesso empresarial; dois OWNER; gestor delegado limitado; isolamento; concessão sem membership; CRUD/zero/conflito; layouts por identidade; bloqueio de governança/backup; exportação autorizada; revogação na próxima requisição; escopo somente leitura; saída/troca explícita de contexto.

Dez provas de backup passaram: referências históricas externas sintéticas e autoria por identidade; v3/ledger exato; adulteração rejeitada; contrato antigo rejeitado; falha intermediária com rollback atômico; restore/replay sem recriar acessos; NULL/zero/centavo; proteção da auditoria/histórico/DDL; correlação de ator, tenant, autorização e resultado. Digests de acessos e tenant vizinho permaneceram iguais.

Sete provas de navegador/HTTP passaram: concessão na UI, login com escolha explícita de assessoria, lote e importação I1 com replay, stale write pós-restore 409, Claro/Escuro desktop/mobile, revogação na UI e início futuro bloqueado. Duas provas adicionais injetaram falha de auditoria: antes da operação bloqueou escrita com 503 sanitizado; depois do commit retornou resultado não confirmado, sem alegar rollback falso.

Build Linux, TypeScript e artifact verifier aprovados. Revisão estrutural confirmou que os corpos de 55 endpoints empresariais permanecem iguais fora do wrapper de auditoria; integrações de autoria/contexto/termos revisadas separadamente. Importador legado aposentado permanece 410 sem consultar banco. Nenhum teste foi afrouxado para obter PASS.

Proteção pré-HOMOLOG em 27/10: snapshot privado de banco/volumes, restore em container PG18 temporário sem rede e comparação exata das 39 tabelas concluídos. Segredos, hashes de autenticação e arquivos de backup permanecem fora do Git. Evidências operacionais privadas em `phase11b-advisory`; localização VPS `/root/phase11b-advisory-private`. Nenhuma alteração em PROD.

HOMOLOG terá aceite manual curto. A classificação final não autoriza PROD.

## Próximo provisionamento — não executar nesta fase

Após autorização futura de PROD, solicitar em um único bloco e-mails de Izilda, Thaís, André, Charles, Denise, Beatriz, Rafael e Wanderson; confirmar papel/perfil operacional de Denise e escopos dos membros. Não inventar endereços. Ricardo na HIGH será assessor autorizado pelo OWNER, não membership artificial. Conta institucional continua sem acesso empresarial automático. Wanderson terá contrato técnico separado, sem PlatformAdmin ou membership permanente em cliente.

Tiago permanece backlog. Documentação jurídica final, cofre/DR, landing page, preferências de filtros e F9-07 estão fora do escopo.
