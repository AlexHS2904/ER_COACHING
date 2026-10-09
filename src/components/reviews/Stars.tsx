type Props = {
  rating: number;
  className?: string;
};

export default function Stars({
  rating,
  className = "",
}: Props) {
  return (
    <div
      className={`
        flex
        items-center
        gap-0.5
        ${className}
      `}
      aria-label={`${rating} de 5 estrellas`}
    >
      {Array.from(
        {
          length: 5,
        },
        (
          _,
          index,
        ) => (
          <span
            key={
              index
            }
            aria-hidden="true"
            className={
              index <
              rating
                ? "text-[#B18A3D]"
                : "text-brand-taupe/30"
            }
          >
            ★
          </span>
        ),
      )}
    </div>
  );
}