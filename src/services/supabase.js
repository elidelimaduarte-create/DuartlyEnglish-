import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function getOrCreateUser(telegramUser) {
  const { telegram_id, username, first_name } = telegramUser;
  const { data: existing } = await supabase
    .from('users').select('*').eq('telegram_id', telegram_id).single();
  if (existing) return existing;
  const { data: newUser, error } = await supabase
    .from('users').insert({ telegram_id, username, first_name }).select().single();
  if (error) throw new Error(`Erro ao criar usuário: ${error.message}`);
  return newUser;
}

export async function getUserByTelegramId(telegramId) {
  const { data } = await supabase
    .from('users').select('*').eq('telegram_id', telegramId).single();
  return data || null;
}

export async function updateUser(telegramId, updates) {
  const { data, error } = await supabase
    .from('users').update(updates).eq('telegram_id', telegramId).select().single();
  if (error) throw new Error(`Erro ao atualizar: ${error.message}`);
  return data;
}

export async function updateStreak(telegramId) {
  const user = await getUserByTelegramId(telegramId);
  if (!user) return null;
  const today = new Date().toISOString().split('T')[0];
  const last = user.last_study_date;
  let newStreak = user.streak;
  if (!last) {
    newStreak = 1;
  } else {
    const diff = Math.floor((new Date(today) - new Date(last)) / 86400000);
    if (diff === 1) newStreak = user.streak + 1;
    else if (diff === 0) return user;
    else newStreak = 1;
  }
  return updateUser(telegramId, {
    streak: newStreak,
    longest_streak: Math.max(newStreak, user.longest_streak),
    last_study_date: today,
  });
}

export async function addVocabCard(userId, cardData) {
  const { data, error } = await supabase
    .from('vocab_cards').insert({ user_id: userId, ...cardData }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getCardsDueForReview(userId, limit = 10) {
  const { data } = await supabase
    .from('vocab_cards').select('*')
    .eq('user_id', userId).eq('is_mastered', false)
    .lte('next_review', new Date().toISOString())
    .order('next_review', { ascending: true }).limit(limit);
  return data || [];
}

export async function updateCardAfterReview(cardId, userId, quality) {
  const { data: card } = await supabase
    .from('vocab_cards').select('*').eq('id', cardId).single();
  if (!card) throw new Error('Card não encontrado');
  let { interval, ease_factor, repetitions } = card;
  if (quality >= 3) {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * ease_factor);
    ease_factor = Math.max(1.3, ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    repetitions += 1;
  } else {
    interval = 1;
    repetitions = 0;
  }
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);
  const isMastered = repetitions >= 5 && ease_factor >= 2.5;
  const isCorrect = quality >= 3;
  const { data: updated } = await supabase
    .from('vocab_cards').update({
      interval, ease_factor, repetitions,
      next_review: nextReview.toISOString(),
      last_reviewed: new Date().toISOString(),
      times_correct: card.times_correct + (isCorrect ? 1 : 0),
      times_wrong: card.times_wrong + (isCorrect ? 0 : 1),
      is_mastered: isMastered,
    }).eq('id', cardId).select().single();
  await supabase.from('srs_reviews').insert({ card_id: cardId, user_id: userId, quality });
  return updated;
}

export async function getUserVocabStats(userId) {
  const { data: cards } = await supabase
    .from('vocab_cards').select('is_mastered').eq('user_id', userId);
  if (!cards) return { total: 0, mastered: 0, learning: 0 };
  const total = cards.length;
  const mastered = cards.filter(c => c.is_mastered).length;
  return { total, mastered, learning: total - mastered };
}

const ACHIEVEMENTS_CONFIG = {
  streak_3:        { title: '🔥 3 dias seguidos!',     description: 'Manteve a sequência por 3 dias',     icon: '🔥', xp_bonus: 30  },
  streak_7:        { title: '⚡ Uma semana!',           description: '7 dias consecutivos',                icon: '⚡', xp_bonus: 100 },
  streak_30:       { title: '💎 Um mês!',               description: '30 dias consecutivos',               icon: '💎', xp_bonus: 500 },
  words_10:        { title: '📖 Primeiras palavras',    description: 'Aprendeu 10 palavras',               icon: '📖', xp_bonus: 20  },
  words_50:        { title: '📚 Vocabulário crescendo', description: 'Aprendeu 50 palavras',               icon: '📚', xp_bonus: 100 },
  words_100:       { title: '🧠 Cem palavras!',         description: 'Aprendeu 100 palavras',              icon: '🧠', xp_bonus: 300 },
  perfect_quiz:    { title: '⭐ Quiz perfeito!',        description: 'Tirou 100% em um quiz',              icon: '⭐', xp_bonus: 50  },
  first_correction:{ title: '✏️ Primeira correção',    description: 'Enviou uma frase para correção',      icon: '✏️', xp_bonus: 10  },
  first_lesson:    { title: '🎓 Primeira lição',        description: 'Completou a primeira lição diária',  icon: '🎓', xp_bonus: 20  },
};

export async function checkAndUnlockAchievements(user) {
  const unlocked = [];
  const toCheck = [];
  if (user.streak >= 3)  toCheck.push('streak_3');
  if (user.streak >= 7)  toCheck.push('streak_7');
  if (user.streak >= 30) toCheck.push('streak_30');
  if (user.total_words_learned >= 10)  toCheck.push('words_10');
  if (user.total_words_learned >= 50)  toCheck.push('words_50');
  if (user.total_words_learned >= 100) toCheck.push('words_100');
  if (user.total_lessons_completed >= 1) toCheck.push('first_lesson');

  for (const type of toCheck) {
    const config = ACHIEVEMENTS_CONFIG[type];
    if (!config) continue;
    const { error } = await supabase.from('achievements').insert({
      user_id: user.id, type,
      title: config.title, description: config.description,
      icon: config.icon, xp_bonus: config.xp_bonus,
    });
    if (!error) {
      unlocked.push({ ...config, type });
      await supabase.from('users')
        .update({ xp: user.xp + config.xp_bonus })
        .eq('telegram_id', user.telegram_id);
    }
  }
  return unlocked;
}

export async function unlockAchievement(userId, telegramId, type) {
  const config = ACHIEVEMENTS_CONFIG[type];
  if (!config) return null;
  const { data, error } = await supabase.from('achievements').insert({
    user_id: userId, type,
    title: config.title, description: config.description,
    icon: config.icon, xp_bonus: config.xp_bonus,
  }).select().single();
  if (error) return null;
  await supabase.from('users')
    .update({ xp: supabase.rpc('increment', { x: config.xp_bonus }) })
    .eq('telegram_id', telegramId);
  return { ...data, ...config };
}

export async function getAllUsersForNotifications() {
  const { data } = await supabase.from('users').select(
    'telegram_id, level, streak, last_study_date, notifications_enabled, onboarding_completed'
  ).eq('notifications_enabled', true).eq('onboarding_completed', true);
  return data || [];
}

export async function getLessonStatus(userId, lessonDate) {
  const { data } = await supabase.from('daily_lessons')
    .select('completed_at, quiz_score, current_step')
    .eq('user_id', userId).eq('lesson_date', lessonDate).single();
  return data;
}

export default supabase;
