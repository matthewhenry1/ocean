const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf } = format;

// Define the custom format for the log messages
const customFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

// Create a logger instance
const logger = createLogger({
  level: 'info', // Set the minimum log level
  format: combine(
    timestamp(),
    customFormat
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'log.log' })
  ],
});

module.exports = logger;