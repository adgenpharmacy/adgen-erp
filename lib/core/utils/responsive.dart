import 'package:flutter/material.dart';

/// Responsive breakpoints for AdGen Pharmacy ERP
class Responsive {
  // Breakpoints
  static const double mobileMax = 600;
  static const double tabletMax = 1024;

  static bool isMobile(BuildContext context) =>
      MediaQuery.of(context).size.width < mobileMax;

  static bool isTablet(BuildContext context) {
    final w = MediaQuery.of(context).size.width;
    return w >= mobileMax && w < tabletMax;
  }

  static bool isDesktop(BuildContext context) =>
      MediaQuery.of(context).size.width >= tabletMax;

  static bool isSmall(BuildContext context) =>
      MediaQuery.of(context).size.width < tabletMax;

  /// Returns a value based on current screen size
  static T value<T>(
    BuildContext context, {
    required T mobile,
    T? tablet,
    required T desktop,
  }) {
    if (isMobile(context)) return mobile;
    if (isTablet(context)) return tablet ?? desktop;
    return desktop;
  }

  /// Number of columns for grid layout
  static int gridColumns(BuildContext context) =>
      value(context, mobile: 1, tablet: 2, desktop: 4);

  /// Screen padding
  static double screenPadding(BuildContext context) =>
      value(context, mobile: 16.0, tablet: 20.0, desktop: 24.0);

  /// Card aspect ratio for stat cards
  static double statCardRatio(BuildContext context) =>
      value(context, mobile: 1.7, tablet: 1.5, desktop: 1.4);
}

/// Responsive builder that exposes screen size category
class ResponsiveBuilder extends StatelessWidget {
  final Widget Function(BuildContext, bool isMobile, bool isTablet, bool isDesktop) builder;

  const ResponsiveBuilder({super.key, required this.builder});

  @override
  Widget build(BuildContext context) {
    return builder(
      context,
      Responsive.isMobile(context),
      Responsive.isTablet(context),
      Responsive.isDesktop(context),
    );
  }
}
