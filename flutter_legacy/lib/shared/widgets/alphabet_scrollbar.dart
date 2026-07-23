import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';

class AlphabetScrollbar extends StatefulWidget {
  final ScrollController scrollController;
  final List<String> items; // The text to extract first letters from
  final double estimatedItemHeight;
  final double topOffset; // E.g., for summary cards at the top

  const AlphabetScrollbar({
    super.key,
    required this.scrollController,
    required this.items,
    required this.estimatedItemHeight,
    this.topOffset = 0,
  });

  @override
  State<AlphabetScrollbar> createState() => _AlphabetScrollbarState();
}

class _AlphabetScrollbarState extends State<AlphabetScrollbar> {
  final List<String> _alphabets = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");
  String? _currentLetter;
  double _indicatorY = 0;
  bool _isDragging = false;

  void _onDrag(Offset localPosition, BoxConstraints constraints) {
    if (widget.items.isEmpty) return;

    final renderBox = context.findRenderObject() as RenderBox?;
    if (renderBox == null) return;

    // Calculate which letter we are hovering over
    double y = localPosition.dy.clamp(0.0, constraints.maxHeight);
    int index = (y / constraints.maxHeight * _alphabets.length).floor();
    index = index.clamp(0, _alphabets.length - 1);
    
    final letter = _alphabets[index];

    setState(() {
      _currentLetter = letter;
      _indicatorY = y;
      _isDragging = true;
    });

    // Find the target item index
    int targetIndex = 0;
    if (letter == '#') {
      targetIndex = widget.items.length - 1;
    } else {
      targetIndex = widget.items.indexWhere(
          (item) => item.toUpperCase().startsWith(letter));
      
      // If exact letter not found, find the next available letter
      if (targetIndex == -1) {
        targetIndex = widget.items.indexWhere(
            (item) => item.toUpperCase().compareTo(letter) >= 0);
      }
      if (targetIndex == -1) targetIndex = widget.items.length - 1;
    }

    // Scroll to the estimated offset
    if (widget.scrollController.hasClients) {
      double offset = widget.topOffset + (targetIndex * widget.estimatedItemHeight);
      final maxExtent = widget.scrollController.position.maxScrollExtent;
      offset = offset.clamp(0.0, maxExtent);
      
      widget.scrollController.jumpTo(offset);
    }
  }

  void _onDragEnd() {
    setState(() {
      _isDragging = false;
      _currentLetter = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return Stack(
          clipBehavior: Clip.none,
          children: [
            // Floating Indicator
            if (_isDragging && _currentLetter != null)
              Positioned(
                right: 30, // Distance from the scrollbar
                top: _indicatorY - 25, // Center it roughly on the finger
                child: Container(
                  width: 50,
                  height: 50,
                  decoration: const BoxDecoration(
                    color: AppColors.primary,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black26,
                        blurRadius: 8,
                        offset: Offset(0, 2),
                      )
                    ],
                  ),
                  child: Center(
                    child: Text(
                      _currentLetter!,
                      style: AppTypography.h2.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
              ),

            // Scrollbar Track
            GestureDetector(
              onVerticalDragDown: (details) => _onDrag(details.localPosition, constraints),
              onVerticalDragUpdate: (details) => _onDrag(details.localPosition, constraints),
              onVerticalDragEnd: (_) => _onDragEnd(),
              onVerticalDragCancel: () => _onDragEnd(),
              child: Container(
                width: 24,
                decoration: BoxDecoration(
                  color: _isDragging ? AppColors.surface2 : Colors.transparent,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: _alphabets.map((letter) {
                    return Text(
                      letter,
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: _isDragging ? AppColors.primary : AppColors.textMuted,
                      ),
                    );
                  }).toList(),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
