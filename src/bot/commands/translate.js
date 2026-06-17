import { translateToEnglish } from '../../services/gemini.js';
import supabase from '../../services/supabase.js';
import { updateUser } from '../../services/supabase.js';

export async function translateCommand(ctx) {
  const text = ctx.message.text.replace(/^\/\w+\s*/, '').trim();
  if (!text) return ctx.reply('📝 Uso: `/traducao Eu gostaria de agendar uma reunião`\n\nOu mande qualquer frase em português diretamente!', { parse_mode: 'Markdown' });
  await ctx.sendChatAction('typing');
  try {
    const r = await translateToEnglish(text, ctx.user?.level || 'intermediate');
    let reply = `🇺🇸 *Tradução PT→EN*\n\n_${text}_\n\n`;
    reply += `*→ ${r.main_translation}*\n`;
    if (r.formal_version)   reply += `\n🎩 *Formal:* ${r.formal_version}\n`;
    if (r.informal_version) reply += `💬 *Informal:* ${r.informal_version}\n`;
    reply += `\n📝 ${r.translation_notes}\n`;
    if (r.false_friends_warning) reply += `\n⚠️ *Atenção:* ${r.false_friends_warning}\n`;
    if (r.key_vocabulary?.length) {
      reply += `\n🔑 *Vocabulário-chave:*\n`;
      r.key_vocabulary.forEach(v => reply += `• *${v.word}* \`${v.phonetic}\` — ${v.meaning}\n  _${v.usage_note}_\n`);
    }
    if (r.example_sentences?.length) {
      reply += `\n💬 *Exemplos:*\n`;
      r.example_sentences.forEach(e => reply += `• ${e.english}\n  → _${e.portuguese}_\n`);
    }
    if (r.cultural_tip) reply += `\n🌍 *Dica cultural:* ${r.cultural_tip}\n`;
    if (r.grammar_highlight) reply += `\n📖 *Gramática:* ${r.grammar_highlight}`;
    await ctx.reply(reply, { parse_mode: 'Markdown' });
    try {
      await supabase.from('translations').insert({
        user_id: ctx.user.id, portuguese_text: text,
        english_translation: r.main_translation, explanation: r.translation_notes,
        examples: r.example_sentences, vocabulary_highlights: r.key_vocabulary,
      });
    } catch {}
    try { await updateUser(ctx.from.id, { xp: (ctx.user.xp || 0) + 5 }); } catch {}
  } catch (err) {
    console.error('[TRANSLATE]', err.message);
    await ctx.reply('❌ Erro ao traduzir. Tente novamente.');
  }
}
