import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { serializeSignedLicensePayload, type SignedLicenseFile, type SignedLicensePayload } from '@contractflow/shared';

const args = process.argv.slice(2);
const command = args[0];

const issueSchema = z.object({
  privateKey: z.string().min(1),
  output: z.string().min(1),
  customer: z.string().min(2),
  plan: z.string().min(2),
  expiresAt: z.iso.datetime(),
  graceDays: z.coerce.number().int().min(0).default(30),
  machineId: z.string().optional(),
  features: z.string().optional()
});

function parseFlags(argv: string[]) {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      result[key] = 'true';
      continue;
    }

    result[key] = next;
    i += 1;
  }
  return result;
}

function usage() {
  console.log('ContractFlow License Issuer');
  console.log('');
  console.log('Comandos:');
  console.log('  generate-keys --outDir <path>');
  console.log('  issue --privateKey <pem> --output <file.lic> --customer <name> --plan <name> --expiresAt <iso> [--graceDays 30] [--machineId <id>] [--features f1,f2]');
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readText(filePath: string) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath: string, content: string) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function createKidFromPublicKey(publicKeyPem: string) {
  return crypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 12);
}

function issueLicense(rawFlags: Record<string, string>) {
  const parsed = issueSchema.safeParse(rawFlags);
  if (!parsed.success) {
    console.error('Parametros invalidos:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  const flags = parsed.data;
  const privateKeyPem = readText(path.resolve(flags.privateKey));
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const publicKeyPem = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
  const payload: SignedLicensePayload = {
    licenseId: crypto.randomUUID(),
    customer: flags.customer,
    plan: flags.plan,
    issuedAt: new Date().toISOString(),
    expiresAt: flags.expiresAt,
    graceDays: flags.graceDays,
    machineId: flags.machineId ?? null,
    features: flags.features ? flags.features.split(',').map((item) => item.trim()).filter(Boolean) : []
  };

  const payloadSerialized = serializeSignedLicensePayload(payload);
  const signature = crypto.sign(null, Buffer.from(payloadSerialized, 'utf8'), privateKey).toString('base64');
  const license: SignedLicenseFile = {
    alg: 'Ed25519',
    kid: createKidFromPublicKey(publicKeyPem),
    payload,
    signature
  };

  const outputPath = path.resolve(flags.output);
  writeText(outputPath, `${JSON.stringify(license, null, 2)}\n`);
  console.log(`Licenca emitida em: ${outputPath}`);
  console.log(`kid: ${license.kid}`);
}

function generateKeys(rawFlags: Record<string, string>) {
  const outDir = path.resolve(rawFlags.outDir ?? 'apps/license-issuer/keys');
  ensureDir(outDir);

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  const privatePath = path.join(outDir, 'private_key.pem');
  const publicPath = path.join(outDir, 'public_key.pem');

  writeText(privatePath, privateKeyPem);
  writeText(publicPath, publicKeyPem);

  console.log(`Chaves geradas:`);
  console.log(`- Privada: ${privatePath}`);
  console.log(`- Publica: ${publicPath}`);
  console.log(`kid sugerido: ${createKidFromPublicKey(publicKeyPem)}`);
}

if (!command || command === '--help' || command === '-h') {
  usage();
  process.exit(0);
}

const flags = parseFlags(args.slice(1));

if (command === 'generate-keys') {
  generateKeys(flags);
} else if (command === 'issue') {
  issueLicense(flags);
} else {
  usage();
  process.exit(1);
}
