import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/di/injection.dart';
import '../../../../core/services/preferences_service.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_dimens.dart';
import '../../../../core/widgets/bhojan_button.dart';
import 'map_pin_picker_sheet.dart';

enum _LocationStep { list, detecting, enterDetails }

class LocationSelectorSheet extends StatefulWidget {
  final String currentAddress;
  final ValueChanged<String> onAddressSelected;

  const LocationSelectorSheet({
    super.key,
    required this.currentAddress,
    required this.onAddressSelected,
  });

  static Future<void> show(
    BuildContext context, {
    required String currentAddress,
    required ValueChanged<String> onAddressSelected,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: BhojanColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BhojanDimens.roundedSheet,
      ),
      builder: (context) => LocationSelectorSheet(
        currentAddress: currentAddress,
        onAddressSelected: onAddressSelected,
      ),
    );
  }

  @override
  State<LocationSelectorSheet> createState() => _LocationSelectorSheetState();
}

class _LocationSelectorSheetState extends State<LocationSelectorSheet> {
  static const MethodChannel _platformChannel =
      MethodChannel('com.bhojanos.customer/platform');

  _LocationStep _step = _LocationStep.list;
  late String _selected;
  double? _activeLat;
  double? _activeLng;

  final TextEditingController _flatController = TextEditingController();
  final TextEditingController _streetController = TextEditingController();
  final TextEditingController _areaController = TextEditingController();
  String _addressTag = 'Home';

  List<Map<String, String>> _addresses = [];

  @override
  void initState() {
    super.initState();
    _selected = widget.currentAddress;
    final activeCoords = sl<PreferencesService>().getActiveCoordinates();
    _activeLat = activeCoords?['lat'];
    _activeLng = activeCoords?['lng'];
    _loadSavedAddresses();
  }

  @override
  void dispose() {
    _flatController.dispose();
    _streetController.dispose();
    _areaController.dispose();
    super.dispose();
  }

  Future<void> _loadSavedAddresses() async {
    List<Map<String, String>> list = [];
    try {
      final prefs = sl<PreferencesService>();
      list = List<Map<String, String>>.from(prefs.getSavedAddresses());
    } catch (_) {}

    // Synchronize saved addresses from authenticated customer's Firestore profile
    final currentUser = FirebaseAuth.instance.currentUser;
    if (currentUser != null && sl.isRegistered<FirebaseFirestore>()) {
      try {
        final firestore = sl<FirebaseFirestore>();
        final snapshot = await firestore
            .collection('users')
            .doc(currentUser.uid)
            .collection('addresses')
            .limit(10)
            .get();

        if (snapshot.docs.isNotEmpty) {
          for (final doc in snapshot.docs) {
            final data = doc.data();
            final addr = data['address'] as String? ?? data['displayLabel'] as String? ?? '';
            if (addr.isNotEmpty && !list.any((a) => a['address'] == addr)) {
              final newAddr = {
                'tag': (data['tag'] as String?) ?? 'Home',
                'title': (data['title'] as String?) ?? addr,
                'address': addr,
                'lat': (data['lat']?.toString()) ?? '',
                'lng': (data['lng']?.toString()) ?? '',
              };
              list.add(newAddr);
              await sl<PreferencesService>().addSavedAddress(newAddr);
            }
          }
        }
      } catch (e) {
        debugPrint('[LocationSelector] Firestore profile address sync notice: $e');
      }
    }

    if (mounted) {
      setState(() {
        _addresses = list;
      });
    }
  }

  void _startGpsDetection() async {
    setState(() {
      _step = _LocationStep.detecting;
    });

    try {
      final res = await _platformChannel.invokeMethod('getCurrentLocation');
      if (res is Map) {
        final lat = (res['lat'] as num).toDouble();
        final lng = (res['lng'] as num).toDouble();
        _activeLat = lat;
        _activeLng = lng;
        await sl<PreferencesService>().setActiveCoordinates(lat, lng);

        // Reverse geocode via backend
        String resolvedArea = '';
        try {
          final dio = sl<Dio>();
          final revRes = await dio.get('/api/marketplace/location/reverse?lat=$lat&lng=$lng');
          if (revRes.statusCode == 200 && revRes.data is Map) {
            final val = revRes.data['value'];
            if (val is Map) {
              final formatted = val['text']?['formatted'] as String? ??
                  val['displayLabel'] as String?;
              if (formatted != null && formatted.isNotEmpty) {
                resolvedArea = formatted;
              }
            }
          }
        } catch (e) {
          debugPrint('[LocationSelector] Reverse geocode note: $e');
        }

        if (!mounted) return;
        setState(() {
          _areaController.text = resolvedArea.isNotEmpty ? resolvedArea : 'Detected Location ($lat, $lng)';
          _step = _LocationStep.enterDetails;
        });
        return;
      }
    } on PlatformException catch (e) {
      debugPrint('[LocationSelector] GPS detection platform exception: ${e.code} - ${e.message}');
      if (!mounted) return;
      setState(() {
        _step = _LocationStep.list;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e.code == 'PERMISSION_DENIED'
                ? 'Location permission denied. Please enter address manually or choose on map.'
                : 'GPS is unavailable. Please enter address manually or choose on map.',
          ),
          backgroundColor: BhojanColors.terracotta,
          duration: const Duration(seconds: 4),
        ),
      );
      return;
    } catch (e) {
      debugPrint('[LocationSelector] GPS detection note: $e');
    }

