# Fase 7 — contrato de recuperação v1

## Dois mecanismos independentes

Backup empresarial: `/backups`, JSON `10s-tenant-backup/1`, até 8 MiB; somente o tenant selecionado na sessão. Download privado/no-store. Restore exige origem HTTP oficial, membership ativo OWNER, prévia atual e confirmação explícita do destino. PlatformAdmin e SupportGrant não dão acesso ao backup empresarial. OWNER possui os direitos essenciais `sistema.backup.view/create/restore` da própria empresa. Outros perfis podem receber view/create explicitamente; restore continua exclusivo de OWNER. Nenhum perfil existente é alterado pela migration.

O catálogo `src/lib/backup/catalog.mjs` é a lista fechada dos 21 conjuntos restauráveis e suas colunas/FKs. Ordem de inserção: áreas → centros → categorias → contas → fornecedores → clientes → DRE → dados bancários → empresas → pessoas → grupos → tipos → linhas → produtos → sequências → status de tarefas → tarefas → status manuais → layouts → lançamentos → recibos de importação. Remoção na ordem inversa. IDs originais e sequências empresariais preservados.

Tenant: apenas logo e título da tabela de status são restauráveis; slug, nome, plano, ativo e governança permanecem. Usuários legados, AuthIdentity, PlatformAdmin, mappings, memberships, perfis e responsável contratual são preservados. O arquivo contém referências do próprio tenant sem credenciais; divergência nessas referências interrompe a operação e exige reconciliação explícita. Não recria memberships, não restaura permissões antigas e não reativa convites/grants. Clone e merge ficam fora deste contrato.

AuditEvent, AccessOwnerEvent, SupportGrantEvent e TermAcceptance permanecem append-only. Convites e grants não são rebobinados. ImportOperation é operacional, acompanha os dados empresariais para que os recibos correspondam ao estado restaurado; não substitui auditoria. Tarefas e layouts também fazem parte do backup.

## Consistência, concorrência e integridade

Geração em transação PostgreSQL REPEATABLE READ READ ONLY. JSON canônico mantém ordem dos arrays/duplicatas; checksums SHA-256 por seção e global. Manifesto inclui tenant, data UTC, SHA da aplicação, versão, migrations/checksums, contagens, referências documentais e exclusões. Checksum detecta corrupção, não autentica a origem de um arquivo: quem restaura precisa confiar na procedência e já possuir autorização de OWNER.

Restore em uma transação READ COMMITTED, com lock advisory exclusivo adquirido antes de ler o estado. A migration `20261024_z_tenant_restore_lock` adiciona um trigger de lock compartilhado por tenant em todas as tabelas com tenant_id, incluindo `layouts_colunas`, e na raiz `tenants`. Gravações existentes impedem o início; novas escritas concorrentes não atravessam o lock exclusivo. Outro tenant continua independente. Não há bypass de sessão nem lock global de tabelas. Leituras podem continuar vendo o estado anterior até o commit.

Prévia registra digest do estado atual; qualquer mudança empresarial/referência após ela exige nova prévia. Identidade, membership e tenant do operador são revalidados e mantidos com row locks durante o restore. FKs de coluna simples legadas também são verificadas por tenant, inclusive referências entrantes que poderiam causar SET NULL fora da empresa. Conflitos de ID/constraint causam rollback integral.

Antes dos DELETEs, uma cópia do estado atual é gravada com `wx`, modo 0600 e flush no volume privado `TENANT_BACKUP_DIR`, e relida/verificada. Falha em salvar impede a restauração. Diretório deve ser absoluto, persistente, fora de public/.next e pertencente ao UID 1001. Sem configuração, restore falha fechado. Nenhum backup entra no Git/imagem.

Revisões técnicas de lançamentos avançam acima das versões anteriores e do instante atual: abas antigas não podem sobrescrever o estado restaurado com CAS antigo. Igualdade de A considera dados de negócio; `revisao` deliberadamente muda. Atualizações concorrentes que aguardem locks não devem ser interpretadas como restauração parcial.

O recibo `TENANT_RESTORE_COMPLETED` usa UUID da tentativa como ID único de AuditEvent e é inserido na mesma transação. Repetição da mesma tentativa concluída retorna o recibo sem executar novamente. Falha de transporte/timeout significa **resultado não confirmado**, não rollback presumido; consultar `/api/backups?attempt=<uuid>`. Ausência momentânea de recibo não autoriza repetição automática. Rejeições conhecidas e pedidos inválidos recebem eventos sanitizados, sem payload, senha ou token.

