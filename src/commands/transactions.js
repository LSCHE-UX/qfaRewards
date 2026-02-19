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
    .setName("transactions")
    .setDescription("View your recent points transactions.")
    .addIntegerOption(opt =>
      opt.setName("limit")
        .setDescription("How many to show (1–25). Default 15.")
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!requireAllowedGuild(interaction)) {
      return interaction.reply({ content: "This bot can't be used in this server.", ephemeral: true });
    }

    const discordId = interaction.user.id;
    let limit = interaction.options.getInteger("limit") ?? 15;
    if (limit < 1) limit = 1;
    if (limit > 25) limit = 25;

    const userRes = await query(
      `SELECT id AS user_id, roblox_username, roblox_user_id
       FROM users
       WHERE discord_user_id = $1`,
      [discordId]
    );

    if (userRes.rowCount === 0 || !userRes.rows[0].roblox_user_id) {
      return interaction.reply({ content: "You aren’t linked yet. Run **/link** first.", ephemeral: true });
    }

    const u = userRes.rows[0];

    const txRes = await query(
      `SELECT type, amount, reason, created_at
       FROM transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [u.user_id, limit]
    );

    const lines = txRes.rows.length
      ? txRes.rows.map((t, i) => {
          const unix = toUnixSeconds(t.created_at);
          const when = unix ? `<t:${unix}:R>` : "recently";
          const why = (t.reason && t.reason.trim()) ? t.reason.trim() : t.type;
          return `**${i + 1}.** ${fmtAmount(t.amount)} — ${why} (${when})`;
        }).join("\n")
      : "_No transactions yet._";

    const embed = new EmbedBuilder()
      .setTitle("<:qantas_tail:1430530129825890375> Qantas Frequent Flyers — Transactions")
      .setDescription(`Roblox: **${u.roblox_username}** (${u.roblox_user_id})`)
      .addFields({ name: `Last ${Math.min(limit, txRes.rows.length)} transactions`, value: lines })
      .setFooter({ text: "Positive = added • Negative = removed" })
      .setImage('https://media.discordapp.net/attachments/1392247713474678815/1469567409680809994/image.png?ex=6997f2cd&is=6996a14d&hm=ee1a901937b0ae4fcad1b2a2c76e9995e904f9f885c4852d271ded92cc2ed4f6&=&format=webp&quality=lossless&width=1134&height=15')
      .setcolor(0xdf0000);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};