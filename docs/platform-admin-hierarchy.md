# Administração da Plataforma: catálogo hierárquico

Empresas/tenants são o eixo do catálogo. Cada linha expande seus vínculos com
identidades globais, funções empresariais, perfis e situação do vínculo. A mesma
identidade aparece nos tenants dos quais participa; o agrupamento usa IDs e não
cria nem duplica dados. Contas sem vínculo ficam em uma seção própria, incluindo
PlatformAdmins sem membership. A busca global preserva o contexto empresarial.

As APIs e as autorizações existentes continuam responsáveis pelas operações.
PlatformAdmin não recebe acesso financeiro implícito nem aceita contratos por
representação. A criação manual de tenant e os Convites Especiais permanecem
fluxos separados.

## Proprietários e responsável contratual

- **Designar Proprietário** aparece quando `activeOwnerCount` é zero.
- **Adicionar Proprietário** aparece quando já existe proprietário ativo e permite
  adicionar outro. O texto descreve a situação do tenant; não é uma nova permissão.
- Para identidade já vinculada ao tenant, a interface mantém a chamada a
  `POST /api/platform/tenants/[id]/owners`. A API exige confirmação, identidade e
  tenant ativos, mapping legado completo e preserva identidade, vínculo e perfil.
  Promove/reativa o vínculo para OWNER, sincroniza o mapping legado e audita.
- Para outro destinatário, mantém
  `POST /api/platform/tenants/[id]/owner-invitations`, por compartilhamento manual.
  O convite precisa ser aceito pelo titular; o administrador não escolhe a senha
  dele. Uma identidade existente não é duplicada para participar de outro tenant.
- **Responsável contratual** é uma designação adicional e explícita de um OWNER
  ativo do mesmo tenant, autorizada pela API própria. Adicionar ou designar OWNER
  não significa aceitar os termos nem concluir o onboarding contratual da Fase 12A.

Nenhuma dessas regras de servidor foi alterada nesta reorganização.

## Identidade de HOMOLOG

O favicon amarelo/preto e a identificação interna de HOMOLOG exigem, no servidor,
as origens pública e de autenticação `https://homolog.dezsolucoes.com.br` e o banco
`gestar_homolog_pg18` no host já configurado de HOMOLOG. Branch, parâmetros do
navegador e flags de preview não habilitam a identidade amarela em LOCAL ou PROD.

Os ativos azuis aprovados permanecem byte a byte iguais. A variante amarela usa
substituição de cores dos pixels originais, sem redesenhar, com transparência
externa preservada. As rotas SVG/ICO selecionam o ativo no servidor e os metadados
usam URLs versionadas; o favicon não depende da publicação de arquivos por ambiente.

## Validação e limites

O teste `tests/platform-hierarchy.http.cjs` aceita exclusivamente o novo DEV
operacional `http://localhost:3023` com PostgreSQL real em
`127.0.0.1:55432/gestar_vf_dev` dentro do namespace privado. As mutações do teste
atingem apenas fixtures sintéticas próprias. A guarda do piloto não é ampliada:
Convites Especiais continuam restritos aos ambientes já autorizados, com a central
visível em HOMOLOG e indisponível no perfil operacional LOCAL.

Validar agrupamento, busca, estados, navegação, teclado, mobile, autorizações,
convites operacionais e responsável contratual; preservar as regressões de
Convites Especiais, criptografia, backup e Fase 12A. A publicação desta rodada é
exclusivamente em HOMOLOG, com SHA fixado, sem migrations ou e-mails reais.
