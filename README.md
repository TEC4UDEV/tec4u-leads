# TEC4U Leads

Skill para o Google AI Edge Gallery / Gemma que captura leads de eventos no celular e envia para o ClickUp por meio de um proxy seguro no Vercel. O projeto usa autenticação por chave individual de usuário, limite diário de 500 leads por usuário e fila local para tolerar falhas temporárias de conexão. [cite:1][cite:2]

## O que faz

- Extrai leads a partir de texto digitado ou colado no Gemma.
- Coleta os campos: `evento`, `nome`, `empresa`, `telefone`, `email`, `site` e `observacao`.
- Envia cada lead para o ClickUp usando a API de criação de task em uma lista específica. [cite:3]
- Usa um proxy no Vercel para manter a chave do ClickUp fora do celular, já que segredos embutidos em HTML/JS do cliente não ficam realmente protegidos. [cite:4]
- Permite autenticação por usuário com chave própria e revogação individual no servidor. [cite:2]
- Aplica rate limit diário de 500 leads por usuário com Redis da Upstash. [cite:2]
- Mantém uma fila local no dispositivo para reenviar leads quando a conexão voltar.

## Arquitetura

```text
Gemma / AI Edge Gallery (celular)
        │
        │ run_js → scripts/index.html
        ▼
Proxy no Vercel (/api/lead)
        │
        ├── valida x-api-key do usuário
        ├── aplica rate limit diário
        ├── escolhe a lista do ClickUp por evento
        ▼
ClickUp API → cria task na lista correta
```

O AI Edge Gallery usa skills com `SKILL.md` e scripts associados, e o ecossistema oficial inclui exemplos em que o script expõe uma função global `ai_edge_gallery_get_result` para o app chamar. [cite:5]

## Estrutura do repositório

```text
.
├── api/
│   └── lead.js
├── skills/
│   └── tec4u-leads/
│       ├── SKILL.md
│       └── scripts/
│           └── index.html
├── .env.example
├── package.json
├── vercel.json
└── README.md
```

### O que vai para o celular

A importação local da skill precisa apenas da pasta da skill com `SKILL.md` e seus scripts, como `scripts/index.html`. O backend e os arquivos de deploy não precisam ser copiados para o dispositivo. [cite:5]

```text
skills/
└── tec4u-leads/
    ├── SKILL.md
    └── scripts/
        └── index.html
```

### O que fica no backend

Os arquivos abaixo ficam no GitHub/Vercel para o proxy seguro:

- `api/lead.js`
- `.env.example`
- `package.json`
- `vercel.json`

## Requisitos

- Conta no ClickUp com acesso à lista onde os leads serão criados. [cite:3]
- Token de API do ClickUp válido. [cite:3]
- Projeto no Vercel com variáveis de ambiente configuradas. [cite:1]
- Banco Redis no Upstash para rate limit.
- Google AI Edge Gallery instalado no celular. [cite:2]

## Variáveis de ambiente

Configure estas variáveis no Vercel em **Project Settings → Environment Variables**. O Vercel permite adicionar e gerenciar essas variáveis por projeto. [cite:1]

