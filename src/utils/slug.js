function slugify(value = "") {
  return value
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "podcast";
}

function removeEpisodeNumber(value = "") {
  return value
    .toString()
    .replace(/^\s*ep(?:isode)?\.?\s*\d+\s*(?:[|.:\-–—]+\s*)?/i, "")
    .trim();
}

function removeEpisodeNumberFromSlug(value = "") {
  return value.toString().replace(/^ep(?:isode)?-\d+-/i, "");
}

async function createUniqueSlug(prisma, model, value) {
  const base = slugify(model === "episode" ? removeEpisodeNumber(value) : value);
  let candidate = base;
  let suffix = 2;

  while (await prisma[model].findUnique({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

module.exports = {
  createUniqueSlug,
  removeEpisodeNumber,
  removeEpisodeNumberFromSlug,
  slugify,
};
