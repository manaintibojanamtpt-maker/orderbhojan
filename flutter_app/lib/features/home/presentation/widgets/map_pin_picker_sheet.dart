import 'package:flutter/material.dart';
import '../../../../core/di/injection.dart';
import '../../../../core/services/preferences_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../core/widgets/bhojan_button.dart';

class MapPinPickerSheet extends StatefulWidget {
  final ValueChanged<String> onLocationConfirmed;

  const MapPinPickerSheet({super.key, required this.onLocationConfirmed});

  static Future<void> show(BuildContext context,
      {required ValueChanged<String> onLocationConfirmed}) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) =>
          MapPinPickerSheet(onLocationConfirmed: onLocationConfirmed),
    );
  }

  @override
  State<MapPinPickerSheet> createState() => _MapPinPickerSheetState();
}

class _MapPinPickerSheetState extends State<MapPinPickerSheet> {
  double _lat = 18.499594;
  double _lng = 73.978589;
  String _selectedTag = 'Home';

  final TextEditingController _flatController = TextEditingController();
  final TextEditingController _landmarkController = TextEditingController();
  late final TextEditingController _areaController;

  @override
  void initState() {
    super.initState();
    final activeCoords = sl<PreferencesService>().getActiveCoordinates();
    if (activeCoords != null) {
      _lat = activeCoords['lat']!;
      _lng = activeCoords['lng']!;
    }
    final activeAddr = sl<PreferencesService>().getActiveAddress();
    _areaController = TextEditingController(
      text: activeAddr.isNotEmpty ? activeAddr : '',
    );
  }

  void _nudge(double dLat, double dLng) {
    setState(() {
      _lat = double.parse((_lat + dLat).toStringAsFixed(4));
      _lng = double.parse((_lng + dLng).toStringAsFixed(4));
    });
  }

  @override
  void dispose() {
    _flatController.dispose();
    _landmarkController.dispose();
    _areaController.dispose();
    super.dispose();
  }

