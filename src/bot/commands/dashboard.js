export async function dashboardCommand(ctx) {
  const token = Buffer.from(`${ctx.from.id}:${process.env.DASHBOARD_SECRET}`).toString('base64');
  const url = process.env.DASHBOARD_URL
    ? `${process.env.DASHBOARD_URL}?token=${token}`
    : '_Dashboard disponível após deploy no Vercel._';
  await ctx.reply(
    `📊 *Dashboard DuartlyEnglish*\n\nAcompanhe:\n• Progresso semanal\n• Palavras aprendidas\n• Histórico de quizzes\n• Pronúncia\n• Conquistas\n• Streak e XP\n\n🔗 ${url}`,
    { parse_mode: 'Markdown', disable_web_page_preview: false }
  );
}
