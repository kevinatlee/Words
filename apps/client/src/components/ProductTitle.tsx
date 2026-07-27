import { productConfig } from '@words/shared';

type ProductTitleProps = {
  compact?: boolean;
};

export function ProductTitle({ compact = false }: ProductTitleProps) {
  return (
    <span
      className={
        compact ? 'product-title product-title--compact' : 'product-title'
      }
    >
      <span className="product-title__mark" aria-hidden="true">
        W
      </span>
      <span>{productConfig.productName}</span>
    </span>
  );
}
