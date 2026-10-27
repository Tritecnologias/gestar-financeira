// Same identity policy already used by invitation activation. Do not trim passwords.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;
export const PASSWORD_POLICY_MESSAGE = "Use uma senha de 12 a 200 caracteres.";
export function validIdentityPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH;
}
