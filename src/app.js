const dotenv = require("dotenv");
dotenv.config();

require("./config/database");
const express = require("express");
const app = express();
const cors = require("cors");

// Nginx connects to this process locally. Trust that single reverse-proxy hop
// so req.ip is the real visitor address without trusting spoofed client headers.
app.set("trust proxy", "loopback");

const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://thepropertyportfolio.com.au",
  "https://www.thepropertyportfolio.com.au",
  ...(process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean),
]);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));

app.use(express.json({ limit: "2000mb" }));
app.use(express.urlencoded({ extended: true, limit: "2000mb" }));

const { collectAnalytics } = require("./controllers/analyticsController");
app.post("/api/analytics/collect", collectAnalytics);

const configuredPort = Number.parseInt(process.env.PORT || "", 10);
const PORT = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535
  ? configuredPort
  : 5000;

app.use("/api", require("./routes/userRoutes"));
app.use("/", require("./routes/rssRoutes"));
app.use("/api", require("./routes/fileRoutes"));
app.use("/api", require("./routes/subscriberRoutes"));
app.use("/api", require("./routes/contactRoutes"));
app.use("/api", require("./routes/adminRoutes"));
app.use("/api", require("./routes/largeUploadRoutes"));

app.get("/", (req, res) => {
  res.json({
    msg: "Hello World",
    status: 200,
  });
});

const server = app.listen(PORT, () => console.log("Server is running at port : " + PORT));
server.timeout = 360000;

const { startTranscriptionWorker } = require("./services/transcriptionService");
startTranscriptionWorker().catch((error) => console.error("Unable to start WhisperX worker:", error));
