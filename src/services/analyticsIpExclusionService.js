const { BlockList, isIP } = require("node:net");
const prisma = require("../config/database");

const CACHE_TTL_MS = 30 * 1000;
let exclusionCache = { expiresAt: 0, blockList: null };

function inputError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeAddress(value) {
  let address = String(value || "").trim();
  if (address.startsWith("[") && address.endsWith("]")) address = address.slice(1, -1);

  const mappedIpv4 = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mappedIpv4 && isIP(mappedIpv4[1]) === 4) address = mappedIpv4[1];

  const version = isIP(address);
  if (!version) throw inputError("Enter a valid IPv4 or IPv6 address");
  return { address: address.toLowerCase(), family: version === 4 ? "ipv4" : "ipv6", version };
}

function normalizeRule(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value || value.length > 150) throw inputError("An IP address or CIDR range is required");

  const parts = value.split("/");
  if (parts.length > 2) throw inputError("Enter a valid IP address or CIDR range");
  const normalized = normalizeAddress(parts[0]);
  if (parts.length === 1) return { value: normalized.address, ...normalized, prefix: null };

  if (!/^\d+$/.test(parts[1])) throw inputError("The CIDR prefix must be a whole number");
  const prefix = Number(parts[1]);
  const maximum = normalized.version === 4 ? 32 : 128;
  if (prefix < 0 || prefix > maximum) throw inputError(`The CIDR prefix must be between 0 and ${maximum}`);
  return { value: `${normalized.address}/${prefix}`, ...normalized, prefix };
}

function normalizeClientIp(rawValue) {
  try {
    return normalizeAddress(rawValue).address;
  } catch {
    return null;
  }
}

function getClientIp(req) {
  return normalizeClientIp(req.ip || req.socket?.remoteAddress || "");
}

function buildBlockList(rules) {
  const blockList = new BlockList();
  for (const rule of rules) {
    try {
      const parsed = normalizeRule(rule.value);
      if (parsed.prefix === null) blockList.addAddress(parsed.address, parsed.family);
      else blockList.addSubnet(parsed.address, parsed.prefix, parsed.family);
    } catch (error) {
      console.error("Ignoring invalid analytics IP exclusion", { id: rule.id, value: rule.value, error: error.message });
    }
  }
  return blockList;
}

function invalidateCache() {
  exclusionCache = { expiresAt: 0, blockList: null };
}

async function activeBlockList() {
  if (exclusionCache.blockList && exclusionCache.expiresAt > Date.now()) return exclusionCache.blockList;
  const rules = await prisma.analyticsIpExclusion.findMany({ where: { isActive: true }, select: { id: true, value: true } });
  const blockList = buildBlockList(rules);
  exclusionCache = { expiresAt: Date.now() + CACHE_TTL_MS, blockList };
  return blockList;
}

async function isRequestExcluded(req) {
  const address = getClientIp(req);
  if (!address) return false;
  const version = isIP(address);
  const blockList = await activeBlockList();
  return blockList.check(address, version === 4 ? "ipv4" : "ipv6");
}

async function list(req) {
  const [exclusions, currentIp] = await Promise.all([
    prisma.analyticsIpExclusion.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] }),
    Promise.resolve(getClientIp(req)),
  ]);
  return { exclusions, currentIp };
}

async function create(data, userId) {
  const parsed = normalizeRule(data.value);
  const label = typeof data.label === "string" ? data.label.trim().slice(0, 100) || null : null;
  try {
    const exclusion = await prisma.analyticsIpExclusion.create({
      data: { value: parsed.value, label, createdById: userId || null },
    });
    invalidateCache();
    return exclusion;
  } catch (error) {
    if (error.code === "P2002") throw inputError("That IP address or CIDR range is already on the whitelist", 409);
    throw error;
  }
}

async function update(idValue, data) {
  const id = Number(idValue);
  if (!Number.isInteger(id) || id <= 0) throw inputError("Invalid IP exclusion ID");
  const existing = await prisma.analyticsIpExclusion.findUnique({ where: { id } });
  if (!existing) throw inputError("IP exclusion was not found", 404);

  const updateData = {};
  if (data.value !== undefined) updateData.value = normalizeRule(data.value).value;
  if (data.label !== undefined) updateData.label = typeof data.label === "string" ? data.label.trim().slice(0, 100) || null : null;
  if (data.isActive !== undefined) {
    if (typeof data.isActive !== "boolean") throw inputError("isActive must be true or false");
    updateData.isActive = data.isActive;
  }
  if (!Object.keys(updateData).length) throw inputError("No changes were supplied");

  try {
    const exclusion = await prisma.analyticsIpExclusion.update({ where: { id }, data: updateData });
    invalidateCache();
    return exclusion;
  } catch (error) {
    if (error.code === "P2002") throw inputError("That IP address or CIDR range is already on the whitelist", 409);
    throw error;
  }
}

async function remove(idValue) {
  const id = Number(idValue);
  if (!Number.isInteger(id) || id <= 0) throw inputError("Invalid IP exclusion ID");
  const result = await prisma.analyticsIpExclusion.deleteMany({ where: { id } });
  if (!result.count) throw inputError("IP exclusion was not found", 404);
  invalidateCache();
  return { id };
}

module.exports = {
  create,
  getClientIp,
  isRequestExcluded,
  list,
  normalizeRule,
  remove,
  update,
};
