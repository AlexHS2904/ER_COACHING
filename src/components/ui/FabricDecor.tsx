type FabricDecorProps = {
  variant?: "default" | "alternate" | "soft";
};

export default function FabricDecor({
  variant = "default",
}: FabricDecorProps) {
  if (variant === "alternate") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
        {/* taupe arriba derecha */}
        <div
          className="
            absolute -right-20 -top-16
            h-[240px] w-[330px]
            rounded-[58%_42%_48%_52%/42%_55%_45%_58%]
            bg-brand-taupe/22
          "
        />

        {/* clara centro izquierda */}
        <div
          className="
            absolute left-[12%] top-[34%]
            h-[260px] w-[330px]
            rounded-[44%_56%_61%_39%/52%_44%_56%_48%]
            bg-white/24
          "
        />

        {/* taupe abajo izquierda */}
        <div
          className="
            absolute -bottom-20 -left-24
            h-[280px] w-[390px]
            rounded-[63%_37%_47%_53%/41%_59%_41%_59%]
            bg-brand-taupe/18
          "
        />

        {/* clara inferior derecha */}
        <div
          className="
            absolute bottom-[8%] right-[12%]
            h-[210px] w-[280px]
            rounded-[51%_49%_38%_62%/58%_47%_53%_42%]
            bg-white/20
          "
        />

        {/* vino difuminado */}
        <div
          className="
            absolute right-[28%] top-[22%]
            h-48 w-48
            rounded-full
            bg-brand-wine/6
            blur-2xl
          "
        />

        {/* verde difuminado */}
        <div
          className="
            absolute bottom-[20%] left-[34%]
            h-56 w-56
            rounded-full
            bg-brand-green/6
            blur-2xl
          "
        />

        {/* arco */}
        <div
          className="
            absolute -left-44 top-[12%]
            h-[420px] w-[420px]
            rounded-full
            border border-brand-taupe/20
          "
        />

        {/* fibras */}
        <span className="fabric-scratch absolute left-[14%] top-[20%] w-16 rotate-[11deg]" />
        <span className="fabric-scratch absolute right-[22%] top-[36%] w-24 -rotate-[7deg]" />
        <span className="fabric-scratch absolute bottom-[18%] left-[48%] w-20 rotate-[5deg]" />
        <span className="fabric-scratch absolute bottom-[35%] right-[9%] w-14 -rotate-[12deg]" />
      </div>
    );
  }

  if (variant === "soft") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
        <div
          className="
            absolute left-[5%] top-[12%]
            h-[230px] w-[300px]
            rounded-[54%_46%_58%_42%/44%_52%_48%_56%]
            bg-brand-taupe/12
          "
        />

        <div
          className="
            absolute right-[8%] top-[38%]
            h-[260px] w-[320px]
            rounded-[45%_55%_41%_59%/55%_43%_57%_45%]
            bg-white/18
          "
        />

        <div
          className="
            absolute bottom-[8%] left-[32%]
            h-44 w-44
            rounded-full
            bg-brand-green/4
            blur-2xl
          "
        />

        <span className="fabric-scratch absolute left-[20%] top-[45%] w-16 rotate-[8deg]" />
        <span className="fabric-scratch absolute bottom-[22%] right-[20%] w-20 -rotate-[6deg]" />
      </div>
    );
  }

  // DEFAULT
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <div
        className="
          absolute -left-24 -top-20
          h-[210px] w-[310px]
          rounded-[47%_53%_63%_37%/52%_47%_53%_48%]
          bg-brand-taupe/25
        "
      />

      <div
        className="
          absolute left-[7%] top-[17%]
          h-[250px] w-[250px]
          rounded-[56%_44%_47%_53%/43%_55%_45%_57%]
          bg-white/25
        "
      />

      <div
        className="
          absolute right-[5%] top-[14%]
          h-[300px] w-[300px]
          rounded-[52%_48%_41%_59%/47%_42%_58%_53%]
          bg-brand-taupe/18
        "
      />

      <div
        className="
          absolute bottom-[4%] left-[38%]
          h-[250px] w-[340px]
          rounded-[58%_42%_50%_50%/42%_55%_45%_58%]
          bg-white/20
        "
      />

      <div
        className="
          absolute left-[28%] top-[30%]
          h-44 w-44
          rounded-full
          bg-brand-wine/5
          blur-2xl
        "
      />

      <div
        className="
          absolute bottom-[15%] right-[18%]
          h-56 w-56
          rounded-full
          bg-brand-green/7
          blur-2xl
        "
      />

      <div
        className="
          absolute -right-40 top-[20%]
          h-[390px] w-[390px]
          rounded-full
          border border-brand-taupe/25
        "
      />

      <span className="fabric-scratch absolute left-[7%] top-[38%] w-20 rotate-[8deg]" />
      <span className="fabric-scratch absolute left-[18%] top-[22%] w-12 -rotate-[13deg]" />
      <span className="fabric-scratch absolute right-[16%] top-[42%] w-24 rotate-[6deg]" />
      <span className="fabric-scratch absolute bottom-[22%] left-[33%] w-16 -rotate-[8deg]" />
      <span className="fabric-scratch absolute bottom-[13%] right-[28%] w-14 rotate-[12deg]" />
    </div>
  );
}