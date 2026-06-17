import { handleLevelSelection } from '../commands/start.js';
import { sendLessonStep, sendQuizQuestion, finishLesson } from '../commands/lesson.js';
import { sendNextFlashcard, handleFlashcardReview, revealFlashcard } from '../commands/vocab.js';
import { startPronunciationPractice } from '../commands/pronunciation.js';
import { getLevelProgressReport } from '../../services/levelProgression.js';

export async function handleCallbackQuery(ctx) {
  const data = ctx.callbackQuery.data;
  await ctx.answerCbQuery().catch(() => {});

  if (data.startsWith('set_level:')) return handleLevelSelection(ctx, data.split(':')[1]);

  if (data.startsWith('lesson:step:')) {
    const step = parseInt(data.split(':')[2]);
    ctx.session.lessonStep = step;
    return sendLessonStep(ctx, step);
  }

  if (data.startsWith('lesson:quiz:')) {
    const [,,idx, answer] = data.split(':');
    const questions = ctx.session.lessonPlan?.dayPlan?.reading?.quiz || [];
    const q = questions[parseInt(idx)];
    if (!q) return ctx.reply('Sessão expirada. Use /licao.');
    if (!ctx.session.quizAnswers) ctx.session.quizAnswers = [];
    ctx.session.quizAnswers[parseInt(idx)] = answer;
    const isOk = answer === q.answer;
    await ctx.editMessageText(
      `${isOk ? '✅' : '❌'} *${isOk ? 'Correto!' : `Errado — resposta: *${q.answer}*`}*\n\n${q.question}\n\n` +
      q.options.map(opt => `${opt[0] === q.answer ? '✅' : opt[0] === answer && !isOk ? '❌' : '▫️'} ${opt}`).join('\n'),
      { parse_mode: 'Markdown' }
    ).catch(() => {});
    const next = parseInt(idx) + 1;
    if (next < questions.length) return sendQuizQuestion(ctx, questions, next);
    return finishLesson(ctx);
  }

  if (data === 'vocab:start')              return sendNextFlashcard(ctx);
  if (data === 'vocab:skip')               return sendNextFlashcard(ctx);
  if (data.startsWith('vocab:reveal:'))    return revealFlashcard(ctx, data.split(':')[2]);
  if (data.startsWith('vocab:review:')) {
    const [,,cardId, quality] = data.split(':');
    return handleFlashcardReview(ctx, cardId, parseInt(quality));
  }

  if (data === 'pronunciation:start_queue') {
    const queue = ctx.session.pronunciationQueue;
    if (!queue?.length) return ctx.reply('Nenhuma palavra na fila. Complete uma lição primeiro!');
    ctx.session.pronunciationQueueIdx = 0;
    return startPronunciationPractice(ctx, queue[0].word, queue[0].phonetic);
  }
  if (data === 'pronunciation:done') {
    const queue = ctx.session.pronunciationQueue || [];
    const next = (ctx.session.pronunciationQueueIdx || 0) + 1;
    ctx.session.pronunciationQueueIdx = next;
    if (next < queue.length) return startPronunciationPractice(ctx, queue[next].word, queue[next].phonetic);
    ctx.session.state = 'idle';
    return ctx.reply('🎙 Pronúncia concluída! Bom trabalho.');
  }
  if (data === 'pronunciation:skip') {
    ctx.session.state = 'idle';
    return ctx.reply('⏭ Pulado. Pratique quando quiser com /licao.');
  }
  if (data.startsWith('pronunciation:retry:')) {
    const [,, , word, phonetic] = data.split(':');
    return startPronunciationPractice(ctx, word, decodeURIComponent(phonetic || ''));
  }

  if (data === 'show:level_progress') {
    const report = await getLevelProgressReport(ctx.user);
    if (!report) return ctx.reply('Erro ao buscar progresso.');
    if (report.isMax) return ctx.reply('🏆 Você está no nível máximo — Avançado!');
    const lvlNames  = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' };
    const lvlEmojis = { beginner: '🟢', intermediate: '🟡', advanced: '🔵' };
    let text = `📈 *${lvlEmojis[report.currentLevel]} ${lvlNames[report.currentLevel]} → ${lvlEmojis[report.nextLevel]} ${lvlNames[report.nextLevel]}*\n\n`;
    report.items.forEach(i => { text += `${i.ok ? '✅' : '⬜'} ${i.label}: ${i.current} / ${i.target}\n`; });
    const done = report.items.filter(i => i.ok).length;
    text += `\n${done}/${report.items.length} critérios atingidos`;
    if (!report.allPassed) {
      const next = report.items.find(i => !i.ok);
      if (next) text += `\n\n💡 *Foco agora:* ${next.label}`;
    }
    return ctx.reply(text, { parse_mode: 'Markdown' });
  }

  if (data === 'show:streak') {
    const { streakCommand } = await import('../commands/streak.js');
    return streakCommand(ctx);
  }
}
