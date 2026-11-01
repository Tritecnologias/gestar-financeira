# Reset de senha pelo PlatformAdmin

Implementação LOCAL derivada do SHA homologado `60a69cb69597a40e2bfb3dd782a95b99e717b63f`. Substitui a proposta anterior de compartilhamento manual. Não cria recuperação pública, chatbot, módulo, tabela, migration ou ACL.

## Funcionamento

No catálogo atual, cada identidade ativa, vinculada ou sem empresas, tem **Resetar senha**. A confirmação identifica a conta e seu e-mail cadastrado e pede a senha do próprio PlatformAdmin. O servidor verifica novamente a autoridade; administradores de tenant e suporte não podem emitir.

O link é enviado automaticamente pelo adaptador SMTP/Nodemailer existente. Não há opção manual, `devLink`, cópia, consulta posterior ou link na resposta administrativa. A interface recebe apenas resultado e validade. Não é criada senha temporária.

O titular abre `/redefinir-senha#token=…`, escolhe e confirma a senha e depois faz login normalmente. O fragmento sai do histórico e permanece apenas em memória até a conclusão/saída. Recarregar exige reabrir o e-mail. GET não consome a autorização. A página reutiliza `PasswordInput` com olho por pressão e o estilo de Minha Conta.

Minha Conta → Alterar Senha continua exigindo sessão e senha atual. Os dois caminhos compartilham somente a gravação protegida e sua auditoria; não existe parâmetro para ignorar a senha atual. A identidade permanece a mesma, sem alterar tenants, memberships, perfis, OWNER, termos ou contratos. As sessões anteriores deixam de autorizar na próxima validação pelo `credentialStamp` existente.

## Proteções

- Validade de 15 minutos; três emissões por identidade em 15 minutos, intervalo de 60 segundos e dez emissões por administrador no período. Cinco falhas de confirmação da senha administrativa suspendem novas confirmações por 15 minutos.
- Prova HMAC SHA-256 com finalidade exclusiva, vinculada à origem, autorização, identidade, e-mail, credencial vigente do titular e do emissor e expiração. A chave vem da custódia de autenticação existente; não há hash de senha ou carimbo de sessão no link.
- Auditoria existente registra emissão, substituição, envio/falha e consumo. Nenhum token, assinatura, senha, corpo do e-mail ou hash vai para essa trilha. O registro não é suficiente para obter um link sem a assinatura secreta.
- Emissão, reemissão e consumo serializam a identidade; senha e evento de consumo pertencem à mesma transação. Falha de auditoria desfaz a alteração da senha. O estado de consumo não depende de memória do processo.
- Exige evento positivo de aceitação SMTP. Falha de entrega ou interrupção antes desse registro não libera o comprovante, mesmo que o SMTP tenha eventualmente aceitado a mensagem. Não há repetição automática.
- Reemissão invalida a anterior. Mudança da senha/e-mail, identidade inativa, emissor desautorizado, cancelamento registrado, expiração e consumo impedem reutilização. A rota administrativa não aceita destinatário, link, senha do titular ou identidade substituta no corpo.
- Reutiliza validação de origem, corpo limitado, orçamento de requisições e logs restritos. A conexão `accountDatabase` não registra argumentos Prisma. O catálogo real de banco/roles/ACL/ledger é conferido pelo contrato A.2 existente dentro das operações.
- Novas senhas deste reset respeitam o limite efetivo de 72 bytes UTF-8 do bcrypt, sem truncamento. A política dos demais caminhos e as credenciais legadas não foram alteradas nesta entrega; o achado anterior permanece registrado separadamente.

## Configuração e disponibilidade

Tudo é selecionado em runtime; nenhum contato ou segredo usa `NEXT_PUBLIC_*`. Uma única versão serve aos três perfis. Por padrão, a funcionalidade fica indisponível:

```dotenv
PASSWORD_RESET_ENABLED=false
TRANSACTIONAL_EMAIL_READY=false
SUPPORT_WHATSAPP_ENABLED=false
# SUPPORT_WHATSAPP_NUMBER: somente dígitos no formato internacional; não preencher/publicar sem autorização.
```

Para habilitar, é necessário configurar o SMTP existente, `TRANSACTIONAL_EMAIL_PROVIDER=smtp`, `ACCESS_AUTH_MODE=identity`, as duas autorizações explícitas de reset/e-mail, origens pública/autenticação iguais e chave de autenticação válida. Na ausência do seletor transacional, vale `EMAIL_PROVIDER`. O painel e a emissão conferem conexão TLS/autenticação SMTP com `verify()`, além da identidade real do banco. Configuração ausente, provider transacional `mock`, SMTP inacessível ou privilégios divergentes deixam o botão desabilitado e a API bloqueada.

O seletor transacional reutiliza exatamente o mesmo adaptador e as mesmas variáveis SMTP. Ele permite preservar `EMAIL_PROVIDER=mock` da Adesão em LOCAL/HOMOLOG enquanto o reset usa uma captura SMTP local ou caixas de teste explicitamente autorizadas. Não altera o guard nem a entrega da Adesão. Em PROD, ambos podem usar SMTP com a mesma configuração, sem alterar o código.

