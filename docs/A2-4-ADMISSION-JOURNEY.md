# Pacote A.2 — Fase A.2.4: jornada visual integrada

Data: 01/11/2026. Branch: `feat/a2-4-admission-journey`.
Base aprovada, conferida e inicialmente limpa: `795705106f49ca2ceeeeb397d02994c702f8abf9`
(`feat/a2-3-atomic-provisioning`). Baseline master/PROD preservada:
`74400e028949a763107061a09b8af6e406e83e70`.

Entrega exclusivamente LOCAL. Sem push, merge, deploy, migrations remotas, acesso
a HOMOLOG/PROD, dados ou mensagens reais. A landing, contratos formalizados,
serviços A.2.1–A.2.3, autenticação, schema, ACLs e regras contratuais permanecem
inalterados. A.2.5 não está autorizada nem foi iniciada.

## Interface e integração

| Tela | Implementação/reuso |
|---|---|
| Interesse no Convite Especial | Fluxo existente preservado; interesse não cria autorização |
| `/plataforma/convites-especiais` | Painel existente; estados legíveis de autorização, cancelamento, expiração e espaço criado |
| Comunicação de autorização | Serviço de e-mail existente, capturado somente no laboratório sintético |
| `/adesao`, etapa E-mail | Link com confirmação explícita, reenvio e orientação para retomada |
| `/adesao`, etapa Identidade | Formulários já existentes e `PasswordInput`; senha nova com confirmação ou autenticação pela senha atual |
| `/adesao`, etapa Seu espaço | Nome do espaço, chamada ao provisionamento aprovado e recuperação do resultado persistido |
| `/login` e `/selecionar-tenant` | Telas existentes para autenticação e seleção dos acessos existentes |
| `/onboarding` e `/termos/aceite` | Encaminhamento, leitor PDF e registro dos aceites existentes |
| `/onboarding/modalidade` | Escolha PF/PJ existente |
| `/onboarding` | Escolha de responsável, indicação a outra pessoa e retorno contratual existentes |
| `/inicio` | Entrada existente, condicionada aos guards contratuais |

A página de adesão utiliza os estilos de ativação e variáveis visuais da DEZ,
com CSS adicional restrito ao componente. Mostra três etapas da adesão e orienta
explicitamente a continuidade contratual. Possui textos de progresso, carregamento,
erros e reenvio, foco no título da nova etapa e no alerta, status anunciado, campos
rotulados, botões com tamanho mínimo de 44 px e layout responsivo Claro/Escuro.

O cliente chama os endpoints existentes de estado, confirmação, identidade,
retomada e provisionamento. Após criar o tenant, segue para `/onboarding`. Para
uma Admission já PROVISIONED, seleciona o tenant pelo endpoint existente
`/api/tenants/switch` e segue para o mesmo destino, sem repetir a criação.

Ordem preservada:

`Interesse → Autorização administrativa → E-mail → Identidade → Provisionamento → Termo do Usuário pendente → PF/PJ → Responsável contratual → Contratação → Acesso operacional`.

O botão de login é genérico e reutiliza `/login?callbackUrl=%2Fadesao`. Para quem
tem vários acessos, a seleção existente de empresas continua aplicável. Conhecer
o ID da Admission não concede acesso ou revela a existência de uma identidade.

## Retomada, concorrência e segurança

- O fragmento de e-mail é removido da URL antes das chamadas HTTP. O segredo fica
  apenas em memória; `sessionStorage` guarda somente o UUID da autorização.
- O servidor continua sendo a autoridade para e-mail, identidade, prazo, origem,
  PlatformAdmin, unicidade e contexto. Nenhum estado visual dispensa esses controles.
- A mudança de referência cancela a leitura anterior, limpa os campos e impede
  que respostas antigas alterem a nova adesão. A volta do foco consulta o estado.
- Um bloqueio síncrono de submissão impede dois POSTs pelo mesmo formulário.
  A proteção transacional A.2.3 continua protegendo abas e solicitações concorrentes.
