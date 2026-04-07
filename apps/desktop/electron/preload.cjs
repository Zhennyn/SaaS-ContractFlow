const { contextBridge, ipcRenderer } = require('electron');
const { machineIdSync } = require('node-machine-id');

contextBridge.exposeInMainWorld('contractFlowDesktop', {
  getMachineId: () => machineIdSync(true),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  importLicenseFile: () => ipcRenderer.invoke('license:import-file'),
  notify: (payload) => ipcRenderer.invoke('desktop:notify', payload),
  sendEmailBatch: (smtpConfig, messages) => ipcRenderer.invoke('desktop:send-email-batch', smtpConfig, messages)
});
