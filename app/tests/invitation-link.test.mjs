import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInvitationLink,parseFirstAccessLink,invitationWhatsAppUrl} from '../src/lib/invitation-link.ts';
const origin='https://homolog.dezsolucoes.com.br',secret='a'.repeat(43),link=origin+'/ativar-acesso#token='+secret;
test('convite permanece no fragmento e no mesmo origin',()=>{
 assert.equal(parseInvitationLink(link,origin),link);
 assert.equal(parseInvitationLink('/ativar-acesso#token='+secret,origin),link);
 assert.equal(parseInvitationLink('  '+link+'  ',origin),link);
 assert.equal(new URL(link).search,'');
});
test('recusa redirecionamento, query, credenciais e destinos externos',()=>{
 for(const invalid of ['https://evil.invalid/ativar-acesso#token='+secret,'//evil.invalid/ativar-acesso#token='+secret,
  'javascript:alert(1)','data:text/html,bad',origin+'/login#token='+secret,origin+'/ativar-acesso?token='+secret,
  origin+'/ativar-acesso?callbackUrl=https://evil.invalid#token='+secret,'https://pessoa@homolog.dezsolucoes.com.br/ativar-acesso#token='+secret,
  link+'&token='+secret,link+'&redirect=evil','https://homolog.dezsolucoes.com.br.evil.invalid/ativar-acesso#token='+secret,
  origin+'/ativar-acesso#token=short',origin+'/ativar-acesso#token='+secret+'X','x'.repeat(2049)])
  assert.equal(parseInvitationLink(invalid,origin),null,'rejected unsafe invitation');
});
test('WhatsApp exige ação humana; mensagem codificada e sem telefone',()=>{
 const url=new URL(invitationWhatsAppUrl({name:'Nome & Sintético',tenantName:'MODO DEV / +',link},origin));
 assert.equal(url.origin,'https://wa.me');assert.equal(url.searchParams.has('phone'),false);
 const text=url.searchParams.get('text');assert(text.includes('Nome & Sintético'));assert(text.includes('MODO DEV / +'));assert(text.includes(link));assert(text.includes('uso único'));
 assert.equal(invitationWhatsAppUrl({name:'Test',tenantName:'Test',link:'https://evil.invalid'},origin),null);
});

test('Primeiro Acesso only routes each link to its own server-validated journey',()=>{
 const special=origin+'/experimentacao#convite='+secret;
 const admission=origin+'/adesao#id=11111111-1111-4111-8111-111111111111&challenge=22222222-2222-4222-8222-222222222222&token='+secret;
 for(const valid of [link,special,admission])assert.equal(parseFirstAccessLink(valid,origin),valid);
 for(const other of [special,admission]){assert.equal(parseInvitationLink(other,origin),null);assert.equal(invitationWhatsAppUrl({name:'QA',tenantName:'QA',link:other},origin),null);}
 for(const value of [special+'&convite='+secret,special+'&token='+secret,special.replace('#','?'),admission+'&id=11111111-1111-4111-8111-111111111111',admission.replace('challenge=','other='),admission.replace('id=111','id=bad111'),admission.replace('/adesao','/ativar-acesso'),admission.replace(origin,'https://evil.invalid'),special.replace(origin,'https://homolog.dezsolucoes.com.br@evil.invalid'),admission.replace('#','?next=x#'),origin+'/adesao#id=11111111-1111-4111-8111-111111111111',origin+'/login','javascript:alert(1)'])assert.equal(parseFirstAccessLink(value,origin),null);
});
