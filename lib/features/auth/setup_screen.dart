import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/constants.dart';
import '../../shared/widgets/app_button.dart';
import '../../shared/widgets/app_card.dart';

/// One-time setup screen to seed default users into Firebase.
/// Access by navigating to /setup (remove after first run).
class SetupScreen extends StatefulWidget {
  const SetupScreen({super.key});

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  bool _isLoading = false;
  final List<String> _log = [];
  bool _done = false;

  void _log_(String msg) {
    setState(() => _log.add(msg));
  }

  Future<void> _runSetup() async {
    setState(() {
      _isLoading = true;
      _log.clear();
      _done = false;
    });

    try {
      _log_('🚀 Starting AdGen ERP setup...');

      final auth = FirebaseAuth.instance;
      final db = FirebaseFirestore.instance;

      for (final user in AppConstants.defaultUsers) {
        try {
          _log_('📧 Creating user: ${user['email']}');
          final cred = await auth.createUserWithEmailAndPassword(
            email: user['email']!,
            password: user['password']!,
          );

          await db.collection(AppConstants.colUsers).doc(cred.user!.uid).set({
            'name': user['name'],
            'email': user['email'],
            'role': user['role'],
            'isActive': true,
            'createdAt': Timestamp.now(),
          });

          _log_('✅ Created: ${user['name']} (${user['role']})');
        } on FirebaseAuthException catch (e) {
          if (e.code == 'email-already-in-use') {
            _log_('⚠️  ${user['email']} already exists — skipping');
          } else {
            _log_('❌ Error creating ${user['email']}: ${e.message}');
          }
        }
      }

      _log_('');
      _log_('✅ Setup complete! Default credentials:');
      _log_('');
      for (final user in AppConstants.defaultUsers) {
        _log_('👤 ${user['name']} (${user['role']})');
        _log_('   📧 ${user['email']}');
        _log_('   🔑 ${user['password']}');
        _log_('');
      }
      _log_('⚠️  IMPORTANT: Change passwords after first login!');

      setState(() => _done = true);
    } catch (e) {
      if (mounted) _log_('❌ Fatal error: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 700),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xxl),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppColors.primary, AppColors.ai],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                      ),
                      child: const Icon(Icons.local_pharmacy_rounded, color: Colors.white, size: 28),
                    ),
                    const SizedBox(width: AppSpacing.lg),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('AdGen ERP — First Time Setup', style: AppTypography.h1),
                        Text('This will create the 3 default user accounts in Firebase', style: AppTypography.bodySmall),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xxl),

                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Users that will be created:', style: AppTypography.h3),
                      const SizedBox(height: AppSpacing.lg),
                      ...AppConstants.defaultUsers.map((u) => Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.md),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: AppSpacing.md,
                                vertical: AppSpacing.xs,
                              ),
                              decoration: BoxDecoration(
                                color: u['role'] == 'owner'
                                    ? AppColors.primaryContainer
                                    : AppColors.surface3,
                                borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                              ),
                              child: Text(
                                u['role']!.toUpperCase(),
                                style: AppTypography.labelSmall.copyWith(
                                  color: u['role'] == 'owner'
                                      ? AppColors.primaryLight
                                      : AppColors.textMuted,
                                ),
                              ),
                            ),
                            const SizedBox(width: AppSpacing.lg),
                            Expanded(child: Text(u['name']!, style: AppTypography.labelLarge)),
                            Text(u['email']!, style: AppTypography.bodySmall),
                            const SizedBox(width: AppSpacing.xl),
                            Text(u['password']!, style: AppTypography.label.copyWith(color: AppColors.warning)),
                          ],
                        ),
                      )),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.xl),

                if (!_done)
                  AppButton(
                    label: 'Create Users & Setup Firebase',
                    icon: Icons.rocket_launch_rounded,
                    onPressed: _runSetup,
                    isLoading: _isLoading,
                  ),

                if (_done) ...[
                  AppButton(
                    label: 'Go to Login →',
                    icon: Icons.login_rounded,
                    onPressed: () {
                      Navigator.of(context).pushReplacementNamed('/login');
                    },
                  ),
                ],
                const SizedBox(height: AppSpacing.xl),

                // Log output
                if (_log.isNotEmpty)
                  AppCard(
                    backgroundColor: AppColors.surface2,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Setup Log', style: AppTypography.h3),
                        const SizedBox(height: AppSpacing.md),
                        ..._log.map((line) => Padding(
                          padding: const EdgeInsets.only(bottom: 2),
                          child: Text(
                            line,
                            style: AppTypography.bodySmall.copyWith(
                              fontFamily: 'monospace',
                              color: line.startsWith('❌')
                                  ? AppColors.error
                                  : line.startsWith('✅')
                                      ? AppColors.success
                                      : line.startsWith('⚠️')
                                          ? AppColors.warning
                                          : AppColors.textSecondary,
                            ),
                          ),
                        )),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
