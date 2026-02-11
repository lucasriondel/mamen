import { cn } from "@/lib/utils";

export type MerchantAvatarProps = {
	name: string;
	imageUrl?: string;
	size?: "sm" | "md" | "lg";
	className?: string;
};

const sizeClasses = {
	sm: "size-6 text-xs",
	md: "size-8 text-sm",
	lg: "size-12 text-base",
} as const;

const PALETTE = [
	"#e53e3e",
	"#dd6b20",
	"#d69e2e",
	"#38a169",
	"#319795",
	"#3182ce",
	"#5a67d8",
	"#805ad5",
	"#d53f8c",
	"#ed64a6",
	"#2b6cb0",
	"#c05621",
	"#2c7a7b",
	"#276749",
	"#9b2c2c",
	"#6b46c1",
] as const;

function hashName(name: string): number {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = (hash * 31 + name.charCodeAt(i)) | 0;
	}
	return Math.abs(hash);
}

export function MerchantAvatar({
	name,
	imageUrl,
	size = "md",
	className,
}: MerchantAvatarProps): React.ReactElement {
	const letter = name.charAt(0).toUpperCase() || "?";

	if (imageUrl) {
		return (
			<img
				src={imageUrl}
				alt={name}
				className={cn(
					"rounded-full object-cover shrink-0",
					sizeClasses[size],
					className,
				)}
			/>
		);
	}

	const color = PALETTE[hashName(name) % PALETTE.length];

	return (
		<div
			className={cn(
				"rounded-full shrink-0 flex items-center justify-center font-semibold text-white select-none",
				sizeClasses[size],
				className,
			)}
			style={{ backgroundColor: color }}
			aria-hidden="true"
		>
			{letter}
		</div>
	);
}
