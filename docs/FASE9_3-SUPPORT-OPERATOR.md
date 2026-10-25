# Fase 9.3 — SupportOperator e consolidação local

Base: `e8c4063dd2bb159e6b599085f60300d579c0da6c` (F9-01 + F9-02). Branch: `fix/f9-support-operator-consolidated`. Fase9 continua NO-GO. Sem autorização para push, deploy, publicação em HOMOLOG ou promoção para PROD.

## Migração aditiva19

`20261025_support_operators` cria apenas `support_operators`: id, identity_id UNIQUE/FK para AuthIdentity, AccessStatus ACTIVE/INACTIVE e timestamps3. Transação, lock_timeout5s e statement_timeout60s. Não altera tabelas/linhas anteriores, não converte usuários nem provisiona operador humano, membership, perfil, OWNER ou PlatformAdmin.

SHA-256 do SQL definitivo com LF: `f4d3b0a7619a07779da0557a650d906b726b3f0e89939f1ef5b31efd106eca5b`.

Prisma usa `requesterIdentityId` para o solicitante de SupportGrant, mapeado para a coluna física histórica `platform_admin_identity_id`. FK e índice físicos preservados; nenhuma reescrita de histórico. A comparação de schemas18→19 gera somente criação da tabela, índice UNIQUE e FK. Não muda OWNER/ADMIN/MEMBER, F9-02 ou revisão técnica.

## Matriz de autorização

| Capacidade/ação | Contrato |
|---|---|
| SupportOperator ACTIVE isolado | Área própria de suporte, seus pedidos e consentimento pessoal; nenhum dado empresarial |
| PlatformAdmin isolado | Administração global existente; não é suporte técnico e não pode usar grants sem capacidade explícita |
| Membership empresarial | Relação separada; não implica SupportOperator/grant |
| READ_ONLY autorizado | view somente dos módulos aprovados |
| OPERATIONAL solicitado/aprovado explicitamente | view/create/edit/import somente dos módulos aprovados |
| Módulos iniciais | Dimensão da Empresa; Dimensões Financeiras; não ampliar |
| Exportação em massa e DELETE | Negados em ambos os níveis |
| Fluxo de Caixa, Lançamentos e saldos | Fora do suporte inicial |
| Usuários, perfis, OWNER, termos contratuais, backup/restore e administração global em contexto de suporte | Negados |
| Outros tenants/técnicos/caminhos futuros não revisados | Negados |
| Aprovação | Somente responsável contratual OWNER ativo do tenant; autoaprovação negada |

Cada operação de tenant reconsulta identity ACTIVE, operador ACTIVE, grant ACTIVE, técnico/tenant exatos, módulos/nível, janela temporal, aprovação e atual responsável OWNER ativo. Middleware sobrescreve evidência de caminho/método enviada pelo cliente. Cookie e seletor não concedem autorização. Contexto de suporte inválido/revogado não cai automaticamente para membership. A administração global exige saída explícita do contexto de suporte, mesmo quando a identidade possui essa capacidade separadamente.

Pedidos, aprovação e entrada compartilham lock por operador com o offboarding; transações serializáveis evitam conceder um pedido depois da desativação concorrente. Erros de concorrência exigem atualização/retry pelo usuário, sem presumir sucesso.

## Offboarding e gestão explícita

APIs protegidas de PlatformAdmin: `/api/platform/support-operators` para gestão explícita da capacidade e PATCH `/api/platform/support-operators/[id]` com `action=deactivate` e motivo específico para offboarding.

Transação única: desativar capacidade, revogar todos os grants ACTIVE/PENDING daquele operador, registrar eventos por grant e auditoria central com estado/contagens. Histórico e outros operadores preservados. Reactivação explícita não reativa grants revogados.

Membership não é removido por padrão. `devMembershipIds` opcional exige lista explícita, vínculos do próprio operador, tenant reservado `modo-dev` e papel não OWNER; vínculo de outro técnico/cliente ou OWNER faz a operação inteira falhar. Não se cria DEV individual nem membership como efeito dessa gestão.

## UI e consentimento

