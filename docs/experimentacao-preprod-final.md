# Preparação produtiva — /experimentacao

Base `ab1f38ab518a5f83d1fa9630966252df8f154559`, com a experiência homologada
de Convites Especiais. Não incorpora os commits de integração institucional.
A landing pública é independente; não são necessários Site, Worker, domínio,
DNS ou CORS entre origens. Este documento não autoriza publicação ou DDL real.

## Identidade e fluxo

O servidor escolhe ícones SVG/ICO e o rótulo da apresentação pela configuração
confiável já existente. HOMOLOG exige sua tupla exata app/auth/banco; production
nunca seleciona amarelo. A cópia da apresentação elimina os favicons PNG/SVG
institucionais concorrentes sem modificar sua arte ou a landing pública.
Gestão continua exclusiva do PlatformAdmin; convidado utiliza fragmento removido
do histórico atual, token apenas em memória e POST relativo sem credenciais.
Nenhum interesse/boas-vindas cria autenticação, conta, tenant, membership ou
aceite contratual. Convite operacional e Fase 12A permanecem separados.

## API pública

Origem deve continuar sendo a do próprio app. Não há permissão CORS externa.
JSON até 2048 bytes, inclusive streaming, UTF-8 estrito e erro sem payload.
Limites por processo: 600 requisições/min global, 120/5min por IP comprovado
pelo proxy autenticado e 40/5min por hash de token. Sem IP verificável aplica
somente o teto global; nunca interpretar X-Forwarded-For como evidência confiável.
429 tem Retry-After e orientação para tentar novamente. Buckets limitados a 10000,
somente digests, sem tokens/endereço em logs. Não depende da sessão do convidado.

Esse circuito é adequado ao candidato de uma réplica, mas não é proteção DDoS
distribuída. Antes da janela, verificar réplica única, timeouts/limites de ingress,
origem/headers autenticados e logs sanitizados. Escala horizontal exige rate store
compartilhado ou controle equivalente no proxy antes de mudar a topologia.

## Custódia portátil, independente de Windows

`app/scripts/ops/invitation-key-escrow.mjs` é ferramenta operacional independente,
sem dependência externa e sem uso de DPAPI. O formato versionado cifra o keyring
AES-256-GCM do app com DEK aleatória, IV aleatório e AAD vinculado ao formato e
fingerprint do destinatário. A DEK é encapsulada para chave pública RSA >=3072
com OAEP-SHA256. Recuperação exige a chave privada correta; adulteração, chave
fraca/errada ou keyring inválido falham com erro genérico. IDs antigos podem ser
mantidos para recuperar cifras anteriores sem regenerar tokens.

Operação produtiva planejada: chave privada de recuperação cifrada em cofre
independente com MFA/RBAC/trilha de acesso; autorização/passphrase em custódia
separada; envelope de keyring em repositório de recuperação restrito, fora dos
backups comuns do negócio. A chave pública/fingerprint pode ser distribuída ao
operador de selagem. Separar responsáveis e exigir aprovação para abertura.
Não colocar PEM privada, passphrase ou keyring em Git, imagem, argumentos de
comando, logs ou relatórios. Passar segredos por canal privado/stdin/memória e
injetar somente no runtime autorizado. Não reutilizar auth ou chaves de HOMOLOG.

A biblioteca não instala/configura um cofre corporativo nem valida processos
humanos por si só. Responsáveis, localização/acesso ao cofre, cópia independente
e teste em host limpo devem constar do checklist da futura janela. O laboratório
usa exclusivamente material sintético, volumes de custódia separados do banco
e novo processo Linux para recuperação; não instala chave real em PROD. Não
forçar acesso ou modificar o preparo DPAPI anterior. O artefato operacional deve
ser distribuído pelo SHA revisado e checksum, separado da imagem de aplicação.

## Migration, backup e rollback

Perfis e SQL históricos de `docs/preprod-readiness.md` permanecem intactos:
production empacota base3 + `20261030_prod_experiment_invitations` (produtivo4);
homolog empacota o histórico piloto5. Build deve passar explicitamente
DEPLOYMENT_PROFILE=production e verificar metadata, quatro SQLs e zero ativos
amarelos. Não executar a árvore piloto em PROD, mudar checksums ou usar resolve
para inventar histórico. Runtime sem DDL/escrita de ledger/DELETE de convites.

O backup de tenant v3 exclui convites globais e chaves. Recuperação integral
exige banco/ledger/owners/ACL + arquivos/termos + configurações/referências de
segredos e custódia separada. Ensaiar cópia coerente sem egress e comparar
fingerprints, vínculos, contratos, arquivos e recuperação dos links cifrados.
Os ensaios sintéticos não substituem backup fresco na janela produtiva.

Plano de janela, somente após autorização específica:
1. Fixar SHA/digests e fallback; saúde, auto-deploy OFF, sem concorrência; tupla,
   roles, ledger3/checksums e mounts preservados. Não alterar segredos de auth,
   assinatura de backup, sessões ou configurações de tenants.
2. Backup integral fresco privado com hashes/horário; testar restauração isolada
   protegida. Não usar dados reais da Izilda em testes funcionais. Confirmar
   RPO/RTO e reconciliação. Testar recuperação da custódia antes de prosseguir.
3. Provisionar AES exclusivo pelo cofre somente nessa janela autorizada, flags
   geral/aprovação produtiva inicialmente false, nenhum SMTP real.
4. Aplicar a migration produtiva pelo artefato production/role migrator e publicar
   código compatível com flags fechadas; controlar a transição para não executar
   backup lógico com binário que desconhece o ledger novo.
5. Validar ledger4, ACL, login, administração, contratos/permissões, dados,
   arquivos, backup e identidade. Ativar ambas as flags somente com o aceite
   previsto na autorização futura; testar convite sintético criado pela UI,
   janela anônima, cópia, interesse, cancelamento e expiração, sem e-mail.
6. Falha: desligar recurso e usar fallback compatível com produtivo4. Manter
   schema, chave, convites e auditoria. O b2a9a239 atual não é retorno integral
   seguro depois da adição. Não apagar tabela/coluna/ledger. Restore integral
   exige suspender escritas e considerar perdas posteriores ao snapshot.

Prontidão técnica do candidato e autorização de publicação são decisões
distintas. Nenhum deploy, migration, configuração ou segredo em ambiente real
faz parte desta preparação.
