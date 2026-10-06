# ACCESS-5C — auditoria central de acesso

## Contrato

`AuditEvent` registra ações de autenticação, administração de tenants e acessos, termos e SupportGrant. A origem é `MEMBERSHIP`, `PLATFORM_ADMIN`, `SUPPORT_GRANT` ou `SYSTEM`. Eventos empresariais possuem `tenantId`; vínculos e grants usam FK composta com o tenant para impedir associação cruzada. A consulta do tenant exige `acessos.auditoria.view` e força o tenant da sessão. O responsável OWNER recebe essa permissão essencial; outros perfis a recebem explicitamente. A plataforma consulta apenas eventos globais, seus atos administrativos e eventos ligados a grants; não recebe livre acesso à atividade empresarial comum de outros tenants.

O banco bloqueia `UPDATE` e `DELETE` de `audit_events` por trigger. Alterações posteriores geram novos eventos. A UI e a API não oferecem edição ou exclusão. A migration é aditiva e inclui índices para tenant, ator, ação, grant e data. `SupportGrantEvent` permanece como registro pontual anterior; `AuditEvent` é a visão central. `TermAcceptance` continua sendo a evidência jurídica de aceite, com hash e demais campos próprios. A auditoria do aceite é apenas um evento vinculado à versão.

Mudanças administrativas críticas gravam ação e audit event na mesma transação. Se o registro de auditoria falhar, a ação é revertida. Expiração e decisões de suporte também são atômicas. Login, logout e tentativas negadas são observacionais: falha de telemetria não transforma credencial válida em senha inválida nem permite acesso proibido. Tentativas de suporte fora do escopo são registradas antes da negativa. Acesso autorizado à API em modo suporte é registrado pelo guard; para escrita o evento `SUPPORT_ACTION_AUTHORIZED` descreve a autorização da requisição, e não confirma o resultado final da operação empresarial. Auditoria detalhada de mutações financeiras fica para fase própria.

`metadata` e `changes` são construídos por lista explícita de campos relevantes e recebem uma segunda verificação de nomes sensíveis. Nunca copiar senha, hash, token, cookie, PDF ou credencial. Nesta fase não se guarda IP nem User-Agent na auditoria. `TermAcceptance` preserva seus próprios dados jurídicos. Filtros são somente leitura; não há exportação de auditoria nesta rodada, reduzindo a superfície de exposição.

Os eventos são preservados no DEV. Não há purge automático nem prazo de retenção arbitrário; retenção, armazenamento externo e eliminação legal exigem política futura. O teste integrado usa schema descartável separado e não acessa HOM-REAL.

## Migração e rollback

`20261005_access5c_audit_events` cria dois enums, tabela, índices, FKs e trigger. Não reescreve registros preexistentes nem cria histórico retroativo. Rollback operacional: interromper a versão que grava/consulta auditoria, conservar a tabela e os eventos para investigação. Rollback estrutural somente após snapshot privado e decisão de retenção: remover a versão da aplicação dependente, desabilitar o trigger em janela controlada, exportar o histórico, então remover tabela, função e enums na ordem inversa. Não executar DROP automático ou rollback físico em produção sem revisão.

## Limites conhecidos

As rotas de identidade global atualmente oferecem consulta, não ativação/desativação; esses eventos ficaram reservados para quando a operação oficial existir. O modo legado de rollback permanece separado da administração por `AuthIdentity`. O teste de UI Dark/Clean/mobile precisa de inspeção visual no navegador autorizado; build e renderização HTML não substituem essa validação.
