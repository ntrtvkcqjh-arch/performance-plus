export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { session = {}, comments = [], userLevel = 'débutante en progression' } = req.body || {};

  const exerciseSummary = (session.exercises || [])
    .filter(e => e && e.name)
    .map(e =>
      `- ${e.name}: ${e.series || '?'} séries × ${e.reps || '?'}` +
      (e.setsCompleted !== undefined ? `, ${e.setsCompleted}/${e.series || '?'} sets complétés` : '') +
      (e.note ? `, note coach: "${e.note.slice(0, 80)}"` : '')
    )
    .join('\n') || 'Aucun exercice renseigné';

  const commentBlock = comments.length > 0
    ? `\nRessenti de Marjana:\n${comments.map(c => `"${c}"`).join('\n')}`
    : '';

  const prompt = `Tu es Julian, coach expert en calisthénie et handstand. Analyse la séance de Marjana (${userLevel}) et donne des optimisations concrètes.

Séance: ${session.name || 'Séance'}
Exercices:
${exerciseSummary}
${commentBlock}

Réponds UNIQUEMENT en JSON valide, format exact:
{
  "reasoning": "Observation courte sur la progression actuelle",
  "global_advice": "Conseil général motivant pour Marjana (1-2 phrases, tutoiement)",
  "suggestions": [
    {
      "exercise_title": "Nom exercice ou thème",
      "change": "Modification concrète et immédiatement applicable",
      "reason": "Pourquoi ça aide (court)"
    }
  ]
}

Maximum 3 suggestions. Bienveillant, précis, motivant.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', errText);
      return res.status(502).json({ error: 'AI service unavailable' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';

    // Extract JSON block from response
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found in response');

    const parsed = JSON.parse(match[0]);
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('optimize error:', err);
    return res.status(500).json({ error: 'Failed to generate suggestions', details: err.message });
  }
}
