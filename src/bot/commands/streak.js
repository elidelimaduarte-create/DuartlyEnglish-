import { getUserVocabStats } from '../../services/supabase.js';
import supabase from '../../services/supabase.js';

export async function streakCommand(ctx) {
  const { user } = ctx;
  if (!user) return ctx.reply('Use /start primeiro!');
  const vocab = await getUserVocabStats(user.id);
  const { data: achievements } = await supabase
    .from('achievements').select('title, icon').eq('user_id', user.id)
    .order('unlocked_at', { ascending: false }).limit(3);

  const sEmoji = user.streak >= 30 ? '💎' : user.streak >= 7 ? '⚡' : user.streak >= 3 ? '🔥' : '📅';
  const lvlName  = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' };
  const lvlEmoji = { beginner: '🟢', intermediate: '🟡', advanced: '🔵' };
  const today = new Date().toISOString().split('T')[0];

  let text = `📊 *Seu Progresso*\n\n`;
  text += `${sEmoji} *Streak:* ${user.streak} dias  ·  🏅 *Recorde:* ${user.longest_streak}\n`;
  text += `⭐ *XP:* ${user.xp}  ·  ${lvlEmoji[user.level]} *${lvlName[user.level]}*\n`;
  text += `📚 *Lições:* ${user.total_lessons_completed}\n\n`;
  text += `🃏 *Vocabulário:*\n`;
  text += `• Total: ${vocab.total} · Dominadas: ${vocab.mastered} ✅ · Aprendendo: ${vocab.learning} 📈\n`;
  if (achievements?.length) {
    text += `\n🏆 *Últimas conquistas:*\n`;
    achievements.forEach(a => text += `${a.icon} ${a.title}\n`);
  }
  text += user.last_study_date === today
    ? `\n✅ _Você já estudou hoje!_`
    : `\n⏰ _Você ainda não estudou hoje. Use /licao!_`;

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [
      [{ text: '📈 Progresso de nível', callback_data: 'show:level_progress' }],
      [{ text: '🃏 Revisar flashcards', callback_data: 'vocab:start' }],
    ]},
  });
}
