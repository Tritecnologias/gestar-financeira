import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {admissionOrigin,admissionEmail,retryableAdmissionTransaction} from '../src/lib/admission-policy.ts';
import {admissionHash,newAdmissionToken,matchesAdmissionToken,sealAdmissionProof,openAdmissionProof,sealAdmissionValue,openAdmissionValue} from '../src/lib/admission-crypto.ts';

const config={ADMISSION_LAB_ENABLED:'true',DEPLOYMENT_PROFILE:'local',EMAIL_PROVIDER:'mock',APP_PUBLIC_URL:'http://localhost:3020',NEXTAUTH_URL:'http://localhost:3020',
  DATABASE_URL:'postgresql://a2_runtime@127.0.0.1:5432/special_invite_lab',ADMISSION_SESSION_KEY:'a'.repeat(64),ADMISSION_LAB_MAIL_KEY:'b'.repeat(64),ADMISSION_LAB_MAIL_DIR:'/tmp/a2-mail'};
test('Prisma 7 raw adapter serialization failures restart the whole transaction; other failures do not',()=>{
  for(const code of ['40001','40P01']) assert(retryableAdmissionTransaction({code:'P2010',meta:{driverAdapterError:{cause:{originalCode:code}}}}));
  for(const code of ['P2034','P2002'])assert(retryableAdmissionTransaction({code}));
  for(const error of [null,{},new Error('40001'),{code:'P2010',meta:{driverAdapterError:{cause:{originalCode:'42501'}}}}])assert(!retryableAdmissionTransaction(error));
});
test('admission is fail-closed outside the complete isolated LOCAL policy',()=>{
  assert.equal(admissionOrigin(config),config.APP_PUBLIC_URL);
  for(const [key,value] of Object.entries({ADMISSION_LAB_ENABLED:'false',DEPLOYMENT_PROFILE:'production',EMAIL_PROVIDER:'smtp',APP_PUBLIC_URL:'https://app.dezsolucoes.com.br',
    NEXTAUTH_URL:'http://evil.invalid',DATABASE_URL:'postgresql://a2_runtime@remote.invalid:5432/special_invite_lab',ADMISSION_SESSION_KEY:'',ADMISSION_LAB_MAIL_KEY:'',
    ADMISSION_LAB_MAIL_DIR:'/tmp/other',ACCESS_AUTH_MODE:'legacy'})) assert.equal(admissionOrigin({...config,[key]:value}),null,key);
  for(const db of ['postgresql://a2_migrator@127.0.0.1:5432/special_invite_lab','postgresql://a2_runtime@127.0.0.1:5432/gestar_prod_pg18','postgresql://a2_runtime@127.0.0.1:5432/special_invite_lab?schema=private'])
    assert.equal(admissionOrigin({...config,DATABASE_URL:db}),null);
});
test('synthetic recipient policy normalizes but never accepts real email or injected addresses',()=>{
  assert.equal(admissionEmail('  QA+one@EXAMPLE.INVALID '),'qa+one@example.invalid');
  for(const value of ['a@example.com','a@evil.invalid','a@example.invalid\r\nBcc:b@example.invalid','a@example.invalid, b@example.invalid',{},null])assert.throws(()=>admissionEmail(value));
});
test('random 256-bit opaque challenges are checked by hash and timing-safe comparison',()=>{
  const one=newAdmissionToken(),two=newAdmissionToken();assert.notEqual(one,two);assert.equal(Buffer.from(one,'base64url').length,32);
  const hash=admissionHash(one);assert.equal(hash.length,64);assert(!hash.includes(one));assert(matchesAdmissionToken(one,hash));
  for(const invalid of [two,'',one+'x',null,42,{}])assert.equal(matchesAdmissionToken(invalid,hash),false);
});
test('restricted proof binds grant, expiry, encryption key and authenticated envelope',()=>{
  const key=randomBytes(32).toString('hex'),id=randomUUID(),instant=Date.now();
  const proof={admissionId:id,verificationId:randomUUID(),accessId:randomUUID(),until:instant+1000};
  const value=sealAdmissionProof(proof,key);assert(!value.includes(id));assert.deepEqual(openAdmissionProof(value,key,id,instant),proof);
  assert.equal(openAdmissionProof(value,key,randomUUID(),instant),null);assert.equal(openAdmissionProof(value,key,id,instant+1000),null);
  assert.equal(openAdmissionProof(value,randomBytes(32).toString('hex'),id,instant),null);
  const bytes=Buffer.from(value,'base64url');bytes[30]^=1;assert.equal(openAdmissionProof(bytes.toString('base64url'),key,id,instant),null);
});
test('synthetic mail ciphertext cannot be used as a browser proof and contains no plaintext secret',()=>{
  const key=randomBytes(32).toString('hex'),token=newAdmissionToken(),mail={to:'qa@example.invalid',text:token};
  const value=sealAdmissionValue(mail,key,'dez/admission/synthetic-mail/v1');assert(!value.includes(token));assert(!value.includes(mail.to));
  assert.deepEqual(openAdmissionValue(value,key,'dez/admission/synthetic-mail/v1'),mail);
  assert.equal(openAdmissionValue(value,key,'dez/admission/restricted-session/v1'),null);
});
