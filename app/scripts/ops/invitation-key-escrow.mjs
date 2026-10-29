import { createPublicKey, createPrivateKey, createHash, randomBytes, createCipheriv, createDecipheriv, publicEncrypt, privateDecrypt, constants } from 'node:crypto';

const format = 'dez-invitation-key-escrow/1';
const unavailable = () => new Error('Custódia indisponível ou material de recuperação inválido.');
function ring(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !/^[A-Za-z0-9_-]{1,32}$/.test(value.activeId || '') ||
      !value.keys || typeof value.keys !== 'object' || Array.isArray(value.keys) || !Object.hasOwn(value.keys, value.activeId) ||
      Object.keys(value.keys).length > 32 || Object.entries(value.keys).some(([id, key]) => !/^[A-Za-z0-9_-]{1,32}$/.test(id) || typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key))) throw unavailable();
  return { activeId: value.activeId, keys: { ...value.keys } };
}
function recipient(key) {
  if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength || 0) < 3072) throw unavailable();
  return createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}
/** Only the public recovery key is needed to seal. Private recovery material stays in the operator's vault. */
export function sealInvitationKeyring(value, recoveryPublicKey) {
  let dek;
  try {
    const clean = ring(value), key = createPublicKey(recoveryPublicKey), fingerprint = recipient(key);
    dek = randomBytes(32); const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', dek, iv);
    cipher.setAAD(Buffer.from(`${format}|${fingerprint}`));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(clean), 'utf8'), cipher.final()]);
    const wrapped = publicEncrypt({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, dek);
    return { format, wrapping: 'RSA-OAEP-SHA256', recipientSha256: fingerprint, wrappedKey: wrapped.toString('base64url'), iv: iv.toString('base64url'), ciphertext: ciphertext.toString('base64url'), tag: cipher.getAuthTag().toString('base64url') };
  } catch { throw unavailable(); }
  finally { dek?.fill(0); }
}
/** Run only in an approved recovery context. Never print the returned keyring or pass keys as CLI arguments. */
export function recoverInvitationKeyring(envelope, recoveryPrivateKey) {
  let dek;
  try {
    if (!envelope || JSON.stringify(envelope).length > 16384 || envelope.format !== format || envelope.wrapping !== 'RSA-OAEP-SHA256') throw unavailable();
    const privateKey = createPrivateKey(recoveryPrivateKey), publicKey = createPublicKey(privateKey), fingerprint = recipient(publicKey);
    if (fingerprint !== envelope.recipientSha256) throw unavailable();
    const decode = name => {
      if (typeof envelope[name] !== 'string' || !/^[A-Za-z0-9_-]+$/.test(envelope[name])) throw unavailable();
      return Buffer.from(envelope[name], 'base64url');
    };
    const iv = decode('iv'), tag = decode('tag'), ciphertext = decode('ciphertext'), wrapped = decode('wrappedKey');
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length > 8192 || wrapped.length !== publicKey.asymmetricKeyDetails.modulusLength / 8) throw unavailable();
    dek = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, wrapped);
    if (dek.length !== 32) throw unavailable();
    const decipher = createDecipheriv('aes-256-gcm', dek, iv); decipher.setAAD(Buffer.from(`${format}|${fingerprint}`)); decipher.setAuthTag(tag);
    return ring(JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')));
  } catch { throw unavailable(); }
  finally { dek?.fill(0); }
}
