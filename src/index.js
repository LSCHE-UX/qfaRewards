const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { token } = require("./config");
const { query, withTx } = require("./db");
const { initDatabase } = require("./db");
const { getRobloxUserIdByUsername, getRobloxUserById } = require("./roblox");

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

    await initDatabase();
    console.log("📦 Tables ensured");

  } catch (e) {
    console.error("❌ Database setup failed:", e.message);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId === "qr_verify_start") {
      const modal = new ModalBuilder()
        .setCustomId("qr_verify_modal")
        .setTitle("Verify & Link Roblox Account");

      const robloxIdInput = new TextInputBuilder()
        .setCustomId("roblox_user_id")
        .setLabel("Roblox UserId (numbers)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const robloxUserInput = new TextInputBuilder()
        .setCustomId("roblox_username")
        .setLabel("Roblox Username")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const codeInput = new TextInputBuilder()
        .setCustomId("code")
        .setLabel("Link Code")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(robloxIdInput),
        new ActionRowBuilder().addComponents(robloxUserInput),
        new ActionRowBuilder().addComponents(codeInput)
      );

      await interaction.showModal(modal);
      return;
    }

if (interaction.isModalSubmit()) {
  if (interaction.customId !== "qr_verify_modal") return;

  const discordId = interaction.user.id;
  const username = interaction.fields.getTextInputValue("roblox_username").trim();

  // Grab stored code
  const { withTx } = require("./db");
  const { EmbedBuilder } = require("discord.js");

  const result = await withTx(async (db) => {
    const lc = await db.query(
      `SELECT code, expires_at FROM link_codes WHERE discord_user_id = $1`,
      [discordId]
    );

    if (lc.rowCount === 0) return { ok: false, reason: "No active link code. Run /link again." };

    const { code, expires_at } = lc.rows[0];
    if (new Date(expires_at).getTime() < Date.now()) return { ok: false, reason: "Code expired. Run /link again." };

    // Resolve username -> userId
    const userId = await getRobloxUserIdByUsername(username);
    if (!userId) return { ok: false, reason: "Roblox username not found (or banned). Check spelling." };

    // Fetch profile (includes description/bio)
    const profile = await getRobloxUserById(userId);
    const bio = (profile?.description || "").toString();

    // Verify code is inside bio
    if (!bio.includes(code)) {
      return { ok: false, reason: `Code not found in Roblox bio. Paste **${code}** into your bio then try again.` };
    }

    // Prevent one Roblox account linking to multiple Discord users
    const taken = await db.query(`SELECT discord_user_id FROM users WHERE roblox_user_id = $1`, [userId]);
    if (taken.rowCount > 0 && String(taken.rows[0].discord_user_id) !== String(discordId)) {
      return { ok: false, reason: "That Roblox account is already linked to another Discord user." };
    }

    // Save link
    const u = await db.query(
      `INSERT INTO users (discord_user_id, roblox_user_id, roblox_username)
       VALUES ($1, $2, $3)
       ON CONFLICT (discord_user_id)
       DO UPDATE SET roblox_user_id = EXCLUDED.roblox_user_id, roblox_username = EXCLUDED.roblox_username
       RETURNING id`,
      [discordId, userId, profile?.name || username]
    );

    const userRowId = u.rows[0].id;

    await db.query(
      `INSERT INTO wallets (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userRowId]
    );

    await db.query(`DELETE FROM link_codes WHERE discord_user_id = $1`, [discordId]);

    return { ok: true, robloxUserId: userId, robloxUsername: profile?.name || username };
  });

  if (!result.ok) {
    return interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
  }

  const welcome = new EmbedBuilder()
    .setTitle("✅ Welcome to Qantas Rewards")
    .setDescription(
      [
        `Linked Roblox account: **${result.robloxUsername}** (${result.robloxUserId})`,
        ``,
        `Next steps:`,
        `• Check balance: **/points**`,
        `• Earn points on flights + events`
      ].join("\n")
    );

  return interaction.reply({ embeds: [welcome], ephemeral: true });
}
  } catch (e) {
    console.error(e);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: "Something went wrong.", ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: "Something went wrong.", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(token);