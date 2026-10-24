# Contrato comum de importação de estruturas — Fase5B

## Domínios e transporte

I2–I6 compartilham `structure-import-route`, `structure-workbook`, `structure-fingerprint` e `useStructureImportRequest`. Parsers, validação de vínculos e gravação continuam específicos por domínio. I1 mantém contrato/digest/versionamento anteriores; a única extensão em seu leitor ZIP permite configurar o número de abas, mantendo duas como padrão.

Todos os endpoints exigem permissão de importar no tenant efetivo, tenant selecionado e suporte operacional quando aplicável. Prévia não grava cadastros nem recibos. Confirmação exige token HMAC de dez minutos vinculado a conteúdo, contrato, tenant e usuário, revalida dentro da transação e preserva os locks dos alocadores existentes. Os recibos e todos os cadastros do lote são confirmados juntos. Conflitos retornam 409; falhas de resultado desconhecido retornam `UNCONFIRMED`, nunca sucesso presumido nem rollback presumido.

Estados: `INVALID`, `READY`, `PROCESSING`, `UNCONFIRMED`, `COMPLETED`. Não existe registro operacional parcialmente concluído: ausência de recibo durante processamento/timeout não prova rollback. Reenviar **o mesmo arquivo** consulta primeiro o recibo existente. Arquivo concluído retorna totais anteriores e não reaplica atualizações. Repetição intencional é funcionalidade futura; não orientar a adulterar o lote para contornar a proteção.

## Arquivos

- XLSX até 10 MiB; multipart até 10 MiB + 64 KiB, medido antes de `formData`.
- ZIP até 512 entradas e expansão real total até 64 MiB; sem ZIP64, criptografia, macros, external links ou entidades XML.
- Até 10.000 registros no conjunto das abas de dados e 250.000 células físicas nessas abas. Cada aba até 10.001 linhas e 64 colunas, inclusive ranges esparsos. Linhas vazias formatadas do modelo não são registros.
- I2/I3/I5: até três abas; I4: duas; I6: cinco, incluindo `INSTRUCOES`. Abas de negócio têm nomes exatos. `INSTRUCOES` é opcional, exceto I5, que preserva a exigência anterior.
- Cabeçalho em A1; trim/uppercase; ordem livre; conhecido exatamente uma vez. Coluna extra ou dado em coluna sem cabeçalho bloqueia. Não há aliases silenciosos.
- Código é texto em **todos** os domínios. Número/boolean/erro não é convertido em identificador nem recebe zeros inventados. O modelo mantém colunas de código em formato Texto.
- Fórmulas, inclusive com cache, e fórmulas matriciais nas abas processadas bloqueiam com aba, endereço e campo. Não há avaliação de fórmula no servidor.
- Modelo vazio está disponível em `exportar?template=1`, com a mesma permissão de exportação. Exportação normal preserva os cadastros ativos e as verificações de legado existentes.

## Idempotência sem nova migration

Reutiliza `ImportOperation` com `STRUCTURE_FINANCIAL`, `STRUCTURE_MANAGEMENT`, `STRUCTURE_PEOPLE`, `STRUCTURE_REGISTRATION`, `STRUCTURE_PRODUCT`, versão 1, e UNIQUE `(tenantId, contractType, contractVersion, payloadDigest)`.

I2/I3/I4 fazem upsert por código: reenvio não deveria duplicar, mas poderia desfazer edição posterior. I5/I6 geram códigos para linhas novas sem código: reenvio após timeout poderia duplicar cadastros. Todos recebem recibos atômicos e lock por operação; I2/I5/I6 mantêm também os locks compartilhados com os cadastros manuais.

Canonicalização: multiconjunto de linhas normalizadas pelo parser, com chaves ordenadas, ignorando número da linha/apresentação e preservando multiplicidade de linhas idênticas legítimas. No portfólio, referências `@N` são convertidas em arestas da árvore Grupo→Tipo→Linha/Item antes da ordenação; reordenar linhas e ajustar referências preserva o digest, sem colapsar irmãos idênticos. Instruções, formatação e ordem física de cabeçalhos não integram o digest.

Recibo contém somente identificadores operacionais, digests, ator, totais e instante. Não armazena arquivo, nome/documento/email/valores de registros, token ou segredo. Detalhes de códigos recém-criados podem aparecer na primeira resposta, mas não são persistidos no recibo; reenvio retorna totais e permite consultar/exportar os cadastros.

Retenção segue Fase5A: indefinida, sem limpeza automática. Remover um recibo permitiria repetir lote antigo; qualquer futura política de expurgo deve preservar tombstone/digest e ser aprovada separadamente. Mudança semântica do contrato requer versão deliberada e avaliação de compatibilidade de reenvio.

## Regras preservadas

- N1 nova: código manual de dois dígitos; N2 respeita categoria e tipo. Não há correspondência por descrição.
- Área/CC e Pessoa: códigos do tenant; CC opcional em Pessoa, ativo quando informado. Pessoa não cria identidade, login, membership ou permissão.
- Clientes e Fornecedores continuam distintos; nomes/documentos similares geram avisos existentes, não fusão automática. Documento é normalizado para comparação de duplicidade; conteúdo original é preservado. Não existe validação matemática de CPF/CNPJ nesta fase. Sua introdução depende de decisão futura de produto.
- Portfólio: novos códigos automáticos e referências `@N` para pais do mesmo arquivo; Linha opcional conforme contrato existente. Inativos não são reativados; ausência no arquivo não exclui cadastros.
- Pessoa ainda guarda Centro de Custo como nome em `departamento`, sem FK. Exportação já bloqueia nome ausente/ambíguo, evitando inventar um código. A decisão sobre renomeações vinculadas está pendente durante a validação desta fase; não há migration nem reconstrução silenciosa de vínculo.

## Rollout e evidências

Somente branch `homologacao` e banco `gestar_financeira_homolog`. Migrations permanecem 15. Backup/restore atualizado obrigatório antes do smoke remoto. Suíte local força falha no último estágio para comprovar rollback; triggers de teste nunca são instaladas na HOMOLOG. Smoke remoto usa apenas contas sintéticas e cadastros prefixados F5B nos dois tenants de teste. Lançamentos Fase4A/Fase5A, identidades reais e concessões são comparados antes/depois.

Critério de fechamento: testes automatizados, build/artefato, smoke HOMO e aceite manual agrupado de Ricardo. Este documento não constitui aceite manual nem autorização para produção.
