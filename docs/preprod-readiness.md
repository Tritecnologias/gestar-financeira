# Candidato técnico pré-PROD

Esta rodada prepara código e ensaios locais. Não autoriza deploy, migrations ou
configuração de PROD. A integração da landing e a liberação comercial dependem
da aprovação arquitetural de Ricardo. O exemplo runtime mantém ambas as flags
de Convites Especiais desligadas.

## Histórico produtivo separado

Os cinco arquivos de `prisma/migrations` do piloto permanecem idênticos. A
migration `20261029_z_experiment_link_recovery` continua recusando PROD. Não há
substituição de nome de banco, `migrate resolve`, alteração de checksum ou
declaração fictícia de execução desses arquivos em PROD.

O perfil **production** empacota as três migrations comuns já aplicadas e a nova
`prisma/production-migrations/20261030_prod_experiment_invitations/migration.sql`.
Ela cria a tabela global já com a coluna cifrada, sob o próprio nome/checksum.
O Prisma registra a execução real dessa migration. Exige banco
`gestar_prod_pg18`, PostgreSQL 18, role `pg18_prod_migrator`, ledger3 exato e
runtime restrito. Uma linha pendente da própria migration é normal durante a
execução do Prisma; qualquer outra pendência é recusada. Não muda dados antigos,
não cria acesso, não faz seed/backfill. SELECT/INSERT/UPDATE são concedidos à
role `pg18_prod_runtime`; DELETE, DDL e escrita no ledger não são concedidos.

O perfil **homolog**, padrão do build, conserva as cinco migrations originais e
seus ativos amarelos. Nunca executar o `prisma migrate deploy` da árvore fonte
do piloto contra PROD. Uma futura migration produtiva deve usar a árvore do
artefato production revisado, cujo metadata lista exatamente quatro arquivos.
O build valida os checksums antes de preparar cada perfil. O schema Prisma é o
mesmo porque a estrutura final é equivalente, mas os ledgers não são falsificados.

## Backup e rollback

O formato operacional continua v3. O contrato reconhece os históricos exatos:
base3; piloto4; piloto5; produtivo4. São permitidos mesmo histórico, base3 para
qualquer adição aprovada, e piloto4 para piloto5. Não cruza produtivo4 com piloto,
não aceita checksums desconhecidos e não restaura produtivo4 para base3.

Convites globais/chaves não pertencem às seções de backup/restauração de tenant.
O dump integral do ambiente contém cifras e exige a custódia correspondente.
O ensaio local usa somente schema real + ledger, com dados sintéticos: não lê nem
restaura linhas ou PDFs da Izilda. Recuperações integrais antes/depois são
comparadas por tabela. Isso não substitui backup fresco e ensaio da futura janela.

Rollback preferido após schema novo: flags desligadas e binário compatível com
produtivo4, preservando tabela, chaves, auditoria e negócios. O antigo binário
b2a9a239 só conhece base3 para backup; não é um rollback integral seguro para
produtivo4. Não apagar coluna/tabela/ledger. Recuperação integral exige suspensão
de escritas, snapshot coerente, RPO/RTO e reconciliação aprovados.

## Liberação e chaves

Além da flag geral, PROD exige perfil production, flag de aprovação produtiva,
origens de app/auth e host/banco exatos de PROD, e keyring AES válido. Defaults
falham fechados. Isso não altera PlatformAdmin, autenticação ou contratos. Não
habilitar a flag de aprovação antes do aceite arquitetural e operacional futuro.

A chave exclusiva de PROD é preparada em custódia privada fora de Git, imagem e
backup comum de negócio; nenhuma chave real consta deste repositório. A cópia
de recuperação deve ser testada com token sintético. Custódia DPAPI CurrentUser
não equivale a cofre independente de desastre; este permanece decisão operacional
antes de PROD. Não reutilizar AUTH/NEXTAUTH_SECRET, chaves de backup ou de HOMOLOG.

## Identidade

`--build-arg DEPLOYMENT_PROFILE=production` remove fisicamente os sete ativos
`homolog-yellow*` do runtime e empacota somente a trilha de migrations produtiva.
O perfil production nunca seleciona amarelo, mesmo diante de uma configuração
incompatível de HOMOLOG. Login/sidebar usam o favicon azul oficial fora de HOMOLOG,
sem o fallback antigo. O perfil homolog e a tupla confiável de ambiente preservam
amarelo/preto. A geometria e os bytes dos ativos oficiais não são alterados.

## Limite arquitetural da landing

Nenhuma rota nova ou alteração da landing pública integra esta rodada. A prévia
existente e seu conteúdo continuam homologados. A proposta de integração final
é apresentada separadamente para aprovação, antes de implementação. Corrigir a
precedência de Referrer-Policy nas rotas existentes não altera essa arquitetura.
