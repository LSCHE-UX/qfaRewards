const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const fs = require("fs");
const path = require("path");

const { token } = require("./config");
const { query, withTx } = require("./db");
require("./src/index.js");
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder
} = require("discord.js");


const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// load commands
const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"))) {
  const cmd = require(path.join(commandsPath, file));
  client.commands.set(cmd.data.name, cmd);
}

client.once("ready", async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  try {
    await query("SELECT 1");
    console.log("✅ Database connected");
  } catch (e) {
    console.error("❌ Database connection failed:", e.message);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    // slash commands
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
      return;
    }

    // Verify button -> show modal
    if (interaction.isButton()) {
      if (interaction.customId !== "qr_verify_start") return;

      const modal = new ModalBuilder()
        .setCustomId("qr_verify_modal")
        .setTitle("Verify & Link Roblox Account");

      const robloxIdInput = new TextInputBuilder()
        .setCustomId("roblox_user_id")
        .setLabel("Roblox UserId (numbers)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. 12345678")
        .setRequired(true);

      const robloxUserInput = new TextInputBuilder()
        .setCustomId("roblox_username")
        .setLabel("Roblox Username")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. LeoPilot")
        .setRequired(true);

      const codeInput = new TextInputBuilder()
        .setCustomId("code")
        .setLabel("Link Code")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. K7X9Q2")
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(robloxIdInput),
        new ActionRowBuilder().addComponents(robloxUserInput),
        new ActionRowBuilder().addComponents(codeInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // Modal submit -> link account
    if (interaction.isModalSubmit()) {
      if (interaction.customId !== "qr_verify_modal") return;

      const discordId = interaction.user.id;
      const robloxUserIdRaw = interaction.fields.getTextInputValue("roblox_user_id").trim();
      const robloxUsername = interaction.fields.getTextInputValue("roblox_username").trim();
      const code = interaction.fields.getTextInputValue("code").trim().toUpperCase();

      const robloxUserId = Number(robloxUserIdRaw);
      if (!Number.isInteger(robloxUserId) || robloxUserId <= 0) {
        return interaction.reply({ content: "❌ Roblox UserId must be a valid number.", ephemeral: true });
      }

      const result = await withTx(async (db) => {
        const lc = await db.query(
          `SELECT code, expires_at
           FROM link_codes
           WHERE discord_user_id = $1`,
          [discordId]
        );

        if (lc.rowCount === 0) return { ok: false, reason: "No active link code. Run /link again." };

        const row = lc.rows[0];
        if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "That code expired. Run /link again." };
        if (row.code !== code) return { ok: false, reason: "Incorrect code. Run /link again." };

        const taken = await db.query(
          `SELECT discord_user_id FROM users WHERE roblox_user_id = $1`,
          [robloxUserId]
        );
        if (taken.rowCount > 0 && String(taken.rows[0].discord_user_id) !== String(discordId)) {
          return { ok: false, reason: "That Roblox account is already linked to another Discord user." };
        }

        const u = await db.query(
          `INSERT INTO users (discord_user_id, roblox_user_id, roblox_username)
           VALUES ($1, $2, $3)
           ON CONFLICT (discord_user_id)
           DO UPDATE SET roblox_user_id = EXCLUDED.roblox_user_id, roblox_username = EXCLUDED.roblox_username
           RETURNING id`,
          [discordId, robloxUserId, robloxUsername]
        );

        const userId = u.rows[0].id;

        await db.query(
          `INSERT INTO wallets (user_id)
           VALUES ($1)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId]
        );

        await db.query(
          `INSERT INTO transactions (user_id, actor_discord_user_id, type, amount, reason, metadata)
           VALUES ($1, $2, 'LINK', 0, 'Account linked', $3)`,
          [userId, discordId, JSON.stringify({ roblox_user_id: robloxUserId, roblox_username: robloxUsername })]
        );

        await db.query(`DELETE FROM link_codes WHERE discord_user_id = $1`, [discordId]);

        return { ok: true, robloxUserId, robloxUsername };
      });

      if (!result.ok) {
        return interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
      }

      const welcome = new EmbedBuilder()
        .setTitle("Welcome to Qantas Rewards")
        .setDescription(
          [
            `Linked Roblox account: **${result.robloxUsername}** (${result.robloxUserId})`,
            ``,
            `**Next steps**`,
            `• Check your balance: **/points**`,
            `• Earn points on flights + events`,
            `• Spend points on upgrades + perks (coming soon)`
          ].join("\n")
        )
        .setFooter({ text: "Qantas Rewards • Your points are tracked securely" });

      return interaction.reply({ embeds: [welcome], ephemeral: true });
    }
  } catch (e) {
    console.error("❌ interaction error:", e);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: "Something went wrong.", ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: "Something went wrong.", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(token);
