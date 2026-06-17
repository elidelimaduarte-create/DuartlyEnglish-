import 'dotenv/config';
import { Telegraf, session } from 'telegraf';
import { sessionMiddleware } from './middleware/session.js';
import { startCommand } from './commands/start.js';
import { lessonCommand } from './commands/lesson.js';
import { vocabCommand } from './commands/vocab.js';
import { streakCommand } from './commands/streak.js';
import { dashboardCommand } from './commands/dashboard.js';
import { translateCommand } from './commands/translate.js';
import { correctCommand } from './commands/correct.js';
import { handleCallbackQuery } from './handlers/callback.js';
import { handleTextMessage } from './handlers/text.js';
import { handleVoiceMessage } from './commands/pronunciation.js';
import { getLevelProgressReport } from '../services/levelProgression.js';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.use(session());
bot.use(sessionMiddleware);

bot.command(['start'],              startCommand);
bot.command(['licao', 'l'],         lessonCommand);
bot.command(['vocab', 'v'],         vocabCommand);
bot.command(['streak', 's'],        streakCommand);
bot.command(['dashboard', 'd'],     dashboardCommand);
bot.command(['traducao', 't'],      translateCommand);
bot.command(['corrigir', 'c'],      correctCommand);
bot.command(['nivel', 'n'],         levelCommand);
bot.command(['ajuda', 'help'],      helpCommand);

bot.on('callback_query', handleCallbackQuery);
bot.on('voice',          handleVoiceMessage);
bot.on('text',           handleTextMessage);

async function levelCommand(ctx) {
  const report = await getLevelProgressReport(ctx.user);
  if (!report) return ctx.reply('Erro ao buscar seu nível.');
  if (report.isMax) return ctx.reply('🏆 Você está no nível Avançado!');
  const lvlNames  = { beginner: 'Iniciante', intermediate: 'Intermediário', advanced: 'Avançado' };
  const lvlEmojis = { beginner: '🟢', intermediate: '🟡', advanced: '🔵' };
  let text = `📈 *Nível atual: ${lvlEmojis[report.currentLevel]} ${lvlNames[report.currentLevel]}*\n`;
  text += `_Próximo: ${lvlEmojis[report.nextLevel]} ${lvlNames[report.nextLevel]}_\n\n`;
  report.items.forEach(i => { text += `${i.ok ? '✅' : '⬜'} ${i.label}: ${i.current} / ${i.target}\n`; });
  const next = report.items.find(i => !i.ok);
  if (next) text += `\n💡 *Foco:* ${next.label}`;
  await ctx.reply(text, { parse_mode: 'Markdown' });
}

async function helpCommand(ctx) {
  await ctx.reply(
    `🇺🇸 *DuartlyEnglish — Comandos*\n\n` +
    `*🎯 Estudo diário*\n/licao — Lição completa do dia\n/vocab — Flashcards de revisão (SRS)\n\n` +
    `*🔤 Prática livre*\n/traducao [frase] — Traduz PT→EN com explicação\n/corrigir [frase] — Corrige seu inglês\n🎙 Áudio — avalia sua pronúncia\n💬 Texto em PT — traduz automaticamente\n💬 Texto em EN — corrige automaticamente\n\n` +
    `*📊 Progresso*\n/streak — Sequência, XP e conquistas\n/nivel — Progresso para o próximo nível\n/dashboard — Painel web\n\n` +
    `*Atalhos:* /l /v /t /c /s /n /d`,
    { parse_mode: 'Markdown' }
  );
}

bot.catch((err, ctx) => {
  console.error(`[BOT ERROR] ${ctx.updateType}:`, err.message);
  ctx.reply('⚠️ Algo deu errado. Tente novamente.').catch(() => {});
});

async function launch() {
  const useWebhook = process.env.USE_WEBHOOK === 'true' && process.env.BOT_WEBHOOK_URL;
  if (useWebhook) {
    const url = `${process.env.BOT_WEBHOOK_URL}/webhook`;
    await bot.telegram.setWebhook(url);
    bot.startWebhook('/webhook', null, parseInt(process.env.PORT || 3000));
    console.log(`🤖 DuartlyEnglish webhook: ${url}`);
  } else {
    await bot.launch();
    console.log('🤖 DuartlyEnglish rodando em modo polling (dev)');
  }
  process.once('SIGINT',  () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

launch().catch(console.error);
