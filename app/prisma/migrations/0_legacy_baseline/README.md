# Baseline do schema legado

Gerada a partir do `schema.prisma` anterior ao ACCESS-2. Em 2026-10-05, um
`prisma migrate diff --from-schema` contra o banco local `gestar_vf_dev`
retornou **No difference detected**. Por isso, no banco DEV existente esta
migration deve ser registrada com `prisma migrate resolve --applied
0_legacy_baseline`; executar seu SQL ali recriaria tabelas existentes.

Esta baseline contém somente DDL, sem dados. Ela permite que uma instalação
nova construa o schema legado antes de aplicar ACCESS-2. Não marcar a baseline
como aplicada em produção sem inventário e comparação próprios; o DEV não prova
que a produção tenha o mesmo estado. Os SQLs manuais anteriores continuam
relevantes para a análise histórica e não foram alterados.
