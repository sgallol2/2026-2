import { parse } from "cookie";
import { jwtVerify } from "jose";
import { config } from "../config/env.js";

const secretKey = new TextEncoder().encode(config.auth.jwt.secret);

export const sessionContext = async (req, res, next) => {
  void res;
  req.auth = undefined;
  req.authState = "anonymous";

  const cookies = parse(req.headers.cookie ?? "");
  const token =
    cookies[config.auth.cookie.name] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    next();
    return;
  }

  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: config.auth.jwt.issuer,
      audience: config.auth.jwt.audience,
      algorithms: [config.auth.jwt.algorithm],
    });

    req.auth = {
      customerId: payload.sub,
      sessionId: payload.sid,
    };
    req.authState = "authenticated";
  } catch {
    req.authState = "invalid";
  }

  next();
};

export const authenticate = (req, res, next) => {
  void res;
  if (req.auth) {
    next();
    return;
  }

  res.status(401).json({
    error: {
      code: "AUTH_REQUIRED",
      message: "Authentication is required to perform this action",
    },
  });
};

