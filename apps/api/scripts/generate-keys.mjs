// Prints a fresh Ed25519 key pair for signing access tokens, ready to paste into .env.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const b64 = (pem) => Buffer.from(pem).toString('base64');
console.log(`JWT_PRIVATE_KEY=${b64(privateKey.export({ type: 'pkcs8', format: 'pem' }))}`);
console.log(`JWT_PUBLIC_KEY=${b64(publicKey.export({ type: 'spki', format: 'pem' }))}`);
