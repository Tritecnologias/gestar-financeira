# Fase 12A — onboarding autônomo do responsável contratual

Base: `a050a3a7bd116187faa984cdc8a3587135c87dc7`. Implementar LOCAL/laboratório, depois HOMOLOG com SHA fixado e aceite humano. PROD permanece em operação persistente e não faz parte das escritas desta fase.

## Contrato

O aceite individual de Usuário precede a decisão contratual. Um Proprietário ativo pode escolher explicitamente a si próprio quando a empresa não possui responsável válido, ou indicar outra pessoa pelo convite multicanal. OWNER não implica responsabilidade contratual; indicação não implica acesso nem aceite.

`tenant_contractual_onboarding` guarda a decisão atual por empresa: SELF/OTHER e PENDING/ASSIGNED/CANCELLED, vínculo do Proprietário que decidiu, convite indicado e vínculo designado quando concluído. A pessoa indicada é a destinatária do convite referenciado; a ativação é comprovada por `acceptedByIdentityId` e pelo vínculo OWNER ativo da mesma empresa, sem inferência por email. FKs compostas impedem referências entre empresas. Histórico permanece na auditoria append-only.

O estado operacional é derivado a cada requisição: termo individual pendente → escolher responsável / aguardar convite / aguardar termos da pessoa indicada → aguardar contratação → contrato ativo. Apenas o responsável OWNER ativo com aceite contratual vigente libera as áreas empresariais. Membro e administrador não podem escolher/indicar responsável. Assessoria, suporte e PlatformAdmin não recebem bypass nem responsabilidade implícita.

Designação manual da Plataforma permanece como contingência, sob o mesmo lock da empresa e sem gerar aceite. Uma designação válida não será sobrescrita automaticamente. Nenhum responsável, aceite ou dado preexistente é apagado. Não há backfill; empresas já válidas continuam válidas.

## Schema e backup

Migration incremental `20261028_contractual_onboarding`, com locks/timeouts e guarda do ledger2 original. Nenhuma migration histórica/baseline é editada. Acrescenta dois enums, uma tabela de estado de acesso e a chave composta de convite necessária às FKs. Runtime recebe apenas SELECT/INSERT/UPDATE na tabela nova; sem DDL, DELETE ou escrita no ledger.

O backup continua `10s-tenant-backup/3`. O estado de onboarding é referência somente leitura de autorização, não seção empresarial restaurável. Restore não recria convite, acesso ou designação; divergência nas referências falha fechado. O ledger explícito exige três migrations. SHA-256 do SQL definitivo: `c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60`. Backups de ledger anterior não são convertidos nem reassinados silenciosamente; o usuário deve gerar um novo backup nesta instalação após a atualização. Dumps/volumes privados anteriores permanecem material de rollback/DR, não upload lógico para o novo contrato.

## Preservação e provas

Sem alteração de PDFs, conteúdo, versões, hashes, requiresReaccept, cadastro pessoal, telefone/WhatsApp, pagamento, SMTP, Relatórios/Lançamentos ou PROD. Reusar geração, hash, expiração, reemissão, revogação, compartilhamento e ativação dos convites existentes.

Provar cenários SELF, OTHER, indicado novo/existente, MEMBER previamente ativado, bloqueio antes/liberação após contrato, expiração/revogação, concorrência, cross-tenant, revogação durante sessão, continuidade dos tenants válidos, backup/restore com referências e ausência de segredo em registros/logs. Depois de LOCAL verde: build/TypeScript/artifact, backup/restore da HOMOLOG, migration pelo migrator, grant mínimo na tabela nova, deploy fixado e smoke sintético. Parar para Ricardo validar desktop/mobile e Claro/Escuro. Não há GO PROD automático.

## Resultado LOCAL

- 42 testes unitários/de segurança passaram, sem skips: termos, autorização, backup/proveniência, senha/sessão, assessoria, suporte e offboarding.
- `contractual-onboarding.http.cjs`: cenários A–G em PostgreSQL18.6/Prisma/HTTP reais; duas escolhas concorrentes produzem um vencedor e um conflito; FKs rejeitam convite/designação entre empresas. Usuário sem contrato recebe 428 nas APIs empresariais. Inativação de responsável/identity/empresa bloqueia a próxima requisição. Contingência PlatformAdmin não fabrica aceite.
- A suíte compara todos os campos dos vínculos e recibos de um tenant válido criado na imagem anterior, sem ordenar artificialmente o resultado de SELECT: conjuntos são comparados por ID. Nada foi regravado e nenhuma linha de onboarding foi criada para esse tenant; ele continua ACTIVE.
- Backup/preview/restore/replay também passaram pelos handlers compilados da imagem Linux, no tenant sintético da própria suíte. O motor foi provado separadamente com NULL/zero/centavo, autoria e layout históricos externos, tampering, ledger anterior, rollback intermediário, recibo, revisão avançada, stale write e digest do vizinho intacto. O estado corrente de acesso foi preservado.
- Navegador real: ativação com senha própria de teste, leitura/aceite integrado dos PDFs atuais, Sou eu, Outra pessoa (somente nome/email), copiar/WhatsApp sem mensagem real, link não recuperável, indicado reconhecido sem novo seletor, sessão do solicitante liberada sem novo login. Desktop 1366 e mobile 414×896, Claro/Escuro, sem overflow horizontal e alvos de pelo menos 44px.
- TypeScript Linux, build Linux completo e `ARTIFACT_POLICY_PASSED`. Nenhuma mudança no motor financeiro ou em PDFs/versões jurídicas.

