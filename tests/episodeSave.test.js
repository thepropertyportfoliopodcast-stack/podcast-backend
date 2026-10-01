const assert = require("node:assert/strict");
const { test, beforeEach } = require("node:test");
const mock = (path, exports) => { require.cache[require.resolve(path)] = { id: require.resolve(path), filename: require.resolve(path), loaded: true, exports }; };
let records, phones, uploaded, deleted, failUpload, failPhone;
const db = {
  podcast: { findUnique: async ({ where }) => where.id === 1 ? { id: 1 } : null },
  episode: {
    create: async ({ data }) => { const row = { id: records.length + 1, ...data }; records.push(row); return row; },
    update: async ({ where, data }) => { const row = records.find((row) => row.uuid === where.uuid); Object.assign(row, data); return { ...row }; },
    findUnique: async ({ where }) => { const row = records.find((row) => row.uuid === where.uuid); return row ? { ...row, heroPhones: phones.filter((phone) => phone.episodeId === row.id) } : null; },
  },
  heroPhone: {
    findMany: async ({ where }) => phones.filter((row) => row.episodeId === where.episodeId),
    create: async ({ data }) => { if (failPhone) throw new Error("Phone write failed"); const row = { id: phones.length + 1, ...data }; phones.push(row); return row; },
    update: async ({ where, data }) => { if (failPhone) throw new Error("Phone write failed"); const row = phones.find((row) => row.id === where.id); Object.assign(row, data); return row; },
    deleteMany: async () => {},
  },
  $transaction: async (fn) => {
    const snapshot = structuredClone({ records, phones });
    try { return await fn(db); } catch (error) { records = snapshot.records; phones = snapshot.phones; throw error; }
  },
};
mock("../src/config/database", db);
mock("../src/services/storageService", {
  uploadFileToSpaces: async (file) => { uploaded.push(file.fieldname); return failUpload ? null : `https://storage.test/${file.fieldname}`; },
  deleteFileFromSpaces: async (url) => { deleted.push(url); return true; },
});
mock("../src/services/mediaDurationService", {});
mock("../src/utils/slug", { createUniqueSlug: async () => "test-episode" });
mock("../src/services/transcriptionService", { enqueueEpisodeTranscription: async () => {}, STATUS: { PENDING: "PENDING", QUEUED: "QUEUED" } });
const controller = require("../src/controllers/adminController");
const invoke = (method, body, files = [], params = {}) => new Promise((resolve, reject) => {
  const res = { status(code) { this.code = code; return this; }, json(value) { resolve({ code: this.code, ...value }); } };
  controller[method]({ body, files, params }, res, reject);
});
const draft = { title: "Unfinished episode", podcastId: "1", publicationStatus: "DRAFT" };
const phone = { title: "", youtubeVideoUrl: "" };
beforeEach(() => { records = []; phones = []; uploaded = []; deleted = []; failUpload = false; failPhone = false; });

test("title-only drafts save without files or media", async () => {
  const result = await invoke("AddEpisode", draft);
  assert.equal(result.code, 201);
  assert.equal(records[0].publicationStatus, "DRAFT");
  assert.equal(records[0].thumbnail, "");
  assert.deepEqual(uploaded, []);
});

test("drafts preserve unfinished hero phone entries", async () => {
  const result = await invoke("AddEpisode", { ...draft, homePageHeroPhone: "true", heroPhones: JSON.stringify([phone]) });
  assert.equal(result.code, 201);
  assert.equal(phones[0].youtubeVideoUrl, "");
  assert.equal(phones[0].title, draft.title);
});

test("invalid podcast selections return 400 before uploads or writes", async () => {
  assert.equal((await invoke("AddEpisode", { ...draft, podcastId: "undefined" })).code, 400);
  assert.equal(records.length, 0);
});

test("incomplete published hero phones fail validation before the episode is created", async () => {
  const result = await invoke("AddEpisode", { ...draft, publicationStatus: "PUBLISHED", description: "Description", detail: "Details", topic: "Property", link: "https://storage.test/video", audio: "https://storage.test/audio", homePageHeroPhone: "true", heroPhones: JSON.stringify([phone]) }, [{ fieldname: "thumbnail" }]);
  assert.equal(result.code, 400);
  assert.equal(records.length, 0);
});

test("phone database failures roll back episode creation", async () => {
  failPhone = true;
  const result = await invoke("AddEpisode", { ...draft, homePageHeroPhone: "true", heroPhones: JSON.stringify([phone]) });
  assert.equal(result.code, 500);
  assert.equal(records.length, 0);
});

test("failed phone uploads return 502 without creating an episode", async () => {
  failUpload = true;
  const result = await invoke("AddEpisode", { ...draft, homePageHeroPhone: "true", heroPhones: JSON.stringify([phone]) }, [{ fieldname: "heroPhoneVideo_0" }]);
  assert.equal(result.code, 502);
  assert.equal(records.length, 0);
});

test("shared artwork uploads once and is saved to both image fields", async () => {
  const result = await invoke("AddEpisode", { ...draft, sharedWebsiteArtwork: "true" }, [{ fieldname: "websiteThumbnail" }]);
  assert.equal(result.code, 201);
  assert.deepEqual(uploaded, ["websiteThumbnail"]);
  assert.equal(records[0].homepageThumbnail, records[0].websiteThumbnail);
});

test("failed updates preserve the episode and its existing audio", async () => {
  await invoke("AddEpisode", { ...draft, audio: "https://storage.test/old-audio" });
  const uuid = records[0].uuid;
  failPhone = true;
  const result = await invoke("UpdateEpisode", { title: "Changed", audio: "https://storage.test/new-audio", homePageHeroPhone: "true", heroPhones: JSON.stringify([phone]) }, [], { id: uuid });
  assert.equal(result.code, 500);
  assert.equal(records[0].title, draft.title);
  assert.equal(records[0].audio, "https://storage.test/old-audio");
  assert.deepEqual(deleted, []);
});

test("editing a draft retains unfinished phones and updates inherited shared artwork", async () => {
  await invoke("AddEpisode", { ...draft, sharedWebsiteArtwork: "true", homePageHeroPhone: "true", heroPhones: JSON.stringify([phone]) }, [{ fieldname: "websiteThumbnail" }]);
  records[0].homepageThumbnail = records[0].websiteThumbnail = phones[0].thumbnail = "https://storage.test/old-artwork";
  const result = await invoke("UpdateEpisode", { title: "Revised draft", sharedWebsiteArtwork: "true", heroPhones: JSON.stringify([{ ...phone, uuid: phones[0].uuid }]) }, [{ fieldname: "websiteThumbnail" }], { id: records[0].uuid });
  assert.equal(result.code, 200);
  assert.equal(records[0].publicationStatus, "DRAFT");
  assert.equal(records[0].homepageThumbnail, records[0].websiteThumbnail);
  assert.equal(phones[0].thumbnail, records[0].homepageThumbnail);
  assert.equal(phones[0].youtubeVideoUrl, "");
});
