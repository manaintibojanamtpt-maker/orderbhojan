import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CheckoutRecoveryView } from '../../src/presentation/checkout/CheckoutRecoveryView';
import { CheckoutPageView } from '../../storefront-src/design-system/cart/CheckoutPageView';
import { readCheckoutAttempt, type CheckoutRecovery } from '../../src/features/checkout/infrastructure/checkoutAttempt';
import { useCartStore, cartItemCount } from '../../src/features/cart/store/cartStore';
import { applyConfirmedCartPlan } from '../../src/features/cart/domain/applyConfirmedCartPlan';
import { ConsumerAssistantSheet } from '../../src/features/assistant/ui/ConsumerAssistantSheet';
import '../../src/styles/globals.css';

function AssistantConfirmHarness() {
  const lines = useCartStore((s) => s.lines);
  const revision = useCartStore((s) => s.revision);
  const [lastResult, setLastResult] = useState<string>('NONE');

  const loadThreeDosas = () => {
    useCartStore.setState({
      lines: [
        {
          lineId: 'dosa_plain',
          foodId: 'dosa_plain',
          name: 'Masala Dosa',
          price: 80,
          quantity: 3,
          restaurantSlug: 'swathi-tiffin',
          restaurantId: 'rest_swathi',
        },
      ],
      restaurantSlug: 'swathi-tiffin',
      revision: 1,
      userSessionId: 'sess_browser_user',
      visible: true,
    });
    setLastResult('LOADED');
  };

  const confirmSplitPlan = () => {
    const validation: any = {
      schemaVersion: '5.0',
      conversationId: 'conv_browser_1',
      status: 'validated',
      valid: true,
      proposedActions: [
        { type: 'cart_update_plan', payload: { lineId: 'dosa_plain', quantity: 2 } },
        { type: 'cart_add_plan', payload: { foodId: 'dosa_plain', name: 'Masala Dosa', price: 80, quantity: 1, instructions: 'without onion' } },
      ],
    };
    const res = applyConfirmedCartPlan({
      userConfirmed: true,
      validation,
      deps: { commitAtomicBatchPlan: useCartStore.getState().commitAtomicBatchPlan },
      planContext: {
        proposalId: 'prop_browser_split',
        restaurantId: 'rest_swathi',
        restaurantSlug: 'swathi-tiffin',
        userSessionId: 'sess_browser_user',
        expectedCartRevision: 1,
      },
    });
    setLastResult(res.mutatedState ? 'SUCCESS' : (res.reason || 'FAILED'));
  };

  const confirmBadPlan = () => {
    const validation: any = {
      schemaVersion: '5.0',
      conversationId: 'conv_browser_bad',
      status: 'validated',
      valid: true,
      proposedActions: [
        { type: 'cart_update_plan', payload: { lineId: 'dosa_plain', quantity: 2 } },
        { type: 'cart_add_plan', payload: { foodId: 'dosa_plain', name: 'Masala Dosa', price: -50, quantity: 1 } },
      ],
    };
    const res = applyConfirmedCartPlan({
      userConfirmed: true,
      validation,
      deps: { commitAtomicBatchPlan: useCartStore.getState().commitAtomicBatchPlan },
      planContext: {
        proposalId: 'prop_browser_bad',
        restaurantId: 'rest_swathi',
        expectedCartRevision: useCartStore.getState().revision,
      },
    });
    setLastResult(res.mutatedState ? 'SUCCESS' : (res.reason || 'FAILED'));
  };

  const confirmExpiredPlan = () => {
    const validation: any = {
      schemaVersion: '5.0',
      conversationId: 'conv_browser_expired',
      status: 'validated',
      valid: true,
      proposedActions: [
        { type: 'cart_add_plan', payload: { foodId: 'dosa_plain', name: 'Masala Dosa', price: 80, quantity: 1 } },
      ],
    };
    const res = applyConfirmedCartPlan({
      userConfirmed: true,
      validation,
      deps: { commitAtomicBatchPlan: useCartStore.getState().commitAtomicBatchPlan },
      planContext: {
        proposalId: 'prop_browser_expired',
        restaurantId: 'rest_swathi',
        expectedCartRevision: useCartStore.getState().revision,
        expiresAt: Date.now() - 10000,
      },
    });
    setLastResult(res.mutatedState ? 'SUCCESS' : (res.reason || 'FAILED'));
  };

  const confirmWrongRestaurant = () => {
    const validation: any = {
      schemaVersion: '5.0',
      conversationId: 'conv_browser_wrong_rest',
      status: 'validated',
      valid: true,
      proposedActions: [
        { type: 'cart_add_plan', payload: { foodId: 'biryani_1', name: 'Biryani', price: 200, quantity: 1 } },
      ],
    };
    const res = applyConfirmedCartPlan({
      userConfirmed: true,
      validation,
      deps: { commitAtomicBatchPlan: useCartStore.getState().commitAtomicBatchPlan },
      planContext: {
        proposalId: 'prop_browser_wrong_rest',
        restaurantId: 'rest_other_kitchen',
        expectedCartRevision: useCartStore.getState().revision,
      },
    });
    setLastResult(res.mutatedState ? 'SUCCESS' : (res.reason || 'FAILED'));
  };

  return (
    <div className="p-4 space-y-3 bg-[#0a0a0a] text-white">
      <div id="cart-item-count">{cartItemCount(lines)}</div>
      <div id="cart-line-count">{lines.length}</div>
      <div id="cart-revision">{revision}</div>
      <div id="last-confirm-result">{lastResult}</div>
      <button id="btn-load-three-dosas" type="button" onClick={loadThreeDosas}>Load 3 Dosas</button>
      <button id="btn-confirm-split" type="button" onClick={confirmSplitPlan}>Confirm &amp; add to cart</button>
      <button id="btn-confirm-bad" type="button" onClick={confirmBadPlan}>Confirm Bad Plan</button>
      <button id="btn-confirm-expired" type="button" onClick={confirmExpiredPlan}>Confirm Expired Plan</button>
      <button id="btn-confirm-wrong-rest" type="button" onClick={confirmWrongRestaurant}>Confirm Wrong Restaurant</button>
    </div>
  );
}

