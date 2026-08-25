const catchAsync = require("../middleware/asyncHandler");
const fs = require("fs");
const { successResponse, errorResponse } = require("../utils/httpResponses");
const firstPartyAnalytics = require("../services/firstPartyAnalyticsService");
const { buildPublicPages } = require("../services/publicPageCatalogService");

const lighthouseCache = new Map();
const healthCache = new Map();
let lighthouseQueue = Promise.resolve();

const STANDARD_CHROME_PATHS = [
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
];

function getPuppeteerChromePath(puppeteer) {
  const executablePath = puppeteer?.executablePath || puppeteer?.default?.executablePath;
  if (typeof executablePath !== "function") return null;

  try {
    const chromePath = executablePath();
    return chromePath && fs.existsSync(chromePath) ? chromePath : null;
  } catch (_) {
    return null;
  }
}

function resolveChromePath(chromeLauncher, puppeteer) {
  const configuredPath = process.env.LIGHTHOUSE_CHROME_PATH || process.env.CHROME_PATH;
  if (configuredPath && fs.existsSync(configuredPath)) return configuredPath;

  const puppeteerPath = getPuppeteerChromePath(puppeteer);
  if (puppeteerPath) return puppeteerPath;

  const standardPath = STANDARD_CHROME_PATHS.find((candidate) => fs.existsSync(candidate));
  if (standardPath) return standardPath;

  try {
    const detectedPath = chromeLauncher.getChromePath();
    if (detectedPath && fs.existsSync(detectedPath)) return detectedPath;
  } catch (_) {
    // The actionable error below is returned to the dashboard.
  }

  const configuredMessage = configuredPath ? ` Configured path does not exist: ${configuredPath}.` : "";
  throw new Error(`Chrome/Chromium was not found on the API server.${configuredMessage} Run npm ci without PUPPETEER_SKIP_DOWNLOAD so Puppeteer can install its bundled browser`);
}

function enqueueLighthouse(task) {
  const queued = lighthouseQueue.then(task, task);
  lighthouseQueue = queued.catch(() => {});
  return queued;
}

async function runLighthouse(url, strategy) {
  let chrome;
  try {
    const [{ default: lighthouse }, chromeLauncher, puppeteer] = await Promise.all([
      import("lighthouse"),
      import("chrome-launcher"),
      import("puppeteer"),
    ]);
    const chromePath = resolveChromePath(chromeLauncher, puppeteer);
    chrome = await chromeLauncher.launch({
      chromePath,
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    const flags = {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    };
    const desktopConfig = strategy === "desktop"
      ? (await import("lighthouse/core/config/desktop-config.js")).default
      : undefined;
    const run = await lighthouse(url, flags, desktopConfig);
    if (!run?.lhr) throw new Error("Lighthouse completed without returning an audit report");

    const categories = run.lhr.categories || {};
    const audits = run.lhr.audits || {};
    const opportunities = Object.values(audits).filter((item) => item.details?.type === "opportunity" && item.score !== null && item.score < .9).sort((a,b)=>(b.details?.overallSavingsMs||0)-(a.details?.overallSavingsMs||0)).slice(0,10).map((item)=>({ id:item.id, title:item.title, description:item.description, savingsMs:Math.round(item.details?.overallSavingsMs||0), savingsBytes:item.details?.overallSavingsBytes||0 }));
    return {
      configured: true,
      engine: "Lighthouse (self-hosted)",
      scores: Object.fromEntries(Object.entries(categories).map(([name, item]) => [name, Math.round((item.score || 0) * 100)])),
      metrics: { lcp: audits["largest-contentful-paint"]?.displayValue, cls: audits["cumulative-layout-shift"]?.displayValue, inp: audits["interaction-to-next-paint"]?.displayValue || audits["total-blocking-time"]?.displayValue, fcp: audits["first-contentful-paint"]?.displayValue, speedIndex: audits["speed-index"]?.displayValue, ttfb: audits["server-response-time"]?.displayValue },
      opportunities,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    if (chrome) {
      try { await chrome.kill(); } catch (_) {}
    }
  }
}

async function getLighthouse(url, strategy) {
  const key = `${url}:${strategy}`;
  const cached = lighthouseCache.get(key);
  if (cached?.expiresAt > Date.now()) return { ...cached.data, cached: true };
  return enqueueLighthouse(async () => {
    const queuedCache = lighthouseCache.get(key);
    if (queuedCache?.expiresAt > Date.now()) return { ...queuedCache.data, cached: true };
    const result = await runLighthouse(url, strategy);
    lighthouseCache.set(key, { expiresAt: Date.now() + 30 * 60 * 1000, data: result });
    return result;
  });
}

exports.collectAnalytics = catchAsync(async (req, res) => {
  const result = await firstPartyAnalytics.collect(req.body || {}, req);
  return res.status(result.accepted ? 202 : 200).json({ status: true, ...result });
});

exports.getDashboardAnalytics = catchAsync(async (req, res) => {
  const analytics = await firstPartyAnalytics.report({ startDate: req.query.startDate, endDate: req.query.endDate });
  return successResponse(res, "Analytics retrieved", 200, { analytics });
});

exports.deleteAnalyticsError = catchAsync(async (req, res) => {
  const result = await firstPartyAnalytics.deleteErrorIssue(req.params.id);
  if (!result) return errorResponse(res, "Analytics error was not found", 404);
  return successResponse(res, "Analytics error deleted", 200, result);
});

exports.clearAnalyticsErrors = catchAsync(async (req, res) => {
  const result = await firstPartyAnalytics.clearErrors();
  return successResponse(res, "Analytics errors cleared", 200, result);
});

exports.getLighthouseTargets = catchAsync(async (req, res) => {
  const pages = await buildPublicPages();
  let runtime;
  try {
    const [chromeLauncher, puppeteer] = await Promise.all([import("chrome-launcher"), import("puppeteer")]);
    runtime = { ready: true, chromePath: resolveChromePath(chromeLauncher, puppeteer), engine: "Lighthouse (self-hosted)" };
  } catch (error) {
    runtime = { ready: false, error: error.message, engine: "Lighthouse (self-hosted)" };
  }
  return successResponse(res, "Lighthouse pages retrieved", 200, { pages, runtime });
});

exports.getLighthouseAudit = catchAsync(async (req, res) => {
  const strategy = req.query.strategy === "desktop" ? "desktop" : "mobile";
  const site = process.env.WEBSITE_URL || "https://thepropertyportfolio.com.au";
  const requestedUrl = req.query.url || site;
  let requested;
  let website;
  try { requested = new URL(requestedUrl); website = new URL(site); } catch { return res.status(400).json({ status: false, message: "Invalid audit URL" }); }
  if (requested.origin !== website.origin) return res.status(400).json({ status: false, message: "Only website pages can be audited" });
  try {
    const lighthouse = await getLighthouse(requestedUrl, strategy);
    return successResponse(res, "Lighthouse audit retrieved", 200, { lighthouse, strategy, url: requestedUrl });
  } catch (error) {
    console.error("Self-hosted Lighthouse audit failed", { url: requestedUrl, strategy, error: error.message });
    return errorResponse(res, `Self-hosted Lighthouse audit failed: ${error.message}`, 500);
  }
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
