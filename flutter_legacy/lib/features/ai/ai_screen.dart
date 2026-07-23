import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:image_picker/image_picker.dart';
import 'package:google_generative_ai/google_generative_ai.dart';
import 'dart:io';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/constants.dart';
import '../../core/providers/settings_provider.dart';
import '../../shared/widgets/status_chip.dart';

class _ChatMessage {
  final String text;
  final bool isUser;
  final DateTime time;
  final String? imageCaption;

  _ChatMessage({
    required this.text,
    required this.isUser,
    this.imageCaption,
  }) : time = DateTime.now();
}

class AiScreen extends ConsumerStatefulWidget {
  const AiScreen({super.key});

  @override
  ConsumerState<AiScreen> createState() => _AiScreenState();
}

class _AiScreenState extends ConsumerState<AiScreen> {
  final _queryCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final List<_ChatMessage> _messages = [];
  bool _isLoading = false;
  GenerativeModel? _model;
  ChatSession? _chat;
  File? _pendingImage;

  @override
  void initState() {
    super.initState();
    // Welcome message
    _messages.add(_ChatMessage(
      text: '👋 Hello! I\'m AdGen AI, your pharmacy assistant.\n\n'
          'I can help you with:\n'
          '• Drug information & interactions\n'
          '• Prescription decoding\n'
          '• Schedule H/H1/X regulations\n'
          '• Generic alternatives\n\n'
          'Ask me anything or upload a prescription image!',
      isUser: false,
    ));
  }

  void _initModelIfNeeded() {
    if (_model != null) return;
    final apiKey = ref.read(geminiApiKeyProvider).valueOrNull ?? AppConstants.geminiApiKey;
    _model = GenerativeModel(
      model: 'gemini-3.5-flash',
      apiKey: apiKey,
      systemInstruction: Content.system(
        'You are AdGen AI, a specialized pharmaceutical assistant for AdGen Pharma, '
        'an Indian pharmacy. You help pharmacists with:\n'
        '1. Drug information, interactions, contraindications, and dosage\n'
        '2. Decoding and interpreting medical prescriptions\n'
        '3. Indian pharmacy-specific regulations (Schedule H, H1, X drugs)\n'
        '4. Generic alternatives and brand information\n'
        'Always emphasize consulting a qualified doctor for medical decisions. '
        'Respond concisely and professionally. Use simple language where possible.',
      ),
    );
    _chat = _model!.startChat();
  }

