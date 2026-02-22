// index.js
const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { token } = require("./config");
const { query, withTx, initDatabase } = require("./db");
const { getRobloxUserIdByUsername, getRobloxUserById } = require("./roblox");

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// Load command files
const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"))) {
  const cmd = require(path.join(commandsPath, file));
  client.commands.set(cmd.data.name, cmd);
}

/* =========================
   Welcome Pager (Next/Back UI)
   ========================= */
const welcomePagerState = new Map(); // discordId -> { pages: EmbedBuilder[], index: number }

function buildWelcomePages(result, user) {
  const title = "<:qantas_tail:1430530129825890375> Qantas Frequent Flyer Rewards";
  const color = 0xE4002B;
  const image = 'https://media.discordapp.net/attachments/1392247713474678815/1469567409680809994/image.png?ex=6997f2cd&is=6996a14d&hm=ee1a901937b0ae4fcad1b2a2c76e9995e904f9f885c4852d271ded92cc2ed4f6&=&format=webp&quality=lossless&width=1134&height=15';

  const page1 = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setImage(image)
    .setDescription(
      [
        `<:qantas_tail:1430530129825890375> Linked Roblox account: **${result.robloxUsername}** (${result.robloxUserId})`,
        ``,
        `Welcome ${user}! Your Frequent Flyer profile is ready.`,
        ``,
        `Use the buttons below to learn how points work.`,
      ].join("\n")
    )
    .setFooter({ text: "Page 1/4" })
    .setTimestamp();

  const page2 = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
        .setImage(image)
    .addFields({
      name: "<:qantas_points:1405073038298452008> What it’s for",
      value:
        "Earn points through flights and activity, then redeem them for perks during flights.",
    })
    .setFooter({ text: "Page 2/4" })
    .setTimestamp();

  const page3 = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
        .setImage(image)
    .addFields(
      {
        name: "<:award_circle:1403914990888554599> What you can redeem",
        value:
          "• One-time Business Class upgrades during flights\n" +
          "• Lounge access\n" +
          "• Preferred seat selection\n" +
          "• Extra seats for friends\n" +
          "• Special event perks",
      },
      {
        name: "<:award_circle:1403914990888554599> How you earn points",
        value:
          "• Attending flights\n" +
          "• Participating in events\n" +
          "• Server contributions\n" +
          "• Promotions & bonuses",
      }
    )
    .setFooter({ text: "Page 3/4" })
    .setTimestamp();

  const page4 = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
        .setImage(image)
    .addFields(
      {
        name: "<:qantas_tail:1430530129825890375> Commands",
        value:
          "`/points` – View your points & tier\n" +
          "`/transactions` – View your points history",
      },
      {
        name: "<:qantas_tail:1430530129825890375> Need help?",
        value:
          "If you have any issues (missing points, wrong link, etc.), contact the <@1465236776338723001>",
      }
    )
    .setFooter({ text: "Page 4/4" })
    .setTimestamp();

  return [page1, page2, page3, page4];
}

function buildWelcomeRow(index, total) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ff_prev")
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index === 0),

    new ButtonBuilder()
      .setCustomId("ff_next")
      .setLabel("Next")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(index === total - 1),

    new ButtonBuilder()
      .setCustomId("ff_close")
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger)
  );
}

/* =========================
   Ready + DB init
   ========================= */
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

