# Convites especiais — piloto LOCAL/HOMOLOG

Autorização de Ricardo: tabela independente, adequação de backup/migration, prévia derivada da landing e publicação somente em HOMOLOG. Não integra Fase 13. PROD, landing pública e dados da Izilda ficam fora do escopo.

## Aceite obrigatório pela interface

1. Ricardo entra em HOMOLOG com sua conta PlatformAdmin existente.
2. Administração da Plataforma → Convites Especiais → informa Bruno Lourenço (persona fictícia), validade e Criar convite.
3. Copia o link apresentado na própria interface. O segredo é exibido somente nesta criação; não fica em listagens, logs ou armazenamento do navegador.
4. Abre uma janela anônima e cola exatamente esse link.
5. Confirma as boas-vindas, navega pela prévia e usa Quero experimentar a plataforma.
6. Volta ao painel e Atualizar lista: a data do interesse é verificável. Revogar invalida novas interações, inclusive de uma página já aberta.

O interesse não envia e-mail, não cria conta/tenant/membership, não autentica e não representa aceite jurídico. Para acesso operacional, permanece necessário o procedimento existente de convite de acesso, perfil/tenant autorizados, senha individual e aceites Fase 12A. Não existe cadastro público autônomo. Esta rodada entrega a jornada administrativa → landing → interesse; não libera plataforma ao destinatário por consequência desse interesse.

## Fonte da landing

Fonte oficial fixada em ed17a4407949479ca1d8407feeef8704bd9e0451. `app/scripts/experiment/sync-landing.mjs` lê os blobs Git, gera `official-landing.ts` e os ativos com hashes em `public/experimentacao/assets/provenance.json`. Não editar o conteúdo gerado. A landing pública não recebe alteração. Na prévia apenas URLs de ativos e acesso são adaptados para HOMOLOG; canonical oficial permanece, com noindex/nofollow, cache desativado e referrer bloqueado. O modal usa JS externo e CSP limitada à mesma origem.

## Segurança e habilitação

Exige `SPECIAL_INVITATIONS_ENABLED=true`, origem e banco exatos de HOMOLOG, ou laboratório `special_invite_lab` com origem localhost:3020. Banco PROD e quaisquer combinações diferentes falham fechadas. A administração exige PlatformAdmin ativo no servidor e nas transações; não usa permissions empresariais. Tokens aleatórios de 256 bits, somente SHA-256 armazenado, prazo máximo 168h, link com fragmento removido ao abrir. API pública devolve apenas primeiro nome e confirmação de estado; Origin obrigatório. Nenhum contato pessoal é coletado. Não vincular o registro a identidades operacionais por e-mail/nome.

## Migration, backup e recuperação

Migration aditiva `20261029_experiment_invitations`, guarda ledger3 exato/checksums, sem backfill ou UPDATE em tabelas existentes. ACL runtime limitada a SELECT/INSERT/UPDATE da tabela nova, sem DELETE, DDL ou escrita no ledger. Migration sob role migrator separada.

Antes de migrar: dump completo e volumes privados, verificar integridade, restaurar dump em laboratório isolado e comparar tabelas. Guardar evidências sem dados pessoais. Comparar hashes de tabelas empresariais/acesso antes/depois para assegurar preservação.

Convites globais ficam fora do backup/restauração de tenant e dentro do dump completo do ambiente. Formato operacional v3 permanece porque suas seções/referências não mudam. Aceitar apenas ledger3 exato ou ledger4 exato; restaurar backup autêntico ledger3 em runtime ledger4 é a única compatibilidade nova. Reverso, históricos desconhecidos e checksums diferentes continuam bloqueados. A restauração nunca recria ou remove convites especiais, acessos ou aceites.

Rollback preferido: desabilitar o piloto, preservando tabela e contrato compatível. Voltar ao binário anterior exige reconciliação do ledger4 com seu contrato ledger3; não fingir compatibilidade. Se necessário rollback integral, suspender escritas de HOMOLOG e restaurar snapshot validado em procedimento controlado, considerando escritas posteriores. Não executar rollback em PROD.

## Testes

Política de ambiente e validade; checksums e compatibilidade de backup; fidelidade dos ativos; HTTP real de criação/listagem/revogação/interesse; bloqueio anônimo e usuário sem PlatformAdmin; erro de Origin; ausência de concessão de acesso; persistência e idempotência de interesse; expiração/revogação em página aberta; desktop/mobile/teclado; regressão contratual e preservação das tabelas existentes. Usar só fixtures sintéticas em laboratório. Criar convites de aceite pela interface, não por SQL/script.
