const dotenv = require("dotenv");
dotenv.config();

// require("./dbconfigration");
require("./prismaconfig");
const express = require("express");
const app = express();
const cors = require("cors");
// const serverless = require('serverless-http');

const corsOptions = {
  origin: "*", // Allowed origins
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: "*", // Allow all headers
  credentials: true,
  optionsSuccessStatus: 200, // for legacy browsers
};
app.use(cors(corsOptions));

/**
 * IMPORTANT:
 * Disable JSON/urlencoded/body-parsing ONLY for chunk upload PART route
 * so Backblaze receives a real raw binary stream
 */
// const uploadLargeController = require("./controller/largeUploadController");
// app.put("/api/upload/part",
//   express.raw({ type: "*/*", limit: "200000mb" }),
//   uploadLargeController.uploadLargePart
// );

app.use(express.json({ limit: "2000mb" }));
app.use(express.urlencoded({ extended: true, limit: "2000mb" }));
// app.use(express.raw({ type: "application/octet-stream", limit: "0" }));

const PORT = process.env.REACT_APP_SERVER_DOMAIN || 5000;

app.use("/api", require("./route/userRoutes"));
app.use("/", require("./route/rssRoutes"));
app.use("/api", require("./route/fileRoutes"));
app.use("/api", require("./route/subscriberRoutes"));
app.use("/api", require("./route/contactRoutes"));
app.use("/api", require("./route/adminRoutes"));
app.use("/api", require("./route/uploadLarge"));

// require("./cronJobs")();

app.get("/", (req, res) => {
  res.json({
    msg: "Hello World",
    status: 200,
  });
});

const server = app.listen(PORT, () => console.log("Server is running at port : " + PORT));
server.timeout = 360000;