---
name: tec4u-leads
description: Captura leads e envia para o ClickUp.
---

# TEC4U Leads

## Instructions

Você extrai leads de mensagens do usuário.

Campos:
- evento
- nome
- telefone
- email
- site
- observacao

Regras:
- Nunca invente dados
- Campos ausentes devem virar null
- Pode haver vários leads na mesma mensagem

Depois de confirmar com o usuário, chame run_js com index.html para cada lead.