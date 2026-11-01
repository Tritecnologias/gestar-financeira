# Pacote A.2 — Fase A.2.2: autorização, e-mail e retomada

Data: 01/11/2026. Branch: `feat/a2-2-admission-verification`.
Base aprovada: `fd231ae615f768ffb7f10ac8e075e2fb7e482852`.
Baseline PROD/master preservada: `74400e028949a763107061a09b8af6e406e83e70`.

Escopo exclusivo da A.2.2. Nenhum tenant, OWNER, membership, Usuario, mapping,
aceite ou contratação é criado por estes serviços. A.2.3 não foi iniciada.
PROD/HOMOLOG não foram acessados; não há push, deploy ou envio real de e-mail.

## Preparação e contagem de tabelas

A fundação aprovada estava na branch e no commit indicados, com árvore limpa.
A branch A.2.2 foi criada diretamente desse commit, sem continuar na UX04.

As contagens anteriores mediam conjuntos diferentes: **41 tabelas de aplicação +
1 ledger `_prisma_migrations` = 42** antes da A.2.1. As duas novas tabelas da
fundação resultam em **43 de aplicação + 1 ledger = 44**. A.2.2 não cria tabelas,
enums ou migrations e não modifica o schema, os checksums ou as ACLs da A.2.1.

## Comportamento entregue

1. O Convite Especial continua registrando visualização, boas-vindas e interesse.
   Interesse isolado não cria Admission, identidade, tenant ou acesso.
2. No painel existente, `Analisar adesão` aparece somente no laboratório habilitado
   e em convites ativos com interesse. O PlatformAdmin informa o e-mail aprovado
   e aceita o interesse. O Convite Especial existente não possui campo de e-mail;
   o endereço é uma decisão explícita do administrador, registrada na Admission.
3. A autorização é única por convite. Repetições retornam o mesmo ID, destinatário
   e validade, sem reenviar, prolongar ou transferir a aprovação.
4. Um desafio é enviado ao capturador de e-mails sintéticos. O link abre `/adesao`;
   somente o botão de confirmação faz o POST que consome o desafio.
5. Com e-mail comprovado, uma conta existente exige o login NextAuth atual. A conta
   nova usa a política e o bcrypt da ativação existente, e depois o mesmo login.
6. A página conclui em `IDENTITY_VERIFIED`, informando que a criação do espaço
   ainda não está disponível. Não há ação de provisionamento.

Os endpoints operacionais de AccessInvite e suas regras permanecem intactos.
O componente administrativo adicional é desabilitado fora do gate local; não
altera criação, acesso, contagem, histórico, cópia ou cancelamento de Convites
Especiais. Cancelar o convite original bloqueia a adesão antes do provisionamento.

## Contrato HTTP

Todas as respostas dos handlers de adesão são privadas, sem cache, sem referrer,
sem indexação e com ID de requisição gerado no servidor. Mutações exigem Origin
exato e JSON limitado a 2 KiB, reaproveitando `readExperimentBody`. Campos extras
de autoridade, identidade ou tenant são rejeitados.

| Rota | Método e finalidade | Autoridade |
|---|---|---|
| `/api/platform/experiment-invitations/[id]/admission` | GET consulta; POST `{email,hours?}` autoriza; DELETE `{reason}` cancela | Sessão identity + PlatformAdmin ativo, sem suporte/assessoria; rechecagem transacional |
| `/api/admissions/resume` | POST `{email,admissionId?}` solicita novo link | Resposta genérica; destino sempre igual ao e-mail aprovado |
| `/api/admissions/[id]/verify` | POST `{challengeId,token}` confirma/retoma | Segredo correto, autorização/origem válidas e desafio elegível |
| `/api/admissions/[id]` | GET situação e próximo passo de identidade | Cookie restrito validado contra as provas persistidas |
| `/api/admissions/[id]/identity` | POST `{password}` cria somente identidade ausente | Prova válida, nenhuma sessão de outra identidade, validação duplicada antes/depois do bcrypt |

Referências de autorização não são segredos e não concedem leitura nem acesso.
GET, carregamento da página e scanners não consomem desafios. O token fica no
fragmento do link, é retirado da barra de endereço e mantido somente na memória
da página. Apenas o ID da Admission é guardado em sessionStorage para retomada.

Sem referência, a solicitação por e-mail só emite se houver exatamente uma
autorização válida. Com várias, o sistema não escolhe por ordem: é necessário
abrir o e-mail da adesão desejada, que contém seu ID estável. A resposta pública
é a mesma para ausência, ambiguidade, bloqueio e limitação; não lista contas.

## Prova, identidade e retomada

