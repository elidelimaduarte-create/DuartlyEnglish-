import { correctEnglish } from '../../services/gemini.js';
import supabase from '../../services/supabase.js';
import { updateUser } from '../../services/supabase.js';

export async function correctCommand(ctx) {
  const text = ctx.message.text.replace(/^\/\w+\s*/, '').trim();
  if (!text) return ctx.reply('✏️ Uso: `/corrigir I want to learning english`\n\nOu mande qualquer frase em inglês diretamente!', { parse_mode: 'Markdown' });
  await ctx.sendChatAction('typing');
  try {
    const r = await correctEnglish(text, ctx.user?.level || 'intermediate');
    let reply = `✏️ *Correção*\n\n_${text}_\n\n`;
    if (r.is_correct) {
      reply += `✅ *Correto!* (${r.score}/100)\n`;
    } else {
      reply += `📝 *→ ${r.corrected}*\n`;
      if (r.natural_version && r.natural_version !== r.corrected) reply += `💡 *Mais natural:* ${r.natural_version}\n`;
      if (r.errors?.length) {
        reply += `\n❌ *Erros:*\n`;
        r.errors.forEach((e, i) => {
          const sev = { minor: '🟡', moderate: '🟠', major: '🔴' }[e.severity] || '•';
          reply += `\n${sev} ${i+1}. ~~${e.original}~~ → *${e.corrected}*\n   _${e.explanation}_\n   📖 _${e.rule}_\n`;
        });
      }
    }
    if (r.vocabulary_suggestions?.length) {
      reply += `\n📚 *Vocabulário:*\n`;
      r.vocabulary_suggestions.forEach(v => reply += `• ~~${v.used}~~ → *${v.better}* — _${v.why}_\n`);
    }
    if (r.strengths?.length) reply += `\n✅ ${r.strengths[0]}\n`;
    if (r.alternatives?.length) reply += `\n💬 *Outras formas:*\n${r.alternatives.map(a => `• ${a}`).join('\n')}\n`;
    reply += `\n_${r.level_assessment}_`;
    if (r.study_tip) reply += `\n\n📖 *Estude:* ${r.study_tip}`;
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
    console.error('[CORRECT]', err.message);
    await ctx.reply('❌ Erro ao corrigir. Tente novamente.');
  }
}
