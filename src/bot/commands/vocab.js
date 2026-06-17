import { getCardsDueForReview, updateCardAfterReview, getUserVocabStats } from '../../services/supabase.js';
import supabase from '../../services/supabase.js';

export async function vocabCommand(ctx) {
  const stats = await getUserVocabStats(ctx.user.id);
  if (stats.total === 0) {
    return ctx.reply('📚 Você ainda não tem flashcards!\nComplete uma lição com /licao para adicionar palavras ao SRS.', { parse_mode: 'Markdown' });
  }
  const pending = await getCardsDueForReview(ctx.user.id, 999).then(c => c.length);
  if (pending === 0) {
    return ctx.reply(
      `✅ *Revisão em dia!*\n\n📊 Total: ${stats.total} · Dominadas: ${stats.mastered} ✅ · Aprendendo: ${stats.learning} 📈\n\n_Volte mais tarde!_`,
      { parse_mode: 'Markdown' }
    );
  }
  ctx.session.state = 'flashcard';
  await ctx.reply(`🃏 *${pending} flashcard${pending > 1 ? 's' : ''} para revisar!*`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '▶️ Começar', callback_data: 'vocab:start' }]] } }
  );
}

export async function sendNextFlashcard(ctx) {
  const cards = await getCardsDueForReview(ctx.user.id, 1);
  if (cards.length === 0) {
    ctx.session.state = 'idle';
    return ctx.reply('✅ *Revisão completa!* 🎉\n\n_As palavras voltarão no momento certo._', { parse_mode: 'Markdown' });
  }
  const card = cards[0];
  ctx.session.currentCard = card.id;
  await ctx.reply(
    `🃏 *Flashcard*\n\n━━━━━━━━━━━━━━━━\n📝 *${card.word}*\n${card.phonetic ? `🔊 \`${card.phonetic}\`\n` : ''}━━━━━━━━━━━━━━━━\n\n_Você lembra o significado?_`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [
        [{ text: '👁 Revelar resposta', callback_data: `vocab:reveal:${card.id}` }],
        [{ text: '⏭ Pular', callback_data: 'vocab:skip' }],
      ]},
    }
  );
}

export async function revealFlashcard(ctx, cardId) {
  const { data: card } = await supabase.from('vocab_cards').select('*').eq('id', cardId).single();
  if (!card) return ctx.reply('Card não encontrado.');
  await ctx.editMessageText(
    `🃏 *Flashcard — Resposta*\n\n━━━━━━━━━━━━━━━━\n📝 *${card.word}*\n${card.phonetic ? `🔊 \`${card.phonetic}\`\n` : ''}━━━━━━━━━━━━━━━━\n\n🇧🇷 *${card.translation}*\n\n` +
    (card.example_sentence ? `💬 _"${card.example_sentence}"_\n   → _${card.example_translation}_\n\n` : '') +
    `Como foi sua memória?`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [
        [{ text: '😰 Esqueci', callback_data: `vocab:review:${cardId}:0` }, { text: '😬 Difícil', callback_data: `vocab:review:${cardId}:2` }],
        [{ text: '🙂 Lembrei', callback_data: `vocab:review:${cardId}:4` }, { text: '😎 Fácil', callback_data: `vocab:review:${cardId}:5` }],
      ]},
    }
  );
}

export async function handleFlashcardReview(ctx, cardId, quality) {
  try {
    const updated = await updateCardAfterReview(cardId, ctx.user.id, quality);
    const msgs = {
      0: 'Voltará amanhã para reforçar.',
      2: 'Voltará em breve.',
      4: `Próxima revisão em ${updated.interval} dias.`,
      5: `Ótimo! Próxima em ${updated.interval} dias.`,
    };
    await ctx.answerCbQuery(msgs[quality] || '').catch(() => {});
    await sendNextFlashcard(ctx);
  } catch (err) {
    console.error('[FLASHCARD REVIEW]', err.message);
    await sendNextFlashcard(ctx);
  }
}