- Falha temporária na identidade ou no provisionamento provoca consulta ao estado
  persistido. Se o commit ocorreu e a resposta se perdeu, a tela oferece continuar
  no espaço criado. Um link original consumido também recupera esse resultado
  quando a identidade destinatária está autenticada.
- Reenvio usa resposta genérica, intervalo visual e os limites persistentes já
  existentes. Estados indisponíveis orientam a solicitar novo link ou atendimento.
- A senha de identidade existente nunca é redefinida. O formulário orienta a
  procurar quem enviou o convite em caso de dificuldade de autenticação.
- Não há autorização de navegação baseada apenas em query, hash, storage ou tenant
  fornecido pelo cliente. Os destinos de continuidade são caminhos locais fixos.

## Laboratório e evidências

O runner existente `app/scripts/admission/run-http-lab.mjs` ganhou `--journey`
e `--preview`. Ambos restauram o dump sintético A.2.1 conferido por hash, compilam
a aplicação, executam as regressões HTTP e a jornada em Microsoft Edge real
(headless), e verificam recuperação integral do banco.

PostgreSQL e Next permanecem em namespace Docker sem rede externa e sem portas
Docker publicadas. Uma ponte descartável transporta HTTP por `docker exec` e
escuta exclusivamente `127.0.0.1:3020`, permitindo o navegador local. Não publica
o banco, segredos, capturas de e-mail ou endpoints de fixture. Chaves novas são
criadas a cada execução. Contextos de teste recebem IPs sintéticos distintos pelo
proxy confiável local; os limitadores permanecem habilitados.

O PDF simplificado da fixture HTTP A.2.3 foi substituído por um PDF sintético válido,
de uma página, sem conteúdo contratual real. Assim o teste visual usa o mesmo
leitor, verificação SHA-256 e checkbox habilitado somente após a renderização.
Nenhum documento formalizado foi editado.

Resultados finais e hashes: `docs/evidence/a2-4-journey.json`.
Execução aceita: `C:/Users/ricar/Documents/Codex/a2-4-journey/lab-05`, modo `--preview`.
As capturas PNG e os logs completos ficam na pasta local da execução aceita,
fora do repositório. Links sintéticos de uso único ficam apenas em `PREVIEW.md`
dessa pasta, sem integrar evidências versionadas.

| Verificação | Resultado |
|---|---|
| Autorização, identidade, desafios e retomada A.2.2 | 70 verificações HTTP |
| Provisionamento A.2.3, concorrência, falhas e backup | 118 verificações HTTP |
| Convites Especiais | 36 verificações HTTP |
| Ativação por convite operacional | 50 verificações HTTP |
| Contratação, modalidade e retorno seguro | 265 verificações HTTP |
| Total HTTP integrado | **539 aprovadas** |
| Edge real: jornada e layouts | **31 verificações aprovadas**, 12 capturas |
| Suíte local independente de bancos externos | **290 testes aprovados**, zero falhas |
| TypeScript, lint dos componentes alterados e Next build | Aprovados |

No navegador: novo usuário completa PF e usuário existente completa PJ, ambos
com leitura e aceite reais dos PDFs sintéticos, escolha explícita do responsável
e entrada operacional. Também são verificados senha preservada, memberships
anteriores mantidas, teclado/foco, quatro combinações desktop/mobile e Claro/Escuro,
recarregamento, segunda aba, autenticação em outro navegador, POST duplo,
commit com resposta perdida, desafio expirado, reenvio, cancelamento, referência
não autorizada e convite expirado. A API operacional devolve 428 antes dos
requisitos e 200 depois. A indicação contratual de outra pessoa continua coberta
pela regressão HTTP existente; não se afirma execução visual desse ramo nesta fase.
Os viewports são 1366×900 e 390×844 no Edge; não representam teste em aparelho físico.

