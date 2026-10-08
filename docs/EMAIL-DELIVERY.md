# 10S — entrega de convites por e-mail

## Arquitetura e estado

As rotas de convite chamam `deliverAndAuditInvitation`, que usa `EmailServiceConfig` e um adapter. O primeiro adapter real é SMTP via Nodemailer; não há parâmetro da Hostinger no código. Um provider futuro pode implementar a interface de envio sem alterar as rotas, o token ou o modelo de convite. O banco guarda somente SHA-256 do token. O e-mail leva o link no momento da emissão; a URL completa não entra em AuditEvent ou log.

Nenhum e-mail de produção foi enviado nesta fase. Em homologação DEV local, o primeiro provedor real foi a conta `acesso@dezsolucoes.com.br` hospedada na Hostinger. A senha fica somente no `.env.local` ignorado pelo Git.

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
4. Para testar SMTP real, configure as variáveis em ambiente privado, envie apenas para destinatário controlado e confirme recebimento. Não reutilize credenciais reais no ensaio isolado; o script fixa `mock` e valores SMTP de fixture.

## Homologação SMTP real no DEV local

Em 07/10/2026, o DEV local usou `smtp.hostinger.com:465` com `SMTP_SECURE=true`, remetente `10S | Dez Soluções <acesso@dezsolucoes.com.br>` e `APP_PUBLIC_URL=http://localhost:3000`. A conexão TLS 1.3 e a autenticação SMTP foram aceitas. Não foi necessário usar a alternativa 587/STARTTLS. O e-mail simples de teste e o convite real foram aceitos pelo SMTP; o destinatário confirmou recebimento de ambos no **Lixo Eletrônico**. O convite real foi aceito no tenant Dez Soluções DEV e gerou identidade e membership de teste com perfil CONSULTA. Esses fatos de DEV não comprovam entregabilidade na Caixa de Entrada de outros provedores ou em produção.

No DEV consultado não havia TermVersion publicada, portanto a ativação não exigiu aceite de termo. O perfil CONSULTA semeado no DEV permite Lançamentos e Relatórios em leitura, mas não possui `fluxo.visao.saldos`; a API de resumo da Visão Geral nega os valores. Isso preserva o bloqueio de saldos e deve ser considerado ao escolher um perfil para homologar essa tela. Após o smoke, o membership descartável foi inativado pelo fluxo administrativo; a identidade e os eventos permanecem para preservar a trilha imutável.

A consulta DNS pública, somente leitura, encontrou MX, um SPF com `_spf.mail.hostinger.com`, DMARC e os três CNAMEs DKIM da Hostinger. Nenhum registro DNS foi alterado. A presença dos registros não garante reputação ou colocação na Caixa de Entrada. Se uma mensagem for para o Lixo Eletrônico, confirme remetente, cabeçalhos de autenticação e reputação com o provedor antes de mudar DNS.

### Entregabilidade observada no Hotmail (GO-LIVE-2E)

O cabeçalho real do convite automático registrou `spf=pass`, `dkim=pass`, `dmarc=pass` e `compauth=pass`. `From` e `Return-Path` estavam no mesmo endereço/domínio autenticado. A Microsoft atribuiu `SCL: 5` e `dest:J`/`RF:JunkEmail`, confirmando a classificação como Lixo Eletrônico apesar da autenticação aprovada. O envio manual da mesma caixa também passou SPF/DKIM/DMARC, recebeu `SCL: 1` e chegou à Caixa de Entrada. Ambos passaram pela infraestrutura Hostinger/MailChannels, mas usaram IPs de saída diferentes. O convite automático e o e-mail simples enviado pelo código chegaram ao Lixo Eletrônico. Portanto, a falha não é de SPF/DKIM/DMARC; a causa específica da diferença entre envio manual e automático ainda não está comprovada. Conteúdo, formato e reputação/rota do IP podem influir. O link `localhost` do convite DEV é um possível sinal adicional, mas não explica sozinho o teste simples que também foi classificado como spam. Não houve mudança de DNS, template ou configuração de produção.

O template atual usa `text/plain` e HTML curto, sem rastreamento, imagens remotas ou links encurtados. O convite válido foi inspecionado em viewport 414×896 nos temas Clean e Dark: campos e botão visíveis, largura da página igual à viewport. A fixture de convite mock foi revogada após o teste; nenhum e-mail real foi enviado nessa verificação. Os testes isolados de convites e termos passaram separadamente, sem publicação de termo no tenant DEV real.

## Checklist antes de produção

1. Confirmar a caixa remetente, host, porta, modo TLS e credenciais oficiais do ambiente de produção. Os parâmetros do DEV homologados acima não configuram produção.
2. Guardar secrets fora do Git, conferir permissões e rotação. Configurar `APP_PUBLIC_URL` HTTPS correto.
3. Validar SPF, DKIM e DMARC no domínio com o responsável por DNS. A consulta DEV encontrou os registros, mas não houve alteração de DNS nesta fase.
4. Testar conexão/autenticação e entrega controlada para caixa própria; confirmar HTML e texto, link, expiração e resposta de falha.
5. Executar smoke com identity nova e existente, revogação e reenvio, observando AuditEvent sem segredos.
6. Monitorar rejeições, timeouts e volume de `INVITE_EMAIL_FAILED`. O aceite do SMTP não comprova entrega na caixa; bounce e reclamações futuras exigem integração própria do provider.

Se SMTP não for configurado, desabilite emissão de convites mantendo as operações de leitura/revogação. Não habilite mock fora do DEV isolado. Siga também [GO-LIVE-ONBOARDING.md](GO-LIVE-ONBOARDING.md) e [GO-LIVE-RUNBOOK.md](GO-LIVE-RUNBOOK.md).
