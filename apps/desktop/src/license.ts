import { serializeSignedLicensePayload, type SignedLicenseFile } from '@contractflow/shared';

const configuredPublicKey = import.meta.env.VITE_LICENSE_PUBLIC_KEY?.trim();

function pemToBinary(pem: string) {
  const content = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '');
  const decoded = atob(content);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes.buffer;
}

function toBytes(input: string) {
  return new TextEncoder().encode(input);
}

export async function verifySignedLicense(license: SignedLicenseFile) {
  if (!configuredPublicKey) {
    throw new Error('VITE_LICENSE_PUBLIC_KEY nao configurada para validar licenca assinada.');
  }

  if (license.alg !== 'Ed25519') {
    throw new Error('Algoritmo de assinatura nao suportado.');
  }

  const publicKey = await crypto.subtle.importKey(
    'spki',
    pemToBinary(configuredPublicKey),
    { name: 'Ed25519' },
    false,
    ['verify']
  );

  const payloadSerialized = serializeSignedLicensePayload(license.payload);
  const signatureBytes = Uint8Array.from(atob(license.signature), (char) => char.charCodeAt(0));
  const valid = await crypto.subtle.verify(
    { name: 'Ed25519' },
    publicKey,
    signatureBytes,
    toBytes(payloadSerialized)
  );

  if (!valid) {
    throw new Error('Assinatura de licenca invalida.');
  }

  return true;
}

export function getLicenseStatusLabel(license: SignedLicenseFile, machineId: string, now = new Date()) {
  const licenseExpiry = new Date(license.payload.expiresAt);
  const deltaDays = Math.ceil((licenseExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (license.payload.machineId && license.payload.machineId !== machineId) {
    return 'Licenca pertence a outra maquina.';
  }

  if (deltaDays >= 0) {
    return `Licenca valida por mais ${deltaDays} dia(s).`;
  }

  const graceUsed = Math.abs(deltaDays);
  const graceLeft = license.payload.graceDays - graceUsed;
  if (graceLeft >= 0) {
    return `Licenca expirada. Periodo de graca restante: ${graceLeft} dia(s).`;
  }

  return 'Licenca expirada e fora do periodo de graca.';
}
