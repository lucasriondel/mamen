import type { Issuer, IssuerId } from "@mamen/shared/contract";
import { MAX_IMAGE_BYTES } from "@mamen/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { Receipt, Ruler } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BackLink } from "@/components/back-link";
import { PageLayout } from "@/components/page-layout";
import { Empty } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { issuerRulesQuery } from "@/features/rules/issuer-rules-query";
import { RulesSection } from "@/features/rules/rules-section";
import type { TransactionFilterValues } from "@/features/transactions/transactions-filters";
import {
  composeTransactionFilters,
  TransactionsSection,
} from "@/features/transactions/transactions-section";
import { issuerQueries, type TransactionCountParams, transactionQueries } from "@/lib/sdk";
import { cn } from "@/lib/utils";
import type { IssuerDetailSearch } from "./detail-search";
import { BUTTON_CLASS } from "./field-styles";
import { IssuerAvatarMenu } from "./issuer-avatar-menu";
import { IssuerDeleteButton } from "./issuer-delete-button";
import { IssuerDetailHeader } from "./issuer-detail-header";
import { IssuerDetailSkeleton } from "./issuer-detail-skeleton";
import { DEFAULT_ISSUER_TAB, type IssuerTab, parseIssuerTab } from "./issuer-detail-tabs";
import { IssuerNameField } from "./issuer-name-field";
import { LogoSearchPopover } from "./logo-search-popover";
import { useIssuerMutations } from "./use-issuer-mutations";

const routeApi = getRouteApi("/issuers/$issuerId/");

/**
 * The issuer **detail page** (PRD #8: single issuer surface) at
 * `/issuers/$issuerId`. Absorbs everything the old `IssuerEditDialog` did — the
 * avatar upload/remove, rename, and the guarded delete — and adds the issuer's
 * transactions list (count + net €) and its Matching Rules.
 *
 * This outer component owns the async read of the issuer and the loading /
 * not-found states; once it resolves it renders {@link IssuerDetailContent}.
 * Renaming lives in the header itself ({@link IssuerNameField}) — the heading is
 * the field.
 */
export function IssuerDetailPage() {
  const { issuerId } = routeApi.useParams();
  const id = Number(issuerId) as IssuerId;

  const issuerQuery = useQuery(issuerQueries.getById(id));

  if (issuerQuery.isPending) {
    // The wait is a page too (issue #129): the collapse flag outlives the
    // navigation that got here, so the way back to the panel has to survive the
    // read. The topbar is the settled page's, slot for slot — avatar, name and
    // the count/net line stand in where each will land, so the issuer arriving
    // fills the header rather than replacing it.
    return (
      <PageLayout
        back={<BackLink to="/issuers">Issuers</BackLink>}
        title={
          <>
            {/* `size-12` and `h-7`: the avatar's `lg` chip and one line of the
                title's `text-2xl`, which is what lands in their place. */}
            <Skeleton as="span" className="block size-12 shrink-0" />
            <Skeleton as="span" className="block h-7 w-56" />
            {/* Never an empty heading: until the issuer names it, the page is
                titled by what it is — the same stand-in the error state below
                settles on. The wait itself is announced by the skeleton's live
                region, so it is not said twice here. */}
            <span className="sr-only">Issuer</span>
          </>
        }
        description={
          <span className="flex items-baseline gap-2">
            <Skeleton as="span" className="block h-3.5 w-28" />
            <Skeleton as="span" className="block h-3.5 w-20" />
          </span>
        }
        className="gap-8"
      >
        <IssuerDetailSkeleton />
      </PageLayout>
    );
  }

  const issuer = issuerQuery.data as Issuer | undefined;
  if (issuerQuery.isError || issuer == null) {
    // Still a page, so still a topbar: this state has no name to show, but a
    // user who arrived here with the sidebar collapsed needs the way back to it
    // as much as on any other page (issue #129).
    return (
      <PageLayout title="Issuer" back={<BackLink to="/issuers">Issuers</BackLink>}>
        <Empty
          title="Couldn't load this issuer"
          description="It may have been deleted, or something went wrong. Head back to the grid."
        >
          <Link to="/issuers" className={cn(BUTTON_CLASS, "mt-2")}>
            Back to issuers
          </Link>
        </Empty>
      </PageLayout>
    );
  }

  return <IssuerDetailContent issuer={issuer} />;
}

