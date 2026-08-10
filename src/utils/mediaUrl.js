const encodeMediaUrl = (value) => {
  if (!value || typeof value !== "string") return value;

  try {
    const url = new URL(value);
    url.pathname = url.pathname
      .split("/")
      .map((segment) => {
        try {
          return encodeURIComponent(decodeURIComponent(segment));
        } catch {
          return encodeURIComponent(segment);
        }
      })
      .join("/");
    return url.toString();
  } catch {
    return value;
  }
};

const sanitizeMediaFileName = (value = "file") => {
  const safe = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\.]+|[_\.]+$/g, "");

  return safe || "file";
};

module.exports = { encodeMediaUrl, sanitizeMediaFileName };
