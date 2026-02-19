require("dotenv").config();

function parseCsvIds(v) {
  if (!v) return [];
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.GUILD_ID,

  databaseUrl: process.env.DATABASE_URL,

  pointsAdminRoleIds: parseCsvIds(process.env.POINTS_ADMIN_ROLE_IDS),
  allowedGuildIds: parseCsvIds(process.env.ALLOWED_GUILD_IDS),

  linkCodeMinutes: 15
};