function RealAssistantSheetHarness() {
  const lines = useCartStore((s) => s.lines);
  const revision = useCartStore((s) => s.revision);
  const [sessionUser, setSessionUser] = useState<string>('usr_test_customer');
  const [proposalOriginSession, setProposalOriginSession] = useState<string>('usr_test_customer');
  const [lastOutcome, setLastOutcome] = useState<string>('READY');
  const [pendingValidation, setPendingValidation] = useState<any>({
    schemaVersion: '5.0',
    conversationId: 'conv_real_sheet_1',
    status: 'validated',
    valid: true,
    proposedActions: [
      { type: 'cart_update_plan', payload: { lineId: 'dosa_plain', quantity: 2 } },
      { type: 'cart_add_plan', payload: { foodId: 'dosa_plain', name: 'Masala Dosa', price: 80, quantity: 1, instructions: 'without onion' } },
    ],
  });

  const loadThreeDosas = () => {
    useCartStore.setState({
      lines: [
        {
          lineId: 'dosa_plain',
          foodId: 'dosa_plain',
          name: 'Masala Dosa',
          price: 80,
          quantity: 3,
          restaurantSlug: 'swathi-tiffin',
          restaurantId: 'rest_swathi',
        },
      ],
      restaurantSlug: 'swathi-tiffin',
      revision: 1,
      userSessionId: 'usr_test_customer',
      visible: true,
    });
    setSessionUser('usr_test_customer');
    setProposalOriginSession('usr_test_customer');
    setLastOutcome('LOADED');
  };

  const handleConfirmPlan = () => {
    const res = applyConfirmedCartPlan({
      userConfirmed: true,
      validation: pendingValidation,
      deps: { commitAtomicBatchPlan: useCartStore.getState().commitAtomicBatchPlan },
      planContext: {
        proposalId: 'prop_real_sheet_split',
        restaurantId: 'rest_swathi',
        restaurantSlug: 'swathi-tiffin',
        userSessionId: proposalOriginSession,
        expectedCartRevision: 1,
      },
    });

    if (res.mutatedState) {
      setLastOutcome('CONFIRMED_SUCCESS');
      setPendingValidation(null);
    } else {
      setLastOutcome(res.reason || 'CONFIRMATION_REJECTED');
    }
  };

  const handleSwitchAccount = () => {
    setSessionUser('usr_test_customer_2');
    useCartStore.setState({ userSessionId: 'usr_test_customer_2' });
  };

  return (
    <div className="p-4 bg-[#0a0a0a] text-white space-y-3">
      <div className="flex gap-4 text-xs border-b border-white/10 pb-2">
        <div>Session: <span id="sheet-session-user">{sessionUser}</span></div>
        <div>Cart Items: <span id="sheet-cart-item-count">{cartItemCount(lines)}</span></div>
        <div>Cart Lines: <span id="sheet-cart-line-count">{lines.length}</span></div>
        <div>Revision: <span id="sheet-cart-revision">{revision}</span></div>
        <div>Outcome: <span id="sheet-confirm-outcome">{lastOutcome}</span></div>
      </div>
      <div className="flex gap-2">
        <button id="btn-sheet-load-three-dosas" type="button" onClick={loadThreeDosas} className="px-2 py-1 bg-neutral-700 rounded text-xs">Load 3 Dosas</button>
        <button id="btn-sheet-switch-account" type="button" onClick={handleSwitchAccount} className="px-2 py-1 bg-amber-700 rounded text-xs">Switch to Customer 2</button>
      </div>
      <div className="max-w-md border border-white/10 rounded-2xl overflow-hidden bg-[#110e0c]">
        <ConsumerAssistantSheet
          messages={[
            { id: '1', role: 'user', text: 'Add three dosas' },
            { id: '2', role: 'assistant', text: 'Added 3 Masala Dosas' },
            { id: '3', role: 'user', text: 'One without onion' },
            { id: '4', role: 'assistant', text: 'Customized: 2 regular + 1 without onion. Tap confirm below to add.' },
          ]}
          input=""
          onInputChange={() => {}}
          onSend={() => {}}
          loading={false}
          validating={false}
          applying={false}
          error={null}
          onClearError={() => {}}
          starters={[]}
          pendingValidation={pendingValidation}
          onConfirmPlan={handleConfirmPlan}
          onDismissPlan={() => setPendingValidation(null)}
          isPostOrder={false}
          onFollowHint={() => {}}
        />
      </div>
    </div>
  );
}

