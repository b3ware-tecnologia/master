# BM Crédito local no Windows

O sistema está disponível em **http://127.0.0.1:3020/app**. Nesta execução local, o proprietário pediu acesso direto, sem login. A empresa é somente BM Crédito; não há seletor nem Admin Center no portal.

## Uso

1. **Início:** enviados, contatos que responderam, encaminhados ao humano e contatos sem resposta. São pessoas únicas da empresa. Encaminhamentos anteriores continuam contados mesmo se a IA retomar depois.
2. **Equipe:** criar equipes, convidar atendentes por nome/e-mail e vincular pessoas à equipe. Cada atendente define sua senha quando o acesso autenticado estiver sendo usado.
3. **WhatsApp:** informar um nome opcional e conectar por QR Code. Não é necessário digitar o telefone; ele é identificado após a conexão. No celular, abrir Aparelhos conectados → Conectar aparelho e escanear o QR. O sistema mostra o telefone, estado, última verificação e última conexão confirmada, quando houver.
4. **Configurações:** salvar e validar a chave da OpenAI; ela fica criptografada no banco local. O botão de teste faz uma chamada real pequena ao GPT-6 Luna e usa o saldo dessa conta. Nenhuma chave foi copiada do PILOT ou do Railway.
5. **Listas e contatos / Disparador:** importar contatos, revisar a autorização/dados, escolher lista/números/equipe, preparar a rota e iniciar explicitamente. Salvar a chave não inicia campanhas automaticamente.

## Iniciar e parar

- Executar **Iniciar BM Credito.cmd** na raiz do projeto inicia os serviços em segundo plano. Também pode executar `scripts/Start-BM-Local.ps1`.
- Executar **Parar BM Credito.cmd** encerra somente os processos conferidos como pertencentes a esta pasta. Os dados são preservados. Não usa nomes globais de processos para parar outros projetos.
- Em uma instalação nova, executar primeiro `scripts/Setup-BM-Local.ps1`. O script baixa versões fixadas, confere os hashes dos arquivos e instala as dependências.
- Os dados, segredos locais e logs ficam em `.private/local-runtime`, fora do Git. Não compartilhar essa pasta. O computador precisa permanecer ligado para receber mensagens.

Portas exclusivas desta instalação: portal **3020**, PostgreSQL **55432**, Redis **57479**, Evolution **18080**, todas em `127.0.0.1`. Os bancos `bm_credito` e `bm_evolution` são distintos. Não reutiliza o Redis do PILOT nem seus dados.

O acesso sem senha exige simultaneamente `NODE_ENV=development`, `BM_LOCAL_RUNTIME=true`, `BM_LOCAL_NO_AUTH=true`, URL local na porta 3020 e uma requisição local. Cabeçalhos de encaminhamento remoto são rejeitados. Sessões autenticadas continuam respeitando o papel do usuário. A exceção não funciona em produção ou com uma URL pública. Para restaurar o login local, definir `noLogin: false` em `.private/local-runtime/config.json` e reiniciar; a senha existente é preservada.

## Validação e limites

PostgreSQL 17.11, Redis Windows 8.10.3 e Evolution 2.3.7 foram iniciados nativamente, sem Docker ou mudança de virtualização. `/health` e `/ready` retornaram 200. A Evolution respondeu na API autenticada e recusou a ausência da chave com 401. O worker confirmou PostgreSQL e Redis.

Oito verificações de navegador passaram, incluindo cadastro de equipe, convite/ativação de atendente, permissões da OpenAI, conexão real ao serviço local da Evolution e gravação do webhook, abordagem fixa, isolamento e layout desktop/celular/escuro. As duas contas temporárias, equipe e conexão usadas nessa verificação foram removidas. Nenhum contato fictício foi incluído na operação. Os artefatos ficam em `output/acceptance/20261027-local`.

Após o pedido de retirar o login, o navegador confirmou a entrada direta, a ausência do seletor/saída de conta e a remoção dos dados temporários. Requisições sem sessão com encaminhamento remoto receberam 401. Uma sessão válida de atendente continuou recebendo 403 na configuração da OpenAI. Passaram 203 testes unitários; dois de conectividade foram pulados. TypeScript e ESLint foram verificados separadamente do conteúdo dos componentes baixados em `.private`.

No Windows, não regenerar o Prisma Client enquanto o portal/worker estiverem usando sua DLL. Para testar com o ambiente ligado, usar `pnpm exec vitest run`; `pnpm test` inclui a regeneração e deve ser usado com os serviços parados.

O teste da infraestrutura não equivale a pareamento físico de um WhatsApp, envio/recebimento com cliente real ou validação da qualidade do modelo. Essas etapas dependem do número autorizado e de uma chave OpenAI efetivamente salva. Nenhuma geração real de IA foi comprovada até este registro.

O link do chat web emitido com `APP_URL` local funciona neste computador. Para um cliente abri-lo em outro aparelho ou fora da rede, ainda é necessário configurar uma URL HTTPS pública; não expor o portal administrativo sem autenticação. A produção no Railway correto continua pendente da ativação do plano.

Fontes dos componentes: [PostgreSQL/EDB](https://www.postgresql.org/download/windows/), [Redis Windows 8.10.3](https://github.com/redis-windows/redis-windows/releases/tag/8.10.3), [Evolution 2.3.7](https://github.com/evolution-foundation/evolution-api/tree/2.3.7). O ajuste local da Evolution limita o servidor ao loopback; o checkout fica somente em `.private`.