  @override
  void dispose() {
    _queryCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _sendMessage() async {
    final query = _queryCtrl.text.trim();
    if (query.isEmpty && _pendingImage == null) return;

    _initModelIfNeeded();

    setState(() {
      _messages.add(_ChatMessage(
        text: query.isNotEmpty ? query : '[Uploaded prescription image]',
        isUser: true,
        imageCaption: _pendingImage != null ? 'Prescription Image' : null,
      ));
      _isLoading = true;
    });
    _queryCtrl.clear();

    final imageFile = _pendingImage;
    setState(() => _pendingImage = null);

    try {
      String response;
      if (imageFile != null) {
        // Vision request for prescription decoding
        final imageBytes = await imageFile.readAsBytes();
        final content = Content.multi([
          DataPart('image/jpeg', imageBytes),
          TextPart(query.isNotEmpty
              ? query
              : 'Please decode and explain this medical prescription. List each medication, dosage, frequency, and any special instructions.'),
        ]);
        final result = await _model!.generateContent([content]);
        response = result.text ?? 'Unable to process the image.';
      } else {
        final result = await _chat!.sendMessage(Content.text(query));
        response = result.text ?? 'No response received.';
      }

      setState(() {
        _messages.add(_ChatMessage(text: response, isUser: false));
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _messages.add(_ChatMessage(
          text: 'Error: ${e.toString().contains('API_KEY') ? 'API key not configured. Please update AppConstants.geminiApiKey' : e.toString()}',
          isUser: false,
        ));
        _isLoading = false;
      });
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final option = await showDialog<ImageSource>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Upload Prescription'),
        content: const Text('Choose image source:'),
        actions: [
          TextButton.icon(
            onPressed: () => Navigator.pop(ctx, ImageSource.camera),
            icon: const Icon(Icons.camera_alt_rounded),
            label: const Text('Camera'),
          ),
          TextButton.icon(
            onPressed: () => Navigator.pop(ctx, ImageSource.gallery),
            icon: const Icon(Icons.photo_library_rounded),
            label: const Text('Gallery'),
          ),
        ],
      ),
    );
    if (option == null) return;
    final picked = await picker.pickImage(source: option, imageQuality: 80);
    if (picked != null) {
      setState(() => _pendingImage = File(picked.path));
    }
  }

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.of(context).size.width < 800;

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Row(
        children: [
          // ─── Left: Chat ─────────────────────────────────────────────────
          Expanded(
            flex: 3,
            child: Column(
              children: [
                // Header
                Container(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  decoration: const BoxDecoration(
                    color: AppColors.surface,
                    border: Border(bottom: BorderSide(color: AppColors.border)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(AppSpacing.sm),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [AppColors.ai, AppColors.primary],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                        ),
                        child: const Icon(Icons.auto_awesome_rounded, color: Colors.white, size: 20),
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('AdGen AI', style: AppTypography.h3),
                          Row(
                            children: [
                              Container(
                                width: 6,
                                height: 6,
                                decoration: const BoxDecoration(
                                  color: AppColors.success,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 4),
                              Text('Powered by Gemini', style: AppTypography.caption.copyWith(color: AppColors.ai)),
                            ],
                          ),
                        ],
                      ),
                      const Spacer(),
                      const StatusChip(label: 'AI', type: StatusType.ai),
                    ],
                  ),
                ),

                // Messages
                Expanded(
                  child: ListView.builder(
                    controller: _scrollCtrl,
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    itemCount: _messages.length + (_isLoading ? 1 : 0),
                    itemBuilder: (_, i) {
                      if (_isLoading && i == _messages.length) {
                        return _buildTypingIndicator();
                      }
                      return _MessageBubble(message: _messages[i]);
                    },
                  ),
                ),

                // Input area
                Container(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  decoration: const BoxDecoration(
                    color: AppColors.surface,
                    border: Border(top: BorderSide(color: AppColors.border)),
                  ),
                  child: Column(
                    children: [
                      if (_pendingImage != null) ...[
                        Container(
                          margin: const EdgeInsets.only(bottom: AppSpacing.md),
                          padding: const EdgeInsets.all(AppSpacing.sm),
                          decoration: BoxDecoration(
                            color: AppColors.aiContainer,
                            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                            border: Border.all(color: AppColors.ai.withValues(alpha: 0.3)),
                          ),
                          child: Row(
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                                child: Image.file(_pendingImage!, height: 50, width: 50, fit: BoxFit.cover),
                              ),
                              const SizedBox(width: AppSpacing.sm),
                              Expanded(
                                child: Text('Prescription image ready to send', style: AppTypography.label.copyWith(color: AppColors.ai)),
                              ),
                              IconButton(
                                onPressed: () => setState(() => _pendingImage = null),
                                icon: const Icon(Icons.close_rounded, color: AppColors.textMuted, size: 16),
                              ),
                            ],
                          ),
                        ),
                      ],
                      Row(
                        children: [
                          IconButton(
                            onPressed: _pickImage,
                            icon: const Icon(Icons.camera_alt_rounded, color: AppColors.ai),
                            tooltip: 'Upload prescription',
                            style: IconButton.styleFrom(
                              backgroundColor: AppColors.aiContainer,
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: TextField(
                              controller: _queryCtrl,
                              style: AppTypography.body,
                              maxLines: 3,
                              minLines: 1,
                              onSubmitted: (_) => _sendMessage(),
                              decoration: InputDecoration(
                                hintText: 'Ask about a medicine or upload a prescription...',
                                hintStyle: AppTypography.body.copyWith(color: AppColors.textMuted),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                                  borderSide: const BorderSide(color: AppColors.border),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                                  borderSide: const BorderSide(color: AppColors.ai, width: 1.5),
                                ),
                                filled: true,
                                fillColor: AppColors.surface2,
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            child: ElevatedButton(
                              onPressed: _isLoading ? null : _sendMessage,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.ai,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                                ),
                                padding: const EdgeInsets.all(AppSpacing.md),
                                minimumSize: const Size(48, 48),
                              ),
                              child: _isLoading
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                    )
                                  : const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // ─── Right: Quick prompts (desktop only) ──────────────────────
          if (!isMobile)
            Container(
              width: 260,
              decoration: const BoxDecoration(
                color: AppColors.surface,
                border: Border(left: BorderSide(color: AppColors.border)),
              ),
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Quick Queries', style: AppTypography.h3),
                    const SizedBox(height: AppSpacing.lg),
                    ..._quickPrompts.map((prompt) => InkWell(
                      onTap: () {
                        _queryCtrl.text = prompt;
                        _sendMessage();
                      },
                      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                      child: Container(
                        margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                        padding: const EdgeInsets.all(AppSpacing.md),
                        decoration: BoxDecoration(
                          color: AppColors.surface2,
                          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.arrow_forward_ios_rounded, color: AppColors.ai, size: 12),
                            const SizedBox(width: AppSpacing.sm),
                            Expanded(
                              child: Text(prompt, style: AppTypography.bodySmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                            ),
                          ],
                        ),
                      ),
                    )),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildTypingIndicator() {
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        decoration: BoxDecoration(
          color: AppColors.surface2,
          borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('AdGen AI is thinking', style: AppTypography.caption),
            const SizedBox(width: AppSpacing.sm),
            const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.ai),
            ),
          ],
        ),
      ),
    );
  }

  static const _quickPrompts = [
    'What are the side effects of Paracetamol?',
    'Drug interactions between Metformin and Aspirin',
    'What drugs are under Schedule H1?',
    'Generic alternative for Combiflam',
    'What is the usual dose of Amoxicillin for adults?',
    'Decode this prescription image',
    'Storage conditions for insulin',
    'What is the maximum safe daily dose of Ibuprofen?',
  ];
}

class _MessageBubble extends StatelessWidget {
  final _ChatMessage message;

  const _MessageBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final isUser = message.isUser;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: EdgeInsets.only(
          top: AppSpacing.sm,
          bottom: AppSpacing.sm,
          left: isUser ? 60 : 0,
          right: isUser ? 0 : 60,
        ),
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: isUser ? AppColors.primaryContainer : AppColors.surface2,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(AppSpacing.radiusLg),
            topRight: const Radius.circular(AppSpacing.radiusLg),
            bottomLeft: Radius.circular(isUser ? AppSpacing.radiusLg : AppSpacing.radiusXs),
            bottomRight: Radius.circular(isUser ? AppSpacing.radiusXs : AppSpacing.radiusLg),
          ),
          border: Border.all(
            color: isUser ? AppColors.primary.withValues(alpha: 0.3) : AppColors.border,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isUser) ...[
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.auto_awesome_rounded, color: AppColors.ai, size: 12),
                  const SizedBox(width: 4),
                  Text('AdGen AI', style: AppTypography.labelSmall.copyWith(color: AppColors.ai)),
                ],
              ),
              const SizedBox(height: 4),
            ],
            if (isUser)
              Text(
                message.text,
                style: AppTypography.body.copyWith(color: AppColors.primaryLight),
              )
            else
              MarkdownBody(
                data: message.text,
                styleSheet: MarkdownStyleSheet(
                  p: AppTypography.body.copyWith(color: AppColors.textPrimary),
                  h1: AppTypography.h1.copyWith(color: AppColors.textPrimary),
                  h2: AppTypography.h2.copyWith(color: AppColors.textPrimary),
                  h3: AppTypography.h3.copyWith(color: AppColors.textPrimary),
                  listBullet: AppTypography.body.copyWith(color: AppColors.textPrimary),
                  code: AppTypography.bodySmall.copyWith(
                    fontFamily: 'monospace',
                    backgroundColor: AppColors.surface,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
