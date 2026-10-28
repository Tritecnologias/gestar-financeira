# Fase 11C — leitura integrada dos termos oficiais

O PDF oficial é exibido na própria experiência de aceite: modal amplo no desktop e tela cheia no mobile, com rolagem, zoom, download e ações de concordância no rodapé. A prévia administrativa usa o mesmo leitor em modo de consulta, sem criar aceite.

## Integridade e versionamento

Os PDFs publicados continuam externos ao Git, privados e imutáveis. Não houve alteração de conteúdo, nova versão jurídica, migration ou mudança das regras de autorização/aceite.

| Documento V1 | SHA-256 preservado |
| --- | --- |
| TERM_CONTRATANTE | `d4f6917a93541407a8fdd9e8e989e4bc381aba1d210285f5a4a97b38ac7dc80e` |
| TERM_USUARIO | `4c4d56a03c487c7f553b381cc5f73b8fc4475c636eec1cbf2048a43c72fdb53b` |

Os DTOs de pendência incluem o hash oficial. O download autenticado identifica versão e hash por headers; o navegador verifica esses valores e calcula SHA-256 dos bytes recebidos antes da exibição. A renderização e o download utilizam esses mesmos bytes verificados. Texto acessível é extraído do próprio PDF, sem manter cópia jurídica em HTML ou no código.

PDF.js 5.5.207 está fixado no lockfile, compatível com o Node 20 existente e sem achados nas novas dependências na auditoria npm desta rodada. Core e worker são servidos pela própria aplicação; não há CDN. O leitor utiliza a renderização de páginas, sem interpretar ações de formulário ou scripts do documento, e desabilita avaliação dinâmica.

Checkbox e botão permanecem indisponíveis até o PDF ser verificado e exibido. Fechar a leitura ou mudar de documento limpa a concordância. Antes do POST, a UI consulta novamente as pendências e exige a mesma versão e o mesmo hash; se a publicação mudou, exige leitura da versão atual. O POST continua enviando somente o ID da versão exibida e a concordância. O servidor mantém a validação de vigência e o lock transacional existentes; uma troca após a consulta de pendência continua retornando 409, sem aceitar a versão nova silenciosamente.

`required=true`, `requiresReaccept=true`, responsabilidade contratual e auditoria append-only permanecem como antes. Os dois aceites humanos V1 já existentes na HOMOLOG serão preservados. Nenhuma evidência precisa ser apagada ou reaberta para conferir a UX.

## Validação local

- 41 testes afetados de armazenamento, segurança, suporte, assessoria, navegação e backup passaram.
- 11 provas em navegador real sobre Linux/Node 20 passaram: consulta administrativa sem aceite; PDF e download idênticos; teclado/foco; hash adulterado; versão divergente; desktop/mobile em Claro/Escuro; checkbox por documento; suporte pessoal; assessoria; publicação durante leitura; corrida entre conferência e POST com rejeição 409.
- PDFs V1, evidências anteriores e regras do servidor permaneceram intactos. Fixtures e concessões locais de teste foram encerradas.
- Build Linux, TypeScript e artifact verifier passaram. A validação do SHA final e a guarda da HOMOLOG são registradas nas evidências operacionais fora do Git.

## Publicação e aceite visual

Publicação autorizada somente em HOMOLOG, com SHA fixado, auto-deploy OFF e nenhuma migration. A janela tem snapshot privado de banco/volumes. O rollback de código pode retornar ao SHA `c53e59d26052042be8a0b037f227018e1a96337c`, preservando banco, PDFs e aceites.

Como Ricardo já aceitou as duas V1, a conferência visual pode ocorrer em Plataforma → Termos e Políticas → Visualizar PDF. Essa prévia não apresenta ação de aceite administrativo. O fluxo pendente com checkbox e botão é comprovado pelas provas sintéticas; nenhum aceite humano é fabricado para demonstrá-lo.

A decisão sobre a publicação em PROD permanece pendente. PROD/master continuam no SHA anterior; não há provisionamento real nesta rodada.
