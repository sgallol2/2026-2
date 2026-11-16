import express from "express";

export const createEventRoutes = (eventController) => {
  const router = express.Router();

  router.post("/", eventController.recordEvent);

  return router;
};

