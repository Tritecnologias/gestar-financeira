# Pacote A.2 — Fase A.2.5: validação integrada LOCAL

Base aprovada: `432017417bd8f47f6527cfc626999fda4d89bc44`, branch
`feat/a2-4-admission-journey`. Trabalho na branch própria
`feat/a2-5-integrated-validation`. Baseline master/PROD preservada:
`74400e028949a763107061a09b8af6e406e83e70`.

## Escopo e isolamento

Validação e correção de defeitos demonstrados, exclusivamente LOCAL. Os novos
arquivos são testes e infraestrutura de laboratório; nenhum serviço, tela,
texto homologado, schema ou migration de produto foi reescrito nesta fase.
Admission e AdmissionChallenge continuam sendo as entidades aprovadas.

PostgreSQL 18.6 descartável em tmpfs, Docker local Windows, rede `none`, sem
portas publicadas, sem reinício automático. O worker Next usa apenas o namespace
de rede desse PostgreSQL. A ponte para o navegador escuta exclusivamente
`127.0.0.1:3020`; o navegador bloqueia destinos diferentes de localhost.
Todos os destinatários são sintéticos `@example.invalid`, transporte `mock` com
captura criptografada; a regressão operacional usa e-mail `disabled`.

O runner verifica o resultado e SHA-256 do dump da fundação antes da restauração.
Migrations, roles, bancos e credenciais existentes em ambientes reais não são
consultados nem modificados. Dumps, volumes, credenciais e links de laboratório
ficam fora do Git. Os contêineres são removidos no encerramento, inclusive em erro.

## Jornadas e evidências

**Resultado: PASSED em 01/11/2026.** Evidência consolidada em
[a2-5-validation.json](evidence/a2-5-validation.json).

| Grupo | Resultado final |
| --- | --- |
| Migrations, ACLs e integridade da fundação | 53 verificações aprovadas |
| HTTP integrado e regressões | 556 verificações aprovadas: 539 existentes + 8 adicionais + 9 após recuperação |
| Edge real | 56 verificações aprovadas, 19 capturas, desktop/mobile e Claro/Escuro |
| Suíte independente de bancos externos | 290 testes aprovados, zero falhas |
| Build Next e TypeScript | Aprovados no worker isolado |
| Backup/restore | 44 tabelas idênticas por digest; nova aplicação recuperada e funcional |

Execução final completa: `C:\Users\ricar\Documents\Codex\a2-5-validation\integrated-03`.
Fundação recém-reexecutada: diretório irmão `foundation-01`.
Os hashes dos relatórios, logs, capturas, dumps e arquivos de ensaio constam no JSON.
Exemplos versionados: [identidade no celular/Escuro](evidence/a2-5/identity-mobile-dark.png)
e [confirmação no Termo do Usuário](evidence/a2-5/handoff-desktop-light.png).

| Requisito | Exercício real e critério |
| --- | --- |
| Convite → interesse → autorização | PlatformAdmin emite e copia o link pela interface; visitante registra interesse; painel autoriza o e-mail. Interesse sozinho não autentica nem cria Admission. |
| Nova identidade / PF | E-mail explícito, nova senha, identidade, tenant/OWNER, Termo do Usuário, PF, responsável, contratação e acesso operacional. |
| Identidade existente / PJ | Senha anterior e vínculos preservados; novo tenant legítimo; PJ e contratação concluídos pelas telas existentes. |
| Retomada | Reload, outra aba e navegador novo retomam o mesmo resultado; resposta de provisionamento perdida é reconciliada sem novo tenant. |
| Autorização no servidor | Sessão sem autoridade, suporte/assessoria, e-mail/identidade diferentes, corpo forjado, origem inválida e URLs antecipadas são rejeitados. |
| Desafios e abuso | Expiração, cancelamento, consumo, replay externo, cinco tentativas, cooldown e orçamento por destinatário; reenvio preserva a autorização. |
| Concorrência | Autorizações simultâneas convergem; um consumidor externo de desafio; oito provisionamentos concorrentes convergem para um tenant; cancelamento concorre sem estado parcial. |
| Falhas transacionais | Falhas de permissões/auditoria e encerramento de conexão durante INSERT tardio de vínculo causam rollback completo; retry produz um único conjunto tenant/OWNER/vínculos. |
| Isolamento operacional | IDs e tenantId forjados não leem, alteram ou apagam categorias de outro tenant; evidências contratuais e recibos de restore permanecem no contexto autenticado. |
| Contratos protegidos | Retorno após formalização negado; campos de autoridade forjados no aceite não reescrevem recibos; requisitos pendentes continuam respondendo 428. |
| Logs e auditoria | Tokens capturados, credenciais testadas, cookies de sessão/prova e chaves do laboratório são procurados nos logs e auditoria, sem imprimir esses valores. |

