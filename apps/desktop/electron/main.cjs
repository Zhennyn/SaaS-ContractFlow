const { app, BrowserWindow, Notification, dialog, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.handle('license:import-file', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Importar licenca',
    properties: ['openFile'],
    filters: [
      { name: 'Licenca', extensions: ['lic', 'json'] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf8');
  return { filePath, content };
});

ipcMain.handle('desktop:notify', (_event, payload) => {
  if (!Notification.isSupported()) {
    return false;
  }

  const title = typeof payload?.title === 'string' ? payload.title : 'ContractFlow Suite';
  const body = typeof payload?.body === 'string' ? payload.body : 'Voce possui notificacoes pendentes.';

  const notification = new Notification({
    title,
    body,
    urgency: 'normal',
    silent: false
  });

  notification.show();
  return true;
});

// Envia e-mails SMTP via nodemailer a partir do processo principal (Node.js).
// As senhas ficam armazenadas localmente e nunca saem do dispositivo.
ipcMain.handle('desktop:send-email-batch', async (_event, smtpConfig, messages) => {
  if (
    !smtpConfig ||
    typeof smtpConfig.host !== 'string' ||
    smtpConfig.host.trim().length === 0 ||
    typeof smtpConfig.user !== 'string'
  ) {
    return { ok: false, error: 'Configuracao SMTP invalida.' };
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host.trim(),
    port: Number(smtpConfig.port) || 587,
    secure: Boolean(smtpConfig.secure),
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.password
    }
  });

  const results = [];
  for (const msg of Array.isArray(messages) ? messages : []) {
    try {
      await transporter.sendMail({
        from: `ContractFlow Suite <${smtpConfig.user}>`,
        to: String(msg.to),
        subject: String(msg.subject),
        html: String(msg.html)
      });
      results.push({ to: msg.to, ok: true });
    } catch (err) {
      results.push({ to: msg.to, ok: false, error: err.message });
    }
  }

  return { ok: true, results };
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#f4efe5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
