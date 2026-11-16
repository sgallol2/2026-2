import express from "express";
import { authenticate } from "../middleware/sessionContext.js";

export const createOrderRoutes = (orderController) => {
  const router = express.Router();

  router.use(authenticate);

  router.post("/", orderController.createOrder);
  router.get("/", orderController.getOrders);
  router.get("/:orderId", orderController.getOrderById);

  return router;
};

