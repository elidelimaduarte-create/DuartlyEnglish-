import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function ask(prompt, opts = {}) {
  const { temperature = 0.7, thinkingLevel = 'none', maxOutputTokens = 4096 } = opts;
  const config = { temperature, maxOutputTokens };
  if (thinkingLevel !== 'none') config.thinkingConfig = { thinkingLevel };
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: prompt,
    config,
  });
  return response.text.trim();
}

async function askJSON(prompt, opts = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const raw = await ask(
        prompt + '\n\nResponda APENAS com JSON válido. Sem markdown, sem ```json, sem texto fora do JSON.',
        { ...opts, temperature: 0.1 }
      );
      const clean = raw.replace(/```json[\s\S]*?```|```[\s\S]*?```/g, '').trim();

      // Tenta parse direto
      try { return JSON.parse(clean); } catch {}

      // Tenta extrair o JSON do meio do texto
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch {}
      }

      // Tenta corrigir JSON truncado adicionando fechamentos
      const fixed = tryFixJSON(clean);
      if (fixed) return fixed;

      throw new Error(`JSON inválido na tentativa ${attempt}`);
    } catch (err) {
      console.error(`[GEMINI] Tentativa ${attempt}/${retries} falhou:`, err.message.slice(0, 100));
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

function tryFixJSON(str) {
  // Tenta fechar chaves/colchetes abertos
  try {
    let fixed = str;
    const opens = (str.match(/\{/g) || []).length;
    const closes = (str.match(/\}/g) || []).length;
    const openArr = (str.match(/\[/g) || []).length;
    const closeArr = (str.match(/\]/g) || []).length;

    // Remove trailing vírgula antes de fechar
    fixed = fixed.replace(/,\s*([}\]])/g, '$1');

    // Fecha arrays abertos
    for (let i = 0; i < openArr - closeArr; i++) fixed += ']';
    // Fecha objetos abertos
    for (let i = 0; i < opens - closes; i++) fixed += '}';

    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

const DAY_THEMES = [
  { name: 'Workplace Communication', focus: 'emails, meetings, professional introductions' },
  { name: 'Technology & Innovation', focus: 'tech vocabulary, digital tools' },
  { name: 'Problem Solving', focus: 'critical thinking, business decisions' },
  { name: 'Networking', focus: 'small talk, building connections' },
  { name: 'Presentations', focus: 'presenting ideas, persuasion' },
  { name: 'Travel & Culture', focus: 'travel vocabulary, cultural differences' },
  { name: 'Health & Wellbeing', focus: 'wellness, lifestyle, work-life balance' },
];

export async function generateDayLesson(userLevel, dayIndex = 0, recentWords = []) {
  const levelMap = {
    beginner:     'A1-A2 — conhecimento muito básico ou nenhum',
    intermediate: 'B1-B2 — consegue se comunicar mas tem lacunas',
    advanced:     'C1-C2 — fluente mas quer refinar nuances',
  };

  const dayTheme = DAY_THEMES[dayIndex % 7];
  const avoidWords = recentWords.slice(-20).join(', ');
  const vocabCount = userLevel === 'beginner' ? 5 : userLevel === 'intermediate' ? 6 : 7;

  return askJSON(`
Você é um professor de inglês criando UMA lição diária.

ALUNO: Nível ${levelMap[userLevel] || levelMap.beginner}
TEMA: ${dayTheme.name} — ${dayTheme.focus}
${avoidWords ? `NÃO REPITA: ${avoidWords}` : ''}

REGRA: o vocab DEVE aparecer no texto de leitura.

JSON (todos os campos obrigatórios, exatamente ${vocabCount} palavras no vocab):

{
  "day": ${dayIndex + 1},
  "theme": "${dayTheme.name}",
  "week_theme": "English for Career Growth",
  "emoji": "💼",
  "vocab": [
    {
      "word": "palavra",
      "translation": "tradução pt",
      "phonetic": "/IPA/",
      "part_of_speech": "noun",
      "register": "neutral",
      "example_sentence": "frase exemplo",
      "example_translation": "tradução",
      "collocations": ["col1", "col2"],
      "common_mistake": null
    }
  ],
  "grammar": {
    "topic": "tópico",
    "why_it_matters": "importância em 1 frase pt",
    "explanation": "explicação 4-6 frases pt",
    "rule_summary": "regra em 1 frase",
    "structure": "Subject + VERB + Object",
    "examples": [
      { "correct": "frase", "translation": "tradução", "note": null },
      { "correct": "frase", "translation": "tradução", "note": null },
      { "wrong": "errado", "correct": "certo", "explanation": "por que" },
      { "wrong": "errado", "correct": "certo", "explanation": "por que" }
    ],
    "tip": "dica profissional"
  },
  "context": {
    "situation": "situação profissional",
    "cultural_note": null,
    "dialogue": [
      { "speaker": "A", "line": "fala inglês", "translation": "pt" },
      { "speaker": "B", "line": "fala inglês", "translation": "pt" },
      { "speaker": "A", "line": "fala inglês", "translation": "pt" },
      { "speaker": "B", "line": "fala inglês", "translation": "pt" },
      { "speaker": "A", "line": "fala inglês", "translation": "pt" },
      { "speaker": "B", "line": "fala inglês", "translation": "pt" }
    ],
    "highlighted_expressions": [
      { "expression": "expr", "meaning": "significado", "usage": "quando usar" }
    ]
  },
  "reading": {
    "title": "título",
    "genre": "article",
    "text": "texto 8-10 frases inglês com vocab integrado",
    "translation": "tradução completa pt",
    "vocabulary_in_context": [
      { "word": "palavra do vocab", "sentence": "frase onde aparece" }
    ],
    "quiz": [
      { "question": "pergunta inglês", "options": ["A) op","B) op","C) op","D) op"], "answer": "A", "explanation": "explicação pt" },
      { "question": "pergunta inglês", "options": ["A) op","B) op","C) op","D) op"], "answer": "B", "explanation": "explicação pt" },
      { "question": "pergunta inglês", "options": ["A) op","B) op","C) op","D) op"], "answer": "C", "explanation": "explicação pt" },
      { "question": "pergunta inglês", "options": ["A) op","B) op","C) op","D) op"], "answer": "D", "explanation": "explicação pt" }
    ]
  },
  "pronunciation_focus": {
    "word": "palavra do vocab",
    "phonetic": "/IPA/",
    "syllables": "sí-LA-bas",
    "sound_tip": "instrução física para brasileiros",
    "minimal_pairs": ["similar1", "similar2"]
  },
  "daily_tip": "dica prática pt",
  "music": {
    "title": "música",
    "artist": "artista",
    "year": 2020,
    "level_fit": "por que adequada ao nível",
    "why_learn": "valor pedagógico",
    "grammar_structures": ["estrutura1"],
    "vocab_highlights": [{ "word": "palavra", "meaning": "significado pt", "context": "contexto" }],
    "cultural_context": "contexto cultural",
    "youtube_search": "busca YouTube"
  }
}`, { thinkingLevel: 'none', maxOutputTokens: 8000 }, 3);
}

export async function evaluatePronunciationAudio(audioBuffer, targetWord, phonetic, userLevel) {
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: [
      { inlineData: { mimeType: 'audio/ogg', data: audioBuffer.toString('base64') } },
      `Professor de pronúncia. Palavra alvo: "${targetWord}" ${phonetic}. Nível: ${userLevel}.
JSON apenas:
{
  "score": 0-100,
  "heard": "o que ouvi",
  "matches_target": true,
  "overall_assessment": "avaliação 2-3 frases pt",
  "phoneme_analysis": [{ "phoneme": "/x/", "quality": "correto|próximo|incorreto", "what_was_heard": "ouvi", "tip": "correção" }],
  "stress": { "correct": true, "comment": "comentário" },
  "brazilian_interference": "interferência",
  "exercises": ["exercício 1", "exercício 2"],
  "encouragement": "motivação"
}`,
    ],
    config: { temperature: 0.1, maxOutputTokens: 1000 },
  });
  const raw = response.text.trim();
  try {
    return JSON.parse(raw.replace(/```json[\s\S]*?```|```[\s\S]*?```/g, '').trim());
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { score: 0, heard: '', overall_assessment: 'Não foi possível avaliar.', encouragement: 'Continue!' };
  }
}