Admission conserva `AUTHORIZED` durante esta fase. `emailVerifiedAt` e
`verifiedChallengeId` guardam a primeira prova EMAIL_VERIFICATION consumida.
Retomadas posteriores usam RESUME e não substituem essa evidência.

O cookie `dez-admission-<id>` usa AES-256-GCM com domínio específico, HttpOnly,
SameSite Strict e path `/api/admissions/<id>`. Inclui apenas referências da
autorização/prova/desafio de acesso e validade de até 30 minutos, limitada à
Admission. Cada autorização tem seu cookie; abas e adesões distintas não
sobrescrevem mutuamente suas provas. HTTP sem Secure existe apenas no laboratório
loopback; nenhuma origem remota é habilitável nesta entrega.

O cookie não é login, membership ou autorização empresarial. Toda leitura
revalida origem, Admission, consumo/finalidade da prova e validade. Um cookie
de outra autorização, adulterado, expirado ou invalidado por cancelamento falha.

`IDENTITY_VERIFIED` é derivado de prova válida + identidade ACTIVE cujo e-mail
é o aprovado + sessão NextAuth dessa identidade. Admission.identityId continua
nulo: a fundação reserva identityId/tenantId/membershipId para o resultado
atômico PROVISIONED. Não é necessário um cadastro paralelo de identidade.

Criar uma identidade não redefine senha, atualiza nome nem altera vínculos de
uma conta existente. A unicidade de AuthIdentity.email é preservada; concorrência
reinicia a transação e reaproveita a identidade já criada. Se a resposta se perder,
a consulta seguinte solicita login com a senha definida, sem criar outra conta.

Depois de uma confirmação consumida, a mesma sessão restrita pode repetir a
requisição de modo idempotente. Sem essa sessão, um token consumido não inicia
outra: o titular recebe um novo desafio RESUME. Isso cobre resposta perdida,
outro navegador e cookie vencido sem apagar as verificações concluídas.

## Controles de segurança e concorrência

- Tokens opacos de 256 bits, apenas SHA-256 no PostgreSQL. Não há senha, token,
  cookie, hash de verificação ou e-mail completo nos metadados de auditoria.
- EMAIL_VERIFICATION: até 15 minutos; RESUME: até 30; ambos limitados à Admission.
  Autorizações: até 168 horas e nunca além do Convite Especial de origem.
- Cinco tentativas por desafio. As falhas são confirmadas no banco, inclusive
  a revogação ao atingir o limite; não são perdidas por um throw/rollback.
- Cooldown de 60 segundos e até três emissões por destinatário em 15 minutos,
  inclusive entre autorizações diferentes. Contagem no banco sob advisory lock;
  reenvio revoga pendentes e preserva todas as gerações anteriores.
- Limitador de entrada reaproveita `ExperimentAbuseBudget` e `trustedClientIp`.
  O limitador de entrada/login é local ao processo; o de emissão/tentativas é
  persistente. Escala horizontal requer revisão do limitador de entrada existente.
- Ordem de locks: administrador/identidade quando necessário; destinatário para
  emissão; Convite Especial; Admission; challenge. Identidade nova possui ainda
  lock por e-mail, sem criar vínculo operacional.
- SERIALIZABLE com até quatro tentativas completas para conflitos reconhecidos,
  incluindo o formato P2010/driverAdapterError do Prisma 7. Falhas de permissão,
  infraestrutura ou auditoria não viram sucesso nem conflito ignorável.
- Auditoria das mutações participa da mesma transação. Falha de auditoria não
  autoriza, consome desafio ou cria identidade. `withAccessRequest` mantém apenas
  rastreio operacional seguro.
- A.2.1 continua fornecendo FKs compostas e ACLs por coluna, sem DELETE/TRUNCATE,
  alteração de destino/emissor/segredo/validade ou escrita no ledger. Sem novas
  funções privilegiadas, RLS presumida ou permissões ampliadas.

## Entrega de e-mail e falhas temporárias

`sendEmailMessage` reaproveita o tratamento de resultados do serviço de e-mail
existente. O adapter habilitado aqui é exclusivamente sintético, sem SMTP:
escreve envelopes AES-256-GCM em tmpfs privado do worker. Chave e domínio são
distintos da sessão restrita. Nenhum endpoint permite consultar esse capturador.

Os handlers nunca devolvem o token nem o link de confirmação ao administrador
ou solicitante. O ensaio lê o capturador diretamente dentro do container para
representar o destinatário. Os envelopes e suas chaves desaparecem ao terminar.

A transação cria autorização/desafio antes da entrega. Falha de entrega marca
FAILED e conserva a autorização; nova solicitação, respeitando limites, gera
outro segredo. Uma queda entre commit e entrega deixa PENDING recuperável pelo
mesmo reenvio. O retry administrativo não cria nova Admission nem dispara envio
duplicado. Não há promessa de entrega exatamente uma vez nem fila paralela.

