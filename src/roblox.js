async function robloxFetch(url, options) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  // Roblox sometimes rate-limits
  if (res.status === 429) {
    throw new Error("Roblox rate-limited. Try again in a moment.");
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Roblox API error ${res.status}: ${txt || res.statusText}`);
  }

  return res.json();
}

async function getRobloxUserIdByUsername(username) {
  const data = await robloxFetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: true
    })
  });

  const match = data?.data?.[0];
  if (!match?.id) return null;
  return match.id;
}

async function getRobloxUserById(userId) {
  return robloxFetch(`https://users.roblox.com/v1/users/${userId}`, { method: "GET" });
  // includes: id, name, displayName, description, isBanned, created...
}

module.exports = {
  getRobloxUserIdByUsername,
  getRobloxUserById
};