export async function evaluatePronunciationText(userAttempt, targetWord, phonetic, userLevel) {
  return askJSON(`Professor de pronúncia. Palavra: "${targetWord}" ${phonetic}. Tentativa: "${userAttempt}". Nível: ${userLevel}.
JSON:
{
  "score": 0-100,
  "analysis": "acertos e erros pt",
  "correct_breakdown": "sílabas com TÔNICA em maiúscula",
  "ipa_explained": "IPA em pt simples",
  "hardest_sound": { "phoneme": "/x/", "why_hard_for_brazilians": "por que", "how_to_produce": "instrução física", "approximation": "similar pt" },
  "common_mistakes": [{ "mistake": "erro", "correct": "certo" }],
  "practice_words": ["palavra1", "palavra2"],
  "mnemonic": "truque memória"
}`, { thinkingLevel: 'none', maxOutputTokens: 1000 });
}

export async function correctEnglish(text, userLevel) {
  return askJSON(`Professor inglês profissional. Nível: ${userLevel}. Frase: "${text}"
JSON:
{
  "is_correct": true,
  "score": 0-100,
  "corrected": "versão corrigida",
  "natural_version": "como nativo diria",
  "register": "formal|informal|neutral",
  "errors": [{ "type": "grammar", "severity": "minor|moderate|major", "original": "errado", "corrected": "certo", "explanation": "regra pt", "rule": "regra 1 frase" }],
  "vocabulary_suggestions": [{ "used": "usada", "better": "melhor", "why": "por que" }],
  "strengths": ["ponto positivo"],
  "alternatives": ["alternativa 1", "alternativa 2"],
  "level_assessment": "avaliação honesta",
  "study_tip": "o que estudar"
}`, { thinkingLevel: 'none', maxOutputTokens: 1500 });
}

