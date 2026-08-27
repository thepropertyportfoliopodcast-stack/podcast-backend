const ADMIN_PERMISSIONS = Object.freeze({
  DASHBOARD: "dashboard",
  ANALYTICS: "analytics",
  PODCASTS: "podcasts",
  TRANSCRIPTS: "transcripts",
  HOSTS: "hosts",
  ENQUIRIES: "enquiries",
  SUBSCRIBERS: "subscribers",
});

const ALL_ADMIN_PERMISSIONS = Object.freeze(Object.values(ADMIN_PERMISSIONS));
const normalizePermissions = (values) => [...new Set((Array.isArray(values) ? values : []).filter((value) => ALL_ADMIN_PERMISSIONS.includes(value)))];

module.exports = { ADMIN_PERMISSIONS, ALL_ADMIN_PERMISSIONS, normalizePermissions };
