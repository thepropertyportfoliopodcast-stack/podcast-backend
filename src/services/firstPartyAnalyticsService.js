const crypto = require("crypto");
const prisma = require("../config/database");

const allowedEvents = new Set(["page_view", "engagement", "scroll_depth", "outbound_click", "web_vital", "media_play", "form_submit", "browser_error", "resource_error"]);
const clean = (value, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : null;

function parseAgent(agent = "", width = 0) {
  const mobile = /Android|iPhone|iPod|Mobile/i.test(agent);
  const tablet = /iPad|Tablet/i.test(agent) || (/Android/i.test(agent) && !/Mobile/i.test(agent));
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Other";
  const operatingSystem = /Windows/i.test(agent) ? "Windows" : /Android/i.test(agent) ? "Android" : /iPhone|iPad|iPod/i.test(agent) ? "iOS" : /Mac OS/i.test(agent) ? "macOS" : /Linux/i.test(agent) ? "Linux" : "Other";
  return { deviceType: tablet ? "Tablet" : mobile || width < 768 ? "Mobile" : "Desktop", browser, operatingSystem };
}

function percentile(values, percent = .75) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percent) - 1)];
}

async function collect(payload, req) {
  const eventId = clean(payload.eventId, 80);
  const sessionId = clean(payload.sessionId, 80);
  const visitorId = clean(payload.visitorId, 80);
  const name = clean(payload.name, 40);
  const path = clean(payload.path, 500);
  if (!eventId || !sessionId || !visitorId || !path || !allowedEvents.has(name) || path.startsWith("/admin")) return { accepted: false };
  const metadata = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
  const agent = req.get("user-agent") || "";
  if (/bot|crawler|spider|lighthouse|pagespeed/i.test(agent)) return { accepted: false };
  const parsed = parseAgent(agent, Number(metadata.screenWidth || 0));
  const forwarded = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";
  const ipHash = crypto.createHash("sha256").update(`${process.env.ANALYTICS_SALT || "podcast"}:${forwarded}`).digest("hex");
  const params = metadata.campaign || {};
  await prisma.analyticsSession.upsert({
    where: { id: sessionId },
    create: { id: sessionId, visitorId, landingPage: path, referrer: clean(payload.referrer, 1000), source: clean(params.source, 120), medium: clean(params.medium, 120), campaign: clean(params.name, 120), ...parsed, country: clean(req.headers["cf-ipcountry"] || req.headers["x-vercel-ip-country"], 8), ipHash },
    update: { lastSeenAt: new Date() },
  });
  try {
    await prisma.analyticsEvent.create({ data: { eventId, sessionId, visitorId, name, path, title: clean(payload.title, 300), value: Number.isFinite(Number(payload.value)) ? Number(payload.value) : null, metadata } });
  } catch (error) {
    if (error.code !== "P2002") throw error;
  }
  return { accepted: true };
}

function rangeStart(range) {
  const days = range === "7daysAgo" ? 7 : range === "90daysAgo" ? 90 : 28;
  return new Date(Date.now() - days * 86400000);
}

