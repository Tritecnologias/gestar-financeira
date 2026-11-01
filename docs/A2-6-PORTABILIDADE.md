# A.2.6 — candidato único e preparação operacional

Escopo autorizado: correção LOCAL dos bloqueios do candidato `57a44fd04662adb3e416cf22f91333a9e1076c0f`. Nenhuma implantação, acesso remoto, mensagem real ou alteração visual faz parte desta rodada. A baseline `74400e028949a763107061a09b8af6e406e83e70` e todos os commits aprovados continuam ancestrais do candidato.

## Causas e correções

1. A política de Admission recusava PROD e aceitava apenas e-mails sintéticos. Agora a mesma aplicação seleciona a configuração autorizada LOCAL/HOMOLOG/PROD em runtime, com origem, conexão, credencial dedicada e prova do catálogo PostgreSQL em cada transação. Mock continua restrito a `@example.invalid`. PROD pode selecionar o adaptador SMTP já existente, sujeito à configuração privada e autorização de implantação futuras. Não foi implementado outro provedor nem enviado e-mail real.
2. Admission em HOMOLOG possuía uma migration específica; a linha produtiva ainda incorporava a restrição de laboratório. A nova origem `prisma/portable-migrations` fornece exatamente o mesmo DDL aprovado para H7→H8 e P6→P7. Os arquivos históricos permanecem intactos. A autorização da conexão (`application_name`) é apenas um requisito: banco, usuário autenticado, role, proprietário, schema, ledger completo e privilégios efetivos também precisam corresponder. ACL concede somente SELECT/INSERT e UPDATE nas colunas aprovadas das duas tabelas.
3. O build escolhia uma linhagem e removia recursos de outro ambiente. O build agora produz uma única imagem `portable`, contendo as três linhagens históricas e a mesma migration Admission. `prisma.config.cjs` seleciona a pasta pelo perfil em runtime, sem reescrever SQL. `DEPLOYMENT_PROFILE` não é ARG/ENV de build; não há configuração de Admission `NEXT_PUBLIC_*`. Layout, adesão e favicon já são dinâmicos. A versão de Node/base Docker e a verificação de artefatos são preservadas.

## Configurações legítimas

| Configuração | LOCAL | HOMOLOG | PROD futura |
|---|---|---|---|
| DEPLOYMENT_PROFILE | local | homolog | production |
| Autorização da aplicação | ADMISSION_LAB_ENABLED | ADMISSION_HOMOLOG_ENABLED | ADMISSION_PRODUCTION_ENABLED |
| APP_PUBLIC_URL / NEXTAUTH_URL | http://localhost:3020 | https://homolog.dezsolucoes.com.br | https://app.dezsolucoes.com.br |
| Banco | special_invite_lab | gestar_homolog_pg18 | gestar_prod_pg18 |
| Runtime / migrator | a2_runtime / a2_migrator | pg18_homolog_runtime / pg18_homolog_migrator | pg18_prod_runtime / pg18_prod_migrator |
| Intent da conexão de migration/ACL | dez-a2-local-h7-h8 | dez-a2-homolog-h7-h8 | dez-a2-production-p6-p7 |
| Ledger | H7→H8 | H7→H8 | P6→P7 |
| E-mail do ensaio | mock | mock | mock |
| Captura mock | /tmp/a2-mail | /var/lib/10s/backups/admission-mail | /var/lib/10s/backups/admission-mail |

As outras duas autorizações devem permanecer desligadas. Credenciais, chaves de sessão, captura e proveniência de backups são independentes por ambiente e fornecidas exclusivamente em runtime. `ACCESS_AUTH_MODE=identity`; nenhuma credencial de migrator entra na aplicação. A política de Convites Especiais e sua autorização produtiva continuam independentes.

SMTP real, recuperação autônoma de conta, configuração dos ambientes e aceite final de Ricardo continuam dependências para disponibilização pública. O ensaio usa mock também no perfil PROD. Selecionar posteriormente o adaptador SMTP existente demanda configuração/validação operacional, não rebuild ou reescrita da aplicação.

## Validação e evidências

