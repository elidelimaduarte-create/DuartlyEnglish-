import axios from 'axios';
import { evaluatePronunciationAudio, evaluatePronunciationText } from '../../services/gemini.js';
import supabase from '../../services/supabase.js';
import { checkLevelPromotion } from '../../services/levelProgression.js';

export async function startPronunciationPractice(ctx, word, phonetic) {
  ctx.session.state = 'pronunciation';
  ctx.session.pronunciationWord    = word;
  ctx.session.pronunciationPhonetic = phonetic;
  await ctx.reply(
    `🎙 *Prática de Pronúncia*\n\nPalavra: *${word}*\nFonética: \`${phonetic}\`\n\n` +
    `Envie um *áudio* (segure o microfone) pronunciando a palavra.\n\nOu escreva como acha que soa em português (ex: para _"world"_ → "uorld").`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⏭ Pular', callback_data: 'pronunciation:skip' }]] } }
  );
}

export async function handleVoiceMessage(ctx) {
  if (ctx.session?.state !== 'pronunciation') {
    return ctx.reply('🎙 Para praticar pronúncia, complete uma lição com /licao e o bot vai te pedir para praticar as palavras novas!');
  }
  const { pronunciationWord, pronunciationPhonetic } = ctx.session;
  const msg = await ctx.reply('🎧 Analisando sua pronúncia...');
  try {
    const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    const res = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
    const result = await evaluatePronunciationAudio(
      Buffer.from(res.data), pronunciationWord, pronunciationPhonetic, ctx.user.level
    );
    await ctx.deleteMessage(msg.message_id).catch(() => {});
    await sendPronunciationResult(ctx, result, pronunciationWord, pronunciationPhonetic, 'audio', ctx.message.voice.file_id);
  } catch (err) {
    console.error('[VOICE]', err.message);
    await ctx.deleteMessage(msg.message_id).catch(() => {});
    await ctx.reply(`⚠️ Não consegui processar o áudio.\n\nTente o modo texto: escreva como você pronunciaria *${pronunciationWord}*:`, { parse_mode: 'Markdown' });
  }
}

export async function handlePronunciationText(ctx, userText) {
  const { pronunciationWord, pronunciationPhonetic } = ctx.session;
  const msg = await ctx.reply('🔍 Analisando...');
  try {
    const result = await evaluatePronunciationText(userText, pronunciationWord, pronunciationPhonetic, ctx.user.level);
    await ctx.deleteMessage(msg.message_id).catch(() => {});
    await sendPronunciationResult(ctx, result, pronunciationWord, pronunciationPhonetic, 'text', null, userText);
  } catch (err) {
    console.error('[PRON TEXT]', err.message);
    await ctx.reply('❌ Erro na avaliação. Tente novamente.');
  }
}

async function sendPronunciationResult(ctx, result, word, phonetic, inputType, fileId, userInput) {
  const score = result.score || 0;
  const emoji = score >= 85 ? '🌟' : score >= 70 ? '✅' : score >= 50 ? '📈' : '💪';
  const bar = '🟩'.repeat(Math.round(score/10)) + '⬜'.repeat(10 - Math.round(score/10));

  let text = `${emoji} *Pronúncia: ${word}*\n\n${bar} *${score}/100*\n\n`;
  if (inputType === 'audio' && result.heard) text += `🎧 *Ouvi:* _${result.heard}_\n\n`;
  text += `📝 ${result.overall_assessment || result.analysis || ''}\n`;
  if (result.correct_breakdown) text += `\n🔤 *Como pronunciar:*\n${result.correct_breakdown}\n`;
  if (result.hardest_sound) {
    text += `\n⚠️ *Som mais difícil:* \`${result.hardest_sound.phoneme}\`\n`;
    text += `${result.hardest_sound.why_hard_for_brazilians}\n`;
    text += `_${result.hardest_sound.how_to_produce}_\n`;
  }
  if (result.phoneme_analysis?.length) {
    const problems = result.phoneme_analysis.filter(p => p.quality !== 'correto');
    if (problems.length) {
      text += `\n⚠️ *Para melhorar:*\n`;
      problems.forEach(p => text += `• \`${p.phoneme}\` — ${p.tip}\n`);
    }
  }
  if (result.brazilian_interference) text += `\n🇧🇷 _${result.brazilian_interference}_\n`;
  if (result.exercises?.length) {
    text += `\n🏋️ *Exercícios:*\n`;
    result.exercises.forEach((e, i) => text += `${i+1}. ${e}\n`);
  }
  text += `\n💬 _${result.encouragement || result.mnemonic || 'Continue praticando!'}_`;

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [
      [{ text: '🔄 Tentar de novo', callback_data: `pronunciation:retry:${word}:${encodeURIComponent(phonetic)}` }],
      [{ text: '➡️ Continuar', callback_data: 'pronunciation:done' }],
    ]},
  });

  try { await supabase.from('pronunciation_evals').insert({
    user_id: ctx.user.id, word, phonetic, input_type: inputType,
    user_input: userInput, audio_file_id: fileId,
    score, feedback: result.overall_assessment || result.analysis, errors: result.phoneme_analysis || [],
  }); } catch {}

  const newCount = (ctx.user.pronunciation_evals_count || 0) + 1;
  const prevAvg  = ctx.user.avg_pronunciation_score || 0;
  const newAvg   = Math.round(prevAvg * 0.85 + score * 0.15);
  try { await supabase.from('users').update({
    avg_pronunciation_score: newAvg, pronunciation_evals_count: newCount,
  }).eq('id', ctx.user.id); } catch {}
  ctx.user.avg_pronunciation_score  = newAvg;
  ctx.user.pronunciation_evals_count = newCount;

  checkLevelPromotion(ctx.user).then(async r => {
    if (r?.promoted) {
      await ctx.reply(`🎉 *VOCÊ SUBIU DE NÍVEL!*\n\n${r.message}`, { parse_mode: 'Markdown' });
      ctx.user.level = r.toLevel;
    }
  }).catch(() => {});
}

export function isPronunciationState(session) {
  return session?.state === 'pronunciation';
}
