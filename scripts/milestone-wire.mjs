import fs from 'node:fs';
function edit(p,f) { fs.writeFileSync(p,f(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'))); }
edit('src/features/checkout/hooks/useCheckoutFlow.ts',s=>{
  s="import { useCheckoutAttempt } from './useCheckoutAttempt';\nimport { getFirebaseAuth } from '@/firebase';\n"+s;
  s=s.replace('export interface CheckoutFlowState {',"export interface CheckoutFlowState {\n  readonly attemptRecovery: ReturnType<typeof useCheckoutAttempt>;");
  s=s.replace('  const resolvedRestaurantId =', '  const attemptRecovery = useCheckoutAttempt(sessionUser?.uid);\n\n  const resolvedRestaurantId =');
  s=s.replace(/    retry: \(failureCount, error\) => \{[\s\S]*?    retryDelay: \(attempt\) => Math.min\(1500, 350 \* 2 \*\* attempt\),/, '    retry: false, // HTTP client owns the complete deadline, including read-only retries.');
  s=s.replace(/getMarketplaceApiClient\(\)\.checkoutPlace\(\s*payload,\s*\)/g, 'attemptRecovery.place(payload, Math.round((quote?.grandTotal ?? 0) * 100), prepareQuery.dataUpdatedAt)');
  s=s.replace("        // Optimistic success: transition immediately; revert on failure (cart stays intact until confirmed).\n        setPlaceStatus('success');\n        setOrderId('pending');\n        setOrderNumber('Confirming…');", "        setPlaceStatus('placing');");
  s=s.replace('        setOrderId(placed.orderId);\n        setOrderNumber(placed.orderNumber);\n        markPerf', "        setOrderId(placed.orderId);\n        setOrderNumber(placed.orderNumber);\n        setPlaceStatus('success');\n        markPerf");
  s=s.replace('        setOrderId(confirmed.orderId);', "        if (getFirebaseAuth()?.currentUser?.uid !== sessionUser?.uid) throw new Error('Account changed; check order status after signing back in.');\n        setOrderId(confirmed.orderId);");
  s=s.replace('[assertCanPlaceOrder, getPayload, sessionUser]', '[assertCanPlaceOrder, getPayload, sessionUser, attemptRecovery, quote?.grandTotal, prepareQuery.dataUpdatedAt]');
  s=s.replace('[assertCanPlaceOrder, getPayload, quote?.grandTotal, sessionUser]', '[assertCanPlaceOrder, getPayload, quote?.grandTotal, sessionUser, attemptRecovery, prepareQuery.dataUpdatedAt]');
  s=s.replace('[assertCanPlaceOrder, getPayload, quote?.grandTotal, runUpiVerification, sessionUser]', '[assertCanPlaceOrder, getPayload, quote?.grandTotal, runUpiVerification, sessionUser, attemptRecovery, prepareQuery.dataUpdatedAt]');
  s=s.replace('      useCartStore.getState().clear();\n      setUpiPollMessage', '      setUpiPollMessage');
  s=s.replace('    setPlaceStatus(\'success\');\n    markPerf(\'pay_next_step\', \'upi-success\');', "    if (getFirebaseAuth()?.currentUser?.uid !== sessionUser?.uid) return;\n    setPlaceStatus('success');\n    markPerf('pay_next_step', 'upi-success');");
  s=s.replace("  }, []);\n\n  const runUpiVerification", "  }, [sessionUser?.uid]);\n\n  const runUpiVerification");
  s=s.replace('            isAuthenticated: Boolean(sessionUser?.uid),', '            isAuthenticated: Boolean(sessionUser?.uid),\n            signal: controller.signal,');
  s=s.replace('          logUpiDiag(\'snapshot\'', "          controller.signal.throwIfAborted();\n          logUpiDiag('snapshot'");
  s=s.replace("          throw new Error('Payment window expired before confirmation. Please place a new order.');", "          throw new Error('Payment window expired. Check order status before paying again.');");
  s=s.replace("throw new Error('Payment expired or failed. Please place a new order.');", "throw new Error('Payment expired or failed. Check order status before paying again.');");
  s=s.replace("  const reset = useCallback", "  useEffect(() => {\n    setUpiSession(null); setOrderId(null); setPlaceStatus('idle'); setPlaceError(null);\n    return () => { upiPollAbortRef.current?.abort(); };\n  }, [sessionUser?.uid]);\n\n  const reset = useCallback");
  const idx=s.lastIndexOf('  return {'); s=s.slice(0,idx)+s.slice(idx).replace('  return {','  return {\n    attemptRecovery,');
  return s;
});
edit('src/presentation/checkout/OrderBhojanCheckoutPage.tsx',s=>{
  s="import { CheckoutRecoveryView } from './CheckoutRecoveryView';\n"+s;
  s=s.replace('    quote,\n    scheduling,','    attemptRecovery,\n    quote,\n    scheduling,');
  s=s.replace("  const deliveryAddressLabel =", `  if ((attemptRecovery.pending || attemptRecovery.message) && status !== 'placing' && status !== 'success' && status !== 'awaiting_payment') {
    return <CheckoutRecoveryView recovery={attemptRecovery.recovery} checking={attemptRecovery.checking} message={attemptRecovery.message}
      onCheck={() => void attemptRecovery.check()}
      onTrack={() => { if (attemptRecovery.recovery?.orderId) navigate('/orders/' + encodeURIComponent(attemptRecovery.recovery.orderId) + '/track'); }}
      onContinue={() => { attemptRecovery.acknowledge(); navigate('/'); }} />;
  }

  const deliveryAddressLabel =`);
  return s;
});
edit('src/features/checkout/infrastructure/upiCheckout.ts',s=>{
  s="import { abortableDelay } from '@/lib/requestDeadline';\n"+s;
  const a=s.indexOf('export async function fetchOrderPaymentSnapshot');
  s=s.slice(0,a)+s.slice(a).replace('  readonly orderId: string;', '  readonly signal?: AbortSignal;\n  readonly orderId: string;').replace('client.getOrder(params.orderId)','client.getOrder(params.orderId, params.signal)');
  s=s.replace('    params.onTick?.(snapshot);','    params.signal?.throwIfAborted();\n    params.onTick?.(snapshot);');
  const b=s.indexOf('function sleep('); const c=s.indexOf('export function buildUpiQrImageUrl',b);
  s=s.slice(0,b)+`function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return abortableDelay(ms, signal ?? new AbortController().signal);
}

`+s.slice(c);
  return s;
});
