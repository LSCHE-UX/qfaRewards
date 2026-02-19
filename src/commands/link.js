const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

const { withTx } = require("../db");
const { requireAllowedGuild, makeLinkCode, nowPlusMinutes } = require("../utils");
const { linkCodeMinutes } = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Roblox account to Qantas Rewards."),

  async execute(interaction) {
    if (!requireAllowedGuild(interaction)) {
      return interaction.reply({ content: "This bot can't be used in this server.", ephemeral: true });
    }

    const discordId = interaction.user.id;

    // Optional: prevent relinking if already linked
    // (If you want to allow relink, remove this block)
    // const existing = await query(`SELECT roblox_user_id FROM users WHERE discord_user_id = $1`, [discordId]);
    // if (existing.rowCount && existing.rows[0].roblox_user_id) ...

    const raw = makeLinkCode();
    const code = `QF-${raw}`; // easy to spot in bios
    const expiresAt = nowPlusMinutes(linkCodeMinutes);

    await withTx(async (db) => {
      await db.query(
        `INSERT INTO users (discord_user_id)
         VALUES ($1)
         ON CONFLICT (discord_user_id) DO NOTHING`,
        [discordId]
      );

      await db.query(
        `INSERT INTO link_codes (discord_user_id, code, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (discord_user_id)
         DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
        [discordId, code, expiresAt]
      );
    });

    const embed = new EmbedBuilder()
      .setTitle("<:qantas_tail:1430530129825890375> Qantas Frequent Flyers Rewards - Account Linking")
      .setColor(0xdf0000)
      .setDescription(
        [
          `Your code: **${code}**`,
          `Expires in **${linkCodeMinutes} minutes**.`,
          ``,
          `**Step 1:** Open your <:link1:1403914963877363867> [Roblox profile](https://www.roblox.com/User.aspx?lD=) and paste the code into your **bio/description**.`,
          `**Step 2:** Come back here and press **Verify**, to continue the process.`,
          ``,
          `Example bio line:`,
          `\`${code}\``
        ].join("\n")
      )
      .setFooter({ text: "After verifying, you can remove the code from your bio." });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("qr_verify_start")
        .setLabel("Verify")
        .setStyle(ButtonStyle.Success)
    );

    try {
      await interaction.user.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: "<:qantas_tail:1430530129825890375> Check your DMs for instructions and the verify button.", ephemeral: true });
    } catch {
      return interaction.reply({
        content: "<:qantas_tail:1430530129825890375> I couldn’t DM you due to your privacy settings. Use this panel instead:",
        embeds: [embed],
        components: [row],
        ephemeral: true
      });
    }
  }
};