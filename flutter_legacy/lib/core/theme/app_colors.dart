import 'package:flutter/material.dart';

/// AdGen Pharmacy ERP — Design System Color Palette
/// "Clinical White — Medical Precision, Premium Feel"
abstract class AppColors {
  // ─── Backgrounds ───────────────────────────────────────────────────────────
  static const Color background    = Color(0xFFF3F8F6);   // soft mint-white
  static const Color surface       = Color(0xFFFFFFFF);   // pure white
  static const Color surface2      = Color(0xFFF0FAF6);   // very light green
  static const Color surface3      = Color(0xFFE6F4EE);   // light green tint
  static const Color surfaceHover  = Color(0xFFEBF5EF);   // hover state

  // ─── Borders & Dividers ────────────────────────────────────────────────────
  static const Color border        = Color(0xFFDFEDE8);
  static const Color borderLight   = Color(0xFFEEF6F2);
  static const Color divider       = Color(0xFFEBF3EF);

  // ─── Primary — Medical Emerald Green ──────────────────────────────────────
  static const Color primary          = Color(0xFF059669);
  static const Color primaryLight     = Color(0xFF34D399);
  static const Color primaryDark      = Color(0xFF047857);
  static const Color primaryContainer = Color(0xFFD1FAE5);
  static const Color primaryGlow      = Color(0x20059669);

  // ─── Secondary — Sky Blue (medical/clinical) ───────────────────────────────
  static const Color secondary          = Color(0xFF0EA5E9);
  static const Color secondaryLight     = Color(0xFF38BDF8);
  static const Color secondaryDark      = Color(0xFF0284C7);
  static const Color secondaryContainer = Color(0xFFE0F2FE);

  // ─── Success — Emerald Green ───────────────────────────────────────────────
  static const Color success          = Color(0xFF059669);
  static const Color successLight     = Color(0xFF34D399);
  static const Color successDark      = Color(0xFF047857);
  static const Color successContainer = Color(0xFFD1FAE5);

  // ─── Warning — Amber ──────────────────────────────────────────────────────
  static const Color warning          = Color(0xFFD97706);
  static const Color warningLight     = Color(0xFFFBBF24);
  static const Color warningDark      = Color(0xFFB45309);
  static const Color warningContainer = Color(0xFFFEF3C7);

  // ─── Error / Danger — Rose ────────────────────────────────────────────────
  static const Color error          = Color(0xFFDC2626);
  static const Color errorLight     = Color(0xFFF87171);
  static const Color errorDark      = Color(0xFFB91C1C);
  static const Color errorContainer = Color(0xFFFEE2E2);

  // ─── AI / Purple → replaced with clinical blue ────────────────────────────
  static const Color ai          = Color(0xFF6366F1);
  static const Color aiLight     = Color(0xFF818CF8);
  static const Color aiDark      = Color(0xFF4F46E5);
  static const Color aiContainer = Color(0xFFEEF2FF);

  // ─── Accent Teal ──────────────────────────────────────────────────────────
  static const Color teal          = Color(0xFF0D9488);
  static const Color tealContainer = Color(0xFFCCFBF1);

  // ─── Text ──────────────────────────────────────────────────────────────────
  static const Color textPrimary   = Color(0xFF0F172A);   // dark navy
  static const Color textSecondary = Color(0xFF475569);   // slate
  static const Color textMuted     = Color(0xFF94A3B8);   // muted slate
  static const Color textDisabled  = Color(0xFFCBD5E1);
  static const Color textInverse   = Color(0xFFFFFFFF);

  // ─── Status specific ───────────────────────────────────────────────────────
  static const Color expired      = Color(0xFFDC2626);
  static const Color expiringSoon = Color(0xFFD97706);
  static const Color inStock      = Color(0xFF059669);
  static const Color lowStock     = Color(0xFFF59E0B);
  static const Color outOfStock   = Color(0xFFDC2626);

  // ─── Schedule Divisions ────────────────────────────────────────────────────
  static const Color scheduleGeneral = Color(0xFF059669);
  static const Color scheduleH       = Color(0xFFD97706);
  static const Color scheduleH1      = Color(0xFFDC2626);
  static const Color scheduleX       = Color(0xFF6366F1);

  // ─── Sidebar ──────────────────────────────────────────────────────────────
  static const Color sidebarBg           = Color(0xFFFFFFFF);
  static const Color sidebarActive       = Color(0xFFECFDF5);
  static const Color sidebarActiveBorder = Color(0xFF059669);

  // ─── Glassmorphism helpers ────────────────────────────────────────────────
  static const Color glassWhite      = Color(0xCCFFFFFF);   // 80% white
  static const Color glassBorder     = Color(0x33059669);   // green glass border
  static final Color shadowSoft      = const Color(0xFF059669).withValues(alpha: 0.08);
  static final Color shadowMedium    = const Color(0xFF0F172A).withValues(alpha: 0.08);

  // ─── Chart colors ─────────────────────────────────────────────────────────
  static const List<Color> chartColors = [
    Color(0xFF059669),
    Color(0xFF0EA5E9),
    Color(0xFFD97706),
    Color(0xFF6366F1),
    Color(0xFF0D9488),
    Color(0xFFDC2626),
  ];
}
