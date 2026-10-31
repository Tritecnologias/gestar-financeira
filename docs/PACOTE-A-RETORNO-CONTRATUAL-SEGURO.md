# Pacote A — retorno contratual sem DELETE

Implementação exclusivamente local, sobre `2c8072a17d64a76aef64b51d484fe89bf0b5f612`.
Publicação, ACL e dados remotos dependem de autorização posterior.

## Contrato mínimo

“Voltar à escolha” cancela a decisão SELF ainda provisória, sem apagar sua
designação. Atualiza somente `tenant_contractual_onboarding` para CANCELLED e
retém `assignedMembershipId` e `assignedAt` como fotografia exata da designação
cancelada. O registro em `tenant_contractual_responsibles` permanece intacto.
A auditoria append-only registra antes/depois da decisão.

O leitor único `currentContractualResponsible` considera essa fotografia sem
autoridade somente quando o onboarding não está ASSIGNED, o vínculo e o instante
correspondem exatamente à designação e não existe nenhum aceite CONTRATANTE no
tenant, inclusive de versões históricas. Uma nova indicação OTHER transporta a
fotografia até a substituição; uma nova escolha SELF ou a conclusão do indicado
atualiza a designação e torna o onboarding ASSIGNED. Assim, uma escolha cancelada
não volta a autorizar aceites durante a espera pelo indicado.

Designações sem onboarding (legadas/administrativas) continuam válidas. A
contingência administrativa limpa a fotografia e reassina explicitamente a
designação, mesmo quando o membro é o mesmo. Nenhuma identidade, membership ou
permissão é criada por “Voltar”. Convites continuam seguindo o fluxo existente.

## Autorização e concorrência

O ator vem exclusivamente da sessão identity/MEMBERSHIP/OWNER. Dentro da mesma
transação SERIALIZABLE são revalidados tenant ativo, vínculo OWNER ativo e
identidade ativa, com bloqueio das respectivas linhas. Exigem-se Termo do Usuário,
modalidade resolvida e a própria escolha SELF, iniciada e atribuída ao ator.
Qualquer aceite contratual histórico impede o retorno.

Escolha, retorno, designação administrativa e aceite utilizam o mesmo advisory
lock por tenant. O endpoint de aceite consulta novamente a designação efetiva
dentro da transação: uma tela anterior ao retorno não conserva autoridade. Uma
disputa termina com uma operação válida e conflito/rejeição da concorrente,
nunca com exclusão de evidência. As APIs não aceitam tenant/ator arbitrários no
payload do retorno.

A apresentação dos termos e a abertura de solicitações de suporte também usam o
leitor efetivo. Os demais leitores de designação são áreas operacionais já
protegidas pelo gate contratual. Nenhuma autoridade definitiva é ampliada.

## Permissões, schema e backup

- Nenhum DELETE físico de responsável e nenhum GRANT novo.
- Nenhuma função SQL privilegiada, SECURITY DEFINER ou contexto SQL confiado ao
  chamador.
- UPDATE já existente no onboarding; INSERT/UPDATE de responsáveis somente nos
  fluxos de designação existentes; INSERT na auditoria existente.
- Aceites e auditoria continuam append-only; runtime não recebe DDL/ownership.
- Nenhuma migration, coluna, enum, versão de backup ou ledger novo.
- Backup v3 já inclui onboarding e responsáveis como referências autenticadas,
  nunca como seções restauráveis. A fotografia é preservada nas referências.
  Divergências de governança continuam falhando com RECONCILIATION: não converter
  nem reassinar backups antigos para contornar esse bloqueio.

## Provas locais requeridas

Executar com PostgreSQL 18.6, aplicação compilada, Prisma/HTTP reais e runtime sem
DELETE em responsáveis/onboarding e sem UPDATE/DELETE nos aceites/auditoria:
SELF → retorno → OTHER; formulário OTHER → voltar → SELF; revogação de indicação
pendente; aceite stale após retorno; pessoa indicada substituindo a fotografia;
contrato formalizado; usuário indevido; outro tenant; concorrência retorno/aceite;
contingência administrativa no mesmo OWNER; backup/preview/restore/replay,
HMAC/tampering, NULL/zero/centavo e tenant vizinho; navegação desktop/mobile,
Claro/Escuro, PDFs, teclado e controles de senha preservados.

Resultados e SHA final serão registrados no diretório externo de evidências
`C:\Users\ricar\Documents\Codex\ux04-safe-return`, após execução.

## Plano de HOMOLOG — não executado

1. Solicitar aprovação do novo SHA após a revisão das provas locais.
2. Guarda read-only de SHA, fila, ledger H6, ACL restrita, documentos/aceites e
   governança existentes; backup recuperável da janela pelo procedimento vigente.
3. Construir/verificar o perfil HOMOLOG com identidade amarela/preta e ledger H6;
   nenhuma migration, função SQL ou alteração de ACL é necessária.
4. Publicar somente o novo SHA autorizado em HOMOLOG e executar os dois caminhos
   em fixtures sintéticas, seguida de inspeção manual de Ricardo.
5. Confirmar que contratos já formalizados permanecem iguais e sem retorno.

Não voltar ao binário antigo após criar uma fotografia cancelada: ele desconhece
essa semântica e pode tratar a linha retida como designação atual. Contingência
deve preservar o leitor corrigido (roll-forward); eventual recuperação integral
da janela exige autorização e prova própria, sem exclusão manual de referências.
Isso deve ser incorporado ao próximo gate de publicação. PROD permanece fora do
escopo desta rodada.
