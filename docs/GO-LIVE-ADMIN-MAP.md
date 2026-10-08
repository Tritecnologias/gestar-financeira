# 10S — mapa de decisões administrativas para produção

**Estado:** modelo de decisão, sem nomes ou vínculos reais aprovados. Branch de referência: `implantacao/corporate-tech-estrutura-empresa`. Este arquivo não autoriza criação de contas, promoção de papéis, alteração de tenants ou ativação do novo ACCESS. Preencher após inventário e validação humana, em processo privado aprovado. O procedimento técnico está no [GO-LIVE-RUNBOOK](GO-LIVE-RUNBOOK.md).

## 1. Como preencher e aprovar

Uma `AuthIdentity` representa o login; cada `TenantMembership` liga essa identidade a **um** tenant, com papel estrutural `OWNER`, `ADMIN` ou `MEMBER` e um `AccessProfile` **do mesmo tenant**. `PlatformAdmin` é uma concessão separada da plataforma. Ele pode também ter membership empresarial, mas esse vínculo precisa ser criado e aprovado expressamente. Sem membership, o acesso normal aos dados de um tenant não existe; suporte temporário usa `SupportGrant` autorizado, não cria membership.

Preencher primeiro a lista de tenants legítimos, depois identidades e memberships, então papéis/perfis e responsáveis contratuais. Usar IDs técnicos ou referências privadas para distinguir homônimos; não versionar e-mail real, documento, senha, hash ou dados pessoais aqui. A ata privada de decisão deve conter o identificador exato e o aprovador de cada concessão. **Nenhuma linha deste modelo executa ou infere uma designação.**

| Marco administrativo | Evidência exigida | Quem decide | Estado inicial |
| --- | --- | --- | --- |
| Inventário de tenants/identidades | Dry-run de produção somente leitura, conflitos classificados, estado ativo conferido | DBA + responsável de negócio | PENDENTE |
| PlatformAdmins | Identidade legítima, motivo e escopo administrativo aprovados | Responsável de negócio + revisor técnico | PENDENTE |
| OWNER e responsável contratual por tenant | Membership ativo, identidade validada e designação expressa | Responsável legítimo do cliente + operação autorizada | PENDENTE |
| ADMINs e membros iniciais | Relação com tenant, papel e perfil aprovados | OWNER do tenant + operação autorizada | PENDENTE |
| Perfis iniciais e dados sensíveis | Matriz de permissões revisada, teste de negação e segregação | OWNER + revisor técnico | PENDENTE |
| Termos | PDFs oficiais, versão, reaceite, publicação e volume privado | Jurídico + administrador autorizado | PENDENTE |

## 2. Decisões por tenant

Duplicar a linha **por cada tenant real identificado no inventário**; não preencher com nomes de tenants do DEV nem presumir que o inventário DEV representa produção. Na ata privada, relacionar o código/referência de cada linha ao ID do tenant e às identities verificadas. `OWNER adicional` é opcional; `OWNER principal` e responsável contratual exigem decisão explícita para liberar a jornada contratual. O responsável contratual precisa ser um `OWNER` ativo designado e pode ser diferente do OWNER principal.

| Tenant (ref. privada) | Tenant ativo? | OWNER principal (ref. identity + membership) | OWNER adicional | Responsável contratual (ref. identity + membership) | ADMINs (refs.) | PlatformAdmin relacionado* | Situação | Motivo/observação sem dados pessoais |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A inventariar | A confirmar | A decidir | A decidir / não aplicável | A decidir | A decidir | A decidir / não aplicável | **PENDENTE** | Aguardando dry-run real e decisões assinadas. |

\* “Relacionando” significa responsável operacional pela plataforma, não membership ou acesso empresarial automático. Registrar separadamente, na seção 3, quais tenants ele acessa por membership e quais só poderiam ser atendidos mediante `SupportGrant`.

**Registro de designação contratual, em ata privada:** tenant/identity/membership exatos; OWNER ativo; quem designou; data/hora efetiva **futura**; versão contratual e aceite posterior. Não lançar data fictícia neste mapa. A mesma pessoa pode acumular OWNER e responsável contratual, mas a designação precisa ser explícita.

## 3. PlatformAdmin e fronteira com suporte

Nenhum nome é inferido de `admin_global` legado. O dry-run pode apontar candidatos técnicos; elegibilidade técnica não é aprovação. Preencher uma linha por concessão pretendida após validar identidade, função e justificativa. Uma concessão PlatformAdmin não deve servir como “acesso universal” de suporte.

| Identity (ref. privada) | Função e motivo da concessão | Status da identity | Tem membership empresarial? Quais tenants? | Tenants sem membership que exigiriam SupportGrant | Aprovadores / data | Decisão |
| --- | --- | --- | --- | --- | --- | --- |
| A decidir | A justificar | A conferir | A conferir | A identificar, caso a caso | A registrar | **PENDENTE** |

