# Secure build — Fase 1A

Base: `homologacao@4b6ff46e14e56ad353de8eebeb74540a59008355`.
Infraestrutura `ops/homolog-route@674bf1e` continua separada. Não substituir o
Compose/Nginx ativo pelo Compose desta branch. Produção continua **NO-GO**.

## Build e proveniência

Docker Linux, Node **20.20.2 / Alpine 3.23**, fixado por digest no Dockerfile.
`npm ci` usa o lockfile; Prisma generate, Next build e TypeScript rodam no Linux.
Atualizar o digest exige nova validação. O build não recebe segredos: usa apenas
uma URL sintática sem senha, `127.0.0.1:1`, na instrução de compilação, sem ENV persistido.

Em checkout limpo e revisado, usar `ops/security/build-clean.ps1 -Tag <tag-privada>`.
O script arquiva **somente o commit**, não a working tree, e passa SHA completo e
branch ao Docker. Não publicar imagens preparatórias feitas antes do commit.
No Coolify, conferir `SOURCE_COMMIT` efetivo e checkout da branch antes/depois do build.
Não habilitar inclusão de secrets em build args; configurações privadas são runtime.
Na inspeção da HOMO, oito variáveis existentes estavam também marcadas build-time,
incluindo DATABASE_URL e NEXTAUTH_SECRET. O gate de deploy exige desmarcar build-time
somente na aplicação HOMO, preservando valores e runtime. Guardar apenas flags como
evidência; não exportar os valores nem reproduzir o Dockerfile antigo com ARGs privados.

Evidências a guardar juntas: SHA Git, digest da imagem, labels OCI, lockfile,
`/app/build-metadata.json`, versões Node/Prisma, log dos gates e origem do checkout.
Metadata é arquivo interno, sem endpoint público e sem banco/env/caminhos privados.
Labels/SHA declarados sozinhos **não são atestação criptográfica**: conferir a origem
limpa e registrar digest. Não se promete digest binário idêntico entre builds:
Next/build ID e dependências de sistema podem introduzir diferenças.

## Contexto ≠ runtime

`app/.dockerignore` nega por padrão e permite os inputs conhecidos. Não enviar
`.git`, `.next`, node_modules local, `.env*`, `.private`, relatórios, dumps,
backups, chaves, logs ou material Codex. Migrations/schema e assets públicos permanecem.
Não guardar material privado em `src`, `public` ou migrations.

O tracing das rotas de termos, que lê arquivos em runtime, havia capturado scripts
sem uso pela aplicação. `outputFileTracingExcludes` exclui fontes, ferramentas e
material privado. O stage `artifact` monta e **verifica antes do COPY para runner**;
o build falha se arquivos proibidos forem encontrados. Não copiar e apagar segredos
em layers posteriores. Dependências de produção e CLI Prisma continuam disponíveis.

Classificação das ferramentas:

| Grupo | Destino / decisão |
|---|---|
| `reset-passwords.js`, `generate-seed-hashes.js` | Removidos: ferramentas antigas com credenciais embutidas, sem consumidor runtime. Nunca executados nesta fase. Histórico Git não reescrito; eventual credencial histórica exige rotação separada. |
| `access2`, `access3b`, `access-final/dry-run` | Operação controlada, preservados no Git. Rodar em checkout/ferramenta isolada da mesma versão, com autorização; não no runtime web. |
| `access3c`, `access4`, `access5*`, `simulate-dev`, `test-email` | DEV/testes/bootstrap, preservados no Git e fora do runtime. |
| `migrate-logo-url`, `create-placeholder-pages` | Ferramentas históricas de manutenção/geração, preservadas, fora do runtime. |
| `scripts/secure-build` e testes/análises puras | Apenas builder/validação, nunca runner. |
| Prisma CLI + schema + 12 migrations | Necessários ao procedimento de deploy aprovado, presentes; iniciar imagem **não executa migrations**. |

Verificar a imagem sem credenciais:

```sh
docker image inspect --format '{{.Id}} {{json .Config.Labels}}' IMAGE
docker run --rm --network none --entrypoint cat IMAGE /app/build-metadata.json
docker run --rm --network none --entrypoint node IMAGE --version
docker history --no-trunc IMAGE
```

Inspecionar filesystem **e layers** com `docker create/export/save`, sem iniciar
scripts operacionais. Exigir ausência dos arquivos proibidos e presença de schema,
migrations, server e metadata. Smoke de `/login` e providers usa runtime isolado,
sem contas reais; validar guards sem banco ou com fixture descartável autorizada.

## Secrets / G01

Compose exige `DB_PASSWORD` e `NEXTAUTH_SECRET`, sem fallback. `.env.example` contém
placeholders, não credenciais. Valores reais pertencem ao gerenciador privado.
Não usar `docker compose config` sem `--quiet` em logs públicos: ele expande secrets.
Alterar env de PostgreSQL já inicializado **não troca a senha da role existente**.
Rotação real não foi feita; seguir [G01-ROTATION-RUNBOOK.md](G01-ROTATION-RUNBOOK.md).

## Origem confiável / G20

Por padrão, a aplicação ignora **todos** os headers de origem e usa um bucket
conservador compartilhado (10 tentativas / 15 minutos / processo). Isso bloqueia
spoofing, mas usuários compartilham o limite enquanto o contrato do proxy não for
habilitado. Não habilitar múltiplas réplicas sem store compartilhado.

Para limites por cliente, o edge controlado deve sobrescrever X-Real-IP e
X-Forwarded-For com `$remote_addr`, e inserir `X-10S-Proxy-Token` privado de 64 hex.
Aplicação valida esse token contra `TRUSTED_PROXY_TOKEN` antes de usar X-Real-IP;
listas/endereços inválidos voltam ao bucket compartilhado. O token não deve aparecer
em logs, respostas, Git, build args ou camada da imagem. Não aceitar IP fornecido
pelo cliente nem inferir confiança por Host. Porta do app restrita à rede privada.

`ops/security/trusted-proxy-location.conf` é uma **proposta não aplicada na VPS**.
Instalação futura: backup, segredo privado aleatório por ambiente, incluir somente
no location HOMO, verificar rede/portas, `nginx -t`, revisão e reload autorizado.
Rollback: remover include/secret do location, validar Nginx e voltar ao bucket
compartilhado removendo TRUSTED_PROXY_TOKEN. Não reutilizar segredo entre ambientes.

## Endpoint legado / G12

`POST /api/lancamentos/importar` retorna 410, não lê corpo nem importa banco.
O único consumidor encontrado é o componente legado não montado; a UI usa
`/api/lancamentos/importacao-oficial`. Chamadores externos devem migrar para o
fluxo oficial. Os seis importadores XLSX não foram refatorados. A barreira normal
do middleware continua retornando 401 para requisições sem sessão.

## Gates e promoção

Testes puros de auth/guards/importação + segurança, smoke de parsers, TypeScript,
lint comparado à base (sem reforma da dívida anterior), build Linux, Docker build,
inspeção do artefato/layers e smoke local. Testes que escrevem banco não recebem
env real. Só depois: commits revisados → branch de trabalho → homologacao → deploy
HOMO → verificação de SHA, callbacks, runtime e banco intacto → login manual de Ricardo.
Master/PROD não participam desta fase. Não executar migrations ou iniciar Fase 2.

Referências: [Next standalone/tracing](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
[Docker build practices](https://docs.docker.com/build/building/best-practices/).
