# Fase 4A — procedimento operacional sintético

Executar somente em laboratório isolado ou `gestar_financeira_homolog`, depois de backup/restauração validada, migration 14 e conferência do SHA. Nunca executar no DEV privado, produção ou banco com lançamentos legítimos sem revisar a guarda.

`run.cjs` sem `--apply` apenas confere ambiente. `--apply` cria referências/lançamentos prefixados FASE4A nos dois tenants de teste, verifica as APIs e deixa sete lançamentos sintéticos no MODO DEV para a checagem manual. Usa as identidades de fixture `phase3a-*@example.invalid`; credenciais temporárias aleatórias são mantidas exclusivamente em memória, restauradas no `finally` e sessões encerradas. Nenhum perfil, membership ou permissão é ampliado. Não usar credenciais de Ricardo.

Arquivos operacionais ficam fora do artefato. O wrapper privado deve conferir o banco, metadata do artefato e fornecer `PHASE4A_EXPECTED_SHA`. Nunca imprimir env, cookies, hashes ou tokens. Falha interrompe o teste; não reexecutar cegamente pois a guarda impede duplicação. Inspecionar e preservar evidência antes de escolher nova fixture/laboratório.

## Contrato

- `revisao bigint`, default 0, incrementada em cada UPDATE por trigger. `v1:<revisao>` é opaco, não uma data. Inline exige `versao`; massa devolve `versions` na prévia e exige as mesmas na confirmação; XLSX usa `REGISTRO_VERSAO`.
- CAS sempre inclui ID, tenant e revisão; transações serializáveis revertem integralmente em conflito. Nenhum timestamp histórico é truncado. Arquivos antigos com versão timestamp devem ser reexportados; não há fallback inseguro para milissegundos.
- Valores não negativos, zero permitido, até 13 inteiros e 2 decimais. Decimal brasileiro aceito sem parse parcial/arredondamento silencioso. Datas civis reais ISO/BR; serial Excel adaptado somente na borda XLSX.
- Categoria/Conta, Cliente/Fornecedor, Status Manual e Centro de Custo controlados pelo tenant. Centro de Custo continua tecnicamente textual: novos valores são códigos ativos; texto legado inalterado é preservado.
- DRE somente leitura inclusive modal/API/XLSX; exporta valor legado e exige preservação. CONT.=1 em novas linhas, sem alteração manual ou limpeza de legado. Massa mantém whitelist.

## Rollback

Antes da migration, pg_dump privado e restore isolado com comparação. Guardar imagem anterior. Migration é aditiva; rollback de aplicação pode manter coluna/trigger, mas reintroduz a lacuna antiga de concorrência e deve suspender escrita operacional. Não remover coluna/trigger nem restaurar banco com novas gravações automaticamente. Rollback de banco exige revisão das fixtures e autorização; produção está fora deste procedimento.
