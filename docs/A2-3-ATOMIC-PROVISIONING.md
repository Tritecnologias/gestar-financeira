# Pacote A.2 — Fase A.2.3: provisionamento atômico

Data: 01/11/2026. Branch: `feat/a2-3-atomic-provisioning`.
Base aprovada e inicialmente limpa: `8aa8a22d644d82d10a7191a7173171762abbc9d5`.
Baseline PROD/master preservada: `74400e028949a763107061a09b8af6e406e83e70`.

Esta entrega é exclusivamente técnica e LOCAL. A.2.4 não foi iniciada. Não houve
push, merge, deploy, acesso a PROD/HOMOLOG, envio de e-mail real ou alteração de
contratos reais. O provisionamento está disponível por API no laboratório;
a página da A.2.2 ainda não implementa a jornada visual de provisionamento.

## Contrato HTTP

`POST /api/admissions/[id]/provision`, com JSON `{ "nome": "Nome da empresa" }`:

- Nome obrigatório, após trim, até 160 caracteres, sem caracteres de controle.
  Campos extras, incluindo e-mail, identidade, tenant, papel e autoridade, são rejeitados.
- Exige o gate LOCAL da A.2.2, Origin exato, corpo limitado a 2 KiB, sessão NextAuth
  de identidade e ausência de contexto de suporte/assessoria.
- Na primeira execução, exige a prova de e-mail HttpOnly válida dessa Admission,
  a identidade ACTIVE com e-mail exatamente igual ao aprovado, Admission AUTHORIZED
  ainda válida e Convite Especial interessado, não revogado e ainda válido.
- Revalida PlatformAdmin e identidade administrativa ACTIVE dentro da transação;
  o par deve ser exatamente o autor gravado na autorização. Desativação antes do
  provisionamento impede o primeiro consumo, inclusive com sessões já abertas.
- Retorna `201` para a criação e `200` para repetição autorizada. O resultado contém
  `id`, `state: "PROVISIONED"`, `identityId`, `tenantId`, `membershipId`,
  `provisionedAt`, `created` e `nextPath: "/onboarding"`.
- O nome da primeira execução prevalece; repetir com outro nome válido não renomeia
  a empresa. O slug é `adesao-<Admission.id>`, evitando colisões entre nomes iguais.
- A resposta seleciona o tenant pelo mecanismo existente: `tenant_context` vinculado
  à identidade e ao nonce do login, usando `tenantContextCookieOptions`. Não cria
  outro tipo de sessão. Respostas são privadas, sem cache, referrer ou indexação.
- Falhas de autenticação/prova retornam 401; autoridade/identidade incompatível, 403;
  estado/origem/validade incompatível, 409; orçamento de abuso, 429; falha temporária
  ou esgotamento das tentativas transacionais, 503, sem revelar detalhes internos.

`GET /api/admissions/[id]` continua sem criar recursos. Em AUTHORIZED, mantém os
estados de identidade da A.2.2 e informa `canProvision` quando a identidade está
confirmada. A execução sempre revalida a autoridade. Em PROVISIONED, retorna o
resultado persistido somente à identidade destinatária com os vínculos ativos.

## Transação, unicidade e recuperação

`provisionAdmission` reutiliza a transação SERIALIZABLE da A.2.2, com timeout de
15 segundos e até quatro tentativas completas para conflitos reconhecidos. A ordem
de bloqueios administrativos precede os bloqueios de Convite Especial/Admission,
compatível com aprovação e cancelamento. A identidade é revalidada sob lock.

Na mesma transação:

1. Revalida autorização, origem, autoridade, identidade e prova persistida.
2. Cria Tenant ativo, `plano=trial`, modalidade nula e escolha PF/PJ pendente.
3. Cria o perfil inicial ADMINISTRAÇÃO com as permissões já utilizadas pelos
   convites OWNER; não cria privilégios de plataforma, suporte ou assessoria.
4. Ativa TenantMembership OWNER, Usuario administrativo e LegacyUserAccessMap
   com identidade, tenant, perfil e membership coerentes.
5. Registra AccessOwnerEvent e as auditorias de tenant, perfil, OWNER e membership.
6. Reconfere prazo por relógio do banco e grava o resultado definitivo na Admission,
   com `status=PROVISIONED`, identidade, tenant, membership e horário de consumo.
7. Revoga desafios ainda pendentes e registra ADMISSION_PROVISIONED e seleção
   de contexto. A resposta e o cookie só são emitidos depois do commit.

Não há commit intermediário, chamada de e-mail, bcrypt ou outro serviço externo
nessa transação. Falha em qualquer escrita, inclusive auditoria, desfaz tudo.

