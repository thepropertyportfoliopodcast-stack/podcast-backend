const prisma = require("../config/database");

const SITE_NAME = "The Property Portfolio Podcast";
const STATIC_PAGES = [
  { path: "/", seoTitle: "Australian Property Podcast | Property Portfolio" },
  { path: "/episode", seoTitle: "Property Podcast Episodes | Property Portfolio" },
  { path: "/about", seoTitle: "About The Property Portfolio Podcast" },
  { path: "/contact", seoTitle: "Contact The Property Portfolio Podcast" },
  { path: "/access", seoTitle: "Terms of Access | The Property Portfolio Podcast" },
  { path: "/use", seoTitle: "Terms of Use | The Property Portfolio Podcast" },
  { path: "/privacy", seoTitle: "Privacy Policy | The Property Portfolio Podcast" },
];

const configuredTitle = (seoTitle, fallback) => seoTitle?.trim() || fallback;

async function buildPublicPages() {
  const site = (process.env.WEBSITE_URL || "https://thepropertyportfolio.com.au").replace(/\/$/, "");
  const [episodes, podcasts, hosts] = await Promise.all([
    prisma.episode.findMany({
      where: { isDeleted: false, publicationStatus: "PUBLISHED" },
      select: { slug: true, title: true, seoTitle: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.podcast.findMany({
      where: { isDeleted: false },
      select: { slug: true, name: true, seoTitle: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.host.findMany({
      where: { isActive: true },
      select: { slug: true, name: true, seoTitle: true },
      orderBy: { displayOrder: "asc" },
    }),
  ]);

  const createPage = ({ path, seoTitle, contentTitle, type }) => ({
    label: seoTitle,
    seoTitle,
    contentTitle,
    path,
    url: `${site}${path === "/" ? "" : path}`,
    type,
  });

  return [
    ...STATIC_PAGES.map((page) => createPage({ ...page, contentTitle: page.seoTitle, type: "page" })),
    ...episodes.map((episode) => createPage({
      path: `/episode/${episode.slug}`,
      seoTitle: configuredTitle(episode.seoTitle, `${episode.title} | ${SITE_NAME}`),
      contentTitle: episode.title,
      type: "episode",
    })),
    ...podcasts.map((podcast) => createPage({
      path: `/podcast/${podcast.slug}`,
      seoTitle: configuredTitle(podcast.seoTitle, `${podcast.name} | ${SITE_NAME}`),
      contentTitle: podcast.name,
      type: "podcast",
    })),
    ...hosts.map((host) => createPage({
      path: `/host/${host.slug}`,
      seoTitle: configuredTitle(host.seoTitle, `${host.name} | Podcast Host | ${SITE_NAME}`),
      contentTitle: host.name,
      type: "host",
    })),
  ];
}

module.exports = { buildPublicPages };