    if (!mounted) return;
    setState(() {
      _step = _LocationStep.enterDetails;
    });
  }

  void _saveDetailedAddress() async {
    final flat = _flatController.text.trim();
    final street = _streetController.text.trim();
    final area = _areaController.text.trim();

    if (flat.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter your Flat / House / Floor number'),
          backgroundColor: BhojanColors.terracotta,
        ),
      );
      return;
    }

    if (street.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter your Street / Landmark'),
          backgroundColor: BhojanColors.terracotta,
        ),
      );
      return;
    }

    final fullAddress = area.isNotEmpty ? '$flat, $street, $area' : '$flat, $street';
    final title = '$_addressTag${area.isNotEmpty ? ', $area' : ''}';

    try {
      final prefs = sl<PreferencesService>();
      await prefs.setActiveAddress(fullAddress);
      if (_activeLat != null && _activeLng != null) {
        await prefs.setActiveCoordinates(_activeLat!, _activeLng!);
      }
      final addressEntry = {
        'tag': _addressTag,
        'title': title,
        'address': fullAddress,
        if (_activeLat != null) 'lat': _activeLat.toString(),
        if (_activeLng != null) 'lng': _activeLng.toString(),
      };
      await prefs.addSavedAddress(addressEntry);

      // Persist to authenticated customer's Firestore profile
      final currentUser = FirebaseAuth.instance.currentUser;
      if (currentUser != null && sl.isRegistered<FirebaseFirestore>()) {
        try {
          await sl<FirebaseFirestore>()
              .collection('users')
              .doc(currentUser.uid)
              .collection('addresses')
              .add({
            ...addressEntry,
            'createdAt': FieldValue.serverTimestamp(),
          });
        } catch (e) {
          debugPrint('[LocationSelector] Firestore profile address save notice: $e');
        }
      }
    } catch (_) {}

    widget.onAddressSelected(fullAddress);
    if (!mounted) return;
    Navigator.pop(context);

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Delivering to: $fullAddress'),
        backgroundColor: BhojanColors.primary,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: AnimatedPadding(
        duration: const Duration(milliseconds: 200),
        padding: EdgeInsets.only(
          left: BhojanDimens.space20,
          right: BhojanDimens.space20,
          top: BhojanDimens.space12,
          bottom:
              MediaQuery.of(context).viewInsets.bottom + BhojanDimens.space16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drag Handle
            Center(
              child: Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: BhojanColors.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: BhojanDimens.space16),

            // Step Switcher
            if (_step == _LocationStep.list)
              _buildLocationList()
            else if (_step == _LocationStep.detecting)
              _buildDetectingView()
            else
              _buildAddressEntryForm(),
          ],
        ),
      ),
    );
  }

  Widget _buildLocationList() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Header Title
        Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: const BoxDecoration(
                color: BhojanColors.primaryContainer,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.location_on,
                size: 20,
                color: BhojanColors.primary,
              ),
            ),
            const SizedBox(width: BhojanDimens.space12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Select Delivery Location',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: BhojanColors.onSurface,
                    ),
                  ),
                  Text(
                    'Home-cooked kitchens deliver within 8 km',
                    style: TextStyle(
                      fontSize: 12,
                      color: BhojanColors.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              icon: const Icon(Icons.close,
                  size: 20, color: BhojanColors.onSurfaceVariant),
              onPressed: () => Navigator.pop(context),
            ),
          ],
        ),
        const SizedBox(height: BhojanDimens.space16),

        // Search Bar
        Container(
          height: 46,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: BhojanColors.surfaceContainerLow,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: BhojanColors.outline, width: 0.8),
          ),
          child: const Row(
            children: [
              Icon(Icons.search,
                  size: 20, color: BhojanColors.onSurfaceVariant),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Search area, apartment, street...',
                  style: TextStyle(
                    fontSize: 13,
                    color: BhojanColors.textMuted,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: BhojanDimens.space16),

        // Use Current GPS Location Tile
        InkWell(
          onTap: _startGpsDetection,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: BhojanColors.primaryContainer.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: BhojanColors.outline, width: 0.8),
            ),
            child: const Row(
              children: [
                Icon(Icons.my_location, size: 20, color: BhojanColors.primary),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Use Current GPS Location',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: BhojanColors.primaryDark,
                        ),
                      ),
                      Text(
                        'Detect GPS coordinates & enter flat / house details',
                        style: TextStyle(
                          fontSize: 11,
                          color: BhojanColors.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right,
                    size: 20, color: BhojanColors.primary),
              ],
            ),
          ),
        ),
        const SizedBox(height: BhojanDimens.space16),

        const Text(
          'SAVED ADDRESSES',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: BhojanColors.onSurfaceVariant,
            letterSpacing: 0.8,
          ),
        ),
        const SizedBox(height: BhojanDimens.space8),

        // Saved Addresses List
        ..._addresses.map((item) {
          final isSelected = _selected.contains(item['tag'] ?? '');
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              color: isSelected
                  ? BhojanColors.surfaceContainerLow
                  : BhojanColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: isSelected ? BhojanColors.primary : BhojanColors.outline,
                width: isSelected ? 1.4 : 0.8,
              ),
            ),
            child: ListTile(
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              leading: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: isSelected
                      ? BhojanColors.primary
                      : BhojanColors.surfaceContainer,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  item['tag'] == 'Home'
                      ? Icons.home
                      : item['tag'] == 'Work'
                          ? Icons.work
                          : Icons.location_on,
                  size: 18,
                  color:
                      isSelected ? Colors.white : BhojanColors.onSurfaceVariant,
                ),
              ),
              title: Row(
                children: [
                  Expanded(
                    child: Text(
                      item['title'] ?? item['tag'] ?? 'Address',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: BhojanColors.onSurface,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (item['eta'] != null) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: BhojanColors.primaryContainer,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        item['eta']!,
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: BhojanColors.primaryDark,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  item['address'] ?? '',
                  style: const TextStyle(
                    fontSize: 12,
                    color: BhojanColors.onSurfaceVariant,
                    height: 1.3,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              trailing: Icon(
                isSelected ? Icons.check_circle : Icons.radio_button_unchecked,
                color: isSelected
                    ? BhojanColors.primary
                    : BhojanColors.outlineVariant,
                size: 20,
              ),
              onTap: () async {
                final addr = item['address'] ?? item['title']!;
                setState(() => _selected = addr);
                await sl<PreferencesService>().setActiveAddress(addr);
                final latStr = item['lat'];
                final lngStr = item['lng'];
                if (latStr != null && lngStr != null && latStr.isNotEmpty && lngStr.isNotEmpty) {
                  final lat = double.tryParse(latStr);
                  final lng = double.tryParse(lngStr);
                  if (lat != null && lng != null) {
                    await sl<PreferencesService>().setActiveCoordinates(lat, lng);
                  }
                }
                widget.onAddressSelected(addr);
                if (context.mounted) Navigator.pop(context);
              },
            ),
          );
        }),

        const SizedBox(height: BhojanDimens.space12),

        // Pin on Map Button
        OutlinedButton.icon(
          onPressed: () {
            Navigator.pop(context);
            MapPinPickerSheet.show(
              context,
              onLocationConfirmed: widget.onAddressSelected,
            );
          },
          icon: const Icon(Icons.map_outlined, size: 18),
          label: const Text('Choose on Interactive Map'),
          style: OutlinedButton.styleFrom(
            foregroundColor: BhojanColors.primary,
            side: const BorderSide(color: BhojanColors.outline, width: 1.0),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            padding: const EdgeInsets.symmetric(vertical: 12),
          ),
        ),
      ],
    );
  }

  Widget _buildDetectingView() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64,
            height: 64,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: BhojanColors.primaryContainer,
              shape: BoxShape.circle,
            ),
            child: const CircularProgressIndicator(
              strokeWidth: 3,
              valueColor: AlwaysStoppedAnimation<Color>(BhojanColors.primary),
            ),
          ),
          const SizedBox(height: 20),
          const Text(
            'Detecting your location...',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: BhojanColors.onSurface,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Acquiring high-accuracy GPS coordinates & locality',
            style: TextStyle(
              fontSize: 12,
              color: BhojanColors.onSurfaceVariant,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildAddressEntryForm() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Header with Back Button
        Row(
          children: [
            IconButton(
              icon: const Icon(Icons.arrow_back, size: 20),
              onPressed: () => setState(() => _step = _LocationStep.list),
            ),
            const SizedBox(width: 4),
            const Expanded(
              child: Text(
                'Enter Complete Address',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: BhojanColors.onSurface,
                ),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.close,
                  size: 20, color: BhojanColors.onSurfaceVariant),
              onPressed: () => Navigator.pop(context),
            ),
          ],
        ),
        const SizedBox(height: 12),

        // Verified Location Banner
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: BhojanColors.primaryContainer.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: BhojanColors.outline, width: 0.8),
          ),
          child: Row(
            children: [
              const Icon(Icons.check_circle,
                  color: BhojanColors.vegGreen, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'GPS Verified: ${_areaController.text}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: BhojanColors.primaryDark,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Flat / House / Floor
        TextField(
          controller: _flatController,
          autofocus: true,
          decoration: InputDecoration(
            labelText: 'Flat / House / Floor / Building *',
            hintText: 'e.g. Flat 402, Block B, Palm Heights',
            labelStyle: const TextStyle(
                fontSize: 13, color: BhojanColors.onSurfaceVariant),
            hintStyle:
                const TextStyle(fontSize: 12, color: BhojanColors.textMuted),
            prefixIcon: const Icon(Icons.apartment,
                size: 20, color: BhojanColors.primary),
            filled: true,
            fillColor: BhojanColors.surfaceContainerLow,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: BhojanColors.outline),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: BhojanColors.outline),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide:
                  const BorderSide(color: BhojanColors.primary, width: 1.5),
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          ),
        ),
        const SizedBox(height: 12),

        // Street / Landmark
        TextField(
          controller: _streetController,
          decoration: InputDecoration(
            labelText: 'Street / Road / Landmark *',
            hintText: 'e.g. North Main Road, Near D-Mart',
            labelStyle: const TextStyle(
                fontSize: 13, color: BhojanColors.onSurfaceVariant),
            hintStyle:
                const TextStyle(fontSize: 12, color: BhojanColors.textMuted),
            prefixIcon: const Icon(Icons.add_road,
                size: 20, color: BhojanColors.primary),
            filled: true,
            fillColor: BhojanColors.surfaceContainerLow,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: BhojanColors.outline),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: BhojanColors.outline),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide:
                  const BorderSide(color: BhojanColors.primary, width: 1.5),
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          ),
        ),
        const SizedBox(height: 12),

        // Area / City
        TextField(
          controller: _areaController,
          decoration: InputDecoration(
            labelText: 'Area / Locality / City',
            labelStyle: const TextStyle(
                fontSize: 13, color: BhojanColors.onSurfaceVariant),
            prefixIcon: const Icon(Icons.location_city,
                size: 20, color: BhojanColors.primary),
            filled: true,
            fillColor: BhojanColors.surfaceContainerLow,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: BhojanColors.outline),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: BhojanColors.outline),
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          ),
        ),
        const SizedBox(height: 16),

        // Address Tag Chips
        Row(
          children: [
            const Text(
              'Save as:',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: BhojanColors.onSurface,
              ),
            ),
            const SizedBox(width: 12),
            _buildTagChip('Home', Icons.home),
            const SizedBox(width: 8),
            _buildTagChip('Work', Icons.work),
            const SizedBox(width: 8),
            _buildTagChip('Other', Icons.location_on),
          ],
        ),
        const SizedBox(height: 24),

        // Save & Deliver Button
        BhojanButton(
          label: 'Save Address & Deliver Here',
          onPressed: _saveDetailedAddress,
        ),
      ],
    );
  }

  Widget _buildTagChip(String label, IconData icon) {
    final isSelected = _addressTag == label;
    return InkWell(
      onTap: () => setState(() => _addressTag = label),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? BhojanColors.primary : BhojanColors.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? BhojanColors.primary : BhojanColors.outline,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 14,
              color: isSelected ? Colors.white : BhojanColors.onSurfaceVariant,
            ),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color: isSelected ? Colors.white : BhojanColors.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