As restrições da A.2.1 permanecem: fonte/referência e Convite Especial únicos,
tenant único por Admission, estado final completo e FK composta
`membership(id,identityId,tenantId)`. A unicidade do slug e o lock da Admission
completam a defesa contra duplicação. O identificador da autorização é a chave de
idempotência; um ID enviado pelo navegador nunca constitui autoridade.

Uma resposta perdida pode ser recuperada por novo POST ou GET autenticado. Depois
de PROVISIONED, não é necessário renovar um cookie de e-mail de curta duração:
o resultado está vinculado à identidade original, ao fato persistido de verificação
e a tenant, OWNER, perfil, Usuario e mapeamento atualmente ativos. Expiração ou
revogação posterior do convite e desativação do administrador original não apagam
o tenant concluído. Revogação do acesso atual impede a retomada e nunca recria
os vínculos. Alteração do e-mail da identidade também exige revisão administrativa.

Autorizações distintas podem criar tenants diferentes para a mesma identidade.
A senha, dados e memberships anteriores não são atualizados pela ativação.
Autorização CANCELLED ou expirada nunca é reaberta pelo provisionamento.

## Rotinas compartilhadas

| Rotina em `app/src/lib/tenant-activation.ts` | Consumidores |
|---|---|
| `createPendingTenant` | Criação administrativa existente e Admission |
| `initialAdministrationProfile` | Convite OWNER do PlatformAdmin e Admission |
| `activateTenantMembership` | Aceite de AccessInvite e Admission |

São primitivas internas que recebem a transação do chamador; não autenticam nem
decidem a origem da autorização. Os chamadores continuam responsáveis por seus
contratos de segurança. Não há transação separada ou controlador paralelo.

O aceite de AccessInvite preserva a validação do convite, autenticação, política de
senha, criação/reuso de identidade, consumo único, erros de concorrência, auditoria
e finalização da indicação contratual. O perfil existente nunca é reativado nem
recebe permissões adicionais por um upsert. A criação administrativa mantém a
geração de slug, validações, planos permitidos, resposta e ausência de OWNER automático.

Uma futura contratação paga poderá chamar as mesmas primitivas após sua própria
validação de autoridade. Não há checkout, cobrança, integração ou caminho de
VALIDATED_PAYMENT implementado; o CHECK da fundação continua recusando essa fonte.

## Continuidade contratual e isolamento

O destino é a página existente `/onboarding`. Nenhuma regra contratual, aceite,
retorno seguro ou guard de acesso foi modificada. A ordem permanece:

`Identidade → Tenant → Termo do Usuário pendente → PF/PJ → Responsável contratual → Termo de Contratação → Acesso operacional`.

Provisionar não cria aceite, responsável contratual ou decisão de onboarding.
APIs operacionais continuam respondendo 428 enquanto houver requisitos pendentes.
O nonce do login e a membership ativa continuam controlando a seleção de tenant.
O usuário não recebe acesso a outra empresa por conhecer seu ID ou alterar um cookie.

## Schema, ACLs, ledger e backup

Não há alteração de schema, enum, migration, checksum, contrato de backup ou ACL
implantada. A contagem continua **43 tabelas de aplicação + 1 ledger = 44**.
Os candidatos H8/P7 da fundação continuam sem autorização para aplicação remota.

O dump de laboratório A.2.1 trazia permissões operacionais reduzidas. Para testar
as rotas existentes, `scripts/admission/operational-lab-acl.sql` recompõe somente
no banco descartável as capacidades previstas em `scripts/pg18/runtime-acl.sql`:
INSERT/UPDATE para convites e estado contratual; DML de dados empresariais para
restauração de backup. Não amplia as ACLs de Admission, desafios, aceites, auditoria,
ledger ou DDL. O SQL exige banco/roles/ledger específicos e PG18; o runner exige
Docker local, namespace sem rede externa e ausência de portas publicadas.

As permissões restritas de Admission continuam por coluna: o runtime não pode
reescrever e-mail, fonte, emissor ou validade, nem apagar autorização/desafio.
Auditoria, eventos de OWNER e aceites continuam append-only. Os testes de falha
retiram temporariamente uma permissão no banco sintético e a restauram em finally.

Backup por tenant mantém Admission e AdmissionChallenge fora das seções graváveis
e referências empresariais. Restaurar dados operacionais não reabre autorizações,
reescreve OWNER, remove aceites ou muda a decisão contratual atual. O dump completo
continua incluindo governança, FKs e ledger. PDFs e chaves privadas mantêm seus
procedimentos próprios; o teste de dump integral comprova recuperação do banco,
não substitui o plano operacional de recuperação de arquivos e segredos.

## Validação e evidências

Resultados finais e hashes: `docs/evidence/a2-3-provisioning.json`.
Execução aceita: `C:/Users/ricar/Documents/Codex/a2-3-provisioning/lab-05`.

