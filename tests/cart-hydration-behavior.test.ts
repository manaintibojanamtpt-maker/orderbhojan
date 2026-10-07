import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useCartStore } from '../src/features/cart/store/cartStore';
import { useRestaurantContextStore } from '../src/features/restaurant/store/restaurantContextStore';
import { sanitizeRestaurantSlugContext } from '../src/lib/sanitizeLiveRestaurantContext';
test('partial cart/context state never overrides explicitly incomplete persistence', () => {
  const cartDescriptor=Object.getOwnPropertyDescriptor(useCartStore,'persist');
  const ctxDescriptor=Object.getOwnPropertyDescriptor(useRestaurantContextStore,'persist');
  try {
    for(const [cartReady,contextReady] of [[false,false],[true,false],[false,true]]) {
      Object.defineProperty(useCartStore,'persist',{configurable:true,value:{hasHydrated:()=>cartReady}});
      Object.defineProperty(useRestaurantContextStore,'persist',{configurable:true,value:{hasHydrated:()=>contextReady}});
      useRestaurantContextStore.setState({restaurantSlug:'old',restaurantId:'old',contextToken:'old-context'});
      useCartStore.setState({restaurantSlug:'old',lines:[{foodId:'dish',lineId:'dish',name:'Meal',quantity:2,price:100,restaurantId:'old',restaurantSlug:'old'}]});
      sanitizeRestaurantSlugContext('new');
      assert.equal(useCartStore.getState().lines[0]?.quantity,2);
      assert.equal(useRestaurantContextStore.getState().restaurantSlug,'old');
      useCartStore.getState().setRestaurant('new');
      assert.equal(useCartStore.getState().lines[0]?.quantity,2);
    }
  } finally {
    for(const [store,descriptor] of [[useCartStore,cartDescriptor],[useRestaurantContextStore,ctxDescriptor]] as const) {
      if(descriptor) Object.defineProperty(store,'persist',descriptor); else Reflect.deleteProperty(store,'persist');
    }
  }
});
