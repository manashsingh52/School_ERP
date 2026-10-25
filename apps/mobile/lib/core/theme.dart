import 'package:flutter/material.dart';

/// Design tokens from packages/ui/src/styles.css (docs/07 §1) as Flutter themes. The school's
/// accent is the only per-school input; everything else is shared. Body text is 15 for touch.
class Tokens {
  static const lightBg = Color(0xFFF7F7F8), lightSurface = Color(0xFFFFFFFF), lightSubtle = Color(0xFFEFEFF1);
  static const lightBorder = Color(0xFFE4E4E7), lightText = Color(0xFF18181B), lightText2 = Color(0xFF52525B), lightText3 = Color(0xFF71717A);
  static const darkBg = Color(0xFF0B0B0D), darkSurface = Color(0xFF141417), darkSubtle = Color(0xFF1C1C20);
  static const darkBorder = Color(0xFF26262B), darkText = Color(0xFFF4F4F5), darkText2 = Color(0xFFA1A1AA), darkText3 = Color(0xFF8B8B94);
  static const success = Color(0xFF15803D), warning = Color(0xFFB45309), danger = Color(0xFFB91C1C), info = Color(0xFF1D4ED8);
  static const successDark = Color(0xFF4ADE80), warningDark = Color(0xFFFBBF24), dangerDark = Color(0xFFF87171), infoDark = Color(0xFF60A5FA);
}

Color parseHex(String? hex) {
  final h = (hex ?? '').replaceFirst('#', '');
  return h.length == 6 ? Color(int.parse('FF$h', radix: 16)) : const Color(0xFF0F5338);
}

/// Semantic status colours that stay readable in both themes.
class StatusColors extends ThemeExtension<StatusColors> {
  const StatusColors({required this.success, required this.warning, required this.danger, required this.info, required this.subtle, required this.border, required this.muted});
  final Color success, warning, danger, info, subtle, border, muted;

  static StatusColors of(BuildContext context) => Theme.of(context).extension<StatusColors>()!;

  @override
  StatusColors copyWith() => this;
  @override
  StatusColors lerp(StatusColors? other, double t) => other ?? this;
}

ThemeData buildTheme(Brightness brightness, Color accent) {
  final dark = brightness == Brightness.dark;
  final scheme = ColorScheme.fromSeed(seedColor: accent, brightness: brightness).copyWith(
    primary: accent,
    onPrimary: Colors.white,
    surface: dark ? Tokens.darkSurface : Tokens.lightSurface,
    onSurface: dark ? Tokens.darkText : Tokens.lightText,
    onSurfaceVariant: dark ? Tokens.darkText2 : Tokens.lightText2,
    outline: dark ? Tokens.darkBorder : Tokens.lightBorder,
    outlineVariant: dark ? Tokens.darkBorder : Tokens.lightBorder,
    error: dark ? Tokens.dangerDark : Tokens.danger,
  );
  const radius = BorderRadius.all(Radius.circular(18));
  final border = dark ? Tokens.darkBorder : Tokens.lightBorder;
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: dark ? Tokens.darkBg : Tokens.lightBg,
    textTheme: Typography.material2021(platform: TargetPlatform.android).black.apply(bodyColor: scheme.onSurface, displayColor: scheme.onSurface).copyWith(
          bodyLarge: TextStyle(fontSize: 16, color: scheme.onSurface),
          bodyMedium: TextStyle(fontSize: 15, color: scheme.onSurface),
          bodySmall: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
        ),
    appBarTheme: AppBarTheme(backgroundColor: dark ? Tokens.darkSurface : Tokens.lightSurface, foregroundColor: scheme.onSurface, elevation: 0, scrolledUnderElevation: 0.5, centerTitle: false),
    cardTheme: CardThemeData(color: scheme.surface, elevation: 0, margin: EdgeInsets.zero, shape: RoundedRectangleBorder(borderRadius: radius, side: BorderSide(color: border))),
    dividerTheme: DividerThemeData(color: border, space: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surface,
      border: OutlineInputBorder(borderRadius: const BorderRadius.all(Radius.circular(8)), borderSide: BorderSide(color: border)),
      enabledBorder: OutlineInputBorder(borderRadius: const BorderRadius.all(Radius.circular(8)), borderSide: BorderSide(color: border)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(minimumSize: const Size(64, 48), shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(8))))),
    outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: const Size(64, 48), side: BorderSide(color: border), shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(8))))),
    navigationBarTheme: NavigationBarThemeData(backgroundColor: scheme.surface, indicatorColor: accent.withValues(alpha: 0.14), height: 64),
    bottomSheetTheme: const BottomSheetThemeData(shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16)))),
    extensions: [
      StatusColors(
        success: dark ? Tokens.successDark : Tokens.success,
        warning: dark ? Tokens.warningDark : Tokens.warning,
        danger: dark ? Tokens.dangerDark : Tokens.danger,
        info: dark ? Tokens.infoDark : Tokens.info,
        subtle: dark ? Tokens.darkSubtle : Tokens.lightSubtle,
        border: border,
        muted: dark ? Tokens.darkText3 : Tokens.lightText3,
      ),
    ],
  );
}
