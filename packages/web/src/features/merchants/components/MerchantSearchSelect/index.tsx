import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { merchantsApi, transactionsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type MerchantSearchSelectProps = {
	value: number | null;
	onChange: (merchantId: number) => void;
	placeholder?: string;
};

export function MerchantSearchSelect({
	value,
	onChange,
	placeholder = "Select merchant...",
}: MerchantSearchSelectProps): React.ReactElement {
	const [open, setOpen] = useState(false);

	const { data: merchants = [] } = useQuery({
		queryKey: ["merchantSearchSelect"],
		queryFn: async () => {
			const allMerchants = await merchantsApi.getAll();
			const withCounts = await Promise.all(
				allMerchants.map(async (m) => ({
					...m,
					transactionCount: (
						await transactionsApi.getAll({ merchantId: m.id! })
					).length,
				})),
			);
			return withCounts.sort((a, b) => b.transactionCount - a.transactionCount);
		},
	});

	const selectedMerchant = useMemo(
		() => merchants.find((m) => m.id === value),
		[merchants, value],
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-autocomplete="list"
					className="w-full justify-between"
				>
					{selectedMerchant?.name ?? placeholder}
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[--radix-popover-trigger-width] p-0"
				align="start"
			>
				<Command>
					<CommandInput placeholder="Search merchants..." />
					<CommandList>
						<CommandEmpty>No merchant found.</CommandEmpty>
						<CommandGroup>
							{merchants.map((merchant) => (
								<CommandItem
									key={merchant.id}
									value={merchant.name}
									onSelect={() => {
										onChange(merchant.id!);
										setOpen(false);
									}}
								>
									<Check
										className={cn(
											"mr-2 h-4 w-4",
											value === merchant.id ? "opacity-100" : "opacity-0",
										)}
									/>
									<span className="flex-1">{merchant.name}</span>
									<span className="text-muted-foreground text-sm">
										{merchant.transactionCount} txns
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
