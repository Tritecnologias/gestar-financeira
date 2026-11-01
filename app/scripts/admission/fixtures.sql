-- Synthetic fixtures only. Addresses use the reserved example.invalid domain.
INSERT INTO auth_identities(id,email,nome,senha_hash) VALUES
 ('admin-i','admin@example.invalid','ADMIN SINTÉTICO','unused-synthetic-verifier'),
 ('owner-i','owner@example.invalid','OWNER SINTÉTICO','unused-synthetic-verifier'),
 ('other-i','other@example.invalid','OUTRO SINTÉTICO','unused-synthetic-verifier'),
 ('disabled-i','disabled@example.invalid','ADMIN INATIVO SINTÉTICO','unused-synthetic-verifier');
INSERT INTO platform_admins(id,identity_id,status) VALUES ('admin-a','admin-i','ACTIVE'),('disabled-a','disabled-i','INACTIVE');
INSERT INTO tenants(id,nome,slug,email,modalidade,escolha_modalidade_pendente) VALUES
 ('tenant-a','ESPAÇO SINTÉTICO A','a2-synthetic-a','owner@example.invalid','PJ',false),
 ('tenant-b','ESPAÇO SINTÉTICO B','a2-synthetic-b','owner@example.invalid','PF',false);
INSERT INTO access_profiles(id,tenant_id,nome) VALUES ('profile-a','tenant-a','ADMINISTRAÇÃO'),('profile-b','tenant-b','ADMINISTRAÇÃO');
INSERT INTO tenant_memberships(id,identity_id,tenant_id,role,profile_id) VALUES
 ('member-a','owner-i','tenant-a','OWNER','profile-a'),('member-b','owner-i','tenant-b','OWNER','profile-b');
INSERT INTO usuarios(id,tenant_id,nome,email,senha_hash,papel) VALUES
 ('user-a','tenant-a','SINTÉTICO A','owner@example.invalid','unused-synthetic-verifier','admin'),
 ('user-b','tenant-b','SINTÉTICO B','owner@example.invalid','unused-synthetic-verifier','admin');
INSERT INTO legacy_user_access_maps(id,legacy_usuario_id,identity_id,tenant_id,membership_id) VALUES
 ('map-a','user-a','owner-i','tenant-a','member-a'),('map-b','user-b','owner-i','tenant-b','member-b');
INSERT INTO tenant_contractual_responsibles(tenant_id,membership_id,assigned_by_identity_id) VALUES ('tenant-a','member-a','owner-i');
INSERT INTO term_documents(id,code,audience) VALUES ('doc-u','TERM_USUARIO','USUARIO'),('doc-c','TERM_CONTRATANTE','CONTRATANTE');
INSERT INTO term_versions(id,document_id,version,title,storage_key,mime_type,byte_size,sha256,status,published_at,published_by_identity_id) VALUES
 ('version-u','doc-u','synthetic-1','USUÁRIO SINTÉTICO','synthetic/user.pdf','application/pdf',1,repeat('1',64),'PUBLISHED',now(),'admin-i'),
 ('version-c','doc-c','synthetic-1','CONTRATO SINTÉTICO','synthetic/contract.pdf','application/pdf',1,repeat('2',64),'PUBLISHED',now(),'admin-i');
INSERT INTO term_acceptances(id,identity_id,term_version_id,tenant_id,membership_id,scope_key,role_at_acceptance,document_hash) VALUES
 ('accept-u','owner-i','version-u',NULL,NULL,'GLOBAL',NULL,repeat('1',64)),
 ('accept-c','owner-i','version-c','tenant-a','member-a','tenant-a','OWNER',repeat('2',64));
INSERT INTO audit_events(id,actor_identity_id,access_mode,action,resource_type,result) VALUES
 ('audit-before','admin-i','PLATFORM_ADMIN','SYNTHETIC_BASELINE','Fixture','SUCCESS');
INSERT INTO experiment_invitations(id,recipient_name,token_hash,created_by_identity_id,created_at,expires_at,interest_at)
 SELECT 'special-'||n,'CONVIDADO SINTÉTICO '||n,repeat(md5(n::text),2),'admin-i',now()-interval '10 minutes',
 now()+interval '2 hours',CASE WHEN n=19 THEN NULL ELSE now()-interval '5 minutes' END FROM generate_series(1,30) n;
UPDATE experiment_invitations SET revoked_at=now() WHERE id='special-20';
UPDATE experiment_invitations SET expires_at=now()-interval '1 minute' WHERE id='special-21';
