# G01 — rotação futura controlada (não executar na Fase 1A)

Responsável operacional deve autorizar uma janela específica para PROD; este
documento não autoriza nenhuma escrita ou restart. Não colocar senhas em comandos,
logs, tickets, Git ou dumps públicos. Não testar a credencial histórica.

1. **Pré-checagem:** identificar host/container/banco/role e todos os consumidores
   sem imprimir URL ou secret. Conferir acesso administrativo independente,
   réplica/pool, backups, observação e responsável pelo rollback. Inventariar
   conexões ativas; aplicações existentes podem continuar com sessões antigas.
2. **Proteção:** pg_dump privado, verificar pg_restore e SHA-256; snapshot conforme
   política. Backup dos ajustes do serviço em storage privado; testar recuperação
   em ambiente isolado. Preservar a versão anterior do secret no vault até o fim.
3. **Preparar:** gerar secret aleatório no gerenciador aprovado; definir janela de
   manutenção ou transição coordenada. Não depender de POSTGRES_PASSWORD do
   container para alterar role existente. Evitar URI sem escape: configurar o
   cliente com parâmetros seguros ou percent-encoding correto na URL privada.
4. **Role/secret:** por sessão administrativa autenticada independente, executar
   `\password <role_aprovada>` no psql interativo (sem eco). Não usar ALTER ROLE
   com literal em argv/histórico. Confirmar política de logs/redaction do servidor
   antes da operação. Atualizar somente os secrets dos consumidores identificados.
5. **Aplicação:** recriar/reiniciar exclusivamente consumidores autorizados na
   ordem planejada, forçando pools novos. Não reiniciar PostgreSQL por conveniência.
6. **Validação:** nova conexão Prisma + SELECT 1 com secret fornecido pelo vault,
   health/schema, smoke de login com titular e leitura autorizada, erros/pools/
   auditoria. Não imprimir secret, URL, hashes ou dados financeiros.
7. **Rollback:** parar tentativas repetidas dos consumidores; pelo canal admin
   independente, restaurar a versão anterior da credencial da role com `\password`,
   restaurar o secret correspondente dos consumidores e recriar pools. Validar
   conexão/health. Restaurar backup de dados não é passo normal de rollback de
   senha; somente sob incidente de dados e autorização separada.
8. **Encerrar:** evidência de horário/responsável/serviços/resultado sem credenciais;
   revogar versão antiga após observação. Manter NO-GO até demais gaps resolvidos.
