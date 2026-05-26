const winston = require('winston');
const fs = require("fs");
const path = require("path");

const logsDir = path.resolve(__dirname, "..", "..", "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const levelFilter = (level) => {
  return winston.format((info) => {
    return info.level === level ? info : false;
  })();
};

const Loggers = winston.createLogger({
  levels: winston.config.npm.levels, 
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: 'error',
      format: levelFilter('error'),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "warn.log"),
      level: 'warn',
      format: levelFilter('warn'),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "info.log"),
      level: 'info',
      format: levelFilter('info'),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "http.log"),
      level: 'http',
      format: levelFilter('http'),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "verbose.log"),
      level: 'verbose',
      format: levelFilter('verbose'),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "debug.log"),
      level: 'debug',
      format: levelFilter('debug'),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "silly.log"),
      level: 'silly',
      format: levelFilter('silly'),
    }),
  ],
});

module.exports = Loggers;

// Loggers.error("This is an error message");
// Loggers.warn("This is a warning message");
// Loggers.info("This is some informational message");
// Loggers.http("This is an HTTP log");
// Loggers.verbose("This is a verbose message");
// Loggers.debug("This is a debug message");
// Loggers.silly("This is a silly log message");
