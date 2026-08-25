const catchAsync = require("../middleware/asyncHandler");
const { successResponse } = require("../utils/httpResponses");
const prisma = require("../config/database");
const firstPartyAnalytics = require("../services/firstPartyAnalyticsService");

const pageSpeedCache = new Map();
const healthCache = new Map();

async function buildPublicPages() {
  const site = (process.env.WEBSITE_URL || "https://thepropertyportfolio.com.au").replace(/\/$/, "");
  const [episodes, hosts] = await Promise.all([
    prisma.episode.findMany({ where: { isDeleted: false }, select: { slug: true, title: true }, orderBy: { createdAt: "desc" } }),
    prisma.host.findMany({ where: { isActive: true }, select: { slug: true, name: true }, orderBy: { displayOrder: "asc" } }),
  ]);
  const staticPages = [["Home","/"],["Episodes","/episode"],["About","/about"],["Contact","/contact"],["Terms of Access","/access"],["Terms of Use","/use"],["Privacy Policy","/privacy"]];
  return [...staticPages.map(([label,path])=>({ label, path, url: `${site}${path === "/" ? "" : path}`, type: "page" })), ...episodes.map((episode)=>({ label: episode.title, path: `/episode/${episode.slug}`, url: `${site}/episode/${episode.slug}`, type: "episode" })), ...hosts.map((host)=>({ label: host.name, path: `/host/${host.slug}`, url: `${site}/host/${host.slug}`, type: "host" }))];
}

async function getPageSpeed(url, strategy) {
  const key = `${url}:${strategy}`;
  const cached = pageSpeedCache.get(key);
  if (cached?.expiresAt > Date.now()) return { ...cached.data, cached: true };
  let chrome;
  try {
    const [{ default: lighthouse }, chromeLauncher] = await Promise.all([import("lighthouse"), import("chrome-launcher")]);
    chrome = await chromeLauncher.launch({
      chromePath: process.env.LIGHTHOUSE_CHROME_PATH || undefined,
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    const flags = {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      ...(strategy === "desktop" ? { preset: "desktop" } : {}),
    };
    const run = await lighthouse(url, flags);
    const categories = run?.lhr?.categories || {};
    const audits = run?.lhr?.audits || {};
    const opportunities = Object.values(audits).filter((item) => item.details?.type === "opportunity" && item.score !== null && item.score < .9).sort((a,b)=>(b.details?.overallSavingsMs||0)-(a.details?.overallSavingsMs||0)).slice(0,10).map((item)=>({ id:item.id, title:item.title, description:item.description, savingsMs:Math.round(item.details?.overallSavingsMs||0), savingsBytes:item.details?.overallSavingsBytes||0 }));
    const result = {
      configured: true,
      engine: "Lighthouse (self-hosted)",
      scores: Object.fromEntries(Object.entries(categories).map(([name, item]) => [name, Math.round((item.score || 0) * 100)])),
      metrics: { lcp: audits["largest-contentful-paint"]?.displayValue, cls: audits["cumulative-layout-shift"]?.displayValue, inp: audits["interaction-to-next-paint"]?.displayValue || audits["total-blocking-time"]?.displayValue, fcp: audits["first-contentful-paint"]?.displayValue, speedIndex: audits["speed-index"]?.displayValue, ttfb: audits["server-response-time"]?.displayValue },
      opportunities,
      fetchedAt: new Date().toISOString(),
    };
    pageSpeedCache.set(key, { expiresAt: Date.now() + 30 * 60 * 1000, data: result });
    return result;
  } catch (error) {
    throw new Error(`Local Lighthouse audit failed: ${error.message}. Install Chrome on the API server or set LIGHTHOUSE_CHROME_PATH.`);
  } finally {
    if (chrome) await chrome.kill().catch(() => {});
  }
}

exports.collectAnalytics = catchAsync(async (req, res) => {
  const result = await firstPartyAnalytics.collect(req.body || {}, req);
  return res.status(result.accepted ? 202 : 200).json({ status: true, ...result });
});

exports.getDashboardAnalytics = catchAsync(async (req, res) => {
  const analytics = await firstPartyAnalytics.report({ startDate: req.query.startDate, endDate: req.query.endDate });
  return successResponse(res, "Analytics retrieved", 200, { analytics });
});

exports.getPageSpeedTargets = catchAsync(async (req, res) => {
  const pages = await buildPublicPages();
  return successResponse(res, "PageSpeed pages retrieved", 200, { pages });
});

exports.getPageSpeedAudit = catchAsync(async (req, res) => {
  const strategy = req.query.strategy === "desktop" ? "desktop" : "mobile";
  const site = process.env.WEBSITE_URL || "https://thepropertyportfolio.com.au";
  const requestedUrl = req.query.url || site;
  let requested;
  let website;
  try { requested = new URL(requestedUrl); website = new URL(site); } catch { return res.status(400).json({ status: false, message: "Invalid audit URL" }); }
  if (requested.origin !== website.origin) return res.status(400).json({ status: false, message: "Only website pages can be audited" });
  const pageSpeed = await getPageSpeed(requestedUrl, strategy);
  return successResponse(res, "PageSpeed audit retrieved", 200, { pageSpeed, strategy, url: requestedUrl });
});

exports.getWebsiteHealth = catchAsync(async (req, res) => {
  const pages = await buildPublicPages();
  const now = Date.now();
  const check = async (page) => {
    const cached = healthCache.get(page.url);
    if (cached?.expiresAt > now) return { ...page, ...cached.data, cached: true };
    const startedAt = Date.now();
    let data;
    try {
      const response = await fetch(page.url, { redirect: "follow", signal: AbortSignal.timeout(12000), headers: { "User-Agent": "TPPP-Health-Monitor/1.0" } });
      data = { status: response.status, online: response.ok, responseTime: Date.now() - startedAt, checkedAt: new Date().toISOString(), error: response.ok ? null : `HTTP ${response.status}` };
    } catch (error) {
      data = { status: null, online: false, responseTime: Date.now() - startedAt, checkedAt: new Date().toISOString(), error: error.message || "Page check failed" };
    }
    healthCache.set(page.url, { data, expiresAt: now + 5 * 60 * 1000 });
    return { ...page, ...data, cached: false };
  };
  const results = [];
  for (let index = 0; index < pages.length; index += 5) results.push(...await Promise.all(pages.slice(index, index + 5).map(check)));
  return successResponse(res, "Website health retrieved", 200, { pages: results, summary: { total: results.length, online: results.filter((page)=>page.online).length, failing: results.filter((page)=>!page.online).length } });
});
