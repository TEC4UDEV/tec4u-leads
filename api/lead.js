import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const DAILY_LIMIT = 500;

function getTodayKey(userId) {
  const today = new Date().toISOString().slice(0, 10);
  return `ratelimit:${userId}:${today}`;
}

function buildDescription(lead) {
  return [
    lead.telefone ? `📞 Telefone: ${lead.telefone}` : null,
    lead.email ? `📧 E-mail: ${lead.email}` : null,
    lead.site ? `🌐 Site: ${lead.site}` : null,
    lead.evento ? `🎪 Evento: ${lead.evento}` : null,
    lead.observacao ? `📝 Obs: ${lead.observacao}` : null,
    `👤 Captado por: ${lead._captadoPor}`,
  ].filter(Boolean).join('\n');
}

function getListId(evento) {
  const LISTAS = JSON.parse(process.env.CLICKUP_LISTS || '{}');
  if (!evento) return LISTAS['padrao'] || process.env.CLICKUP_LIST_ID_DEFAULT;
  const key = evento.toLowerCase().replace(/\s+/g, '');
  if (LISTAS[key]) return LISTAS[key];
  const partialMatch = Object.keys(LISTAS).find(k => key.includes(k) || k.includes(key));
  return LISTAS[partialMatch] || LISTAS['padrao'] || process.env.CLICKUP_LIST_ID_DEFAULT;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const clientKey = req.headers['x-api-key'];
  if (!clientKey) {
    return res.status(401).json({ error: 'Chave de API ausente.' });
  }

  let users;
  try {
    users = JSON.parse(process.env.TEC4U_KEYS || '{}');
  } catch {
    return res.status(500).json({ error: 'Configuração inválida no servidor.' });
  }

  const userName = users[clientKey];
  if (!userName) {
    return res.status(401).json({ error: 'Chave de API inválida ou revogada.' });
  }

  const rateLimitKey = getTodayKey(clientKey);
  const currentCount = Number((await redis.get(rateLimitKey)) || 0);

  if (currentCount >= DAILY_LIMIT) {
    return res.status(429).json({
      error: `Limite diário de ${DAILY_LIMIT} leads atingido para ${userName}. Tente novamente amanhã.`,
      enviados_hoje: currentCount,
      limite: DAILY_LIMIT
    });
  }

  const lead = req.body;
  if (!lead || typeof lead !== 'object') {
    return res.status(400).json({ error: 'Body inválido.' });
  }

  lead._captadoPor = userName;
  const listId = getListId(lead.evento);

  if (!listId) {
    return res.status(500).json({ error: 'Nenhuma lista do ClickUp configurada.' });
  }

  try {
    const clickupRes = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
      method: 'POST',
      headers: {
        'Authorization': process.env.CLICKUP_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: lead.nome || 'Lead sem nome',
        markdown_description: buildDescription(lead),
        tags: [lead.evento || 'evento'],
        priority: 3,
        status: 'to do'
      })
    });

    if (!clickupRes.ok) {
      const errData = await clickupRes.text();
      return res.status(502).json({ error: 'Erro ao criar task no ClickUp.', detail: errData });
    }

    await redis.set(rateLimitKey, currentCount + 1, { ex: 90000 });

    const task = await clickupRes.json();
    return res.status(201).json({
      status: 'ok',
      message: `Lead \"${lead.nome}\" criado com sucesso.`,
      task_id: task.id,
      captado_por: userName,
      enviados_hoje: currentCount + 1,
      limite_diario: DAILY_LIMIT
    });
  } catch (err) {
    return res.status(503).json({ error: 'Serviço indisponível. Tente novamente.' });
  }
}