async function report(range = "28daysAgo") {
  const start = rangeStart(range);
  const [events, sessions, realtime] = await Promise.all([
    prisma.analyticsEvent.findMany({ where: { createdAt: { gte: start } }, select: { name: true, path: true, title: true, value: true, metadata: true, sessionId: true, visitorId: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.analyticsSession.findMany({ where: { lastSeenAt: { gte: start } }, select: { id: true, visitorId: true, landingPage: true, referrer: true, source: true, medium: true, campaign: true, deviceType: true, browser: true, operatingSystem: true, country: true, firstSeenAt: true, lastSeenAt: true } }),
    prisma.analyticsEvent.findMany({ where: { createdAt: { gte: new Date(Date.now() - 30 * 60000) }, name: "page_view" }, select: { sessionId: true, path: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const pageViews = events.filter((event) => event.name === "page_view");
  const engagement = events.filter((event) => event.name === "engagement");
  const unique = (items) => new Set(items).size;
  const countBy = (items, getter) => Object.entries(items.reduce((acc, item) => { const key = getter(item) || "Direct / Unknown"; acc[key] = (acc[key] || 0) + 1; return acc; }, {})).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label,value}));
  const engagedBySession = engagement.reduce((acc, event) => { acc[event.sessionId] = (acc[event.sessionId] || 0) + (event.value || 0); return acc; }, {});
  const viewsBySession = pageViews.reduce((acc, event) => { acc[event.sessionId] = (acc[event.sessionId] || 0) + 1; return acc; }, {});
  const pageMap = {};
  pageViews.forEach((event) => { const path = event.path.split("?")[0]; const row = pageMap[path] ||= { path, title: event.title, views: 0, visitors: new Set(), sessions: new Set(), engagementSeconds: 0 }; row.views++; row.visitors.add(event.visitorId); row.sessions.add(event.sessionId); });
  engagement.forEach((event) => { const path = event.path.split("?")[0]; if (pageMap[path]) pageMap[path].engagementSeconds += event.value || 0; });
  const pages = Object.values(pageMap).map((row)=>({ ...row, visitors: row.visitors.size, sessions: row.sessions.size, averageEngagement: row.sessions.size ? row.engagementSeconds / row.sessions.size : 0 })).sort((a,b)=>b.views-a.views);
  const trendMap = {};
  pageViews.forEach((event)=>{ const day = event.createdAt.toISOString().slice(0,10); const row = trendMap[day] ||= { date: day, views: 0, visitors: new Set(), sessions: new Set() }; row.views++; row.visitors.add(event.visitorId); row.sessions.add(event.sessionId); });
  const vitals = {};
  events.filter((event)=>event.name === "web_vital").forEach((event)=>{ const metric = event.metadata?.metric; if (metric) (vitals[metric] ||= []).push(event.value || 0); });
  const outbound = events.filter((event)=>event.name === "outbound_click");
  const errorEvents = events.filter((event)=>event.name === "browser_error" || event.name === "resource_error");
  const platform = (pattern) => outbound.filter((event)=>pattern.test(event.metadata?.url || "")).length;
  const sessionMap = new Map(sessions.map((session) => [session.id, session]));
  const cleanPath = (value = "") => value.split("?")[0] || "/";
  const sessionSource = (session) => session?.source || (session?.referrer ? (() => { try { return new URL(session.referrer).hostname; } catch { return "Referral"; } })() : "Direct");
  const attributionMap = new Map();
  const attributionKey = (source, medium, campaign, path) => `${source}\u0000${medium}\u0000${campaign}\u0000${path}`;
  pageViews.forEach((event) => {
    const session = sessionMap.get(event.sessionId);
    const source = sessionSource(session);
    const path = cleanPath(event.path);
    const medium = session?.medium || "—";
    const campaign = session?.campaign || "—";
    const key = attributionKey(source, medium, campaign, path);
    const row = attributionMap.get(key) || { source, medium, campaign, path, title: event.title, pageViews: 0, visitors: new Set(), sessions: new Set(), totalEngagementSeconds: 0 };
    row.pageViews += 1;
    row.visitors.add(event.visitorId);
    row.sessions.add(event.sessionId);
    attributionMap.set(key, row);
  });
  engagement.forEach((event) => {
    const session = sessionMap.get(event.sessionId);
    const key = attributionKey(sessionSource(session), session?.medium || "—", session?.campaign || "—", cleanPath(event.path));
    const row = attributionMap.get(key);
    if (row) row.totalEngagementSeconds += event.value || 0;
  });
  const sourcePages = [...attributionMap.values()].map((row) => ({
    ...row,
    visitors: row.visitors.size,
    sessions: row.sessions.size,
    averageEngagementSeconds: row.sessions.size ? row.totalEngagementSeconds / row.sessions.size : 0,
  })).sort((a, b) => b.pageViews - a.pageViews || b.totalEngagementSeconds - a.totalEngagementSeconds);
  const identifyPlatform = (url = "") => /youtube|youtu\.be/i.test(url) ? "YouTube" : /spotify/i.test(url) ? "Spotify" : /podcasts\.apple|apple\.com/i.test(url) ? "Apple Podcasts" : null;
  const conversionMap = new Map();
  outbound.forEach((event) => {
    const destination = event.metadata?.url || "";
    const platformName = identifyPlatform(destination);
    if (!platformName) return;
    const session = sessionMap.get(event.sessionId);
    const path = cleanPath(event.path);
    const source = sessionSource(session);
    const key = `${platformName}\u0000${path}\u0000${source}`;
    const row = conversionMap.get(key) || { platform: platformName, path, source, clicks: 0, visitors: new Set(), destination };
    row.clicks += 1;
    row.visitors.add(event.visitorId);
    conversionMap.set(key, row);
  });
  const platformConversions = [...conversionMap.values()].map((row) => ({ ...row, visitors: row.visitors.size })).sort((a, b) => b.clicks - a.clicks);
  const bounced = sessions.filter((session)=>viewsBySession[session.id] === 1 && !(engagedBySession[session.id] >= 10)).length;
  return {
    summary: { visitors: unique(pageViews.map((e)=>e.visitorId)), sessions: unique(pageViews.map((e)=>e.sessionId)), pageViews: pageViews.length, pagesPerSession: pageViews.length / Math.max(unique(pageViews.map((e)=>e.sessionId)),1), averageEngagement: Object.values(engagedBySession).reduce((a,b)=>a+b,0)/Math.max(Object.keys(engagedBySession).length,1), bounceRate: sessions.length ? bounced/sessions.length : 0, events: events.length },
    realtime: { visitors: unique(realtime.map((e)=>e.sessionId)), pages: countBy(realtime, (e)=>e.path).slice(0,10) },
    trend: Object.values(trendMap).map((row)=>({ date: row.date, views: row.views, visitors: row.visitors.size, sessions: row.sessions.size })),
    pages, sources: countBy(sessions, (s)=>s.source || (s.referrer ? new URL(s.referrer, "https://direct.local").hostname : "Direct" )).slice(0,12), referrers: countBy(sessions.filter((s)=>s.referrer), (s)=>{ try{return new URL(s.referrer).hostname}catch{return "Other"} }).slice(0,12), campaigns: countBy(sessions.filter((s)=>s.campaign), (s)=>s.campaign).slice(0,12), devices: countBy(sessions, (s)=>s.deviceType), browsers: countBy(sessions, (s)=>s.browser), operatingSystems: countBy(sessions, (s)=>s.operatingSystem), countries: countBy(sessions, (s)=>s.country).slice(0,12),
    platforms: { youtube: platform(/youtube|youtu\.be/i), spotify: platform(/spotify/i), apple: platform(/podcasts\.apple|apple\.com/i) },
    sourcePages,
    platformConversions,
    events: countBy(events, (e)=>e.name), scrollDepth: { 25: events.filter((e)=>e.name === "scroll_depth" && e.value >= 25).length, 50: events.filter((e)=>e.name === "scroll_depth" && e.value >= 50).length, 75: events.filter((e)=>e.name === "scroll_depth" && e.value >= 75).length, 100: events.filter((e)=>e.name === "scroll_depth" && e.value >= 100).length },
    webVitals: Object.fromEntries(Object.entries(vitals).map(([name,values])=>[name,{ p75: percentile(values), samples: values.length }])),
    errors: {
      total: errorEvents.length,
      pages: countBy(errorEvents, (event)=>event.path).slice(0,25),
      recent: errorEvents.slice(-50).reverse().map((event)=>({
        type: event.name,
        path: event.path,
        message: clean(event.metadata?.message || event.metadata?.source || "Unknown browser error", 500),
        source: clean(event.metadata?.source, 500),
        line: event.metadata?.line || null,
        createdAt: event.createdAt,
      })),
    },
  };
}

module.exports = { collect, report };
