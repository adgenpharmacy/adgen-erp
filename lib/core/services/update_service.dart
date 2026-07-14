import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'apk_installer_stub.dart' if (dart.library.io) 'apk_installer_mobile.dart';
import '../utils/app_version.dart';

import 'package:path_provider/path_provider.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../../shared/widgets/app_button.dart';

class UpdateService {
  static const String _versionUrl = 'https://adgen-pharmacy.web.app/version.json';
  
  static Future<void> checkForUpdate(BuildContext context) async {
    if (kIsWeb) return; // Web doesn't need APK updates
    if (defaultTargetPlatform != TargetPlatform.android) return; // Only Android APK supports this flow
    
    try {
      final dio = Dio();
      // Add timestamp to bypass cache
      final response = await dio.get('$_versionUrl?t=${DateTime.now().millisecondsSinceEpoch}');
      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        final serverBuild = data['buildNumber'] as int;
        
        final currentBuild = AppVersion.buildNumber;
        
        if (serverBuild > currentBuild) {
          if (!context.mounted) return;
          _showUpdateDialog(context, data);
        }
      }
    } catch (e) {
      debugPrint('Update check failed: $e');
    }
  }

  static void _showUpdateDialog(BuildContext context, Map<String, dynamic> data) {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (ctx) {
        return _UpdateDialog(data: data);
      },
    );
  }
}

class _UpdateDialog extends StatefulWidget {
  final Map<String, dynamic> data;
  const _UpdateDialog({required this.data});

  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog> {
  bool _isDownloading = false;
  double _progress = 0;
  String _status = '';

  Future<void> _startDownload() async {
    setState(() {
      _isDownloading = true;
      _status = 'Starting download...';
    });
    
    try {
      final tempDir = await getTemporaryDirectory();
      final filePath = '${tempDir.path}/app-update.apk';
      final dio = Dio();
      
      await dio.download(
        widget.data['downloadUrl'],
        filePath,
        onReceiveProgress: (received, total) {
          if (total != -1) {
            setState(() {
              _progress = received / total;
              _status = 'Downloading... ${(received / 1024 / 1024).toStringAsFixed(1)} MB / ${(total / 1024 / 1024).toStringAsFixed(1)} MB';
            });
          }
        },
      );
      
      setState(() => _status = 'Installing...');
      await openApk(filePath);
      
      // App should close as installer takes over, but if not we reset.
      if (mounted) Navigator.pop(context);
      
    } catch (e) {
      setState(() {
        _isDownloading = false;
        _status = 'Error downloading: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Update Available 🚀'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "Version ${widget.data['version']} is now available. You have an older version.",
            style: AppTypography.bodySmall,
          ),
          const SizedBox(height: 16),
          if (widget.data['releaseNotes'] != null)
            Text(
              "What's New:\n${widget.data['releaseNotes']}",
              style: AppTypography.caption,
            ),
          const SizedBox(height: 24),
          if (_isDownloading) ...[
            LinearProgressIndicator(value: _progress, backgroundColor: AppColors.border, color: AppColors.primary),
            const SizedBox(height: 8),
            Text(_status, style: AppTypography.caption),
          ] else if (_status.isNotEmpty)
            Text(_status, style: AppTypography.caption.copyWith(color: AppColors.error)),
        ],
      ),
      actions: [
        if (!_isDownloading)
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Later'),
          ),
        if (!_isDownloading)
          AppButton(
            label: 'Update Now',
            icon: Icons.download_rounded,
            small: true,
            onPressed: _startDownload,
          ),
      ],
    );
  }
}
