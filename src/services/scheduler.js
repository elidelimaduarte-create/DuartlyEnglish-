import 'dotenv/config';
import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import supabase, { getAllUsersForNotifications, getUserByTelegramId } from './supabase.js';
import { preGenerateNextWeekPlan, getUserWeeklyStats, getWeekStart } from './weeklyPlanService.js';
import { generateWeeklyReviewMessage } from './gemini.js';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const TZ = process.env.TIMEZONE || 'America/Sao_Paulo';

async function send(telegramId, text, opts = {}) {
  return bot.telegram.sendMessage(telegramId, text, { parse_mode: 'Markdown', ...opts })
    .catch(err => console.error(`[SEND ${telegramId}]:`, err.message));
}

// 08h — notifica lição (zero tokens)
cron.schedule('0 8 * * *', async () => {
  console.log('[08h] Notificando lições...');
  const users = await getAllUsersForNotifications();
  const today = new Date().toISOString().split('T')[0];
  const isMonday = new Date().getDay() === 1;

  for (const u of users) {
    const full = await getUserByTelegramId(u.telegram_id);
    if (!full) continue;
    const { data: done } = await supabase.from('daily_lessons')
      .select('id').eq('user_id', full.id).eq('lesson_date', today)
      .not('completed_at', 'is', null).single();
    if (done) continue;

    const extra = isMonday ? '\n🎵 _Música nova da semana te esperando!_' : '';
    await send(u.telegram_id,
      `☀️ *Bom dia! Sua lição de hoje está pronta.*${extra}\n\nUse /licao para começar 📚`,
      { reply_markup: { inline_keyboard: [[{ text: '▶️ Começar lição', callback_data: 'lesson:step:0' }]] } }
    );
    await new Promise(r => setTimeout(r, 150));
  }
}, { timezone: TZ });

// 20h — flashcards SRS (zero tokens)
cron.schedule('0 20 * * *', async () => {
  console.log('[20h] Lembrando flashcards...');
  const users = await getAllUsersForNotifications();
  for (const u of users) {
    const full = await getUserByTelegramId(u.telegram_id);
    if (!full) continue;
    const { count } = await supabase.from('vocab_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', full.id).eq('is_mastered', false)
      .lte('next_review', new Date().toISOString());
    if (!count) continue;
    await send(u.telegram_id,
      `🃏 *${count} flashcard${count > 1 ? 's' : ''} para revisar agora.*\n_A repetição espaçada só funciona no horário certo!_`,
      { reply_markup: { inline_keyboard: [[{ text: '▶️ Revisar', callback_data: 'vocab:start' }]] } }
    );
    await new Promise(r => setTimeout(r, 150));
  }
}, { timezone: TZ });

// 21h — streak protector (zero tokens)
cron.schedule('0 21 * * *', async () => {
  console.log('[21h] Streak protector...');
  const users = await getAllUsersForNotifications();
  const today = new Date().toISOString().split('T')[0];
  for (const u of users) {
    if (u.last_study_date === today || !u.streak || u.streak < 2) continue;
    await send(u.telegram_id,
      `🔥 *Seu streak de ${u.streak} dias está em risco!*\nAinda dá tempo de estudar hoje. ⏰`,
      { reply_markup: { inline_keyboard: [[{ text: '📚 Fazer lição agora', callback_data: 'lesson:step:0' }]] } }
    );
    await new Promise(r => setTimeout(r, 150));
  }
}, { timezone: TZ });

// Domingo 10h — revisão semanal (1 chamada IA/usuário)
cron.schedule('0 10 * * 0', async () => {
  console.log('[Dom 10h] Revisão semanal...');
  const users = await getAllUsersForNotifications();
  for (const u of users) {
    try {
      const full = await getUserByTelegramId(u.telegram_id);
      if (!full) continue;
      const stats = await getUserWeeklyStats(full.id);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: pronEvals } = await supabase.from('pronunciation_evals')
        .select('score').eq('user_id', full.id).gte('evaluated_at', weekAgo);
      const pronAvg = pronEvals?.length
        ? Math.round(pronEvals.reduce((s, e) => s + e.score, 0) / pronEvals.length) : null;

      await supabase.from('weekly_summaries').upsert({
        user_id: full.id, week_start: getWeekStart(),
        lessons_completed: stats.completedDays, streak_days: u.streak,
        avg_quiz_score: stats.avgQuiz, xp_earned: stats.xpThisWeek,
      }, { onConflict: 'user_id,week_start' });

      const message = await generateWeeklyReviewMessage({
        lessons: stats.completedDays, words: stats.completedDays * 5,
        streak: u.streak, quiz: stats.avgQuiz || null,
        pronunciation: pronAvg, xp: stats.xpThisWeek,
      });

      await send(u.telegram_id,
        `📊 *Resumo da Semana*\n\n` +
        `📚 Lições: *${stats.completedDays}/7*\n` +
        `🔥 Streak: *${u.streak} dias*\n` +
        `📝 Quiz: *${stats.avgQuiz || '—'}%*\n` +
        (pronAvg ? `🎙 Pronúncia: *${pronAvg}%*\n` : '') +
        `⭐ XP: *+${stats.xpThisWeek}*\n\n─────────────────\n\n${message}`
      );
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`[WEEKLY] ${u.telegram_id}:`, err.message);
    }
  }
}, { timezone: TZ });

// Domingo 22h — pré-gera plano da próxima semana (1 chamada IA/usuário)
cron.schedule('0 22 * * 0', async () => {
  console.log('[Dom 22h] Pré-gerando planos...');
  const users = await getAllUsersForNotifications();
  for (const u of users) {
    try {
      const full = await getUserByTelegramId(u.telegram_id);
      if (!full) continue;
      await preGenerateNextWeekPlan(full.id);
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`[PRE-GEN] ${u.telegram_id}:`, err.message);
    }
  }
  console.log('[Dom 22h] Planos gerados.');
}, { timezone: TZ });

console.log(`✅ Scheduler ativo [${TZ}]
  08h — Notificação de lição
  20h — Lembrete SRS
  21h — Streak protector
  Dom 10h — Revisão semanal
  Dom 22h — Pré-geração do plano`);
