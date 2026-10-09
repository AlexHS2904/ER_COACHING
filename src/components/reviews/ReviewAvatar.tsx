import type {
  ReviewAvatarKey,
} from "@/lib/reviews/avatars";

type Props = {
  avatarKey:
    ReviewAvatarKey;

  className?: string;
};

export default function ReviewAvatar({
  avatarKey,
  className = "",
}: Props) {
  return (
    <div
      className={`
        flex
        aspect-square
        items-center
        justify-center
        overflow-hidden
        rounded-full
        bg-brand-taupe/15
        text-brand-wine
        ${className}
      `}
    >
      <svg
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className="h-[72%] w-[72%]"
      >
        {avatarKey ===
          "claridad" && (
          <>
            <circle
              cx="32"
              cy="32"
              r="11"
              stroke="currentColor"
              strokeWidth="2.4"
            />

            <circle
              cx="32"
              cy="32"
              r="3.5"
              fill="currentColor"
            />

            <path
              d="M32 8v8M32 48v8M8 32h8M48 32h8M15 15l6 6M43 43l6 6M49 15l-6 6M21 43l-6 6"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </>
        )}

        {avatarKey ===
          "objetivo" && (
          <>
            <circle
              cx="30"
              cy="34"
              r="20"
              stroke="currentColor"
              strokeWidth="2.4"
            />

            <circle
              cx="30"
              cy="34"
              r="12"
              stroke="currentColor"
              strokeWidth="2.4"
            />

            <circle
              cx="30"
              cy="34"
              r="4"
              fill="currentColor"
            />

            <path
              d="M34 30 52 12M44 12h8v8"
              stroke="currentColor"
              strokeWidth="2.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}

        {avatarKey ===
          "crecimiento" && (
          <>
            <path
              d="M32 54V29"
              stroke="currentColor"
              strokeWidth="2.7"
              strokeLinecap="round"
            />

            <path
              d="M32 34c-11 0-17-7-17-17 11 0 17 6 17 17Z"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />

            <path
              d="M32 28c10 0 17-6 17-16-10 0-17 6-17 16Z"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />

            <path
              d="M20 54h24"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </>
        )}

        {avatarKey ===
          "equilibrio" && (
          <>
            <path
              d="M32 12v40M18 18h28"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            <path
              d="m18 18-9 18h18L18 18ZM46 18l-9 18h18L46 18Z"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />

            <path
              d="M22 52h20"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </>
        )}

        {avatarKey ===
          "avance" && (
          <>
            <path
              d="M12 48h12V36h12V24h12V12"
              stroke="currentColor"
              strokeWidth="2.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <path
              d="M39 12h9v9"
              stroke="currentColor"
              strokeWidth="2.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}

        {avatarKey ===
          "brujula" && (
          <>
            <circle
              cx="32"
              cy="32"
              r="23"
              stroke="currentColor"
              strokeWidth="2.4"
            />

            <path
              d="m39 23-5 12-12 6 5-12 12-6Z"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />

            <circle
              cx="32"
              cy="32"
              r="2.5"
              fill="currentColor"
            />

            <path
              d="M32 9v4M32 51v4M9 32h4M51 32h4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </div>
  );
}