/**
 * Inicia o servidor Express embutido no Electron
 * Encontra uma porta livre e retorna a URL
 */

const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

// Tenta encontrar porta livre (fallback simples)
async function findFreePort(startPort = 3000) {
  const net = require('node:net');

  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      resolve(findFreePort(startPort + 1));
    });
  });
}

async function startApiServer() {
  try {
    // Obtém a porta
    const port = await findFreePort(3000);

    const apiDir = path.join(__dirname, '..', 'api');
    const apiDistDir = path.join(apiDir, 'dist');

    // Verifica se o dist da API existe
    if (!fs.existsSync(apiDistDir)) {
      console.warn('⚠ Pasta api/dist não encontrada. Execute "npm run build" antes de compilar o desktop.');
      return null;
    }

    // Inicia o servidor da API em um subprocess
    const apiServer = spawn('node', ['dist/server.js'], {
      cwd: apiDir,
      detached: false,
      env: {
        ...process.env,
        API_PORT: String(port),
        NODE_ENV: 'production',
        CORS_ORIGIN: 'null'
      },
      stdio: 'pipe' // Captura output para log
    });

    let isStarted = false;

    // Monitora o output do servidor
    apiServer.stdout?.on('data', (data) => {
      const message = data.toString();
      console.log(`[API] ${message}`);
      if (message.includes('ContractFlow API rodando')) {
        isStarted = true;
      }
    });

    apiServer.stderr?.on('data', (data) => {
      console.error(`[API ERROR] ${data.toString()}`);
    });

    apiServer.on('error', (error) => {
      console.error('✗ Erro ao iniciar processo da API:', error);
    });

    apiServer.on('exit', (code) => {
      console.log(`[API] Processo encerrado com código ${code}`);
    });

    // Aguarda que o servidor inicie
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const apiUrl = `http://127.0.0.1:${port}`;
    console.log(`✓ ContractFlow API iniciada em ${apiUrl}`);
    return apiUrl;
  } catch (error) {
    console.error('✗ Erro ao iniciar API:', error);
    throw error;
  }
}

module.exports = { startApiServer };
