export interface AcceptInvitationActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
  switchToMode?: "sign_in" | "create";
}
