# Importação oficial: contrato e recibos

Contrato `LANCAMENTOS_OFFICIAL`, versão 1. Somente I1 utiliza esta implementação.

## Identidade e atomicidade

O SHA-256 é calculado sobre os campos canônicos na ordem oficial, com cada linha serializada e a lista ordenada. Datas e valores têm representação canônica; códigos continuam texto. A ordenação física das linhas/colunas e a regravação do ZIP não alteram a identidade. Linhas idênticas repetidas **permanecem repetidas**. IDs e revisões participam do digest. O tenant vem exclusivamente da sessão.

A constraint UNIQUE combina tenant, tipo, versão e digest. O lock transacional reduz concorrência; a constraint é a defesa final. Lançamentos e recibo são persistidos na mesma transação serializável. Preview e consulta não escrevem. Uma confirmação repetida retorna o recibo anterior, inclusive antes da validação de revisões que a primeira execução já avançou. Não há confirmação manual para repetir intencionalmente um lote nesta versão.

Versão 1 é congelada. Uma futura mudança de canonicalização/contrato exige estratégia explícita de compatibilidade com recibos anteriores e testes contra reprocessamento. Não basta incrementar a versão para liberar os mesmos lotes.

## Estados e falhas

- READY: prévia válida, ainda sem gravação.
- INVALID: prévia com erros; sem token de confirmação.
- PROCESSING: outra confirmação do mesmo lote está com o lock; consultar.
- UNCONFIRMED: timeout/interrupção/falha de transporte; resultado desconhecido, não rollback presumido.
- COMPLETED: recibo persistido, com contagens históricas da operação.

ImportOperation armazena somente operações concluídas. PROCESSING/UNCONFIRMED são estados da resposta, não registros abandonados no banco. Após resultado ambíguo, consultar ou reenviar o mesmo XLSX; ausência momentânea de recibo não prova rollback. Nunca gerar automaticamente uma operação diferente. O recibo não afirma que os lançamentos continuam inalterados após ações posteriores.

## Dados e retenção

Somente IDs, tipo/versão, dois digests SHA-256, contagens e data de conclusão são armazenados. Nenhum arquivo, célula, valor financeiro, token ou segredo. AuditEvent não é armazenamento operacional.

**Retenção nesta fase: sem expiração e sem limpeza automática.** Recibos integram o backup do tenant. Removê-los reabre duplicação por reenvio tardio. Exclusão futura requer política aprovada, bloqueio do reenvio dos contratos afetados e procedimento auditado; as FKs RESTRICT impedem limpeza incidental do tenant/ator. Não existe job de purge. Rollback de código preserva a tabela; bloquear confirmações se voltar a versão sem idempotência. Não executar DROP de recibos como rollback ordinário.

## Limites e formatos

XLSX até 10 MiB; envelope multipart até 10 MiB + 64 KiB, verificado por header e bytes efetivos antes de formData. Até 10.000 linhas de dados, 64 colunas no envelope, duas abas (LANCAMENTOS obrigatória, INSTRUCOES opcional), 512 entradas ZIP e 64 MiB de expansão total efetiva. ZIP64, criptografia, macros e links externos são rejeitados. Limites reduzem risco de expansão; não constituem garantia geral para qualquer arquivo hostil.

Headers oficiais são obrigatórios, sem extras/duplicatas; ordem física livre. Fórmulas na aba de dados são rejeitadas mesmo com valor em cache; informativas não são avaliadas. Calendários 1900/1904 seguem metadados reais. Códigos numéricos são rejeitados: não inventar zeros perdidos. Valores numéricos com formato monetário são aceitos; texto com prefixo R$ é rejeitado. Zero é permitido; negativos e parsing parcial são rejeitados. DRE é somente leitura; CONT. é 1 na criação e não faz parte do XLSX editável.

Transação: timeout 120 s e espera de conexão 10 s. Cliente: 180 s. Proxy HOMO planejado: 150 s e 11 MiB; alterações de proxy pertencem à branch operacional separada, somente após validação.

## Validação / implantação

Migration aditiva 20261024_import_operation: 14 → 15, sem UPDATE dos lançamentos. Obrigatório laboratório PostgreSQL/HTTP, build Linux, novo backup HOMO com restore comprovado e guarda de ambiente antes de aplicação remota. Este documento descreve o contrato; o relatório privado FASE5A-EXCEL-LANCAMENTOS.md registra resultados efetivamente executados e pendências. Não implica homologação concluída.
