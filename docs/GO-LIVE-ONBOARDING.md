# 10S — onboarding do OWNER e do usuário comum

**Estado:** homologação parcial no DEV. Este documento descreve o fluxo implementado e separa lacunas que impedem afirmar que já existe convite/ativação autônoma em produção. Não houve acesso à produção, uso da massa HOM-REAL ou envio de convite real. Consulte também o [runbook de produção](GO-LIVE-RUNBOOK.md) e o [mapa administrativo](GO-LIVE-ADMIN-MAP.md).

## Fluxo disponível hoje

O administrador autorizado cria ou vincula `AuthIdentity` e `TenantMembership` em **Acessos / Usuários**; o PlatformAdmin pode designar o OWNER em **Administração da Plataforma**. Uma identity existente pode receber outro membership sem ser duplicada. Uma identity nova é criada com nome, e-mail e senha informados pelo administrador; a operação cria também o `Usuario` legado e o mapping necessários para o contexto empresarial. O servidor exige perfil do mesmo tenant e revalida identity, tenant, membership, mapping, termos e permissões. Esse provisionamento **não é um convite**: o repositório não tem token, envio de e-mail, prazo de convite ou página para o convidado definir a própria credencial. Não tratar senha escolhida pelo administrador como ativação pelo usuário.

Depois de autenticado, um vínculo empresarial ativo entra diretamente no tenant; dois ou mais vínculos ativos levam a **Selecionar empresa**. O usuário sem membership empresarial ativo vê um estado explícito na seleção. PlatformAdmin sem membership entra na plataforma, sem acesso empresarial automático. A página **Início** (`/inicio`) mostra identidade, tenant, papel e perfil atuais e somente links de telas permitidas; o OWNER recebe atalhos para Usuários/Acessos, Perfis, Auditoria e, se permitidas, Dimensão da Empresa e Financeiras. O atalho de Suporte aparece somente para o OWNER designado responsável contratual. A página é um ponto de entrada simples, **não** afirma que detecta o primeiro login. Documentos obrigatórios pendentes continuam sendo exigidos pelo servidor antes de abrir telas empresariais.

### OWNER

1. PlatformAdmin valida a identidade e **designa OWNER explicitamente** para o tenant correto. Pode promover membership existente ou criar nova identity conforme o fluxo atual. Registrar aprovação no [mapa administrativo](GO-LIVE-ADMIN-MAP.md); não inferir pelo e-mail ou `admin_global` legado.
2. O responsável contratual é designado **separadamente** dentre os OWNERs ativos. Só ele aceita o termo CONTRATANTE e aprova/rejeita/revoga SupportGrant daquele tenant. OWNER não implica automaticamente responsável contratual.
3. O OWNER recebe credencial por procedimento operacional privado aprovado, faz login e seleciona tenant quando houver mais de um. Se há termo USUÁRIO/CONTRATANTE publicado e pendente, passa pelo aceite obrigatório antes do Início.
4. No Início, confere nome/e-mail, tenant, papel e perfil exibidos. Acessa Usuários/Acessos, Perfis, Auditoria e as telas de negócio autorizadas; o responsável contratual também vê o atalho de Suporte. As permissões administrativas essenciais do OWNER vêm do servidor; perfil pode ampliar acesso de negócio apenas conforme matriz aprovada.

### Usuário comum

1. OWNER/ADMIN autorizado escolhe tenant, papel `MEMBER` e Perfil de Acesso ativo do **mesmo tenant**. Se o e-mail corresponde a identity existente, o servidor reutiliza essa identity; se é nova, cria identity e mapping. Esta verificação ocorre em contexto administrativo autenticado, não em página pública.
2. Credencial é entregue pelo procedimento privado aprovado. No login, termo USUÁRIO publicado e pendente leva ao aceite. Um membership ativo entra diretamente; vários mostram a escolha de tenant.
3. O Início mostra o perfil efetivo e as telas liberadas. Se não houver tela disponível, orienta pedir revisão do perfil. Ao trocar tenant, o servidor recalcula papel, perfil, permissões, termos e dados; não reaproveita autorização do tenant anterior.