| Verificação | Resultado |
|---|---|
| Provisionamento A.2.3: HTTP real + Prisma + PostgreSQL | 118 verificações aprovadas |
| Regressão A.2.2: autorização, identidade, desafios e retomada | 70 aprovadas |
| Regressão de Convites Especiais | 36 aprovadas |
| Regressão de convites operacionais | 50 aprovadas |
| Fase 12A, modalidade e retorno contratual seguro | 265 aprovadas |
| Total HTTP integrado | **539 aprovadas** |
| Suíte local sem dependência de bancos externos | **290 testes aprovados** |
| TypeScript, lint do núcleo alterado e Next build | Aprovados |
| Dump H8 / restore PostgreSQL | Dados das **44 tabelas** idênticos por digest ordenado |
| Descarte dos containers e portas publicadas | Removidos; nenhuma porta publicada |

Oito POSTs simultâneos produziram um único tenant. Três falhas reais de permissão
(gravação final de estado, mapping e auditoria) retornaram 503, preservaram o digest
integral dos registros envolvidos e permitiram recuperação na mesma autorização.
Também passaram cancelamento concorrente, identidade divergente, e-mail alterado,
ausência/expiração/adulteração de prova, autoridade inativa e revogação dos vínculos.

Os cinco testes antigos que exigem banco externo não foram executados: isolamento
multi-tenant, login legacy, membership ACCESS-2, sessão ACCESS-3 e PlatformAdmin ACCESS-3B.
A cobertura integrada requerida foi executada nos bancos sintéticos descritos aqui.
O hook opcional `baseline` da suíte 12A não foi usado; a preservação dos tenants e
vínculos da fundação, dos recibos anteriores e do ledger foi conferida pela suíte
A.2.3. As primeiras execuções corrigiram preparação de fixtures/configuração do
laboratório; a evidência aceita é a execução completa `lab-05`.

Comando reproduzível, com imagens já existentes e nenhum download:

```powershell
node app/scripts/admission/run-http-lab.mjs `
  'C:\Users\ricar\Documents\Codex\a2-1-foundation\lab-04' `
  'C:\Users\ricar\Documents\Codex\a2-3-provisioning\nova-execucao' --provision
```

O runner valida o hash do dump sintético aprovado, usa a2_runtime para a aplicação
compilada, NextAuth real e HTTP real. O controlador de fixtures usa PostgreSQL
administrativo somente para preparar dados sintéticos, simular tempo, injetar
falhas de permissão e conferir o banco. As regressões usam as rotas existentes;
as restrições de login permanecem habilitadas com evidência de proxy sintético.

Os convites operacionais conservam sua allowlist DEV original. Para essa regressão
e a Fase 12A, o runner restaura uma cópia sintética em `gestar_vf_dev` e inicia uma
segunda instância na porta interna 3017. Um relay exclusivamente no loopback do
namespace fornece a porta 55432 esperada pela política existente. Não há porta
publicada no host; o envio de e-mail e o gate Admission ficam desabilitados nessa
segunda instância. A aplicação principal da A.2.3 continua na configuração estrita
`localhost:3020` / `special_invite_lab:5432`, sem mudanças na allowlist do produto.

O laboratório publica versões PDF explicitamente sintéticas, preservando os
recibos anteriores. Não copia `.env`, dados, contas ou documentos reais. Containers,
chaves de sessão e capturador criptografado de e-mail são descartados ao final.

## Dependências e limite da entrega

- A.2.4 deverá consumir o contrato da API e tratar a retomada PROVISIONED na
  jornada visual; nenhum componente dessa fase foi antecipado.
- Recuperação autônoma de senha/conta continua pendente e obrigatória antes da
  disponibilização pública. Nenhuma credencial existente é redefinida aqui.
- Envio real de e-mail, configuração de domínio/HTTPS, política operacional de
  chaves e habilitação de ambiente público exigem suas etapas e aceite próprios.
- O limitador em memória herdado da A.2.2 continua apropriado ao laboratório;
  múltiplas instâncias exigirão armazenamento compartilhado. Limites de emissão
  e tentativas dos desafios permanecem persistidos no banco.
- Reaproveitar resultado exige o OWNER original ainda ativo; mudança de e-mail,
  perfil, vínculo ou titularidade pode exigir atendimento, sem reprovisionamento.
- O pacote mantém trial sem cobrança. Decisões comerciais e pagamentos seguem fora
  do escopo, assim como novas migrations em HOMOLOG/PROD.

**GO técnico para iniciar A.2.4 após novo aceite de Ricardo.** O núcleo atômico,
reuso de identidade, retomada, isolamento, regressões e recuperação passaram pelas
verificações previstas. A entrega não autoriza disponibilização pública nem
resolve as dependências de conta/e-mail e operação acima.

A.2.3 encerrada. Aguardar novo aceite; não iniciar A.2.4 nem publicar automaticamente.