app.get("/api/roblox/profile", async (req, res) => {
  try {
    const secret = req.header("x-roblox-secret");
    if (!secret || secret !== process.env.ROBLOX_SHARED_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const usernameRaw = String(req.query.username || "").trim();
    if (!usernameRaw) {
      return res.status(400).json({ ok: false, error: "Missing username" });
    }

    // Case-insensitive match
    const q = `
      SELECT
        u.id              AS user_id,
        u.roblox_user_id  AS roblox_user_id,
        u.roblox_username AS roblox_username,
        u.discord_user_id AS discord_user_id,
        w.id              AS wallet_id,
        COALESCE(w.balance, 0) AS balance
      FROM public.users u
      LEFT JOIN public.wallets w ON w.user_id = u.id
      WHERE LOWER(u.roblox_username) = LOWER($1)
      ORDER BY u.id DESC
      LIMIT 1;
    `;

    const result = await pool.query(q, [usernameRaw]);

    if (result.rows.length === 0) {
      return res.json({ ok: true, exists: false });
    }

    return res.json({ ok: true, exists: true, profile: result.rows[0] });
  } catch (err) {
    console.error("GET PROFILE BY USERNAME ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   Interaction Handler
   ========================= */
client.on("interactionCreate", async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
      return;
    }

    // Welcome pager buttons
    if (
      interaction.isButton() &&
      ["ff_prev", "ff_next", "ff_close"].includes(interaction.customId)
    ) {
      const discordId = interaction.user.id;
      const state = welcomePagerState.get(discordId);

      // If bot restarted / state expired, just remove buttons
      if (!state) {
        return interaction.update({ components: [] }).catch(() => {});
      }

      if (interaction.customId === "ff_close") {
        welcomePagerState.delete(discordId);
        return interaction.update({ components: [] }).catch(() => {});
      }

      const total = state.pages.length;

      if (interaction.customId === "ff_prev") {
        state.index = Math.max(0, state.index - 1);
      } else if (interaction.customId === "ff_next") {
        state.index = Math.min(total - 1, state.index + 1);
      }

      return interaction.update({
        embeds: [state.pages[state.index]],
        components: [buildWelcomeRow(state.index, total)],
      });
    }

    // Start verification (opens modal)
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

    // Modal submit (verification & linking)
    if (interaction.isModalSubmit()) {
      if (interaction.customId !== "qr_verify_modal") return;

      const discordId = interaction.user.id;
      const username = interaction.fields.getTextInputValue("roblox_username").trim();

      const result = await withTx(async (db) => {
        const lc = await db.query(
          `SELECT code, expires_at FROM link_codes WHERE discord_user_id = $1`,
          [discordId]
        );

        if (lc.rowCount === 0) {
          return { ok: false, reason: "No active link code. Run /link again." };
        }

        const { code, expires_at } = lc.rows[0];
        if (new Date(expires_at).getTime() < Date.now()) {
          return { ok: false, reason: "Code expired. Run /link again." };
        }

        // Resolve username -> userId
        const userId = await getRobloxUserIdByUsername(username);
        if (!userId) {
          return {
            ok: false,
            reason: "Roblox username not found (or banned). Check spelling.",
          };
        }

        // Fetch profile (includes description/bio)
        const profile = await getRobloxUserById(userId);
        const bio = (profile?.description || "").toString();

        // Verify code is inside bio
        if (!bio.includes(code)) {
          return {
            ok: false,
            reason: `Code not found in Roblox bio. Paste **${code}** into your bio then try again.`,
          };
        }

        // Prevent one Roblox account linking to multiple Discord users
        const taken = await db.query(
          `SELECT discord_user_id FROM users WHERE roblox_user_id = $1`,
          [userId]
        );
        if (
          taken.rowCount > 0 &&
          String(taken.rows[0].discord_user_id) !== String(discordId)
        ) {
          return {
            ok: false,
            reason: "That Roblox account is already linked to another Discord user.",
          };
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

        return {
          ok: true,
          robloxUserId: userId,
          robloxUsername: profile?.name || username,
        };
      });

      if (!result.ok) {
        return interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
      }

      // Send the paged welcome UI after linking
      const pages = buildWelcomePages(result, interaction.user);
      welcomePagerState.set(discordId, { pages, index: 0 });

      return interaction.reply({
        embeds: [pages[0]],
        components: [buildWelcomeRow(0, pages.length)],
        ephemeral: true,
      });
    }
  } catch (e) {
    console.error(e);
    if (interaction.deferred || interaction.replied) {
      await interaction
        .followUp({ content: "Something went wrong.", ephemeral: true })
        .catch(() => {});
    } else {
      await interaction
        .reply({ content: "Something went wrong.", ephemeral: true })
        .catch(() => {});
    }
  }
});

client.login(token);