Os PDFs oficiais publicados são documentos globais da plataforma, legíveis pelos
perfis autorizados conforme o contrato existente. O isolamento por tenant se
aplica aos dados empresariais, responsáveis, aceites e recibos; não se interpreta
um mesmo PDF global como documento privado de outro tenant.

## Banco, migrations e recuperação

Os caminhos H7→H8 e P6→P7 foram reconstruídos e executados em clones novos, com
Prisma real, SQL histórico original e validação dos checksums. As **53 verificações**
da fundação passaram, incluindo no-op da repetição, recusa de runtime, ledger
adulterado e banco indevido, rollback de falha tardia, FKs, unicidade, ACLs por
coluna e auditoria. As 41 tabelas de aplicação anteriores permanecem intactas.

A contagem correta é **43 tabelas de aplicação + `_prisma_migrations` = 44**.
Antes de Admission/AdmissionChallenge eram 41 de aplicação ou 42 com o ledger.
Nenhuma estrutura foi criada para ajustar contagens.

A recuperação integrada possui duas verificações independentes:

1. `pg_dump -Fc` e `pg_restore --exit-on-error`, comparando quantidade e digest
   ordenado de todas as linhas das 44 tabelas, incluindo governança e ledger.
2. Nova instância PostgreSQL, namespace isolado e novo worker Next, com o worker
   de origem desligado. Banco restaurado, build reaproveitado sem cache, PDFs,
   e-mails sintéticos criptografados e arquivos privados de backup recuperados.
   As chaves originais são mantidas apenas na memória do runner e nos ambientes
   efêmeros dos contêineres, sem exportação em evidências.

Após a recuperação, o teste entra novamente nas contas PF/PJ, recupera os mesmos
tenants, consulta PDFs por hash, verifica isolamento de dados/recibos e rejeita
desafios cancelados, expirados ou já consumidos. Um desafio ainda não usado e
uma jornada com identidade/e-mail já comprovados são retomados; concorrência
após restore continua produzindo um único tenant com contratação pendente.

O backup empresarial `10s-tenant-backup/3` mantém seu escopo: não reescreve
governança global, identidade, Admission ou desafios. H8/P7 aceitam somente seu
próprio perfil e ledger exato. Migrar H7→H8/P6→P7 não torna backups empresariais
anteriores automaticamente compatíveis; não houve conversão nem reassinatura.

O ensaio demonstra recuperação com banco, arquivos privados e chaves corretas.
Não define SLA/RPO/RTO de ambiente remoto nem implementa recuperação de conta.

## Regressão e experiência aprovada

Foram preservadas as suítes de autorização/e-mail (70), provisionamento (118),
Convites Especiais (36), convites/ativação operacional (50) e contratação/retorno
(265). A suíte independente de bancos externos passou: **290 testes, zero falhas**.
Cinco arquivos antigos dependentes de bancos externos e o hook externo opcional
da Fase 12A ficam fora da execução; as regressões HTTP usam clones locais reais.

No Edge real, a suíte verifica 1366×900 e 390×844, Claro/Escuro, navegação por Tab,
foco, mouse, atalho de teclado, pressão/soltura/cancelamento de toque via Chromium,
e ausência de POST/avanço causado pelos olhos. Também confere a confirmação de
provisionamento dentro do Termo do Usuário e os textos exatos do UX04.
Documentos de teste continuam explicitamente sintéticos. Essa evidência não
equivale a aparelho físico, Safari/Firefox ou certificação por leitor de tela.

