const { PermissionsBitField } = require("discord.js");
const { allowedGuildIds, pointsAdminRoleIds } = require("./config");

function hasAnyRole(member, roleIds) {
  if (!member || !roleIds?.length) return false;
  return roleIds.some((id) => member.roles.cache.has(id));
}

// NEW: permission-based check (Manage Server)
function hasManageServer(member) {
  if (!member) return false;
  return member.permissions.has(PermissionsBitField.Flags.ManageGuild);
}

// Keep this: used by every command
function requireAllowedGuild(interaction) {
  if (!allowedGuildIds?.length) return true;
  return interaction.guildId && allowedGuildIds.includes(interaction.guildId);
}

function makeLinkCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function nowPlusMinutes(mins) {
  return new Date(Date.now() + mins * 60 * 1000);
}

function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

module.exports = {
  hasAnyRole,
  hasManageServer,
  requireAllowedGuild,
  makeLinkCode,
  nowPlusMinutes,
  isPositiveInt,
  pointsAdminRoleIds
};