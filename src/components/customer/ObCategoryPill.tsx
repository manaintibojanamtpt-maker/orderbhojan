export interface ObCategoryPillProps {
  label: string;
  imageUrl?: string;
  isActive?: boolean;
  onClick?: () => void;
}

/**
 * Category pill — horizontal scrolling food categories.
 */
export function ObCategoryPill({ label, imageUrl, isActive, onClick }: ObCategoryPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ob-category-pill ${isActive ? 'ob-category-pill--active' : ''}`}
    >
      {imageUrl && (
        <img src={imageUrl} alt="" aria-hidden className="ob-category-pill__img" />
      )}
      <span className="text-[11px] font-semibold text-white/85">{label}</span>
    </button>
  );
}

export default ObCategoryPill;
