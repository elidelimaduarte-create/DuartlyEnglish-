import { translateToEnglish, correctEnglish } from '../../services/gemini.js';
import { handlePronunciationText, isPronunciationState } from '../commands/pronunciation.js';
import { updateUser } from '../../services/supabase.js';
import supabase from '../../services/supabase.js';

const PT_MARKERS = ['de','do','da','que','em','um','uma','para','com','não','por','como','mais','mas','seu','sua','isso','ele','ela','eu','você','nós','são','está','esse','essa','meu','minha','foi','ser','ter','fazer','muito','bem','aqui','já','ainda','quando','onde','porque','então','também'];

function looksPortuguese(text) {
  const words = text.toLowerCase().split(/\s+/);
  const hits = words.filter(w => PT_MARKERS.includes(w)).length;
  return (hits / words.length) > 0.12 || /[ãõâêôáéíóúàç]/i.test(text);
}

export async function handleTextMessage(ctx) {
  const text = ctx.message.text?.trim();
  if (!text || text.startsWith('/')) return;
  if (!ctx.user?.onboarding_completed) return ctx.reply('Use /start para começar! 😊');
  if (ctx.session?.state === 'lesson') return ctx.reply('📚 Você está em uma lição. Use os botões para continuar.');
  if (isPronunciationState(ctx.session)) return handlePronunciationText(ctx, text);
  if (looksPortuguese(text)) return handleTranslation(ctx, text);
  return handleCorrection(ctx, text);
}

async function handleTranslation(ctx, text) {
  if (text.length > 500) return ctx.reply('⚠️ Limite de 500 caracteres.');
  await ctx.sendChatAction('typing');
  try {
    const r = await translateToEnglish(text, ctx.user.level);
    let reply = `🇺🇸 *Tradução*\n\n_${text}_\n\n*→ ${r.main_translation}*\n`;
    if (r.formal_version)   reply += `\n🎩 *Formal:* ${r.formal_version}`;
    if (r.informal_version) reply += `\n💬 *Informal:* ${r.informal_version}`;
    reply += `\n\n${r.translation_notes}`;
    if (r.false_friends_warning) reply += `\n\n⚠️ ${r.false_friends_warning}`;
    if (r.key_vocabulary?.length) {
      reply += `\n\n🔑 `;
      reply += r.key_vocabulary.map(v => `*${v.word}* \`${v.phonetic}\``).join(' · ');
    }
    if (r.cultural_tip) reply += `\n\n🌍 ${r.cultural_tip}`;
    await ctx.reply(reply, { parse_mode: 'Markdown' });
    try {
      await supabase.from('translations').insert({
        user_id: ctx.user.id, portuguese_text: text,
        english_translation: r.main_translation, explanation: r.translation_notes,
      });
    } catch {}
    try { await updateUser(ctx.from.id, { xp: (ctx.user.xp || 0) + 5 }); } catch {}
  } catch (err) {
    console.error('[TEXT TRANSLATE]', err.message);
    await ctx.reply('❌ Erro ao traduzir. Tente novamente.');
  }
}

async function handleCorrection(ctx, text) {
  if (text.length > 500) return ctx.reply('⚠️ Limite de 500 caracteres.');
  await ctx.sendChatAction('typing');
  try {
    const r = await correctEnglish(text, ctx.user.level);
    let reply = `✏️ *Correção*\n\n_${text}_\n\n`;
    if (r.is_correct) {
      reply += `✅ *Correto!*\n`;
      if (r.natural_version && r.natural_version !== text) reply += `💡 *Mais natural:* ${r.natural_version}\n`;
    } else {
      reply += `📝 *→ ${r.corrected}*\n`;
      if (r.errors?.length) {
        r.errors.slice(0, 3).forEach((e, i) => {
          reply += `\n${i+1}. ~~${e.original}~~ → *${e.corrected}*\n   _${e.explanation}_\n`;
        });
      }
    }
    if (r.strengths?.length) reply += `\n✅ ${r.strengths[0]}`;
    await ctx.reply(reply, { parse_mode: 'Markdown' });
    const xp = r.is_correct ? 15 : 10;
    try {
      await supabase.from('corrections').insert({
        user_id: ctx.user.id, original_text: text,
        corrected_text: r.corrected, errors_found: r.errors,
        is_correct: r.is_correct, xp_earned: xp,
      });
    } catch {}
    try { await updateUser(ctx.from.id, { xp: (ctx.user.xp || 0) + xp }); } catch {}
  } catch (err) {
    console.error('[TEXT CORRECT]', err.message);
    await ctx.reply('❌ Erro ao corrigir. Tente novamente.');
  }
}
