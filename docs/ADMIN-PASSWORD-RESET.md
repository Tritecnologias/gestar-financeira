# A.2.7 — Recuperação assistida por senha provisória

Decisão final de Ricardo: substituir o reset por link/e-mail ainda não publicado pela geração administrativa de senha provisória, com troca obrigatória. Trabalho somente LOCAL. Referência homologada preservada: `60a69cb69597a40e2bfb3dd782a95b99e717b63f`. Branch: `feat/a2-7-temporary-password-reset`, derivada do reset não publicado `a45ac268fe903bc78ed70d22780d03efe5bbbf8e`.

## Registro posterior de aceite funcional — 01/11/2026

Ricardo confirmou o funcionamento e o **aceite funcional do ciclo completo em HOMOLOG**
no SHA `cb136c6dc4c183660bf24fea1937be6bd55d0b46`.
O refinamento restante é a uniformização dos olhos de senha em **toda Minha Conta → Segurança**,
na alteração normal e na troca obrigatória. A correção e sua validação são somente LOCAL;
o novo candidato não está publicado. Registro, testes direcionados e limites em
[A2-7-ACCOUNT-PASSWORD-UX.md](A2-7-ACCOUNT-PASSWORD-UX.md).
As seções seguintes conservam o histórico técnico da implementação original.

## Operação e reaproveitamento

O catálogo de identidades da Administração da Plataforma conserva a ação **Resetar senha**. Exige PlatformAdmin ativo, confirmação do titular e reautenticação com a senha definitiva do administrador. Nenhum administrador empresarial ou operador de suporte ganha essa capacidade.

A aplicação gera 192 bits aleatórios com `crypto.randomBytes(24)`, representados em uma senha de 36 caracteres com maiúscula, minúscula, número e símbolo. O administrador não escolhe a senha. Somente o hash bcrypt com custo 12 é gravado na identidade global pelo escritor protegido de Minha Conta. A credencial anterior deixa de funcionar.

A confirmação exibe a senha uma única vez e permite copiar para o compartilhamento manual pelo canal previamente verificado. O conteúdo existe em memória e na resposta HTTPS sem cache; não existe consulta posterior, envio por e-mail ou persistência em storage do navegador. Fechar/navegar descarta a exibição. A cópia para a área de transferência é a ação explícita aprovada para o administrador; a plataforma não controla capturas ou histórico de clipboard do dispositivo.

**Validade: 30 minutos**, contados na transação de emissão. Não se estende a cada login. Após expirar, nem a senha provisória nem uma sessão emitida com ela autorizam a troca; o titular precisa de novo reset administrativo. Resposta perdida não é repetida automaticamente: o administrador deve gerar outra senha após o intervalo de segurança.

O login com senha provisória permite apenas Minha Conta → Alterar Senha e encerramento da sessão. O formulário já existente exige a senha provisória atual, uma nova senha diferente e confirmação. Reutiliza PasswordInput com olho por pressão. Após salvar, encerra as sessões provisórias e pede login com a senha definitiva. A troca normal de Minha Conta continua disponível e exige a senha atual.

## Controles de servidor

- A verificação central de sessão consulta a credencial e a pendência durável, independentemente dos flags de emissão, da interface e de alegações enviadas pelo cliente.
- `auth()`, usado pelos fluxos operacionais existentes, não fornece identidade para sessões restritas. Somente as duas entradas de manutenção de senha usam a sessão restrita. Middleware orienta navegação, mas não constitui o controle definitivo.
- O HMAC `credentialStamp` existente invalida as sessões após cada troca. Não é exposto no DTO de sessão. Os escritores de senha o revalidam depois de obter lock da identidade, impedindo uso de sessão antiga mesmo que conheça a credencial mais recente.
- Login e validação do JWT leem credencial/pendência com lock compartilhado; reset e troca usam lock exclusivo. Resets com emissor e titular distintos ordenam os locks.
- A identidade cuja credencial foi resetada também é recusada no modo legado de rollback. Isso impede reativar o hash histórico de Usuario por configuração. Os demais usuários legados preservam o comportamento anterior.
- A senha definitiva não pode ser a provisória. Novas gravações em Minha Conta recusam truncamento acima de 72 bytes UTF-8 do bcrypt. A validação de credenciais legadas no login não foi reescrita.
- Mesma origem, corpo limitado, cabeçalhos sem cache, limite de requisições e trilha administrativa existentes são reaproveitados.
- Limites persistentes: intervalo mínimo de 60 segundos, até três resets por identidade e dez por administrador em 15 minutos. Cinco falhas de reautenticação administrativa suspendem novas confirmações por 15 minutos.
- Estado inválido ou ambíguo e falha de banco não liberam acesso. Credencial e eventos de auditoria pertencem à mesma transação: falha desfaz ambos.

