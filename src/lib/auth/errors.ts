import type { Permission } from "./permissions";

export class ForbiddenError extends Error {
  constructor(public permission: Permission) {
    super(`You do not have permission to do this (${permission}).`);
    this.name = "ForbiddenError";
  }
}
