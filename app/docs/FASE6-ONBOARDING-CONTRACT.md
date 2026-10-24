# Fase 6 — onboarding, termos e storage

Escopo exclusivo de HOMOLOG. Produção permanece NO-GO até a conclusão das etapas operacionais e do aceite manual. SMTP, PDFs e credenciais não fazem parte do artefato Git.

## Contratos preservados

- Convite pendente não cria identidade nem acesso. O destinatário ativa sua identidade e define a senha; uma identidade existente precisa autenticar-se para aceitar outro vínculo.
- Papel, perfil e tenant vêm do convite persistido. PlatformAdmin não é concedido pela ativação. O mapping legado serve apenas à compatibilidade do membership explicitamente autorizado.
- Tokens aleatórios de 256 bits permanecem apenas no e-mail; banco armazena SHA-256. Reenvio revoga o anterior. Consumo e criação de acesso são atômicos. Expiração independe de scheduler.
- Falha SMTP preserva convite pendente com resultado de entrega FAILED. Mock e link bruto continuam restritos ao DEV local explicitamente identificado; HOMOLOG e PROD não simulam envio silenciosamente.
- Emissão/reenvio limita três convites por tenant/e-mail em 15 minutos sob lock. Login possui limite por origem confiável, em memória; não é proteção distribuída. Tokens públicos não devem ser considerados senhas curtas sujeitas a enumeração.
- Responsável contratual é designado explicitamente, exige OWNER ativo do tenant e não decorre da primeira posição na lista.
- Termos de usuário são aceitos pela identidade; termos de contratante pelo responsável designado. Histórico é preservado. SupportGrant não contorna termos nem cria membership permanente.

## Auditoria e diagnóstico

Ativação de OWNER registra a execução SYSTEM do convite previamente autorizado, com referência ao convite e ao seu iniciador. Não inventa uma origem MEMBERSHIP para um PlatformAdmin sem vínculo empresarial.

Rotas de convite, publicação, aceite e responsável contratual recebem UUID de correlação gerado no servidor, retornado em X-Request-Id e associado a AuditEvent. Logs contêm apenas identificador, fluxo, tenant quando conhecido, status e resultado. Não contêm corpo, URL de ativação, e-mail, token, senha, hash ou exceção bruta.

## Storage

TERM_STORAGE_DIR deve ser absoluto, privado e persistente, fora de public/.next. Runtime UID 1001; diretório 0700, PDFs 0600. PDF limitado a 10 MiB, nome interno UUID, hash verificado na leitura. Acesso ocorre por rota autenticada com private/no-store e nosniff.

Backup operacional exige par coerente banco + storage, manifesto de hashes, pg_restore em banco isolado e leitura dos PDFs restaurados. Nunca restaurar sobre HOMOLOG ativa para realizar o teste. Preservar versões antigas necessárias aos aceites.

## Laboratório

`scripts/phase6/onboarding-lab.cjs` exige PHASE6_LAB=1 e banco vazio phase6_lab no host Docker 10s-phase6-pg. Não é um script de provisionamento remoto. O sink TLS `smtp-lab.cjs` aceita apenas example.invalid, não tem relay e mantém mensagens apenas em memória. Certificado e PDFs sintéticos são fornecidos por mounts privados fora do Git.

Os testes cobrem convites, perfis/papéis, rejeições entre tenants, concorrência, expiração, reenvio, falha SMTP, termos/reaceite, responsável e SupportGrant. O relatório operacional privado registra SHA, evidências remotas, backup/restore e aceite manual; testes locais não substituem homologação real do remetente.
