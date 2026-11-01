import test from 'node:test';
import assert from 'node:assert/strict';
import {passwordResetPolicy,resetRecipientAllowed,supportWhatsAppUrl} from '../src/lib/password-reset-policy.ts';
import {admissionOrigin} from '../src/lib/admission-policy.ts';
const secret='synthetic-only-key-'.repeat(3);
const local={PASSWORD_RESET_ENABLED:'true',TRANSACTIONAL_EMAIL_READY:'true',EMAIL_PROVIDER:'smtp',ACCESS_AUTH_MODE:'identity',
  DEPLOYMENT_PROFILE:'local',AUTH_SECRET:secret,APP_PUBLIC_URL:'http://localhost:3020',NEXTAUTH_URL:'http://localhost:3020',
  DATABASE_URL:'postgresql://a2_runtime@127.0.0.1:5432/special_invite_lab',SMTP_HOST:'localhost'};
const homolog={...local,DEPLOYMENT_PROFILE:'homolog',APP_PUBLIC_URL:'https://homolog.dezsolucoes.com.br',NEXTAUTH_URL:'https://homolog.dezsolucoes.com.br',
  DATABASE_URL:'postgresql://pg18_homolog_runtime@0f5rvkjqjdt9fez1ajiascyk:5432/gestar_homolog_pg18',PASSWORD_RESET_TEST_RECIPIENTS:'controlled@example.invalid'};
const prod={...local,DEPLOYMENT_PROFILE:'production',APP_PUBLIC_URL:'https://app.dezsolucoes.com.br',NEXTAUTH_URL:'https://app.dezsolucoes.com.br',
  DATABASE_URL:'postgresql://pg18_prod_runtime@ik7d1n0035vis9y5rprjpgmn:5432/gestar_prod_pg18'};
test('same policy supports local, homolog and production with independent targets',()=>{
  for(const env of [local,homolog,prod])assert.equal(passwordResetPolicy(env)?.profile,env.DEPLOYMENT_PROFILE);
  assert(resetRecipientAllowed('synthetic@example.invalid',passwordResetPolicy(local)));
  assert(!resetRecipientAllowed('person@example.com',passwordResetPolicy(local)));
  assert(resetRecipientAllowed('controlled@example.invalid',passwordResetPolicy(homolog)));
  assert(!resetRecipientAllowed('other@example.invalid',passwordResetPolicy(homolog)));
  assert(resetRecipientAllowed('person@example.com',passwordResetPolicy(prod)));
});
test('disabled by default, mock, missing readiness and target confusion fail closed',()=>{
  assert.equal(passwordResetPolicy({}),null);
  for(const change of [{PASSWORD_RESET_ENABLED:'false'},{TRANSACTIONAL_EMAIL_READY:'false'},{EMAIL_PROVIDER:'mock'},{TRANSACTIONAL_EMAIL_PROVIDER:'mock'},
    {AUTH_SECRET:'short'},{ACCESS_AUTH_MODE:'legacy'},{DEPLOYMENT_PROFILE:'preview'},{SMTP_HOST:'smtp.external.invalid'},
    {NEXTAUTH_URL:'https://untrusted.invalid'},{APP_PUBLIC_URL:'http://localhost:3020/other'},{DATABASE_URL:prod.DATABASE_URL},
    {DATABASE_URL:'postgresql://postgres@127.0.0.1:5432/special_invite_lab'}])assert.equal(passwordResetPolicy({...local,...change}),null);
  assert.equal(passwordResetPolicy({...homolog,PASSWORD_RESET_TEST_RECIPIENTS:''}),null);
  assert.equal(passwordResetPolicy({...prod,DATABASE_URL:homolog.DATABASE_URL}),null);
  assert.equal(passwordResetPolicy({...homolog,PASSWORD_RESET_TEST_RECIPIENTS:'*'}),null);
});

test('transactional SMTP coexists with approved synthetic Admission in LOCAL and HOMOLOG',()=>{
  const shared={EMAIL_PROVIDER:'mock',TRANSACTIONAL_EMAIL_PROVIDER:'smtp',ADMISSION_SESSION_KEY:'a'.repeat(64),ADMISSION_LAB_MAIL_KEY:'b'.repeat(64)};
  const cases=[{...local,...shared,ADMISSION_LAB_ENABLED:'true',ADMISSION_LAB_MAIL_DIR:'/tmp/a2-mail'},
    {...homolog,...shared,DATABASE_URL:homolog.DATABASE_URL.replace('@',':synthetic-only@'),ADMISSION_HOMOLOG_ENABLED:'true',ADMISSION_LAB_MAIL_DIR:'/var/lib/10s/backups/admission-mail'}];
  for(const env of cases){assert(passwordResetPolicy(env));assert.equal(admissionOrigin(env),env.APP_PUBLIC_URL);}
});
test('unpublished WhatsApp never discloses even a configured number; URL is constrained',()=>{
  const env={SUPPORT_WHATSAPP_NUMBER:'5511999999999'};
  assert.equal(supportWhatsAppUrl(env),null);
  assert.equal(supportWhatsAppUrl({...env,SUPPORT_WHATSAPP_ENABLED:'true'}),'https://wa.me/5511999999999');
  for(const value of ['javascript:bad','+55 11 99999-9999','5511999999999?text=secret',''])assert.equal(supportWhatsAppUrl({SUPPORT_WHATSAPP_ENABLED:'true',SUPPORT_WHATSAPP_NUMBER:value}),null);
});
