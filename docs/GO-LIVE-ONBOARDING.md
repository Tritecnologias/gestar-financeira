# 10S — onboarding do OWNER e do usuário comum

**Estado:** convite e ativação implementados e ensaiados em DEV isolado. A entrega por e-mail ainda não existe; emissão de links está limitada por código ao PostgreSQL DEV local (`127.0.0.1:55432/gestar_vf_dev`) e origem local. Portanto, o fluxo de convite permanece **NO-GO em produção** até integrar e aprovar um canal de entrega privado. Não houve acesso à produção, uso da massa HOM-REAL ou envio de convite real. Consulte também o [runbook de produção](GO-LIVE-RUNBOOK.md) e o [mapa administrativo](GO-LIVE-ADMIN-MAP.md).

## GO-LIVE-2B — convite seguro

O modelo `AccessInvite` é aditivo. Guarda tenant, e-mail normalizado, nome, papel proposto, perfil do mesmo tenant, estado, **somente SHA-256 do token**, prazo e autoria do convite/aceite/revogação. A migration `20261007_access_invitations` cria FKs, índices e unicidade parcial de convite pendente por tenant/e-mail; não altera identidades, memberships ou dados empresariais existentes. O convite é apenas intenção: **não cria membership ACTIVE antes do aceite**.

O token vem de 32 bytes aleatórios, uso único, com prazo configurável por `ACCESS_INVITE_HOURS` (padrão **72 horas**, mínimo 1 e máximo 168). O link DEV usa fragmento `#token=`, que não entra no GET do servidor; a página move o segredo para `sessionStorage` temporário, remove o fragmento do histórico e envia o token somente no corpo das chamadas de inspeção/aceite. O armazenamento da aba é limpo após aceite ou erro definitivo. A transação serializável consome o estado `PENDING` uma única vez, valida novamente tenant e perfil e cria identity/membership/`Usuario` legado/mapping de forma atômica. Convite expirado ou revogado não ativa nada; reenvio invalida o link anterior e gera novo convite/token/prazo.

Em **Acessos / Usuários**, OWNER ou ADMIN autorizado informa nome, e-mail, papel permitido e perfil. ADMIN só pode convidar MEMBER; OWNER pode conceder papel administrativo. A tela não pergunta se o e-mail já existe nem pede senha. Convites pendentes, expirados, aceitos e revogados são listados com ações coerentes. Na **Plataforma**, um OWNER novo é convidado sem senha; promoção de membership já existente continua explícita. O antigo POST de provisionamento direto em `/api/access/memberships` responde 410, e o bootstrap de OWNER novo com senha administrativa foi desabilitado.

O titular abre `/ativar-acesso`. Se o e-mail ainda não tem `AuthIdentity`, define senha própria de 12 a 200 caracteres; o servidor grava apenas bcrypt e cria a identidade na transação de aceite. Se já tem identity, precisa autenticar-se com **essa mesma identidade**; a senha e o registro de identity existentes não mudam. E-mail de outra sessão é recusado. Após o aceite, um usuário novo entra no Início; uma identity existente escolhe tenant. O gate ACCESS-5A exige os termos aplicáveis antes do uso normal: aceitar convite **não** registra `TermAcceptance`.

ACCESS-5C registra `INVITE_CREATED`, `INVITE_REVOKED`, `INVITE_EXPIRED`, `INVITE_ACCEPTED`, `IDENTITY_ACTIVATED` e `MEMBERSHIP_ACTIVATED`, além de `OWNER_ASSIGNED` quando aplicável. Nenhum AuditEvent recebe token ou senha. O convite não registra senha em texto, não envia senha e não publica segredo em documentação. A mensagem pública de token inexistente é genérica; um token válido, mas expirado, recebe orientação para pedir novo link.

**Entrega de e-mail:** não há SMTP/provedor no repositório. No DEV local, o administrador autorizado recebe o link de uso único na resposta da criação/reenvio e pode copiá-lo por canal privado de teste; ele desaparece após fechar/atualizar a tela. Em produção, a API recusa emissão com 503 enquanto não houver integrador de entrega aprovado. Copy sugerida: “Você recebeu acesso ao 10S para a empresa X. Use o link abaixo para concluir seu acesso.” Não incluir senha, papel ou permissões. O integrador futuro deve entregar o link ao e-mail destinatário e nunca persistir o token em logs.

**Rollback operacional:** antes de aplicar a migration, guardar snapshot privado do banco e validar a janela conforme o runbook. A migration pode permanecer instalada se a ativação de convites for suspensa; bloquear a emissão e revogar convites pendentes, preservando identidades, vínculos aceitos e AuditEvents imutáveis. Reverter o schema exigiria remover primeiro convites e o enum em janela controlada, após avaliar registros aceitos e auditoria; não há `DROP` automático no rollback desta fase. O modo `ACCESS_AUTH_MODE=legacy` continua como alternativa de autenticação do runbook, mas não processa aceite de convite.

