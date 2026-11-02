# A.2 — Convite Especial privado, sem segundo e-mail

02/11/2026. Branch `feat/a2-private-invitation-credential`, derivada de
`76c70aee455b52b42691f4dae05911def15e950d`. Implementação e testes exclusivamente LOCAL.

## Aceite e decisão

Registrado o aceite funcional e visual de Ricardo do ciclo completo em HOMOLOG
no SHA 76c70aee: emissão, autorização automática, Experimentação, identidade,
tenant único, contratação e acesso. O aceite anterior incluía confirmação por
e-mail sintético; aquela evidência histórica permanece verdadeira e inalterada.

A decisão posterior autoriza substituir a segunda confirmação, para novos
convites individuais, pelo resgate explícito do próprio link privado. Este
documento substitui nesse ponto o contrato de
[pré-autorização](A2-SPECIAL-INVITATION-PREAUTHORIZATION.md).
O endereço é uma identificação autorizada pelo PlatformAdmin, **não prova de
controle da caixa postal**. A emissão continua sendo a autorização de negócio;
não existe segunda aprovação ou criação manual de identidade/tenant.

## Implementação mínima

- Reutilizados Special Invitation, Admission, AdmissionChallenge, AEAD da prova
  restrita, autenticação existente, criação de identidade e provisionamento.
- A emissão serializável cria convite, Admission, uma credencial
  `INVITATION_CREDENTIAL` e auditoria. UUID de emissão mantém idempotência.
  Token de 256 bits, hash SHA-256; cópia administrativa continua cifrada no
  mecanismo existente. Validade acompanha o convite: 1–168h, padrão 72h.
- Abrir a página, suas boas-vindas, um scanner ou registrar interesse não
  consome a credencial. **Iniciar minha adesão** resolve o identificador e faz
  POST explícito à rota existente de verificação, com o token em corpo.
- O servidor revalida origem, ambiente, catálogo/ACLs, vínculo, emissor ativo,
  hash, validade, estado e consumo. A mesma transação consome o desafio, grava
  `invitation_redeemed_at` e `ADMISSION_INVITATION_REDEEMED`. Nenhum token integra
  auditoria. `email_verified_at` continua NULL nesse modelo.
- A prova AEAD distingue `INVITATION` de `EMAIL`; cookie HttpOnly, SameSite
  Strict, Secure em HTTPS, restrito a `/api/admissions/{id}`, até 30 minutos e
  nunca além da autorização. O link não cria uma sessão de autenticação.
- Repetição no navegador com prova válida é idempotente. Outro navegador não
  resgata a credencial consumida. Identidade já autenticada no endereço
  autorizado pode retomar um resgate concluído, mesmo sem esse cookie curto.
  A assinatura da credencial é revalidada sob lock, fechando a corrida com reset.
- E-mail exibido como **autorizado**, sem campo editável. Conta nova define
  senha; conta existente usa sua senha própria. Criar identidade não modifica
  credenciais existentes. O provisionamento continua atômico e único por Admission.
- O novo caminho não chama transporte de e-mail nem gera desafios de e-mail.
  Não há nova rota pública de cadastro, pagamento, SMTP ou sistema de identidade.

Continuam vigentes os componentes e comportamentos homologados da Experimentação,
Primeiro Acesso, olhos de senha, retorno contratual, reset administrativo,
Termo do Usuário → PF/PJ → responsável → contratação → operação.

## Banco, ACL e recuperação

É necessária migration nova: o CHECK anterior só permitia provisionar com
`email_verified_at`. Preencher esse campo sem confirmação seria evidência falsa.

`20261102_private_invitation_credential`, SHA-256
`a26f33455ba93ea7e00f33fd3ae751373e302cdf417a4a2012038c11ea7d7364`:

- H8 → H9 / P7 → P8, **44 tabelas**, sem tabela nova;
- um timestamp nullable e um propósito de desafio;
- CHECKs aceitam exatamente uma evidência, mantendo expiração e consistência;
- preservados FKs, índices únicos, dados, evidência de e-mail anterior e contratos;
- ACL acrescenta somente UPDATE do timestamp ao runtime; sem DELETE ou UPDATE
  genérico. Verificador de catálogo passa a exigir o ledger e a ACL exatos;
- nenhum arquivo de migration histórica foi reescrito;
- contratos de backup reconhecem os ledgers novos e antigos, sem inventar
  conversão de histórico, restauração reversa ou restauração entre ambientes.

A mesma SQL exige intenção independente `dez-a2-local-h8-h9`,
`dez-a2-homolog-h8-h9` ou `dez-a2-production-p7-p8`, além de provar conexão,
roles, ownership, schemas, ledger, privilégios e estado inicial. O laboratório
aceita adicionalmente sua fundação histórica identificada por checksum exato.

Contingência após a migration: manter a imagem nova compatível com H9/P8 e
desabilitar a emissão/adesão por configuração. O bloqueio de senha provisória
permanece independente da emissão de resets. **Não usar binário H8/P7 como
fallback sobre H9/P8.** Retorno ao schema anterior exige recuperação integral do
backup anterior e do software correspondente, sob autorização específica.

## Configuração e portabilidade

Uma versão e um artefato, com três perfis de migrations incluídos pelo processo
de build existente. Variam origem, banco, roles, chaves, flags e autorizações.
Nenhuma regra funcional é incorporada ao bundle por perfil.