## Storage

Hoje documentos/versões/PDFs são globais. Backup empresarial inclui somente referências às versões relacionadas aos aceites do tenant/memberships, com chave lógica UUID.pdf, tamanho, versão e SHA-256. Não altera arquivo jurídico global nem reescreve aceite. Hash/tamanho são conferidos no volume; symlinks/paths arbitrários são rejeitados. Arquivo ausente exige recuperar o storage global pelo procedimento master antes do restore empresarial. Não há arquivo exclusivamente empresarial no schema atual; futuros anexos exigem evolução do contrato.

Backup master usa pg_dump custom e arquivo separado dos PDFs. O dump contém dados confidenciais e hashes de autenticação necessários à recuperação integral. Não é um export empresarial. Exige acesso operacional restrito, armazenamento privado e criptografia no repositório externo de backups. Configuração comum contém só nomes dos secrets necessários, URLs/mode/volumes/versão; nenhuma senha SMTP/DB, NEXTAUTH_SECRET, token bruto ou chave TLS. Cofre externo separado é responsabilidade operacional.

## Procedimento master HOMO

Ferramenta: `ops/backup/homolog-master.py`. Somente VPS autorizada; guardas fixas do container PostgreSQL exclusivo e DB `gestar_financeira_homolog`, app UUID HOMO, branch, URL, modo identity e SHA/migrations informados. Não usa gestar_app, não escreve em produção.

1. Confirmar SHA implantado e quantidade de migrations; executar a ferramenta com `--expected-sha <SHA>` e `--migrations 16`.
2. Arquivos privados em `/root/phase7-homo-private/<UTC>`: dump, lista validada por pg_restore, manifesto sem secrets, arquivo de storage e resultado com SHA-256.
3. Restaura em banco **novo** `phase7_restore_<UTC>`, compara todas as tabelas/digests e catálogo, restaura PDFs em diretório novo, confere hash e leitura pelo UID da aplicação.
4. Banco restaurado fica com conexões desabilitadas após o ensaio. Nunca alterar DATABASE_URL da aplicação ativa para esse banco.
5. Ensaio funcional adicional deve subir aplicação isolada apontando apenas ao banco restaurado, storage restaurado, URL interna e secret de sessão temporário; SMTP desabilitado/sem egress. Conferir login público, providers, Prisma e PDFs. Parar o container de ensaio ao terminar.

O dump é um snapshot consistente do PostgreSQL. Se a comparação com a origem detectar atividade concorrente posterior ao snapshot, o ensaio deve falhar e ser repetido em janela quieta, sem fingir equivalência. Roles/owners são inventariados sem senhas. Em outro cluster, provisionar roles compatíveis antes do pg_restore; não executar SQL de roles sem revisão.

## Retenção e rollback

Sem scheduler ou limpeza automática nesta fase. Política proposta: últimos 7 backups diários e 4 semanais, mínimo 30 dias para snapshots pré-restore, exceção de retenção para incidentes abertos. Limpeza futura apenas após nova cópia restaurada/validada, manifesto e confirmação de que não é o último ponto recuperável; nunca apagar evidência de auditoria. Destino externo criptografado e teste periódico de DR ainda são operação futura.

Rollback de código: reimplantar o SHA anterior somente na HOMO; manter a migration de locks (aditiva e compatível) até revisão, sem resolve/reset. Rollback de dados empresariais: validar a cópia pré-restore pelo mesmo fluxo, assumindo governança/referências compatíveis; caso contrário reconciliar antes. Rollback master: novo banco/storage isolados, restore comprovado, só depois uma mudança de apontamento explicitamente autorizada. Nunca pg_restore sobre banco ativo nem reaproveitar banco de produção.

Limite de 8 MiB é independente do XLSX; conferir `client_max_body_size` efetivo da rota HOMO antes do deploy. Backups maiores exigem procedimento privado, não aumento indiscriminado do limite. Exclusões de dados e casos de reconciliação são exibidos na prévia.

Estado desta documentação: implementação em validação. Encerramento e evidências estão no relatório privado `FASE7-BACKUP-RESTORE.md`. PROD permanece NO-GO; esta fase não autoriza promoção.