## Estado durável, schema e ACLs

Não foi necessária alteração estrutural. A auditoria imutável já era utilizada como autorização durável no reset anterior e permite representar esta transição sem outra tabela ou campo:

1. `PASSWORD_TEMPORARY_ISSUED`: identidade alvo, administrador e vencimento; nunca senha, hash ou carimbo.
2. `PASSWORD_TEMPORARY_REPLACED`: encerra a emissão anterior por seu identificador quando outro reset é aplicado.
3. `PASSWORD_TEMPORARY_COMPLETED`: encerra a pendência junto com a gravação da senha definitiva.
4. `PASSWORD_CHANGED` e `PASSWORD_RESET_AUTH_DENIED`: preservam alteração de credencial e falhas de reautenticação.

A consulta considera emissões sem evento terminal correspondente. Não depende de ordenar eventos por relógios ou de estado em memória; mais de uma pendência ou metadados inesperados bloqueiam. Expiração usa o relógio do PostgreSQL. Os índices existentes por ação e data atendem ao volume administrativo previsto.

Nenhuma migration, tabela, coluna ou ACL nova. Mantidos H8 em HOMOLOG, P7 no candidato produtivo e 44 tabelas incluindo ledger. Emissão continua verificando banco, roles, schema, ledger e privilégios pelo contrato A.2. Não foi concedido DELETE. Identidade, Usuario histórico, tenants, memberships, perfis, termos e contratos não são reescritos pelo reset.

## Configuração e portabilidade

Um único código, com configuração em runtime:

```dotenv
PASSWORD_RESET_ENABLED=false
ACCESS_AUTH_MODE=identity
SUPPORT_WHATSAPP_ENABLED=false
```

Habilitação exige perfil e destino completos reconhecidos, chave de autenticação e origem consistentes, além da verificação real de catálogo/ACL do A.2. LOCAL aceita somente o laboratório e identidades `@example.invalid`. HOMOLOG mantém uma lista explícita de identidades sintéticas pelo parâmetro já existente `PASSWORD_RESET_TEST_RECIPIENTS` (nome histórico; não provoca envio). PROD usa autorização independente e o destino produtivo exato. Desabilitar emissão **não desabilita** pendências já existentes.

SMTP, OAuth2, Azure, remetente e prontidão transacional não participam desse reset. A rota/tela pública de redefinição por link e o seletor SMTP exclusivo dessa recuperação foram removidos. O serviço de e-mail dos outros fluxos permanece preservado; a Adesão continua com seus próprios requisitos de confirmação e entrega.

LOCAL/HOMOLOG/PROD usam as mesmas regras de credencial e sessão. Os contratos H8/P7 e de backup não mudam. Esta rodada não produz nem publica OCI de release, não aplica migrations e não habilita ambientes remotos.

## Validação LOCAL

Ponto de entrada reutilizado, sem novo executor:

```text
node --test tests/account-password.test.mjs tests/password-reset-policy.test.mjs tests/admission-security.test.mjs tests/admission-homolog.test.mjs
node scripts/admission/run-http-lab.mjs <diretorio-A2.1> <novo-diretorio-evidencias> --password-reset
```

O ensaio usa PostgreSQL descartável, dump sintético verificado, aplicação Next em build de produção e Edge real. Containers sem rede externa e sem portas Docker publicadas; relay de navegador somente loopback. Nenhum SMTP é configurado. O mesmo build roda com emissão habilitada/desabilitada e autenticação legada para testar ausência de bypass.

Cobertura: autorização/negação administrativa, senha aleatória e bcrypt, exibição/cópia única, expiração inclusive de sessão aberta, tentativa de reutilização, URL/API direta, alegações de sessão manipuladas, concorrência de reset/login/troca, rollback induzido, Minha Conta, preservação de dados, Adesão, convites operacionais e contratação. Evidências visuais mascaram a senha provisória; logs e auditoria são inspecionados sem exportar credenciais.

### Resultado final — 01/11/2026

