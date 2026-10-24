import test from 'node:test';
import assert from 'node:assert/strict';
import { adminNavigation } from '../src/lib/admin-navigation.ts';
const all=['acessos.usuarios.view','acessos.perfis.view','acessos.auditoria.view','sistema.configuracoes.view','sistema.backup.view'];
const base={authMode:'identity',hasMembership:true,membershipRole:'OWNER',permissions:all};
test('PlatformAdmin sem membership: global apenas, mesmo com permissões residuais',()=>{
 const n=adminNavigation({...base,platformAdmin:true,hasMembership:false});assert.equal(n.platform,true);assert.deepEqual(n.items,[]);
});
test('OWNER não recebe PlatformAdmin implícito e só vê permissões atuais',()=>{
 assert.equal(adminNavigation(base).platform,false);assert.equal(adminNavigation(base).items.length,5);
 assert.deepEqual(adminNavigation({...base,permissions:['sistema.backup.view']}).items.map(i=>i.href),['/backups']);
});
test('ADMIN limitado segue perfil; MEMBER não recebe rotas reservadas a admin',()=>{
 assert.deepEqual(adminNavigation({...base,membershipRole:'ADMIN',permissions:['acessos.usuarios.view']}).items.map(i=>i.href),['/acessos']);
 assert.deepEqual(adminNavigation({...base,membershipRole:'MEMBER',permissions:all}).items.map(i=>i.href),['/configuracoes','/backups']);
});
test('CONSULTA não vê grupos administrativos',()=>{
 const n=adminNavigation({...base,membershipRole:'MEMBER',permissions:['fluxo.lancamentos.view']});assert.equal(n.platform,false);assert.deepEqual(n.items,[]);
});
test('troca de membership não herda permissões da empresa anterior',()=>{
 assert.equal(adminNavigation({...base,platformAdmin:true}).items.length,5);
 const other=adminNavigation({...base,platformAdmin:true,membershipRole:'MEMBER',permissions:[]});assert.equal(other.platform,true);assert.deepEqual(other.items,[]);
});
test('suporte sem membership não recebe administração empresarial nem backup',()=>{
 assert.deepEqual(adminNavigation({...base,hasMembership:false,platformAdmin:true}).items,[]);
});
test('sem modo ou contexto confiável não aparece administração',()=>{
 assert.deepEqual(adminNavigation({permissions:all,platformAdmin:true}),{platform:false,items:[]});
});
test('compatibilidade legada não cria concessão PlatformAdmin nem backup identity',()=>{
 const n=adminNavigation({...base,authMode:'legacy',legacyRole:'admin_global',platformAdmin:true});assert.equal(n.platform,false);assert.equal(n.items.length,4);assert.ok(!n.items.some(i=>i.href==='/backups'));
});
