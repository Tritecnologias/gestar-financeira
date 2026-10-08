# ACCESS-2 no DEV local

Depois de aplicar a baseline e a migration ACCESS-2, executar na pasta `app`:

```powershell
node --env-file=.env.local --experimental-strip-types scripts/access2/dry-run.mjs
node --env-file=.env.local --experimental-strip-types scripts/access2/backfill.mjs
node --env-file=.env.local --experimental-strip-types scripts/access2/dry-run.mjs
```

Ambos os scripts conferem nome do banco e host local antes de ler ou gravar.
O dry-run é somente leitura e emite contagens, sem nomes, emails ou hashes.
O backfill reavalia o plano antes da escrita, cria apenas os casos `safe` numa
transação serializável e compara `Usuario` antes e depois. Uma segunda execução
deve criar zero registros. Email repetido nunca une contas automaticamente;
casos divergentes são `conflict` e casos idênticos entre tenants são
`manualReview`. `admin_global` requer revisão separada e não recebe
membership empresarial automática.

Estes scripts não são rotina de produção. O inventário e a decisão sobre
conflitos de produção pertencem à fase controlada anterior ao ACCESS-3.
Para reversão, consultar o README da migration ACCESS-2.