Ensaio integrado: `C:\Users\ricar\Documents\Codex\a2-7-temporary-reset\lab-04`, de 23:43:42 a 23:46:23 UTC. `RESULT.json`: **PASSED**, containers removidos, rede externa desabilitada e nenhum e-mail real.

| Verificação | Resultado |
| --- | --- |
| Unitários de senha, política e segurança/portabilidade da Adesão | 24 aprovados, zero ignorados na execução final |
| Reset administrativo com banco e API reais | 16 grupos aprovados |
| Edge desktop/claro e mobile/escuro, copiar/fechar, Tab, mouse e toque | 3 cenários aprovados |
| Adesão e identidade | 70 verificações aprovadas |
| Convites Especiais | 36 verificações aprovadas |
| Provisionamento e segurança contratual | 118 verificações aprovadas |
| Convites operacionais | 50 verificações aprovadas |
| Onboarding contratual e retorno seguro | 265 verificações aprovadas |
| Build Next de produção e TypeScript final | Aprovados |
| Restauração PostgreSQL | 44 tabelas com contagens e digests idênticos |

Dump estritamente sintético: SHA-256 `f19b64d4c6417f913da8182c61818ee1bc3e75f59a4c7af500330f862e93318e`. A recuperação comprovou banco e trilha durável; não foi um exercício remoto de publicação.

O lint dos 15 arquivos de aplicação verificados identificou 12 usos de `any` já presentes em auth/tenant na base; nenhum erro novo nesse escopo. Não foram refatorados. Duas asserções de tipo novas foram ajustadas após o build; a comparação por transpile confirmou JavaScript idêntico ao ensaiado e o TypeScript final passou.

Ocorrências locais: `lab-01` não iniciou Docker por restrição de permissão; `lab-02` parou em uma expectativa do teste com sessão restrita; `lab-03` passou todo o reset e identificou uma expectativa antiga do teste de ACL da Adesão. O guard portátil já homologado retorna 404 antes de escrever quando falta uma ACL Admission; o roteiro ainda esperava 503. Corrigida a expectativa exata, mantendo as verificações de rollback 503 para falhas de mapping/auditoria. Nenhum serviço funcional da Adesão foi alterado. `lab-04` concluiu todas as etapas.

Evidências principais: `PASSWORD-RESET-RESULT.json`, `BROWSER-RESULT.json`, `HTTP-RESULT.json`, `PROVISIONING-RESULT.json`, `RESULT.json`, `unit-tests.log`, `LINT-SUMMARY.json`, `recovery-tables.txt` e imagens com a senha mascarada. Manifesto final de arquivos/SHA em `CANDIDATE.json`, fora do repositório.

**Parecer: GO para aceite do novo candidato e preparação de homologação autorizada; publicação ainda depende dos gates e autorizações abaixo.**

## Plano mínimo de HOMOLOG e publicação

1. Aceite de Ricardo para o novo SHA; gerar e ensaiar um único OCI promovível, com integridade e configuração independentes, usando o procedimento operacional existente.
2. Nova autorização específica para HOMOLOG; gates usuais, backup cifrado e recuperação isolada antes da publicação. Sobre HOMOLOG H8, esta mudança não exige migration ou novas ACLs.
3. Habilitar apenas para identidades sintéticas autorizadas. Ricardo valida reset, compartilhamento manual, troca obrigatória, retorno aos espaços e regressão incremental de Adesão.
4. Formalizar aceite do novo candidato. Resolver separadamente a entrega real da confirmação de e-mail da Adesão antes de disponibilidade pública. A recuperação assistida não remove essa dependência da Adesão.
5. Somente com autorização específica de PROD, aplicar o plano já aprovado do A.2, incluindo P6→P7 se a baseline produtiva ainda for P6; esta rodada não executa nem altera essa migration. Promover exatamente o mesmo OCI aceito.

Contingência: desabilitar novas emissões mantendo o binário com o guard de troca obrigatória. **Não voltar a um binário que desconheça a pendência enquanto existirem senhas provisórias.** Recuperar banco e auditoria de forma consistente, verificar pendências e revogar sessões conforme o procedimento existente antes de reabrir. A auditoria com pendências não pode ser expurgada separadamente; qualquer futura política de retenção deve preservar esse estado.

Nenhuma alteração em PROD, HOMOLOG ou master. Não houve e-mail real ou contratação de serviço.
