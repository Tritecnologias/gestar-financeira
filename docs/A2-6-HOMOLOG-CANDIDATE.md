# A.2.6 — candidato para HOMOLOG, preparação exclusivamente LOCAL

Base: `90905683667567f2e8383b38629ff39146f2d25b`.
Branch: `feat/a2-6-homolog-candidate`. Nenhuma operação remota nesta rodada.

## Correções dos bloqueios

1. **Aplicação:** o bloqueio exclusivamente LOCAL passa a admitir uma configuração
   explícita de HOMOLOG, com origem HTTPS, host/banco/runtime exatos, autenticação
   por identidade, duas chaves independentes e transporte mock. Isso é apenas o
   primeiro gate: cada transação Admission atesta no banco a sessão, PostgreSQL 18,
   schema, proprietários, roles sem elevação/memberships, ledger H8 completo e
   checksums, permissões mínimas e ausência de exposição a PUBLIC/terceiros.
   Uma flag, URL, nome de banco ou cabeçalho não substitui essa prova.
2. **Migration:** variante de HOMOLOG selecionada pelo preparador de artefato já
   existente. Exige conexão do migrator dedicado, sessão sem SET ROLE, intenção
   `application_name=dez-a2-homolog-h7-h8`, identidade/proprietários/roles reais,
   H7 exato e 42 tabelas. Cria as mesmas duas tabelas e cinco enums da fundação.
   O trecho DDL original foi preservado byte a byte. Não há estrutura adicional.
3. **ACL:** script separado, restrito ao migrator/H8 exato. Somente SELECT/INSERT e
   UPDATE nas colunas mutáveis de Admission e AdmissionChallenge. Sem DELETE,
   TRUNCATE, UPDATE genérico, DDL ou alteração de grants das tabelas anteriores.
4. **Ledger/backup/artefato:** o H8 de HOMOLOG tem checksum próprio. Os SQLs LOCAL
   H8/P7 e seus hashes permanecem intactos. Backups tenant H8 HOMOLOG restauram
   somente o mesmo perfil/histórico, sem converter ou reassinar H7/LOCAL/PROD.
   O preparador existente embute somente as migrations do perfil escolhido.
5. **Executor:** o `ops/security/build-clean.ps1` existente recebe perfil explícito
   e opção offline; preserva exigência de Git limpo e fonte por `git archive`.
   Não foi criado executor de publicação. Os novos scripts são laboratórios
   sem rede, SSH ou capacidade de selecionar um alvo remoto.

Nenhuma tela, texto aprovado, contrato jurídico, regra de autenticação, ordem de
jornada ou serviço funcional foi reconstruído. A única chamada acrescentada ao
serviço é a atestação do ambiente dentro da transação existente.

## Contratos verificáveis

- H7: sete migrations históricas, 41 tabelas de aplicação + ledger = 42.
- H8 HOMOLOG: oito migrations, 43 tabelas de aplicação + ledger = 44.
- Migration A.2 HOMOLOG SHA-256:
  `7a825594c7abe3f0b7b87f07588b4e2b29d47d2c3ad02aeedc3a382f5a0d3551`.
- Migration histórica LOCAL SHA-256:
  `46d7bd07acb5fc075e824cf064de3fdc655ea8e85fc33f202f95c6ded965874b`.
- Runtime: `pg18_homolog_runtime`; migrator: `pg18_homolog_migrator`.
- Banco/host: `gestar_homolog_pg18` / `0f5rvkjqjdt9fez1ajiascyk`.
- Schema public, tabelas do migrator, database owner admin ou migrator e schema
  owner `pg_database_owner` ou migrator; nenhuma concessão para atender o gate.
  Se o inventário remoto divergir, parar e analisar, sem afrouxar as condições.

## Pré-voo e evidências

Os resultados consolidados, hashes e limitações estão registrados em
`docs/evidence/a2-6-candidate.json` e no diretório local `a2-6-candidate`.
Antes do commit: 294 testes unitários, 556 verificações HTTP de regressão,
56 verificações no navegador e 35 verificações do laboratório operacional,
incluindo restauração, aprovados. A atestação da imagem construída a partir do
commit limpo é registrada depois, no diretório externo, vinculada ao SHA/digest.
O ensaio usa PG18.6 descartável, sem rede externa ou portas publicadas, fixtures
@example.invalid, Prisma CLI real, imagem imutável e códigos de retorno explícitos.
Testa H7→H8, repetição, falha tardia, ledger falho, recuperação de H7, roles,
owners, FKs, unicidade, ACLs, criptografia AES-256-GCM e recuperação independente.
Na variante com imagem final, testa a aplicação standalone, nova/existente
identidade, concorrência, cookies seguros, retomada e fallback na mesma imagem H8.

