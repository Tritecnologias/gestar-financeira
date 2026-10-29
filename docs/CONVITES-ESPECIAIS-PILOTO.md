# Convites especiais — piloto LOCAL/HOMOLOG

Autorização de Ricardo: tabela independente, adequação de backup/migration, prévia derivada da landing e publicação somente em HOMOLOG. Não integra Fase 13. PROD, landing pública e dados da Izilda ficam fora do escopo.

## Aceite obrigatório pela interface

1. Ricardo entra em HOMOLOG com sua conta PlatformAdmin existente.
2. Administração da Plataforma → Convites Especiais → informa Bruno Lourenço (persona fictícia), validade e Criar convite.
3. Usa Copiar link na linha da tabela. A recuperação ocorre somente após essa ação explícita do PlatformAdmin; o mesmo link continua disponível após atualizar a página ou iniciar outra sessão, enquanto ativo. Nenhum segredo fica nas listagens ou logs.
4. Abre uma janela anônima e cola exatamente esse link.
5. Confirma as boas-vindas, navega pela prévia e usa Quero experimentar a plataforma.
6. Volta ao painel e Atualizar lista: a data do interesse é verificável em pílula verde. Cancelar (vermelho, com confirmação) invalida o link e desabilita a cópia, inclusive para uma página já aberta. Expiração também bloqueia recuperação e uso no servidor.

Fechar ou usar Escape não confirma nem recusa boas-vindas. Cada abertura do link original ativo sem confirmação reabre automaticamente o modal, mesmo com interesse já registrado. Retomar boas-vindas revalida e reabre na página atual. Retorno pelo cache de navegação também revalida; não remover DOM/token de memória no pagehide. Nenhum token é persistido em localStorage/sessionStorage/cookies.

## Consulta administrativa

O topo, a criação e os filtros permanecem fora da rolagem interna da tabela; os títulos das colunas são fixos. Em telas baixas (até 700px de altura, inclusive zoom elevado), a página também pode rolar para manter os controles acessíveis por toque/teclado. A busca por nome (sem distinção de acentos/maiúsculas) e referência atua nos últimos 100 convites carregados. Situação e manifestação de interesse são filtros independentes e combináveis; atualizar a lista preserva esses filtros e a busca na sessão da página. Cancelados ficam ao final, preservando a ordem do servidor dentro de cada grupo.

Interesse é uma informação separada da validade: pílula verde "Interesse registrado" ou amarela "Ainda não manifestado". Na situação, Ativo usa amarelo sem interesse e verde com interesse; Cancelado permanece vermelho e Expirado neutro, sem apagar o histórico de interesse. As pílulas são retangulares de cantos arredondados. A confirmação de cancelamento usa modal nativo pequeno, nome explícito, foco inicial em Voltar, navegação por Tab e fechamento por Escape sem cancelar. Confirmar mantém o registro, invalida o link pelo endpoint existente e atualiza a tabela. Esses refinamentos não incluem migration, alteração de API ou mudança na criptografia/backup.

## Recuperação cifrada e custódia — LOCAL/HOMOLOG

O hash SHA-256 permanece como validador. A coluna nullable `encrypted_token` guarda somente envelope AES-256-GCM: chave de 256 bits própria de cada ambiente, nonce aleatório de 96 bits, tag de 128 bits, versão e ID da chave. AAD vincula o envelope ao ID e ao hash do convite; a recuperação valida novamente o hash. Nenhum token é armazenado em texto puro. Criar não devolve link; somente POST explícito de PlatformAdmin ativo em `.../[id]/link` devolve o link, com no-store e Origin verificado. Listagem devolve somente flags de disponibilidade, sem token/hash/cifra.

Configuração runtime: `SPECIAL_INVITATION_LINK_KEY_ID` e `SPECIAL_INVITATION_LINK_KEYS` (mapa privado por ID). Sem chave válida, criação/recuperação falham fechadas. Não usar NEXTAUTH_SECRET nem chaves do backup. Não incluir chaves em Git, fonte, build args, logs, dump de aplicação ou backup de tenant. A custódia separada fica cifrada com DPAPI CurrentUser, fora do projeto e dos volumes comuns. Recuperação: operador autorizado recupera o segredo do cofre runtime do ambiente ou da custódia DPAPI sob o perfil Windows autorizado, verifica ID/ambiente e restaura somente as variáveis runtime; testar recuperação de um convite sintético. Se a chave for perdida em todas as custódias, não há recuperação criptográfica; não gerar substitutos silenciosos. Rotação: conservar chaves antigas no mapa até seus convites expirarem; a chave ativa serve para novas cifras. O backup de negócio nunca restaura chaves ou convites globais.

