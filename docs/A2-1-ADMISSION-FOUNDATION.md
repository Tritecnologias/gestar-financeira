# Pacote A.2 — Fase A.2.1: contrato de adesão

Data: 01/11/2026. Base: `74400e028949a763107061a09b8af6e406e83e70`.
Branch: `feat/a2-1-admission-foundation`.

Escopo autorizado: contrato técnico, laboratório isolado, schema, migrations e ACLs.
A.2.2–A.2.5 não estão implementadas. Não há endpoint, tela, disparo de e-mail,
provisionador ou concessão operacional novos nesta fase.

A decisão de Ricardo substitui a opção de pré-autorização do diagnóstico:
**o PlatformAdmin autoriza ao aceitar um interesse já registrado**. Criar um
Convite Especial ou manifestar interesse não concede autorização automaticamente.
Os campos e as regras existentes de Experimentação permanecem intactos.

## Entidades e invariantes

| Entidade | Finalidade e campos principais |
|---|---|
| Admission | ID estável, origem/referência, Convite Especial único, e-mail aprovado normalizado, administrador/identidade que autorizou, data e validade, prova do e-mail, resultado tenant/identidade/membership e eventual cancelamento com autor/motivo. |
| AdmissionChallenge | Admission/e-mail destinatário, finalidade, geração, hash único do segredo, emissão/validade, estado, consumo/revogação, tentativas e situação da entrega. |

`AdmissionSource` distingue `AUTHORIZED_INVITE` e `VALIDATED_PAYMENT`.
Uma CHECK permite somente a primeira nesta versão, exigindo convite, referência
igual ao ID do convite e autor PlatformAdmin. Pagamento não possui escritor,
integração ou possibilidade de habilitação pelo navegador. Sua liberação futura
exigirá alteração explícita do contrato, sem refazer os vínculos/termos.

O e-mail identifica a conta; não identifica o tenant. A unicidade é por
origem/referência e por Convite Especial, e o tenant resultante também é único.
Duas autorizações distintas podem terminar na mesma identidade com dois tenants.

FKs compostas ligam administrador à identidade administrativa, challenge ao
e-mail aprovado, prova à própria Admission e membership à identidade/tenant
resultantes. SQL exige todos os campos do resultado em PROVISIONED e nenhum
resultado parcial em AUTHORIZED/CANCELLED. Não altera AuthIdentity, memberships,
credenciais ou contratos antigos.

O registro de aprovação é imutável para a role runtime: origem, referência,
convite, destinatário, emissor, emissão e validade não têm UPDATE concedido.
A aprovação não pode ser transferida para outro e-mail ou prolongada por reenvio.

## Estados, transições e tempo

| Estado/condição | Regra |
|---|---|
| AUTHORIZED, sem prova | Interesse foi explicitamente aceito; confirmar o e-mail. Não concede acesso. |
| AUTHORIZED, com prova | A prova é evidência; ainda exige sessão restrita válida e autenticação correta para consumir. |
| EXPIRED (derivado) | AUTHORIZED cujo expiresAt chegou. Não criar desafios/tenant; nenhum cron é necessário para bloquear. |
| Bloqueado pelo convite (derivado) | Convite de origem expirou/foi revogado antes do provisionamento. Recusar no servidor. |
| PROVISIONED | Autorização consumida. Resultado imutável no protocolo; repetição do mesmo titular lê o mesmo tenant. |
| CANCELLED | Cancelamento explícito terminal, com autor/motivo; desafios pendentes são revogados, evidência mantida. |

Na versão inicial, cancelamento não reabre nem troca o destinatário da mesma
aprovação. Correção exige novo Convite Especial, interesse e autorização explícitos.
Isso não restringe a navegação/reabertura do convite antigo nem altera suas datas.
Uma eventual reautorização do mesmo convite precisa de decisão posterior sobre
versionamento, não de UPDATE silencioso da prova já emitida.

Validade da aprovação: `min(validade escolhida, validade do convite)`, até 168h;
SQL impõe o teto de 168h e o serviço futuro verificará a validade da origem.
Todas as comparações de consumo usam relógio do banco, novamente dentro do lock.

