import { InlineKeyboard } from "grammy";
import type { Prisma } from "@prisma/client";

type LinkedUser = Prisma.UserGetPayload<{
  include: { roleAssignments: { include: { role: true } }; student: true; employee: true };
}>;

export function roleCodes(user: LinkedUser): string[] {
  const codes = user.roleAssignments.map((a) => a.role.code);
  if (user.student) codes.push("STUDENT");
  // GuardianLink alohida so'rov bilan tekshiriladi (quyida), shuning uchun bu yerda yo'q.
  return [...new Set(codes)];
}

// Har bir rol uchun — tugma matni va bosilganda ishlaydigan callback kodi.
export function buildMainMenu(codes: string[], hasChildren: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (hasChildren) kb.text("👨‍👩‍👦 Farzandlarim", "menu:children").row();
  if (codes.includes("STUDENT")) kb.text("🎓 Mening ma'lumotlarim", "menu:me-student").row();
  if (codes.includes("TEACHER")) kb.text("📚 Mening guruhlarim", "menu:my-groups").row();
  if (codes.some((c) => ["ADMIN", "SUPER_ADMIN", "DIRECTOR"].includes(c))) {
    kb.text("🏢 Boshqaruv", "menu:admin").row();
  }
  kb.text("ℹ️ Profil", "menu:profile");
  return kb;
}