Para cada acesso de suporte: PlatformAdmin solicita com motivo, telas e prazo; o **responsável contratual OWNER ativo** daquele tenant aprova ou rejeita; conferir escopo, expiração, revogação e auditoria. No escopo atual, `SupportGrant` cobre somente Dimensão da Empresa e Dimensões Financeiras. `READ_ONLY` permite consulta/exportação; `OPERATIONAL` acrescenta criação/edição/importação. Não cobre exclusão, administração do tenant, Fluxo de Caixa ou Lançamentos. Não conceder membership artificial para contornar esse processo.

## 4. Memberships, ADMINs e usuários comuns iniciais

Uma linha por par `identity × tenant`, inclusive quando a mesma identity participa de dois tenants. `OWNER` não é sinônimo de perfil amplo; `ADMIN` não substitui OWNER nem pode se autopromover; `MEMBER` recebe apenas as permissões do perfil. Perfil sempre pertence ao mesmo tenant. Separar status da identity, do tenant, do membership e do perfil, pois qualquer um pode bloquear o acesso.

| Identity (ref. privada) | Tenant (ref. privada) | Papel `OWNER`/`ADMIN`/`MEMBER` | Perfil de Acesso no tenant | Status identity/tenant/membership/perfil | Limites e dados sensíveis | Aprovador / data | Decisão |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A inventariar | A inventariar | A decidir | A decidir | A confirmar | A definir | A registrar | **PENDENTE** |

**ADMIN do tenant:** registrar explicitamente quais usuários `MEMBER` pode administrar, se terá `acessos.usuarios.view/manage`, `acessos.perfis.view/manage`, acesso à auditoria e quais ações de negócio. O papel estrutural `ADMIN` permite gestão limitada; o perfil define permissões de telas/ações. Revisar em teste que ADMIN não altera OWNER, não vira PlatformAdmin e não ultrapassa seu tenant. Proteger o último OWNER ativo.

### Cenário ilustrativo de identidade compartilhada

| Identity ilustrativa | Tenant ilustrativo | Membership | Perfil ilustrativo | Interpretação |
| --- | --- | --- | --- | --- |
| Pessoa de exemplo | Tenant A | `MEMBER` | `FINANCEIRO OPERACIONAL` | Opera apenas conforme permissões do Tenant A. |
| **Mesma** pessoa de exemplo | Tenant B | `ADMIN` | `FINANCEIRO GERENTE` | Papel/perfil são recalculados ao trocar para o Tenant B. |

Este cenário representa o exemplo RENAN/HIGH e RENAN/THE HOME usado nos testes ACCESS; **não é uma decisão sobre identidades ou tenants reais de produção**. Nenhum vínculo deve ser criado com base nele. Login único não duplica a identity e não compartilha dados dos dois tenants.

## 5. Catálogo inicial enxuto de perfis — proposta para revisão

Os cinco perfis abaixo existem como **exemplos configuráveis semeados apenas no DEV** por `app/scripts/access4/seed-dev-profiles.mjs`. Não presumir que existam ou sejam adequados em produção; decidir por tenant e revisar o catálogo efetivo de `app/src/lib/access-catalog.ts`. A tabela expressa o comportamento da seed de DEV, **não uma concessão a aplicar automaticamente**. `OWNER` mantém permissões administrativas essenciais independentemente do perfil; revisar essa combinação no smoke.

| Perfil sugerido | Objetivo; módulos/telas | Ações propostas com base no DEV | Dados sensíveis / limites a aprovar |
| --- | --- | --- | --- |
| `ADMINISTRAÇÃO` | Administração abrangente do tenant; todas as telas do catálogo de permissões atual. | Seed DEV usa `ALL_PERMISSIONS`, inclusive gestão de usuários/perfis, configuração e operações de negócio. | **Alto privilégio.** Não é PlatformAdmin; revisar necessidade de saldos, exclusão, import/export, dados pessoais e segregação. Não usar como padrão geral. |
| `FINANCEIRO GERENTE` | Fluxo de Caixa: Visão Geral, Lançamentos, Relatórios, Análises; leitura de Dimensão da Empresa e Financeiras. | Seed DEV usa todas as ações `fluxo.*`, inclusive saldos, criação, edição, exclusão, import/export e edição em massa; leitura das duas dimensões. | Saldos e mutações financeiras são sensíveis. Confirmar se todas as ações são realmente necessárias; pode exigir perfil mais restrito. |
| `FINANCEIRO OPERACIONAL` | Operação de Lançamentos, Visão Geral e leitura da Dimensão Financeira. | `fluxo.visao.view`, `fluxo.lancamentos.view/create/edit/bulk_edit`, `estrutura.financeiras.view`; **sem** `fluxo.visao.saldos`, exclusão, importação ou exportação. | Saldo indisponível, mas detalhes dos lançamentos continuam acessíveis. Validar isso com o dono do processo. |
| `RH` | Consulta à Dimensão de Pessoas. | `estrutura.pessoas.view` somente. | Cadastro-base de Pessoas pode conter dados pessoais; confirmar necessidade e escopo. Sem Lançamentos/Financeiro no exemplo DEV. |
| `CONSULTA` | Leitura financeira sem saldo. | `fluxo.visao.view`, `fluxo.lancamentos.view`, `fluxo.relatorios.view`; sem escrita e sem `fluxo.visao.saldos`. | Ainda lê linhas financeiras. Definir se a consulta é apropriada ao usuário; sem dados pessoais de Pessoas no exemplo. |