**Dependência para onboarding realmente autônomo:** ainda faltam convite seguro, token com expiração/uso único, prova de posse do e-mail, definição/redefinição de senha pelo próprio titular e entrega de e-mail. Isso exigirá desenho e aprovação próprios de segurança/credenciais; não foi improvisado nesta rodada. A API administrativa atual distingue alguns estados de identidade existente/inativa para o administrador autorizado. Não há página pública de convite que revele existência de e-mail, mas também não há fluxo público para homologar convite inválido/expirado. Antes do GO de entrada real por convite, essa lacuna é **bloqueante**.

## Estados especiais e resposta esperada

| Estado | Comportamento atual / decisão |
| --- | --- |
| Convite inválido ou expirado | **Não implementado.** Não existe token/página/expiração; não apresentar como cenário homologado. Definir contrato e testes em fase própria. |
| E-mail novo | Administração exige nome e senha de pelo menos 12 caracteres, cria identity/membership/mapping em transação. Titular não define a senha no fluxo atual. |
| E-mail já vinculado a outro tenant | Administração pode reutilizar identity para novo membership, sem duplicá-la. Decisão e consentimento desse vínculo precisam ser operacionalmente verificados antes de produção. |
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
| OWNER novo | Designação explícita; login; termo CONTRATANTE quando responsável designado; Início com atalhos; gestão de usuários/perfis; tenant correto. | Fluxos OWNER/termos cobertos por testes ACCESS anteriores; página Início requer smoke visual final. Convite/ativação pelo titular pendente. |
| Usuário comum novo | Identity/membership/mapping criados; login; termo USUÁRIO; Início; tela permitida e escrita não autorizada = 403. | Provisionamento e guards existentes; smoke de página Início nesta rodada. Convite/credencial própria pendente. |
| Identity existente com novo membership | Uma identity, dois vínculos distintos; sem segunda identity; troca de tenant recalcula perfil. | Coberto pela simulação ACCESS em schema isolado; revisar consentimento operacional. |
| Dois tenants | Tela de escolha; entrar em A/B; perfil e dados isolados; outro tenant = 403. | Coberto pela simulação ACCESS; nova página Início deve refletir tenant escolhido. |
| Identity, tenant ou membership inativo | Login/contexto negado e nenhum acesso por cookie antigo. | Guard existente; repetir HTTP e UI no ensaio de rollout. |
| Perfil sem tela / zero memberships | Início ou seleção com orientação legível; nenhuma permissão inventada. | UX ajustada; verificar Dark/Clean/mobile. |
| Convite inválido/expirado | Erro genérico, sem enumeração, token não reutilizável. | **Não testável:** fluxo de convite inexistente. Bloqueia onboarding por convite. |

Validar manualmente em Dark, Clean, desktop e 414×896: login, seleção de tenant, aceite, Início, links OWNER e estado sem acesso. O teste HTTP não substitui essa inspeção visual. Não gerar convite real, credencial real ou e-mail nesta fase.

**Evidência desta rodada (2026-10-07):** `prisma generate` local, TypeScript e build Next passaram. `scripts/access-final/simulate-dev.mjs` passou **40 verificações**, em schemas PostgreSQL aleatórios descartáveis no DEV: entrada direta com um membership, seleção obrigatória com dois, perfil operacional sem atalhos OWNER, OWNER com atalhos administrativos, Suporte visível apenas para responsável contratual, perfil RH sem link de Lançamentos, bloqueio de identity/membership/tenant inativos e 403 nas APIs não autorizadas. A página Início foi inspecionada no navegador integrado em Clean e Dark, 414×896 e 1366×768, com conta ADMIN DEV: sem overflow horizontal; o cabeçalho mobile foi afastado do botão do drawer. A inspeção visual de OWNER/usuário comum com credenciais próprias, bem como convite/ativação, permanece pendente. O ensaio não enviou e-mail nem validou convites inexistentes.

## Critérios de aceite e pendências

O fluxo de **entrada com credencial previamente provisionada** pode ser aceito para o ensaio quando o OWNER e o usuário comum chegarem ao tenant e somente às telas autorizadas, termos forem exigidos, dois memberships não compartilharem permissões e os erros não revelarem dados de outro tenant. O fluxo de **convite → ativação → senha própria** permanece **NO-GO**, pois não existe mecanismo implementado. Para produção, definir o meio seguro de provisionamento inicial ou aprovar uma implementação específica de convite/reset antes de convidar clientes. O [GO-LIVE-RUNBOOK](GO-LIVE-RUNBOOK.md) continua com os demais bloqueios globais de produção.
