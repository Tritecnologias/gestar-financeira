/**
 * Script para gerar os hashes bcrypt e imprimir o seed.sql atualizado
 * Executar: node scripts/generate-seed-hashes.js
 */
const bcrypt = require("bcryptjs");

async function main() {
  const senhas = [
    { label: "Ricardo (admin123)", hash: await bcrypt.hash("admin123", 12) },
    { label: "João Silva (demo123)", hash: await bcrypt.hash("demo123", 12) },
    { label: "Ana Tech (tech123)", hash: await bcrypt.hash("tech123", 12) },
  ];
  senhas.forEach(({ label, hash }) => console.log(`-- ${label}\n'${hash}'`));
}

main();
