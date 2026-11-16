const formatLog = (level, message, details = {}) => {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    message,
    ...details,
  };
  return JSON.stringify(entry);
};

export const logger = {
  info(message, details) {
    console.log(formatLog("info", message, details));
  },
  warn(message, details) {
    console.warn(formatLog("warn", message, details));
  },
  error(message, details) {
    console.error(formatLog("error", message, details));
  },
};

