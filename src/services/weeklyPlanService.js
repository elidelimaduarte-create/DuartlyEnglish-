import supabase from './supabase.js';
import { generateDayLesson } from './gemini.js';
import { format, addDays } from 'date-fns';

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return format(d, 'yyyy-MM-dd');
}

export async function getTodayLesson(userId) {
  const today = new Date();
  const weekStart = getWeekStart(today);
  const dayOfWeek = today.getDay();
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // Busca plano da semana
  const { data: plan } = await supabase
    .from('weekly_plans').select('*')
    .eq('user_id', userId).eq('week_start', weekStart).single();

  // Verifica se o dia de hoje já foi gerado
  const days = plan?.days || [];
  const todayPlan = days[dayIndex];

  if (todayPlan) {
    return {
      lessonDate: format(today, 'yyyy-MM-dd'),
      dayIndex,
      dayPlan: todayPlan,
      weekTheme: plan.week_theme || 'English for Professionals',
      music: dayOfWeek === 1 ? plan.music : null,
      planId: plan.id,
    };
  }

  // Gera só o dia de hoje
  return generateAndSaveDay(userId, weekStart, dayIndex);
}

async function generateAndSaveDay(userId, weekStart, dayIndex) {
  const { data: user } = await supabase
    .from('users').select('level').eq('id', userId).single();

  const { data: recentCards } = await supabase
    .from('vocab_cards').select('word').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(50);

  const recentWords = recentCards?.map(c => c.word) || [];
  const level = user?.level || 'beginner';

  console.log(`[DAY PLAN] Gerando dia ${dayIndex + 1} para userId=${userId} nível=${level}`);

  const dayContent = await generateDayLesson(level, dayIndex, recentWords);

  // Busca plano existente da semana
  const { data: existing } = await supabase
    .from('weekly_plans').select('*')
    .eq('user_id', userId).eq('week_start', weekStart).single();

  let days = existing?.days || new Array(7).fill(null);
  days[dayIndex] = dayContent;

  const planData = {
    user_id: userId,
    week_start: weekStart,
    level,
    days,
    week_theme: existing?.week_theme || dayContent.week_theme || 'English for Professionals',
    music: existing?.music || (dayIndex === 0 ? dayContent.music : null),
  };

  const { data: saved, error } = await supabase
    .from('weekly_plans')
    .upsert(planData, { onConflict: 'user_id,week_start' })
    .select().single();

  if (error) {
    console.error('[DAY PLAN] Erro ao salvar:', error.message);
    return {
      lessonDate: format(new Date(), 'yyyy-MM-dd'),
      dayIndex,
      dayPlan: dayContent,
      weekTheme: dayContent.week_theme || 'English for Professionals',
      music: dayIndex === 0 ? dayContent.music : null,
      planId: null,
    };
  }

  return {
    lessonDate: format(new Date(), 'yyyy-MM-dd'),
    dayIndex,
    dayPlan: saved.days[dayIndex],
    weekTheme: saved.week_theme,
    music: dayIndex === 0 ? saved.music : null,
    planId: saved.id,
  };
}

export async function preGenerateNextWeekPlan(userId) {
  // Gera apenas segunda-feira da próxima semana (resto gera on-demand)
  const nextMonday = getWeekStart(addDays(new Date(), 7));
  const { data: existing } = await supabase
    .from('weekly_plans').select('id, days')
    .eq('user_id', userId).eq('week_start', nextMonday).single();
  if (existing?.days?.[0]) return existing;
  return generateAndSaveDay(userId, nextMonday, 0);
}

export async function recordLessonCompletion(userId, lessonDate, quizScore, xpEarned) {
  await supabase.from('daily_lessons').upsert({
    user_id: userId,
    lesson_date: lessonDate,
    content: {},
    completed_at: new Date().toISOString(),
    quiz_score: quizScore,
    xp_earned: xpEarned,
  }, { onConflict: 'user_id,lesson_date' });
}

export async function getUserWeeklyStats(userId) {
  const weekStart = getWeekStart();
  const { data: lessons } = await supabase
    .from('daily_lessons').select('quiz_score, xp_earned')
    .eq('user_id', userId).gte('lesson_date', weekStart)
    .not('completed_at', 'is', null);
  return {
    completedDays: lessons?.length || 0,
    avgQuiz: lessons?.length
      ? Math.round(lessons.reduce((s, l) => s + (l.quiz_score || 0), 0) / lessons.length)
      : 0,
    xpThisWeek: lessons?.reduce((s, l) => s + (l.xp_earned || 0), 0) || 0,
  };
}

export { getWeekStart };
