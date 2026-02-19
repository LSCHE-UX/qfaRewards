const { SlashCommandBuilder } = require("discord.js");
const { withTx } = require("../db");
if (!hasManageServer(interaction.member)) {
  return interaction.reply({ content: "<:qf:1430530129825890375> You need **Manage Server** to modify points.", ephemeral: true });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("addpoints")
    .setDescription("Add reward points to a linked user (rank locked).")
    .addUserOption(opt =>
      opt.setName("user").setDescription("Discord user to give points to").setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("amount").setDescription("Points to add").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("reason").setDescription("Reason (optional)").setRequired(false)
    ),

  async execute(interaction) {
    if (!requireAllowedGuild(interaction)) {
      return interaction.reply({ content: "This bot can't be used in this server.", ephemeral: true });
    }

const { hasManageServer } = require("../utils");

if (!hasManageServer(interaction.member)) {
  return interaction.reply({ content: "❌ You need **Manage Server** to modify points.", ephemeral: true });
}



    const target = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    const reason = interaction.options.getString("reason") || "Admin adjustment";

    if (!isPositiveInt(amount)) {
      return interaction.reply({ content: "Amount must be a positive whole number.", ephemeral: true });
    }

    const actorId = interaction.user.id;

    const outcome = await withTx(async (db) => {
      const u = await db.query(
        `SELECT id, roblox_user_id FROM users WHERE discord_user_id = $1`,
        [target.id]
      );

      if (u.rowCount === 0 || !u.rows[0].roblox_user_id) {
        return { ok: false, reason: "That user isn’t linked. They need /link then Verify first." };
      }

      const userId = u.rows[0].id;

      await db.query(
        `INSERT INTO wallets (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );

      await db.query(
        `UPDATE wallets
         SET balance = balance + $1,
             lifetime_earned = lifetime_earned + $1,
             updated_at = NOW()
         WHERE user_id = $2`,
        [amount, userId]
      );

      await db.query(
        `INSERT INTO transactions (user_id, actor_discord_user_id, type, amount, reason, metadata)
         VALUES ($1, $2, 'ADJUST_ADD', $3, $4, $5)`,
        [userId, actorId, amount, reason, JSON.stringify({ target_discord_user_id: target.id })]
      );

      const w = await db.query(`SELECT balance FROM wallets WHERE user_id = $1`, [userId]);
      return { ok: true, newBalance: w.rows[0].balance };
    });

    if (!outcome.ok) {
      return interaction.reply({ content: `❌ ${outcome.reason}`, ephemeral: true });
    }

    return interaction.reply({
      content: `✅ Added **${amount}** pts to ${target}.\nNew balance: **${outcome.newBalance}** pts`
    });
  }
};