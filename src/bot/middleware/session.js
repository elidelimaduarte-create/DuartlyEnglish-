import { getOrCreateUser } from '../../services/supabase.js';

export async function sessionMiddleware(ctx, next) {
  if (!ctx.from) return next();
  try {
    ctx.user = await getOrCreateUser({
      telegram_id: ctx.from.id,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
    });
    if (!ctx.session) ctx.session = {};
    ctx.session.state       = ctx.session.state       || 'idle';
    ctx.session.lessonPlan  = ctx.session.lessonPlan  || null;
    ctx.session.lessonDate  = ctx.session.lessonDate  || null;
    ctx.session.quizAnswers = ctx.session.quizAnswers || [];
    ctx.session.currentCard = ctx.session.currentCard || null;
    ctx.session.pronunciationQueue    = ctx.session.pronunciationQueue    || [];
    ctx.session.pronunciationQueueIdx = ctx.session.pronunciationQueueIdx || 0;
  } catch (err) {
    console.error('[SESSION]', err.message);
  }
  return next();
}