Uma identidade que já é membro da mesma empresa não é promovida implicitamente por um convite; exige revisão administrativa. Uma indicação aceita continua representando a decisão explícita registrada, mesmo se seu emissor sair depois; designação exige que o destinatário esteja ativo como Proprietário e tenha aceitado seus próprios termos. Revogar/substituir a indicação cancela esse propósito, sem apagar memberships ou histórico já existentes.

## Janela HOMOLOG e rollback

Somente após LOCAL verde: fixar SHA; confirmar refs, app/banco/host/schema e fila vazia; backup completo privado de banco e volumes com SHA-256; restaurar dump em PostgreSQL18.6 sem rede/portas/SMTP e comparar tabelas; aplicar incremental pelo migrator separado; executar `scripts/contractual-onboarding/runtime-acl.sql` com o runtime da HOMOLOG; conferir zero failed/pending, ownership do migrator, ACL restrita e ausência de backfill. Auto-deploy permanece desligado. Publicar somente o SHA fixado na aplicação HOMOLOG, com SOURCE_COMMIT/digest conferidos; smoke usa somente novos tenants/identidades sintéticos e encerra seus acessos preservando auditoria.

O grant operacional está intencionalmente limitado a LOCAL/HOMOLOG. Uma futura promoção PROD exige autorização própria e guarda/ACL apropriadas; esta fase não publica nem migra PROD. Master permanece na base.

Rollback: não executar down migration improvisada nem apontar o app antigo para o banco atualizado (seu contrato de backup exige ledger2). Preservar imagem antiga, dump e volumes. Se necessário, parar a janela, restaurar os materiais verificados em banco/volumes de recuperação isolados e só então autorizar cutover da HOMOLOG com o artefato anterior. Nenhum rollback é executado automaticamente e nenhuma auditoria é apagada.

As evidências de execução e o SHA/digest efetivamente publicados ficam no checkpoint privado `phase12a-contractual`. Aceite manual de Ricardo permanece pendente: Sou eu; Outra pessoa; indicado; bloqueio/liberação; mobile; Claro/Escuro. Nenhum aceite humano foi fabricado. Não há GO PROD nesta fase.

## Refinamento de UX de Outra pessoa — 28/10/2026

Ricardo confirmou o fluxo manual Sou eu e o funcionamento da indicação/bloqueio em Outra pessoa. Pediu refinamento visual antes de prosseguir com o aceite do indicado. Não presumir que o teste humano da ativação/contratação do indicado já foi realizado.

Somente nesse onboarding, a ação é Enviar convite e a confirmação mostra Nome, E-mail, Empresa e Validade. O título Convite pronto para compartilhar não afirma entrega. Enviar pelo WhatsApp apenas solicita a abertura do canal manual, sem confirmação de envio/entrega. Copiar link fecha após sucesso; falha de clipboard mantém a confirmação aberta e permite nova tentativa. Fechar também retorna ao onboarding, descartando o link da memória da interface; exposição única, expiração e demais proteções permanecem intactas.

Após fechar, a tela mostra Aguardando aceite do Responsável Contratual, nome/e-mail e as ações permitidas pelo estado atual: Enviar novamente usa a reemissão já existente; Trocar responsável confirma a intenção e chama a revogação já existente antes de reapresentar a escolha. Cancelar essa confirmação não modifica o convite. Não são introduzidos novos privilégios nem troca forçada após ativação/designação. A variante administrativa continua exibindo Função/Perfil e mantendo seu fechamento explícito.

Nenhuma API, token, role OWNER, termo, regra contratual, migration ou contrato de backup foi alterado. Provas LOCAL: sete testes de links/estado contratual, TypeScript Linux e navegador real com 12 verificações de jornada/UX, incluindo os dois presets e 414×896/1366×864. O navegador usa somente quatro logins sintéticos por rodada, mantendo margem na janela compartilhada antes do aceite humano. Evidências da janela de UX em `phase12a-ux-other`; publicar somente SHA fixado na HOMOLOG após build/artifact e pedir novo aceite visual. PROD/master permanecem fora desta publicação.
