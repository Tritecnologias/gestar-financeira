# ACCESS-5A — termos versionados

## Decisões

- `TermDocument` identifica o documento, sua audiência (`CONTRATANTE` ou `USUARIO`) e se é obrigatório. O texto jurídico não integra o código.
- Cada `TermVersion` contém metadados de um PDF privado, SHA-256, regra de reaceite e estado `DRAFT`, `PUBLISHED` ou `RETIRED`. Uma versão publicada não pode ter conteúdo ou metadados alterados; a retirada de vigência conserva o histórico.
- O aceite do contratante pertence ao tenant e ao `TenantMembership` OWNER designado explicitamente em `TenantContractualResponsible`. Não se presume um responsável para tenants históricos. Se a designação mudar, o novo responsável deve aceitar.
- O aceite individual de usuário é global por `AuthIdentity` e versão, sem duplicação a cada tenant. A administração do tenant só consulta status, versão e data, sem IP ou User-Agent.
- `requiresReaccept=true` exige a versão vigente. Com `false`, um aceite anterior do mesmo documento satisfaz usuários existentes; quem nunca aceitou precisa aceitar a versão vigente.
- Evidências são append-only: identidade, versão, tenant e membership quando aplicáveis, papel no aceite, data, IP e User-Agent quando disponíveis e hash do PDF. IP vindo de cabeçalhos de proxy depende da configuração confiável desse proxy.
- O modo de autenticação legado de rollback não gera evidência de identidade verificável e, por isso, não entra no gate de termos. A aplicação normal por `AuthIdentity` entra. Desativar o modo legado antes de exigir aceite universal.

## Armazenamento e implantação

Em produção, configure `TERM_STORAGE_DIR` com caminho absoluto para volume privado e persistente, fora de `public` e `.next`, com backup compatível com a retenção jurídica. O processo deve ter acesso de leitura e escrita. O upload aceita PDF de até 10 MB, usa nome aleatório e salva SHA-256 no banco; o download é autenticado e confere o hash. No DEV, o padrão é `app/.private/terms`, ignorado pelo Git. O build exclui `.private` do rastreamento de arquivos. Não publicar documento obrigatório antes de definir os responsáveis contratuais dos tenants envolvidos.

As migrations `20261005_access5a_versioned_terms` e `20261005_access5a_z_integrity` são aditivas. O rollback usual é de aplicação, mantendo tabelas e evidências inertes. Qualquer reversão física requer exportação protegida de PDFs, metadados e aceites, além de aprovação operacional e jurídica; não apagar aceitações como rollback rotineiro.

## Teste DEV

No diretório `app`, após `prisma generate` e `next build`, execute `node --env-file=.env.local scripts/access5a/test-dev.mjs`. O script recusa bancos fora de `127.0.0.1:55432/gestar_vf_dev`, cria um schema exclusivo, usa porta 3015 e arquivos em `.private/access5a-test-*`, testa os fluxos e remove as fixtures ao final. Se o processo for encerrado à força, verificar e remover apenas o schema e diretório temporários identificados. O teste não usa tenants nem lançamentos HOM-REAL.
