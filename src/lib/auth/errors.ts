export class AuthenticationRequiredError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED";

  constructor() {
    super("An authenticated user is required.");
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthorizationDeniedError extends Error {
  readonly code = "AUTHORIZATION_DENIED";

  constructor() {
    super("An active internal membership is required.");
    this.name = "AuthorizationDeniedError";
  }
}

export class AuthorizationLookupError extends Error {
  readonly code = "AUTHORIZATION_LOOKUP_FAILED";

  constructor() {
    super("Authorization data could not be verified.");
    this.name = "AuthorizationLookupError";
  }
}
