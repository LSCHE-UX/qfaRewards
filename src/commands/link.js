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
    const code = makeLinkCode();
    const expiresAt = nowPlusMinutes(linkCodeMinutes);

    await withTx(async (client) => {
      await client.query(
        `INSERT INTO users (discord_user_id)
         VALUES ($1)
         ON CONFLICT (discord_user_id) DO NOTHING`,
        [discordId]
      );

      await client.query(
        `INSERT INTO link_codes (discord_user_id, code, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (discord_user_id)
         DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
        [discordId, code, expiresAt]
      );
    });

    const embed = new EmbedBuilder()
      .setTitle("Qantas Rewards — Link your Roblox Account")
      .setDescription(
        [
          `Here’s your link code: **${code}**`,
          `Expires in **${linkCodeMinutes} minutes**.`,
          ``,
          `**Next:** Press **Verify** and enter your Roblox UserId + Username + this code.`
        ].join("\n")
      )
      .setFooter({ text: "Tip: Roblox UserId is the number in your profile URL." });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("qr_verify_start")
        .setLabel("Verify")
        .setStyle(ButtonStyle.Primary)
    );

    try {
      await interaction.user.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: "✅ I’ve sent you a DM with your verification code.", ephemeral: true });
    } catch {
      return interaction.reply({
        content: "⚠️ I couldn’t DM you (privacy settings). Use this instead:",
        embeds: [embed],
        components: [row],
        ephemeral: true
      });
    }
  }
};