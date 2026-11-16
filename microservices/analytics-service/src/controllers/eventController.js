import {
  CLIENT_EVENT_TYPES,
  EVENT_FIELD_LIMITS,
  EVENT_SOURCES,
  RESOURCE_TYPES,
  EVENT_SCHEMA_VERSION,
} from "../config/events.js";
import { AppError } from "../../shared/AppError.js";
import { writeClickstreamRecord } from "../logging/clickstreamFileWriter.js";

const clientEventTypes = new Set(CLIENT_EVENT_TYPES);
const resourceTypes = new Set(Object.values(RESOURCE_TYPES));

export const createEventController = () => {
  const recordEvent = (req, res) => {
    const rawEventType = req.body?.event_type;
    const resourceType = req.body?.resource_type;

    if (!rawEventType || !clientEventTypes.has(rawEventType)) {
      throw new AppError("Invalid or unsupported event_type", 400, "INVALID_EVENT");
    }

    if (!resourceType || !resourceTypes.has(resourceType)) {
      throw new AppError("Invalid or unsupported resource_type", 400, "INVALID_RESOURCE");
    }

    const payload = {
      version: EVENT_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      eventType: rawEventType,
      eventSource: EVENT_SOURCES.CLIENT,
      resourceType,
      resourceId: req.body?.resource_id,
      isbn: req.body?.isbn,
      recommendationId: req.body?.recommendation_id,
      modelVersion: req.body?.model_version,
      experimentId: req.body?.experiment_id,
      position: req.body?.position,
      quantity: req.body?.quantity,
      searchQuery: req.body?.search_query,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    };

    // Escribir en el archivo que el sidecar de Fluent Bit lee para Kinesis
    writeClickstreamRecord(payload);

    res.set("Cache-Control", "no-store");
    res.status(204).send();
  };

  return {
    recordEvent,
  };
};

