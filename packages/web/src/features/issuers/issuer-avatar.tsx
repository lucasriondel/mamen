import { cn } from "@/lib/utils";

/** Size presets for {@link IssuerAvatar}. */
const SIZE_CLASS = {
	sm: "size-6 text-xs",
	lg: "size-12 text-base",
} as const;

export interface IssuerAvatarProps {
	/** Issuer name — its first letter is the fallback when there is no image. */
	name: string;
	/** Optional issuer image URL (root-relative `/uploads/issuers/…`). */
	imageUrl?: string;
	/** Visual size: `sm` for table cells, `lg` for the grid cards. */
	size?: keyof typeof SIZE_CLASS;
	className?: string;
}

/**
 * A round issuer avatar: the uploaded image, or the name's initial as a
 * fallback. Shared by the transactions issuer cell (`sm`) and the issuers grid
 * cards (`lg`).
 */
export function IssuerAvatar({
	name,
	imageUrl,
	size = "sm",
	className,
}: IssuerAvatarProps) {
	const initial = name.trim().charAt(0).toUpperCase() || "?";
	return (
		<span
			className={cn(
				// Subtle inset ring keeps a light logo/initial legible against a light
				// panel — pure black/white at low alpha so it never tints the edge
				// (make-interfaces-feel-better #11).
				"flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gousse-bg font-medium text-gousse-muted ring-1 ring-black/10 ring-inset dark:ring-white/10",
				SIZE_CLASS[size],
				className,
			)}
		>
			{imageUrl ? (
				<img src={imageUrl} alt="" className="size-full object-cover" />
			) : (
				<span aria-hidden>{initial}</span>
			)}
		</span>
	);
}