As cinco suítes antigas dependentes de bancos externos não foram executadas:
`tenant-isolation`, `access2-legacy-login`, `access2-membership`, `access3-session`
e `access3b-platform-admin`. O hook opcional externo de baseline da Fase 12A
permaneceu desativado. Os testes integrados no banco sintético verificam a
preservação de tenants, vínculos, recibos e ledger da fundação.

As primeiras execuções identificaram a fixture PDF incompleta e a necessidade de
aguardar a carga da tela antes do clique automatizado no responsável. A revisão
das capturas também corrigiu a sincronização do teste de expiração e removeu da
interface o botão referente ao link anterior após solicitar reenvio. Esses ajustes
não alteraram o leitor contratual ou os serviços aprovados. O seletor final de erro
foi limitado ao cartão da adesão para não confundir seu alerta com o anunciador
de navegação do Next.

O dump/restore compara as 44 tabelas (43 de aplicação + ledger) por quantidade e
digest ordenado de todas as linhas. É uma validação de recuperação do banco;
arquivos privados e chaves continuam com os procedimentos próprios aprovados.

## Como Ricardo pode visualizar em LOCAL

Pré-requisitos: Docker Desktop local ativo, Microsoft Edge instalado, imagens
locais já utilizadas em A.2.3, runtime Playwright do Codex e dump sintético
aprovado de A.2.1. Nenhuma instalação/download é feita pelo runner. A porta
`127.0.0.1:3020` precisa estar livre. Use uma pasta de saída nova a cada execução.

No PowerShell, a partir de `C:\Users\ricar\Documents\Codex\gestar-financeira`:

```powershell
node app/scripts/admission/run-http-lab.mjs `
  'C:\Users\ricar\Documents\Codex\a2-1-foundation\lab-04' `
  'C:\Users\ricar\Documents\Codex\a2-4-journey\preview-ricardo-01' `
  --preview
```

1. Aguarde a mensagem `LOCAL preview ready` (compilação e testes levam alguns minutos).
2. Abra `PREVIEW.md` na pasta de saída. Ele contém um link recém-emitido e uma
   conta administrativa, exclusivamente sintéticos. Não reutilize link de outra execução.
3. Abra o link de adesão em janela anônima separada da administração. Confirme
   o e-mail, crie uma senha de pelo menos 12 caracteres, dê nome ao espaço e
   percorra os documentos sintéticos, PF/PJ e a contratação existente.
4. A administração local fica em `http://localhost:3020/plataforma/convites-especiais`.
   Use somente os dados sintéticos informados no arquivo. Não há mensagens reais.
5. Para encerrar e remover os containers descartáveis, crie um arquivo vazio
   `STOP-LOCAL` na pasta de saída. O runner também encerra automaticamente em
   duas horas. Aguarde a mensagem final de limpeza antes de fechar o terminal.

O link de e-mail possui o prazo curto aprovado na A.2.2. Abra-o logo após o runner
ficar pronto. Se expirar, reinicie o laboratório com uma pasta de saída nova para
obter uma captura atual. Não existe caixa de e-mail pública ou entrega real neste modo.

## Pendências e decisão

- Aceite visual de Ricardo e validação integrada da A.2.5 dependem de nova autorização.
- Recuperação autônoma de senha/conta continua como dependência antes da
  disponibilização pública; esta fase implementa somente orientação segura.
- Transporte real de e-mail, chaves por ambiente, aplicação de schema/ACLs e plano
  de implantação permanecem sujeitos à aprovação própria. O gate LOCAL permanece fechado fora do laboratório.
- Checkout, cobrança, pagamentos, Pacote B e dashboard definitivo continuam fora do escopo.

**GO técnico para validação integrada e aceite visual de Ricardo**, condicionado
à nova autorização para A.2.5. **NO-GO para disponibilização pública** enquanto
as dependências de recuperação de conta e preparação de ambiente estiverem abertas.
Esta entrega não autoriza publicação nem início automático de A.2.5.
