import { serialize } from "cookie";
import { AppError } from "../../shared/AppError.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

const toPublicCustomer = (customer) => ({
  customerId: customer.customer_id,
  firstName: customer.first_name,
  lastName: customer.last_name,
  email: customer.email,
  city: customer.city,
  country: customer.country,
});

export const createAuthController = (authService, customerRepo, config) => {
  const login = async (req, res) => {
    const rawEmail = req.body?.email;
    if (typeof rawEmail !== "string" || !EMAIL_PATTERN.test(rawEmail.trim())) {
      throw new AppError("A valid email is required", 400, "INVALID_EMAIL");
    }

    const email = rawEmail.trim();
    const customer = await customerRepo.findCustomerByEmail(email);

    if (!customer) {
      throw new AppError("Unable to sign in with the provided email", 401, "INVALID_LOGIN");
    }

    const { token } = await authService.createSessionToken(customer.customer_id);

    const cookieHeader = serialize(config.auth.cookie.name, token, {
      httpOnly: config.auth.cookie.httpOnly,
      secure: config.auth.cookie.secure,
      sameSite: config.auth.cookie.sameSite,
      path: config.auth.cookie.path,
      maxAge: config.auth.jwt.ttlSeconds,
    });

    res.setHeader("Set-Cookie", cookieHeader);
    res.status(200).json(toPublicCustomer(customer));
  };

  const logout = async (req, res) => {
    const cookieHeader = serialize(config.auth.cookie.name, "", {
      httpOnly: config.auth.cookie.httpOnly,
      secure: config.auth.cookie.secure,
      sameSite: config.auth.cookie.sameSite,
      path: config.auth.cookie.path,
      maxAge: 0,
    });

    res.setHeader("Set-Cookie", cookieHeader);
    res.status(204).send();
  };

  const getCurrentCustomer = async (req, res) => {
    const customerId = req.auth?.customerId;
    if (!customerId) {
      throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
    }

    const customer = await customerRepo.findCustomerById(customerId);
    if (!customer) {
      throw new AppError("Customer not found", 404, "CUSTOMER_NOT_FOUND");
    }

    res.status(200).json(toPublicCustomer(customer));
  };

  return {
    login,
    logout,
    getCurrentCustomer,
  };
};

