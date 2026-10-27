# Fase 11A — interface em português e gestão da própria senha

Base: `02ddfc5acd989a74048706fea608a603106f6e02`, PG18 BASELINE V1 e backup empresarial v3.

## Contrato de apresentação

As telas apresentam Empresa, Conta, Vínculo com a Empresa, Proprietário, Administrador, Membro, Administrador da Plataforma, Operador de Suporte e Acesso Temporário de Suporte. Funções, estados, planos, tipos de auditoria e níveis de suporte são traduzidos na apresentação. Payloads, enums, chaves de permissão e códigos históricos permanecem intactos. A auditoria mantém códigos originais em detalhes técnicos, com resumo e filtros em português.

Varredura: login/ativação, seleção de empresa, Início, Plataforma, usuários/acessos, perfis/permissões, suporte, termos, auditoria, configurações/aparência e backup. Erros de endpoints existentes são adaptados no ponto de exibição; logs técnicos não são traduzidos. As prévias de restauração exibem nomes dos conjuntos em português sem modificar o arquivo de backup.

## Minha conta e senha

- `/minha-conta` fica fora do layout que exige empresa selecionada. Disponível para qualquer identidade ACTIVE autenticada, inclusive sem vínculo empresarial.
- Nome e e-mail são somente consulta. A área pessoal não concede administração global ou empresarial.
- Login e alteração de senha usam controles de mostrar/ocultar independentes, ocultos inicialmente, com botão de teclado, aria-label/aria-pressed, alvo de 44 px e autocomplete nativo.
- `POST /api/account/password` aceita somente `currentPassword`, `newPassword`, `confirmation`. A identidade é exclusivamente a da sessão validada; campos que escolham outra conta são rejeitados.
- Mesma política da ativação: 12 a 200 caracteres, sem trim, sem composição adicional; bcrypt 12. A política compartilhada não altera o contrato do convite.
- Exige senha atual, confirmação coincidente, origem do app e JSON limitado a 8 KiB. Requisição cross-site é rejeitada.
- Transação com lock da própria identidade serializa alterações e contagem de tentativas. Cinco falhas em 15 minutos bloqueiam novas tentativas por essa janela, usando eventos persistentes existentes; sem migration.
- Atualização com comparação do verificador anterior evita sobrescrita concorrente. Grava somente AuthIdentity e evento de auditoria SYSTEM. Não altera Usuario legado, membership, perfil ou capacidade de plataforma/suporte.
- Cliente de banco dedicado com logs Prisma desligados para escrita de credencial; nenhuma senha/verificador em resposta, auditoria ou log de request. Falhas são sanitizadas.
- Após a alteração, a interface informa sucesso e exige novo login. A senha antiga deixa de autenticar. Sessões anteriores em todos os dispositivos deixam de autorizar requests; as sessões das outras identidades continuam válidas.

## Sessões sem mudança de schema

O JWT criptografado contém um marcador HMAC opaco ligado à identidade, ao verificador atual e ao segredo de autenticação. O marcador é revalidado na consulta da sessão, nunca exposto no objeto público da sessão. O hash bcrypt não entra no JWT nem na resposta.

Sessões identity emitidas antes desta versão, que não possuem esse marcador, exigem **um novo login** após o deploy. Essa invalidação é deliberada e também deve ocorrer em eventual futura promoção PROD. O modo de rollback legacy permanece com o comportamento anterior; a nova área pessoal exige o modo identity vigente em PG18.

## Testes e laboratório

- `tests/account-password.test.mjs`: política, validação, próprio usuário, senha atual incorreta, limite de tentativas, conta inativa/ausente, hash bcrypt12, auditoria segura, marcador de sessão e labels sem mutação de enums.
- `tests/account-password.http.cjs`: laboratório LOCAL `phase11a_lab`, credenciais sintéticas por stdin. Auth HTTP real, origem/CSRF, anonimato, alvo indevido, sessão paralela revogada, senha antiga/nova, Membro, isolamento e limite persistente.
- `tests/account-ui.browser.cjs`: navegador LOCAL headless, teclado, autocomplete, três olhos independentes, confirmação, troca real e novo login, português dinâmico, Claro/Escuro e 1366×768 / 414×896. Imagens com campos vazios e dados sintéticos.
- Regressão afetada de acesso/guards, suporte/offboarding, navegação e aparência; TypeScript, build Linux, verificação de artefato e diff check.
- Nenhuma alteração de baseline, ledger ou formato de backup. Não repetir toda a história PG18 para este delta.

## Contratos de produto preservados e pendências

- Conta principal e contingência mantêm a mesma capacidade de Administrador da Plataforma, sem vínculo com empresa automático. A conta de experiência como Membro não receberá PlatformAdmin. Identificadores humanos e próximos cadastros ficam no checkpoint privado desta fase.
- Administrador da Plataforma continua sem leitura financeira automática. Acesso empresarial exige vínculo explícito; suporte segue concessão temporária própria.
- Não provisionar empresas reais, vínculos ou a conta de experiência nesta rodada.
- Recuperação por e-mail fica para próxima etapa com SMTP institucional definido; nenhuma falsa confirmação de envio.
- Backlog de preferências de filtros por usuário: período padrão, filtros pré-selecionados, lembrar últimos filtros e presets/favoritos. Não implementado.
- Cofre/DR, F9-07 e landing não fazem parte desta fase.

## Publicação

Fluxo autorizado: LOCAL → testes → novo SHA → HOMOLOG PG18 → regressão afetada → aceite de Ricardo. Auto-deploy permanece desligado. PROD/master ficam no SHA original até GO posterior explícito; não publicar PROD automaticamente.