Convites anteriores apenas com hash: não há inversão do hash. A vinculação manual opcional exige o link original do administrador, mesma origem/caminho e token correspondente ao hash. Grava apenas a cifra; não altera hash, validade, confirmações, interesse ou identidade do convite. Sem original, Copiar link fica desabilitado com explicação, sem impedir o uso do link antigo por quem já o possui. Não é obrigatório vincular convites antigos para homologar esta entrega.

Migration `20261029_z_experiment_link_recovery`: coluna aditiva nullable, sem backfill, permitida somente no banco LOCAL do piloto e HOMOLOG após recuperação comprovada de backup. Os históricos exatos 3/4 podem ser restaurados para 5 somente porque as mudanças do piloto são globais e excluídas das seções operacionais. Histórico desconhecido, checksum alterado e restauração reversa continuam bloqueados. Rollback preferido: desabilitar piloto preservando coluna e custódia; retorno ao binário anterior exige reconciliar contrato do ledger e suspender escritas de HOMOLOG. Nunca aplicar em PROD nesta rodada.

O interesse não envia e-mail, não cria conta/tenant/membership, não autentica e não representa aceite jurídico. Para acesso operacional, permanece necessário o procedimento existente de convite de acesso, perfil/tenant autorizados, senha individual e aceites Fase 12A. Não existe cadastro público autônomo. Esta rodada entrega a jornada administrativa → landing → interesse; não libera plataforma ao destinatário por consequência desse interesse.

## Fonte da landing

Fonte oficial fixada em ed17a4407949479ca1d8407feeef8704bd9e0451. `app/scripts/experiment/sync-landing.mjs` lê os blobs Git, gera `official-landing.ts` e os ativos com hashes em `public/experimentacao/assets/provenance.json`. Não editar o conteúdo gerado. A landing pública não recebe alteração. Na prévia apenas URLs de ativos e acesso são adaptados para HOMOLOG; canonical oficial permanece, com noindex/nofollow, cache desativado e referrer bloqueado. O modal usa JS externo e CSP limitada à mesma origem.

## Segurança e habilitação

Exige `SPECIAL_INVITATIONS_ENABLED=true`, origem e banco exatos de HOMOLOG, ou laboratório `special_invite_lab` com origem localhost:3020. Banco PROD e quaisquer combinações diferentes falham fechadas. A administração exige PlatformAdmin ativo no servidor e nas transações; não usa permissions empresariais. Tokens aleatórios de 256 bits, somente SHA-256 armazenado, prazo máximo 168h, link com fragmento removido ao abrir. API pública devolve apenas primeiro nome e confirmação de estado; Origin obrigatório. Nenhum contato pessoal é coletado. Não vincular o registro a identidades operacionais por e-mail/nome.

## Migration, backup e recuperação

Migration aditiva `20261029_experiment_invitations`, guarda ledger3 exato/checksums, sem backfill ou UPDATE em tabelas existentes. ACL runtime limitada a SELECT/INSERT/UPDATE da tabela nova, sem DELETE, DDL ou escrita no ledger. Migration sob role migrator separada.

Antes de migrar: dump completo e volumes privados, verificar integridade, restaurar dump em laboratório isolado e comparar tabelas. Guardar evidências sem dados pessoais. Comparar hashes de tabelas empresariais/acesso antes/depois para assegurar preservação.

Convites globais ficam fora do backup/restauração de tenant e dentro do dump completo do ambiente, com tokens somente cifrados. Formato operacional v3 permanece porque suas seções/referências não mudam. Aceitar apenas históricos 3/4/5 exatos; compatibilidade somente para frente entre essas alterações globais aprovadas. Reverso, históricos desconhecidos e checksums diferentes continuam bloqueados. A restauração nunca recria ou remove convites especiais, chaves, acessos ou aceites.

Rollback preferido: desabilitar o piloto, preservando tabela, coluna cifrada, custódia e contrato compatível. O binário 0e09ea2 conhece ledger4, não ledger5; voltar a ele exige reconciliar o schema/ledger ou recuperar o snapshot anterior em janela controlada. Não remover chaves nem fingir compatibilidade. Se necessário rollback integral, suspender escritas de HOMOLOG e restaurar snapshot validado, considerando escritas posteriores. Não executar rollback em PROD.

## Testes

Política de ambiente e validade; checksums e compatibilidade de backup; fidelidade dos ativos; HTTP real de criação/listagem/revogação/interesse; bloqueio anônimo e usuário sem PlatformAdmin; erro de Origin; ausência de concessão de acesso; persistência e idempotência de interesse; expiração/revogação em página aberta; desktop/mobile/teclado; regressão contratual e preservação das tabelas existentes. Usar só fixtures sintéticas em laboratório. Criar convites de aceite pela interface, não por SQL/script.
