import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveTermPdf, readTermPdf, discardTermPdf, termPdfHash, MAX_TERM_PDF_BYTES } from '../src/lib/term-storage.ts';

test('private storage enforces config, size, MIME, header, hash and path boundaries', async () => {
  const folder=await mkdtemp(join(tmpdir(),'10s-phase6-storage-'));
  const previous={dir:process.env.TERM_STORAGE_DIR,mode:process.env.NODE_ENV};
  const bytes=Buffer.from('%PDF-1.4\nsynthetic unit fixture\n%%EOF');
  const file=()=>new File([bytes],'../../untrusted.pdf',{type:'application/pdf'});
  try {
    process.env.NODE_ENV='production';delete process.env.TERM_STORAGE_DIR;
    await assert.rejects(saveTermPdf(file()),/volume privado/);
    process.env.TERM_STORAGE_DIR='relative';await assert.rejects(saveTermPdf(file()),/absoluto/);
    process.env.TERM_STORAGE_DIR=join(process.cwd(),'public','terms');await assert.rejects(saveTermPdf(file()),/público/);
    process.env.TERM_STORAGE_DIR=folder;
    await assert.rejects(saveTermPdf(new File([bytes],'x',{type:'text/plain'})),/PDF de até/);
    await assert.rejects(saveTermPdf(new File(['invalid'],'x',{type:'application/pdf'})),/PDF válido/);
    await assert.rejects(saveTermPdf(new File([Buffer.alloc(MAX_TERM_PDF_BYTES+1)],'x',{type:'application/pdf'})),/PDF de até/);
    const saved=await saveTermPdf(file());assert.match(saved.storageKey,/^[0-9a-f-]{36}\.pdf$/);
    assert.equal(saved.sha256,termPdfHash(bytes));assert.deepEqual(await readTermPdf(saved.storageKey,saved.sha256),bytes);
    if(process.platform!=='win32')assert.equal((await stat(join(folder,saved.storageKey))).mode&0o777,0o600);
    for(const key of ['../private.pdf','/etc/passwd','..\\private.pdf','%2e%2e%2fprivate.pdf'])await assert.rejects(readTermPdf(key,saved.sha256),/inválida/);
    await writeFile(join(folder,saved.storageKey),'tampered');await assert.rejects(readTermPdf(saved.storageKey,saved.sha256),/Integridade/);
    await discardTermPdf(saved.storageKey);await assert.rejects(stat(join(folder,saved.storageKey)),{code:'ENOENT'});
  }finally{
    previous.dir===undefined?delete process.env.TERM_STORAGE_DIR:process.env.TERM_STORAGE_DIR=previous.dir;
    previous.mode===undefined?delete process.env.NODE_ENV:process.env.NODE_ENV=previous.mode;
    await rm(folder,{recursive:true,force:true});
  }
});
