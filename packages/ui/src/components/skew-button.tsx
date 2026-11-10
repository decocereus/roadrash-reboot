import { cn } from "@racer/ui/utils";
import type { ComponentProps, ReactNode } from "react";

const tones = {
  picked: "border-neon-cyan bg-night text-paper",
  plain: "border-paper/50 bg-night text-paper",
  primary: "border-neon-yellow bg-neon-yellow text-ink",
} as const;

const sizes = {
  big: "text-[1.75rem]",
  slim: "text-[1.3rem]",
} as const;

const SkewButton = ({
  className,
  title,
  detail,
  tone = "plain",
  size = "big",
  type = "button",
  ...props
}: Omit<ComponentProps<"button">, "title" | "children"> & {
  readonly title: ReactNode;
  readonly detail?: ReactNode;
  readonly tone?: keyof typeof tones;
  readonly size?: keyof typeof sizes;
}) => (
  <button
    data-slot="skew-button"
    className={cn(
      "block w-full -skew-x-[10deg] border-2 px-4 py-2 text-left outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45",
      tones[tone],
      className
    )}
    type={type}
    {...props}
  >
    <span className="block skew-x-[10deg]">
      <b
        className={cn("block leading-tight font-extrabold italic", sizes[size])}
      >
        {title}
      </b>
      {detail !== undefined && (
        <small
          className={cn(
            "block text-base leading-snug font-bold tracking-normal normal-case",
            tone === "primary" ? "text-ink/75" : "text-paper/70"
          )}
        >
          {detail}
        </small>
      )}
    </span>
  </button>
);

const TextButton = ({
  className,
  type = "button",
  ...props
}: ComponentProps<"button">) => (
  <button
    data-slot="text-button"
    className={cn(
      "text-paper border-paper/40 hover:text-neon-yellow border-b-2 pb-0.5 text-lg font-bold uppercase disabled:opacity-45",
      className
    )}
    type={type}
    {...props}
  />
);

const TextLinks = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    data-slot="text-links"
    className={cn(
      "mt-1 flex flex-wrap items-baseline gap-x-7 gap-y-2",
      className
    )}
    {...props}
  />
);

export { SkewButton, TextButton, TextLinks };