## Ajustes do laboratório e defeitos

- Um dump recém-gerado da fundação contém desafios ainda dentro da janela de
  reenvio. A primeira execução recebeu corretamente `DEFERRED`, mas o teste antigo
  esperava `SIMULATED`. O preparo agora exige os IDs/e-mail conhecidos da fundação
  e desloca conjuntamente sua cronologia para o passado, antes de capturar a
  baseline HTTP. Nenhum registro é excluído e o orçamento real continua ativo.
- O Docker local não resolve esses mounts tmpfs por `docker cp`. O transporte
  dos arquivos de recuperação usa tar por `docker exec`/stdin. Isso não muda os
  serviços nem as regras de backup do produto.
- A regressão acumulada atingiu corretamente o limite de 20 convites por
  administrador em 15 minutos. Os novos cenários usam outro PlatformAdmin
  sintético legítimo, sem zerar contadores nem desativar limites. Destinatários
  distintos também evitam compartilhar a janela de reenvio entre cenários.

Nenhum defeito de produto foi demonstrado nos ensaios finais. Não foi necessária
alteração estrutural, de ACL de produto, serviço, autenticação, provisionamento
ou interface. Os dois ensaios exploratórios interrompidos estão registrados no
JSON com suas causas; a execução final completa passou e removeu seus contêineres.

## Reprodução LOCAL

Na raiz do repositório, usando diretórios de saída novos e absolutos:

```powershell
node app/scripts/admission/run-lab.mjs C:\Users\ricar\Documents\Codex\a2-5-validation\foundation-novo
node app/scripts/admission/run-http-lab.mjs C:\Users\ricar\Documents\Codex\a2-5-validation\foundation-novo C:\Users\ricar\Documents\Codex\a2-5-validation\integrated-novo --integrated
```

São necessárias as imagens locais imutáveis indicadas no runner, Docker Desktop,
Edge e Playwright já disponíveis neste laboratório. Nenhum pull ou publicação é
executado. `--integrated` encerra a aplicação após os testes. Para uma nova revisão
visual interativa, o modo existente `--preview` mantém apenas a prévia LOCAL e
gera instruções/credenciais sintéticas fora do Git; não executa A.2.6.

## Pendências e preparação de HOMOLOG

1. **Recuperação autônoma de conta/senha:** continua ausente. A orientação de
   atendimento é preservada; publicação pública permanece bloqueada até haver
   solução aprovada e validada de recuperação de acesso.
2. **E-mail real:** provider, credenciais, remetente/domínio, entregabilidade,
   expiração e operação de reenvio precisam de configuração e validação próprias.
   Nenhum e-mail real foi enviado nesta fase.
3. **Ambientes/migrations:** gates atuais de Admission e sua migration são
   deliberadamente LOCAL. HOMOLOG exige autorização e plano específico para
   identidade do ambiente, roles/ACLs, histórico/checksums, chaves, armazenamento
   privado, observabilidade, backup prévio e rollback compatível. Não basta ligar
   uma flag ou aplicar o SQL local remotamente. Não reutilizar credenciais deste
   laboratório; preservar chaves necessárias à leitura de evidências antigas.
4. **Homologação final com Ricardo:** revisar a experiência e os resultados em
   HOMOLOG somente após novo aceite e preparação expressamente autorizada.

**GO técnico para solicitar o aceite de A.2.6 e a preparação controlada de HOMOLOG.**
O Pacote A.2 foi validado em LOCAL nos cenários descritos, inclusive recuperação.
**NO-GO para disponibilização pública**, enquanto persistirem as pendências acima,
especialmente recuperação de conta e entrega real de e-mails.

A.2.5 concluída. Parar e aguardar Ricardo. Nenhum push, deploy, migration remota,
publicação ou trabalho de A.2.6 foi iniciado.