  void _saveAddress() async {
    final flat = _flatController.text.trim();
    final landmark = _landmarkController.text.trim();
    final area = _areaController.text.trim();

    final parts = [
      if (flat.isNotEmpty) flat,
      if (landmark.isNotEmpty) 'Near $landmark',
      area.isNotEmpty ? area : 'Bengaluru',
    ];

    final fullAddress = parts.join(', ');
    final prefs = sl<PreferencesService>();
    await prefs.setActiveAddress(fullAddress);
    await prefs.setActiveCoordinates(_lat, _lng);

    final currentSaved = prefs.getSavedAddresses();
    final exists = currentSaved.any((a) => a['title'] == fullAddress);
    if (!exists) {
      await prefs.addSavedAddress({
        'title': '$_selectedTag: ${flat.isNotEmpty ? flat : area}',
        'address': fullAddress,
        'tag': _selectedTag,
        'lat': _lat.toString(),
        'lng': _lng.toString(),
      });
    }

    if (mounted) {
      widget.onLocationConfirmed(fullAddress);
      Navigator.pop(context);
    }
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

            // Header Title
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: BhojanColors.primaryContainer,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(
                      Icons.map_outlined,
                      color: BhojanColors.primary,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Confirm Delivery Map Pin',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: BhojanColors.onSurface,
                          ),
                        ),
                        Text(
                          'Fine-tune pin to your exact building entrance',
                          style: TextStyle(
                            fontSize: 11,
                            color: BhojanColors.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close,
                        color: BhojanColors.onSurfaceVariant),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            const Divider(color: BhojanColors.outline, height: 1),

            Expanded(
              child: SingleChildScrollView(
                padding: EdgeInsets.only(
                  left: 20,
                  right: 20,
                  top: 16,
                  bottom: bottomInset + 16,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Interactive Map Canvas Simulation
                    Container(
                      height: 180,
                      decoration: BoxDecoration(
                        color: BhojanColors.primaryDark.withValues(alpha: 0.04),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: BhojanColors.outline),
                      ),
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          // Grid Map Texture Lines
                          Opacity(
                            opacity: 0.15,
                            child: GridPaper(
                              color: BhojanColors.primary,
                              divisions: 2,
                              subdivisions: 1,
                            ),
                          ),
                          // Pin Animation
                          Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: BhojanColors.primary,
                                  shape: BoxShape.circle,
                                  boxShadow: [
                                    BoxShadow(
                                      color: BhojanColors.primary
                                          .withValues(alpha: 0.3),
                                      blurRadius: 10,
                                      offset: const Offset(0, 4),
                                    ),
                                  ],
                                ),
                                child: const Icon(
                                  Icons.location_on,
                                  color: BhojanColors.goldAccent,
                                  size: 26,
                                ),
                              ),
                              Container(
                                width: 8,
                                height: 4,
                                decoration: BoxDecoration(
                                  color: Colors.black.withValues(alpha: 0.2),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                              ),
                            ],
                          ),
                          // Coordinates Badge
                          Positioned(
                            bottom: 10,
                            right: 12,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                    color: BhojanColors.outline, width: 0.8),
                              ),
                              child: Text(
                                '$_lat, $_lng',
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: BhojanColors.primary,
                                ),
                              ),
                            ),
                          ),
                          // Serviceable Zone Indicator
                          Positioned(
                            top: 10,
                            left: 12,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: BhojanColors.vegGreenContainer,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.check_circle,
                                      size: 12, color: BhojanColors.vegGreen),
                                  SizedBox(width: 4),
                                  Text(
                                    'Inti Bojanam Serviceable (2.1 km)',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700,
                                      color: BhojanColors.vegGreen,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Map Nudge Controls (N, S, W, E - exactly as in web MapPinPicker)
                    Row(
                      children: [
                        _buildNudgeBtn('N', () => _nudge(0.001, 0)),
                        const SizedBox(width: 8),
                        _buildNudgeBtn('S', () => _nudge(-0.001, 0)),
                        const SizedBox(width: 8),
                        _buildNudgeBtn('W', () => _nudge(0, -0.001)),
                        const SizedBox(width: 8),
                        _buildNudgeBtn('E', () => _nudge(0, 0.001)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () {
                              setState(() {
                                _lat = 12.9716;
                                _lng = 77.5946;
                              });
                            },
                            icon: const Icon(Icons.my_location, size: 14),
                            label: const Text('GPS Pin',
                                style: TextStyle(fontSize: 11)),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: BhojanColors.primary,
                              side:
                                  const BorderSide(color: BhojanColors.outline),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(8),
                              ),
                              padding: const EdgeInsets.symmetric(vertical: 8),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Address Tag (Home, Work, Other)
                    const Text(
                      'SAVE AS',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                        color: BhojanColors.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: ['Home', 'Work', 'Other'].map((tag) {
                        final isSelected = _selectedTag == tag;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(tag),
                            selected: isSelected,
                            selectedColor: BhojanColors.primaryContainer,
                            backgroundColor: BhojanColors.surface,
                            labelStyle: TextStyle(
                              color: isSelected
                                  ? BhojanColors.primaryDark
                                  : BhojanColors.onSurface,
                              fontWeight: isSelected
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                              fontSize: 12,
                            ),
                            side: BorderSide(
                              color: isSelected
                                  ? BhojanColors.primary
                                  : BhojanColors.outline,
                            ),
                            onSelected: (val) {
                              if (val) setState(() => _selectedTag = tag);
                            },
                          ),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 16),

                    // Flat / House No
                    TextField(
                      controller: _flatController,
                      decoration: InputDecoration(
                        labelText: 'House / Flat / Floor No. *',
                        labelStyle: const TextStyle(
                            fontSize: 13, color: BhojanColors.onSurfaceVariant),
                        hintText: 'e.g. Flat 402, 4th Floor',
                        filled: true,
                        fillColor: BhojanColors.surface,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: BhojanColors.outline),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: BhojanColors.outline),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Nearby Landmark
                    TextField(
                      controller: _landmarkController,
                      decoration: InputDecoration(
                        labelText: 'Nearby Landmark (Optional)',
                        labelStyle: const TextStyle(
                            fontSize: 13, color: BhojanColors.onSurfaceVariant),
                        hintText: 'e.g. Opposite BDA Complex',
                        filled: true,
                        fillColor: BhojanColors.surface,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: BhojanColors.outline),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: BhojanColors.outline),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Area / Street
                    TextField(
                      controller: _areaController,
                      decoration: InputDecoration(
                        labelText: 'Street / Area / Locality',
                        labelStyle: const TextStyle(
                            fontSize: 13, color: BhojanColors.onSurfaceVariant),
                        filled: true,
                        fillColor: BhojanColors.surface,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: BhojanColors.outline),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: BhojanColors.outline),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Save Button
                    BhojanButton(
                      label: 'Save & Deliver to this Location',
                      onPressed: _saveAddress,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNudgeBtn(String label, VoidCallback onPressed) {
    return SizedBox(
      width: 38,
      height: 38,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          padding: EdgeInsets.zero,
          foregroundColor: BhojanColors.onSurface,
          side: const BorderSide(color: BhojanColors.outline),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
        ),
      ),
    );
  }
}