function Harness() {
  const [recovery, setRecovery] = useState<CheckoutRecovery | null>(null);
  const [checking, setChecking] = useState(false);
  const [method, setMethod] = useState<'upi' | 'cod' | 'razorpay' | null>('upi');
  const [phone, setPhone] = useState('');
  const mode = new URLSearchParams(location.search).get('mode');

  if (mode === 'real_assistant_sheet') {
    return <RealAssistantSheetHarness />;
  }

  if (mode === 'assistant_confirm') {
    return <AssistantConfirmHarness />;
  }

  if (mode === 'checkout') return <CheckoutPageView
    title="Review your order" subtitle="Test kitchen" quoteLoading={false}
    contact={{value:phone,hint:'Phone for order updates'}} onContactChange={setPhone}
    address={{label:'Deliver to',value:'Flat 12, Sunrise Apartments, Test Area',loading:false,actionLabel:'Change'}}
    onAddressAction={()=>{}} backLabel="Back to cart" onBack={()=>{}}
    paymentOptions={[{id:'upi',title:'Pay via UPI',subtitle:'Check payment status after return'},{id:'cod',title:'Cash on delivery',subtitle:'Pay when delivered'}]}
    selectedPaymentMethod={method} onSelectPaymentMethod={setMethod}
    placeOrderLabel="Place test order" placeOrderBusy={false} onPlaceOrder={()=>{document.body.dataset.placed='test';}} actionsDisabled={false} />;

  const reference=readCheckoutAttempt('browser-customer');
  return <CheckoutRecoveryView recovery={recovery} checking={checking} message={reference ? null : 'No saved reference'}
    onCheck={()=>{setChecking(true); void fetch('/api/test/recovery').then(r=>r.json()).then(setRecovery).finally(()=>setChecking(false));}}
    onTrack={()=>{document.body.dataset.tracked='true';}} onContinue={()=>{document.body.dataset.continued='true';}} />;
}
createRoot(document.getElementById('root')!).render(<Harness />);