## Fluxo disponível hoje

O administrador autorizado cria um convite em **Acessos / Usuários**; o PlatformAdmin pode convidar o primeiro OWNER em **Administração da Plataforma**. O titular conclui a ativação. Uma identity existente recebe novo membership sem ser duplicada; uma nova identity, `Usuario` legado e mapping são criados apenas após o aceite. O servidor exige perfil do mesmo tenant e revalida identity, tenant, membership, mapping, termos e permissões. A promoção de membership já existente para OWNER continua explícita.

Depois de autenticado, um vínculo empresarial ativo entra diretamente no tenant; dois ou mais vínculos ativos levam a **Selecionar empresa**. O usuário sem membership empresarial ativo vê um estado explícito na seleção. PlatformAdmin sem membership entra na plataforma, sem acesso empresarial automático. A página **Início** (`/inicio`) mostra identidade, tenant, papel e perfil atuais e somente links de telas permitidas; o OWNER recebe atalhos para Usuários/Acessos, Perfis, Auditoria e, se permitidas, Dimensão da Empresa e Financeiras. O atalho de Suporte aparece somente para o OWNER designado responsável contratual. A página é um ponto de entrada simples, **não** afirma que detecta o primeiro login. Documentos obrigatórios pendentes continuam sendo exigidos pelo servidor antes de abrir telas empresariais.

### OWNER

1. PlatformAdmin valida a identidade e **designa OWNER explicitamente** para o tenant correto. Pode promover membership existente ou convidar novo titular. Registrar aprovação no [mapa administrativo](GO-LIVE-ADMIN-MAP.md); não inferir pelo e-mail ou `admin_global` legado.
2. O responsável contratual é designado **separadamente** dentre os OWNERs ativos. Só ele aceita o termo CONTRATANTE e aprova/rejeita/revoga SupportGrant daquele tenant. OWNER não implica automaticamente responsável contratual.
3. O OWNER recebe o link por canal DEV privado, define senha se for identity nova e seleciona tenant quando houver mais de um. Se há termo USUÁRIO/CONTRATANTE publicado e pendente, passa pelo aceite obrigatório antes do Início.
4. No Início, confere nome/e-mail, tenant, papel e perfil exibidos. Acessa Usuários/Acessos, Perfis, Auditoria e as telas de negócio autorizadas; o responsável contratual também vê o atalho de Suporte. As permissões administrativas essenciais do OWNER vêm do servidor; perfil pode ampliar acesso de negócio apenas conforme matriz aprovada.

### Usuário comum

1. OWNER/ADMIN autorizado escolhe tenant, papel `MEMBER` e Perfil de Acesso ativo do **mesmo tenant**, gerando convite pendente. Identity existente será reutilizada; nova identity e mapping nascerão somente no aceite. A tela administrativa não informa ao convidador qual cenário se aplica.
2. O titular abre o link. Se for novo, define senha; se já tiver identity, faz login normal. O termo USUÁRIO publicado e pendente leva ao aceite após a ativação. Um membership ativo entra diretamente; vários mostram a escolha de tenant.
3. O Início mostra o perfil efetivo e as telas liberadas. Se não houver tela disponível, orienta pedir revisão do perfil. Ao trocar tenant, o servidor recalcula papel, perfil, permissões, termos e dados; não reaproveita autorização do tenant anterior.

**Dependência restante para onboarding autônomo em produção:** integrar e aprovar a entrega de e-mail e o procedimento de suporte/redefinição de senha. O link DEV entregue manualmente ao administrador não prova, sozinho, posse da caixa postal. Não usar essa modalidade para clientes reais.

## Estados especiais e resposta esperada

| Estado | Comportamento atual / decisão |
| --- | --- |
| Convite inválido ou expirado | Token inexistente recebe resposta genérica; token expirado é marcado `EXPIRED`, auditado e não pode ser aceito. |
| E-mail novo | Administração cria convite sem senha; titular define senha de 12–200 caracteres e ativa identity/membership/mapping no aceite. |
| E-mail já vinculado a outro tenant | Convite não duplica identity. O titular autentica a conta existente e aceita o novo vínculo; senha permanece igual. |
| E-mail já vinculado ao mesmo tenant | Servidor rejeita vínculo duplicado. |
| Identity inativa | Login negado; o provisionamento administrativo não a reativa silenciosamente. Mensagem pública de login permanece genérica. |
| Tenant ou membership inativo | Não aparece entre vínculos ativos; contexto anterior é revalidado e negado. Seleção informa ausência de acesso ativo. |
| Mapping legado ausente/inativo | Contexto empresarial é bloqueado; requer saneamento administrativo. |
| Zero memberships | Seleção mostra ausência de acesso empresarial; PlatformAdmin ativo pode acessar somente plataforma. |
| Múltiplos memberships | Escolha explícita de tenant; troca revalida papel/perfil e rejeita tenant sem vínculo. |
| Termo pendente | Gate do servidor leva ao aceite; documento não acionável mostra motivo e impede prosseguir. |
| Perfil sem acesso a uma tela | Guard de rota/API nega; Início não oferece link da tela e aponta revisão de perfil quando não há tela de trabalho. |

