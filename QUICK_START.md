# 🚀 Guia Rápido - Novas Funcionalidades

## 1. Iniciar Servidor

```bash
cd SaaS-ContractFlow
npm install  # Se necessário
npm run dev
```

## 2. Autenticação

```bash
# Login com credenciais demo
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@contractflow.local",
    "password": "admin123",
    "licenseKey": "CFLOW-DEMO-2026",
    "machineId": "<seu-machine-id>"
  }'

# Salve o token retornado
export TOKEN="eyJhbGc..."
```

## 3. Testar Auditoria

### Criar Contrato
```bash
curl -X POST http://localhost:4000/contracts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "<customer-id>",
    "title": "Test Contract",
    "description": "Testing audit",
    "valueCents": 10000,
    "startDate": "2026-04-07",
    "endDate": "2027-04-07",
    "renewalDate": "2027-03-07",
    "status": "active",
    "autoRenew": true,
    "paymentCycle": "yearly",
    "notes": "Demo"
  }'

# Salve o contractId retornado
export CONTRACT_ID="<id>"
```

### Listar Auditoria do Contrato
```bash
curl "http://localhost:4000/audit/resource/contract/$CONTRACT_ID" \
  -H "Authorization: Bearer $TOKEN"

# Saída esperada:
# {
#   "data": [
#     {
#       "id": "...",
#       "userId": "...",
#       "action": "CONTRACT_CREATED",
#       "resourceType": "contract",
#       "resourceId": "...",
#       "newValues": { "title": "Test Contract", ... },
#       "createdAt": "2026-04-07T..."
#     }
#   ],
#   "pagination": { "limit": 50, "offset": 0, "total": 1 }
# }
```

## 4. Testar Upload de Arquivos

### Fazer Upload
```bash
# Crie um arquivo PDF teste ou use um existente
curl -X POST "http://localhost:4000/contracts/$CONTRACT_ID/attachments" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/caminho/para/seu/documento.pdf"

# Salve o attachmentId retornado
export ATTACHMENT_ID="<id>"
```

### Listar Arquivos
```bash
curl "http://localhost:4000/contracts/$CONTRACT_ID/attachments" \
  -H "Authorization: Bearer $TOKEN"
```

### Fazer Download
```bash
curl "http://localhost:4000/contracts/$CONTRACT_ID/attachments/$ATTACHMENT_ID/download" \
  -H "Authorization: Bearer $TOKEN" \
  -o documento_baixado.pdf
```

### Deletar Arquivo
```bash
curl -X DELETE "http://localhost:4000/contracts/$CONTRACT_ID/attachments/$ATTACHMENT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## 5. Testar Filtros e Pagination

### Filtrar Contratos por Status
```bash
curl "http://localhost:4000/contracts?status=active&limit=10&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

### Buscar Contratos
```bash
curl "http://localhost:4000/contracts?search=test&limit=20" \
  -H "Authorization: Bearer $TOKEN"

# Busca em: título, descrição, nome do cliente
```

### Combinar Filtros
```bash
curl "http://localhost:4000/contracts?status=active&clmStatus=signed&search=contract&limit=50&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

### Buscar Clientes
```bash
curl "http://localhost:4000/customers?search=empresa&limit=25&offset=0" \
  -H "Authorization: Bearer $TOKEN"

# Busca em: nome, email, empresa
```

## 6. Exemplo Completo (Desktop App)

```typescript
import { api } from '@contractflow/desktop/src/api';

const apiUrl = 'http://localhost:4000';
const token = 'seu_token_jwt';
const contractId = 'contract-id';

// Upload de arquivo
const file = new File(['pdf content'], 'documento.pdf', { type: 'application/pdf' });
const attachment = await api.uploadAttachment(apiUrl, token, contractId, file);
console.log('Uploaded:', attachment);

// Listar attachments
const attachments = await api.getAttachments(apiUrl, token, contractId);
console.log('Attachments:', attachments);

// Download
const { blob, fileName } = await api.downloadAttachment(
  apiUrl, 
  token, 
  contractId,
  attachment.id
);
// Save blob to file...

// Deletar
await api.deleteAttachment(apiUrl, token, contractId, attachment.id);
```

## 7. Verificar Estrutura de Dados

### Arquivo de Auditoria
```json
{
  "id": "uuid",
  "userId": "user-id",
  "action": "CONTRACT_CREATED",
  "resourceType": "contract",
  "resourceId": "contract-id",
  "oldValues": null,
  "newValues": {
    "title": "Contract Title",
    "valueCents": 5000,
    "status": "active"
  },
  "ipAddress": "127.0.0.1",
  "createdAt": "2026-04-07T10:30:00Z"
}
```

### Arquivo de Attachment
```json
{
  "id": "uuid",
  "contractId": "contract-id",
  "fileName": "documento.pdf",
  "filePath": "1712506200000_documento.pdf",
  "fileSize": 245123,
  "mimeType": "application/pdf",
  "uploadedBy": "user-id",
  "uploadedAt": "2026-04-07T10:30:00Z"
}
```

## 8. Localização de Arquivos

```
apps/api/data/
├── uploads/
│   ├── contract-id-1/
│   │   ├── 1712506200000_documento.pdf
│   │   └── 1712506250000_contrato.pdf
│   └── contract-id-2/
│       └── 1712506300000_assinado.pdf
└── contractflow.db
```

## 9. Troubleshooting

### "File not found"
- Verifique diretório `apps/api/data/uploads`
- Verifique permissões de escrita

### "Only PDF files allowed"
- Upload restrição: apenas `.pdf`
- MIME type deve ser `application/pdf`

### "File exceeds 50MB limit"
- Tamanho máximo: 50MB
- Use `-F` com curl para upload

### "Resource not found"
- Verifique que contractId existe
- Verifique que usuário é dono do contrato

## 10. Proximos Passos

- [ ] Integrar UI de attachments no desktop app
- [ ] Adicionar visualização de auditoria na interface
- [ ] Implementar filtros avançados na UI
- [ ] Testes automatizados
- [ ] Rate limiting
- [ ] Documentação Swagger

---

**Status:** ✅ Ready for Development  
**Última atualização:** 2026-04-07