Não tratar os nomes como catálogo imutável: perfis são configuráveis por tenant e podem ser mais restritos. Ações exigem a respectiva permissão `.view`. Verificar permissões para telas, API direta e campos sensíveis; esconder menu não basta. `ACESSO LEGADO` e `ACESSO LEGADO MEMBRO` são perfis de compatibilidade criados/alterados por migrations e devem ter concessões revisadas separadamente antes da produção. Nenhum perfil empresarial concede acesso de plataforma.

## 6. Termos e responsável contratual

| Documento | Decisões pendentes | Evidência para readiness |
| --- | --- | --- |
| CONTRATANTE | PDF jurídico definitivo; versão; `requiresReaccept`; público/obrigatoriedade; quem publica; data de vigência. | Responsável contratual designado com membership `OWNER` ativo por tenant; PDF privado persistente; hash e restore; aceite posterior. |
| USUÁRIO | PDF jurídico definitivo; versão; `requiresReaccept`; público/obrigatoriedade; quem publica; data de vigência. | Publicação autorizada, armazenamento privado e teste de aceite/reaceite pela identity. |

O responsável contratual é **um vínculo por tenant**, não um papel global da identity. O aceite individual do termo USUÁRIO é por identity/versão; o aceite CONTRATANTE exige a identidade/membership OWNER designada. Mudança de responsável exige novo aceite conforme contrato implementado. Não criar conteúdo jurídico ou publicar rascunho para vencer um bloqueio de rollout.

## 7. Readiness por tenant

| Estado | Quando atribuir | Ação seguinte |
| --- | --- | --- |
| **PRONTO** | Tenant legítimo/ativo confirmado; identity e membership verificados; OWNER e responsável contratual aprovados e ativos; perfis/matriz revisados; conflitos resolvidos; termos e smoke aplicáveis prontos. | Submeter ao GO técnico/jurídico; “PRONTO” administrativo não substitui o GO global do runbook. |
| **PENDENTE** | Falta decisão ou evidência obtível sem risco imediato, como nomear ADMIN, escolher perfil, confirmar identity ou publicar termo definitivo. | Registrar dono e prazo, coletar evidência; não ativar esse tenant no novo fluxo enquanto a pendência for obrigatória. |
| **BLOQUEADO** | Identity/e-mail conflituoso sem resolução; OWNER/responsável ausente no momento de ativação; perfil incompatível/cross-tenant; termo/storage indisponível; resultado de dry-run ou integridade contraditório. | NO-GO para o tenant e, se compartilhado por auth/termos, para o rollout; resolver causa e repetir validações. |

Modelo de acompanhamento **sem dados pessoais**:

| Tenant (ref. privada) | Estado | Motivo objetivo | Responsável pela decisão | Evidência privada | Próxima revisão |
| --- | --- | --- | --- | --- | --- |
| A inventariar | **PENDENTE** | Aguardando inventário e dry-run real. | A designar | A registrar fora do Git | A agendar |

## 8. Checklist de liberação administrativa

- [ ] Inventário read-only do banco real conciliado com lista de tenants ativos/inativos e identities; conflitos de e-mail/hashes classificados **sem divulgação em Git**.
- [ ] Cada PlatformAdmin legítimo aprovado; memberships empresariais separados; necessidade de SupportGrant explicitada por tenant.
- [ ] Cada tenant a ativar possui OWNER principal, OWNER adicional se desejado e responsável contratual OWNER ativo, todos aprovados expressamente.
- [ ] ADMINs, usuários comuns e respectivos perfis de acesso definidos por membership e tenant; status da identity/tenant/membership/perfil conferidos.
- [ ] Perfis iniciais revisados a partir do catálogo efetivo; privilégios sensíveis e perfis legados de compatibilidade aprovados.
- [ ] PDFs CONTRATANTE/USUÁRIO, versões, `requiresReaccept`, publicador, storage e backup/restore aprovados.
- [ ] Testes de dois tenants autenticados, ADMIN sem poderes de OWNER, PlatformAdmin sem dados empresariais, suporte autorizado e 403 negativos aprovados.
- [ ] Cada tenant classificado PRONTO/PENDENTE/BLOQUEADO; responsáveis e decisões registrados em ata privada; GO global segue [GO-LIVE-RUNBOOK](GO-LIVE-RUNBOOK.md).

**Situação deste modelo:** PENDENTE para todos os tenants reais, pois nenhum inventário ou decisão de produção foi executado nesta fase. Não extrapolar dados do DEV. Nenhuma promoção ou concessão automática é autorizada.
