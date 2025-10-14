export const admins = ["nakasar@outlook.fr"];

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return admins.includes(email.toLowerCase());
}
