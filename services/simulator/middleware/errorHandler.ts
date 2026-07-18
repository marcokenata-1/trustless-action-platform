import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  const message =
    error instanceof Error ? error.message : "Unknown simulator error";
  response.status(400).json({ error: message });
};
