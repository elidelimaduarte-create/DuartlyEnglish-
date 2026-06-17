import supabase from './supabase.js';
import { generateLevelAssessmentMessage } from './gemini.js';

const CRITERIA = {
  beginner: {
    to: 'intermediate',
    vocab_mastered: 25, avg_quiz: 75, avg_pronunciation: 65,
    min_pronunciation_evals: 5, streak: 7, lessons_completed: 14,
  },
  intermediate: {
    to: 'advanced',
    vocab_mastered: 80, avg_quiz: 85, avg_pronunciation: 75,
    min_pronunciation_evals: 10, streak: 14, lessons_completed: 45,
  },
  advanced: null,
};

export async function checkLevelPromotion(user) {
  if (!user || user.level === 'advanced') return null;
  const criteria = CRITERIA[user.level];
  if (!criteria) return null;

  const [quizAvg, pronAvg, masteredCount] = await Promise.all([
    supabase.rpc('get_recent_quiz_avg', { p_user_id: user.id }).then(r => r.data || 0),
    supabase.rpc('get_recent_pronunciation_avg', { p_user_id: user.id }).then(r => r.data || 0),
    supabase.rpc('get_mastered_vocab_count', { p_user_id: user.id }).then(r => r.data || 0),
  ]);

  const stats = {
    vocab: masteredCount,
    quiz: Math.round(quizAvg),
    pronunciation: Math.round(pronAvg),
    streak: user.streak,
    lessons: user.total_lessons_completed,
    pronunciation_evals: user.pronunciation_evals_count || 0,
  };

  const checks = {
    vocab: stats.vocab >= criteria.vocab_mastered,
    quiz: stats.quiz >= criteria.avg_quiz,
    streak: stats.streak >= criteria.streak,
    lessons: stats.lessons >= criteria.lessons_completed,
    pronunciation: stats.pronunciation_evals < criteria.min_pronunciation_evals
      ? true : stats.pronunciation >= criteria.avg_pronunciation,
  };

  if (!Object.values(checks).every(Boolean)) {
    return { promoted: false, progress: buildReport(criteria, stats, checks) };
  }

  await supabase.from('level_history').insert({
    user_id: user.id, from_level: user.level, to_level: criteria.to, reason: stats,
  });
  await supabase.from('users')
    .update({ level: criteria.to, level_promoted_at: new Date().toISOString() })
    .eq('id', user.id);

  const message = await generateLevelAssessmentMessage(user.level, criteria.to, stats);
  return { promoted: true, fromLevel: user.level, toLevel: criteria.to, stats, message };
}

export async function getLevelProgressReport(user) {
  if (user.level === 'advanced') return { isMax: true };
  const criteria = CRITERIA[user.level];
  if (!criteria) return null;

  const [quizAvg, pronAvg, masteredCount] = await Promise.all([
    supabase.rpc('get_recent_quiz_avg', { p_user_id: user.id }).then(r => r.data || 0),
    supabase.rpc('get_recent_pronunciation_avg', { p_user_id: user.id }).then(r => r.data || 0),
    supabase.rpc('get_mastered_vocab_count', { p_user_id: user.id }).then(r => r.data || 0),
  ]);

  const stats = {
    vocab: masteredCount, quiz: Math.round(quizAvg),
    pronunciation: Math.round(pronAvg), streak: user.streak,
    lessons: user.total_lessons_completed,
    pronunciation_evals: user.pronunciation_evals_count || 0,
  };

  const checks = {
    vocab: stats.vocab >= criteria.vocab_mastered,
    quiz: stats.quiz >= criteria.avg_quiz,
    streak: stats.streak >= criteria.streak,
    lessons: stats.lessons >= criteria.lessons_completed,
    pronunciation: stats.pronunciation_evals < criteria.min_pronunciation_evals
      ? true : stats.pronunciation >= criteria.avg_pronunciation,
  };

  return {
    isMax: false, currentLevel: user.level, nextLevel: criteria.to,
    stats, checks, items: buildReport(criteria, stats, checks),
    allPassed: Object.values(checks).every(Boolean),
  };
}

function buildReport(criteria, stats, checks) {
  return [
    { label: '📖 Vocab dominado',     current: stats.vocab,        target: criteria.vocab_mastered,   ok: checks.vocab },
    { label: '📝 Quiz médio (14d)',   current: `${stats.quiz}%`,   target: `${criteria.avg_quiz}%`,   ok: checks.quiz },
    { label: '🎙 Pronúncia (14d)',    current: `${stats.pronunciation}%`, target: `${criteria.avg_pronunciation}%`, ok: checks.pronunciation },
    { label: '🔥 Streak',             current: `${stats.streak}d`, target: `${criteria.streak}d`,     ok: checks.streak },
    { label: '📚 Lições completas',   current: stats.lessons,      target: criteria.lessons_completed, ok: checks.lessons },
  ];
}
