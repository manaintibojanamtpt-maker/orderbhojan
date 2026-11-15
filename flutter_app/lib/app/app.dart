import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import '../core/di/injection.dart';
import '../core/theme/app_theme.dart';
import '../features/auth/domain/repositories/auth_repository.dart';
import '../features/auth/presentation/bloc/auth_bloc.dart';
import '../features/auth/presentation/bloc/auth_event.dart';
import '../features/cart/presentation/bloc/cart_bloc.dart';
import '../features/orders/domain/repositories/orders_repository.dart';
import '../features/orders/presentation/bloc/orders_bloc.dart';
import '../features/orders/presentation/bloc/orders_event.dart';
import 'routes/app_router.dart';

class OrderBhojanApp extends StatelessWidget {
  const OrderBhojanApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<AuthBloc>(
          create: (context) => AuthBloc(
            authRepository: sl<AuthRepository>(),
          )..add(const AuthCheckRequested()),
        ),
        BlocProvider<CartBloc>(
          create: (context) => CartBloc(),
        ),
        BlocProvider<OrdersBloc>(
          create: (context) => OrdersBloc(
            ordersRepository: sl<OrdersRepository>(),
          )..add(const OrdersLoadRequested()),
        ),
      ],
      child: MaterialApp.router(
        title: 'OrderBhojan',
        debugShowCheckedModeBanner: false,
        theme: BhojanTheme.lightTheme,
        routerConfig: BhojanRouter.router,
      ),
    );
  }
}
