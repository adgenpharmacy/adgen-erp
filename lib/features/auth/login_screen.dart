import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/providers/auth_provider.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_text_field.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _isLoading = false;
  String? _errorMessage;
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final error = await ref.read(authNotifierProvider.notifier).signIn(
          _emailController.text,
          _passwordController.text,
        );

    if (mounted) {
      setState(() => _isLoading = false);
      if (error == 'pending_approval') {
        setState(() => _errorMessage =
            'Your account is pending admin approval. Please contact your administrator.');
      } else if (error != null) {
        setState(() => _errorMessage = error);
      } else {
        context.go('/attendance');
      }
    }
  }

  void _showRegisterSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _RegisterSheet(ref: ref),
    );
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    final isMobile = width < 600;

    if (isMobile) {
      return Scaffold(
        backgroundColor: AppColors.surface,
        body: SingleChildScrollView(
          child: Column(
            children: [
              // Compact gradient header with logo
              Container(
                height: 200,
                width: double.infinity,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF047857), Color(0xFF059669), Color(0xFF0EA5E9)],
                    stops: [0.0, 0.55, 1.0],
                  ),
                ),
                child: Stack(
                  children: [
                    Positioned.fill(child: CustomPaint(painter: _MedicalGridPainter())),
                    Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Container(
                            width: 56,
                            height: 56,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.15),
                                  blurRadius: 16,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            child: const Icon(Icons.local_pharmacy_rounded,
                                color: AppColors.primary, size: 28),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'AdGen ERP',
                            style: AppTypography.h2.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          Text(
                            'Pharmacy Management',
                            style: AppTypography.caption
                                .copyWith(color: Colors.white.withValues(alpha: 0.8)),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              // Login form
              _buildLoginForm(),
            ],
          ),
        ),
      );
    }

    // Desktop: side-by-side
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Row(
        children: [
          Expanded(flex: 5, child: _buildBrandPanel()),
          Expanded(flex: 4, child: _buildLoginForm()),
        ],
      ),
    );
  }

  Widget _buildBrandPanel() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF047857), // deep emerald
            Color(0xFF059669), // emerald
            Color(0xFF0EA5E9), // sky blue
          ],
          stops: [0.0, 0.55, 1.0],
        ),
      ),
      child: Stack(
        children: [
          // Subtle mesh pattern
          Positioned.fill(child: CustomPaint(painter: _MedicalGridPainter())),

          // Animated soft orbs
          AnimatedBuilder(
            animation: _pulseController,
            builder: (_, __) {
              final v = _pulseController.value;
              return Stack(
                children: [
                  Positioned(
                    top: -60 + (v * 30),
                    right: -60 + (v * 20),
                    child: Container(
                      width: 320,
                      height: 320,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            Colors.white.withValues(alpha: 0.12),
                            Colors.transparent,
                          ],
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: -80 + (v * 20),
                    left: -40 + (v * 10),
                    child: Container(
                      width: 280,
                      height: 280,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            Colors.white.withValues(alpha: 0.08),
                            Colors.transparent,
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),

          // Content
          Padding(
            padding: const EdgeInsets.all(AppSpacing.huge),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo + cross
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.15),
                        blurRadius: 24,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.local_pharmacy_rounded,
                    color: AppColors.primary,
                    size: 36,
                  ),
                )
                    .animate()
                    .fadeIn(duration: 600.ms)
                    .scale(begin: const Offset(0.8, 0.8), end: const Offset(1, 1)),

                const SizedBox(height: AppSpacing.xxl),

                Text(
                  'AdGen',
                  style: AppTypography.display.copyWith(
                    color: Colors.white,
                    fontSize: 42,
                    fontWeight: FontWeight.w800,
                  ),
                ).animate(delay: 100.ms).fadeIn(duration: 600.ms).slideY(begin: 0.2, end: 0),

                Text(
                  'Pharmacy ERP',
                  style: AppTypography.h2.copyWith(
                    color: Colors.white.withValues(alpha: 0.8),
                    fontWeight: FontWeight.w400,
                  ),
                ).animate(delay: 200.ms).fadeIn(duration: 600.ms).slideY(begin: 0.2, end: 0),

                const SizedBox(height: AppSpacing.xxxl),

                _buildFeatureItem(
                  Icons.receipt_long_rounded,
                  'Smart Billing',
                  'GST invoices with batch tracking',
                  delay: 300,
                ),
                const SizedBox(height: AppSpacing.lg),
                _buildFeatureItem(
                  Icons.inventory_2_rounded,
                  'Inventory Control',
                  'Real-time stock with expiry alerts',
                  delay: 400,
                ),
                const SizedBox(height: AppSpacing.lg),
                _buildFeatureItem(
                  Icons.auto_awesome_rounded,
                  'AI Assistant',
                  'Drug queries & prescription decoder',
                  delay: 500,
                ),

                const SizedBox(height: AppSpacing.xxxl),

                // Trust badges
                Row(
                  children: [
                    _buildBadge(Icons.security_rounded, 'Firebase Auth'),
                    const SizedBox(width: AppSpacing.md),
                    _buildBadge(Icons.cloud_done_rounded, 'Cloud Sync'),
                    const SizedBox(width: AppSpacing.md),
                    _buildBadge(Icons.verified_rounded, 'GST Ready'),
                  ],
                ).animate(delay: 600.ms).fadeIn(duration: 500.ms),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFeatureItem(IconData icon, String title, String subtitle,
      {int delay = 0}) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(AppSpacing.sm),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
          ),
          child: Icon(icon, color: Colors.white, size: 16),
        ),
        const SizedBox(width: AppSpacing.md),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: AppTypography.labelLarge.copyWith(color: Colors.white),
            ),
            Text(
              subtitle,
              style: AppTypography.caption.copyWith(
                color: Colors.white.withValues(alpha: 0.7),
              ),
            ),
          ],
        ),
      ],
    ).animate(delay: Duration(milliseconds: delay)).fadeIn(duration: 500.ms).slideX(begin: -0.2, end: 0);
  }

  Widget _buildBadge(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
        border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: Colors.white.withValues(alpha: 0.9)),
          const SizedBox(width: 4),
          Text(
            label,
            style: AppTypography.labelSmall.copyWith(
              color: Colors.white.withValues(alpha: 0.9),
              fontSize: 10,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoginForm() {
    return Container(
      color: AppColors.surface,
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.huge),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Header
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.primaryContainer,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(
                      Icons.local_pharmacy_rounded,
                      color: AppColors.primary,
                      size: 28,
                    ),
                  ).animate().fadeIn(duration: 400.ms).scale(
                      begin: const Offset(0.8, 0.8), end: const Offset(1, 1)),

                  const SizedBox(height: AppSpacing.lg),

                  Text(
                    'Welcome back',
                    style: AppTypography.h1,
                  ).animate(delay: 100.ms).fadeIn(duration: 500.ms),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    'Sign in to your pharmacy dashboard',
                    style: AppTypography.bodySmall,
                  ).animate(delay: 150.ms).fadeIn(duration: 500.ms),
                  const SizedBox(height: AppSpacing.xxxl),

                  // Email
                  AppTextField(
                    label: 'Email Address',
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    prefixIcon: Icons.email_outlined,
                    textInputAction: TextInputAction.next,
                    validator: (v) {
                      if (v == null || v.isEmpty) return 'Email required';
                      if (!v.contains('@')) return 'Invalid email';
                      return null;
                    },
                  ).animate(delay: 200.ms).fadeIn(duration: 500.ms),
                  const SizedBox(height: AppSpacing.lg),

                  // Password
                  AppTextField(
                    label: 'Password',
                    controller: _passwordController,
                    obscureText: _obscurePassword,
                    prefixIcon: Icons.lock_outline_rounded,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _login(),
                    suffix: IconButton(
                      onPressed: () =>
                          setState(() => _obscurePassword = !_obscurePassword),
                      icon: Icon(
                        _obscurePassword
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                        color: AppColors.textMuted,
                        size: 18,
                      ),
                    ),
                    validator: (v) {
                      if (v == null || v.isEmpty) return 'Password required';
                      if (v.length < 4) return 'Too short';
                      return null;
                    },
                  ).animate(delay: 250.ms).fadeIn(duration: 500.ms),
                  const SizedBox(height: AppSpacing.xxl),

                  // Error
                  if (_errorMessage != null) ...[
                    Container(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      decoration: BoxDecoration(
                        color: AppColors.errorContainer,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                        border: Border.all(color: AppColors.error.withValues(alpha: 0.3)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline_rounded,
                              color: AppColors.error, size: 16),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: Text(
                              _errorMessage!,
                              style: AppTypography.bodySmall
                                  .copyWith(color: AppColors.error),
                            ),
                          ),
                        ],
                      ),
                    ).animate().shake(),
                    const SizedBox(height: AppSpacing.lg),
                  ],

                  // Login Button
                  AppButton(
                    label: 'Sign In',
                    onPressed: _login,
                    isLoading: _isLoading,
                    icon: Icons.arrow_forward_rounded,
                  )
                      .animate(delay: 300.ms)
                      .fadeIn(duration: 500.ms)
                      .slideY(begin: 0.2, end: 0),
                  const SizedBox(height: AppSpacing.xxl),

                  // Divider + info
                  Row(
                    children: [
                      const Expanded(child: Divider()),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                        child: Text(
                          'Secured by Firebase',
                          style: AppTypography.caption,
                        ),
                      ),
                      const Expanded(child: Divider()),
                    ],
                  ).animate(delay: 400.ms).fadeIn(),
                  const SizedBox(height: AppSpacing.lg),

                  // Footer
                   Text(
                    'v1.0.0 • AdGen Pharmacy ERP',
                    style: AppTypography.caption,
                    textAlign: TextAlign.center,
                  ).animate(delay: 450.ms).fadeIn(),

                  const SizedBox(height: AppSpacing.xl),

                  // Register link
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('New employee? ', style: AppTypography.caption),
                      GestureDetector(
                        onTap: () => _showRegisterSheet(),
                        child: Text(
                          'Request access',
                          style: AppTypography.caption.copyWith(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w700,
                            decoration: TextDecoration.underline,
                          ),
                        ),
                      ),
                    ],
                  ).animate(delay: 500.ms).fadeIn(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Medical Grid Painter ─────────────────────────────────────────────────────
class _MedicalGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.06)
      ..strokeWidth = 0.8;

    // Light grid
    const spacing = 44.0;
    for (double x = 0; x < size.width; x += spacing) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y < size.height; y += spacing) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }

    // Small cross marks at intersections
    final dotPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.1)
      ..strokeWidth = 1.5
      ..strokeCap = StrokeCap.round;

    for (double x = spacing; x < size.width; x += spacing) {
      for (double y = spacing; y < size.height; y += spacing) {
        const s = 4.0;
        canvas.drawLine(Offset(x - s, y), Offset(x + s, y), dotPaint);
        canvas.drawLine(Offset(x, y - s), Offset(x, y + s), dotPaint);
      }
    }
  }

  @override
  bool shouldRepaint(_MedicalGridPainter oldDelegate) => false;
}

