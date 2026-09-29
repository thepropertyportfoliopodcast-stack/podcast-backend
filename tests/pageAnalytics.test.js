const assert = require("node:assert/strict");
const { test } = require("node:test");

const now = new Date();
const today = now.toISOString().slice(0, 10);
const event = (id, sessionId, path, name = "page_view", value = null, metadata = {}) => ({
  id, sessionId, visitorId: sessionId, path, name, value, metadata, createdAt: now, isResolved: false,
});
const events = [
  event(1, "a", "/episode/one"),
  event(2, "b", "/episode/one?utm_source=email"),
  event(3, "c", "/episode/two"),
  event(4, "a", "/episode/one", "engagement", 20),
  event(5, "c", "/episode/two", "engagement", 100),
  event(6, "a", "/episode/one", "outbound_click", null, { url: "https://youtube.com/watch?v=test" }),
  event(7, "c", "/episode/two", "outbound_click", null, { url: "https://spotify.com/test" }),
  event(8, "a", "/episode/one", "web_vital", 1200, { metric: "LCP" }),
  event(9, "c", "/episode/two", "web_vital", 5000, { metric: "LCP" }),
  event(10, "a", "/episode/one", "browser_error", null, { message: "Page one error" }),
  event(11, "c", "/episode/two", "browser_error", null, { message: "Page two error" }),
];
const sessions = ["a", "b", "c", "no-views"].map((id) => ({ id, visitorId: id, source: id === "c" ? "Other page source" : "Email", deviceType: id === "c" ? "Mobile" : "Desktop" }));
const mock = (path, exports) => { require.cache[require.resolve(path)] = { id: require.resolve(path), filename: require.resolve(path), loaded: true, exports }; };
mock("../src/config/database", {
  analyticsEvent: {
    aggregate: async () => ({ _min: { createdAt: now } }),
    findMany: async ({ where }) => where.isResolved === false ? [] : where.name === "page_view" ? events.filter((row) => row.name === "page_view") : events,
  },
  analyticsSession: { findMany: async () => sessions },
});
mock("../src/services/publicPageCatalogService", { buildPublicPages: async () => [] });
mock("../src/services/analyticsIpExclusionService", {});
const { report } = require("../src/services/firstPartyAnalyticsService");

test("page reports isolate events, sessions, conversions, vitals, errors and realtime", async () => {
  const result = await report({ startDate: today, endDate: today, path: "/episode/one" });
  assert.equal(result.summary.pageViews, 2);
  assert.equal(result.summary.visitors, 2);
  assert.equal(result.summary.sessions, 2);
  assert.equal(result.summary.averageEngagement, 10);
  assert.equal(result.summary.bounceRate, 0.5);
  assert.equal(result.realtime.visitors, 2);
  assert.equal(result.platforms.youtube, 1);
  assert.equal(result.platforms.spotify, 0);
  assert.equal(result.webVitals.LCP.p75, 1200);
  assert.deepEqual(result.sources, [{ label: "Email", value: 2 }]);
  assert.deepEqual(result.devices, [{ label: "Desktop", value: 2 }]);
  assert.equal(result.errors.recent.length, 1);
  assert.equal(result.errors.recent[0].message, "Page one error");
  assert.equal(result.trend[0].views, 2);
  assert.equal(result.sourcePages[0].pageViews, 2);
});

test("pages without traffic return empty metrics without leaking site totals", async () => {
  const result = await report({ startDate: today, endDate: today, path: "/missing" });
  assert.equal(result.summary.pageViews, 0);
  assert.equal(result.summary.averageEngagement, 0);
  assert.equal(result.summary.bounceRate, 0);
  assert.equal(result.realtime.visitors, 0);
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.webVitals, {});
  assert.equal(result.errors.total, 0);
});

test("site-wide averages and bounce rates include only sessions with measured views", async () => {
  const result = await report({ startDate: today, endDate: today });
  assert.equal(result.summary.pageViews, 3);
  assert.equal(result.summary.averageEngagement, 40);
  assert.equal(result.summary.bounceRate, 1 / 3);
  assert.equal(result.sources.reduce((sum, row) => sum + row.value, 0), 3);
});

test("invalid page filters return a validation error", async () => {
  for (const path of [["/episode/one"], "https://example.com/episode/one", "/".repeat(501)]) {
    await assert.rejects(report({ startDate: today, endDate: today, path }), { statusCode: 400 });
  }
});