interface IssuerDetailContentProps {
  issuer: Issuer;
}

/**
 * The resolved detail surface — everything that needs a loaded issuer.
 *
 * The page is a **hero over two panels** ({@link IssuerDetailHeader} plus a tab
 * strip): identity, note, money and the two switchable settings on top, then
 * Transactions / Rules. Before this, every one of those sections was stacked at
 * equal weight, so the image controls — used once in an issuer's life — pushed
 * the transactions below the fold on every visit.
 *
 * The open tab lives in the URL (`?tab=rules`), so a refresh or a shared link
 * lands on the panel the sender was looking at; the default panel stays out of
 * the URL so `/issuers/1` has exactly one spelling.
 *
 * Deletion stays blocked while transactions reference the issuer (the button is
 * disabled with the existing explanation beside it), so no row is ever left
 * pointing at a deleted issuer; an allowed delete is confirmed in a dialog
 * first, and a successful one navigates back to the issuers grid. The
 * 2 MiB image cap is pre-checked here for an instant message (the contract's
 * multipart parser also enforces it server-side).
 */
function IssuerDetailContent({ issuer }: IssuerDetailContentProps) {
  const navigate = useNavigate();
  const search = routeApi.useSearch();
  const routeNavigate = routeApi.useNavigate();
  const { uploadImage, deleteImage, remove, setExcludedFromRecap } = useIssuerMutations();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The logo search is a panel without a trigger here — the avatar's menu opens
  // it — so the page holds its open state and the element it hangs off.
  const [logoSearchOpen, setLogoSearchOpen] = useState(false);
  const avatarRef = useRef<HTMLSpanElement>(null);

  const tab = parseIssuerTab(search.tab);

  const scope = useMemo<TransactionCountParams>(() => ({ issuerId: issuer.id }), [issuer.id]);

  // The unfiltered reference count — the delete guard asks "does *any* row
  // point here", which the user's account/month/search filters must not narrow.
  const referenceCountQuery = useQuery(transactionQueries.count(scope));
  const referenceCount = referenceCountQuery.data?.count ?? 0;
  const hasTransactions = referenceCount > 0;

  // The count and net over the *filtered* set, so the header total always describes
  // the rows shown beneath it (matching the category page's behaviour).
  const netQuery = useQuery(transactionQueries.count(composeTransactionFilters(scope, search)));
  const net = netQuery.data?.total ?? 0;
  const filteredCount = netQuery.data?.count ?? 0;

  // The same read the embedded `RulesSection` makes — one query key, so the
  // badge and the table it labels can never disagree. The badge counts the
  // envelope's `total` rather than the rows handed back: it is a count of the
  // issuer's rules, and a page's length is a count of the page (issue #198).
  const rulesQuery = useQuery(issuerRulesQuery(issuer.id));
  const ruleCount = rulesQuery.data?.total ?? 0;

  // Every updater below is typed against *this route's* search — the shared
  // transactions params plus the `tab` this page adds — on both sides: `prev`
  // for what it may read, and the return for what it may write. The shared
  // `TransactionsSearch` would also compile, being the wider type, but it has
  // no `tab` field, so the one handler that writes one wrote it unchecked: the
  // spread carried it at runtime while the annotation said it did not exist
  // (issue #165). The return annotation is what makes a field outside the type
  // an error at all — the router's own updater slot accepts extra keys.
  const applyFilters = (patch: TransactionFilterValues) => {
    routeNavigate({
      search: (prev: IssuerDetailSearch): IssuerDetailSearch => ({ ...prev, ...patch, page: 1 }),
    });
  };

  const toggleSort = () => {
    routeNavigate({
      search: (prev: IssuerDetailSearch): IssuerDetailSearch => ({
        ...prev,
        direction: prev.direction === "asc" ? "desc" : "asc",
        page: 1,
      }),
    });
  };

  const goToPage = (page: number) => {
    routeNavigate({
      search: (prev: IssuerDetailSearch): IssuerDetailSearch => ({ ...prev, page }),
    });
  };

  /**
   * The default panel stays out of the URL — one view, one spelling. No `page`
   * reset, unlike the filter and sort handlers above: switching panels is not a
   * new query, so the transactions table is left where it was paged to.
   */
  const selectTab = (next: IssuerTab) => {
    routeNavigate({
      search: (prev: IssuerDetailSearch): IssuerDetailSearch => ({
        ...prev,
        tab: next === DEFAULT_ISSUER_TAB ? undefined : next,
      }),
    });
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("That image is too large — the limit is 2 MiB.");
      return;
    }
    uploadImage.mutate({ id: issuer.id, file });
  };

  const handleDelete = () => {
    // Guard: never leave transactions pointing at a deleted issuer.
    if (hasTransactions || remove.isPending) return;
    remove.mutate(issuer.id, {
      onSuccess: () => navigate({ to: "/issuers" }),
    });
  };

  return (
    <PageLayout
      back={<BackLink to="/issuers">Issuers</BackLink>}
      // The name *is* the heading — click it to edit in place (no separate
      // rename form; edits autosave once typing settles). The avatar rides in
      // the title beside it, as the menu for everything that acts on the issuer
      // as an object. `flex-1` so the field takes the whole row rather than
      // shrink-wrapping.
      title={
        <>
          <span ref={avatarRef} className="flex shrink-0 items-center">
            <IssuerAvatarMenu
              issuer={issuer}
              onUpload={() => fileInputRef.current?.click()}
              onSearchLogo={() => setLogoSearchOpen(true)}
              onRemoveImage={() => deleteImage.mutate(issuer.id)}
              busy={uploadImage.isPending || deleteImage.isPending}
            />
          </span>
          <span className="min-w-0 flex-1">
            <IssuerNameField issuer={issuer} />
          </span>
        </>
      }
      className="gap-6"
    >
      {/* Not the layout's `description` slot: that renders a `<p>`, and this is
          a row of controls and a figure, not a sentence. It leads the page
          instead, directly under the title it describes. */}
      <IssuerDetailHeader
        issuer={issuer}
        count={filteredCount}
        net={net}
        onToggleRecap={(excluded) => setExcludedFromRecap.mutate({ id: issuer.id, excluded })}
        recapBusy={setExcludedFromRecap.isPending}
        deleteAction={
          <IssuerDeleteButton
            issuerName={issuer.name}
            deleteBlocked={hasTransactions}
            transactionCount={referenceCount}
            onConfirm={handleDelete}
            busy={remove.isPending}
          />
        }
      />

      {/* The second way in: search rather than a file (issue #61). Both paths
          store byte-identical images (ADR 0007), so neither is the fallback for
          the other — they simply live in the avatar's menu now. */}
      <LogoSearchPopover
        issuer={issuer}
        open={logoSearchOpen}
        onOpenChange={setLogoSearchOpen}
        withTrigger={false}
        anchor={avatarRef.current}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Issuer image"
        onChange={handleFile}
      />

      <Tabs value={tab} onValueChange={(next) => selectTab(next as IssuerTab)}>
        <TabsList>
          <TabsTab value="transactions">
            <Receipt className="size-3.5" aria-hidden />
            Transactions
            <TabCount>{referenceCount}</TabCount>
          </TabsTab>
          <TabsTab value="rules">
            <Ruler className="size-3.5" aria-hidden />
            Rules
            <TabCount>{ruleCount}</TabCount>
          </TabsTab>
          <TabsIndicator />
        </TabsList>

        {/* The same table, filters, sort, and pagination as the transactions and
            category pages — scoped to this issuer (issue #62). */}
        <TabsPanel value="transactions" className="pt-5">
          <TransactionsSection
            scope={scope}
            search={search}
            onFiltersChange={applyFilters}
            onToggleSort={toggleSort}
            onPageChange={goToPage}
            emptyDescription="No transactions reference this issuer yet."
          />
        </TabsPanel>

        <TabsPanel value="rules" className="pt-5">
          <RulesSection issuer={issuer} />
        </TabsPanel>
      </Tabs>
    </PageLayout>
  );
}

/** The count beside a tab's label — a pill, so it reads as a badge not a word. */
function TabCount({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-gousse-line/60 px-1.5 text-[11px] text-gousse-muted tabular-nums">
      {children}
    </span>
  );
}