Reutiliza-se `scripts/admission/run-homolog-lab.mjs`, estendido para uma execução final com a mesma imagem imutável nas três configurações. Banco PostgreSQL 18.6 real e descartável, rede `none`, zero portas publicadas, credenciais e documentos sintéticos. O auxiliar de banco/criptografia é uma dependência de laboratório já ensaiada; nunca substitui a imagem da aplicação.

O ensaio verifica o inventário completo de roles e ACLs, históricos e hashes, 42→44 tabelas, oito FKs, rejeições de autoridade e privilégios, repetição, falha real por lock com rollback e ledger interrompido, backup CMS AES-256-GCM antes/depois e restauração em instâncias independentes. A recuperação compara dados, contratos, ledger, roles, ACLs, arquivos privados, UID/GID, permissões e retomada de sessão. HOMOLOG e PROD executam o mesmo teste HTTP de identidades nova/existente, concorrência, OWNER, captura cifrada, uso único e bloqueio contratual. LOCAL recebe smoke do mesmo artefato. A interface aprovada não é redesenhada nem reaprovada nesta correção.

Reutilizam-se por hash as funções de inventário, captura e restauração do procedimento do Pacote A. O protocolo supervisionado PowerShell 7 e o verificador OCI também são reutilizados. Não se cria outro executor de publicação. Evidências finais ficam fora da imagem, no diretório de trabalho `a2-6-portability`, vinculadas ao SHA do commit construído. Este documento define o procedimento; o parecer depende do resultado efetivamente registrado, não desta descrição.

## Procedimento final para uma janela futura de HOMOLOG

1. Obter autorização específica. Conferir SHA/árvore, cadeia OCI completa, digest e artefatos; repetir apenas os gates temporais de HOMOLOG (SSH, permissões, Docker, disco, serviços, ledger H7, roles/ACLs, concorrência e auto-deploy desligado). O inventário anterior é evidência histórica, não substitui o estado da janela. PROD permanece fora do escopo.
2. Usar o executor PowerShell 7 já homologado, supervisão, limites, códigos de retorno e transporte binário/hash. Parametrizar seu manifesto com o novo SHA, digest/manifesto/config, perfil `portable`, alvo HOMOLOG e hashes da migration/ACL. Não executar o antigo entrypoint de publicação de PROD. Segredos seguem custódia privada; não registrar DSN, senha, token ou chave.
3. Quiescer somente a aplicação de HOMOLOG; capturar banco, roles completas, configuração privada, documentos e backups em CMS AES-256-GCM fresco. Restaurar em clone isolado e provar equivalência antes de migration. Nenhum backup remoto está autorizado nesta rodada.
4. Com a mesma imagem OCI, executar Prisma oficial como migrator autenticado: `node node_modules/prisma/build/index.js migrate deploy --config /app/prisma.config.cjs`, `DEPLOYMENT_PROFILE=homolog`, conexão própria contendo `schema=public&application_name=dez-a2-homolog-h7-h8`. Validar H8 exato e aplicar somente `/app/prisma/migrations/manual_admission_runtime_acl.sql` por psql autenticado como migrator, com o mesmo intent. Nunca resolver manualmente um ledger falho como se tivesse concluído.
5. Validar 44 tabelas, FKs, unicidade, catálogo/ACL, ausência de alterações nos contratos e dados anteriores. Iniciar a aplicação com a imagem por digest e credencial runtime, configuração HOMOLOG, mock cifrado e chaves independentes. Smoke técnico sintético e evidências; manter auto-deploy desativado. Disponibilizar o teste de Ricardo apenas após sucesso.
6. Contingência: falha anterior à promoção mantém acesso fechado e recupera o backup H7 completo, incluindo configuração e volumes. Após H8, usar a MESMA imagem compatível com H8, podendo desabilitar Admission via configuração. Não executar binário 74400e0 sobre H8, não fazer down-migration e não descartar contratos novos. Se a restauração prévia implicar perda de novas operações, parar e submeter o ponto de recuperação ao responsável. Preferir recuperação H8 íntegra e retomada com o mesmo artefato.

O certificado/chave de recuperação do ensaio é sintético e efêmero. Os arquivos CMS de evidência não são backups operacionais a reutilizar. Na implantação, custódia real e recuperação comprovada são gates obrigatórios.
