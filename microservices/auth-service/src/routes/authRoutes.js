import express from "express";

export const createAuthRoutes = (authController) => {
  const router = express.Router();

  router.post("/login", authController.login);
  router.post("/logout", authController.logout);
  router.get("/me", authController.getCurrentCustomer);

  return router;
};

