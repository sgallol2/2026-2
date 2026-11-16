import express from "express";

export const createBookRoutes = (bookController, stockController) => {
  const router = express.Router();

  // Endpoints públicos de consulta
  router.get("/", bookController.getBooks);
  router.get("/:isbn", bookController.getBookByIsbn);

  // Endpoints de Saga (usados internamente por Orders Service)
  router.post("/reserve-stock", stockController.reserveStock);
  router.post("/release-stock", stockController.releaseStock);

  return router;
};

