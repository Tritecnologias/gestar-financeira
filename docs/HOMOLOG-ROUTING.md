# Roteamento da homologacao 10S

Este checkpoint versiona somente a infraestrutura de roteamento validada em 23/10/2026. Ele nao altera a aplicacao, o banco nem a branch `master`.

## Topologia

- PROD: `dezsolucoes.com.br` e `www.dezsolucoes.com.br` entram em `gestar_nginx` nas portas 80/443 e seguem para `gestar_app:3000` na rede `gestar-financeira_default`.
- HOMOLOG: `homolog.dezsolucoes.com.br` entra no mesmo Nginx, em blocos `server_name` exclusivos, e segue para `gestar-homolog-app:3000` na rede Docker externa `coolify`. O alias e configurado no recurso da aplicacao HOMOLOG no Coolify e deve continuar presente em cada redeploy.
- O Nginx usa o DNS interno Docker `127.0.0.11` com resolucao dinamica para acompanhar o rolling update da HOMOLOG sem depender de IP de container.
- O hostname temporario antigo `sslip.io` da HOMOLOG e rejeitado por uma regra especifica para impedir fallback para PROD.
- O certificado `homolog.dezsolucoes.com.br` e separado do certificado de producao. Sua renovacao usa `/usr/local/sbin/gestar-homolog-cert-reload` na VPS, fora do Git.

## Persistencia e atualizacoes

O servico `nginx` em `docker-compose.yml` participa das redes `default` e `coolify`. A conexao do container atual a `coolify` foi feita sem reinicio; o Compose preserva essa ligacao quando o container for recriado. As configuracoes de FQDN e URLs da HOMOLOG permanecem no Coolify.

Antes de atualizar a infraestrutura da VPS, preservar a declaracao de rede e os blocos exclusivos em `nginx/nginx.conf`. Validar com `docker compose config -q` e `docker exec gestar_nginx nginx -t` antes de recarregar o Nginx. Depois, verificar `/login` e `/api/auth/providers` em PROD e HOMOLOG, observando que cada callback aponta para o proprio hostname.

## Rollback

O backup privado e o procedimento exato estao em `/root/homolog-route-backups/20261023T184607Z/ROLLBACK.txt` na VPS. O rollback seguro deixa a HOMOLOG indisponivel com HTTP 503, sem encaminhar o hostname para a producao. Nao restaurar o Nginx antigo isoladamente: hostnames desconhecidos voltariam a cair em PROD.

Nenhum segredo, certificado privado, arquivo de ambiente, dump ou backup pertence a esta branch.
