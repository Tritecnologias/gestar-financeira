# A.2 — Convite Especial individual previamente autorizado

Data: 02/11/2026. Branch: `feat/a2-preauthorized-special-invitation`.
Base local aprovada: `35d16fbeaf0712673146d0ca6c25e6c10c241fcc`.
Referência publicada preservada: `8c7834c0f827210dbf2ac23d3c353945d2debf97`.

Esta alteração implementa a decisão de Ricardo: a emissão individual pelo
PlatformAdmin é a autorização administrativa. Substitui, para novas emissões,
o requisito de registrar interesse e obter um segundo aceite descrito nos
documentos históricos A.2.2–A.2.5. Os demais contratos permanecem vigentes.

## Contrato mínimo

1. O painel existente recebe nome, **e-mail autorizado**, validade (1–168 horas)
   e uma referência UUID de emissão. Nome de apresentação nunca comprova e-mail.
2. A mesma transação serializável cria `ExperimentInvitation`, `Admission`
   (`AUTHORIZED_INVITE`) e os dois eventos de auditoria. Exige identidade e
   PlatformAdmin ativos, configuração autorizada e atestado real do banco.
3. Não cria desafio, identidade, tenant ou aceite. A autorização e o convite
   possuem a mesma expiração. O link recuperável continua cifrado.
4. Repetição da mesma referência e parâmetros retorna a mesma emissão; divergência
   de destinatário, validade, emissor ou nome falha. Concorrência não duplica a
   autorização. O limite existente de 20 convites por administrador/15 min permanece.
5. O visitante abre o Convite Especial e escolhe **Iniciar minha adesão**.
   A API resolve a autorização já vinculada e solicita o desafio existente para
   o e-mail fixado no servidor. Não aceita destino, identidade ou autoridade do cliente.
6. O link especial **não é prova de controle do e-mail**. A resposta contém
   somente a referência de Admission e o resultado do transporte. Não fornece
   desafio, cookie de confirmação, credencial ou e-mail do destinatário.
7. A confirmação explícita do desafio recebido estabelece a prova restrita;
   a identidade nova é criada ou a existente autentica pela senha atual.
   O provisionamento e todo o onboarding homologado são reaproveitados.

O desafio é emitido quando o visitante inicia, não quando o administrador cria
o convite: validade de 15 minutos para confirmação, 30 para retomada, uso único,
cinco tentativas, intervalo de 60 segundos e até três emissões por destinatário
em 15 minutos, conforme o mecanismo existente. Falha de entrega não autoriza
identidade ou tenant. Cancelamento/expiração são rechecados no servidor.

`interestAt` permanece como registro opcional, sem efeito de autorização. A
API histórica de aceite de interesses permanece compatível para registros
antigos; a nova emissão e a nova interface não dependem dela. Um convite antigo
sem Admission não é promovido implicitamente nem recebe segunda aprovação na UI.

## Jornada e preservação

Convite autorizado → confirmação de e-mail → identidade → provisionamento
atômico → Termo do Usuário → PF/PJ → responsável → contratação → acesso.

Preservados os ajustes da base 35d16fbe: seção do convite com foco e navegação
próprios, link de acessibilidade independente, Experimentação com o conteúdo
integral da landing de referência, FAQ, CTA de login e roteamento de tipos de
link pelo Primeiro Acesso. A landing independente não é modificada.

Sem mudanças em schema, migrations, ACLs, autenticação, reset administrativo,
textos jurídicos ou componentes contratuais. Sem novo executor, serviço de
e-mail ou sistema de identidade. Somente a comunicação necessária à nova regra
de emissão muda no painel, no convite e na etapa de confirmação de e-mail.

## Duas origens, uma jornada

`AUTHORIZED_INVITE` é a origem operacional nesta entrega.
`VALIDATED_PAYMENT` continua reservado na entidade Admission e bloqueado pelo
contrato de banco vigente. Nenhuma rota recebe `paid`, `paymentConfirmed` ou
`source` como prova de autorização do cliente.

Na fase futura de pagamento, um adaptador confiável deverá validar a confirmação
efetiva, persistir referência única do provedor e criar a mesma Admission,
mantendo a identidade e o onboarding comuns. Será necessário habilitar essa
origem no contrato de integridade e no validador de origem do serviço, que hoje
exige Convite Especial. Não se afirma que pagamentos estão implementados ou que
podem ser habilitados apenas por flag. Checkout, cobrança e essa evolução são
deliberadamente futuros, sem uma segunda jornada visual.

## Configuração e dependências reais

