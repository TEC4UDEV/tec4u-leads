# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A lead capture system for TEC4U's field sales team. It has two independent parts:

1. **Vercel backend proxy** (`api/lead.js`) — validates user API keys, enforces a per-user 500 leads/day rate limit via Upstash Redis, maps event names to ClickUp list IDs, and creates tasks in ClickUp.
2. **AI Edge Gallery skill** (`skills/tec4u-leads/`) — runs on Android (Google AI Edge Gallery + Gemma) and calls the proxy via `fetch`. The app runtime calls the global `window["ai_edge_gallery_get_result"]` function defined in `scripts/index.html`.

## Commands

No build step. The only dependency is `@upstash/redis`; install it with:

```bash
npm install
```

Deploy is done by pushing to GitHub; Vercel picks it up automatically.

**Test the proxy directly before touching the skill:**

```bash
curl -X POST https://SEU-PROJETO.vercel.app/api/lead \
  -H "Content-Type: application/json" \
  -H "x-api-key: SUA_CHAVE" \
  -d '{"evento":"Teste","nome":"João","telefone":"+5511999999999","email":"joao@teste.com","site":null,"observacao":"teste"}'
```

If cURL succeeds but the AI Edge Gallery action fails, the issue is in `SKILL.md` or `index.html`, not the backend.

## Architecture & data flow

```
Gemma (Android) → runs index.html → calls window["ai_edge_gallery_get_result"](jsonString)
                                          │
                                          ├── flushes offline queue (localStorage)
                                          └── POST /api/lead  { x-api-key: ... }
                                                   │
                                          api/lead.js (Vercel)
                                                   │
                                          ├── auth:  TEC4U_KEYS env var (JSON map key→name)
                                          ├── rate:  Redis key ratelimit:{key}:{YYYY-MM-DD}
                                          ├── route: getListId(evento) → CLICKUP_LISTS env var
                                          └── POST   api.clickup.com/api/v2/list/{listId}/task
```

**Offline queue:** On network failure, `index.html` pushes the lead to `localStorage` under key `tec4u_leads_queue_v1`. Next invocation attempts to flush the queue before sending the current lead.

**Event-to-list routing:** `getListId()` in `api/lead.js` normalises the event name (lowercase, strip spaces) and does an exact-then-partial match against the `CLICKUP_LISTS` JSON map. Falls back to the `padrao` key, then `CLICKUP_LIST_ID_DEFAULT`.

## Environment variables (Vercel)

| Variable | Purpose |
|---|---|
| `CLICKUP_TOKEN` | ClickUp API token used server-side only |
| `CLICKUP_LIST_ID_DEFAULT` | Fallback list when event is unmapped |
| `CLICKUP_LISTS` | JSON map: `{"padrao":"901…","febratex":"901…"}` |
| `TEC4U_KEYS` | JSON map of user keys: `{"pk_rodrigo_abc123":"Rodrigo Soares"}` |
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token |

See `.env.example` for the full template. **Never put `CLICKUP_TOKEN` inside the skill** — the HTML/JS runs on-device and is not protected by GitHub Secrets.

## Skill contract (AI Edge Gallery)

`scripts/index.html` **must** expose `window["ai_edge_gallery_get_result"]`. The function receives a JSON string and must return a JSON string. The app does not accept any other return type.

`SKILL.md` drives the Gemma prompt. It instructs the model to collect leads, confirm them, and call `run_js` with `index.html` passing one lead at a time as the `data` field.

## Key files

| File | Role |
|---|---|
| `api/lead.js` | Vercel serverless handler — auth, rate limit, ClickUp POST |
| `skills/tec4u-leads/SKILL.md` | Gemma system prompt and action instructions |
| `skills/tec4u-leads/scripts/index.html` | Client-side script: queue, validation, proxy call |
| `vercel.json` | CORS headers + 10 s function timeout for `api/lead.js` |
| `.env.example` | Template for all required environment variables |

## Common errors

| Error | Cause |
|---|---|
| `validateListIDEx List ID invalid` | The value in `CLICKUP_LISTS` or `CLICKUP_LIST_ID_DEFAULT` is not a valid ClickUp list ID — verify with Postman/cURL against the ClickUp API |
| `ai_edge_gallery_get_result function not found` | `index.html` is missing or not defining the global function |
| `Invalid format: Expected at least two '---' sections` | `SKILL.md` frontmatter is malformed — use local import instead of URL import as a workaround |
| `ação falhou` in Gallery | Check `PROXY_URL` and `API_KEY` constants at the top of `index.html` |