Challenge: PENDING → CONSUMED ou REVOKED. Expiração também é derivada. Apenas
um PENDING por adesão/finalidade, inclusive se já expirou: sob lock do pai,
revogar o anterior antes de inserir a geração seguinte. Nunca apagá-lo.
Reenvio mantém Admission e produz nova geração/segredo, invalidando o anterior.

EMAIL_VERIFICATION dura até 15 minutos; RESUME até 30 minutos, sempre limitados
à validade restante da autorização no serviço. O banco limita cada janela.
Cinco tentativas por padrão, teto estrutural de dez; contadores persistentes.
A.2.2 implementará também cooldown de 60s e até três emissões por 15 minutos
por adesão/destinatário, complementados pelo limitador de requisições existente.

Segredos: 256 bits aleatórios; armazenar somente SHA-256. A geração e o envio
ainda não existem nesta fase. A demonstração usa hashes/endereços sintéticos.
SENT/SIMULATED/FAILED são estados de entrega, nunca prova de e-mail.
GET, preview e scanner de e-mail não consomem; confirmação exigirá POST explícito.
RESUME não substitui credenciais de uma AuthIdentity existente.

## Autoridade, locks e idempotência

Contrato obrigatório para os próximos serviços (não confiar nesses campos no body):

1. Autorização: obter identidade/admin da sessão, exigir modo identity e
   PlatformAdmin ativo fora de contexto de suporte/assessoria. Em transação
   SERIALIZABLE, bloquear admin/identity para leitura e o Convite Especial para
   atualização; revalidar interesse não nulo, validade, revogação e destinatário
   aprovado. Criar uma Admission e inserir auditoria no mesmo commit.
2. Consumo/reenvio/cancelamento: ordem comum de locks: convite → Admission →
   challenge, com os locks administrativos quando a ação exigir PlatformAdmin.
   Revogação do Convite Especial já disputa a mesma linha; decisão anterior à
   aquisição do lock não concede autoridade.
3. Consumir challenge por UPDATE condicional: status PENDING, não expirado,
   tentativas abaixo do limite, finalidade correta, segredo válido e Admission
   ainda autorizada. Revalidar destinatário e finalidade; consumir e vincular a
   prova à Admission atomicamente.
4. Provisionamento futuro: revalidar origem/prova/identidade, criar tenant, perfil,
   OWNER, Usuario/mapping, evento OWNER e auditoria numa transação; registrar
   PROVISIONED com resultado completo. Usar ID da Admission como chave estável,
   nunca nome, e-mail ou idempotency-key fornecida pelo navegador.
5. Retentativa após conflito SERIALIZABLE reinicia toda a transação, com limite.
   Resposta perdida após commit não cria outro espaço: autenticar novamente o
   titular e ler o resultado. Não reutilizar prova para outra identidade.
6. Depois do commit, expiração/revogação do convite não desfaz tenant ou contrato.
   Acesso passa pelos guards atuais de identidade, membership, modalidade,
   permissões, responsável e aceites. Estado PROVISIONED não é bypass.
7. Reutilizar núcleo de ativação existente na A.2.3; nenhuma duplicação de
   autenticação, recibos, identidade ou contrato foi criada aqui.

A SQL de referência no laboratório comprova locks/UPDATE condicional/rollback.
Não é implementação de HTTP e não recebe dados de navegador. As CHECKs e FKs
garantem integridade estrutural, mas **não comprovam sozinhas** interesse,
PlatformAdmin ativo, sessão, segredo, finalidade/consumo da prova, papel OWNER,
ou que uma transição terminal foi respeitada. Esses controles serão obrigatórios
nos serviços A.2.2/A.2.3. Nenhum endpoint usa estas tabelas na A.2.1.

Atualizações de estados deverão usar comparação do estado anterior na cláusula
WHERE; PROVISIONED/CANCELLED são terminais no protocolo. UPDATE permitido na
coluna status não é autorização para reabrir uma aprovação. A credencial runtime
é exclusivamente do backend, jamais do cliente.