- `ADMISSION_PRODUCTION_ENABLED=false` bloqueia páginas/APIs de Admission e
  impede novas emissões com autorização neste candidato. Não bloqueia login,
  convites operacionais ou acesso de identidades existentes.
- `EMAIL_PROVIDER=mock` somente admite `@example.invalid` e captura cifrada
  local/operacional. Não entrega mensagens a caixas reais; trocar somente a
  flag de Admission não resolve o caso comercial.
- O adaptador existente suporta seleção de SMTP na configuração produtiva
  autorizada. Nenhum SMTP, OAuth2, credencial ou provedor foi implementado ou
  configurado nesta entrega.
- Um convite legado com e-mail no nome não tem vínculo estruturado nem prova
  de e-mail. Sua eventual conciliação deve usar ID e destinatário conferidos,
  preservar token, validade e auditoria, em operação futura expressamente
  autorizada. É materializar a emissão anterior, não criar um novo aceite de
  negócio. Não executar conversão em massa ou inferência pelo nome.

Para novos usuários, os mecanismos atuais não comprovam controle de um e-mail
sem entregar a esse endereço um desafio independente. A opção mínima que atende
à autonomia é tornar operacional o transporte já existente, sob autorização
separada. Entrega assistida de cada desafio ao próprio e-mail seria uma alternativa
operacional, mas exigiria intervenção e **não atende** ao objetivo de conclusão
autônoma; não foi implementada. WhatsApp, digitação do endereço ou posse isolada
do Convite Especial não substituem a prova aprovada.

## Validação e próximo aceite

Reutiliza `scripts/admission/run-http-lab.mjs --special-invitation`, PostgreSQL 18
descartável, aplicação Next compilada, rede Docker `none`, captura sintética
cifrada e Edge real. O relatório externo contém os resultados finais, hashes e
evidências por execução. Não produz backups nem acessa bases remotas para escrita.

Execução final `evidence/lab-03`, concluída em 02/11/2026 às 12:17:23 UTC:

| Verificação | Resultado |
|---|---|
| Build Next/TypeScript e aplicação real | PASS |
| Autorização, desafio, identidade e retomada anteriores | 70 verificações PASS |
| Convites Especiais, cópia, cancelamento e links | 36 verificações PASS |
| Provisionamento, concorrência, isolamento e contratos | 111 verificações PASS |
| Nova emissão previamente autorizada e segurança | 43 verificações PASS |
| Navegador Edge: PF novo e PJ existente, telas e retomada | 65 verificações PASS |
| Mesmo build com configuração produtiva desabilitada | 3 verificações PASS |
| Políticas, links, criptografia, interface e reset | 46 testes unitários PASS |

Os dois ensaios locais anteriores pararam por erros do roteiro de teste: acesso
a `user` em sessão anônima nula; tentativa de ler o corpo de uma resposta após
a navegação do Chromium. Corrigidos no roteiro, com os resultados preservados.
O ensaio final não ignora verificações. Fonte compilada de `src` e `public`
comparada byte a byte com a fonte final.

Lint direcionado: nenhum novo diagnóstico; permanece um erro anterior
`react-hooks/set-state-in-effect` e um aviso de referência no cleanup em
`ExperimentInvitationsClient`, reproduzidos na base 35d16fbe. Não se afirma lint
global limpo nem se amplia esta entrega com refatoração alheia à autorização.

O mesmo código seleciona configurações/autorizações em runtime; não introduz
variáveis de build ou variantes funcionais por ambiente. Schema H8/P7 permanece
compatível. O artefato de publicação deverá ser construído uma única vez a partir
do SHA aceito e promovido com o mesmo digest, pelo executor existente, após novo
aceite. O build de laboratório não é apresentado como OCI de publicação.

Sequência proposta:

1. Aceitar o candidato local e decidir a dependência de entrega/prova de e-mail.
2. Autorizar atualização controlada de HOMOLOG pelo procedimento existente,
   com dados sintéticos, sem migration; validar emissão, PF/PJ e retomada.
3. Aprovar o mecanismo real de entrega e a conciliação pontual dos convites
   legados. Não ativar PROD durante esse diagnóstico.
4. Após gates operacionais e autorização específica, promover o mesmo artefato
   a PROD; tratar habilitação comercial como decisão separada.

**NO-GO para uso comercial real enquanto entrega, vínculo dos convites legados
e habilitação controlada estiverem pendentes.** Passar o laboratório não remove
esses bloqueios. Nenhuma publicação ou habilitação pública está autorizada aqui.
