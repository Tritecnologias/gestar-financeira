# 10S — entrega de convites por e-mail

## Arquitetura e estado

As rotas de convite chamam `deliverAndAuditInvitation`, que usa `EmailServiceConfig` e um adapter. O primeiro adapter real é SMTP via Nodemailer; não há parâmetro da Hostinger no código. Um provider futuro pode implementar a interface de envio sem alterar as rotas, o token ou o modelo de convite. O banco guarda somente SHA-256 do token. O e-mail leva o link no momento da emissão; a URL completa não entra em AuditEvent ou log.

Nenhum e-mail de produção foi enviado nesta fase. O primeiro provedor planejado é a conta de e-mail da Dez Soluções hospedada na Hostinger, **depois** que os parâmetros oficiais forem fornecidos e aprovados.

## Variáveis

| Variável | Uso |
| --- | --- |
| `EMAIL_PROVIDER` | `smtp` para entrega real; `mock` apenas no DEV isolado. Ausente no DEV isolado equivale a `mock`; fora dele, a emissão retorna 503. |
| `SMTP_HOST` | Host SMTP fornecido pelo provedor. |
| `SMTP_PORT` | Porta numérica de 1 a 65535. |
| `SMTP_SECURE` | `true` para TLS imediato; `false` exige STARTTLS. |
| `SMTP_USER` | Usuário SMTP. |
| `SMTP_PASSWORD` | Senha SMTP. |
| `EMAIL_FROM_ADDRESS` | Remetente autorizado pelo provedor. |
| `EMAIL_FROM_NAME` | Nome visual; padrão `10S · Dez Soluções`. |
| `APP_PUBLIC_URL` | Origem pública da aplicação, sem caminho, query ou fragmento. Fora do DEV exige HTTPS. |
| `ACCESS_INVITE_HOURS` | Validade do convite: padrão 72, mínimo 1, máximo 168 horas. |

No DEV isolado (`127.0.0.1:55432/gestar_vf_dev` + requisição local), `APP_PUBLIC_URL` pode omitir-se; nesse caso usa a origem da requisição. Para SMTP real, configure a URL explicitamente. Segredos ficam apenas em `.env.local` no DEV ou no gerenciador seguro de ambiente futuramente. O `.gitignore` ignora `.env.local` e `.env.*`, com exceção dos exemplos sem segredo.

## Comportamento

- **SMTP `SENT`:** o provedor aceitou o destinatário; a API responde `delivery.status=SENT`, audita `INVITE_EMAIL_SENT` e não devolve o link bruto.
- **DEV `SIMULATED`:** nenhum e-mail é enviado; a API responde `delivery.status=SIMULATED`, audita `INVITE_EMAIL_SIMULATED` e mostra o link de fixture uma vez ao administrador autorizado.
- **`FAILED`:** convite continua pendente, a API informa `delivery.status=FAILED`, audita `INVITE_EMAIL_FAILED`, não expõe erro técnico/credenciais nem diz “enviado”. O administrador pode reenviar, gerando token e prazo novos.

Há limite de **três emissões por tenant/e-mail em 15 minutos**, aplicado sob lock no banco. A quarta tentativa retorna 429 sem revogar o convite pendente. Revogação não depende da configuração SMTP. Tokens antigos são invalidados no reenvio.

O e-mail contém versões HTML responsiva e texto simples, o nome do tenant, botão/link de ativação, prazo e orientação para ignorar convites inesperados. Não contém senha, papel ou perfil. O link mantém o token no fragmento `#token=`, para não enviá-lo no GET inicial; a página de ativação o remove da barra de endereço e usa o corpo das requisições de inspeção/aceite.

## Ensaio DEV sem envio externo

1. Use banco DEV local isolado e `EMAIL_PROVIDER=mock`. Não configure credenciais reais para este ensaio.
2. Execute `node --test scripts/access2c/test-email.mjs` e `node --env-file=.env.local scripts/access-final/simulate-dev.mjs` na pasta `app`.
3. A simulação cria schemas descartáveis, valida mock, auditoria, reenvio, rate limit e falha de conexão SMTP em `127.0.0.1:1`, sem entregar e-mail. Os schemas/fixtures são removidos no final.
4. Para testar SMTP real quando houver caixa de **teste**, configure as variáveis em ambiente privado, envie apenas para destinatário controlado e confirme recebimento das duas partes MIME. Esse teste não foi executado nesta fase por ausência de credenciais/provedor de teste.

## Checklist antes de produção

1. Criar/autorizar a caixa remetente e obter host, porta, modo TLS e credenciais oficiais do provedor.
2. Guardar secrets fora do Git, conferir permissões e rotação. Configurar `APP_PUBLIC_URL` HTTPS correto.
3. Validar SPF, DKIM e DMARC no domínio com o responsável por DNS. Não houve alteração de DNS nesta fase.
4. Testar conexão/autenticação e entrega controlada para caixa própria; confirmar HTML e texto, link, expiração e resposta de falha.
5. Executar smoke com identity nova e existente, revogação e reenvio, observando AuditEvent sem segredos.
6. Monitorar rejeições, timeouts e volume de `INVITE_EMAIL_FAILED`. O aceite do SMTP não comprova entrega na caixa; bounce e reclamações futuras exigem integração própria do provider.

Se SMTP não for configurado, desabilite emissão de convites mantendo as operações de leitura/revogação. Não habilite mock fora do DEV isolado. Siga também [GO-LIVE-ONBOARDING.md](GO-LIVE-ONBOARDING.md) e [GO-LIVE-RUNBOOK.md](GO-LIVE-RUNBOOK.md).