A ordem operacional aprovada permanece:
identidade → provisionamento → Termo do Usuário, se pendente → PF/PJ →
responsável contratual → contratação → acesso. Preservar o termo individual
global vigente e todos os recibos contratuais já formalizados.

## ACL e auditoria

A migration cria objetos com ownership do migrator e revoga PUBLIC. A ACL
operacional separada só é executável por `a2_migrator` em bancos `a2_*`, PG18,
com migration exata concluída. A role `a2_runtime` é LOGIN/NOINHERIT, sem
superuser, criação de banco/role/schema, replicação, BYPASSRLS ou membership
do migrator.

- Admissions: SELECT/INSERT e UPDATE apenas dos campos de prova, estado,
  resultado e cancelamento.
- Challenges: SELECT/INSERT e UPDATE apenas de estado, consumo/revogação,
  tentativas e entrega.
- Sem UPDATE de segredo/hash, e-mail, emissor, origem, validade ou geração.
- Sem DELETE/TRUNCATE/DDL, ownership ou escrita no ledger.
- Aceites, AccessOwnerEvent e AuditEvent conservam SELECT/INSERT.

Os novos registros são globais de autorização, como Convites Especiais.
Acesso administrativo usa PlatformAdmin; acesso do aderente usa prova/sessão
restrita ou a própria identidade vinculada. Não listar por e-mail recebido do
cliente. Após provisionamento, usar tenant derivado do resultado e os guards
atuais; isolamento da aplicação e FKs compostas, sem presumir RLS nativa.

Reutilizar writeAudit/withAccessRequest. Eventos propostos:
ADMISSION_AUTHORIZED, ADMISSION_CHALLENGE_ISSUED, ADMISSION_EMAIL_VERIFIED,
ADMISSION_CHALLENGE_REVOKED, ADMISSION_CANCELLED, ADMISSION_PROVISIONED,
ADMISSION_RESUMED e negações relevantes. ResourceId é Admission/Challenge;
metadados contêm IDs, origem, geração e resultado, nunca senha, segredo, hash
de verificação, cookie ou e-mail completo. Falha de auditoria de uma mutação
de autoridade deve abortar sua transação.

## Schema, ledgers e recuperação

Migration aditiva `20261101_admission_foundation`, com SQL idêntico nos
catálogos local/HOMOLOG e PROD. Guards exigem PG18, schema public, migrator
local, banco `a2_*`, histórico H7 ou P6 exato e ausência de pendências estranhas.
O registro corrente criado por Prisma é permitido. As migrations antigas
permanecem byte a byte iguais.

A.2.1 deixa a migration deliberadamente bloqueada nos nomes/roles remotos.
Os catálogos preparados não autorizam promoção. Antes de HOMOLOG/PROD será
necessária uma estratégia de liberação versionada, guard de destino e checksum
revisados; não editar silenciosamente SQL já aplicado em ambiente persistente.
Os ledgers locais H8/P7 desta fase não devem ser tratados como hashes finais
de uma futura publicação remota.

schema-contract.mjs conserva os históricos H7/P6 e acrescenta H8/P7 exatos.
Os novos históricos só restauram o próprio perfil/ledger. Não há compatibilidade
automática H7→H8, P6→P7, cruzamento de perfis ou reassinatura de backup antigo.

Admission/Challenge não integram TABLES ou REFERENCE_TABLES do backup empresarial:
restore de tenant não pode restaurar concessão, destinatário, segredo ou consumo.
O vínculo resultante já está representado por membership/mapping existentes.
Um dump completo do ambiente preserva ambas as tabelas, FKs, ACLs e evidências.
O laboratório realiza pg_dump/pg_restore real com dados exclusivamente sintéticos.

Contingência: suspender novas adesões, preservar evidências e usar artefato
compatível com o ledger. Não executar down migration nem retornar binário P6
ao schema seguinte sem validação. Recuperação integral exige clone verificado,
autorização própria e avaliação das gravações posteriores.

## Laboratório e execução

`node scripts/admission/run-lab.mjs <diretório absoluto novo de evidências>`

