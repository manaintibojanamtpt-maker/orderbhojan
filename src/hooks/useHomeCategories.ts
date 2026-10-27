import { useQuery } from '@tanstack/react-query';
import { getFirebaseFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface HomeCategory {
  id: string;
  label: string;
  imageUrl: string;
  sequence: number;
}

export const DEFAULT_HOME_CATEGORIES: HomeCategory[] = [
  {
    id: 'biryani',
    label: 'Biryani',
    imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=240&auto=format&fit=crop&q=80',
    sequence: 1,
  },
  {
    id: 'south-indian',
    label: 'South Indian',
    imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=240&auto=format&fit=crop&q=80',
    sequence: 2,
  },
  {
    id: 'meals',
    label: 'Thali Meals',
    imageUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=240&auto=format&fit=crop&q=80',
    sequence: 3,
  },
  {
    id: 'north-indian',
    label: 'North Indian',
    imageUrl: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=240&auto=format&fit=crop&q=80',
    sequence: 4,
  },
  {
    id: 'pizza',
    label: 'Snacks',
    imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=240&auto=format&fit=crop&q=80',
    sequence: 5,
  },
];

export function useHomeCategories() {
  return useQuery({
    queryKey: ['home_categories'],
    queryFn: async () => {
      const db = getFirebaseFirestore();
      if (!db) {
        return DEFAULT_HOME_CATEGORIES;
      }
      try {
        const docRef = doc(db, 'platform_config', 'home_categories');
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          return DEFAULT_HOME_CATEGORIES;
        }
        const data = snap.data();
        const cats = (data.categories || []) as HomeCategory[];
        return cats.length > 0 ? cats : DEFAULT_HOME_CATEGORIES;
      } catch {
        return DEFAULT_HOME_CATEGORIES;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
