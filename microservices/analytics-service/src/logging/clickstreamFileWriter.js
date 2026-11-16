import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createWriteStream } from "node:fs";

import { logger } from "../../shared/logger.js";

let stream = null;
let fileAvailable = false;

export const initializeClickstreamFileWriter = async (filePath) => {
  if (!filePath) return;

  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });

  stream = createWriteStream(filePath, {
    flags: "a",
    encoding: "utf8",
  });

  await new Promise((resolve, reject) => {
    const handleOpen = () => {
      fileAvailable = true;
      resolve();
    };
    const handleError = (error) => {
      reject(error);
    };

    stream.once("open", handleOpen);
    stream.once("error", handleError);
  });

  stream.on("error", (error) => {
    fileAvailable = false;
    logger.error("Clickstream file writer error", { path: filePath, error: error.message });
  });

  logger.info("Clickstream file writer initialized for Fluent Bit", { path: filePath });
};

export const writeClickstreamRecord = (record) => {
  if (!stream || !fileAvailable) {
    return false;
  }

  const line = `${JSON.stringify(record)}\n`;
  return stream.write(line);
};

export const closeClickstreamFileWriter = async () => {
  if (!stream) return;

  await new Promise((resolve) => {
    stream.end(resolve);
  });

  stream = null;
  fileAvailable = false;
};

