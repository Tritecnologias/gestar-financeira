# Fase 11C.2C — convite multicanal e primeiro acesso

O compartilhamento manual é um canal oficial de convite, independente de SMTP. As telas da Plataforma e de Acessos solicitam `MANUAL_SHARE`; o adapter de e-mail existente permanece disponível para chamadas `EMAIL`. E-mail explicitamente solicitado sem configuração válida falha fechado antes de emitir/reemitir. Chamadas anteriores preservam e-mail quando configurado.

## Contrato de segurança

- A resposta de criação/reemissão autorizada pode conter `share.link`, somente naquele momento, com headers privados/no-store e sem referrer. Não existe recuperação do segredo em GET/listagem/histórico.
- O link usa exclusivamente a origem pública configurada e `/ativar-acesso#token=...`. A exceção HTTP local permanece restrita ao DEV já reconhecido pelo sistema.
- O banco continua guardando apenas SHA-256 de 32 bytes aleatórios. Expiração, uso único, locks/concorrência, papel/perfil e identidade destinatária continuam derivados do convite persistido.
- Reemissão mantém o registro anterior, invalida o link antigo e cria outro convite/validade. Auditoria preserva ator/modo/tenant; `INVITE_REISSUED` referencia o ID anterior e `INVITE_MANUAL_LINK_ISSUED` registra somente `MANUAL_SHARE`, sem link/segredo.
- A divulgação exige origem correspondente e autorização atual. PlatformAdmin não recebe membership por emitir convite. ADMIN continua limitado a MEMBER; MEMBER não recebe capacidade de convite automaticamente.
- No navegador do criador, o link existe apenas em estado React, por até dez minutos, e é descartado ao fechar/sair/recarregar. Não é salvo em localStorage/sessionStorage, URL administrativa ou analytics.
- WhatsApp só é aberto após clique, por URL universal `wa.me` com mensagem codificada, sem telefone e sem envio automático. Copiar exibe orientação para enviar somente ao destinatário.
- Primeiro acesso não consulta e-mail nem revela cadastro/convites. Aceita apenas link de ativação da própria origem. A ativação existente limpa o fragmento, usa sessionStorage temporário para continuidade e envia o segredo somente no corpo; limpa após sucesso ou indisponibilidade definitiva.

## Preservação

Sem migration, alteração da baseline/ledger ou do backup empresarial v3. Nenhuma alteração nos PDFs, hashes, regras de aceite ou responsabilidades contratuais. O OWNER recém-ativado continua precisando da designação contratual explícita prevista no fluxo administrativo; ela não é inferida silenciosamente.

PROD, seus tenants persistentes, identidades, memberships e aceites não fazem parte dos testes desta rodada. O candidato só pode chegar à PROD após homologação e autorização separada. Não implementar OAuth2, recuperação de senha, WhatsApp Business API ou contratação de e-mail.

## Validação e operação

Testar primeiro em PostgreSQL18/HTTP reais LOCAL, com dados sintéticos, depois em HOMOLOG. Cobrir reemissão, revogação, expiração, replay, concorrência, destinatário existente, perfil/tenant indevido, origem indevida, ausência de segredo em armazenamento/logs/histórico, UI Claro/Escuro e desktop/mobile. Interceptar a abertura do WhatsApp nos testes automatizados, sem transmitir mensagem a terceiros.

O aceite humano na HOMOLOG inclui gerar OWNER sintético na Plataforma, compartilhar/copiar, usar Primeiro acesso, ativar a fixture, designar explicitamente o responsável contratual, ler/aceitar os termos sintéticos aplicáveis e gerar MEMBER no mesmo tenant como OWNER. Não gerar convites reais de Izilda/Gmail antes do GO PROD.