`/suporte` é a Área de Suporte própria, fora da Administração da Plataforma. Mostra somente pedidos/grants do operador, empresa alvo, escopo, nível, motivo e prazo. O pedido usa identificador recebido do responsável no chamado, sem catálogo global de clientes. Navegação usa o primeiro módulo autorizado, não uma tela fixa fora do escopo.

Dentro do tenant, banner “Acesso temporário de suporte” informa empresa, nível/escopo e expiração. Menus refletem apenas permissões do grant. Há ação explícita para sair do contexto sem revogar autorização ou cair silenciosamente para membership. A saída compara Origin à APP_PUBLIC_URL configurada, como o endpoint de backup, para funcionar atrás do proxy; origens externas são negadas. Identidade ativa consegue sair mesmo após offboarding da capacidade técnica.

Consentimento pessoal é separado: `/api/support/terms` e seu endpoint de PDF tratam somente versões USUARIO publicadas e a própria identidade, com tenant/membership NULL. Campos enviados pelo cliente não escolhem outra identidade/tenant. Suporte não aceita termos CONTRATANTE; `/api/terms/accept` empresarial está fora da allowlist do grant. Termos contratuais pendentes continuam bloqueando uso empresarial e exigem o responsável. Esse self-service pessoal mantém o requisito de termos sem inventar membership ou conceder autoridade sobre documentos do cliente.

Auditoria registra lifecycle, concessão/desativação, entrada, leitura executada e escrita autorizada. “Autorizada” não afirma COMMIT empresarial; importações mantêm recibo operacional transacional. Nenhum valor de negócio, senha, hash de senha, cookie, token ou arquivo integra metadados de suporte. Trilha histórica não é apagada.

## Backup v2 / ledger19

Mesmos formato v2, manifesto v1/HMAC, FKs históricas exatas, autoria/proprietário, snapshots/checksums, allowlists, isolamento, recibo/idempotência e revisão técnica/stale409. Contrato exige19 nomes exatos, sem pendências/duplicatas e checksums reais das migrations18/19. Backup18 em schema19 continua falhando fechado; não converter/reassinar arquivos antigos.

SupportOperator é global: não aparece no catálogo de dados de backup empresarial nem é restaurado por tenant. Restauração preserva seu digest, assim como identities/memberships/PlatformAdmin/grants. Migration19 deve preceder o novo artefato em uma futura implantação autorizada; o motor anterior falha fechado ao encontrar ledger19 até a atualização. Recuperação usa backup privado e procedimento isolado compatível, não edição de ledger/histórico.

## Validação e limites da rodada

Auditoria de retomada conferiu integralmente os29 arquivos pendentes sobre e8c4063. Encontrados e concluídos: atualização que faltava do ledger19, testes e runner integrados, tipagem de datas já validadas, rejeição de módulos herdados do protótipo, remoção de validação temporal duplicada e mensagem de pendência contratual da UI. A working tree foi preservada; não houve reset/stash ou reinício do trabalho.

Testes a executar/registrar: políticas/guards, offboarding com/default e vínculos explícitos, PostgreSQL/Prisma/HTTP reais, revogação em sessão, estados/escopos/níveis negativos, OWNER/ADMIN/MEMBER e PlatformAdmin, UI SSR/banner, backup v2/ledger19, restores dos8 tenants históricos (31 autorias/2 layouts externos), F9-02 NULL/zero, TypeScript, Linux build, artifact verifier e diff-check. Runners usam exclusivamente clone privado guardado por host/nome, rede interna sem portas e e-mail desabilitado.

Identidades técnicas sintéticas de teste podem ser criadas somente no clone. Sessões de principals já existentes no clone usam credenciais sintéticas aleatórias; nunca senhas humanas. Nenhum técnico humano é provisionado. Evidências/dumps e resultados efetivos ficam fora do Git em `C:\Users\ricar\Documents\Codex\phase9-3-consolidation`; este documento não antecipa PASS integrado.

F9-07 permanece separado, sem correção/remoção: nenhuma chamada interna ativa encontrada para `/api/dashboard`; UI usa `/api/fluxo-caixa/resumo`. Recomenda-se aposentadoria formal em escopo próprio, após conferir consumidores externos. Não alterar `rangeAtraso`, implementar DEV individuais ou iniciar Fase10 nesta rodada. O novo SHA local ainda depende de revisão de Ricardo/ChatGPT antes de qualquer publicação.