O runner valida Docker Windows local (npipe), usa imagens existentes por digest,
container PostgreSQL 18.6 novo em tmpfs, rede none, sem portas e sem restart.
Prisma 7.8 usa o namespace de rede desse container, sem acesso externo.
Não carrega .env, não inicia aplicação, não conecta SMTP e não lê dados reais.
Fixtures usam exclusivamente example.invalid.

As migrations históricas são executadas genuinamente com Prisma. Dentro desse
container descartável, nomes históricos exigidos pelos guards são usados
apenas durante o bootstrap; depois os bancos sintéticos são renomeados a2_h/a2_p.
Isso não acessa servidores PROD/HOMOLOG, não reescreve nem simula o ledger.

A.2.1 não altera as allowlists do app de Experimentação/email. O adapter simulado
integrado à jornada e a política exata de seu futuro laboratório HTTP pertencem
à A.2.2. O laboratório de schema já impede qualquer saída de e-mail por não ter
rede externa ou processo de envio.

O runner remove somente seu próprio container, após conferir nome e label.
Dump sintético, logs, resultados e hashes ficam fora do repositório.

## Dependências e critérios de avanço

- **Bloqueio para disponibilização pública:** ausência de recuperação autônoma
  de senha. Definir e resolver um fluxo seguro para a conta existente sem acesso
  às credenciais antes da abertura pública; não redefinir senha via adesão.
- A.2.2: implementar autoridade a partir da sessão, aceite do interesse, emissão/
  consumo real de desafio, proteção HTTP, limites persistentes, reenvio e retomada.
- A.2.3: extrair os serviços existentes e provar provisionamento completo.
- SMTP real, configuração de remetente/entregabilidade e validação funcional
  permanecem dependências futuras; não autorizados nos ensaios desta rodada.
- Reautorização do mesmo convite cancelado e mudança de destinatário não estão
  habilitadas. Qualquer ampliação deverá preservar o ID idempotente e a evidência.
- Promoção remota, liberação da migration e rollback exigem plano/aceite próprios.

GO para A.2.2 significa que a fundação foi validada, não que a adesão está
disponível. Após entregar os resultados da A.2.1, parar para novo aceite.

## Resultado da A.2.1

- Schema validado e Prisma Client 7.8 gerado; TypeScript sem erros.
- 284 testes de regressão/unitários/contrato passaram, zero skips. Cinco arquivos
  dependentes de aplicação HTTP/banco externo não foram executados nessa suíte;
  as provas de banco desta fase estão no laboratório isolado abaixo.
- 53 verificações PostgreSQL/Prisma passaram no ensaio final, incluindo os dois
  históricos, replay de migrations, concorrência de autorização/consumo,
  cross-tenant, rollback, ACLs por coluna e pg_dump/pg_restore real.
- H7→H8 e P6→P7 ocorreram somente em bancos sintéticos. As 41 tabelas de aplicação
  preexistentes foram comparadas; o ledger é a 42ª tabela e evolui explicitamente.
  O dump final recuperou 43 tabelas de aplicação mais o ledger, totalizando 44.
- Migration SHA-256:
  `46d7bd07acb5fc075e824cf064de3fdc655ea8e85fc33f202f95c6ded965874b`.
- Container do ensaio final removido após verificação de nome/label. Nenhuma
  escrita remota, deploy, e-mail real ou acesso a dados de clientes.
- Evidências resumidas: `docs/evidence/a2-1-foundation.json`. Evidência completa
  externa: `C:/Users/ricar/Documents/Codex/a2-1-foundation/lab-04/RESULT.json`.

As rodadas anteriores ficam preservadas: ajuste do nome exigido pelo bootstrap
histórico, qualificação da tabela no teste de role sem USAGE e distinção entre
contagem de tabelas de aplicação/ledger. Esses ajustes foram feitos no runner;
nenhum guard ou checksum histórico foi afrouxado para obter aprovação.

Parecer: **GO técnico para iniciar A.2.2 após novo aceite de Ricardo**.
**NO-GO para disponibilização pública**, que ainda depende da implementação
das próximas fases e da resolução da recuperação autônoma de senha.
A.2.1 concluída; nenhuma fase seguinte iniciada.