`TRANSACTIONAL_EMAIL_READY=true` é uma atestação operacional após qualificação de envio/entrega, não uma conclusão automática baseada na presença de credenciais. `verify()` prova conexão e autenticação; `SENT` significa aceitação pelo SMTP, não entrega garantida na caixa de entrada. DNS, reputação, rejeições posteriores e entrega real continuam dependências da implantação transacional prevista. Esta rodada não contrata nem configura provedor externo.

| Perfil | Destino e transporte permitidos |
| --- | --- |
| LOCAL | Origem `http://localhost:3020`, banco isolado `special_invite_lab`, role `a2_runtime`, SMTP loopback e destinatários `@example.invalid`. O laboratório usa TLS com certificado próprio confiado somente no processo de teste. |
| HOMOLOG | Origem, host, banco e runtime já definidos no contrato A.2; SMTP com autorização e lista exata `PASSWORD_RESET_TEST_RECIPIENTS` de até dez caixas controladas. Lista ausente/inválida bloqueia. |
| PROD | Origem, host, banco e runtime produtivos já definidos no contrato A.2; ativação independente e destinatário exclusivamente obtido da identidade cadastrada. |

O catálogo de banco continua exigindo H8/P7 e 44 tabelas, conforme o perfil. Não habilitar o reset sobre um ledger anterior. A funcionalidade não depende de liberar a Adesão ao público. Cada ambiente conserva suas credenciais e autorização própria.

O suporte no login mostra **Suporte via WhatsApp — em preparação** enquanto não publicado. Somente `SUPPORT_WHATSAPP_ENABLED=true` e um número internacional válido produzem um link fixo `https://wa.me/…`. Nenhum contato foi definido ou publicado nesta entrega.

## Testes locais

Reutiliza `scripts/admission/run-http-lab.mjs` com a opção `--password-reset`, o dump sintético verificado da A.2.1, o relay de navegador e a captura SMTP TLS da fase 6. Não é executor de publicação.

```text
node --test tests/password-reset-policy.test.mjs tests/account-password.test.mjs
node scripts/admission/run-http-lab.mjs <evidencias-A2.1> <diretorio-novo> --password-reset
```

O ensaio requer Docker local, `PYTHON_EXECUTABLE` apontando ao Python com cryptography já usado no ambiente e Playwright/Edge do ambiente de desenvolvimento. Os containers ficam sem rede externa, sem portas Docker publicadas e são removidos ao final. Somente o relay de navegador usa loopback. Não são lidos `.env` reais nem usados dados ou mensagens de clientes.

As verificações incluem SMTP TLS/AUTH e falha de envio, autorização administrativa, manipulação de destinatário, concorrência na emissão/consumo, expiração, revogação, mudança de credencial, rollback por falha induzida, sessões antigas, dois tenants preservados, termos/contratos/ledger, configuração desabilitada no mesmo build, logs e UI desktop/mobile/Claro/Escuro com mouse, teclado e toque. O teste de restauração integral anterior não é repetido: não há alteração de schema. Uma recuperação operacional de snapshot deve invalidar autorizações pendentes antes de reabrir o ambiente, inclusive por rotação controlada da chave de autenticação quando aplicável.

## Limites para publicação

Esta entrega não habilita reset nem e-mails em HOMOLOG/PROD. Exige novo SHA/artefato e aceite incremental antes de publicar; o OCI homologado anterior permanece preservado. O serviço transacional deve ser operacional e explicitamente autorizado antes de mostrar a ação disponível. Nenhum link será fornecido manualmente como alternativa à indisponibilidade.

## Resultado da validação LOCAL — 01/11/2026

O ensaio final `a2-7-admin-reset/lab-05` passou com PostgreSQL 18 descartável, build Next de produção, SMTP TLS/AUTH capturado e Edge real. Foram aprovados 26 testes unitários/regressivos, 14 grupos HTTP/SMTP e três cenários de navegador. O laboratório manteve as 44 tabelas e os digests dos registros protegidos, incluindo dois tenants da mesma identidade, memberships, permissões, termos, contratos e ledger. Os containers foram removidos ao final.

As imagens desktop/claro e mobile/escuro foram inspecionadas. Mouse, teclado, Tab e toque não fizeram o olho submeter o formulário. A confirmação administrativa não mostrou link ou senha do titular. A configuração transacional independente preservou a Adesão sintética.

Build/TypeScript e lint do código novo passaram. Dois erros de lint `react-hooks/set-state-in-effect` em `PlatformClient` e `AuditClient` já existem no SHA-base e foram confirmados por comparação; não foram refatorados nesta entrega. Os avisos de bibliotecas Auth.js/Edge do build não impediram a compilação nem a autenticação validada no ensaio.

Durante o desenvolvimento foram corrigidos o endpoint de prontidão do laboratório e duas fixtures de teste (campo obrigatório da auditoria e tentativa de alterar evento imutável). O ensaio final aguardou o intervalo real de reenvio. A verificação da configuração revelou o conflito entre SMTP global e a Adesão sintética; o seletor transacional resolveu-o sem alterar o serviço de Adesão. Não houve tentativa remota.

A portabilidade dos três perfis foi verificada no contrato de configuração; o mesmo build foi executado com reset habilitado e desabilitado em LOCAL. Não foi produzido um novo OCI de release nem executado ensaio remoto nesta rodada. Configuração/entrega real do provedor, novo artefato e homologação autorizada continuam necessários antes de publicação.
