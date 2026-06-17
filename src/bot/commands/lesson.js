import { getTodayLesson, recordLessonCompletion } from '../../services/weeklyPlanService.js';
import { getLessonStatus, addVocabCard, updateUser, updateStreak, checkAndUnlockAchievements } from '../../services/supabase.js';
import { checkLevelPromotion } from '../../services/levelProgression.js';
import { startPronunciationPractice } from './pronunciation.js';
import supabase from '../../services/supabase.js';

export async function lessonCommand(ctx) {
  if (!ctx.user?.onboarding_completed) return ctx.reply('Use /start primeiro! 😊');

  const today = new Date().toISOString().split('T')[0];
  const status = await getLessonStatus(ctx.user.id, today);

  if (status?.completed_at) {
    return ctx.reply(
      `✅ *Lição de hoje concluída!*\n\n📊 Quiz: *${status.quiz_score || 0}%*\n\nPratique mais:\n/vocab — Flashcards SRS\n/traducao — Traduzir frases\n/corrigir — Corrigir seu inglês`,
      { parse_mode: 'Markdown' }
    );
  }

  const loadMsg = await ctx.reply('📚 Carregando sua lição...');
  try {
    const todayLesson = await getTodayLesson(ctx.user.id);
    if (!todayLesson?.dayPlan) {
      await ctx.deleteMessage(loadMsg.message_id).catch(() => {});
      return ctx.reply('⚠️ Não encontrei a lição de hoje. Tente novamente em instantes.');
    }
    ctx.session.lessonDate  = today;
    ctx.session.lessonPlan  = todayLesson;
    ctx.session.lessonStep  = status?.current_step || 0;
    ctx.session.quizAnswers = [];
    ctx.session.state       = 'lesson';
    await ctx.deleteMessage(loadMsg.message_id).catch(() => {});
    await sendLessonIntro(ctx, todayLesson);
  } catch (err) {
    console.error('[LESSON]', err.message);
    await ctx.deleteMessage(loadMsg.message_id).catch(() => {});
    await ctx.reply('❌ Erro ao carregar lição. Tente novamente.');
  }
}

async function sendLessonIntro(ctx, todayLesson) {
  const { dayPlan, weekTheme, music } = todayLesson;
  const days = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
  const dayName = days[todayLesson.dayIndex] || 'Hoje';
  let text = `📚 *${dayName} — ${dayPlan.emoji} ${dayPlan.theme}*\n_Semana: ${weekTheme}_\n\n`;
  text += `1️⃣ Vocabulário (${dayPlan.vocab?.length || 5} palavras)\n`;
  text += `2️⃣ Gramática — ${dayPlan.grammar?.topic}\n`;
  text += `3️⃣ Contexto e diálogo\n`;
  text += `4️⃣ Leitura — ${dayPlan.reading?.title}\n`;
  text += `5️⃣ Quiz de compreensão\n`;
  if (music) text += `🎵 Música da semana!\n`;
  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '▶️ Começar', callback_data: 'lesson:step:0' }]] },
  });
}

export async function sendLessonStep(ctx, step) {
  const plan = ctx.session.lessonPlan?.dayPlan;
  if (!plan) return ctx.reply('Sessão expirada. Use /licao para reiniciar.');
  try { await supabase.from('daily_lessons').upsert({
    user_id: ctx.user.id, lesson_date: ctx.session.lessonDate,
    content: {}, current_step: step, started_at: new Date().toISOString(),
  }, { onConflict: 'user_id,lesson_date' }); } catch {}
  switch (step) {
    case 0: return sendVocab(ctx, plan.vocab);
    case 1: return sendGrammar(ctx, plan.grammar);
    case 2: return sendContext(ctx, plan.context);
    case 3: return sendReading(ctx, plan.reading);
    case 4: return sendQuizQuestion(ctx, plan.reading.quiz, 0);
  }
}

async function sendVocab(ctx, vocab) {
  let text = `1️⃣ *VOCABULÁRIO DO DIA*\n\n`;
  vocab.forEach((v, i) => {
    text += `*${i+1}. ${v.word}* \`${v.phonetic}\`  _(${v.part_of_speech})_\n`;
    text += `   📖 ${v.translation}`;
    if (v.register && v.register !== 'neutral') text += `  •  _${v.register}_`;
    text += `\n   💬 _"${v.example_sentence}"_\n`;
    text += `       → _${v.example_translation}_\n`;
    if (v.collocations?.length) text += `   🔗 ${v.collocations.join(' · ')}\n`;
    if (v.common_mistake) text += `   ⚠️ _${v.common_mistake}_\n`;
    text += '\n';
  });
  ctx.session.pronunciationQueue = vocab.slice(0, 2).map(v => ({ word: v.word, phonetic: v.phonetic }));
  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '➡️ Gramática', callback_data: 'lesson:step:1' }]] },
  });
}

