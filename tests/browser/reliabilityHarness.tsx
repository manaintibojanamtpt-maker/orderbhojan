import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CheckoutRecoveryView } from '../../src/presentation/checkout/CheckoutRecoveryView';
import { CheckoutPageView } from '../../storefront-src/design-system/cart/CheckoutPageView';
import { readCheckoutAttempt, type CheckoutRecovery } from '../../src/features/checkout/infrastructure/checkoutAttempt';
import '../../src/styles/globals.css';
function Harness() {
  const [recovery, setRecovery] = useState<CheckoutRecovery | null>(null);
  const [checking, setChecking] = useState(false);
  const [method, setMethod] = useState<'upi' | 'cod' | 'razorpay' | null>('upi');
  const [phone, setPhone] = useState('');
  if (new URLSearchParams(location.search).get('mode') === 'checkout') return <CheckoutPageView
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
