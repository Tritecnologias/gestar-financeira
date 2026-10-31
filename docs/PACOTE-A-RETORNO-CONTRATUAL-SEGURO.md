# Pacote A — retorno contratual sem DELETE

Implementação exclusivamente local, sobre `2c8072a17d64a76aef64b51d484fe89bf0b5f612`.
Publicação, ACL e dados remotos dependem de autorização posterior.

## Contrato mínimo

“Voltar à escolha” cancela a decisão SELF ainda provisória, sem apagar sua
designação. Atualiza `tenant_contractual_onboarding` para CANCELLED e limpa seus
campos de designação, preservando integralmente as CHECKs existentes. No registro
retido de `tenant_contractual_responsibles`, altera somente o novo campo nullable
`provisionalCancelledAt`; vínculo, autor da designação e data original permanecem.
A auditoria append-only registra antes/depois da decisão.

O leitor único `currentContractualResponsible` considera a designação cancelada
sem autoridade quando existe o marcador e não existe nenhum aceite CONTRATANTE no
tenant, inclusive de versões históricas. Uma nova indicação OTHER preserva esse
marcador até a substituição; uma nova escolha SELF ou a conclusão do indicado
limpa o marcador, atualiza a designação e torna o onboarding ASSIGNED. Uma escolha cancelada
não volta a autorizar aceites durante a espera pelo indicado.

Designações sem onboarding (legadas/administrativas) continuam válidas. A
contingência administrativa limpa o marcador e reassina explicitamente a
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
- UPDATE já existente no onboarding e em responsáveis, INSERT/UPDATE nos fluxos
  de designação existentes e INSERT na auditoria existente.
- Aceites e auditoria continuam append-only; runtime não recebe DDL/ownership.
- Migration aditiva `20261031_contractual_choice_return`, somente proposta para
  os ambientes remotos: uma coluna `provisional_cancelled_at timestamp(3)` nullable,
  sem default, backfill, alteração de CHECK/FK ou ACL. SHA-256:
  `bf1553ef0a2cdaeb4a38f0fb9e1bb8a695dd37d47b306e9c85014e0fcf5e1f28`.
  Os SQLs dos catálogos HOMOLOG/PROD são idênticos, com guard dos históricos exatos
  H6/P5, PG18, lock timeout 5s, statement timeout 60s e transação explícita.
  O guard aceita a entrada em execução da própria migration, criada pelo Prisma,
  e rejeita qualquer outra pendência. O ensaio H6 → H7 ocorre somente no clone.
- Ledgers futuros H7/P6; formato continua v3. Nenhuma aplicação remota autorizada.
- Backup v3 já inclui onboarding e responsáveis como referências autenticadas,
  nunca como seções restauráveis. O marcador é preservado nas referências.
  H7/P6 aceitam somente backups do próprio ledger/perfil. Backups H6/P5 não serão
  convertidos nem reassinados: falham SCHEMA_VERSION após a evolução. Divergências
  de governança no mesmo ledger continuam falhando com RECONCILIATION.

A primeira tentativa local, sem coluna nova, foi rejeitada pela CHECK
`contractual_onboarding_state_check`, que exige campos de designação vazios em
CANCELLED/PENDING. A transação foi revertida; a prova foi preservada. Não se
afrouxou essa CHECK para obter PASS. O SHA intermediário b1bd9ed não é publicável.

## Provas locais requeridas

Executar com PostgreSQL 18.6, aplicação compilada, Prisma/HTTP reais e runtime sem
DELETE em responsáveis/onboarding e sem UPDATE/DELETE nos aceites/auditoria:
SELF → retorno → OTHER; formulário OTHER → voltar → SELF; revogação de indicação
pendente; aceite stale após retorno; pessoa indicada substituindo a designação;
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
3. Após autorização específica, aplicar somente a migration acima pelo migrator
   separado, H6 → H7, sem mudança de ACL; conferir checksums e ausência de pending/failed.
4. Construir/verificar o perfil HOMOLOG amarelo/preto e ledger H7. Publicar somente
   o novo SHA autorizado em HOMOLOG e executar os dois caminhos
   em fixtures sintéticas, seguida de inspeção manual de Ricardo.
5. Confirmar que contratos já formalizados permanecem iguais e sem retorno.

Não voltar ao binário antigo após criar uma designação cancelada: ele desconhece
essa semântica e pode tratar a linha retida como designação atual. Contingência
deve preservar o leitor corrigido (roll-forward); eventual recuperação integral
da janela exige autorização e prova própria, sem exclusão manual de referências.
Isso deve ser incorporado ao próximo gate de publicação. PROD permanece fora do
escopo desta rodada.