- LOCAL: `ADMISSION_LAB_ENABLED=true`; endereços e banco locais verificados;
- HOMOLOG: `ADMISSION_HOMOLOG_ENABLED=true`, demais flags de ambiente falsas;
- PROD: `ADMISSION_PRODUCTION_ENABLED=true` somente após autorização de promoção;
  `SPECIAL_INVITATIONS_ENABLED=true` e `SPECIAL_INVITATIONS_PRODUCTION_APPROVED=true`;
- autenticação por identidade, chaves independentes de sessão/convite e origem
  pública correspondentes ao perfil, conforme os validadores existentes;
- **`EMAIL_PROVIDER=disabled` é suficiente**; não precisa de chave/diretório de
  captura para esse modo. Mock continua somente sintético. Transporte legado
  permanece separado e não é alternativa para resgatar convite privado;
- flag Admission false bloqueia o fluxo. True habilita apenas autorizações
  válidas: não remove controle de origem, autenticação, consumo, contratos ou
  autoridade administrativa, nem cria cadastro público irrestrito.

`VALIDATED_PAYMENT` permanece reservado e bloqueado. O futuro adaptador de
pagamento poderá emitir autorização confiável para a mesma jornada, sob outro
escopo; parâmetros enviados por visitante não habilitam essa origem.

## Convite oficial anterior

Última evidência de leitura disponível: 02/11/2026 13:55:27 UTC, anterior a esta
implementação, sem nova consulta remota nesta rodada. Convite
`4b05ff95-5776-4172-b8c7-9d240ea04af5`, destinatário informado por Ricardo,
apresentava e-mail apenas no nome de exibição, nenhuma Admission/identidade/tenant,
emissor ativo, não revogado e validade até 05/11/2026 07:20:10.894 (Brasília).
Isso **não** constitui vínculo de e-mail autorizado no contrato novo.

Não há backfill que promova links antigos a credenciais. O link anterior já
teve várias recuperações administrativas e sua distribuição não foi atestada.
A alternativa mínima executável com os serviços existentes, após autorização,
é **emitir um novo convite individual para o endereço explicitamente informado**,
entregá-lo pelo canal privado verificado e manter o original no histórico. Não
requer identidade, tenant, convite operacional ou segunda aprovação do convidado.
Cancelar o convite anterior, se desejado, também requer autorização específica.

Preservar também o mesmo link/registro exigiria uma regularização pontual
explicitamente autorizada: conferir novamente estado, emissor, destinatário e
custódia privada; vincular Admission e credencial atomicamente, com auditoria,
sem ampliar validade. **Essa operação não foi implementada como backfill nem
executada em PROD.** Se a custódia do link antigo for incerta, não promovê-lo.

## Testes e limites

O [registro de testes LOCAL](evidence/a2-private-invitation-local.json) referencia
o ensaio `evidence/lab-06`: PostgreSQL 18 descartável, rede sem saída, browser
Edge/Chromium, dados/documentos sintéticos. Inclui jornadas PF/PJ completas,
mouse/teclado/toque, Claro/Escuro, múltiplas abas, perda de resposta, auditoria,
isolamento, concorrência e regressão dos serviços homologados.

Migrations nas três configurações: rejeição de destino/intenção/role errados,
falha parcial com rollback, repetição rejeitada, ACL mínima, preservação dos
registros e restauração real dos 44 conjuntos de dados e ledger exato.

O ponto de entrada de laboratório existente também oferece
`--private-portability <ImageID sha256:...>` para testar a mesma imagem OCI nas
três configurações, com e-mail desabilitado e regressão incremental de reset.
Não é um novo executor de publicação. O recibo final OCI será guardado fora da
branch após atestar o commit limpo; o executor operacional existente permanece
inalterado e será usado na promoção autorizada.

Riscos residuais: quem receber indevidamente o link antes do primeiro resgate
poderá cadastrar uma identidade ainda inexistente naquele endereço. O sistema
não prova a caixa postal. Conta existente continua protegida pela autenticação.
O administrador deve conferir o destinatário/canal e evitar encaminhamentos,
grupos, links públicos e capturas contendo o token. O uso único não corrige
entrega errada: nessas situações é necessário cancelar/reemitir com segurança.

Se o navegador perder a prova após o resgate e antes de criar a senha, ou a
resposta de primeiro resgate se perder antes de gravar o cookie, o sistema falha
fechado. Será necessária reemissão; não se reabre a credencial consumida. Após
criar a identidade, o login próprio permite retomada enquanto a autorização
estiver válida. Após provisionar, login e vínculos próprios permitem recuperar
o espaço existente sem depender da validade do convite original.

## Promoção proposta — não executada

1. Ricardo aceita este candidato e autoriza a preparação/atualização de HOMOLOG.
2. Pelo executor estabilizado: leitura do estado atual H8; manifesto da imagem,
   SQL e ACL; backup fresco cifrado, recuperação isolada e contingência H9.
3. Aplicar somente H8→H9 + ACL prevista; publicar o mesmo OCI; testar convites
   sintéticos novo/PF e existente/PJ, resgate único, retomada e reset. Aceite manual.
4. Mediante autorização separada: repetir gates próprios de PROD P7→P8,
   inventário de roles produtivo, preservação de dados/contratos e contingência.
5. Promover o **mesmo OCI**, configurar adesão por convites autorizados e entrega
   privada, regularizar o caso antigo conforme decisão explícita e validar.

Nenhum ambiente remoto, master, contrato real, landing independente ou backup
real foi alterado nesta rodada. Não há autorização de publicação implícita.
