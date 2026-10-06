ACCESS-5A adiciona documentos jurídicos, versões e aceites append-only, além de uma designação contratual explícita por tenant. Nenhum responsável ou documento é criado automaticamente para tenants históricos.

Os PDFs ficam fora do banco e da pasta pública. Configure TERM_STORAGE_DIR para um volume privado e persistente antes de publicar documentos em produção. No DEV, a aplicação usa app/.private/terms (ignorado pelo Git).

Rollback de aplicação pode deixar as tabelas inertes. Reversão física exige preservar previamente arquivos, metadados e evidências de aceite, então remover triggers, índices, tabelas e enums apenas mediante procedimento jurídico e operacional aprovado. Nunca apagar aceites históricos como rollback rotineiro.
