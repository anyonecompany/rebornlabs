import { describe, expect, test } from "vitest";
import { hasRole, requireRole, AuthError, type VerifiedUser, type UserRole } from "./verify";

const ROLES: UserRole[] = [
  "admin",
  "director",
  "team_leader",
  "staff",
  "dealer",
  "pending",
];

function user(role: UserRole): VerifiedUser {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: "test@example.com",
    name: "Test",
    role,
    isActive: true,
    mustChangePassword: false,
  };
}

describe("hasRole", () => {
  test("returns true when role is in allowed list", () => {
    expect(hasRole(user("admin"), ["admin", "staff"])).toBe(true);
    expect(hasRole(user("director"), ["director", "team_leader"])).toBe(true);
  });

  test("returns false when role is not in allowed list", () => {
    expect(hasRole(user("dealer"), ["admin", "staff"])).toBe(false);
    expect(hasRole(user("pending"), ["admin", "staff", "director", "team_leader"])).toBe(false);
  });

  test("empty allowed list always returns false", () => {
    for (const role of ROLES) {
      expect(hasRole(user(role), [])).toBe(false);
    }
  });
});

describe("requireRole", () => {
  test("does not throw when role is allowed", () => {
    expect(() => requireRole(user("admin"), ["admin"])).not.toThrow();
    expect(() => requireRole(user("director"), ["admin", "director", "team_leader"])).not.toThrow();
  });

  test("throws AuthError(FORBIDDEN) when role is not allowed", () => {
    try {
      requireRole(user("dealer"), ["admin"]);
      expect.fail("requireRole should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).code).toBe("FORBIDDEN");
    }
  });

  test("pending is rejected from all admin/manager routes", () => {
    expect(() => requireRole(user("pending"), ["admin"])).toThrow(AuthError);
    expect(() => requireRole(user("pending"), ["admin", "staff"])).toThrow(AuthError);
    expect(() =>
      requireRole(user("pending"), ["admin", "staff", "director", "team_leader"]),
    ).toThrow(AuthError);
  });
});
