const { SlashCommandBuilder } = require("discord.js");
const { withTx } = require("../db");
const { requireAllowedGuild, hasAnyRole, pointsAdminRoleIds, isPositiveInt } = require("../utils");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removepoints")
    .setDescription("Remove reward points from a linked user (rank locked).")
    .addUserOption(opt =>
      opt.setName("user").setDescription("Discord user to remove points from").setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("amount").setDescription("Points to remove").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("reason").setDescription("Reason (optional)").setRequired(false)
    ),

  async execute(interaction) {
    if (!requireAllowedGuild(interaction)) {
      return interaction.reply({ content: "This bot can't be used in this server.", ephemeral: true });
    }

    if (!hasAnyRole(interaction.member, pointsAdminRoleIds)) {
      return interaction.reply({ content: "❌ You don’t have permission to modify points.", ephemeral: true });
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

      // Check current balance
      const w0 = await db.query(`SELECT balance FROM wallets WHERE user_id = $1`, [userId]);
      const current = w0.rows[0]?.balance ?? 0;

      if (current < amount) {
        return { ok: false, reason: `Insufficient balance (current: ${current}).` };
      }

      // Update wallet
      await db.query(
        `UPDATE wallets
         SET balance = balance - $1,
             lifetime_spent = lifetime_spent + $1,
             updated_at = NOW()
         WHERE user_id = $2`,
        [amount, userId]
      );

      // Audit (negative amount makes it obvious in logs)
      await db.query(
        `INSERT INTO transactions (user_id, actor_discord_user_id, type, amount, reason, metadata)
         VALUES ($1, $2, 'ADJUST_REMOVE', $3, $4, $5)`,
        [userId, actorId, -amount, reason, JSON.stringify({ target_discord_user_id: target.id })]
      );

      const w = await db.query(`SELECT balance FROM wallets WHERE user_id = $1`, [userId]);
      return { ok: true, newBalance: w.rows[0].balance };
    });

    if (!outcome.ok) {
      return interaction.reply({ content: `❌ ${outcome.reason}`, ephemeral: true });
    }

    return interaction.reply({
      content: `✅ Removed **${amount}** pts from ${target}.\nNew balance: **${outcome.newBalance}** pts`
    });
  }
};