// ─── Register Sheet ───────────────────────────────────────────────────────────
class _RegisterSheet extends StatefulWidget {
  final WidgetRef ref;
  const _RegisterSheet({required this.ref});

  @override
  State<_RegisterSheet> createState() => _RegisterSheetState();
}

class _RegisterSheetState extends State<_RegisterSheet> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _designationCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  String? _error;
  bool _success = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _designationCtrl.dispose();
    _phoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _loading = true; _error = null; });

    final error = await widget.ref.read(authNotifierProvider.notifier).signUp(
      name: _nameCtrl.text.trim(),
      email: _emailCtrl.text.trim(),
      password: _passwordCtrl.text,
      phone: _phoneCtrl.text.trim(),
      designation: _designationCtrl.text.trim(),
    );

    if (mounted) {
      setState(() { _loading = false; });
      if (error != null) {
        setState(() => _error = error);
      } else {
        setState(() => _success = true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 12),
            Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 20),

            if (_success) ...[
              // Success state
              Padding(
                padding: const EdgeInsets.all(AppSpacing.xxl),
                child: Column(
                  children: [
                    Container(
                      width: 72, height: 72,
                      decoration: BoxDecoration(
                        color: AppColors.successContainer,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.check_rounded,
                          color: AppColors.success, size: 36),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text('Registration Submitted!', style: AppTypography.h2),
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      'Your account request has been sent to the admin for approval.\n'
                      'You\'ll be able to log in once approved.',
                      style: AppTypography.bodySmall,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: AppSpacing.xxl),
                    AppButton(
                      label: 'Done',
                      icon: Icons.arrow_forward_rounded,
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
              ),
            ] else ...[
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Row(
                  children: [
                    Text('Request Access', style: AppTypography.h2),
                    const Spacer(),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close_rounded),
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Text(
                  'Create an account — your admin will need to approve it before you can login.',
                  style: AppTypography.bodySmall,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),

              Form(
                key: _formKey,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Column(
                    children: [
                      AppTextField(
                        label: 'Full Name *',
                        controller: _nameCtrl,
                        prefixIcon: Icons.person_outline_rounded,
                        validator: (v) =>
                            (v == null || v.trim().isEmpty) ? 'Required' : null,
                      ),
                      const SizedBox(height: AppSpacing.md),
                      AppTextField(
                        label: 'Email *',
                        controller: _emailCtrl,
                        keyboardType: TextInputType.emailAddress,
                        prefixIcon: Icons.email_outlined,
                        validator: (v) {
                          if (v == null || v.isEmpty) return 'Required';
                          if (!v.contains('@')) return 'Invalid email';
                          return null;
                        },
                      ),
                      const SizedBox(height: AppSpacing.md),
                      AppTextField(
                        label: 'Password *',
                        controller: _passwordCtrl,
                        obscureText: _obscure,
                        prefixIcon: Icons.lock_outline_rounded,
                        suffix: IconButton(
                          onPressed: () => setState(() => _obscure = !_obscure),
                          icon: Icon(
                            _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                            size: 18, color: AppColors.textMuted,
                          ),
                        ),
                        validator: (v) {
                          if (v == null || v.isEmpty) return 'Required';
                          if (v.length < 6) return 'Min 6 characters';
                          return null;
                        },
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Row(
                        children: [
                          Expanded(
                            child: AppTextField(
                              label: 'Designation',
                              controller: _designationCtrl,
                              prefixIcon: Icons.work_outline_rounded,
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: AppTextField(
                              label: 'Phone',
                              controller: _phoneCtrl,
                              keyboardType: TextInputType.phone,
                              prefixIcon: Icons.phone_outlined,
                            ),
                          ),
                        ],
                      ),

                      if (_error != null) ...[
                        const SizedBox(height: AppSpacing.md),
                        Container(
                          padding: const EdgeInsets.all(AppSpacing.md),
                          decoration: BoxDecoration(
                            color: AppColors.errorContainer,
                            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.error_outline_rounded,
                                  color: AppColors.error, size: 16),
                              const SizedBox(width: AppSpacing.sm),
                              Expanded(
                                child: Text(_error!,
                                    style: AppTypography.bodySmall
                                        .copyWith(color: AppColors.error)),
                              ),
                            ],
                          ),
                        ),
                      ],

                      const SizedBox(height: AppSpacing.xl),
                      SizedBox(
                        width: double.infinity,
                        child: AppButton(
                          label: 'Submit Request',
                          icon: Icons.send_rounded,
                          isLoading: _loading,
                          onPressed: _register,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xxl),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
