import { updateUser } from '../../services/supabase.js';

export async function startCommand(ctx) {
  const name = ctx.from.first_name || 'estudante';
  if (ctx.user?.onboarding_completed) {
    return ctx.reply(
      `👋 Bem-vindo de volta, *${name}*!\n\n🔥 Streak: *${ctx.user.streak} dias* · ⭐ XP: *${ctx.user.xp}*\n\nUse /licao para a lição de hoje ou /ajuda para ver tudo.`,
      { parse_mode: 'Markdown' }
    );
  }
  await ctx.reply(
    `🇺🇸 *Bem-vindo ao DuartlyEnglish!*\n\nSeu assistente pessoal para aprender inglês de verdade — com foco em carreira e comunicação profissional.\n\nPrimeiro, qual é o seu nível atual?`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🟢 Iniciante — sei pouco ou nada', callback_data: 'set_level:beginner' }],
          [{ text: '🟡 Intermediário — me comunico mas tenho dificuldades', callback_data: 'set_level:intermediate' }],
          [{ text: '🔵 Avançado — fluente, quero refinar', callback_data: 'set_level:advanced' }],
        ],
      },
    }
  );
}

export async function handleLevelSelection(ctx, level) {
  const names  = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' };
  const emojis = { beginner: '🟢', intermediate: '🟡', advanced: '🔵' };
  await updateUser(ctx.from.id, { level, onboarding_completed: true });
  ctx.user.level = level;
  ctx.session.state = 'idle';
  await ctx.editMessageText(
    `${emojis[level]} Perfeito! Nível *${names[level]}* selecionado.\n\n` +
    `Aqui está o que você vai ter:\n\n` +
    `📚 *Lição diária* — vocab + gramática + contexto + leitura + quiz\n` +
    `🎙 *Pronúncia* — áudio ou texto, avaliação com IA\n` +
    `🔤 *Tradução* — mande qualquer frase em português\n` +
    `✏️ *Correção* — envie suas frases em inglês\n` +
    `🃏 *Flashcards SRS* — revisão no momento certo\n` +
    `📈 *Progressão de nível* — automática, baseada no seu desempenho\n` +
    `🏆 *Conquistas* — gamificação do aprendizado\n\n` +
    `_As lições chegam automaticamente às 8h da manhã!_\n\n` +
    `Use /licao para começar agora! 💪`,
    { parse_mode: 'Markdown' }
  );
}
