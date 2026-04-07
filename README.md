# 📌 ContractFlow Suite
Sistema desktop para gestão de contratos e renovação de licenças, com foco em automação, controle operacional e visão de dados para tomada de decisão.

![Preview do ContractFlow Suite](https://raw.githubusercontent.com/Zhennyn/SaaS-ContractFlow/main/img/contractflow-preview.png)

![Status do Projeto](https://img.shields.io/badge/STATUS-EM%20DESENVOLVIMENTO-orange?style=for-the-badge)

## ✨ Funcionalidades

- 🔐 Autenticação com JWT e controle de acesso por perfil (owner/user)
- 🖥️ Aplicação desktop empacotada em .exe (Electron)
- 📄 Gestão completa de clientes e contratos (CRUD)
- 📅 Monitoramento de vencimentos e renovações prioritárias
- 🔔 Notificações locais de vencimento (30, 15, 7 e 1 dia) com ações de visto e adiar 24h
- 📄 Exportação de relatório PDF de contratos com filtro atual, receita recorrente e contratos em risco
- 📊 Dashboard com métricas de receita recorrente, contratos em risco e gráfico de Churn x MRR (últimos 6 meses)
- 🧾 Licenciamento comercial com vínculo por máquina
- 🔏 Importação e verificação de licença assinada local (.lic)
- ⚙️ Ferramenta interna para emissão de licenças (CLI)

## 🛠️ Tecnologias Utilizadas

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=electron&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge)
![Cloud Ready](https://img.shields.io/badge/Cloud-Ready-0078D4?style=for-the-badge&logo=microsoftazure&logoColor=white)

## 🚀 Como executar localmente

Pré-requisitos:

- Node.js 20+
- npm 10+
- Git

Passo a passo:

1. Clone o repositório

    git clone https://github.com/Zhennyn/SaaS-ContractFlow.git
    cd SaaS-ContractFlow

2. Instale as dependências

    npm install

3. Gere a base de dados de demonstração

    npm run seed

4. Configure a chave pública no desktop

    Crie o arquivo apps/desktop/.env com:

    VITE_API_URL=http://localhost:4000
    VITE_LICENSE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAhVbBtQqguLUqruAtl2aKlBAM2TadV5C4otsR7pWm4Yg=\n-----END PUBLIC KEY-----"

5. Execute API + Desktop em modo desenvolvimento

    npm run dev

6. Acesse com credenciais de teste

    Email: owner@contractflow.local
    Senha: admin123
    Licença: CFLOW-DEMO-2026

7. Gerar executável Windows (opcional)

    npm run package:desktop

## 🆕 Novidades da versão

- Notificações de vencimento no desktop:
    - Verificação automática ao abrir o app e em intervalo configurável (5 min, 15 min, 1h ou 3h).
    - Alertas nativos do Electron + painel interno com ações "Marcar como visto" e "Adiar 24h".  - **Marcos de alerta configuráveis:** adicione ou remova dias (padrão: 30, 15, 7, 1) diretamente na interface, sem precisar editar código. Persistido localmente por dispositivo.
  - **Envio de e-mail SMTP:** configure servidor, porta, usuário, senha e destinatário no painel "Preferências". Compatível com Gmail (App Password), Outlook, SendGrid SMTP e qualquer servidor padrão. Inclui botão "Testar conexão". Configurações armazenadas apenas no dispositivo local.- Relatório PDF de contratos:
    - Botão Exportar PDF no dashboard e na lista de contratos.
    - Inclui contratos do filtro atual, receita recorrente mensal, contratos em risco e data de geração.
    - Cabeçalho ContractFlow Suite e rodapé com versão do app.
- Dashboard analítico:
    - Gráfico combinado de MRR e Churn mensal dos últimos 6 meses.
    - Cards com MRR atual, churn atual e variação mês a mês.

## 📸 Screenshots

O projeto ainda está em desenvolvimento e as capturas serão adicionadas em breve.

Sugestões de imagens para incluir na pasta img:

- Tela de login e validação de licença
- Dashboard principal com métricas
- Lista de contratos com ações de edição
- Fluxo de importação de licença assinada

## 🌐 Demonstração

🔗 Em breve: link de demonstração pública

Sugestão de publicação:

- API em Azure App Service, Render ou Railway
- Vídeo curto de demonstração no YouTube/Loom
- GIF do fluxo principal no topo do README

## 📌 Sobre o projeto

Desenvolvido em 2026 como projeto de portfólio, o ContractFlow Suite foi criado para simular um produto SaaS desktop comercial de ponta a ponta.

Além da parte de desenvolvimento full stack, este projeto evidencia competências altamente valorizadas em vagas de Suporte TI, Help Desk, Dados e Cloud:

- Diagnóstico e resolução de incidentes em ambiente desktop/API
- Automação de processos operacionais (licenciamento e validação)
- Estruturação e consulta de dados em banco relacional
- Criação de dashboards para acompanhamento de indicadores
- Segurança aplicada (autenticação, autorização e assinatura digital)
- Organização de arquitetura em monorepo com foco em manutenção

É um projeto orientado a cenário real, com visão de produto, operação e escalabilidade.

---

Feito com ❤️ por Zhennyn

Contribuições, sugestões e feedbacks são muito bem-vindos.
