# ACCESS-5B — SupportGrant

## Contrato inicial

- PlatformAdmin administra a plataforma sem receber dados empresariais automaticamente. Um contexto empresarial normal usa `TenantMembership`; um contexto de suporte usa `SupportGrant` e nunca cria membership ou `Usuario` artificial.
- Apenas o responsável contratual designado, com membership `OWNER` ativo, aprova, rejeita ou revoga pelo tenant. O solicitante não aprova o próprio pedido. PlatformAdmin também pode revogar o seu grant ativo.
- Um pedido exige tenant ativo, motivo específico de 15 a 500 caracteres, ao menos uma tela, nível e prazo. Padrão: `READ_ONLY` por 60 minutos. Limites: 15 a 1440 minutos. `OPERATIONAL` deve ser solicitado e aprovado expressamente.
- Os estados persistidos são `PENDING`, `ACTIVE`, `REJECTED`, `REVOKED` e `EXPIRED`. A aprovação ativa imediatamente. O prazo é conferido em cada acesso e a expiração é registrada na primeira consulta posterior, sem depender de job. Rejeição e revogação são terminais.
- O escopo inicial é fechado em **Dimensão da Empresa** e **Dimensões Financeiras**, separadamente. `READ_ONLY` autoriza consulta e exportação da tela aprovada. `OPERATIONAL` acrescenta criação, edição e importação. Exclusão, administração do tenant, Fluxo de Caixa, Lançamentos e saldos não fazem parte do escopo inicial. Antes de habilitar outra tela, revisar todas as APIs que ela usa, dados sensíveis e autoria histórica (`Lancamento.criadoPor` exige `Usuario`).
- A requisição passa pelo guard de contexto, que confere identity, PlatformAdmin ativo, grant, tenant, prazo, método, caminho e termos. O catálogo de permissões continua conferido por ação. O modo de rollback legado não permite mais trocar o tenant de origem nem direcionar a importação legada de Lançamentos para outro tenant.
- Termos individuais publicados são exigidos do PlatformAdmin no modo suporte. Termos contratuais publicados continuam exigidos do responsável designado pelo tenant. O aceite individual não exige membership; o aceite contratual continua reservado ao responsável OWNER.
- Os eventos estruturados mínimos são `REQUESTED`, `APPROVED`, `REJECTED`, `ACTIVATED`, `USED`, `REVOKED`, `EXPIRED`. `USED` é registrado ao entrar no contexto. A auditoria detalhada das operações empresariais pertence à ACCESS-5C.
- Solicitações pendentes aparecem em Acessos / Suporte. Não há infraestrutura de notificação interna nesta fase.

## Migration e rollback

`20261005_access5b_support_grants` apenas cria quatro enums e duas tabelas, índices, FKs e constraints. Não altera nem reescreve cadastros existentes. Foi aplicada no banco DEV local após validação em schema descartável.

Rollback operacional preferencial: interromper novos pedidos, revogar grants ativos e desabilitar a seleção de suporte na aplicação; a guarda de prazo e status impede reutilização dos grants. Para rollback estrutural, guardar primeiro um snapshot privado das duas tabelas e seus eventos, remover a versão da aplicação que as consulta e, em janela aprovada, derrubar `support_grant_events`, depois `support_grants`, depois os quatro enums. Não executar esse DROP em produção sem revisão e retenção do histórico. A migração não inclui DROP automático.

## Validação

`scripts/access5b/test-dev.mjs` cria schema PostgreSQL local aleatório, aplica todas as migrations, sobe o build em porta isolada, cria identidades e tenants fictícios, testa pedidos, decisões, contexto, escopos, leitura, escrita, expiração, revogação, isolamento e termos; depois remove o servidor e o schema. Não usa a massa HOM-REAL.
