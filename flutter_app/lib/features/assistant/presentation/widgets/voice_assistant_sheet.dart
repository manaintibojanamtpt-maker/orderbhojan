import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../../../../app/routes/app_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../cart/domain/entities/cart_item.dart';
import '../../../cart/presentation/bloc/cart_bloc.dart';
import '../../../cart/presentation/bloc/cart_event.dart';
import '../../services/voice_assistant_service.dart';

class VoiceChatMessage {
  final String text;
  final bool isUser;
  final List<Map<String, dynamic>>? dishes;

  VoiceChatMessage({required this.text, required this.isUser, this.dishes});
}

class VoiceAssistantSheet extends StatefulWidget {
  final String? kitchenId;
  final String? kitchenName;

  const VoiceAssistantSheet({super.key, this.kitchenId, this.kitchenName});

  static Future<void> show(
    BuildContext context, {
    String? kitchenId,
    String? kitchenName,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => VoiceAssistantSheet(
        kitchenId: kitchenId,
        kitchenName: kitchenName,
      ),
    );
  }

  @override
  State<VoiceAssistantSheet> createState() => _VoiceAssistantSheetState();
}

class _VoiceAssistantSheetState extends State<VoiceAssistantSheet>
    with SingleTickerProviderStateMixin {
  final VoiceAssistantService _service = VoiceAssistantService();
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  late AnimationController _pulseController;
  bool _isListening = false;
  bool _isLoading = false;

  final List<VoiceChatMessage> _messages = [
    VoiceChatMessage(
      text:
          'Namaste! Welcome back to OrderBhojan. What would you like to eat today? Speak naturally in your language (Telugu, Hindi, or English) — tell me your favorite dish or kitchen.',
      isUser: false,
    ),
  ];

  final List<String> _quickPrompts = [
    '2 Masala Dosa add cheyi',
    'Chicken Biryani',
    '2 Idli plate dalo',
    'Veg Fried Rice',
    'Andhra Veg Thali',
  ];

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);

    // Speak initial welcome greeting
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _service.speak(
        'Namaste! Welcome back to OrderBhojan. What would you like to eat today? Speak naturally in Telugu, Hindi, or English.',
      );
    });
  }

  @override
  void dispose() {
    _service.stopSpeaking();
    _pulseController.dispose();
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _sendMessage(String query) async {
    final text = query.trim();
    if (text.isEmpty || _isLoading) return;

    _textController.clear();
    setState(() {
      _messages.add(VoiceChatMessage(text: text, isUser: true));
      _isLoading = true;
      _isListening = false;
    });
    _scrollToBottom();

    final response = await _service.sendMessage(
      message: text,
      currentKitchenId: widget.kitchenId,
      currentKitchenName:
          widget.kitchenName ?? '',
    );

    if (mounted) {
      if (response.proposedDishes.isNotEmpty) {
        for (final dish in response.proposedDishes) {
          final qty = (dish['quantity'] as num?)?.toInt() ?? 1;
          final dishId = dish['id'] as String;
          final cartItem = CartItem(
            id: '${dishId}_voice_${DateTime.now().millisecondsSinceEpoch}',
            dishId: dishId,
            name: dish['name'] as String,
            unitPrice: (dish['price'] as num).toInt(),
            quantity: qty,
            isVeg: dish['isVeg'] as bool? ?? true,
            kitchenId: (dish['kitchenId'] as String?) ?? '',
            kitchenName: (dish['kitchenName'] as String?) ?? '',
          );
          context.read<CartBloc>().add(AddToCartRequested(cartItem));
        }
      }

      setState(() {
        _isLoading = false;
        _messages.add(
          VoiceChatMessage(
            text: response.reply,
            isUser: false,
            dishes: response.proposedDishes,
          ),
        );
      });
      _scrollToBottom();

      // Audio output via native Android TTS
      _service.speak(response.reply);
    }
  }

  void _startMicInput() async {
    _service.stopSpeaking();
    setState(() => _isListening = true);

    final spoken = await _service.listenFromMic();
    if (mounted) {
      setState(() => _isListening = false);
      if (spoken.isNotEmpty) {
        _sendMessage(spoken);
      }
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      decoration: const BoxDecoration(
        color: BhojanColors.scaffoldBackground,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(
        child: Column(
          children: [
            // Handle Bar
            Padding(
              padding: const EdgeInsets.only(top: 12, bottom: 8),
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: BhojanColors.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // Header Banner
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: BhojanColors.primary,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.graphic_eq,
                      color: BhojanColors.goldAccent,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'OrderBhojan AI Voice Assistant',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: BhojanColors.onSurface,
                          ),
                        ),
                        Text(
                          'Auto-detecting: తెలుగు • हिंदी • English',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: BhojanColors.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close,
                        color: BhojanColors.onSurfaceVariant),
                    onPressed: () {
                      _service.stopSpeaking();
                      Navigator.pop(context);
                    },
                  ),
                ],
              ),
            ),

            const Divider(height: 1, color: BhojanColors.outline),

            // Messages List
            Expanded(
              child: ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.all(16),
                itemCount: _messages.length,
                itemBuilder: (context, index) {
                  final msg = _messages[index];
                  return _buildMessageBubble(msg);
                },
              ),
            ),

            // Quick Prompts Rail
            Container(
              height: 40,
              margin: const EdgeInsets.symmetric(vertical: 4),
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: _quickPrompts.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final prompt = _quickPrompts[index];
                  return ActionChip(
                    label: Text(
                      prompt,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: BhojanColors.onSurface,
                      ),
                    ),
                    backgroundColor: BhojanColors.surface,
                    side: const BorderSide(
                        color: BhojanColors.outline, width: 0.8),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    onPressed: () => _sendMessage(prompt),
                  );
                },
              ),
            ),

            // Bottom Mic & Input Area
            Container(
              padding: EdgeInsets.fromLTRB(16, 8, 16, 8 + bottomInset),
              decoration: const BoxDecoration(
                color: BhojanColors.surface,
                border: Border(
                  top: BorderSide(color: BhojanColors.outline, width: 0.8),
                ),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      // Large Voice Mic Action Button
                      GestureDetector(
                        onTap: _startMicInput,
                        child: AnimatedBuilder(
                          animation: _pulseController,
                          builder: (context, child) {
                            return Container(
                              width: 52,
                              height: 52,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                gradient: const LinearGradient(
                                  colors: [
                                    BhojanColors.terracotta,
                                    Color(0xFFC85A32),
                                  ],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: BhojanColors.terracotta.withOpacity(
                                        _isListening
                                            ? 0.5 +
                                                _pulseController.value * 0.3
                                            : 0.3),
                                    blurRadius: _isListening
                                        ? 16 + _pulseController.value * 8
                                        : 8,
                                    spreadRadius: _isListening
                                        ? 2 + _pulseController.value * 4
                                        : 0,
                                  ),
                                ],
                              ),
                              child: Icon(
                                _isListening ? Icons.graphic_eq : Icons.mic,
                                color: Colors.white,
                                size: 26,
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(width: 12),

                      // Text Field Fallback
                      Expanded(
                        child: Container(
                          decoration: BoxDecoration(
                            color: BhojanColors.surfaceContainerLow,
                            borderRadius: BorderRadius.circular(24),
                            border: Border.all(
                                color: BhojanColors.outline, width: 0.8),
                          ),
                          child: TextField(
                            controller: _textController,
                            onSubmitted: _sendMessage,
                            decoration: InputDecoration(
                              hintText: _isListening
                                  ? 'Listening to you speak...'
                                  : 'Speak or type dishes in your language...',
                              hintStyle: const TextStyle(
                                fontSize: 13,
                                color: BhojanColors.textMuted,
                              ),
                              border: InputBorder.none,
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
                              ),
                              suffixIcon: IconButton(
                                icon: const Icon(
                                  Icons.arrow_upward_rounded,
                                  color: BhojanColors.primary,
                                ),
                                onPressed: () =>
                                    _sendMessage(_textController.text),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _isListening
                        ? 'Listening to your microphone... Speak naturally now'
                        : 'Tap the mic or select a prompt to add directly to your cart',
                    style: const TextStyle(
                      fontSize: 11,
                      color: BhojanColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageBubble(VoiceChatMessage msg) {
    if (msg.isUser) {
      return Align(
        alignment: Alignment.centerRight,
        child: Container(
          margin: const EdgeInsets.only(bottom: 12, left: 48),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: BhojanColors.primary,
            borderRadius: const BorderRadius.only(
              topLeft: Radius.circular(16),
              topRight: Radius.circular(4),
              bottomLeft: Radius.circular(16),
              bottomRight: Radius.circular(16),
            ),
            boxShadow: BhojanDimens.cardShadow,
          ),
          child: Text(
            msg.text,
            style: const TextStyle(
              fontSize: 14,
              color: Colors.white,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      );
    }

    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 16, right: 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 12,
                  backgroundColor: BhojanColors.primaryContainer,
                  child: const Icon(Icons.auto_awesome,
                      size: 14, color: BhojanColors.primaryDark),
                ),
                const SizedBox(width: 8),
                const Text(
                  'OrderBhojan AI',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: BhojanColors.primaryDark,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: BhojanColors.surface,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(4),
                  topRight: Radius.circular(16),
                  bottomLeft: Radius.circular(16),
                  bottomRight: Radius.circular(16),
                ),
                border: Border.all(color: BhojanColors.outline, width: 0.8),
                boxShadow: BhojanDimens.cardShadow,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    msg.text,
                    style: const TextStyle(
                      fontSize: 14,
                      color: BhojanColors.onSurface,
                      height: 1.35,
                    ),
                  ),
                  if (msg.dishes != null && msg.dishes!.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    const Divider(height: 1, color: BhojanColors.outline),
                    const SizedBox(height: 8),
                    ...msg.dishes!.map(
                      (dish) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.check_circle,
                              size: 16,
                              color: BhojanColors.vegGreen,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                '${dish['quantity']}x ${dish['name']}',
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: BhojanColors.onSurface,
                                ),
                              ),
                            ),
                            Text(
                              '₹${(dish['price'] as num) * (dish['quantity'] as num)}',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: BhojanColors.primary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        icon: const Icon(Icons.shopping_bag_outlined, size: 16),
                        label: const Text(
                          'View Cart & Checkout',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: BhojanColors.primary,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                        ),
                        onPressed: () {
                          Navigator.pop(context);
                          context.go(AppRoutes.cart);
                        },
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