export async function translateToEnglish(text, userLevel) {
  return askJSON(`Professor inglês e tradutor. Nível: ${userLevel}. Português: "${text}"
JSON:
{
  "main_translation": "tradução principal",
  "literal_translation": "tradução literal",
  "formal_version": "versão formal",
  "informal_version": "versão informal",
  "translation_notes": "notas 2-4 frases pt",
  "false_friends_warning": null,
  "key_vocabulary": [{ "word": "palavra", "phonetic": "/IPA/", "meaning": "pt", "usage_note": "uso", "collocations": ["col"] }],
  "example_sentences": [{ "english": "ex", "portuguese": "pt" }, { "english": "ex prof", "portuguese": "pt" }, { "english": "ex informal", "portuguese": "pt" }],
  "cultural_tip": null,
  "grammar_highlight": "estrutura interessante"
}`, { thinkingLevel: 'none', maxOutputTokens: 1500 });
}

export async function generateLevelAssessmentMessage(fromLevel, toLevel, stats) {
  const names = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' };
  return ask(`Professor inglês. Aluno subiu de ${names[fromLevel]} para ${names[toLevel]}. Stats: vocab=${stats.vocab}, quiz=${stats.quiz}%, pronúncia=${stats.pronunciation}%, streak=${stats.streak}d, lições=${stats.lessons}. Parabéns genuíno em pt (6-8 frases) com números reais e frases em inglês que o aluno agora usa.`,
  { thinkingLevel: 'none', maxOutputTokens: 500 });
}

export async function generateWeeklyReviewMessage(stats) {
  return ask(`Professor inglês — revisão semanal. lições=${stats.lessons}/7, streak=${stats.streak}d, quiz=${stats.quiz ?? 'N/A'}%, pronúncia=${stats.pronunciation ?? 'N/A'}%, XP=${stats.xp ?? 0}. Revisão honesta em pt (6-8 frases) com dados reais, pontos fortes, 1-2 melhorias, 1 sugestão prática, frase motivacional em inglês com tradução.`,
  { thinkingLevel: 'none', maxOutputTokens: 500 });
}

export default { generateDayLesson, evaluatePronunciationAudio, evaluatePronunciationText, correctEnglish, translateToEnglish, generateLevelAssessmentMessage, generateWeeklyReviewMessage };
