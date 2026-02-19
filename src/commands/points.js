const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { query } = require("../db");
const { requireAllowedGuild } = require("../utils");

function fmtAmount(n) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n)} pts`;
}

function toUnixSeconds(d) {
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor(t / 1000);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("points")
    .setDescription("Check your Qantas Rewards balance + recent activity."),

  async execute(interaction) {
    if (!requireAllowedGuild(interaction)) {
      return interaction.reply({ content: "This bot can't be used in this server.", ephemeral: true });
    }

    const discordId = interaction.user.id;

    const userRes = await query(
      `SELECT u.id AS user_id, u.roblox_username, u.roblox_user_id,
              w.balance, w.lifetime_earned, w.lifetime_spent
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.discord_user_id = $1`,
      [discordId]
    );

    if (userRes.rowCount === 0) {
      return interaction.reply({ content: "You’re not set up yet. Run **/link** first.", ephemeral: true });
    }

    const u = userRes.rows[0];

    if (!u.roblox_user_id) {
      return interaction.reply({
        content: "You aren’t linked yet. Run **/link** then verify.",
        ephemeral: true
      });
    }

    // Grab recent transactions
    const txRes = await query(
      `SELECT type, amount, reason, created_at
       FROM transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [u.user_id]
    );

    const balance = u.balance ?? 0;
    const earned = u.lifetime_earned ?? 0;
    const spent = u.lifetime_spent ?? 0;

    const txLines = txRes.rows.length
      ? txRes.rows.map((t) => {
          const unix = toUnixSeconds(t.created_at);
          const when = unix ? `<t:${unix}:R>` : "recently";
          const why = (t.reason && t.reason.trim()) ? t.reason.trim() : t.type;
          return `• **${fmtAmount(t.amount)}** — ${why} (${when})`;
        }).join("\n")
      : "_No transactions yet._";

    const embed = new EmbedBuilder()
      .setTitle("<:qantas_tail:1430530129825890375> Qantas Frequent Flyers — Points Balance")
      .setDescription(`Linked Roblox: **${u.roblox_username}** (${u.roblox_user_id})`)
      .addFields(
        { name: "Balance", value: `**${balance} pts**`, inline: true },
        { name: "Lifetime Earned", value: `**${earned} pts**`, inline: true },
        { name: "Lifetime Spent", value: `**${spent} pts**`, inline: true },
        { name: "Recent Activity", value: txLines }
      )
      .setFooter({ text: "Tip: Use /transactions to view more history." })
      .setColor(0xdf0000)
      .setImage('https://media.discordapp.net/attachments/1392247713474678815/1469567409680809994/image.png?ex=6997f2cd&is=6996a14d&hm=ee1a901937b0ae4fcad1b2a2c76e9995e904f9f885c4852d271ded92cc2ed4f6&=&format=webp&quality=lossless&width=1134&height=15');

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};