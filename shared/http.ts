import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";

type AsyncRoute = (request: Request, response: Response) => Promise<void>;

export function asyncRoute(route: AsyncRoute): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    void route(request, response).catch(next);
  };
}

export function sendJson(response: Response, value: unknown): void {
  response
    .type("application/json")
    .send(
      JSON.stringify(value, (_key, item) =>
        typeof item === "bigint" ? item.toString() : item,
      ),
    );
}

export function createErrorHandler(
  fallbackMessage = "Unknown request error",
): ErrorRequestHandler {
  return (error, _request, response, _next) => {
    const message =
      error instanceof Error ? error.message : fallbackMessage;
    response.status(400).json({ error: message });
  };
}