Mensagens de autenticação pública devem continuar genéricas para não indicar se um e-mail existe. Não revelar existência de identity de outro tenant em nova interface pública. `PlatformAdmin` e `SupportGrant` não substituem membership normal.

## Smoke de primeiro acesso em DEV

Usar fixtures sintéticas em schema DEV isolado, com host/banco conferidos e limpeza ao final. Nunca usar HOM-REAL como fixture de escrita. Para cada caso, registrar HTTP, estado visual, tenant/perfil efetivo, links disponíveis e resultado negativo da API direta.

| Cenário | Evidência mínima | Estado desta rodada |
| --- | --- | --- |
| OWNER novo | Designação explícita; login; termo CONTRATANTE quando responsável designado; Início com atalhos; gestão de usuários/perfis; tenant correto. | Convite PlatformAdmin → OWNER, senha própria e OwnerEvent passaram em HTTP isolado. Termos/visual com titular ainda requerem smoke final. |
| Usuário comum novo | Identity/membership/mapping criados; login; termo USUÁRIO; Início; tela permitida e escrita não autorizada = 403. | Convite, senha própria, login, tenant e permissão passaram em HTTP isolado. Termos/visual com titular ainda requerem smoke final. |
| Identity existente com novo membership | Uma identity, dois vínculos distintos; sem segunda identity; troca de tenant recalcula perfil. | Aceite autenticado, senha preservada e dois tenants cobertos no ensaio isolado. |
| Dois tenants | Tela de escolha; entrar em A/B; perfil e dados isolados; outro tenant = 403. | Coberto pela simulação ACCESS; nova página Início deve refletir tenant escolhido. |
| Identity, tenant ou membership inativo | Login/contexto negado e nenhum acesso por cookie antigo. | Guard ACCESS testado; tenant inativo bloqueia novo aceite. Repetir UI no rollout. |
| Perfil sem tela / zero memberships | Início ou seleção com orientação legível; nenhuma permissão inventada. | UX ajustada; verificar Dark/Clean/mobile. |
| Convite inválido/expirado | Erro controlado, token não reutilizável. | HTTP homologado em schema isolado; visual pendente. |

Validar manualmente em Dark, Clean, desktop e 414×896: login, seleção de tenant, aceite, Início, links OWNER e estado sem acesso. O teste HTTP não substitui essa inspeção visual. Não gerar convite real, credencial real ou e-mail nesta fase.

**Evidência GO-LIVE-2 (2026-10-07):** `prisma generate` local, TypeScript e build Next passaram. `scripts/access-final/simulate-dev.mjs` passou **40 verificações**, em schemas PostgreSQL aleatórios descartáveis no DEV: entrada direta com um membership, seleção obrigatória com dois, perfil operacional sem atalhos OWNER, OWNER com atalhos administrativos, Suporte visível apenas para responsável contratual, perfil RH sem link de Lançamentos, bloqueio de identity/membership/tenant inativos e 403 nas APIs não autorizadas. A página Início foi inspecionada no navegador integrado em Clean e Dark, 414×896 e 1366×768, com conta ADMIN DEV: sem overflow horizontal; o cabeçalho mobile foi afastado do botão do drawer. A inspeção visual de OWNER/usuário comum com credenciais próprias, bem como convite/ativação, permanece pendente. O ensaio não enviou e-mail nem validou convites inexistentes.

## Critérios de aceite e pendências

O fluxo de **convite → ativação → senha própria** está implementado e testado no DEV isolado. Para uso real, permanecem a integração segura de e-mail, o smoke visual completo com titulares e as aprovações do [GO-LIVE-RUNBOOK](GO-LIVE-RUNBOOK.md). A emissão em produção continua bloqueada por código até existir entrega aprovada.

**Evidência GO-LIVE-2B:** `scripts/access-final/simulate-dev.mjs` passou **76 verificações** em schema aleatório descartável do DEV, incluindo deploy da migration, OWNER convidado pela plataforma, identidade nova e existente, hash/expiração, ausência de membership antes do aceite, role de ADMIN, perfil cross-tenant, token inválido/usado/revogado/expirado, reenvio, tenant inativo, e-mail divergente e dois aceites concorrentes. O script remove o schema e as fixtures ao terminar. A regressão ACCESS-5A passou 61 verificações; ACCESS-5B/5C passou 90 após atualizar uma fixture legada de Categoria N1 para o código atual de dois dígitos. TypeScript e build Next passaram. A tela pública de **link inválido** foi inspecionada em Dark/Clean, desktop e 414×896 sem overflow; as telas com convite válido e o aceite jurídico completo ainda precisam de smoke visual com titular em ambiente apropriado. Nenhuma credencial ou token de fixture foi exposto no navegador integrado.