O SSH foi inspecionado somente offline: cliente, existência/ACL da chave e
known_hosts. Credenciais reais não foram decifradas. Não houve conexão remota.
O inventário remoto previamente coletado é contexto histórico, não prova atual.

## Plano de implantação futura — exige novo aceite

1. Congelar SHA e digest da imagem aprovados; validar Git limpo, arquivo de imagem
   e hashes de SQL/ACL. Usar PowerShell 7, caminhos literais, UTF-8 sem BOM, SQL LF
   e transferência de binários por arquivo/streams, nunca conversão por texto.
2. Na janela autorizada, autenticar SSH com host key fixada; conferir host, Docker,
   espaço/RAM, Python/cryptography e permissões. Inventariar **todas** as roles e
   memberships PostgreSQL, owners, schema, ledger H7, ACLs, aplicação, mounts e
   filas/hooks/auto-deploy. Comparar PROD antes/depois, sem ação de escrita nele.
3. Adaptar os parâmetros do procedimento existente de UX04 H6→H7 para esta janela
   H7→H8: SHA/digest, hashes, contagens, migration pendente, ACL específica e as
   novas variáveis privadas. Os scripts históricos têm constantes antigas e não
   devem ser executados literalmente. Nenhum novo executor paralelo é necessário.
4. Confirmar capture mock e diretório privado no volume de backups. Provisionar
   as duas chaves por custódia privada; não habilitar SMTP nem destinatários reais.
5. Fazer quiescência e backup fresco consistente de banco, roles, owners/ACLs,
   volumes de termos/backups (incluindo e-mail cifrado), configuração/chaves e
   imagem. Cifrar no contrato `DEZ-HOMOLOG-DR/1` AES-256-GCM, guardando chave fora
   do arquivo/log. Restaurar em clone sem rede/SMTP e conferir conteúdo, catálogo,
   ledger, roles/memberships, ACLs, arquivos e aplicação antes de prosseguir.
6. Carregar e conferir imagem pelo digest; preparar candidato e recuperação
   compatíveis com H8. Manter auto-deploy desligado, sem promoção de master.
7. Parar somente HOMOLOG e revalidar ausência de drift desde o backup. Rodar o
   Prisma CLI da imagem com migrator e a intenção explícita na conexão. Exigir
   apenas `20261101_admission_foundation` pendente; confirmar H8, 44 tabelas e
   hashes. Aplicar somente `app/scripts/admission/homolog-runtime-acl.sql` via
   psql com `ON_ERROR_STOP=1`, `PGAPPNAME=dez-a2-homolog-h7-h8` e migrator.
8. Conferir a atestação do runtime, iniciar candidato e executar smoke sintético.
   Publicar somente em HOMOLOG; conferir configuração de supervisão, logs,
   health, digest/SHA efetivo e preservação de PROD. Registrar cada código de
   retorno e evidência sanitizada; qualquer gate falho interrompe a sequência.

## Contingência

- Antes da migration, H7 íntegro: manter/reiniciar o binário H7 original.
- Falha com ledger pendente/falho/desconhecido: não marcar migration aplicada nem
  apagar evidências para liberar execução. Parar; recuperar o backup consistente
  em clone, validar e escolher o cutover mediante autorização da janela.
- H8 íntegro: usar exclusivamente a imagem H8 verificada e configuração/chaves
  compatíveis, inclusive no container de recuperação. Não fazer fallback do
  binário `74400e0` ou `9090568` sobre H8 HOMOLOG.
- Reversão de banco exige o conjunto consistente H7 + volumes + configuração +
  imagem H7. Após novas gravações, implica possível perda; não automatizar.

## Gates remotos e limites de GO

Este ensaio não comprova autenticação SSH atual, privilégios no servidor, recursos
disponíveis, DNS/TLS/proxy/Coolify nem inventário atual de roles/ledger/volumes.
Esses pontos exigem verificação na futura janela, antes de qualquer alteração.
Disponibilidade de imagem no Docker **local** não prova disponibilidade no host.
Não declarar GO operacional irrestrito com base nos testes funcionais.

Recuperação autônoma de conta, entrega real de e-mail, preparação dos ambientes e
homologação final de Ricardo continuam pendentes para publicação pública. Nenhuma
dessas funcionalidades foi implementada. PROD permanece fora do escopo.