```env
CLICKUP_TOKEN=pk_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
CLICKUP_LIST_ID_DEFAULT=901000000000
CLICKUP_LISTS={"padrao":"901000000000","febratex":"901111111111"}
TEC4U_KEYS={"pk_rodrigo_abc123":"Rodrigo Soares","pk_ana_def456":"Ana Lima"}
UPSTASH_REDIS_REST_URL=https://XXXXXXXX.upstash.io
UPSTASH_REDIS_REST_TOKEN=XXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Significado das variáveis

| Variável | Para que serve |
|---|---|
| `CLICKUP_TOKEN` | Token da API do ClickUp usado pelo proxy para criar tasks. [cite:3] |
| `CLICKUP_LIST_ID_DEFAULT` | Lista padrão do ClickUp usada quando o evento não estiver mapeado. [cite:3] |
| `CLICKUP_LISTS` | Mapa JSON de evento → `list_id` do ClickUp. [cite:3] |
| `TEC4U_KEYS` | JSON com chaves de usuário autorizadas e seus nomes. [cite:1] |
| `UPSTASH_REDIS_REST_URL` | URL do Redis da Upstash usada no rate limit. |
| `UPSTASH_REDIS_REST_TOKEN` | Token do Redis da Upstash usada no rate limit. |

## Como descobrir o `list_id` certo

A API do ClickUp cria tasks em uma lista específica, então o valor usado em `/list/{list_id}/task` precisa ser um `list_id` válido para a API. O endpoint oficial de listas do ClickUp usa esse identificador para consultar uma lista específica. [cite:3][cite:6]

Se o ClickUp retornar algo como `validateListIDEx List ID invalid` com `ECODE: INPUT_003`, o ID enviado não é um `list_id` aceito pela API. [cite:7]

Dica prática:
- teste o `list_id` no Postman/cURL;
- quando funcionar, use esse mesmo valor em `CLICKUP_LIST_ID_DEFAULT` e `CLICKUP_LISTS`.

## Instalação do backend no Vercel

1. Faça fork ou clone deste repositório.
2. Crie um projeto no Vercel e importe o repositório. [cite:1]
3. Cadastre as variáveis de ambiente em **Settings → Environment Variables**. [cite:1]
4. Faça o deploy.
5. Guarde a URL final, por exemplo:

```text
https://seu-projeto.vercel.app
```

## Instalação da skill no celular

O AI Edge Gallery permite importar skills localmente, além do fluxo por URL. Há demonstrações recentes do app mostrando o caminho **Skills → + → Import local skill**. [cite:8]

### Passos

1. No repositório, vá até `skills/tec4u-leads/`.
2. Copie essa pasta para o celular.
3. Abra o Google AI Edge Gallery. [cite:8]
4. Vá em **Skills**.
5. Toque em **+**.
6. Escolha **Import local skill**. [cite:8]
7. Selecione a pasta `tec4u-leads` ou o `SKILL.md`, dependendo do seletor exibido pelo app.

## Importante sobre o `index.html`

O script da skill precisa expor a função global `window["ai_edge_gallery_get_result"]`, porque esse é o contrato usado pelo AI Edge Gallery para chamar scripts de skill. O exemplo oficial `query-wikipedia` do repositório do Gallery faz exatamente isso e retorna o resultado como string JSON. [cite:5]

## Fluxo de autenticação

Cada usuário recebe uma chave própria enviada no header `x-api-key`. O proxy no Vercel valida essa chave antes de chamar o ClickUp. [cite:1]

Exemplo conceitual:

```text
x-api-key: pk_rodrigo_abc123
```

Vantagens:
- revogação individual;
- rastreabilidade por usuário;
- não expõe a chave do ClickUp no celular. [cite:4]

## Rate limit

Cada usuário pode enviar até **500 leads por dia**. O contador diário é mantido no Redis da Upstash pelo backend. Esse controle ajuda a evitar abuso e uso indevido da integração. [cite:1]

## Teste rápido do proxy

Antes de testar no AI Edge Gallery, valide o backend com Postman ou cURL:

```bash
curl -X POST https://SEU-PROJETO.vercel.app/api/lead \
  -H "Content-Type: application/json" \
  -H "x-api-key: SUA_CHAVE_DE_USUARIO" \
  -d '{"evento":"Teste","nome":"João","telefone":"+5511999999999","email":"joao@teste.com","site":null,"observacao":"teste manual"}'
```

Se funcionar no Postman/cURL e falhar no app, o problema tende a estar na execução da skill (`SKILL.md` ou `index.html`) e não no backend. O uso da função `ai_edge_gallery_get_result` é um ponto crítico nesse fluxo. [cite:5]

## Troubleshooting

### `Invalid format: Expected at least two '---' sections`

Esse erro já foi relatado por usuários ao instalar skill por URL no AI Edge Gallery, mesmo com `SKILL.md` aparentemente válido. Quando isso acontece, importar a skill localmente pode ser um workaround melhor. [cite:9][cite:10]

### `ai_edge_gallery_get_result function not found`

O `index.html` não definiu a função global esperada pelo app. O script deve expor `window["ai_edge_gallery_get_result"]` e retornar uma string JSON. [cite:5]

### `validateListIDEx List ID invalid`

O `list_id` enviado para a API do ClickUp não é válido para o endpoint de criação de task. Revise `CLICKUP_LIST_ID_DEFAULT` e `CLICKUP_LISTS`. [cite:6][cite:7]

### `ação falhou` no AI Edge Gallery

Se o Postman funciona, mas a action falha no app, revise:
- `PROXY_URL` dentro de `skills/tec4u-leads/scripts/index.html`;
- `API_KEY` do usuário;
- presença da função `ai_edge_gallery_get_result`;
- JSON enviado no campo `data` da chamada `run_js`. [cite:5]

## Segurança

GitHub Secrets não protege segredos que acabam indo para HTML/JS executado no cliente, porque o valor fica exposto ao navegador se for embutido no build. Por isso, a chave do ClickUp deve permanecer no servidor, no Vercel, e nunca dentro da skill no celular. [cite:4]

## Roadmap

- Melhorar normalização de telefone e e-mail.
- Adicionar logs estruturados por usuário.
- Adicionar fallback mais robusto para fila offline.
- Suporte a múltiplos ambientes, como produção e homologação.
- Melhorar o mapeamento automático de eventos para listas.

## Referências úteis

- Vercel Environment Variables [cite:1]
- Google AI Edge Gallery blog post [cite:2]
- ClickUp Tasks / Lists API [cite:3][cite:6]
- Exemplo oficial de skill `query-wikipedia` no repositório do Google AI Edge Gallery [cite:5]