async function sendGrammar(ctx, grammar) {
  let text = `2️⃣ *GRAMÁTICA — ${grammar.topic}*\n`;
  text += `_${grammar.why_it_matters}_\n\n`;
  text += `${grammar.explanation}\n\n`;
  text += `📌 *Regra:* _${grammar.rule_summary}_\n`;
  text += `🔤 \`${grammar.structure}\`\n\n`;
  text += `*Exemplos:*\n`;
  grammar.examples.forEach(ex => {
    if (ex.correct && !ex.wrong) {
      text += `✅ ${ex.correct}\n   → _${ex.translation}_\n`;
      if (ex.note) text += `   💡 _${ex.note}_\n`;
    } else if (ex.wrong) {
      text += `\n❌ ~~${ex.wrong}~~\n✅ ${ex.correct}\n   _${ex.explanation}_\n`;
    }
    text += '\n';
  });
  if (grammar.tip) text += `💼 *Na prática:* ${grammar.tip}`;
  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '➡️ Contexto', callback_data: 'lesson:step:2' }]] },
  });
}

async function sendContext(ctx, context) {
  let text = `3️⃣ *CONTEXTO*\n_${context.situation}_\n`;
  if (context.cultural_note) text += `\n🌍 _${context.cultural_note}_\n`;
  text += '\n';
  context.dialogue.forEach(line => {
    text += `*${line.speaker}:* ${line.line}\n`;
    text += `   _${line.translation}_\n\n`;
  });
  if (context.highlighted_expressions?.length) {
    text += `💡 *Expressões em destaque:*\n`;
    context.highlighted_expressions.forEach(e => {
      text += `• *"${e.expression}"* — ${e.meaning}\n  _Quando usar: ${e.usage}_\n`;
    });
  }
  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '➡️ Leitura', callback_data: 'lesson:step:3' }]] },
  });
}

async function sendReading(ctx, reading) {
  let text = `4️⃣ *LEITURA — ${reading.title}*\n`;
  text += `_${reading.genre}_\n\n`;
  text += `${reading.text}\n\n`;
  text += `📖 *Tradução:*\n_${reading.translation}_\n\n`;
  if (reading.vocabulary_in_context?.length) {
    text += `🔍 *Vocab do dia no texto:*\n`;
    reading.vocabulary_in_context.forEach(v => {
      text += `• *${v.word}* → _"${v.sentence}"_\n`;
    });
    text += '\n';
  }
  text += `_Leia com atenção — o quiz vai testar sua compreensão real!_`;
  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '📝 Fazer Quiz', callback_data: 'lesson:step:4' }]] },
  });
}

export async function sendQuizQuestion(ctx, questions, idx) {
  if (idx >= questions.length) return finishLesson(ctx);
  const q = questions[idx];
  await ctx.reply(
    `5️⃣ *Quiz ${idx+1}/${questions.length}*\n\n${q.question}`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: q.options.map(opt => [{ text: opt, callback_data: `lesson:quiz:${idx}:${opt[0]}` }]) },
    }
  );
}

export async function finishLesson(ctx) {
  const { quizAnswers, lessonPlan, lessonDate } = ctx.session;
  const questions = lessonPlan?.dayPlan?.reading?.quiz || [];
  const vocab     = lessonPlan?.dayPlan?.vocab || [];
  const correct   = quizAnswers.filter((a, i) => a === questions[i]?.answer).length;
  const score     = questions.length ? Math.round((correct / questions.length) * 100) : 100;
  const xp        = Math.round(50 + score * 0.5);

  await recordLessonCompletion(ctx.user.id, lessonDate, score, xp);
  const updatedUser = await updateStreak(ctx.from.id);
  await updateUser(ctx.from.id, {
    xp: (ctx.user.xp || 0) + xp,
    total_lessons_completed: (ctx.user.total_lessons_completed || 0) + 1,
  });

  for (const v of vocab) {
    await addVocabCard(ctx.user.id, {
      word: v.word, translation: v.translation, phonetic: v.phonetic,
      example_sentence: v.example_sentence, example_translation: v.example_translation,
      category: v.part_of_speech, level: ctx.user.level,
    }).catch(() => {});
  }

  const emoji = score >= 90 ? '🌟' : score >= 70 ? '✅' : '💪';
  await ctx.reply(
    `${emoji} *Lição concluída!*\n\n` +
    `📊 Quiz: *${correct}/${questions.length} (${score}%)*\n` +
    `⭐ XP: *+${xp}*\n` +
    `🔥 Streak: *${updatedUser?.streak || 1} dias*\n\n` +
    `_${vocab.length} palavras adicionadas aos seus flashcards!_`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [
        [{ text: '🎙 Praticar pronúncia', callback_data: 'pronunciation:start_queue' }],
        [{ text: '🃏 Revisar flashcards', callback_data: 'vocab:start' }],
        [{ text: '📈 Meu progresso de nível', callback_data: 'show:level_progress' }],
      ]},
    }
  );

  const userWithUpdates = { ...ctx.user, ...updatedUser };
  const newAchievements = await checkAndUnlockAchievements(userWithUpdates);
  for (const ach of newAchievements) {
    await ctx.reply(`🏆 *Conquista!* ${ach.icon} *${ach.title}*\n_${ach.description}_\n+${ach.xp_bonus} XP`, { parse_mode: 'Markdown' });
  }

  const promotion = await checkLevelPromotion({ ...userWithUpdates, id: ctx.user.id });
  if (promotion?.promoted) {
    await ctx.reply(`🎉 *VOCÊ SUBIU DE NÍVEL!*\n\n${promotion.message}`, { parse_mode: 'Markdown' });
    ctx.user.level = promotion.toLevel;
  }

  ctx.session.state = 'idle';
  ctx.session.lessonPlan = null;
}