## Laboratório e verificação

Execução, a partir de `app`:

```text
node scripts/admission/run-http-lab.mjs <diretório-evidências-A2.1> <diretório-novo-A2.2>
```

O runner confere a marcação sintética e o SHA-256 do dump aprovado da A.2.1,
restaura em PostgreSQL 18.6 descartável e executa Next/Prisma reais em um worker
que compartilha seu namespace de rede `none`. Sem portas publicadas, volumes
de bancos existentes, leitura de .env ou acesso externo. Imagens locais fixadas
por digest; fontes copiadas por allowlist. Remoção exige conferir nome e label.

O banco se chama `special_invite_lab` somente dentro desse container novo para
reutilizar o gate preexistente de Experimentação. Não se conecta ao laboratório
antigo com o mesmo nome nem muda sua configuração. O runtime usa `a2_runtime`.

Fixtures têm e-mails `@example.invalid`. A credencial inutilizável do owner da
fixture da A.2.1 é inicializada para o ensaio antes da captura de referência;
o fluxo HTTP deve preservar essa senha e seus dois tenants. Avanços de prazo
nos testes alteram somente timestamps de fixtures, pelo controlador do ensaio;
não há relógio artificial ou bypass de prazo nos serviços entregues.

Resultados finais e hashes: `docs/evidence/a2-2-verification.json`.
As rodadas malsucedidas ficam preservadas fora do repositório junto às evidências:
formato do conflito SQL no adapter Prisma, cache sobrescrito pelo servidor de
desenvolvimento e espera pela inicialização TCP definitiva do PostgreSQL.
O ensaio final usa build da aplicação, mantendo o teste estrito de `no-store`.

Resultado final:

- Build Next/Prisma e verificação TypeScript aprovados.
- Lint dos arquivos novos de aplicação aprovado, sem erros ou avisos.
- 290 testes unitários/regressão/contrato aprovados, zero falhas e zero skips.
  As mesmas cinco suítes dependentes de HTTP/banco externo da A.2.1 ficaram fora
  dessa execução; os testes HTTP abaixo foram executados no laboratório próprio.
- 70 verificações HTTP da adesão aprovadas, incluindo concorrência real,
  reenvio, múltiplas abas/autorizações, senha existente e falhas de auditoria/entrega.
- 36 verificações HTTP preexistentes dos Convites Especiais aprovadas.
- Fingerprints dos registros protegidos, identidade existente e ledger preservados.
  Zero tenants, memberships, OWNERs, convites operacionais ou contratos criados
  pelo fluxo de adesão. Os dados de preparação são fixtures declaradas do ensaio.
- Containers do ensaio final removidos; sem saída de rede ou e-mail real.

Evidência completa local: `C:/Users/ricar/Documents/Codex/a2-2-verification/lab-06`.
A interface foi compilada e servida pelo build; aceite visual em navegador e a
jornada completa de provisionamento/contratação não são declarados como concluídos.

## Dependências e fronteira para A.2.3

- **Recuperação autônoma de senha continua bloqueando a disponibilização pública.**
  Esta fase não redefine senhas. Conta existente sem suas credenciais exige
  atendimento; o link de e-mail não substitui autenticação.
- SMTP/remetente/entregabilidade e política de ativação remota não foram liberados.
  O gate exige simultaneamente loopback, banco/role exatos, perfil local, mock,
  capturador privado e chaves fortes. Não basta ligar uma flag em HOMOLOG/PROD.
- A.2.3 deverá revalidar prova, sessão, identidade ativa, origem e autorização
  dentro da mesma transação do provisionamento. O DTO do navegador não constitui
  autoridade. Usar Admission.id como chave estável e reutilizar ativação/vínculos.
- A ordem aprovada permanece identidade → provisionamento → Termo do Usuário →
  PF/PJ → responsável contratual → contratação → acesso. Nada contratual foi alterado.
- Sem mudança de schema/ledger, permanece o contrato H8/P7 da A.2.1. Evidências
  globais de adesão continuam excluídas do restore empresarial; a recuperação
  integral preserva-as e uma sessão perdida pode ser restabelecida por RESUME.
- Reautorização de convite cancelado, cobrança, checkout e abertura pública não
  fazem parte desta entrega. Liberação remota de migrations ainda exige o plano
  versionado e o aceite próprios descritos na A.2.1.

Encerrar após a A.2.2 e aguardar novo aceite de Ricardo. Não publicar ou iniciar
automaticamente A.2.3.

Parecer: **GO técnico para A.2.3 após novo aceite de Ricardo**; **NO-GO para
disponibilização pública**. Autorização e identidade verificada concluídas no
laboratório. Provisionamento permanece expressamente fora desta entrega.
