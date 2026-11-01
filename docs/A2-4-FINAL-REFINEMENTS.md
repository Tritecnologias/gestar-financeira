# A.2.4 — Aceite de Ricardo e refinamentos finais

Data: 01/11/2026. Branch preservada: `feat/a2-4-admission-journey`.
Base aprovada e inicialmente limpa: `1cf8b0fc7bf779fc2f0946bc60a67d97f44c8474`.
Ricardo confirmou o aceite funcional e visual da jornada, condicionado aos três
refinamentos desta entrega. Os commits anteriores foram preservados.

## 1. Senha visível somente durante a pressão

`PasswordInput` foi reaproveitado com a opção `holdToReveal`, habilitada somente
nos campos **Crie sua senha** e **Confirme sua senha** da adesão. Login, Minha conta,
senha de identidade existente e ativação por convite operacional mantêm seus modos
anteriores; nenhuma política de autenticação ou criação de senha mudou.

No novo modo, pressionar com mouse/toque revela; soltar, cancelar, sair do controle,
perder a captura, perder o foco/interação ou ocultar a página esconde. O controle
continua `type="button"`, com clique sem alternância persistente e sem submit.
A pressão não transfere o foco do campo para o olho.

Foi reaproveitada a navegação sequencial do UX04: **senha → confirmação → Confirmar
identidade**, sem paradas adicionais nos olhos. No campo, manter **Alt+Shift+V**
pressionado revela; liberar uma das teclas oculta. O controle também responde a
Espaço/Enter quando recebe foco por tecnologia assistiva. A instrução está ligada
aos campos por `aria-describedby`, o atalho é declarado e a visibilidade anunciada.
Alvos de 44 px, captura de ponteiro e cancelamento de toque são preservados.

## 2. Confirmação do espaço junto ao Termo do Usuário

A própria tela existente de documentos informa:

> Identidade confirmada. Seu espaço foi criado automaticamente.
>
> Siga com os documentos e as etapas contratuais obrigatórias para liberar o acesso.

O aviso aparece no contexto MEMBERSHIP com Termo do Usuário pendente, somente
quando o endpoint existente de Admission confirma **PROVISIONED** para o mesmo
tenant da sessão. O UUID em `sessionStorage` é apenas uma referência; não comprova
criação ou autoridade. Falha de leitura não bloqueia nem substitui a tela contratual.

Não há nova etapa, botão de confirmação, atraso artificial ou mudança no
provisionamento. O formulário e os destinos já presentes no commit aprovado
continuam iguais. Não se anuncia criação antes da confirmação persistida pelo
servidor. Os guards, aceites e bloqueio operacional permanecem os existentes.

## 3. Conferência dos textos homologados

Antes dos ajustes, os quatro componentes abaixo eram byte a byte idênticos à
revisão UX04 `2c8072a` (inclusive a introdução específica do Termo de Contratação):

| Componente | Blob Git na revisão homologada e na base A.2.4 |
|---|---|
| `TermsAcceptanceClient.tsx` | `514de3e8b5b05ab1c54c7e558630ddf6e553818a` |
| `TenantModalityClient.tsx` | `9dceaba2a76fde6052da3c2d6d3830af1cc3498c` |
| `ContractualOnboardingClient.tsx` | `8889dcc42d7c21052156f904068c22a41dc9195f` |
| `TermDocumentDialog.tsx` | `6ea4b4b7c85393730e4f1a044e97c33a698a2108` |

A consulta somente de leitura à prévia LOCAL confirmou os códigos
`TERM_USUARIO`/`USUARIO` e `TERM_CONTRATANTE`/`CONTRATANTE`, que selecionam os textos
aprovados. Ambos os documentos publicados no laboratório tinham título
`SINTETICO A23 SEM VALOR CONTRATUAL` e versão `synthetic-a23`; o PDF contém somente
o aviso sintético de teste. Essas são diferenças intencionais dos dados/documentos.

Não foi identificada divergência das orientações da interface. Nenhum texto
homologado foi reescrito. Em `TermsAcceptanceClient`, foi apenas acrescentado o
aviso separado da adesão e seu parâmetro de contexto. As introduções, PF/PJ,
responsável, leitor, retorno e aceites permanecem preservados. Nenhum conteúdo
jurídico real, documento, versão ou contrato formalizado foi alterado.

## Validação LOCAL

Evidências e hashes: `docs/evidence/a2-4-final-refinements.json`.
Execução aceita: `C:/Users/ricar/Documents/Codex/a2-4-refinements/lab-01`.
Runner reutilizado: `app/scripts/admission/run-http-lab.mjs`, com `--journey`.
O laboratório novo restaura a fundação sintética conferida por hash, usa PostgreSQL
e Next em namespace Docker sem rede externa, e abre somente a ponte de navegador
em `127.0.0.1:3020`. E-mails são capturados localmente, sem mensagens reais.

A suíte do Edge foi ampliada para verificar:

- Os dois olhos com pressão/soltura do mouse, saída do controle, atalho de teclado,
  liberação de modificador, Espaço/Enter no controle, perda de foco e evento de blur.
- Toque mantido, soltura e cancelamento pelo protocolo real de toque do Chromium.
- Tab direto entre os campos e o botão de confirmar; zero POST de identidade,
  autenticação ou provisionamento causado pelos olhos; valores dos campos preservados.
- Layouts 1366×900 e 390×844 em Claro/Escuro. Não equivale a teste em aparelho físico
  ou certificação por leitor de tela.
- Confirmação na tela do Termo do Usuário, rejeição de referência de storage forjada,
  manutenção da leitura contratual e continuidade PF/PJ sem etapa adicional.
- Correspondência exata das introduções USUARIO/CONTRATANTE, dos textos PF/PJ e
  da explicação do responsável com o UX04; documentos continuam sintéticos.
- Jornadas nova/existente, preservação de senha e vínculos, tenant único,
  concorrência/repetição, resposta perdida, retomada e bloqueios contratuais.
- Alternância anterior do olho no login preservada, sem habilitar o novo modo nessa tela.

As regressões HTTP existentes cobrem autorização/desafios (70), provisionamento
(118), Convites Especiais (36), ativação operacional (50) e contratação/retorno
(265): **539 verificações**. TypeScript, lint dos arquivos afetados, build Next
e dump/restore das 44 tabelas complementam a validação.

Resultado: **539 verificações HTTP e 50 verificações no Edge aprovadas**, com
18 capturas. TypeScript, lint e build aprovados. Os dados das **44 tabelas**
restauradas são idênticos por digest ordenado. Containers descartáveis removidos
ao final; nenhuma prévia antiga permanece necessária para reproduzir as evidências.

As suítes antigas dependentes de bancos externos e o hook externo opcional da
Fase 12A permanecem fora desta execução exclusivamente LOCAL. Não houve ampliação
de ACLs de produto, migration nova ou alteração dos serviços A.2.1–A.2.3.

## Parecer e limites

**GO técnico para a validação integrada**, com os três refinamentos aplicados e
validados em LOCAL. A.2.5 permanece dependente de autorização expressa. Recuperação autônoma de conta,
preparação de e-mail/ambientes e implantação continuam pendências antes da publicação.

PROD, HOMOLOG, master, landing e contratos reais permanecem intocados. Não houve
push, deploy, migration remota, checkout ou funcionalidade de outro pacote.
Concluídos os refinamentos, parar e aguardar autorização para A.2.5.
