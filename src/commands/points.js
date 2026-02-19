const { SlashCommandBuilder } = require("discord.js");
const { query } = require("../db");
const { requireAllowedGuild } = require("../utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("points")
    .setDescription("Check your rewards points balance."),

  async execute(interaction) {
    if (!requireAllowedGuild(interaction)) {
      return interaction.reply({ content: "This bot can't be used in this server.", ephemeral: true });
    }

    const discordId = interaction.user.id;

    const res = await query(
      `SELECT u.roblox_username, u.roblox_user_id, w.balance, w.lifetime_earned, w.lifetime_spent
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.discord_user_id = $1`,
      [discordId]
    );

    if (res.rowCount === 0) {
      return interaction.reply({ content: "You’re not set up yet. Run **/link** first.", ephemeral: true });
    }

    const r = res.rows[0];

    if (!r.roblox_user_id) {
      return interaction.reply({
        content: "You aren’t linked yet. Run **/link** then press **Verify**.",
        ephemeral: true
      });
    }

    return interaction.reply({
      ephemeral: true,
      content:
        `**Rewards Balance**\n` +
        `Roblox: **${r.roblox_username}** (${r.roblox_user_id})\n` +
        `Balance: **${r.balance ?? 0}** pts\n` +
        `Earned: **${r.lifetime_earned ?? 0}** | Spent: **${r.lifetime_spent ?? 0}**`
    });
  }
};